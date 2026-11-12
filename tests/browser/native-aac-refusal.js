/* 用途：當次Linux Chrome原生AAC不支援時，真PTS owner拒絕仍保全；所在層：平台負例；關聯：platform-plan、pts-audit、export-pts。非Safari UI成功案。 */
async (page, options) => {
  const assert = (ok, message) => { if (!ok) throw Error(message); }, origin = new URL(page.url()).origin;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout: 15000, polling: 50 });
  const checkpoints = []; let stage = 'bootstrap', firstFailure, failureObservation, report, injectedRequests = 0;
  const observe = () => page.evaluate(() => ({ workers: window.__ptsAudit?.workerReceipt?.() ?? null, status: document.getElementById('status')?.textContent, diagnostics: document.getElementById('diagnostics')?.textContent, source: 'memory/DOM only; no catch DB read' }));
  const checkpoint = async label => { stage = label; checkpoints.push({ stage, observation: await observe() }); };
  const workerURL = origin + '/export-pts-worker.js'; let routeInstalled = false;
  const inspect = async route => {
    injectedRequests++;
    const response = await route.fetch();
    // 僅轉交並記真isConfigSupported原結果；絕不把支援改成false或造Worker錯誤。
    const prefix = `const qaNativeEncoderSupport=AudioEncoder.isConfigSupported; AudioEncoder.isConfigSupported=async function(config){const actual=await qaNativeEncoderSupport.call(this,config);self.postMessage({__dancePtsQaMarker:'native-aac-encoder-support',config:{codec:config.codec,sampleRate:config.sampleRate,numberOfChannels:config.numberOfChannels,bitrate:config.bitrate},supported:actual.supported});return actual;};\n`;
    await route.fulfill({ response, body: prefix + await response.text() });
  };
  try {
    assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), '只使用本輪loopback合成環境');
    assert(!await page.evaluate(async () => (await import('/local-audio.js')).safariAudio()), '舊VS基準必走實際Chrome產品路徑，不假稱Linux具AAC能力');
    await page.evaluate(options.installAudit);
    await checkpoint('select-original-synthetic-sources');
    await page.locator('#existing-mode').click();
    for (const [id, path] of [['reference-file', 'output/export-failure/reference.mp4'], ['self-file', 'output/export-failure/self.mp4']]) { await page.locator('#' + id).setInputFiles(path); await idle(); }
    await page.locator('#end').fill('1.5'); await page.locator('#end').dispatchEvent('change'); await idle();
    await page.locator('#mark').click(); await page.locator('#marker-title').fill('原生AAC拒絕保全'); await page.locator('#marker-note').fill('不支援不能刪原片或舊VS'); await page.locator('#marker-form button[type="submit"]').click(); await idle();
    await checkpoint('real-chrome-product-baseline');
    await page.locator('#export').click(); await idle();
    assert((await page.locator('#status').textContent()).includes('已成檔'), 'Chrome舊VS基準未完成：' + await page.locator('#status').textContent());
    const before = await page.evaluate(() => window.__ptsAudit.snapshot());
    assert(before.data.markers.length && before.data.exports.length && before.bytes[2].bytes > 0, '缺真非空筆記／舊VS');
    await checkpoint('direct-owner-native-capability-refusal');
    await page.context().route(workerURL, inspect); routeInstalled = true;
    const first = await page.evaluate(async () => {
      const a = window.__ptsAudit, reference = a.blobs.get(document.getElementById('reference').getAttribute('src')), self = a.blobs.get(document.getElementById('self').getAttribute('src'));
      if (!(reference instanceof Blob) || !(self instanceof Blob)) throw Error('缺原生保留來源Blob');
      const { exportExplicitPts } = await import('/export-pts.js');
      try { const value = await exportExplicitPts({ reference, self, recipe: { startMs: 0, endMs: 1500, rate: 1, offsetMs: 0, selfDurationMs: 8000, referenceMirror: false, selfMirror: false } }); return { accepted: true, bytes: value.blob.size }; }
      catch (error) { return { accepted: false, name: error.name, message: error.message, metadata: error.metadata }; }
    });
    await checkpoint('first-native-refusal');
    const workers = await page.evaluate(() => window.__ptsAudit.workerReceipt());
    assert(injectedRequests === 1 && workers.length === 1, '未到自己的真PTS Worker');
    const capability = workers[0].markers.filter(row => row.__dancePtsQaMarker === 'native-aac-encoder-support');
    assert(capability.length === 1 && capability[0].trusted && capability[0].supported === false, '當次原生AAC沒有實際回false；不追測或偽造不支援');
    assert(capability[0].config.codec === 'mp4a.40.2' && capability[0].config.sampleRate === 48000 && capability[0].config.numberOfChannels === 1 && capability[0].config.bitrate === 128000, '不是原產品AAC配置');
    assert(!first.accepted && first.name === 'Error' && first.message === '此瀏覽器無法編碼示範 AAC，原片保留。', '原首拒原因／分類遺失');
    assert(workers[0].errors.some(row => row.trusted && row.message === first.message), '沒有同一原生Worker拒絕事件');
    assert(workers[0].terminateCalls === 1 && workers[0].terminateReturns === 1 && !workers[0].terminateErrors.length && first.metadata.workerTermination.returned && !first.metadata.ownerCleanupErrors.length, '自己的Worker清理未返回');
    const after = await page.evaluate(() => window.__ptsAudit.snapshot());
    for (const key of ['data', 'urls', 'output', 'bytes', 'savedExports']) assert(JSON.stringify(after[key]) === JSON.stringify(before[key]), 'AAC原生拒絕改動 ' + key);
    assert(after.sourcePaused && ![...before.urls, before.output].some(url => after.revoked.includes(url)), '原片未停或舊VS連結被撤銷');
    report = { engine: 'Chromium', testMode: 'direct-product-owner-native-aac-refusal', selectedWebKitUIBranch: false, nativeAACConfigurationSupported: false, capability, first, before, after, workers, nativeDownload: false, safariAcceptance: false, physicalWorkerExitIndependentlyVerified: false, scope: 'Only this CI Chrome/config native false; not all Linux, not successful PTS export or UI rejection/retry' };
  } catch (error) { firstFailure = error; try { failureObservation = await observe(); } catch (observationError) { failureObservation = { observationError: observationError.message }; } }
  finally {
    for (const cleanup of [async () => { if (routeInstalled) await page.context().unroute(workerURL, inspect); }, async () => { await page.evaluate(() => window.__ptsAudit?.restore()); }]) try { await cleanup(); } catch (error) { firstFailure ??= error; }
  }
  const caseEvidence = { case: 'native-aac-refusal', firstFailedStage: firstFailure ? stage : null, checkpoints, failureObservation };
  if (firstFailure) { firstFailure.ptsOwnerEvidence = caseEvidence; throw firstFailure; }
  return { ...report, caseEvidence };
}
