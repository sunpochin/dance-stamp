/* 檔案用途：保留真正瀏覽器背景切換的嚴格驗收。所在層：桌面生命週期 gate。主要關聯：practice.js、ACCEPTANCE.md。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  await page.goto(origin); await page.bringToFront();
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4');
  await page.waitForFunction(() => !document.getElementById('controls').disabled);
  await page.locator('#start').fill('1'); await page.locator('#end').fill('2');
  await page.locator('#loop').click(); await page.waitForFunction(() => !document.getElementById('reference').paused);
  const sibling = await page.context().newPage();
  try {
    await sibling.goto(origin); await sibling.bringToFront();
    // 必須真的 hidden，不能用合成事件、暫停影片或綠燈跳過取代背景驗收。
    await page.waitForFunction(() => document.hidden && document.getElementById('reference').paused, null, { timeout: 30_000 });
    await page.bringToFront();
    if (!await page.locator('#reference').evaluate(v => v.paused)) throw new Error('回前景未經操作自行播放');
    await page.locator('#loop').click();
    await page.waitForFunction(() => !document.getElementById('reference').paused && document.getElementById('reference').currentTime < 2);
    await page.locator('#stop').click();
    return { nativeBackgroundStopped: true, explicitRestartAlignsToA: true };
  } finally { await page.bringToFront(); await sibling.close(); await page.locator('#stop').click(); }
}
