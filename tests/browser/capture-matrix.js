/* 檔案用途：單一合成相機錄影案例，供三速度乘三時長矩陣執行。所在層：Web 媒體驗收。主要關聯：capture.js、RECORD_COMPARE.md。 */
// 相機設定已收在選用區；先展開，再沿用原本的錄影與資料保護斷言。
async (page, scenario = { rate: 1, seconds: 15, countdown: 3 }) => {
  const origin = new URL(page.url()).origin, { rate, seconds, countdown } = scenario;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  await page.addInitScript(() => {
    if (window.captureMatrixWrapped) return; window.captureMatrixWrapped = true;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.captureMatrixTracks = []; window.captureMatrixRequests = [];
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!window.__danceSyntheticCameraOnly) throw new Error('必須使用合成相機');
      window.captureMatrixRequests.push(constraints);
      const stream = await original(constraints); window.captureMatrixTracks.push(...stream.getTracks()); return stream;
    };
  });
  await page.goto(origin);
  const videoId = await page.evaluate(() => sessionStorage.getItem('captureMatrixVideo'));
  if (videoId) { await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle(); }
  else {
    await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
    await page.locator('#copy-reference').click(); await idle();
    await page.evaluate(() => sessionStorage.setItem('captureMatrixVideo', document.getElementById('library').value));
  }
  const before = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  await page.locator('#start').fill('0'); await page.locator('#end').fill(String(seconds * rate)); await page.locator('#rate').selectOption(String(rate));
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#countdown').selectOption(String(countdown)); await page.locator('#practice-rate').selectOption('2');
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
  assert(await page.locator('#preview-frame').isVisible() && await page.locator('.body-guide').isVisible(), '取景框未顯示');
  await page.locator('#capture').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('秒後開始'));
  // Safari 的音高處理會增加慢速起播等待；實際原片仍須通過下方原本的 100ms 門檻。
  assert(await page.evaluate(() => document.getElementById('reference').playbackRate === Number(document.getElementById('rate').value) && document.getElementById('reference').preservesPitch === false && ['start', 'end', 'rate', 'countdown', 'camera-facing', 'practice-rate'].every(id => document.getElementById(id).matches(':disabled'))), '錄影未鎖定設定、沿用音高處理或錯用練習速度');
  await page.waitForFunction(() => !document.getElementById('controls').disabled, null, { timeout: 85_000, polling: 100 });
  const result = await page.evaluate(async beforeIds => {
    const storage = await import('/storage.js'), saved = await storage.readLibrary(), take = saved.data.takes.find(t => !beforeIds.includes(t.id));
    if (!take) throw new Error('沒有建立新 take');
    const asset = saved.data.assets.find(a => a.id === take.cameraAssetId), blob = await storage.readMedia(take.cameraAssetId);
    const reference = document.getElementById('reference'), self = document.getElementById('self');
    await self.play(); const start = self.currentTime; await new Promise(r => setTimeout(r, 200)); self.pause();
    const preserved = await Promise.all(saved.data.takes.filter(t => beforeIds.includes(t.id)).map(async t => !!await storage.readMedia(t.cameraAssetId)));
    return { state: take.state, rate: take.rate, plannedMs: (take.referenceEndMs - take.referenceStartMs) / take.rate, decodedMs: Math.round(self.duration * 1000), sourceAtStopMs: Math.round(reference.currentTime * 1000), bytes: blob?.size, metadataBytes: asset.byteLength, played: self.currentTime > start, oldTakesPreserved: preserved.every(Boolean), sourceRateAfter: reference.playbackRate, sourcePitchAfter: reference.preservesPitch, allTracksEnded: window.captureMatrixTracks.every(t => t.readyState === 'ended'), noMicrophone: window.captureMatrixRequests.every(c => c.audio === false), captureTiming: take.captureTiming, diagnostics: JSON.parse(document.getElementById('diagnostics').textContent).capture };
  }, before.takes.map(t => t.id));
  assert(result.state === 'ready' && result.rate === rate && result.plannedMs === seconds * 1000 && result.played && result.bytes > 0 && result.bytes === result.metadataBytes, `原片未完整保存或播放：${JSON.stringify(result)}`);
  // 這是合成案例的長度檢查；真機 G1 與成檔 G2 仍需獨立證據。
  assert(Math.abs(result.decodedMs - result.plannedMs) <= 100 && result.sourceAtStopMs >= seconds * rate * 1000, `時長或 B 停止不符：${JSON.stringify(result)}`);
  assert(result.oldTakesPreserved && result.allTracksEnded && result.noMicrophone && result.sourceRateAfter === 2 && result.sourcePitchAfter === true, '覆寫舊 take、漏關相機或練習速度／音高未恢復');
  assert(Number.isSafeInteger(result.captureTiming?.recorderRequestedMs) && Number.isSafeInteger(result.captureTiming?.recorderStartedMs) && Number.isSafeInteger(result.captureTiming?.referencePlayResolvedMs), '缺少原生 start／播放觀測對照');
  return { scenario, ...result };
}
