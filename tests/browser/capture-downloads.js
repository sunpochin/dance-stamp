/* 檔案用途：下載九個合成原 take，供離站完整解碼。所在層：本機證據蒐集。主要關聯：capture-matrix.js、MEDIA_PROBE.md。 */
async (page, folder = 'captures') => {
  if (!/^[a-z0-9_-]+$/i.test(folder)) throw new Error('請使用合成證據資料夾名稱');
  const origin = new URL(page.url()).origin, idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  await page.goto(origin);
  await page.evaluate(() => { if (!window.__danceSyntheticCameraOnly) throw new Error('只允許合成資料'); window.confirm = () => true; });
  const videoId = await page.evaluate(() => sessionStorage.getItem('captureMatrixVideo'));
  if (!videoId) throw new Error('請先完成合成錄影矩陣');
  await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
  const takes = await page.evaluate(async id => {
    const data = (await (await import('/storage.js')).readLibrary()).data;
    return data.takes.filter(t => t.referenceVideoId === id).map(t => ({ state: t.state, rate: t.rate, seconds: (t.referenceEndMs - t.referenceStartMs) / t.rate / 1000 }));
  }, videoId);
  if (takes.length !== 9 || takes.some(t => t.state !== 'ready')) throw new Error('九個案例尚未全部完成');
  const files = [];
  for (let index = 0; index < takes.length; index++) {
    await page.locator('#takes li').nth(index).getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
    const waiting = page.waitForEvent('download'); await page.locator('#take-download').click();
    const download = await waiting, extension = download.suggestedFilename().split('.').at(-1);
    if (!['mp4', 'webm'].includes(extension)) throw new Error('下載副檔名不符真實候選格式');
    const file = `output/media-probe/${folder}/capture-${String(takes[index].rate).replace('.', '_')}-${takes[index].seconds}.${extension}`;
    await download.saveAs(file); files.push({ ...takes[index], file });
  }
  return files;
}
