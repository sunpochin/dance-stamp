/* 檔案用途：在產品外用瀏覽器原生播放器重開合成下載檔。所在層：獨立成檔驗收。主要關聯：MEDIA_PROBE.md、capture-navigation.js。 */
async (page, fileUrl, timeoutMs = 25_000) => {
  if (new URL(fileUrl).protocol !== 'file:') throw new Error('請提供本機合成下載檔的 file URL。');
  await page.goto(fileUrl);
  const video = page.locator('video');
  await video.waitFor({ state: 'visible' });
  await video.evaluate(video => { video.pause(); video.currentTime = 0; video.muted = false; video.volume = 0.1; });
  // 原生頁面的真實按鍵提供播放手勢，不沿用產品的 AudioContext 或 Blob URL。
  await video.focus(); await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('video').currentTime > 0.1);
  await page.waitForFunction(() => document.querySelector('video').ended, null, { timeout: timeoutMs });
  const result = await video.evaluate(video => ({ duration: video.duration, time: video.currentTime, ended: video.ended, error: video.error?.code || 0, width: video.videoWidth, height: video.videoHeight, frames: video.getVideoPlaybackQuality().totalVideoFrames, dropped: video.getVideoPlaybackQuality().droppedVideoFrames, audioBytes: video.webkitAudioDecodedByteCount }));
  if (!result.ended || result.error || !result.width || !result.frames) throw new Error(`獨立播放失敗：${JSON.stringify(result)}`);
  return result;
}
