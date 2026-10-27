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
  await page.getByText('已有自拍原片？', { exact: true }).click();
  for (const file of ['empty/reference.mp4', 'player/corrupt.mp4']) {
    await page.locator('#self-file').setInputFiles(`output/media-probe/${file}`);
    await page.waitForFunction(() => !document.getElementById('controls').disabled);
    assert(await page.locator('#self').getAttribute('src') === before, '自拍換片失敗丟失原片');
    assert(await page.evaluate(() => !document.getElementById('compare').disabled), '自拍換片失敗讓原比較不可用');
  }
  await page.getByLabel('自拍偏移（秒）', { exact: true }).fill('0.05');
  await page.getByLabel('自拍偏移（秒）', { exact: true }).press('Tab');
  // 操作結束後再讀實際資料；不能把非同步 predicate 的 Promise 當成保存成功。
  await page.waitForFunction(() => !document.getElementById('controls').disabled);
  const saved = await page.evaluate(async id => {
    const { data } = await (await import('/storage.js')).readLibrary();
    return data.recipes.find(r => r.takeId === id).offsetMs === 50;
  }, takeId);
  assert(saved, '舊自拍的校正沒有保存到原配方');
  return { failedSelfReplacementPreservesDecodedMedia: true, comparisonStillUsable: true, recipeStillBoundAndSaved: true };
}
