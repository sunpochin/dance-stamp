/* 檔案用途：保留真正瀏覽器背景切換的嚴格驗收。所在層：桌面生命週期 gate。主要關聯：practice.js、ACCEPTANCE.md。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  await page.addInitScript(() => {
    const frames = new Set(), request = HTMLVideoElement.prototype.requestVideoFrameCallback, cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
    if (!request || !cancel) throw new Error('此桌面 gate 需要原生影格 callback；RAF 降級另行驗證');
    window.backgroundEvidence = { frames, maximumFrames: 0, visibility: [], playing: [] };
    // 只觀察 reference 的原生 callback，不更動可見性、播放或停止；CLI 輪詢也不列入產品數量。
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
      if (this.id !== 'reference') return request.call(this, callback);
      const id = request.call(this, (now, metadata) => { frames.delete(id); callback(now, metadata); });
      frames.add(id); window.backgroundEvidence.maximumFrames = Math.max(window.backgroundEvidence.maximumFrames, frames.size); return id;
    };
    HTMLVideoElement.prototype.cancelVideoFrameCallback = function(id) { if (this.id === 'reference') frames.delete(id); return cancel.call(this, id); };
    document.addEventListener('visibilitychange', event => window.backgroundEvidence.visibility.push({ hidden: document.hidden, trusted: event.isTrusted }));
    document.addEventListener('playing', event => { if (event.target.id === 'reference') window.backgroundEvidence.playing.push({ time: event.target.currentTime, trusted: event.isTrusted }); }, true);
  });
  await page.goto(origin); await page.bringToFront();
  // 鎖定桌面會讓前景前置條件失敗，不能把尚未開始的測試算成背景停止成功。
  await page.waitForFunction(() => !document.hidden, null, { polling: 50, timeout: 10_000 });
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4');
  await page.waitForFunction(() => !document.getElementById('controls').disabled);
  await page.locator('#start').fill('1'); await page.locator('#end').fill('2');
  await page.locator('#loop').click(); await page.waitForFunction(() => !document.getElementById('reference').paused && document.getElementById('reference').currentTime > 1.4);
  const sibling = await page.context().newPage();
  try {
    await sibling.goto(origin); await sibling.bringToFront();
    // 必須真的 hidden，不能用合成事件、暫停影片或綠燈跳過取代背景驗收。
    await page.waitForFunction(() => document.hidden && document.getElementById('reference').paused, null, { polling: 50, timeout: 30_000 });
    const background = await page.evaluate(() => ({ pending: window.backgroundEvidence.frames.size, time: document.getElementById('reference').currentTime, plays: window.backgroundEvidence.playing.length }));
    if (background.pending !== 0) throw new Error('背景停止後仍殘留產品 callback');
    await page.bringToFront();
    await page.waitForFunction(() => !document.hidden, null, { polling: 50, timeout: 10_000 });
    // 留出觀察窗，並核對原生 playing 次數，避免短暫自播又暫停被漏算。
    await page.waitForTimeout(500);
    if (!await page.locator('#reference').evaluate(v => v.paused)) throw new Error('回前景未經操作自行播放');
    if (await page.evaluate(() => window.backgroundEvidence.playing.length) !== background.plays) throw new Error('回前景曾經自行播放');
    await page.locator('#loop').click();
    // play() 先把 paused 改 false，playing 稍後才排入；必須等本次事件，避免拿上次的 A 冒充重啟定位。
    await page.waitForFunction(plays => !document.getElementById('reference').paused && document.getElementById('reference').currentTime < 2 && window.backgroundEvidence.playing.length > plays, background.plays, { polling: 50 });
    const restarted = await page.evaluate(() => window.backgroundEvidence.playing.at(-1));
    if (!restarted?.trusted || restarted.time < 1 || restarted.time > 1.15) throw new Error('明確重啟沒有從 A 定位後播放');
    await page.locator('#stop').click();
    const evidence = await page.evaluate(() => ({ pending: window.backgroundEvidence.frames.size, maximumFrames: window.backgroundEvidence.maximumFrames, visibility: window.backgroundEvidence.visibility }));
    if (evidence.pending !== 0 || evidence.maximumFrames !== 1) throw new Error('停止未清理或曾排入多個產品 callback');
    if (!evidence.visibility.some(e => e.hidden && e.trusted) || !evidence.visibility.some(e => !e.hidden && e.trusted)) throw new Error('缺少可信任的原生背景／前景事件');
    return { nativeBackgroundStopped: true, explicitRestartAlignsToA: true, background, restarted, ...evidence };
  } finally { await page.bringToFront(); await sibling.close(); await page.locator('#stop').click(); }
}
