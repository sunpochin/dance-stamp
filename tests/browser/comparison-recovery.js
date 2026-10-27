/* 檔案用途：在全新瀏覽器資料中還原比較，核對重匯、quota 與跨分頁衝突。所在層：合成資料回歸。主要關聯：existing-comparison.js、storage.js。 */
async (page) => {
  const origin = new URL(page.url()).origin, context = await page.context().browser().newContext();
  const restored = await context.newPage(), checks = {};
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => restored.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const library = () => restored.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  await context.addInitScript(() => {
    window.confirm = () => true;
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('備份驗收禁止相機'); };
  });
  try {
    await restored.goto(origin); await idle();
    assert((await library()).takes.length === 0, '還原環境不是空白資料集');
    await restored.locator('#restore').setInputFiles('output/media-probe/existing-backup.json'); await idle();
    // 新入口先預覽；明確確認才可核對原子匯入與重匯結果。
    await restored.locator('#import-dialog').waitFor({ state: 'visible' }); await restored.locator('#import-confirm').click(); await idle();
    const before = await library();
    const take = before.takes.find(t => t.referenceStartMs === 12000 && t.referenceEndMs === 17000 && before.recipes.some(r => r.takeId === t.id && r.offsetMs === 4000));
    assert(take, 'JSON 未還原雙片配方');
    assert(await restored.evaluate(async id => !(await (await import('/storage.js')).readMedia(id)), take.cameraAssetId), 'JSON 夾帶原片');
    await restored.locator('#restore').setInputFiles('output/media-probe/existing-backup.json'); await idle();
    // 新入口先預覽；明確確認才可核對原子匯入與重匯結果。
    await restored.locator('#import-dialog').waitFor({ state: 'visible' }); await restored.locator('#import-confirm').click(); await idle();
    assert((await library()).takes.length === before.takes.length, '重匯產生重複配方');
    await restored.locator('#restore').setInputFiles({ name: 'synthetic-future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...before, schemaVersion: 99 })) }); await idle();
    assert((await library()).takes.length === before.takes.length, '未知版本部分寫入');
    await restored.locator('#library').selectOption(take.referenceVideoId); await restored.locator('#open-library').click(); await idle();
    await restored.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
    await restored.locator('#confirm-link').click(); await idle();
    const index = before.takes.filter(t => t.referenceVideoId === take.referenceVideoId).findIndex(t => t.id === take.id);
    await restored.getByRole('button', { name: '開啟自拍／恢復', exact: true }).nth(index).click(); await idle();
    await restored.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
    assert(await restored.locator('#export').isDisabled(), '還原原片沒有人工確認');
    await restored.locator('#confirm-take').click(); await idle();
    assert(Number(await restored.locator('#offset').inputValue()) === 4, '還原重連後對齊錯誤');
    // 在真正媒體 put 故障時，metadata 及 File 預覽都必須保留。
    await restored.evaluate(() => {
      window.comparisonNativePut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) { if (this.name === 'media') throw new DOMException('synthetic quota', 'QuotaExceededError'); return window.comparisonNativePut.apply(this, args); };
    });
    await restored.locator('#copy-self').click(); await idle();
    await restored.evaluate(() => { IDBObjectStore.prototype.put = window.comparisonNativePut; });
    assert(await restored.evaluate(async id => !(await (await import('/storage.js')).readMedia(id)), take.cameraAssetId), 'quota 後留下部分副本');
    assert(await restored.locator('#self').evaluate(v => v.videoWidth > 0), 'quota 破壞當次原片');
    const other = await context.newPage(); await other.goto(origin);
    await other.evaluate(async id => {
      const { readLibrary, writeLibrary } = await import('/storage.js');
      const current = await readLibrary(); current.data.videos.find(v => v.id === id).title = '合成另一分頁版本';
      await writeLibrary(current.data, current.revision);
    }, take.referenceVideoId);
    await restored.locator('#copy-self').click(); await idle();
    assert((await restored.locator('#status').textContent()).includes('另一分頁'), '舊 revision 未被拒絕');
    const after = await library();
    assert(after.videos.find(v => v.id === take.referenceVideoId).title === '合成另一分頁版本', '舊頁覆寫新版本');
    assert(await restored.evaluate(async id => !(await (await import('/storage.js')).readMedia(id)), take.cameraAssetId), '衝突交易部分寫入影片');
    Object.assign(checks, { restoresInFreshContext: true, jsonHasNoMedia: true, reimportIdempotent: true, futureVersionAtomicRejection: true, explicitTwoSideRelink: true, quotaRollbackPreservesFile: true, realTabConflictPreservesNewerData: true });
    return checks;
  } finally { await context.close(); }
}
