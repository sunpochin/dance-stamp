/* 檔案用途：以真實解碼驗證格式、換片回滾與 URL 釋放。所在層：桌面播放器回歸。主要關聯：recorder.js、make-player-fixtures.ts。 */
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  // 與預覽主機使用相同入口，避免把其他本機網站當成回歸目標。
  await page.goto('http://127.0.0.1:4174/');
  await page.evaluate(() => {
    window.playerURLs = new Set(); window.playerURLPeak = 0;
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = value => { const url = create(value); window.playerURLs.add(url); window.playerURLPeak = Math.max(window.playerURLPeak, window.playerURLs.size); return url; };
    URL.revokeObjectURL = url => { window.playerURLs.delete(url); revoke(url); };
  });
  const input = page.getByLabel('示範影片', { exact: true });
  const settle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  const frames = async () => page.locator('#reference').evaluate(async video => {
    const muted = video.muted; video.muted = true;
    try {
      await video.play();
      await new Promise(resolve => setTimeout(resolve, 250));
      return { width: video.videoWidth, height: video.videoHeight, time: video.currentTime, error: video.error?.code || 0, fit: getComputedStyle(video).objectFit };
    } finally { video.pause(); video.muted = muted; }
  });
  const cases = [
    ['H.264 silent', 'short/reference.mp4', true],
    ['portrait', 'player/portrait.mp4', true],
    ['rotation', 'player/orientation.mp4', true],
    ['VFR', 'player/vfr.mp4', true],
    ['H.264 MOV', 'player/sample.mov', false],
    ['renamed valid MP4', 'player/renamed.data', false],
  ];
  const results = [];
  for (const [label, path, required] of cases) {
    await input.setInputFiles(`output/media-probe/${path}`); await settle();
    const status = await page.locator('#status').textContent();
    if (!status.startsWith('老師示範已載入')) { assert(!required, `${label} 失敗：${status}`); results.push({ label, result: 'unsupported', status }); continue; }
    const observed = await frames();
    assert(observed.width > 0 && observed.height > 0 && observed.time > 0.1 && !observed.error && observed.fit === 'contain', `${label} 沒有實際播放或方向拉伸`);
    if (label === 'portrait' || label === 'rotation') assert(observed.height > observed.width, '直向或旋轉方向錯誤');
    results.push({ label, result: 'played', ...observed });
  }
  await input.setInputFiles('output/media-probe/reference.mp4'); await settle();
  await page.locator('#reference').evaluate(async video => { video.currentTime = 2; await new Promise(r => video.addEventListener('seeked', r, { once: true })); });
  await page.getByRole('button', { name: '標記當下時間', exact: true }).click();
  await page.getByLabel('標記標題', { exact: true }).fill('換片失敗仍保留');
  await page.getByRole('button', { name: '儲存標記', exact: true }).click(); await settle();
  const previous = await page.locator('#reference').getAttribute('src');
  const notes = await page.locator('#markers').textContent();
  // 即使能力提示說 probably，損壞的 .mp4 也必須依實際解碼結果失敗。
  await page.evaluate(() => { HTMLMediaElement.prototype.canPlayType = () => 'probably'; });
  for (const file of ['player/corrupt.mp4', 'empty/reference.mp4']) {
    await input.setInputFiles(`output/media-probe/${file}`); await settle();
    assert(await page.locator('#reference').getAttribute('src') === previous, '錯誤檔破壞原影片');
    assert(await page.locator('#markers').textContent() === notes, '錯誤檔破壞筆記');
    assert(await input.inputValue() === '', '失敗後沒有清空選檔，無法再選同一檔');
    assert(await page.locator('#reference').evaluate(v => Math.abs(v.currentTime - 2) < 0.15 && !v.error), '錯誤回滾沒有恢復原位置');
  }
  await input.setInputFiles([]); await settle();
  assert(await page.locator('#reference').getAttribute('src') === previous, '取消選檔破壞原影片');
  // 播放器與新增的原片下載各有一個 URL；重選十次仍應維持固定數量。
  for (let i = 0; i < 10; i++) {
    await input.setInputFiles(`output/media-probe/${i % 2 ? 'player/portrait.mp4' : 'short/reference.mp4'}`); await settle();
    assert(await page.evaluate(() => window.playerURLs.size === 2), '換片殘留 object URL');
    assert(await page.locator('#reference').evaluate(v => v.paused && !v.error), '換片殘留播放或錯誤狀態');
  }
  return { cases: results, corruptDespiteProbablyRejected: true, badAndEmptyPreserveSourceAndNotes: true, cancelPreservesSource: true, tenSwitchesKeepPlayerAndDownloadURLs: true, maximumLiveURLs: await page.evaluate(() => window.playerURLPeak) };
}
