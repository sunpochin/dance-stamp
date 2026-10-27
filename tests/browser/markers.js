/* 檔案用途：驗證時間筆記、草稿保護與實際顯示影格跳轉。所在層：合成資料瀏覽器回歸。主要關聯：main.js、timeline.js、issue-7-time-markers.md。 */
async (page) => {
  const origin = new URL(page.url()).origin, checks = {};
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const row = title => page.locator('#markers li').filter({ hasText: title });
  const save = async () => { await page.getByRole('button', { name: '儲存標記', exact: true }).click(); await idle(); };
  const seek = seconds => page.locator('#reference').evaluate(async (video, time) => {
    if (Math.abs(video.currentTime - time) < 0.001) return;
    video.currentTime = time; await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
  }, seconds);
  await page.goto(origin);
  await page.locator('#reference-file').setInputFiles('output/media-probe/short/reference.mp4'); await idle();
  const otherId = await page.locator('#library').inputValue();
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  const videoId = await page.locator('#library').inputValue();
  await seek(1.234); await page.locator('#mark').click();
  const clicked = Number(await page.locator('#marker-start').inputValue());
  await page.locator('#marker-title').fill('合成點標記');
  await page.locator('#marker-note').fill('<img src=x onerror=alert(1)>合成純文字');
  await seek(6); await save();
  let data = await library();
  const point = data.markers.find(m => m.videoId === videoId && m.title === '合成點標記');
  assert(point.startMs === Math.round(clicked * 1000) && point.startMs === 1234, '存檔時間取代點擊時間');
  assert(await row('合成點標記').locator('img').count() === 0, '純文字被當成 HTML');
  checks.clickSnapshotAndPlainText = true;
  await seek(8.125); await page.locator('#mark').click();
  await page.locator('#marker-title').fill('合成區間標記'); await page.locator('#marker-end').fill('12.5'); await save();
  const range = (await library()).markers.find(m => m.title === '合成區間標記');
  await row('合成區間標記').getByRole('button', { name: '編輯', exact: true }).click(); await idle();
  await page.locator('#marker-note').fill('保留的合成草稿');
  const oldSource = await page.locator('#reference').getAttribute('src');
  await page.locator('#reference-file').setInputFiles('output/media-probe/short/reference.mp4'); await idle();
  await page.locator('#library').selectOption(otherId); await page.locator('#open-library').click(); await idle();
  await page.locator('#mark').click();
  await row('合成點標記').getByRole('button', { name: '編輯', exact: true }).click(); await idle();
  await row('合成點標記').getByRole('button', { name: '刪除標記', exact: true }).click(); await idle();
  assert(await page.locator('#marker-note').inputValue() === '保留的合成草稿', '另一個入口吃掉草稿');
  assert(await page.locator('#reference').getAttribute('src') === oldSource && await page.locator('#reference-file').inputValue() === '', '草稿中仍換片或未重設選片');
  assert((await library()).markers.find(m => m.id === range.id).videoId === videoId, '編輯跨影片移動');
  checks.draftSurvivesNavigationAndDelete = true;
  await page.locator('#marker-end').fill('4'); await save();
  assert(await page.locator('#marker-form').isVisible() && (await page.locator('#status').textContent()).includes('不會自動交換'), '非法區間未保留草稿或未提示');
  assert((await library()).markers.find(m => m.id === range.id).endMs === 12500, '非法區間被寫入');
  await page.locator('#marker-end').fill('13.5'); await save();
  const edited = (await library()).markers.find(m => m.id === range.id);
  assert(edited.revision === range.revision + 1 && edited.startMs === 8125 && edited.endMs === 13500 && edited.note === '保留的合成草稿', '編輯 ID／revision 不一致');
  checks.invalidRangeRejectedAndEditStable = true;
  await seek(30); await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成待刪標記'); await save();
  const starts = await page.locator('#markers li p').allTextContents();
  assert(starts.map(s => Number.parseFloat(s)).join(',') === '1.234,8.125,30', '清單未按數字時間排序');
  // 只對本測試的合成筆記自動確認，避免操作任何使用者資料。
  await page.evaluate(() => { window.confirm = () => true; });
  await row('合成待刪標記').getByRole('button', { name: '刪除標記', exact: true }).click(); await idle();
  assert(await row('合成待刪標記').count() === 0 && !(await library()).markers.some(m => m.title === '合成待刪標記'), '刪除與索引不同步');
  checks.numericOrderAndDelete = true;
  const displayed = [];
  for (const [title, target] of [['合成點標記', 1.234], ['合成區間標記', 8.125], ['合成點標記', 1.234]]) {
    await page.evaluate(() => {
      const video = document.getElementById('reference');
      if (!video.requestVideoFrameCallback) throw new Error('此瀏覽器不能量測顯示影格時間');
      // 在點擊前掛 callback，量真正呈現的 mediaTime；currentTime setter 並非顯示證據。
      window.markerDisplayed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('沒有新呈現影格')), 5000);
        video.requestVideoFrameCallback((_, metadata) => { clearTimeout(timer); resolve(metadata.mediaTime); });
      });
    });
    await row(title).getByRole('button', { name: '跳到這裡', exact: true }).click(); await idle();
    const actual = await page.evaluate(() => window.markerDisplayed), errorMs = Math.abs(actual - target) * 1000;
    assert(errorMs <= 150, `顯示跳轉誤差 ${errorMs}ms 超過目標`);
    displayed.push({ target, actual, errorMs });
    if (title === '合成區間標記') assert(await page.locator('#start').inputValue() === '8.125' && await page.locator('#end').inputValue() === '13.5', '區間未設定 A/B');
  }
  await page.locator('#start').fill('8'); await page.locator('#end').fill('2'); await page.locator('#loop').click();
  assert((await page.locator('#status').textContent()).includes('不會自動交換') && await page.locator('#start').inputValue() === '8' && await page.locator('#end').inputValue() === '2', '非法 A/B 被啟用或互換');
  checks.displayedSeek = displayed; checks.invalidABRejected = true;
  await page.locator('#copy-reference').click(); await idle();
  const beforeReload = (await library()).markers;
  await page.reload(); await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
  assert(JSON.stringify((await library()).markers) === JSON.stringify(beforeReload) && await row('合成區間標記').count() === 1, '重開後標記不同');
  assert(await page.locator('#reference').evaluate(v => v.readyState >= 2), '保存的示範未讀回');
  checks.reopenKeepsNotesAndMedia = true;
  await row('合成區間標記').getByRole('button', { name: '編輯', exact: true }).click(); await idle();
  await page.locator('#marker-note').fill('衝突後仍保留的合成草稿');
  const sibling = await page.context().newPage();
  try {
    await sibling.goto(origin);
    await sibling.evaluate(async () => {
      const store = await import('/storage.js'), saved = await store.readLibrary();
      saved.data.videos[0].revision++; await store.writeLibrary(saved.data, saved.revision);
    });
  } finally { await sibling.close(); }
  await save();
  assert(await page.locator('#marker-form').isVisible() && await page.locator('#marker-note').inputValue() === '衝突後仍保留的合成草稿', '衝突遺失草稿');
  assert((await library()).markers.find(m => m.id === range.id).note === '保留的合成草稿', '舊分頁覆蓋資料');
  checks.conflictKeepsDraft = true;
  await page.locator('#cancel-marker').click();
  return checks;
}
