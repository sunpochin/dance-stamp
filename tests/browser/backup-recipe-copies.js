/* 檔案用途：驗證衝突校正可逐份開啟、編輯、重匯與輸出。所在層：合成備份回歸。主要關聯：library.js、backup-conflicts.js。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const change = async (id, value) => { await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); await idle(); };
  await page.addInitScript(() => { window.confirm = () => true; navigator.mediaDevices.getUserMedia = async () => { throw new Error('此回歸禁止相機'); }; });
  await page.goto(origin); await idle();
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#copy-reference').click(); await idle();
  await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await change('end', '2'); await page.locator('#copy-self').click(); await idle();
  const original = await library(), take = original.takes.at(-1), recipe = original.recipes.find(r => r.takeId === take.id);
  const restore = async offsetMs => {
    const incoming = structuredClone(original), row = incoming.recipes.find(r => r.id === recipe.id); row.offsetMs = offsetMs; row.revision++;
    await page.locator('#restore').setInputFiles({ name: 'synthetic-recipe.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) }); await idle();
    await page.locator('#import-confirm').click(); await idle();
    return library();
  };
  const open = async id => {
    const data = await library(), index = data.takes.filter(t => t.referenceVideoId === take.referenceVideoId).findIndex(t => t.id === id);
    await page.getByRole('button', { name: '開啟自拍／恢復', exact: true }).nth(index).click(); await idle();
  };
  const first = await restore(1000), copied = first.takes.find(t => !original.takes.some(old => old.id === t.id));
  assert(copied, '衝突校正沒有自己的可選 take');
  await open(copied.id); assert(Number(await page.locator('#offset').inputValue()) === 1, '衝突校正開成了舊配方');
  await change('offset', '1.25');
  const second = await restore(2000), another = second.takes.find(t => !first.takes.some(old => old.id === t.id));
  assert(another, '同一 take 的另一份備份沿用不可選的舊副本');
  await open(another.id); assert(Number(await page.locator('#offset').inputValue()) === 2, '另一份備份校正無法開啟');
  const third = await restore(1000), restored = third.takes.find(t => !second.takes.some(old => old.id === t.id));
  assert(restored, '副本被編輯後沒有保留可開啟的原備份校正');
  // 每個取用入口都實際重開；只看 JSON 有多一列不能證明使用者選得到。
  for (const [id, offset] of [[take.id, 0], [copied.id, 1.25], [another.id, 2], [restored.id, 1]]) {
    await open(id); assert(Number(await page.locator('#offset').inputValue()) === offset, '重開校正副本對錯 take');
  }
  const repeated = await restore(1000);
  assert(repeated.takes.length === third.takes.length && repeated.recipes.length === third.recipes.length, '重匯同一份備份持續新增副本');
  assert(JSON.stringify(repeated.recipes.find(r => r.id === recipe.id)) === JSON.stringify(recipe), '衝突匯入改寫原校正');
  await open(restored.id); await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔') && JSON.parse(await page.locator('#diagnostics').textContent()).export.recipe.offsetMs === 1000, '無法以衝突副本真正輸出');
  return { copiesAreSelectable: true, editedCopyPreserved: true, differentBackupVersionsStaySeparate: true, reimportIdempotent: true, restoredRecipeExports: true };
}
