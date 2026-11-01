/* 檔案用途：用真模型驗 SIMD、相容回退與初始化取消。所在層：隔離故障回歸。主要關聯：person-worker.js、follow-ui.js、run-app.ts。 */
async page => {
  const assert = (ok, text) => { if (!ok) throw new Error(text); }, origin = new URL(page.url()).origin, id = Date.now().toString(36), downloads = [], retainedDownloads = [], cases = [], requests = [];
  const context = page.context(); let mode = 'simd', pending, release, workerLoadFailures = 0;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  context.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  // 只控制能力／資源邊界，真正 WASM、模型、人體補邊、推論與製片仍執行產品來源。
  await context.route('**/person-worker.js', async route => {
    // 真正中斷背景程式請求，讓瀏覽器發出 error；不派送假事件或直接呼叫產品 handler。
    if (mode === 'worker-fetch-failure') { workerLoadFailures++; await route.abort('failed'); return; }
    const response = await route.fetch(), source = await response.text();
    const prefix = ['unsupported', 'probe-error'].includes(mode) ? `const nativeImport = self.importScripts.bind(self); self.importScripts = (...urls) => { nativeImport(...urls); if (urls.includes('/vision-bundle.js')) self.Vision.FilesetResolver.isSimdSupported = async () => { ${mode === 'probe-error' ? "throw new Error('synthetic probe');" : 'return false;'} }; };\n` : '';
    await route.fulfill({ response, body: prefix + source });
  });
  await context.route('**/vision-simd.js', route => mode === 'loader-failure' ? route.fulfill({ status: 503, body: 'synthetic loader failure' }) : route.continue());
  for (const runtime of ['simd', 'wasm']) await context.route('**/vision-' + runtime + '.wasm', async route => {
    if (mode === 'cancel-' + runtime) {
      pending?.(); await new Promise(resolve => { release = resolve; });
      await route.abort().catch(() => {}); return;
    }
    if (runtime === 'simd' && ['wasm-failure', 'both-fail', 'cancel-wasm', 'retry-constructor'].includes(mode) || runtime === 'wasm' && mode === 'both-fail') { await route.fulfill({ status: 200, contentType: 'application/wasm', body: 'synthetic invalid wasm' }); return; }
    await route.continue();
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('runtime 回歸不開硬體'); }; window.confirm = () => true;
    window.runtimeWorkers = 0; window.runtimeClosed = 0; window.runtimeFrames = 0; window.runtimeErrors = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        if (window.runtimeFailRetry && window.runtimeWorkers - window.runtimeBefore > 0) throw new Error('synthetic retry constructor');
        super(...args); window.runtimeWorkers++; this.closed = false;
        this.addEventListener('message', ({ data }) => { if (data.boxes) window.runtimeFrames++; });
        this.addEventListener('error', event => { window.runtimeErrors.push({ trusted: event.isTrusted, type: event.type }); });
      }
      terminate() { if (!this.closed) { this.closed = true; window.runtimeClosed++; } super.terminate(); }
    };
  });
  await page.goto(origin); await idle();
  // 與主線可見流程相同，失焦只提交一次片段；避免合成 change 後又觸發原生 blur 重複存配方。
  for (const side of ['reference', 'self']) { await page.locator('#' + side + '-file').setInputFiles('output/follow/' + side + '.mp4'); await idle(); if (side === 'reference') { await page.locator('#end').fill('3'); await page.locator('#end').press('Tab'); await idle(); } }
  await page.locator('#follow-performance > summary').click();
  const state = () => page.evaluate(async () => ({ data: JSON.stringify((await (await import('/storage.js')).readLibrary()).data), times: ['reference', 'self'].map(key => document.getElementById(key).currentTime) }));
  const original = JSON.stringify(await state());
  try {
    for (const item of [
      { mode: 'simd', runtime: 'simd', workers: 1 }, { mode: 'unsupported', runtime: 'nosimd', workers: 1 }, { mode: 'probe-error', runtime: 'nosimd', workers: 1 },
      { mode: 'loader-failure', runtime: 'nosimd', workers: 2 }, { mode: 'wasm-failure', runtime: 'nosimd', workers: 2 },
      { mode: 'both-fail', outcome: 'failed', workers: 2 }, { mode: 'retry-constructor', outcome: 'failed', workers: 1 },
      { mode: 'cancel-simd', outcome: 'cancelled', workers: 1 }, { mode: 'cancel-wasm', outcome: 'cancelled', workers: 2 },
      { mode: 'worker-fetch-failure', outcome: 'failed', workers: 1 }, { mode: 'worker-retry', runtime: 'simd', workers: 1 },
    ]) {
      mode = item.mode; const outcome = item.outcome || 'complete', oldResult = await page.locator('#reference-follow-download').getAttribute('href');
      await page.locator('#reference-follow').click(); await page.waitForFunction(() => document.getElementById('follow-dialog').open); await idle();
      for (const [key, value] of [['width', 37], ['x', 3.5], ['y', 2.5], ['height', 95]]) { await page.locator('#follow-' + key).fill(String(value)); await page.locator('#follow-' + key).dispatchEvent('change'); }
      const before = await page.evaluate(fail => { window.runtimeFailRetry = fail; window.runtimeBefore = window.runtimeWorkers; return { workers: window.runtimeWorkers, closed: window.runtimeClosed, frames: window.runtimeFrames, errors: window.runtimeErrors.length }; }, mode === 'retry-constructor');
      const waiting = new Promise(resolve => { pending = resolve; });
      await page.locator('#follow-confirm').click();
      if (outcome === 'cancelled') {
        let timer;
        try { await Promise.race([waiting, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('未進入指定初始化階段')), 30000); })]); }
        finally { clearTimeout(timer); }
        await page.locator('#follow-cancel').click();
      }
      // 長流程使用原180秒；取消或錯誤後仍須15秒內回到可操作狀態。
      await page.waitForFunction(() => !document.getElementById('controls').disabled, null, { timeout: outcome === 'complete' ? 180000 : 15000 }); await idle();
      if (mode === 'worker-fetch-failure') assert((await page.locator('#follow-message').textContent()).includes('無法啟動本機人物分析') && (await page.locator('#status').textContent()).includes('無法啟動本機人物分析'), '背景程式載入失敗未顯示真正原因');
      release?.(); release = undefined; pending = undefined;
      if (await page.locator('#follow-dialog').evaluate(dialog => dialog.open)) await page.locator('#follow-cancel').click();
      const download = page.waitForEvent('download'); await page.locator('#follow-metrics-download').click(); const reportFile = await download;
      const path = 'output/playwright/runtime-' + mode + '-' + id + '.json'; await reportFile.saveAs(path);
      const { readFile } = await import('node:fs/promises'), report = JSON.parse(await readFile(path, 'utf8')).reports.at(-1);
      const actual = await page.evaluate(before => ({ workers: window.runtimeWorkers - before.workers, closed: window.runtimeClosed - before.closed, frames: window.runtimeFrames - before.frames, errors: window.runtimeErrors.slice(before.errors) }), before);
      assert(report.outcome === outcome && actual.workers === item.workers && actual.closed === actual.workers, '模式／Worker 釋放不符：' + mode);
      assert(mode === 'worker-fetch-failure' ? actual.errors.length === 1 && actual.errors[0].trusted && actual.errors[0].type === 'error' : actual.errors.length === 0, '未走真正載入錯誤或重試仍出錯：' + mode);
      assert(JSON.stringify(await state()) === original, '回退改了原片位置或資料：' + mode);
      if (outcome === 'complete') {
        assert(report.worker.runtime === item.runtime && report.worker.attempts === item.workers && report.worker.fallbacks === item.workers - 1, '相容協定或計時不實：' + mode);
        assert(actual.frames === 25 && report.processedFrames === 25 && report.trackedFrames === 25 && report.plannedFrames === 25, '回退重取樣或改變追蹤：' + mode);
        assert(await page.locator('#reference-follow-download').getAttribute('href') !== oldResult, '成功沒有交付真影片：' + mode);
        if (['simd', 'unsupported', 'wasm-failure'].includes(mode)) {
          const saved = page.waitForEvent('download'); await page.locator('#reference-follow-download').click(); const file = await saved;
          const videoPath = 'output/playwright/runtime-video-' + mode + '-' + id + '.' + file.suggestedFilename().split('.').pop(); await file.saveAs(videoPath); downloads.push({ mode, path: videoPath });
        }
      } else {
        assert(report.sameInputRun === null && report.comparison === null && actual.frames === 0, '失敗／取消偽裝成功：' + mode);
        assert(await page.locator('#reference-follow-download').getAttribute('href') === oldResult && await page.locator('#reference-follow-enabled').isChecked(), '失敗／取消丟掉舊成品：' + mode);
        if (mode === 'worker-fetch-failure') {
          assert(workerLoadFailures === 1 && report.worker.attempts === 1 && report.worker.fallbacks === 0 && report.processedFrames === 0 && report.trackedFrames === 0, '背景程式載入失敗仍回退或交付假路徑');
          // 連結沒變仍可能指向失效內容；真正下載須與故障前最後一份成功成品完全相同。
          const saved = page.waitForEvent('download'); await page.locator('#reference-follow-download').click(); const file = await saved;
          const videoPath = 'output/playwright/runtime-retained-' + id + '.' + file.suggestedFilename().split('.').pop(); await file.saveAs(videoPath);
          const { createHash } = await import('node:crypto'), previous = await readFile(downloads.find(item => item.mode === 'wasm-failure').path), retained = await readFile(videoPath);
          const hash = bytes => createHash('sha256').update(bytes).digest('hex');
          assert(retained.length === previous.length && hash(retained) === hash(previous), '載入失敗後舊成品內容遺失');
          retainedDownloads.push({ mode, path: videoPath, bytes: retained.length, sha256: hash(retained), sameAsMode: 'wasm-failure' });
        }
      }
      cases.push({ mode, outcome, ...actual, reportPath: path });
    }
  } finally { release?.(); await context.unrouteAll({ behavior: 'wait' }); }
  assert(requests.every(request => request.method === 'GET' && (request.url.startsWith(origin + '/') || request.url.startsWith('blob:'))), '新增外傳或上傳');
  assert(workerLoadFailures === 1 && retainedDownloads.length === 1, '沒有完成背景程式載入失敗及舊下載保全');
  return { cases, downloads, retainedDownloads, controlledCapabilityAndAssetFaults: true, originalAndResultsPreserved: true };
}
