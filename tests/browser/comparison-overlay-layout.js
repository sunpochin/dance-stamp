/* 檔案用途：用合成影片像素驗證疊影兩層的縮放、平移及設定保全。所在層：瀏覽器回歸。主要關聯：main.js、comparison-overlay.js、TECHNICAL.md 第 49 節。 */
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const set = async (id, value, event = 'input') => { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).dispatchEvent(event); if (event === 'change') await idle(); };
  const pixel = (x, y) => page.locator('#overlay-canvas').evaluate((c, [x, y]) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [x, y]);
  const red = rgb => rgb[0] > 200 && rgb[1] < 40 && rgb[2] < 40;
  const blue = rgb => rgb[2] > 200 && rgb[0] < 40 && rgb[1] < 40;
  const dark = rgb => rgb.every(v => v < 40);
  const white = rgb => rgb.every(v => v > 200);
  const fields = ['reference', 'self'].flatMap(side => ['scale', 'x', 'y'].map(axis => 'overlay-' + side + '-' + axis));
  const values = async () => Promise.all(fields.map(id => page.locator('#' + id).inputValue()));
  const reset = () => page.locator('#overlay-layout-reset').click();
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('位置測試禁止相機／麥克風'); }; window.confirm = () => true; });
  await page.goto(origin); await idle();
  assert(await page.locator('#overlay-reference-scale').isDisabled(), '缺片仍能調整');
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  await set('start', 12, 'change'); await set('end', 15, 'change'); await set('offset', 4, 'change');
  assert(JSON.stringify(await values()) === JSON.stringify(['100', '0', '0', '100', '0', '0']), '初值不是原尺寸置中');
  const stored = () => page.evaluate(async () => JSON.stringify(await (await import('/storage.js')).readLibrary()));
  const originalData = await stored(), sideBefore = await page.locator('#canvas').evaluate(c => c.toDataURL());
  for (const side of ['reference', 'self']) {
    await reset();
    const other = side === 'reference' ? 'self' : 'reference';
    await set('overlay-opacity', side === 'reference' ? 100 : 0);
    await set('overlay-' + other + '-x', 200);
    await set('overlay-' + side + '-scale', 50);
    // 960×540 的半尺寸圖應在 x240..720、y135..405；下緣色條用來驗實際幾何位置。
    assert(red(await pixel(260, 380)) && dark(await pixel(100, 480)), side + ' 未從中心縮小');
    await set('overlay-' + side + '-x', 25); await set('overlay-' + side + '-y', -25);
    assert(red(await pixel(500, 250)) && dark(await pixel(260, 250)), side + ' X／Y 位移不符');
    const mirror = side + '-mirror'; await page.locator('#' + mirror).setChecked(true); await idle();
    assert(blue(await pixel(500, 250)) && dark(await pixel(260, 250)), side + ' 鏡像把平移方向反轉');
    await set('overlay-' + side + '-y', 25);
    assert(blue(await pixel(500, 520)) && dark(await pixel(500, 250)), side + ' 向下移動不符');
    await page.locator('#' + mirror).setChecked(false); await idle();
    await set('overlay-' + side + '-x', 0); await set('overlay-' + side + '-y', 0); await set('overlay-' + side + '-scale', 200);
    // 來源第 360 格的 bit8 白條，2× 後落在 x720..828、y30..330，與原尺寸的空白區不同。
    assert(white(await pixel(800, 100)), side + ' 放大沒有保持中心座標');
    await set('overlay-' + side + '-scale', 25);
    assert(red(await pixel(380, 325)) && dark(await pixel(260, 380)), side + ' 最小縮放未生效');
    await set('overlay-' + side + '-scale', 400); await set('overlay-' + side + '-x', -200);
    await set('overlay-' + side + '-x', 200); await reset();
  }
  await set('overlay-reference-scale', 180); await set('overlay-reference-x', 12.5); await set('overlay-reference-y', -10);
  await set('overlay-self-scale', 80); await set('overlay-self-x', -5); await set('overlay-opacity', 35);
  const adjusted = await values();
  assert(await stored() !== '', '資料庫不可讀');
  // 鏡像本來就要保存 recipe；此處另取調整前後快照，空間滑桿則不能再產生寫入。
  const beforeViewChange = await stored(); await set('overlay-reference-x', 13); await set('overlay-reference-x', 12.5);
  assert(await stored() === beforeViewChange && await page.locator('#canvas').evaluate(c => c.toDataURL()) === sideBefore, '空間調整改動資料或左右輸出');
  await set('scrub', 1, 'change');
  assert(JSON.stringify(await values()) === JSON.stringify(adjusted), '共同定位重設空間設定');
  await page.locator('#overlay-play').click(); await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden);
  assert(await page.locator('#overlay-reference-scale').isEnabled(), '共同播放無法調空間');
  await set('overlay-reference-x', 15); await page.locator('#overlay-pause').click(); await idle();
  await set('overlay-reference-x', 12.5);
  await reset();
  assert(JSON.stringify(await values()) === JSON.stringify(['100', '0', '0', '100', '0', '0']) && await page.locator('#overlay-opacity').inputValue() === '35', '重設未回預設或改了透明度');
  await set('overlay-reference-scale', 160); await set('overlay-reference-x', 20);
  const preserved = await values(), teacher = await page.locator('#reference').getAttribute('src');
  await page.locator('#export').click(); await page.waitForTimeout(500);
  assert(await page.locator('#overlay-reference-scale').isDisabled(), '匯出期間仍接受空間調整');
  await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔') && JSON.stringify(await values()) === JSON.stringify(preserved), '匯出失敗或重設了觀看位置');
  const pending = page.waitForEvent('download'); await page.locator('#output-download').click(); const download = await pending;
  const path = 'output/playwright/layout-vs.' + download.suggestedFilename().split('.').pop(); await download.saveAs(path);
  await page.locator('#self-file').setInputFiles({ name: 'synthetic-invalid.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic-invalid-video') }); await idle();
  assert(JSON.stringify(await values()) === JSON.stringify(preserved) && await page.locator('#reference').getAttribute('src') === teacher, '壞檔丟掉對齊或老師片');
  await page.locator('#self-file').setInputFiles([]); await idle();
  assert(JSON.stringify(await values()) === JSON.stringify(preserved), '取消選片丟掉對齊');
  await page.locator('#self-file').setInputFiles('output/comparison/self-0.75.mp4'); await idle();
  assert(JSON.stringify(await values()) === JSON.stringify(['100', '0', '0', '100', '0', '0']), '成功換片沿用舊對齊');
  await page.locator('#overlay-reference-x').focus(); await page.keyboard.press('ArrowRight');
  assert(await page.locator('#overlay-reference-x').inputValue() === '0.5', '位置無法鍵盤細調');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '大小／位置控制撐破窄版');
  }
  await page.locator('section[aria-labelledby="overlay-title"]').screenshot({ path: 'output/playwright/overlay-layout.png' });
  return { bothLayers: true, centerScale: true, screenSpaceTranslation: true, mirrorDirection: true, rangeLimits: true, viewOnly: true, previewPause: true, resetKeepsOpacity: true, badFileAndCancelPreserve: true, newSourceResets: true, keyboardAndResponsive: true, originalDataReadable: !!originalData, unmodifiedVSExport: path };
}
