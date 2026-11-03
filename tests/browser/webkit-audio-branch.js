/* 檔案用途：在 Chromium 明選 Safari PTS Worker 驗準備拒絕、舊資料保全及同頁恢復。所在層：條件分支回歸，非原生 Safari。主要關聯：export-pts*.js、pts-audit.js、run-app.ts。 */
async (page, options) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); }, origin = new URL(page.url()).origin;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  let stage = 'bootstrap', failureObservation, finalObservation;
  const checkpoints = [], observationErrors = [];
  const observe = async () => {
    try { return await page.evaluate(() => ({ workers: window.__ptsAudit?.workerReceipt?.() ?? null,
      busy: document.getElementById('compare')?.getAttribute('aria-busy'), status: document.getElementById('status')?.textContent,
      diagnostics: document.getElementById('diagnostics')?.textContent, hidden: document.hidden, visibility: window.__ptsVisibility ?? null,
      source: 'memory/DOM only; no DB read or Blob hashing' })); }
    catch (error) { observationErrors.push({ stage, name: error.name, message: error.message }); return null; }
  };
  const checkpoint = async label => { stage = label; checkpoints.push({ stage, observation: await observe() }); };
  let firstFailure, report;
  try {
    await checkpoint('bootstrap');
    assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), '僅本機合成環境');
    assert(await page.evaluate(async () => (await import('/local-audio.js')).safariAudio()), '必須明選 Safari 產品分支');
    await page.evaluate(options.installAudit);
    await checkpoint('select-sources');
    await page.locator('#existing-mode').click();
    for (const [id, path] of [['reference-file', 'output/export-failure/reference.mp4'], ['self-file', 'output/export-failure/self.mp4']]) { await page.locator('#' + id).setInputFiles(path); await idle(); }
    await page.locator('#end').fill('1.5'); await page.locator('#end').dispatchEvent('change'); await idle();
    // 基準不是空庫：透過原標記控制建立筆記，再保留一份真正可讀的舊 VS。
    await page.locator('#mark').click(); await page.locator('#marker-title').fill('PTS 合成保全筆記'); await page.locator('#marker-note').fill('Worker 準備失敗不能遺失');
    await page.locator('#marker-form button[type="submit"]').click(); await idle();
    await checkpoint('baseline-export');
    await page.locator('#export').click(); await idle();
    assert((await page.locator('#status').textContent()).includes('已成檔'), 'PTS 基準未成檔：' + await page.locator('#status').textContent());
    const before = await page.evaluate(() => window.__ptsAudit.snapshot());
    const initial = await page.evaluate(() => JSON.parse(document.getElementById('diagnostics').textContent));
    assert(before.data.markers.length && before.data.exports.length && before.bytes[2].mime.startsWith('video/mp4') && initial.export.backend === 'explicit-pts', '未執行真 PTS／非空資料基準');
    await checkpoint('baseline-confirmed');
    const beforeWorkerCount = await page.evaluate(() => window.__ptsAudit.workers.length);
    let injectedRequests = 0;
    const workerURL = origin + '/export-pts-worker.js';
    const inject = async route => {
      injectedRequests++;
      const response = await route.fetch(), source = await response.text();
      // 原 entry 的 import／handler 仍執行；只在真正 Worker scope 改此能力邊界，marker 不帶產品 id 不會假裝結果。
      const prefix = `const qaNativeSupport=AudioDecoder.isConfigSupported; AudioDecoder.isConfigSupported=async function(config){const actual=await qaNativeSupport.call(this,config);self.postMessage({__dancePtsQaMarker:'audio-support-denied',codec:config.codec,nativeSupported:actual.supported});return {...actual,supported:false};};\n`;
      await route.fulfill({ response, body: prefix + source });
    };
    await page.context().route(workerURL, inject);
    try {
      await checkpoint('worker-audio-support-fault');
      await page.evaluate(() => { window.__ptsAudit.mode = 'audio-support-denied'; });
      await page.locator('#export').click(); await idle();
      const after = await page.evaluate(() => window.__ptsAudit.snapshot()), workers = await page.evaluate(() => window.__ptsAudit.workerReceipt());
      const fault = workers.slice(beforeWorkerCount);
      await checkpoint('worker-fault-first-result');
      assert(injectedRequests === 1 && fault.length === 1 && fault[0].markers.some(m => m.trusted && m.__dancePtsQaMarker === 'audio-support-denied' && m.nativeSupported === true), '故障未到真正 Worker 解碼能力邊界');
      assert(fault[0].errors.some(e => e.trusted && e.name === 'Error' && e.message === '示範音訊格式不支援，不能改成無聲。'), '首錯分類／文案被抹掉');
      assert(fault[0].terminateCalls === 1 && fault[0].terminateReturns === 1 && !fault[0].terminateErrors.length, '本輪 Worker 未回收');
      assert(JSON.stringify(after.data) === JSON.stringify(before.data) && JSON.stringify(after.urls) === JSON.stringify(before.urls) && after.output === before.output && JSON.stringify(after.bytes) === JSON.stringify(before.bytes) && JSON.stringify(after.savedExports) === JSON.stringify(before.savedExports), '準備拒絕改動原片完整 bytes／筆記／舊 VS');
      assert(![...before.urls, before.output].some(url => after.revoked.includes(url)) && after.sourcePaused, '舊連結被撤銷或來源仍播放');
      assert((await page.locator('#status').textContent()).includes('音訊格式不支援'), '未清楚回報音訊拒絕');
    } finally { await page.context().unroute(workerURL, inject); }
    await checkpoint('retry-after-fault-removal');
    await page.evaluate(() => { window.__ptsAudit.mode = 'pass'; });
    await page.locator('#export').click(); await idle();
    const retry = await page.evaluate(() => window.__ptsAudit.snapshot());
    assert((await page.locator('#status').textContent()).includes('已成檔') && retry.data.exports.length === before.data.exports.length + 1 && retry.output !== before.output, '故障撤除後不能在同頁成檔');
    assert(JSON.stringify(retry.urls) === JSON.stringify(before.urls) && JSON.stringify(retry.bytes.slice(0, 2)) === JSON.stringify(before.bytes.slice(0, 2)) && JSON.stringify(retry.data.markers) === JSON.stringify(before.data.markers), '恢復成檔破壞原片／非空筆記');
    for (const [table, rows] of Object.entries(before.data)) if (Array.isArray(rows)) for (const row of rows) assert(JSON.stringify(retry.data[table].find(value => value.id === row.id)) === JSON.stringify(row), '成功重試改寫既有 ' + table + ' row');
    for (const row of before.savedExports) assert(JSON.stringify(retry.savedExports.find(value => value.id === row.id)) === JSON.stringify(row), '成功重試破壞既有 VS 完整 bytes');
    report = { engine: 'Chromium', selectedWebKitBranch: true, backend: 'explicit-pts', mp4Output: true, trueWorkerCapabilityFault: true, injectionRequests: injectedRequests,
      before, retry, workers: await page.evaluate(() => window.__ptsAudit.workerReceipt()), auditSourceSha256: options.auditSourceSha256, nativeDownload: false, safariDeviceAcceptance: false };
  } catch (error) { firstFailure = error; failureObservation = await observe(); }
  finally {
    finalObservation = await observe();
    try { await page.evaluate(() => window.__ptsAudit?.restore()); } catch (error) { if (!firstFailure) stage = 'audit-restore'; firstFailure ??= error; }
  }
  const caseEvidence = { case: 'webkit-audio-branch', firstFailedStage: firstFailure ? stage : null, checkpoints, failureObservation, finalObservation, observationErrors };
  if (firstFailure) { const error = firstFailure instanceof Error ? firstFailure : new Error(String(firstFailure), { cause: firstFailure }); error.ptsOwnerEvidence = caseEvidence; throw error; }
  return { ...report, caseEvidence };
}
