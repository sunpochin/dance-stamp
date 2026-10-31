/* 檔案用途：用真模型驗 SIMD、相容回退與初始化取消。所在層：隔離故障回歸。主要關聯：person-worker.js、follow-ui.js、run-app.ts。 */
async page => {
  const assert = (ok, text) => { if (!ok) throw new Error(text); }, origin = new URL(page.url()).origin, id = Date.now().toString(36), downloads = [], cases = [], requests = [];
  const context = page.context(); let mode = 'simd', pending, release;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  context.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  // 只控制能力／資源邊界，真正 WASM、模型、人體補邊、推論與製片仍執行產品來源。
  await context.route('**/person-worker.js', async route => {
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
    window.runtimeWorkers = 0; window.runtimeClosed = 0; window.runtimeFrames = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        if (window.runtimeFailRetry && window.runtimeWorkers - window.runtimeBefore > 0) throw new Error('synthetic retry constructor');
        super(...args); window.runtimeWorkers++; this.closed = false;
        this.addEventListener('message', ({ data }) => { if (data.boxes) window.runtimeFrames++; });
      }
      terminate() { if (!this.closed) { this.closed = true; window.runtimeClosed++; } super.terminate(); }
    };
  });
  await page.goto(origin); await idle();
  for (const side of ['reference', 'self']) { await page.locator('#' + side + '-file').setInputFiles('output/follow/' + side + '.mp4'); await idle(); if (side === 'reference') { await page.locator('#end').fill('3'); await page.locator('#end').dispatchEvent('change'); await idle(); } }
  await page.locator('#follow-performance > summary').click();
  const state = () => page.evaluate(async () => ({ data: JSON.stringify((await (await import('/storage.js')).readLibrary()).data), times: ['reference', 'self'].map(key => document.getElementById(key).currentTime) }));
  const original = JSON.stringify(await state());
  try {
    for (const item of [
      { mode: 'simd', runtime: 'simd', workers: 1 }, { mode: 'unsupported', runtime: 'nosimd', workers: 1 }, { mode: 'probe-error', runtime: 'nosimd', workers: 1 },
      { mode: 'loader-failure', runtime: 'nosimd', workers: 2 }, { mode: 'wasm-failure', runtime: 'nosimd', workers: 2 },
      { mode: 'both-fail', outcome: 'failed', workers: 2 }, { mode: 'retry-constructor', outcome: 'failed', workers: 1 },
      { mode: 'cancel-simd', outcome: 'cancelled', workers: 1 }, { mode: 'cancel-wasm', outcome: 'cancelled', workers: 2 },
    ]) {
      mode = item.mode; const outcome = item.outcome || 'complete', oldResult = await page.locator('#reference-follow-download').getAttribute('href');
      await page.locator('#reference-follow').click(); await page.waitForFunction(() => document.getElementById('follow-dialog').open); await idle();
      for (const [key, value] of [['width', 37], ['x', 3.5], ['y', 2.5], ['height', 95]]) { await page.locator('#follow-' + key).fill(String(value)); await page.locator('#follow-' + key).dispatchEvent('change'); }
      const before = await page.evaluate(fail => { window.runtimeFailRetry = fail; window.runtimeBefore = window.runtimeWorkers; return { workers: window.runtimeWorkers, closed: window.runtimeClosed, frames: window.runtimeFrames }; }, mode === 'retry-constructor');
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
      release?.(); release = undefined; pending = undefined;
      if (await page.locator('#follow-dialog').evaluate(dialog => dialog.open)) await page.locator('#follow-cancel').click();
      const download = page.waitForEvent('download'); await page.locator('#follow-metrics-download').click(); const reportFile = await download;
      const path = 'output/playwright/runtime-' + mode + '-' + id + '.json'; await reportFile.saveAs(path);
      const { readFile } = await import('node:fs/promises'), report = JSON.parse(await readFile(path, 'utf8')).reports.at(-1);
      const actual = await page.evaluate(before => ({ workers: window.runtimeWorkers - before.workers, closed: window.runtimeClosed - before.closed, frames: window.runtimeFrames - before.frames }), before);
      assert(report.outcome === outcome && actual.workers === item.workers && actual.closed === actual.workers, '模式／Worker 釋放不符：' + mode);
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
      }
      cases.push({ mode, outcome, ...actual, reportPath: path });
    }
  } finally { release?.(); await context.unrouteAll({ behavior: 'wait' }); }
  assert(requests.every(request => request.method === 'GET' && (request.url.startsWith(origin + '/') || request.url.startsWith('blob:'))), '新增外傳或上傳');
  return { cases, downloads, controlledCapabilityAndAssetFaults: true, originalAndResultsPreserved: true };
}
