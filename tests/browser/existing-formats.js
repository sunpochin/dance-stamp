/* 檔案用途：重現可播原片因 MIME／副檔名造成確認半完成的問題。所在層：雙片格式回歸。主要關聯：normalizedVideo、existing-comparison.js。 */
async (page) => {
  const origin = new URL(page.url()).origin, idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled), results = [];
  await page.goto(origin);
  for (const file of ['renamed.data', 'sample.mov']) {
    await page.locator('#compare-existing').click(); await idle();
    await page.locator('#pair-reference-file').setInputFiles('output/comparison-fixtures/teacher.mp4'); await idle();
    await page.locator('#pair-self-file').setInputFiles(`output/media-probe/player/${file}`); await idle();
    await page.locator('#pair-b').fill('1'); await page.locator('#pair-reference-ok').check(); await page.locator('#pair-self-ok').check();
    await page.locator('#pair-confirm').click(); await idle();
    const result = await page.evaluate(async () => {
      const { data } = await (await import('/storage.js')).readLibrary(), take = data.takes.at(-1), asset = data.assets.find(a => a.id === take.cameraAssetId), link = document.getElementById('take-download');
      return { dialogClosed: !document.getElementById('pair-dialog').open, takeCount: data.takes.length, mime: asset.mimeType, downloadName: link.download, playable: document.getElementById('self').readyState >= 2 };
    });
    if (!result.dialogClosed || !result.playable || !/\.(mp4|mov)$/.test(result.downloadName)) throw new Error(JSON.stringify(result));
    results.push({ file, ...result });
  }
  return results;
}
