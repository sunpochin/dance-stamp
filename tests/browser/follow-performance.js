/* 檔案用途：核對真模型計時、同片重跑及保全；也供受鎖保護的基準入口重用。所在層：隔離瀏覽器回歸。主要關聯：follow-metrics.js、benchmark-follow.ts。 */
async (page, options = {}) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); }, origin = new URL(page.url()).origin, trials = [], requests = [];
  const runId = Date.now().toString(36), source = options.source, durations = options.durations || [3], sides = options.sides || ['reference', 'self'];
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  page.context().on('request', r => requests.push({ url: r.url(), method: r.method() }));
  await page.addInitScript(() => {
    window.confirm = () => true; navigator.mediaDevices.getUserMedia = async () => { throw new Error('耗時量測不開硬體'); };
    const NativeWorker = window.Worker; window.perfWorkers = 0; window.perfTerminated = 0; window.perfFrames = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); if (String(args[0]).includes('person-worker')) { window.perfWorkers++; this.addEventListener('message', ({ data }) => { if (data.boxes) window.perfFrames++; }); } }
      // 只供負向取消案例：保留待回覆狀態且釋放未轉移影格，不偽造模型輸出或效能數據。
      postMessage(message, transfer) { if (window.perfHold) { message.bitmap.close(); return; } super.postMessage(message, transfer); }
      terminate() { window.perfTerminated++; super.terminate(); }
    };
    const NativeRecorder = window.MediaRecorder;
    window.MediaRecorder = class extends NativeRecorder {
      constructor(...args) {
        super(...args);
        // 旁聽真正編碼器的起點；報告的分析耗時不可跨過這裡，不暫停或偽造編碼輸出。
        if (window.perfExpectedMetrics) window.perfReportAtEncoding = { elapsedMs: performance.now() - window.perfFlowStartedAt, busy: document.getElementById('controls').disabled };
      }
    };
  });
  await page.goto(origin); await idle();
  if (options.cacheReady) { await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await page.reload(); await idle(); assert(await page.evaluate(() => !!navigator.serviceWorker.controller), '未取得真正 SW 快取控制'); }
  for (const side of ['reference', 'self']) {
    await page.locator('#' + side + '-file').setInputFiles(source || 'output/follow/' + side + '.mp4'); await idle();
    if (side === 'reference') { await page.locator('#end').fill(String(durations[0])); await page.locator('#end').dispatchEvent('change'); await idle(); }
  }
  await page.locator('#follow-performance > summary').click();
  const downloadReport = async () => {
    const pending = page.waitForEvent('download'); await page.locator('#follow-metrics-download').click(); const download = await pending;
    const path = 'output/playwright/follow-metrics-' + runId + '-' + trials.length + '.json'; await download.saveAs(path);
    const { readFile } = await import('node:fs/promises'); return { path, data: JSON.parse(await readFile(path, 'utf8')) };
  };
  const analyze = async (side, duration, enabled = true, expected = 'complete', cancelAtResult = false) => {
    for (const [id, value] of [['start', 0], ['end', duration], ['offset', 0]]) { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).dispatchEvent('change'); await idle(); }
    await page.locator('#follow-metrics-enabled').setChecked(enabled);
    await page.locator('#' + side + '-follow').click(); await page.waitForFunction(() => document.getElementById('follow-dialog').open); await idle();
    // 四秒回歸素材的人物在兩側邊緣；使用其完整身體選框，不拿中央預設框當模型失敗。
    if (!source) for (const [name, value] of [['width', side === 'reference' ? 37 : 40], ['x', side === 'reference' ? 3.5 : 55], ['y', 2.5], ['height', 95]]) { await page.locator('#follow-' + name).fill(String(value)); await page.locator('#follow-' + name).dispatchEvent('change'); }
    const before = await page.evaluate(async () => ({ data: JSON.stringify((await (await import('/storage.js')).readLibrary()).data), times: ['reference', 'self'].map(id => document.getElementById(id).currentTime) }));
    const counters = await page.evaluate(() => ({ workers: window.perfWorkers, terminated: window.perfTerminated, frames: window.perfFrames }));
    await page.evaluate(measuring => { window.perfExpectedMetrics = measuring; window.perfReportAtEncoding = null; }, enabled && expected === 'complete');
    const previousResult = await page.locator('#' + side + '-follow-download').getAttribute('href');
    // 外層只量可見的確認→解除忙碌，不把下載、人工框選或 Playwright 往返時間算進去。
    await page.evaluate(() => {
      window.perfWall = null; document.getElementById('follow-confirm').addEventListener('click', () => {
        const began = performance.now(), observer = new MutationObserver(() => {
          if (!document.getElementById('controls').disabled && !document.getElementById('follow-confirm').disabled) { window.perfWall = performance.now() - began; observer.disconnect(); }
        }); window.perfFlowStartedAt = began; observer.observe(document, { attributes: true, subtree: true });
      }, { once: true, capture: true });
    });
    // 沿用原確認操作的180秒總預算；先等完整流程，不能先被讀取就緒用的15秒idle截斷。
    const operationDeadline = Date.now() + 180000, remaining = () => Math.max(1, operationDeadline - Date.now());
    await page.locator('#follow-confirm').click();
    if (cancelAtResult) await page.waitForFunction(() => document.getElementById('follow-message').textContent.includes('正在製作'), null, { timeout: remaining() });
    if (expected === 'cancelled') await page.locator('#follow-cancel').click();
    await page.waitForFunction(() => Number.isFinite(window.perfWall), null, { timeout: remaining() }); await idle();
    const actual = await page.evaluate(old => ({ wallMs: window.perfWall, frames: window.perfFrames - old.frames, workers: window.perfWorkers - old.workers, terminated: window.perfTerminated - old.terminated }), counters);
    assert(actual.workers === (expected === 'failed' ? 0 : 1) && actual.terminated === actual.workers, 'Worker 建立／釋放次數改變');
    if (await page.locator('#follow-dialog').evaluate(d => d.open)) await page.locator('#follow-cancel').click();
    let report, path;
    if (enabled) {
      const saved = await downloadReport(); path = saved.path; report = saved.data.reports.at(-1);
      assert(saved.data.schemaVersion === 2 && report.schemaVersion === 2, '報告格式未交付三段耗時版本');
      assert(saved.data.reports.length <= 10 && report.outcome === expected && report.sampleHz === 8, '報告狀態／取樣率不實');
      const text = JSON.stringify(saved.data); assert(!text.includes('blob:') && !text.includes('source') && !text.includes('box') && !text.includes('.mp4'), '數字報告含私人來源或選框');
      if (expected === 'complete') {
        const count = Math.ceil(duration * 8) + 1;
        assert(actual.frames === count && report.processedFrames === count && report.trackedFrames === count && report.plannedFrames === count, '計時改變原取樣數或追蹤失敗');
        for (const key of ['seek', 'bitmap', 'roundTrip', 'detect']) { const stage = report.stages[key]; assert(stage.count === count && stage.meanMs >= 0 && stage.p95Ms >= stage.p50Ms, '缺少逐格分布：' + key); }
        assert(report.worker.modelInitMs >= 0 && report.worker.firstRoundTripMs >= report.worker.modelInitMs && report.totalAnalysisMs <= actual.wallMs + 30, '初始化與分析邊界錯誤');
        assert(report.resultMs > 0 && report.totalFlowMs >= report.totalAnalysisMs + report.resultMs - 1 && report.totalFlowMs <= actual.wallMs + 30, '製片與總等待混入分析速度');
        const encoding = await page.evaluate(() => window.perfReportAtEncoding);
        assert(encoding?.busy && report.totalAnalysisMs <= encoding.elapsedMs, '分析碼表未在真正編碼器建構前停下');
      } else assert(report.sameInputRun === null && report.comparison === null, '失敗／取消誤算成成功比較');
      if (cancelAtResult) assert(report.resultMs >= 0 && report.totalFlowMs >= report.totalAnalysisMs, '製片取消缺少部分耗時');
    } else assert(actual.frames === Math.ceil(duration * 8) + 1, '關閉計時改變分析');
    const after = await page.evaluate(async () => ({ data: JSON.stringify((await (await import('/storage.js')).readLibrary()).data), times: ['reference', 'self'].map(id => document.getElementById(id).currentTime) }));
    assert(JSON.stringify(before) === JSON.stringify(after), '計時改了筆記或原播放器位置');
    if (expected !== 'complete') assert(await page.locator('#' + side + '-follow-download').getAttribute('href') === previousResult, '取消／失敗換掉上次跟隨影片');
    if (await page.locator('#follow-dialog').evaluate(d => d.open)) await page.locator('#follow-cancel').click();
    const trial = { side, duration, enabled, ...actual, report, path }; trials.push(trial); options.progress?.(trial); return trial;
  };
  for (const side of sides) for (const duration of durations) for (let repeat = 0; repeat < (options.repeats || 2); repeat++) {
    const trial = await analyze(side, duration); assert(trial.report.sameInputRun === repeat + 1, '相同來源／片段／選框沒有逐次比較');
  }
  if (options.controls) for (let repeat = 0; repeat < 2; repeat++) await analyze('reference', durations[0], false);
  if (!options.benchmark) {
    const oldDownload = await page.locator('#follow-metrics-download').getAttribute('href'); await analyze('reference', durations[0], false);
    assert(await page.locator('#follow-metrics-download').getAttribute('href') === oldDownload, '關閉計時仍換掉報告');
    await page.evaluate(() => { window.perfHold = true; });
    await analyze('reference', durations[0], true, 'cancelled');
    await page.evaluate(() => { window.perfHold = false; });
    // 原本的待推論取消與製片取消是兩個階段，兩者都須保留舊成品。
    await analyze('reference', durations[0], true, 'cancelled', true);
    await page.evaluate(() => { window.perfSavedWorker = window.Worker; window.Worker = class { constructor() { throw new Error('synthetic constructor failure'); } }; });
    await analyze('reference', durations[0], true, 'failed');
    await page.evaluate(() => { window.Worker = window.perfSavedWorker; });
    assert(await page.locator('#reference-follow-enabled').isChecked(), '取消／失敗清掉舊追蹤');
  }
  let screenshot;
  if (!options.benchmark) {
    // 真正的長數字報告也要能在窄版閱讀；模擬寬度不當成手機或讀屏驗收。
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 960 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '耗時報告造成橫向溢出'); }
    await page.setViewportSize({ width: 390, height: 844 }); screenshot = 'output/playwright/follow-performance-' + runId + '.png';
    await page.locator('#follow-performance').screenshot({ path: screenshot });
  }
  assert(requests.every(r => r.method === 'GET' && (r.url.startsWith(origin + '/') || r.url.startsWith('blob:'))), '計時增加上傳或外部請求');
  return { trials, screenshot, sampleRateUnchanged: true, workersNotReused: true, sourceAndMetadataPreserved: true, localNumbersOnly: true };
}
