/* 檔案用途：驗證備份預覽、衝突副本、取消及原子失敗。所在層：隔離 Web 資料驗收。主要關聯：backup-recovery.js、library.js、storage.js。 */
async (page) => {
  const origin = new URL(page.url()).origin, outside = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const snapshot = () => page.evaluate(async () => await (await import('/storage.js')).readLibrary());
  const sources = () => page.evaluate(() => ['reference', 'self', 'output-download'].map(id => document.getElementById(id).src || document.getElementById(id).href));
  const restore = async data => {
    await page.locator('#restore').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) }); await idle();
    await page.locator('#import-dialog').waitFor({ state: 'visible' });
  };
  const change = async (id, value) => { await page.locator(`#${id}`).fill(value); await page.locator(`#${id}`).dispatchEvent('change'); await idle(); };
  page.on('request', request => { if ((!request.url().startsWith(origin + '/') && !request.url().startsWith('blob:')) || !['GET', 'HEAD'].includes(request.method())) outside.push(request.method()); });
  await page.addInitScript(() => { window.confirm = () => true; navigator.mediaDevices.getUserMedia = async () => { throw new Error('備份驗收禁止相機'); }; });
  await page.goto(origin); await idle();
  await page.locator('#existing-mode').click();
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  await change('start', '12'); await change('end', '17'); await change('offset', '4');
  await page.locator('#reference-mirror').check(); await idle();
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成備份標記'); await page.locator('#marker-note').fill('<img src=x onerror="window.backupXss=true">');
  await page.locator('#marker-form').evaluate(form => form.requestSubmit()); await idle();
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '沒有產生供完整還原的 VS');
  const outputDownload = page.waitForEvent('download'); await page.locator('#output-download').click(); await (await outputDownload).saveAs('output/media-probe/backup12-generated-vs.mp4');
  const backupDownload = page.waitForEvent('download'); await page.locator('#backup').click(); await (await backupDownload).saveAs('output/media-probe/backup12-original.json'); await idle();
  const original = await snapshot(), originalSources = await sources();
  const canonical = await page.evaluate(async () => (await import('/library.js')).validateBackup((await (await import('/storage.js')).readLibrary()).data));
  assert(await page.locator('#media-inventory').evaluate(e => e.open), '備份沒有打開另存影片清單');
  await page.waitForFunction(() => document.querySelectorAll('#media-items li[data-availability="session"]').length === 2 && document.querySelectorAll('#media-items li[data-availability="stored"]').length === 1);
  // 無效檔案不可以留下部分資料，也不能打開可接受的匯入預覽。
  for (const bad of [{ ...canonical, schemaVersion: 99 }, { ...canonical, recipes: canonical.recipes.map(r => ({ ...r, takeId: '00000000-0000-4000-8000-000000000000' })) }]) {
    await page.locator('#restore').setInputFiles({ name: 'synthetic-invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) }); await idle();
    assert(!await page.locator('#import-dialog').evaluate(d => d.open) && JSON.stringify(await snapshot()) === JSON.stringify(original), '無效備份部分匯入');
  }
  for (const buffer of [Buffer.from('{'), Buffer.from('{"__proto__":{"synthetic":true}}'), Buffer.alloc(10 * 1024 * 1024 + 1, 32)]) {
    await page.locator('#restore').setInputFiles({ name: 'synthetic-invalid.json', mimeType: 'application/json', buffer }); await idle();
    assert(JSON.stringify(await snapshot()) === JSON.stringify(original), '壞 JSON／危險鍵／超限部分寫入');
  }
  const incoming = structuredClone(canonical); incoming.videos[0].title = '備份另一版本'; incoming.assets.find(a => a.kind === 'reference').byteLength++;
  await restore(incoming);
  assert((await page.locator('#import-summary').textContent()).includes('內容衝突') && JSON.stringify(await snapshot()) === JSON.stringify(original), '選檔前便寫入或沒有衝突預覽');
  await page.keyboard.press('Escape'); assert(JSON.stringify(await snapshot()) === JSON.stringify(original) && JSON.stringify(await sources()) === JSON.stringify(originalSources), '取消預覽破壞舊配對');
  await restore(incoming); await page.locator('#import-confirm').click(); await idle();
  const copied = await snapshot(), video = copied.data.videos.find(v => v.title === '備份另一版本');
  assert(video && video.id !== canonical.videos[0].id, '副本覆寫影片 ID');
  const take = copied.data.takes.filter(t => t.referenceVideoId === video.id).at(-1), recipe = copied.data.recipes.find(r => r.takeId === take.id), artifact = copied.data.exports.find(e => e.recipeId === recipe.id);
  assert(take.referenceStartMs === 12000 && take.referenceEndMs === 17000 && recipe.offsetMs === 4000 && recipe.referenceMirror && !recipe.selfMirror, '副本關聯或映射錯誤');
  assert(artifact && artifact.assetId !== canonical.exports[0].assetId && await page.evaluate(async id => !await (await import('/storage.js')).readMedia(id), artifact.assetId), '副本誤取本機舊 VS');
  assert(JSON.stringify(copied.data.videos.find(v => v.id === canonical.videos[0].id)) === JSON.stringify(original.data.videos[0]) && JSON.stringify(await sources()) === JSON.stringify(originalSources), '副本破壞原資料或主播放器');
  await restore(incoming); await page.locator('#import-confirm').click(); await idle(); assert(JSON.stringify(await snapshot()) === JSON.stringify(copied), '重匯相同副本不冪等');
  // 在舊配對仍顯示時取消另一份原片的重連；不能把候選畫面或 File 變成已確認來源。
  const missingReference = copied.data.assets.find(a => a.kind === 'reference' && a.videoId === video.id);
  const missingRow = page.locator('#media-items li[data-asset-id="' + missingReference.id + '"]');
  for (const mode of ['escape', 'transaction-cancel']) {
    await missingRow.getByRole('button', { name: '選片並預覽重連', exact: true }).click(); await idle();
    await page.locator('#relink-file').setInputFiles('output/comparison/reference.mp4'); await idle();
    if (mode === 'escape') await page.keyboard.press('Escape');
    else {
      await page.locator('#relink-checked').check();
      await page.evaluate(() => {
        window.relinkCancelPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(...args) { const request = window.relinkCancelPut.apply(this, args); if (this.name === 'metadata') queueMicrotask(() => document.getElementById('relink-cancel').click()); return request; };
      });
      try { await page.locator('#relink-confirm').click(); await idle(); }
      finally { await page.evaluate(() => { IDBObjectStore.prototype.put = window.relinkCancelPut; }); }
    }
    assert(JSON.stringify(await snapshot()) === JSON.stringify(copied) && JSON.stringify(await sources()) === JSON.stringify(originalSources), '重連取消破壞舊配對或部分寫入');
  }
  const failure = structuredClone(incoming); failure.videos[0].title = '故障驗收副本';
  for (const mode of ['quota', 'cancel']) {
    await restore(failure);
    await page.evaluate(mode => {
      window.backupNativePut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === 'metadata' && mode === 'quota') throw new DOMException('synthetic import quota', 'QuotaExceededError');
        const request = window.backupNativePut.apply(this, args);
        if (this.name === 'metadata' && mode === 'cancel') queueMicrotask(() => document.getElementById('import-cancel').click());
        return request;
      };
    }, mode);
    try { await page.locator('#import-confirm').click(); await idle(); assert(JSON.stringify(await snapshot()) === JSON.stringify(copied) && JSON.stringify(await sources()) === JSON.stringify(originalSources), mode + ' 沒有原子回滾'); }
    finally { await page.evaluate(() => { IDBObjectStore.prototype.put = window.backupNativePut; }); }
    if (await page.locator('#import-dialog').evaluate(d => d.open)) await page.locator('#import-cancel').click();
  }
  const foreign = structuredClone(canonical); foreign.sourceLibraryId = '00000000-0000-4000-8000-000000000012';
  await restore(foreign); assert((await page.locator('#import-summary').textContent()).includes('另一個來源'), '外來來源未分開說明'); await page.locator('#import-confirm').click(); await idle();
  const separated = await snapshot(); assert(separated.data.videos.length === copied.data.videos.length + 1, '不同來源同 ID 被合併');
  await restore(foreign); await page.locator('#import-confirm').click(); await idle(); assert(JSON.stringify(await snapshot()) === JSON.stringify(separated), '不同來源重匯重複新增');
  await restore(failure);
  const other = await page.context().newPage(); await other.goto(origin);
  await other.evaluate(async id => { const store = await import('/storage.js'), saved = await store.readLibrary(); saved.data.videos.find(v => v.id === id).title = '合成另一分頁版本'; await store.writeLibrary(saved.data, saved.revision); }, canonical.videos[0].id); await other.close();
  await page.locator('#import-confirm').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('另一分頁') && (await snapshot()).data.videos.find(v => v.id === canonical.videos[0].id).title === '合成另一分頁版本', '匯入覆寫真正另一分頁');
  await page.locator('#import-cancel').click();
  assert(await page.evaluate(() => !window.backupXss && !document.querySelector('#markers img')) && outside.length === 0, '筆記執行 HTML 或發送外部寫入');
  return { previewBeforeWrite: true, escapePreservesPair: true, conflictCopiesPreserveRelationsAndOldVs: true, reimportIdempotent: true, quotaAndInTransactionCancelAtomic: true, foreignSourcesIsolated: true, actualTabConflictProtected: true, invalidAndOversizeAtomic: true, pureTextNotes: true, jsonHasNoMedia: true, outsideRequests: outside };
}
