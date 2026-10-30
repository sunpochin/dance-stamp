/* 檔案用途：在同一操作流程驗動作、拍點、VS、分享與完整備份共存。所在層：Web 整合回歸。主要關聯：main.js、library.js、MEDIA_PROBE.md。 */
// 筆記管理收在次要工具，先展開再驗證既有功能；資料斷言維持原樣。
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) && await page.evaluate(() => window.__danceSyntheticCameraOnly === true), '只可使用隔離本機合成環境');
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); });
  const idle = p => p.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout: 95000 });
  const read = p => p.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const download = async (id, name) => { const waiting = page.waitForEvent('download'); await page.locator('#' + id).click(); const file = await waiting; await file.saveAs('output/web-candidate-validation/' + name); await idle(page); return file; };
  await page.goto(origin); await idle(page); assert((await read(page)).videos.length === 0, '需要空的合成庫');
  await page.locator('#existing-mode').click(); await page.locator('#reference-file').setInputFiles('output/export-failure/reference.mp4'); await idle(page);
  await page.locator('#practice details summary').click();
  await page.locator('#beat-bpm').fill('120'); await page.locator('#beat-first').fill('0.35'); await page.locator('#beat-count-in').selectOption('4'); await page.locator('#beat-save').click(); await idle(page);
  await page.getByText('分類搜尋與動作庫', { exact: true }).click(); await page.locator('#move-name').fill('合成共同動作'); await page.locator('#move-style').fill('Salsa'); await page.getByRole('button', { name: '儲存動作', exact: true }).click(); await idle(page);
  const moveId = (await read(page)).moves[0].id;
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成共同片段'); await page.locator('#marker-start').fill('1'); await page.locator('#marker-end').fill('3'); await page.locator('#marker-note').fill('合成私人正文'); await page.locator('#marker-move').selectOption(moveId); await page.getByRole('button', { name: '儲存標記', exact: true }).click(); await idle(page);
  await page.locator('#self-file').setInputFiles('output/export-failure/self.mp4'); await idle(page);
  for (const [id, value] of [['start','1'],['end','3'],['offset','0.5']]) { await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); await idle(page); }
  await page.locator('#copy-reference').click(); await idle(page); await page.locator('#copy-self').click(); await idle(page); await page.locator('#export').click(); await idle(page);
  assert((await page.locator('#status').textContent()).includes('已成檔'), '共同流程未成檔');
  const data = await read(page), beat = data.videos[0].beatGrid, marker = data.markers[0], artifact = data.exports.at(-1);
  assert(data.schemaVersion === 2 && beat.bpm === 120 && beat.firstBeatMs === 350 && marker.moveId === moveId && data.moves[0].status === 'wanted', '成檔遺失拍點／動作或自動改狀態');
  assert(await page.getByRole('button', { name: '開啟這次比較配方', exact: true }).count() >= 1, '動作歷史沒有此次比較');
  const outputWait = page.waitForEvent('download'); await page.locator('#output-download').click(); const outputFile = await outputWait; await outputFile.saveAs('output/web-candidate-validation/integrated-vs.' + outputFile.suggestedFilename().split('.').pop());
  await page.locator('#note-tools').evaluate(d => { d.open = true; });
  await page.locator('#share-notes').click(); await idle(page);
  for (const [table, id] of [['markers',marker.id],['exports',artifact.id]]) await page.locator(`#share-items input[data-table="${table}"][value="${id}"]`).check();
  await page.locator('#share-preview').click(); await idle(page); const shared = JSON.parse(await page.locator('#share-content').textContent());
  assert(shared.schemaVersion === 2 && shared.moves.length === 0 && !JSON.stringify(shared).includes('moveId') && !JSON.stringify(shared).includes('beatGrid') && !JSON.stringify(shared).includes('合成私人正文'), '共同分享外流未選資料');
  assert(shared.takes.length === 1 && shared.exports.length === 1 && shared.recipes[0].takeId === shared.takes[0].id, '共同分享閉包損壞');
  await download('share-download', 'integrated-share.dance-stamp.json'); await page.locator('#share-cancel').click(); await idle(page);
  await download('backup', 'integrated-backup.dance-stamp.json');
  // 分享要排除私人關聯，完整備份卻要保留；分開核對才能抓到共用過濾器誤刪資料。
  const context = await page.context().browser().newContext({ acceptDownloads: true });
  await context.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); });
  try {
    const restored = await context.newPage(); await restored.goto(origin); await idle(restored); await restored.locator('#restore').setInputFiles('output/web-candidate-validation/integrated-backup.dance-stamp.json'); await idle(restored); await restored.locator('#import-confirm').click(); await idle(restored);
    const after = await read(restored), normalized = p => p.evaluate(async () => { const s = await import('/storage.js'); return (await import('/library.js')).validateBackup((await s.readLibrary()).data); });
    const beforeNormalized = await normalized(page), afterNormalized = await normalized(restored); afterNormalized.exportedAt = beforeNormalized.exportedAt;
    assert(JSON.stringify(beforeNormalized) === JSON.stringify(afterNormalized), '共同備份還原改動關聯／設定');
    assert(after.moves[0].id === moveId && after.markers[0].moveId === moveId && after.videos[0].beatGrid.bpm === 120 && after.assets.every(a => a.state === 'missing'), '還原丟動作／拍點或冒稱包含影片');
    assert(await restored.evaluate(async () => (await (await import('/storage.js')).readMediaKeys()).length === 0), 'JSON 夾帶影片');
    return { allThreeFeaturesAndVsInOneWorkflow: true, manualMoveStatusPreserved: true, historyLinkedToComparison: true, shareExcludesMovesBeatsAndPrivateNote: true, selectedRecipeClosureRetained: true, fullBackupRestoresAllFeatureRelations: true, backupContainsNoMedia: true, noCameraOrMicrophoneApi: true };
  } finally { await context.close(); }
}
