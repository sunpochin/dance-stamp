/* 檔案用途：驗證缺少手動畫面擷取 API 時的備援與資源清理。所在層：合成瀏覽器回歸。主要關聯：main.js、comparison-matrix.js。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await page.goto(origin); await idle();
  await page.evaluate(() => {
    const capture = HTMLCanvasElement.prototype.captureStream;
    const request = HTMLVideoElement.prototype.requestVideoFrameCallback, cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
    window.pendingComparisonFrames = new Map();
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
      const pending = window.pendingComparisonFrames.get(this) || new Set(); window.pendingComparisonFrames.set(this, pending);
      const id = request.call(this, (now, metadata) => { pending.delete(id); callback(now, metadata); }); pending.add(id); return id;
    };
    HTMLVideoElement.prototype.cancelVideoFrameCallback = function(id) { window.pendingComparisonFrames.get(this)?.delete(id); return cancel.call(this, id); };
    window.fallbackStreams = [];
    HTMLCanvasElement.prototype.captureStream = function(rate) {
      const stream = capture.call(this, rate);
      stream.getVideoTracks().forEach(track => Object.defineProperty(track, 'requestFrame', { value: undefined }));
      window.fallbackStreams.push({ rate, stream }); return stream;
    };
  });
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  // 新選片預設全長；此比較案例明確選 15 秒，保留原本的媒體護欄與測試範圍。
  await page.locator('#end').fill('15');
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  await page.locator('#end').fill('2'); await page.locator('#end').dispatchEvent('change'); await idle();
  await page.locator('#export').click(); await idle();
  if (!(await page.locator('#status').textContent()).includes('已成檔')) throw new Error('擷取備援未成檔');
  const result = await page.evaluate(() => ({ rates: window.fallbackStreams.map(s => s.rate), stopped: window.fallbackStreams.every(s => s.stream.getTracks().every(t => t.readyState === 'ended')), pendingFrames: [...window.pendingComparisonFrames.values()].reduce((n, s) => n + s.size, 0) }));
  if (JSON.stringify(result.rates) !== '[0,30]' || !result.stopped || result.pendingFrames !== 0) throw new Error('備援遺漏釋放串流或影格 callback');
  return { missingRequestFrameFallsBack: true, discardedStreamStopped: true, exportStreamStopped: true, frameCallbacksReleased: true };
}
