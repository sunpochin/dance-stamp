/* 檔案用途：驗證外部中斷原片必須遵守只在本次連結的保存選擇。所在層：合成瀏覽器回歸。主要關聯：main.js、backup-recovery.js。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = current => current.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await page.addInitScript(() => { window.confirm = () => true; navigator.mediaDevices.getUserMedia = async () => { throw new Error('此回歸禁止相機'); }; });
  await page.goto(origin); await idle(page);
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle(page);
  await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle(page);
  const backup = await page.evaluate(async () => {
    const store = await import('/storage.js'), { data } = await store.readLibrary();
    const result = (await import('/library.js')).validateBackup(data);
    for (const take of result.takes) take.state = 'interrupted';
    return result;
  });
  const context = await page.context().browser().newContext(), restored = await context.newPage();
  await context.addInitScript(() => { window.confirm = () => true; Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); });
  try {
    await restored.goto(origin); await idle(restored);
    await restored.locator('#restore').setInputFiles({ name: 'synthetic-interrupted.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) }); await idle(restored);
    const hasDialog = await restored.locator('#import-dialog').count() > 0;
    if (hasDialog) { await restored.locator('#import-confirm').click(); await idle(restored); }
    const take = backup.takes.at(-1);
    await restored.locator('#library').selectOption(take.referenceVideoId); await restored.locator('#open-library').click(); await idle(restored);
    await restored.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle(restored);
    await restored.locator('#confirm-link').click(); await idle(restored);
    await restored.evaluate(() => {
      const put = IDBObjectStore.prototype.put; window.sessionMediaWrites = [];
      IDBObjectStore.prototype.put = function(...args) { if (this.name === 'media') window.sessionMediaWrites.push(args[1]); return put.apply(this, args); };
    });
    const open = async () => { await restored.getByRole('button', { name: '開啟自拍／恢復', exact: true }).last().click(); await idle(restored); };
    if (hasDialog) {
      await restored.locator('#media-inventory').evaluate(el => { el.open = true; });
      await restored.locator('#media-items li[data-asset-id="' + take.cameraAssetId + '"]').getByRole('button', { name: '選片並預覽重連', exact: true }).click(); await idle(restored);
      await restored.locator('#relink-file').setInputFiles('output/media-probe/reference.mp4'); await idle(restored);
      await restored.locator('#relink-checked').check();
      assert(!await restored.locator('#relink-save').isChecked(), '預設勾選了保存副本');
      await restored.locator('#relink-confirm').click(); await idle(restored);
      await open();
    } else {
      await open();
      await restored.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle(restored);
      await restored.locator('#confirm-take').click(); await idle(restored);
    }
    const snapshot = () => restored.evaluate(async id => {
      const store = await import('/storage.js'), { data } = await store.readLibrary();
      return { stored: !!await store.readMedia(id), writes: window.sessionMediaWrites.length, state: data.takes.find(t => t.cameraAssetId === id).state, decoded: document.getElementById('self').readyState >= 2 };
    }, take.cameraAssetId);
    const first = await snapshot();
    assert(!first.stored && first.writes === 0 && first.state === 'interrupted' && first.decoded, '只在本次連結卻自動保存了中斷原片：' + JSON.stringify(first));
    await open(); const repeated = await snapshot();
    assert(!repeated.stored && repeated.writes === 0 && repeated.state === 'interrupted', '再次開啟又寫入外部中斷原片');
    // 只有這個明確保存操作才可寫 Blob；中斷狀態不因此升為完整錄影。
    await restored.locator('#copy-self').click(); await idle(restored);
    const saved = await snapshot();
    assert(saved.stored && saved.writes === 1 && saved.state === 'interrupted', '明確保存副本沒有保留中斷狀態');
    await open(); const reopened = await snapshot();
    assert(reopened.writes === 1 && reopened.state === 'interrupted' && reopened.decoded, '重開已存中斷片段不應重寫整份 Blob');
    return { sessionOnlyHonored: true, repeatedOpenDoesNotCopy: true, explicitSaveWorks: true, storedInterruptedDoesNotRewrite: true };
  } finally { await context.close(); }
}
