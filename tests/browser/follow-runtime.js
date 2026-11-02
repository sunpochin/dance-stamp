/* 檔案用途：用真模型驗 SIMD、相容回退與初始化取消。所在層：隔離故障回歸。主要關聯：person-worker.js、follow-ui.js、run-app.ts。 */
async page => {
  const assert = (ok, text) => { if (!ok) throw new Error(text); }, origin = new URL(page.url()).origin, id = Date.now().toString(36), downloads = [], retainedDownloads = [], transferDownloads = [], cases = [], requests = [];
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
    const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL;
    window.runtimeBlobs = new Map();
    // CSP不允許診斷fetch blob網址；只保留原呼叫建立的本機Blob參考，不增加網路權限。
    URL.createObjectURL = function(blob) { const url = createUrl.call(this, blob); window.runtimeBlobs.set(url, { blob, revoked: false }); return url; };
    URL.revokeObjectURL = function(url) { const item = window.runtimeBlobs.get(url); if (item) item.revoked = true; return revokeUrl.call(this, url); };
    const NativeWorker = window.Worker, nativeBitmap = window.createImageBitmap;
    window.runtimeNativeBitmap = nativeBitmap; window.runtimeTransferAudit = { bitmaps: [], calls: [] };
    // 只關閉原生建立的真影格；讓真正 postMessage 決定能否傳輸，不自行拋錯或派送事件。
    window.createImageBitmap = async function(...args) {
      const bitmap = await nativeBitmap.apply(this, args);
      if (window.runtimeCloseNextBitmap) {
        window.runtimeCloseNextBitmap = false;
        const before = { native: bitmap instanceof ImageBitmap, width: bitmap.width, height: bitmap.height };
        bitmap.close(); window.runtimeTransferBitmap = bitmap;
        window.runtimeTransferAudit.bitmaps.push({ ...before, closedWidth: bitmap.width, closedHeight: bitmap.height });
      }
      return bitmap;
    };
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        if (window.runtimeFailRetry && window.runtimeWorkers - window.runtimeBefore > 0) throw new Error('synthetic retry constructor');
        super(...args); window.runtimeWorkers++; this.closed = false;
        this.addEventListener('message', ({ data }) => { if (data.boxes) window.runtimeFrames++; });
        this.addEventListener('error', event => { window.runtimeErrors.push({ trusted: event.isTrusted, type: event.type }); });
      }
      postMessage(...args) {
        const targeted = !!window.runtimeTransferBitmap && args[0]?.bitmap === window.runtimeTransferBitmap;
        if (targeted) window.runtimeTransferWorker = this;
        try { return super.postMessage(...args); }
        catch (error) {
          if (targeted) window.runtimeTransferAudit.calls.push({ sameBitmap: args[1]?.[0] === window.runtimeTransferBitmap, nativeException: error instanceof DOMException, name: error.name, message: error.message });
          throw error;
        }
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

    // 第12子情境的唯一基準在self成果及VS真正完成後才取，不能混用原先不同revision的快照。
    mode = 'simd';
    const openFollow = async side => {
      await page.locator('#' + side + '-follow').click(); await idle();
      for (const [field, value] of [['width', side === 'reference' ? 37 : 40], ['x', side === 'reference' ? 3.5 : 55], ['y', 2.5], ['height', 95]]) { await page.locator('#follow-' + field).fill(String(value)); await page.locator('#follow-' + field).dispatchEvent('change'); }
    };
    await openFollow('self'); await page.locator('#follow-confirm').click();
    await page.waitForFunction(() => !document.getElementById('follow-dialog').open, null, { timeout: 180000 }); await idle();
    await page.locator('#export').click(); await idle();
    await page.waitForFunction(() => ['reference-follow-result', 'self-follow-result', 'output'].every(id => document.getElementById(id).readyState >= 2));
    const { readFile, writeFile } = await import('node:fs/promises'), { createHash } = await import('node:crypto');
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    const roles = ['reference', 'self', 'vs'];
    const snapshot = () => page.evaluate(async () => {
      const storage = await import('/storage.js'); if (storage.storageUnconfirmed()) throw new Error('未知保存不能另讀DB');
      const hash = async blob => ({ bytes: blob.size, type: blob.type, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('') });
      const fingerprint = async href => { const item = window.runtimeBlobs.get(href); if (!item || item.revoked) throw new Error('原Blob已遺失或URL已失效'); return hash(item.blob); };
      const sources = await Promise.all(['reference', 'self'].map(async id => { const v = document.getElementById(id); return { id, src: v.src, time: v.currentTime, paused: v.paused, ...await fingerprint(v.src) }; }));
      const outputs = await Promise.all(['reference', 'self', 'vs'].map(async role => {
        const link = document.getElementById(role === 'vs' ? 'output-download' : role + '-follow-download'), v = document.getElementById(role === 'vs' ? 'output' : role + '-follow-result');
        return { role, href: link.href, src: v.src, hidden: link.hidden, enabled: role === 'vs' ? null : document.getElementById(role + '-follow-enabled').checked, ...await fingerprint(link.href) };
      }));
      const media = await Promise.all((await storage.readMediaKeys()).map(async id => ({ id, ...await hash(await storage.readMedia(id)) })));
      return { library: await storage.readLibrary(), sources, outputs, media };
    });
    const baseline = await snapshot();
    assert(baseline.library.data.exports.length > 0 && baseline.outputs.every(item => !item.hidden && item.src === item.href && (item.role === 'vs' || item.enabled)), '傳輸故障前沒有真實的兩側成果及VS基準');
    const preserved = (actual, newTeacher = false) => {
      assert(JSON.stringify(actual.library) === JSON.stringify(baseline.library) && JSON.stringify(actual.media) === JSON.stringify(baseline.media), '傳輸失敗／重試改掉完整library或已保存媒體');
      for (let i = 0; i < baseline.sources.length; i++) { const { time, ...old } = baseline.sources[i], { time: now, ...current } = actual.sources[i]; assert(JSON.stringify(current) === JSON.stringify(old) && Math.abs(time - now) < .001, '傳輸失敗／重試改掉原片或位置'); }
      for (const previous of baseline.outputs) { const current = actual.outputs.find(item => item.role === previous.role); if (newTeacher && previous.role === 'reference') assert(current.href !== previous.href, '同頁重試沒有交換新teacher成果'); else assert(JSON.stringify(current) === JSON.stringify(previous), '傳輸失敗／重試破壞舊成果：' + previous.role); }
    };
    const saveArtifact = async (role, phase) => {
      const selector = role === 'vs' ? '#output-download' : '#' + role + '-follow-download';
      const expected = (await snapshot()).outputs.find(item => item.role === role);
      const waiting = page.waitForEvent('download'); await page.locator(selector).click(); const file = await waiting;
      const path = 'output/playwright/runtime-transfer-' + phase + '-' + role + '-' + id + '.' + file.suggestedFilename().split('.').pop(); await file.saveAs(path);
      const bytes = await readFile(path); assert(bytes.length === expected.bytes && hash(bytes) === expected.sha256, '真下載與本頁Blob不同：' + phase + '/' + role);
      const row = { role: phase + '-' + role, path, bytes: bytes.length, sha256: hash(bytes) }; transferDownloads.push(row); return row;
    };
    const beforeFiles = roles.map(role => [role, null]);
    // 每份下載依序沿真正入口取檔，不能讓同一個download事件被三個等待者同時認領。
    for (const pair of beforeFiles) pair[1] = await saveArtifact(pair[0], 'before');
    await openFollow('reference');
    const before = await page.evaluate(() => { window.runtimeBefore = window.runtimeWorkers; window.runtimeCloseNextBitmap = true; return { workers: window.runtimeWorkers, closed: window.runtimeClosed, frames: window.runtimeFrames, errors: window.runtimeErrors.length }; });
    await page.locator('#follow-confirm').click();
    await page.waitForFunction(() => !document.getElementById('controls').disabled, null, { timeout: 15000 }); await idle();
    const fault = await page.evaluate(before => ({ ...window.runtimeTransferAudit, workers: window.runtimeWorkers - before.workers, closed: window.runtimeClosed - before.closed, frames: window.runtimeFrames - before.frames, errors: window.runtimeErrors.slice(before.errors), handlersCleared: window.runtimeTransferWorker?.onmessage === null && window.runtimeTransferWorker?.onerror === null, controlsRestored: !document.getElementById('follow-controls').disabled && !document.getElementById('follow-confirm').disabled }), before);
    const auditPath = 'output/playwright/runtime-transfer-audit-' + id + '.json'; await writeFile(auditPath, JSON.stringify(fault, null, 2));
    assert(fault.bitmaps.length === 1 && fault.bitmaps[0].native && fault.bitmaps[0].width > 0 && fault.bitmaps[0].height > 0 && fault.bitmaps[0].closedWidth === 0 && fault.bitmaps[0].closedHeight === 0, '未建立並關閉真正ImageBitmap');
    assert(fault.calls.length === 1 && fault.calls[0].sameBitmap && fault.calls[0].nativeException && fault.calls[0].name === 'DataCloneError', '原生postMessage未同步拋預期DataCloneError；不可假造error補綠');
    assert(fault.workers === 1 && fault.closed === 1 && fault.frames === 0 && fault.errors.length === 0 && fault.handlersCleared && fault.controlsRestored, '傳輸失敗未清理Worker或恢復控制');
    assert((await page.locator('#follow-message').textContent()).includes(fault.calls[0].message) && (await page.locator('#status').textContent()).includes(fault.calls[0].message), '原生傳輸錯誤沒有轉交到可見提示');
    await page.locator('#follow-cancel').click(); preserved(await snapshot());
    for (const [role, previous] of beforeFiles) { const current = await saveArtifact(role, 'after'); assert(current.bytes === previous.bytes && current.sha256 === previous.sha256, '故障後舊成品下載不同：' + role); }
    const metrics = page.waitForEvent('download'); await page.locator('#follow-metrics-download').click(); const metricsFile = await metrics;
    const reportPath = 'output/playwright/runtime-transfer-metrics-' + id + '.json'; await metricsFile.saveAs(reportPath); const report = JSON.parse(await readFile(reportPath, 'utf8')).reports.at(-1);
    assert(report.outcome === 'failed' && report.worker.attempts === 1 && report.worker.fallbacks === 0 && report.processedFrames === 0 && report.trackedFrames === 0 && report.sameInputRun === null && report.comparison === null, '傳輸失敗偽裝完成或相容回退');
    await page.evaluate(() => { window.runtimeCloseNextBitmap = false; window.createImageBitmap = window.runtimeNativeBitmap; });
    await openFollow('reference');
    const retryBefore = await page.evaluate(() => ({ workers: window.runtimeWorkers, closed: window.runtimeClosed, frames: window.runtimeFrames }));
    await page.locator('#follow-confirm').click(); await page.waitForFunction(() => !document.getElementById('follow-dialog').open, null, { timeout: 180000 }); await idle();
    await page.waitForFunction(() => document.getElementById('reference-follow-result').readyState >= 2);
    const retry = await page.evaluate(before => ({ restoredNativeBitmap: window.createImageBitmap === window.runtimeNativeBitmap, workers: window.runtimeWorkers - before.workers, closed: window.runtimeClosed - before.closed, frames: window.runtimeFrames - before.frames, nativeFailures: window.runtimeTransferAudit.calls.length }), retryBefore);
    assert(retry.restoredNativeBitmap && retry.workers === 1 && retry.closed === 1 && retry.frames === 25 && retry.nativeFailures === 1, '撤除故障後同頁重試未完成25格或未回收Worker');
    const retryMetrics = page.waitForEvent('download'); await page.locator('#follow-metrics-download').click(); const retryMetricsFile = await retryMetrics;
    const retryReportPath = 'output/playwright/runtime-transfer-retry-metrics-' + id + '.json'; await retryMetricsFile.saveAs(retryReportPath); const retryReport = JSON.parse(await readFile(retryReportPath, 'utf8')).reports.at(-1);
    assert(retryReport.outcome === 'complete' && retryReport.processedFrames === 25 && retryReport.trackedFrames === 25 && retryReport.plannedFrames === 25, '同頁重試診斷不是完整25/25格');
    retry.reportPath = retryReportPath;
    preserved(await snapshot(), true); await saveArtifact('reference', 'retry');
    cases.push({ mode: 'bitmap-transfer-failure', outcome: 'failed-then-retried', fault, reportPath, auditPath, retry, libraryAndOriginalsPreserved: true, threePriorDownloadsPreserved: true });
    // 原三模式及原保全檔清單保持原契約；新七份下載獨立命名，離站工具另行逐份驗證。

  } finally { release?.(); await context.unrouteAll({ behavior: 'wait' }); }
  assert(requests.every(request => request.method === 'GET' && (request.url.startsWith(origin + '/') || request.url.startsWith('blob:'))), '新增外傳或上傳');
  assert(workerLoadFailures === 1 && retainedDownloads.length === 1, '沒有完成背景程式載入失敗及舊下載保全');
  return { cases, downloads, retainedDownloads, transferDownloads, controlledCapabilityAndAssetFaults: true, originalAndResultsPreserved: true };
}
