/* 檔案用途：自拍換片失敗後仍能修改原配方。所在層：媒體回歸。主要關聯：media-probe.js、main.js。 */
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  // 僅合成測片，自動同意重選提示，讓回歸可核對失敗後的原配方。
  await page.evaluate(() => { window.confirm = () => true; });
  const before = await page.locator('#self').getAttribute('src');
  const takeId = await page.evaluate(async () => {
    const { data } = await (await import('/storage.js')).readLibrary();
    return data.takes.find(t => t.referenceVideoId === document.getElementById('library').value && t.state === 'ready').id;
  });
  // 正式入口已直接顯示；不再依賴原本收在測片選單內的控制。
  for (const file of ['empty/reference.mp4', 'player/corrupt.mp4']) {
    await page.locator('#self-file').setInputFiles(`output/media-probe/${file}`);
    await page.waitForFunction(() => !document.getElementById('controls').disabled);
    assert(await page.locator('#self').getAttribute('src') === before, '自拍換片失敗丟失原片');
    assert(await page.evaluate(() => !document.getElementById('compare').disabled), '自拍換片失敗讓原比較不可用');
  }
  await page.getByLabel('自拍偏移（秒）', { exact: true }).fill('0.05');
  await page.getByLabel('自拍偏移（秒）', { exact: true }).press('Tab');
  await page.waitForFunction(async id => {
    const { data } = await (await import('/storage.js')).readLibrary();
    return data.recipes.find(r => r.takeId === id).offsetMs === 50;
  }, takeId);
  return { failedSelfReplacementPreservesDecodedMedia: true, comparisonStillUsable: true, recipeStillBoundAndSaved: true };
}
