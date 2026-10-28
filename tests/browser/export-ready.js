/* 檔案用途：驗證影音準備可取消、拒播不啟動壞輸出、重試仍保留舊片。所在層：#11 合成回歸。主要關聯：main.js、recorder.js、RECORD_COMPARE.md。 */
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) && await page.evaluate(() => window.__danceSyntheticCameraOnly === true), '只可使用隔離本機合成環境');
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); });
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout: 95000 });
  const data = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  await page.goto(origin); await idle(); assert((await data()).videos.length === 0, '必須使用空的合成庫');
  await page.locator('#existing-mode').click(); await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  for (const [id, value] of [['start', '12'], ['end', '14'], ['offset', '4']]) { await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); await idle(); }
  await page.locator('#export').click(); await idle(); assert((await page.locator('#status').textContent()).includes('已成檔'), '基準片未成檔');
  const before = await data(), previous = await page.locator('#output-download').getAttribute('href');
  await page.evaluate(() => {
    const request = HTMLVideoElement.prototype.requestVideoFrameCallback, cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback, Recorder = MediaRecorder;
    window.readyTest = { hold: true, pending: new Set(), held: new Map(), streams: [], created: 0, request, cancel, Recorder };
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
      if (!['reference', 'self'].includes(this.id)) return request.call(this, callback);
      const key = id => this.id + ':' + id;
      const id = request.call(this, (now, metadata) => {
        if (window.readyTest.hold) window.readyTest.held.set(key(id), callback);
        else { window.readyTest.pending.delete(key(id)); callback(now, metadata); }
      }); window.readyTest.pending.add(key(id)); return id;
    };
    HTMLVideoElement.prototype.cancelVideoFrameCallback = function(id) { const key = this.id + ':' + id; window.readyTest.pending.delete(key); window.readyTest.held.delete(key); return cancel.call(this, id); };
    window.MediaRecorder = class extends Recorder { constructor(stream, ...args) { super(stream, ...args); window.readyTest.created++; window.readyTest.streams.push(stream); } };
  });
  try {
    await page.locator('#export').click(); await page.waitForFunction(() => window.readyTest.held.size === 2);
    assert(await page.evaluate(() => window.readyTest.created === 0), '畫面未就緒就啟動編碼');
    await page.locator('#stop').click(); await idle();
    assert(await page.evaluate(() => window.readyTest.pending.size === 0 && window.readyTest.held.size === 0 && window.readyTest.created === 0), '取消準備沒有清理影格等待');
    assert(await page.locator('#output-download').getAttribute('href') === previous && JSON.stringify(await data()) === JSON.stringify(before), '準備取消破壞舊片或資料');
    await page.evaluate(() => { window.readyTest.hold = false; }); await page.locator('#export').click(); await idle();
    assert((await page.locator('#status').textContent()).includes('已成檔'), '取消後無法重試');
    const waiting = page.waitForEvent('download'); await page.locator('#output-download').click(); const file = await waiting;
    await file.saveAs('output/comparison/ready-retry.' + file.suggestedFilename().split('.').pop());
    const saved = await data(), output = await page.locator('#output-download').getAttribute('href');
    for (const rejectAt of [1, 2]) {
      await page.evaluate(rejectAt => { const video = document.getElementById('self'); window.readyTest.play = video.play; let calls = 0; video.play = function() { return ++calls === rejectAt ? Promise.reject(new Error('synthetic ready play rejection')) : window.readyTest.play.call(this); }; }, rejectAt);
      await page.locator('#export').click(); await idle(); await page.evaluate(() => { document.getElementById('self').play = window.readyTest.play; });
      assert((await page.locator('#status').textContent()).includes('synthetic ready play rejection'), '未觸發準備／正式播放拒絕');
      assert(await page.locator('#output-download').getAttribute('href') === output && JSON.stringify(await data()) === JSON.stringify(saved), '拒播覆蓋成功片或資料');
      assert(await page.evaluate(() => window.readyTest.pending.size === 0 && window.readyTest.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')) && document.getElementById('reference').paused && document.getElementById('self').paused), '拒播殘留影格／串流／播放');
    }
    return { warmingCancelledWithoutRecorder: true, nativeFrameWaitsReleased: true, retryEncodedAndDownloaded: true, firstAndSecondPlayRejectionsPreserveOutput: true, noMediaInputApi: true };
  } finally {
    await page.evaluate(() => { HTMLVideoElement.prototype.requestVideoFrameCallback = window.readyTest.request; HTMLVideoElement.prototype.cancelVideoFrameCallback = window.readyTest.cancel; window.MediaRecorder = window.readyTest.Recorder; });
  }
}
