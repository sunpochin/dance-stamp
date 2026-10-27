/* 檔案用途：驗證缺少影格 callback 與音高能力時的降級。所在層：合成瀏覽器驗收。主要關聯：practice.js、main.js。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  await page.addInitScript(() => {
    // 只在合成測試頁移除能力，確認產品未把 API 存在當成必要條件。
    delete HTMLVideoElement.prototype.requestVideoFrameCallback;
    delete HTMLMediaElement.prototype.preservesPitch;
    const frame = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window), pending = new Set();
    const clock = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    window.practiceFallback = { pending, maximum: 0, boundaries: [] };
    window.requestAnimationFrame = callback => {
      const id = frame(time => { pending.delete(id); callback(time); }); pending.add(id);
      window.practiceFallback.maximum = Math.max(window.practiceFallback.maximum, pending.size); return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { ...clock, set(value) {
      if (this.id === 'reference' && value === 1 && clock.get.call(this) >= 1.25) window.practiceFallback.boundaries.push((clock.get.call(this) - 1.25) * 1000);
      clock.set.call(this, value);
    } });
  });
  await page.goto(origin); await page.bringToFront();
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4');
  // Playwright 預設的 RAF 輪詢會把觀察器自己算進來；改用固定輪詢，不放寬產品的單 callback 門檻。
  await page.waitForFunction(() => !document.getElementById('controls').disabled, null, { polling: 50 });
  await page.locator('#start').fill('1'); await page.locator('#end').fill('1.25'); await page.locator('#practice-rate').selectOption('2');
  await page.locator('#loop').click();
  await page.waitForFunction(() => window.practiceFallback.boundaries.length >= 20, null, { timeout: 20_000, polling: 50 });
  await page.locator('#loop').click();
  const result = await page.evaluate(() => ({ loops: window.practiceFallback.boundaries.length, maximumBoundaryMs: Math.max(...window.practiceFallback.boundaries), maximumCallbacks: window.practiceFallback.maximum, pending: window.practiceFallback.pending.size, paused: document.getElementById('reference').paused, pitchWarning: document.getElementById('pitch-status').textContent.includes('未提供音高保持') }));
  if (result.loops < 20 || result.maximumBoundaryMs > 150 || result.maximumCallbacks > 1 || result.pending !== 0 || !result.paused || !result.pitchWarning) throw new Error(JSON.stringify(result));
  return result;
}
