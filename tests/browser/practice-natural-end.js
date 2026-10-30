/* 檔案用途：驗證影片自然播完後的循環重啟與停止清理。所在層：合成瀏覽器回歸。主要關聯：main.js、practice.js、issue #103。 */
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  await page.addInitScript(() => {
    const request = HTMLVideoElement.prototype.requestVideoFrameCallback, cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
    window.naturalEnd = { events: [], frames: new Set(), maximumFrames: 0 };
    // 只包住產品自己的 callback；額外訂閱影格可能改變尾端時序，也不能手動派送 ended 冒充播完。
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
      if (this.id !== 'reference') return request.call(this, callback);
      const id = request.call(this, (...args) => { window.naturalEnd.frames.delete(id); callback(...args); });
      window.naturalEnd.frames.add(id); window.naturalEnd.maximumFrames = Math.max(window.naturalEnd.maximumFrames, window.naturalEnd.frames.size); return id;
    };
    HTMLVideoElement.prototype.cancelVideoFrameCallback = function(id) { if (this.id === 'reference') window.naturalEnd.frames.delete(id); return cancel.call(this, id); };
    document.addEventListener('DOMContentLoaded', () => {
      const video = document.getElementById('reference');
      // capture 先讀原生尾端，再讓產品 handler 回捲；事後讀值已是 A，不能誤判成沒有播完。
      for (const type of ['ended', 'pause', 'playing', 'seeked']) video.addEventListener(type, event => window.naturalEnd.events.push({ type, trusted: event.isTrusted, time: performance.now(), at: video.currentTime, ended: video.ended }), true);
    });
  });
  await page.goto(origin);
  await page.locator('#reference-file').setInputFiles('output/media-probe/player/sample.mov');
  await page.waitForFunction(() => !document.getElementById('controls').disabled);
  const duration = await page.locator('#reference').evaluate(video => video.duration);
  assert(duration > 0 && duration < 5, '自然播完測試必須使用既有短合成影片');
  await page.locator('#start').fill('0.4'); await page.locator('#end').fill(String(duration)); await page.locator('#practice-rate').selectOption('2');
  const before = await page.evaluate(async () => await (await import('/storage.js')).readLibrary());
  await page.locator('#loop').click();
  await page.waitForFunction(() => window.naturalEnd.events.filter(event => event.type === 'ended').length >= 2 && !document.getElementById('reference').paused && document.getElementById('reference').currentTime > 0.4, null, { timeout: 15_000 });
  await page.locator('#loop').click();
  const stopped = await page.evaluate(() => ({ events: window.naturalEnd.events, maximumFrames: window.naturalEnd.maximumFrames, pending: window.naturalEnd.frames.size, paused: document.getElementById('reference').paused, at: document.getElementById('reference').currentTime }));
  const ends = stopped.events.filter(event => event.type === 'ended');
  assert(ends.length >= 2 && ends.every(event => event.trusted && event.ended && event.at === duration), '沒有真正到影片尾端');
  for (const end of ends) assert(stopped.events.some(event => event.type === 'playing' && event.time > end.time && event.at < 0.6), '自然播完後沒有回到 A 繼續實播');
  assert(stopped.paused && stopped.pending === 0 && stopped.maximumFrames <= 1, '停止時遺留影格工作或重複 owner');
  // 等過原片下一次播完的時間，才能發現晚到的 ended／seek 讓停止後又自行播放。
  await page.waitForTimeout(duration / 2 * 1000 + 300);
  assert(await page.evaluate(at => { const video = document.getElementById('reference'); return video.paused && video.currentTime === at && window.naturalEnd.frames.size === 0 && document.getElementById('loop').textContent === '開始 A–B 循環'; }, stopped.at), '停止後被晚到的工作重新播放');
  assert(JSON.stringify(await page.evaluate(async () => await (await import('/storage.js')).readLibrary())) === JSON.stringify(before), '循環播放改動筆記資料');
  return { duration, nativeEnds: ends.length, allEventsTrusted: stopped.events.every(event => event.trusted), maximumFrames: stopped.maximumFrames, pendingAfterStop: stopped.pending, noLateRestart: true, libraryPreserved: true, events: stopped.events };
}
