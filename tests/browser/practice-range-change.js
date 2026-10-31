/* 檔案用途：驗證循環中修改 A/B 不播放到新片段之外。所在層：合成瀏覽器回歸。主要關聯：main.js、practice.js。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const change = async (id, value) => { await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); };
  await page.goto(origin); await page.bringToFront();
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  assert(await page.locator('#end').inputValue() === '', '未選片仍預填固定結束秒數');
  // 短片與長片都讀真正解碼片長，避免把 15 秒換成另一個固定上限。
  const fullRanges = [];
  for (const file of ['media-probe/short/reference.mp4', 'export-failure/reference.mp4', 'media-probe/reference.mp4']) {
    await page.locator('#reference-file').setInputFiles('output/' + file); await idle();
    const range = await page.evaluate(() => ({ start: Number(document.getElementById('start').value), end: Number(document.getElementById('end').value), duration: document.getElementById('reference').duration }));
    assert(range.start === 0 && Math.abs(range.end - range.duration) < 0.001, '新選片未預設完整片長：' + JSON.stringify(range));
    fullRanges.push(range);
  }
  await change('end', '20');
  await page.locator('#open-library').click(); await idle();
  assert(Number(await page.locator('#end').inputValue()) === fullRanges.at(-1).end, '重開筆記仍只選 15 秒');
  // 完整 65 秒仍可循環練習；媒體的 60 秒護欄不應誤套到練習播放。
  await page.locator('#loop').click();
  await page.waitForFunction(() => !document.getElementById('reference').paused && document.getElementById('reference').currentTime > 0.1);
  await page.locator('#stop').click(); await idle();
  await change('start', '1'); await change('end', '20');
  await page.locator('#loop').click();
  await page.waitForFunction(() => !document.getElementById('reference').paused && document.getElementById('reference').currentTime > 1.1);
  await page.evaluate(() => {
    const clock = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    window.rangeOverlaps = 0; window.rangeRestarted = false;
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { ...clock, set(value) {
      if (this.id === 'reference' && this.seeking) window.rangeOverlaps++;
      clock.set.call(this, value);
      if (this.id === 'reference' && value === 10 && !window.rangeRestarted) {
        window.rangeRestarted = true;
        // 固定在舊 seek 尚未完成時按停止再重啟，才能穩定重現慢裝置上的交錯。
        queueMicrotask(() => { document.getElementById('stop').click(); document.getElementById('loop').click(); });
      }
    } });
  });
  await change('start', '10');
  // 一秒內必須跳到新 A；不能等原播放自然走到 10 秒才冒充符合新區間。
  await page.waitForFunction(() => document.getElementById('reference').currentTime >= 9.99 && !document.getElementById('reference').paused, null, { timeout: 1000 });
  const aligned = await page.locator('#reference').evaluate(video => video.currentTime);
  assert(aligned < 20, '修改起點後超過新 B');
  assert(await page.evaluate(() => window.rangeRestarted && window.rangeOverlaps === 0), '快速重啟與原生 seek 重疊');
  await change('end', '9');
  await page.waitForFunction(() => document.getElementById('reference').paused && document.getElementById('loop').textContent === '開始 A–B 循環');
  assert((await page.locator('#status').textContent()).includes('合法'), '逆序 A/B 沒有明確停止與提示');
  return { movingARealignsWithinOneSecond: true, restartWaitsForNativeSeek: true, invalidRangeStops: true, fullRanges, reopenUsesFullRange: true, fullLengthPracticePlays: true, aligned };
}
