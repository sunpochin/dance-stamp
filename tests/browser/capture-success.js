/* 檔案用途：真正完成有拍數倒數的合成相機錄影與原片下載。所在層：無硬體的瀏覽器回歸。主要關聯：main.js、beats.js、storage.js。 */
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  assert(await page.evaluate(() => window.__danceSyntheticCameraOnly === true), '必須是專用合成相機');
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#practice details summary').click();
  await page.locator('#beat-bpm').fill('300'); await page.locator('#beat-first').fill('0'); await page.locator('#beat-count-in').selectOption('4');
  await page.locator('#beat-save').click(); await idle();
  // 相機入口已移入選用工具，展開後才測真正的錄影流程。
  await page.locator('#camera-tools > summary').click();
  await page.locator('#end').fill('15'); await page.locator('#camera').click(); await idle();
  await page.locator('#capture').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('拍後開始'));
  assert(await page.locator('#start').isDisabled(), '倒數期間未鎖設定');
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
  await page.waitForFunction(() => !document.getElementById('controls').disabled, null, { timeout: 22000 });
  const saved = await page.evaluate(async () => {
    const store = await import('/storage.js'), state = await store.readLibrary(), take = state.data.takes.at(-1), blob = await store.readMedia(take.cameraAssetId);
    const stream = document.getElementById('preview').srcObject;
    return { take, bytes: blob?.size, duration: document.getElementById('self').duration, released: !stream || stream.getTracks().every(track => track.readyState === 'ended') };
  });
  assert(saved.take.state === 'ready' && saved.bytes > 0 && Math.abs(saved.duration - 15) < 0.2 && saved.released, '完整錄影未保存或資源未釋放：' + JSON.stringify(saved));
  assert(saved.take.beatGrid.countInBeats === 4 && Number.isSafeInteger(saved.take.captureTiming.recorderStartedMs), '倒數快照或原生開始觀測遺失');
  const waiting = page.waitForEvent('download'); await page.locator('#take-download').click();
  const download = await waiting; assert(await download.failure() === null, '完整原片無法下載');
  return { realRecorderWithSyntheticCamera: true, nativeIndexedDB: true, beatCountIn: true, readyTake: true, bytes: saved.bytes, durationMs: saved.duration * 1000, tracksReleased: true };
}
