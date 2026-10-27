/* 檔案用途：驗證匯入／重連 modal 的鍵盤與長文字窄版。所在層：Web 可及性回歸。主要關聯：backup-conflicts.js、backup-recovery.js。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  await page.goto(origin); await idle(); await page.setViewportSize({ width: 390, height: 844 });
  const incoming = await page.evaluate(async () => {
    const data = (await import('/library.js')).newLibrary(), videoId = crypto.randomUUID();
    data.videos.push({ id: videoId, title: 'a'.repeat(500), durationMs: 65000, revision: 1 });
    data.assets.push({ id: crypto.randomUUID(), videoId, kind: 'reference', byteLength: 1, mimeType: 'video/mp4', durationMs: 65000 }); return data;
  });
  const choose = async () => { await page.locator('#restore').setInputFiles({ name: 'synthetic-keyboard.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) }); await idle(); };
  await choose();
  assert(await page.evaluate(() => document.activeElement.id === 'import-cancel' && document.getElementById('import-dialog').matches(':modal')), '匯入沒有預設保留本機或原生 modal');
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => !document.hasFocus() || document.getElementById('import-dialog').contains(document.activeElement)), '頁面焦點跑到 modal 外');
  }
  await page.locator('#import-cancel').focus(); await page.keyboard.press('Escape');
  assert(await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data.videos.length === 0), '鍵盤取消匯入仍有寫入');
  await choose();
  assert(await page.evaluate(() => document.getElementById('import-dialog').scrollWidth <= document.getElementById('import-dialog').clientWidth), '長標題讓匯入框水平溢出');
  await page.screenshot({ path: 'output/backup12-import-mobile.png' });
  await page.locator('#import-confirm').focus(); await page.keyboard.press('Enter'); await idle();
  await page.getByRole('button', { name: '選片並預覽重連', exact: true }).focus(); await page.keyboard.press('Enter'); await idle();
  await page.evaluate(() => {
    window.relinkCreated = []; window.relinkRevoked = [];
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); window.relinkCreated.push(url); return url; };
    URL.revokeObjectURL = url => { window.relinkRevoked.push(url); return revoke(url); };
  });
  await page.locator('#relink-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#relink-checked').focus(); await page.keyboard.press('Space');
  assert(await page.locator('#relink-checked').isChecked() && !await page.locator('#relink-save').isChecked(), '鍵盤確認或預設不保存副本錯誤');
  await page.screenshot({ path: 'output/backup12-relink-mobile.png' });
  await page.locator('#relink-confirm').focus(); await page.keyboard.press('Enter'); await idle();
  const result = await page.evaluate(async () => ({ keys: (await (await import('/storage.js')).readMediaKeys()).length, created: window.relinkCreated.length, cleared: window.relinkCreated.every(url => window.relinkRevoked.includes(url)), previewReleased: !document.getElementById('relink-preview').getAttribute('src'), fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth }));
  assert(result.keys === 0 && result.created > 0 && result.cleared && result.previewReleased && result.fits, '重連隱藏保存、沒有釋放候選或窄版溢出');
  return { keyboardCancelAndConfirm: true, pageFocusStaysInModal: true, longTitleFits: true, checkboxKeyboardWorks: true, sessionOnlyDefault: true, previewResourcesReleased: true, narrowLayout: true };
}
