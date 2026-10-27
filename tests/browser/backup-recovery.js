/* 檔案用途：在全新資料環境還原筆記並逐側重連三類影片。所在層：Web 備份恢復驗收。主要關聯：backup-conflicts.js、MEDIA_PROBE.md。 */
async (page) => {
  const origin = new URL(page.url()).origin, context = await page.context().browser().newContext(), current = await context.newPage();
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => current.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const snapshot = () => current.evaluate(async () => await (await import('/storage.js')).readLibrary());
  const keys = () => current.evaluate(async () => await (await import('/storage.js')).readMediaKeys());
  const row = id => current.locator('#media-items li[data-asset-id="' + id + '"]');
  const availability = async (id, value) => current.waitForFunction(({ id, value }) => document.querySelector('#media-items li[data-asset-id="' + id + '"]')?.dataset.availability === value, { id, value });
  const select = async file => { await current.locator('#relink-file').setInputFiles(file); await idle(); };
  const confirm = async copy => { await current.locator('#relink-checked').check(); await current.locator('#relink-save').setChecked(copy); await current.locator('#relink-confirm').click(); await idle(); };
  await context.addInitScript(() => { window.confirm = () => true; Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); });
  try {
    await current.goto(origin); await idle(); assert((await snapshot()).data.videos.length === 0 && (await keys()).length === 0, '不是全新隔離資料集');
    await current.locator('#restore').setInputFiles('output/media-probe/backup12-original.json'); await idle();
    assert((await snapshot()).data.videos.length === 0, '預覽前就還原');
    await current.locator('#import-confirm').click(); await idle();
    const restored = await snapshot(), data = restored.data, video = data.videos[0], take = data.takes.at(-1), recipe = data.recipes.find(r => r.takeId === take.id), artifact = data.exports.find(e => e.recipeId === recipe.id);
    const reference = data.assets.find(a => a.kind === 'reference' && a.videoId === video.id), self = data.assets.find(a => a.id === take.cameraAssetId), vs = data.assets.find(a => a.id === artifact.assetId);
    assert((await keys()).length === 0 && data.assets.every(a => a.state === 'missing'), 'JSON 偷帶影片或假裝副本已存在');
    assert(take.referenceStartMs === 12000 && take.referenceEndMs === 17000 && recipe.offsetMs === 4000 && recipe.referenceMirror && !recipe.selfMirror, 'JSON 往返遺失映射／鏡像');
    assert(data.markers[0].note.includes('<img') && !await current.locator('#markers img').count(), '還原後筆記被當 HTML');
    await availability(reference.id, 'missing');
    await row(reference.id).getByRole('button', { name: '選片並預覽重連', exact: true }).click(); await idle();
    await select({ name: 'synthetic-broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('invalid synthetic media') });
    assert(await current.locator('#relink-confirm').isDisabled() && JSON.stringify(await snapshot()) === JSON.stringify(restored), '壞檔改掉筆記或可確認');
    // 檔名相同的裁切片只能預覽，未涵蓋 B 時不得當成老師原片。
    await select('output/media-probe/short/reference.mp4'); await current.locator('#relink-checked').check();
    assert(await current.locator('#relink-confirm').isDisabled() && (await current.locator('#relink-summary').textContent()).includes('短於既有比較'), '同名短片誤連到完整比較');
    await current.keyboard.press('Escape'); assert(JSON.stringify(await snapshot()) === JSON.stringify(restored), '取消短片重連改掉資料');
    await row(reference.id).getByRole('button', { name: '選片並預覽重連', exact: true }).click(); await idle();
    await select('output/comparison/reference.mp4');
    assert(await current.locator('#relink-confirm').isDisabled() && !await current.locator('#relink-save').isChecked() && (await keys()).length === 0, '未人工確認或暗中保存原片');
    await confirm(false); await availability(reference.id, 'session'); assert((await keys()).length === 0, '只連結卻保存示範');
    await current.locator('#library').selectOption(video.id); await current.locator('#open-library').click(); await idle();
    const beforeSelf = await current.locator('#reference').getAttribute('src');
    await row(self.id).getByRole('button', { name: '選片並預覽重連', exact: true }).click(); await idle(); await select('output/comparison/self-1.mp4'); await confirm(false); await availability(self.id, 'session');
    assert(await current.locator('#reference').getAttribute('src') === beforeSelf && (await keys()).length === 0, '重連自己片破壞示範或暗中落盤');
    const takeIndex = data.takes.filter(t => t.referenceVideoId === video.id).findIndex(t => t.id === take.id);
    await current.getByRole('button', { name: '開啟自拍／恢復', exact: true }).nth(takeIndex).click(); await idle();
    await current.locator('#scrub').fill('2'); await current.locator('#scrub').dispatchEvent('change'); await idle();
    const positions = await current.evaluate(() => [document.getElementById('reference').currentTime, document.getElementById('self').currentTime]);
    assert(Math.abs(positions[0] - 14) < 0.05 && Math.abs(positions[1] - 6) < 0.05, '重連後共同定位不是原 12／4 映射');
    const pairBeforeVs = await current.evaluate(() => ['reference', 'self'].map(id => ({ src: document.getElementById(id).src, time: document.getElementById(id).currentTime })));
    await row(vs.id).getByRole('button', { name: '選片並預覽重連', exact: true }).click(); await idle(); await select('output/media-probe/backup12-generated-vs.mp4');
    await current.locator('#relink-checked').check(); await current.locator('#relink-save').check();
    const beforeQuota = await snapshot();
    await current.evaluate(() => { window.recoveryPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { if (this.name === 'media') throw new DOMException('synthetic relink quota', 'QuotaExceededError'); return window.recoveryPut.apply(this, args); }; });
    await current.locator('#relink-confirm').click(); await idle();
    assert(await current.locator('#media-dialog').evaluate(d => d.open) && JSON.stringify(await snapshot()) === JSON.stringify(beforeQuota) && (await keys()).length === 0, '重連 quota 沒有原子回滾或丟候選');
    await current.evaluate(() => { IDBObjectStore.prototype.put = window.recoveryPut; });
    await current.locator('#relink-confirm').click(); await idle(); await availability(vs.id, 'stored');
    assert(JSON.stringify(await current.evaluate(() => ['reference', 'self'].map(id => ({ src: document.getElementById(id).src, time: document.getElementById(id).currentTime })))) === JSON.stringify(pairBeforeVs), '連結 VS 替換了比較原片');
    const downloading = current.waitForEvent('download'); await row(vs.id).getByRole('button', { name: '另存影片檔', exact: true }).click(); await (await downloading).saveAs('output/media-probe/backup12-restored-vs.mp4'); await idle();
    for (const asset of [reference, self]) { await row(asset.id).getByRole('button', { name: '保存瀏覽器副本', exact: true }).click(); await idle(); await availability(asset.id, 'stored'); }
    assert((await keys()).length === 3, '明確保存後三類媒體沒有全數存在');
    await current.reload(); await idle(); await current.locator('#library').selectOption(video.id); await current.locator('#open-library').click(); await idle();
    await current.getByRole('button', { name: '開啟自拍／恢復', exact: true }).nth(takeIndex).click(); await idle();
    assert(Number(await current.locator('#start').inputValue()) === 12 && Number(await current.locator('#end').inputValue()) === 17 && Number(await current.locator('#offset').inputValue()) === 4 && await current.locator('#reference-mirror').isChecked() && !await current.locator('#self-mirror').isChecked(), '保存副本重開後配方不同');
    const after = await snapshot();
    const descriptorsSame = await current.evaluate(async ({ before, after }) => JSON.stringify((await import('/library.js')).validateBackup(before).assets) === JSON.stringify((await import('/library.js')).validateBackup(after).assets), { before: data, after: after.data });
    assert(descriptorsSame, '重連相同原檔抹掉容器或 codec 描述');
    assert(JSON.stringify(after.data.markers) === JSON.stringify(data.markers) && JSON.stringify(after.data.recipes) === JSON.stringify(data.recipes) && JSON.stringify(after.data.takes) === JSON.stringify(data.takes), '恢復演練改掉筆記或配方');
    await current.setViewportSize({ width: 390, height: 844 }); await current.locator('#media-inventory').evaluate(d => { d.open = true; });
    assert(await current.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), '媒體清單窄版溢出');
    await current.screenshot({ path: 'output/backup12-inventory.png', fullPage: true });
    return { freshContextHasNoMedia: true, mappingAndMirrorsRoundTrip: true, invalidAndSameNameCutClipRejected: true, previewAndConfirmationRequired: true, defaultRelinkSessionOnly: true, threeKindsLinked: true, relinkQuotaAtomicWithRetry: true, vsDoesNotReplaceOriginals: true, explicitCopiesReopen: true, notesAndRecipesUnchanged: true, narrowLayout: true, restoredVsDownloaded: true };
  } finally { await context.close(); }
}
