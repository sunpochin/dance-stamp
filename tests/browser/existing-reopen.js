/* 檔案用途：驗證三種速度／鏡像配方重開後不重複翻轉，及舊輸出標記。所在層：雙片合成回歸。主要關聯：existing-export.js、analyze-comparison.ts。 */
async (page) => {
  const origin = new URL(page.url()).origin, results = [], idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  await page.goto(origin);
  const original = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  for (const rate of [1, 0.75, 0.5]) {
    const take = original.takes.find(t => t.rate === rate && (t.referenceEndMs - t.referenceStartMs) / t.rate === 60000), recipe = original.recipes.find(r => r.takeId === take?.id);
    if (!take || !recipe) throw new Error('請先執行三種 60 秒 existing-export');
    await page.locator('#library').selectOption(take.referenceVideoId); await page.locator('#open-library').click(); await idle();
    await page.locator('#takes li').first().getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
    await page.locator('#pair-reference-file').setInputFiles('output/comparison-fixtures/teacher.mp4'); await idle();
    await page.locator('#pair-self-file').setInputFiles(`output/comparison-fixtures/own-${rate}.mp4`); await idle();
    await page.locator('#pair-reference-ok').check(); await page.locator('#pair-self-ok').check(); await page.locator('#pair-confirm').click(); await idle();
    await page.locator('#scrub').evaluate(input => { input.value = '1'; input.dispatchEvent(new Event('change')); }); await idle();
    const actual = await page.evaluate(recipe => {
      const canvas = document.getElementById('canvas'), pixels = canvas.getContext('2d').getImageData(0, 0, 1280, 720).data;
      const read = (side, mirror) => { let n = 0; for (let bit = 0; bit < 12; bit++) { const x = side * 640 + (mirror ? 639 - (26 + bit * 24) : 26 + bit * 24), i = (546 * 1280 + x) * 4; if ((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 >= 180) n += 2 ** bit; } return n; };
      return { referenceMirror: document.getElementById('reference-mirror').checked, selfMirror: document.getElementById('self-mirror').checked, left: read(0, recipe.referenceMirror), right: read(1, recipe.selfMirror) };
    }, recipe);
    const expectedFrame = (take.referenceStartMs / 1000 + rate) * 30;
    if (actual.referenceMirror !== recipe.referenceMirror || actual.selfMirror !== recipe.selfMirror || Math.abs(actual.left - expectedFrame) > 1 || Math.abs(actual.right - expectedFrame) > 1) throw new Error(`重開時間／鏡像錯誤：${JSON.stringify({ rate, actual, expectedFrame })}`);
    const after = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
    if (after.takes.length !== original.takes.length || JSON.stringify(after.recipes) !== JSON.stringify(original.recipes)) throw new Error('重連改寫配方或建立假工作');
    results.push({ rate, ...actual });
  }
  const href = await page.locator('#output-download').getAttribute('href');
  await page.locator('#takes li').first().getByRole('button', { name: '下載已存 VS', exact: true }).click(); await idle();
  const savedHref = await page.locator('#output-download').getAttribute('href');
  await page.locator('[data-offset-step="10"]').click(); await idle();
  if (!(await page.locator('#output-download').textContent()).includes('不是目前配方') || await page.locator('#output-download').getAttribute('href') !== savedHref || !await page.getByRole('button', { name: '下載舊配方 VS（不是目前配方）', exact: true }).isVisible()) throw new Error('修改配方後舊輸出未保留或未標舊');
  return { reopened: results, oldOutputPreservedAndMarkedStale: true, previousOutputHref: Boolean(href) };
}
