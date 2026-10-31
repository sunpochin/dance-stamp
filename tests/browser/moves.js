/* 檔案用途：實走跨課程動作、手動狀態、比較歷史、離線與備份恢復。所在層：合成瀏覽器回歸。主要關聯：main.js、library.js、DATA_FORMAT.md。 */
// 筆記管理收在次要工具，先展開再驗證既有功能；資料斷言維持原樣。
async (root) => {
  const context = await root.context().browser().newContext(), page = await context.newPage();
  const origin = new URL(root.url()).origin, file = 'output/media-probe/reference.mp4';
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = p => p.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const snapshot = p => p.evaluate(async () => await (await import('/storage.js')).readLibrary());
  const normalized = p => p.evaluate(async () => { const { readLibrary } = await import('/storage.js'); return (await import('/library.js')).validateBackup((await readLibrary()).data); });
  const expand = p => p.getByText('分類搜尋與動作庫', { exact: true }).click();
  const errors = [], outside = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  try {
  page.context().on('request', r => { if (!r.url().startsWith(origin) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) outside.push(r.url()); });
  await page.goto(origin); await idle(page); await expand(page);
  await page.locator('#move-name').fill('合成 Suzy Q'); await page.locator('#move-style').fill('Salsa');
  await page.locator('#move-name').press('Enter'); await idle(page);
  const moveId = (await snapshot(page)).data.moves[0].id;
  for (const [index, teacher] of ['老師甲', '老師乙'].entries()) {
    await page.locator('#reference-file').setInputFiles(file); await idle(page);
    // 動作歷史案例要建立短段比較，不再依賴選片預設幫忙裁成 15 秒。
    await page.locator('#end').fill('15');
    await page.locator('#video-title').fill(`合成課程 ${index}`); await page.locator('#video-teacher').fill(teacher); await page.locator('#video-style').fill('Salsa'); await page.locator('#video-date').fill(`2026-10-${20 + index}`);
    await page.locator('#save-title').click(); await idle(page);
    await page.locator('#mark').click();
    await page.locator('#marker-title').fill('同一腳步'); await page.locator('#marker-start').fill('2'); await page.locator('#marker-end').fill('4'); await page.locator('#marker-note').fill('重心先移 <img src=x onerror=alert(1)>'); await page.locator('#marker-move').selectOption(moveId);
    await page.getByRole('button', { name: '儲存標記', exact: true }).click(); await idle(page);
    await page.locator('#self-file').setInputFiles(file); await idle(page);
    await page.locator('#copy-reference').click(); await idle(page); await page.locator('#copy-self').click(); await idle(page);
  }
  const data = (await snapshot(page)).data;
  assert(data.videos.length === 2 && data.markers.every(m => m.moveId === moveId) && data.takes.length === 2, '跨課程關聯或 take 未建立');
  assert(data.moves[0].status === 'wanted', '錄影片段自動改了練習狀態');
  assert(await page.locator('#move-results img').count() === 0, '筆記被當成 HTML');
  assert(await page.getByRole('button', { name: '開啟指定片段', exact: true }).count() === 2, '動作未連到兩課程');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '開啟指定片段', exact: true }).nth(i).click(); await idle(page);
    assert(await page.locator('#library').inputValue() === data.videos[i].id && Math.abs(await page.locator('#reference').evaluate(v => v.currentTime) - 2) < .05, '跨影片片段未跳到原位置');
  }
  const beforeCourses = await snapshot(page);
  // 課程與動作片段是不同入口；先換到另一課，避免按到原課卻誤認已驗證切換。
  await page.locator('#search-videos > li').filter({ hasText: data.videos[0].title }).getByRole('button', { name: '開啟課程', exact: true }).click(); await idle(page);
  assert(await page.locator('#library').inputValue() === data.videos[0].id && await page.locator('#video-title').inputValue() === data.videos[0].title, '搜尋課程未切回第一堂筆記');
  await page.locator('#library-keyword').fill('ＳＵＺＹ 重心'); await page.locator('#library-style').fill('salsa'); await page.locator('#library-teacher').fill('老師乙'); await page.locator('#library-from').fill('2026-10-21'); await page.locator('#library-to').fill('2026-10-21');
  assert(await page.locator('#search-videos > li').count() === 1 && await page.getByRole('button', { name: '開啟指定片段', exact: true }).count() === 1, '組合搜尋不正確');
  await page.getByRole('button', { name: '開啟課程', exact: true }).click(); await idle(page);
  assert(await page.locator('#library').inputValue() === data.videos[1].id && await page.locator('#video-title').inputValue() === data.videos[1].title && await page.locator('#video-teacher').inputValue() === '老師乙', '篩選後開到其他課程');
  assert(await page.locator('#reference').evaluate(v => v.readyState >= 2 && v.duration > 0 && !v.error) && (await page.locator('#markers').textContent()).includes('重心先移'), '搜尋課程未讀回已存示範或筆記');
  assert(JSON.stringify(await snapshot(page)) === JSON.stringify(beforeCourses), '只開啟搜尋課程卻改寫筆記或revision');
  await page.locator('#library-reset').click();
  await page.getByRole('button', { name: '編輯動作／狀態', exact: true }).click(); await idle(page);
  await page.locator('#move-status').selectOption('practicing'); await page.getByRole('button', { name: '儲存動作', exact: true }).click(); await idle(page);
  await page.locator('#library-status').selectOption('learned'); assert(await page.locator('#move-results > li').count() === 0, '狀態篩選未生效');
  await page.locator('#library-status').selectOption('practicing');
  await page.getByRole('button', { name: '開啟這次比較配方', exact: true }).first().click(); await idle(page);
  const latest = data.takes.toSorted((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  assert(await page.locator('#library').inputValue() === latest.referenceVideoId && !await page.locator('#compare').isDisabled(), '歷史未開啟正確比較');
  const before = await normalized(page);
  await page.locator('#note-tools').evaluate(d => { d.open = true; });
  const downloading = page.waitForEvent('download'); await page.locator('#backup').click(); await (await downloading).saveAs('output/issue-17/notes.dance-stamp.json'); await idle(page);
  // 僅測本機資源已備妥後的離線，不能冒充另一台裝置或首次離線開站。
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.reload(); await idle(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  try {
    await page.reload(); await idle(page); await expand(page);
    await page.locator('#library-keyword').fill('Suzy'); await page.locator('#library-status').selectOption('practicing');
    assert(await page.getByRole('button', { name: '開啟指定片段', exact: true }).count() === 2 && await page.getByRole('button', { name: '開啟這次比較配方', exact: true }).count() === 2, '離線搜尋或歷史遺失');
    await page.locator('#library-teacher').fill('老師甲');
    await page.getByRole('button', { name: '開啟課程', exact: true }).click(); await idle(page);
    assert(await page.locator('#library').inputValue() === data.videos[0].id && await page.locator('#video-title').inputValue() === data.videos[0].title && await page.locator('#reference').evaluate(v => v.readyState >= 2 && !v.error), '離線搜尋未開啟指定課程及保存副本');
    // 後段仍要驗證跨兩課程的解除關聯／刪除，不能讓此處的單一老師篩選藏掉原按鈕。
    await page.locator('#library-teacher').fill('');
    assert(JSON.stringify(await normalized(page)) === JSON.stringify(before), '離線重開改寫筆記');
  } finally { await page.context().setOffline(false); }
  const fresh = await page.context().browser().newContext(), restored = await fresh.newPage();
  try {
    await restored.goto(origin); await idle(restored);
    await restored.locator('#restore').setInputFiles('output/issue-17/notes.dance-stamp.json'); await idle(restored);
    assert((await restored.locator('#import-summary').textContent()).includes('1 個動作'), '匯入預覽未顯示動作');
    await restored.locator('#import-confirm').click(); await idle(restored); await expand(restored);
    const after = await normalized(restored); after.exportedAt = before.exportedAt;
    assert(JSON.stringify(after) === JSON.stringify(before), '新環境還原的分類、狀態或關聯不一致');
    assert((await restored.evaluate(async () => await (await import('/storage.js')).readMediaKeys())).length === 0, 'JSON 偷帶影片');
    // JSON沒有影片；搜尋仍須開對筆記並保留缺片提示，不能靠片段按鈕代替這條路徑。
    await restored.locator('#library-teacher').fill('老師甲');
    await restored.getByRole('button', { name: '開啟課程', exact: true }).click(); await idle(restored);
    assert(await restored.locator('#library').inputValue() === data.videos[0].id && await restored.locator('#video-title').inputValue() === data.videos[0].title && (await restored.locator('#markers').textContent()).includes('重心先移'), '缺片搜尋課程未開到原筆記');
    assert((await restored.locator('#status').textContent()).includes('尚未連結') && await restored.locator('#reference').getAttribute('src') === null, '缺片搜尋誤顯示已連結或舊影片');
    const opened = await normalized(restored); opened.exportedAt = before.exportedAt;
    assert(JSON.stringify(opened) === JSON.stringify(before), '缺片搜尋改寫還原資料');
    await restored.locator('#library-teacher').fill('');
    await restored.getByRole('button', { name: '開啟指定片段', exact: true }).first().click(); await idle(restored);
    assert((await restored.locator('#status').textContent()).includes('尚未連結') && (await restored.locator('#markers').textContent()).includes('重心先移'), '缺片筆記不可讀');
    await restored.locator('#reference-file').setInputFiles(file); await idle(restored); await restored.locator('#confirm-link').click(); await idle(restored);
    await restored.getByRole('button', { name: '開啟指定片段', exact: true }).first().click(); await idle(restored);
    assert(Math.abs(await restored.locator('#reference').evaluate(v => v.currentTime) - 2) < .05, '明確重連後不能跳片段');
    await restored.getByRole('button', { name: '開啟這次比較配方', exact: true }).last().click(); await idle(restored);
    await restored.locator('#self-file').setInputFiles(file); await idle(restored); await restored.locator('#confirm-take').click(); await idle(restored);
    assert(!await restored.locator('#compare').isDisabled(), '缺少自己原片時未能重連既有配方');
    // 移除／修改關聯只操作筆記，原片與既有 take 不能被連帶刪除。
    const retained = await snapshot(page);
    await page.getByRole('button', { name: '編輯片段／關聯', exact: true }).first().click(); await idle(page);
    await page.locator('#marker-move').selectOption(''); await page.getByRole('button', { name: '儲存標記', exact: true }).click(); await idle(page);
    const unlinked = await snapshot(page);
    assert(unlinked.data.markers.filter(m => m.moveId === moveId).length === 1 && JSON.stringify(unlinked.data.takes) === JSON.stringify(retained.data.takes), '解除關聯誤刪練習');
    await page.getByRole('button', { name: '移除動作…', exact: true }).click(); await idle(page);
    assert(await page.locator('#delete-cancel').evaluate(e => document.activeElement === e), '刪動作未預設取消焦點');
    await page.locator('#delete-cancel').click(); await idle(page);
    assert((await snapshot(page)).data.moves.length === 1, '取消刪動作仍寫入');
    await page.getByRole('button', { name: '移除動作…', exact: true }).click(); await idle(page); await page.locator('#delete-confirm').click(); await idle(page);
    const removed = await snapshot(page);
    assert(removed.data.moves.length === 0 && removed.data.markers.length === 2 && removed.data.markers.every(m => !m.moveId), '刪動作誤刪標記');
    for (const table of ['videos','takes','recipes','assets']) assert(JSON.stringify(removed.data[table]) === JSON.stringify(retained.data[table]), '刪動作誤改共用資料 ' + table);
    assert((await page.evaluate(async () => await (await import('/storage.js')).readMediaKeys())).length === 4, '刪動作誤刪原片');
    await restored.setViewportSize({ width: 390, height: 844 });
    assert(await restored.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), '動作結果窄視窗溢出');
    await restored.screenshot({ path: 'output/issue-17/moves-narrow.png', fullPage: true });
  } finally { await fresh.close(); }
  assert(!errors.length && !outside.length, '瀏覽器錯誤或外部請求 ' + errors.join(';'));
  return { courses: 2, markers: 2, takes: 2, manualStatus: true, search: true, courseSearchOpen: { online: true, offline: true, restoredWithoutMedia: true }, crossVideoSeek: true, historyRecipe: true, offlineReload: true, backupFreshContext: true, missingNotesAndExplicitRelink: true, unlinkAndDeletePreserveMedia: true, narrowLayout: true, pageErrors: errors.length, outsideRequests: outside.length };
  } finally { await context.close(); }
}
