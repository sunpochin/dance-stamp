/* 檔案用途：核對真實合成 take 與配方重開後仍可取回。所在層：本機媒體保存回歸。主要關聯：media-probe.js、storage.js。 */
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const before = await page.evaluate(async () => {
    const { readLibrary, readMedia } = await import('/storage.js');
    const { data } = await readLibrary();
    for (const take of data.takes.filter(t => t.state === 'ready')) {
      const blob = await readMedia(take.cameraAssetId);
      const recipe = data.recipes.find(r => r.takeId === take.id);
      if (blob && recipe) return { take, recipe, bytes: blob.size };
    }
    throw new Error('請先跑 media-probe.js，產生已驗證的合成自拍。');
  });
  await page.reload();
  await page.getByRole('combobox', { name: '已保存的筆記', exact: true }).selectOption(before.take.referenceVideoId);
  await page.getByRole('button', { name: '開啟筆記／重連影片', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('controls').disabled);
  const missing = await page.locator('#reference').evaluate(video => !video.getAttribute('src'));
  if (missing) {
    await page.getByLabel('示範影片', { exact: true }).setInputFiles('output/media-probe/reference.mp4');
    await page.getByRole('button', { name: '已預覽，確認連結到這份筆記', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('controls').disabled);
  }
  await page.getByRole('button', { name: '開啟自拍／恢復', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('compare').disabled);
  const after = await page.evaluate(async id => {
    const { readLibrary, readMedia } = await import('/storage.js');
    const { data } = await readLibrary();
    const take = data.takes.find(t => t.id === id), recipe = data.recipes.find(r => r.takeId === id);
    const blob = await readMedia(take.cameraAssetId);
    return { take, recipe, bytes: blob.size, decoded: document.getElementById('self').videoWidth > 0, offset: Number(document.getElementById('offset').value) * 1000 };
  }, before.take.id);
  assert(JSON.stringify(after.take) === JSON.stringify(before.take), '重開改變自拍記錄');
  assert(JSON.stringify(after.recipe) === JSON.stringify(before.recipe), '重開改變比較配方');
  assert(after.bytes === before.bytes && after.decoded && after.offset === before.recipe.offsetMs, '自拍未讀回或校正未還原');
  return { takeSurvivesReload: true, recipeSurvivesReload: true, originalMediaDecodesAfterReload: true };
}
