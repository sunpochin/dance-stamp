/* 檔案用途：驗可調並排的獨立位置、邊界與觀看生命週期。所在層：預設介面瀏覽器回歸。主要關聯：main.js、comparison-overlay-layout.js、overlay-export.js。 */
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const set = async (id, value, event = 'input') => { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).dispatchEvent(event); if (event === 'change') await idle(); };
  const fields = ['reference', 'self'].flatMap(side => ['scale', 'x', 'y'].map(key => 'adjusted-' + side + '-' + key));
  const values = () => Promise.all(fields.map(id => page.locator('#' + id).inputValue()));
  const signature = (id = 'adjusted-side-canvas') => page.locator('#' + id).evaluate(c => c.toDataURL());
  const originalDifference = () => page.evaluate(() => {
    const pixels = id => document.getElementById(id).getContext('2d').getImageData(0, 0, 1280, 720).data;
    const original = pixels('canvas'), adjusted = pixels('adjusted-side-canvas');
    return original.reduce((max, value, i) => Math.max(max, Math.abs(value - adjusted[i])), 0);
  });
  const half = (side, capture = false) => page.locator('#adjusted-side-canvas').evaluate((c, { side, capture }) => {
    const pixels = c.getContext('2d').getImageData(side * 640, 48, 640, 672).data;
    if (capture) { window.adjustedHalfBefore = pixels; return; }
    return pixels.reduce((result, value, i) => { const difference = Math.abs(value - window.adjustedHalfBefore[i]); result.max = Math.max(result.max, difference); result.sum += difference; result.changed += difference > 0 ? 1 : 0; return result; }, { max: 0, sum: 0, changed: 0 });
  }, { side, capture });
  const pixel = (x, y, id = 'adjusted-side-canvas') => page.locator('#' + id).evaluate((c, p) => [...c.getContext('2d').getImageData(...p, 1, 1).data].slice(0, 3), [x, y]);
  const red = p => p[0] > 200 && p[2] < 30, blue = p => p[2] > 200 && p[0] < 30, dark = p => p.every(v => v < 25);
  const stored = () => page.evaluate(async () => JSON.stringify(await (await import('/storage.js')).readLibrary()));
  const reset = () => page.locator('#adjusted-side-reset').click();
  await page.addInitScript(() => {
    window.confirm = () => true;
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('可調並排測試只用合成檔，不開相機或麥克風'); };
  });
  await page.goto(origin); await idle();
  assert(await page.locator('body').getAttribute('data-comparison-only') !== null, '沒有測到預設介面');
  const videoCount = await page.locator('video').count();
  assert(await page.locator('#adjusted-reference-scale').isDisabled() && await page.locator('#adjusted-side-canvas').isHidden(), '缺片仍能試看');
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  // 新選片預設完整長度；先明確選本例的短段，保留原本的比較護欄。
  await set('end', 15, 'change');
  assert(await page.locator('#adjusted-self-x').isDisabled(), '單片就開放調整');
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  await set('start', 12, 'change'); await set('end', 15, 'change'); await set('offset', 4, 'change');
  assert(await page.locator('#adjusted-side-canvas').isVisible() && await originalDifference() <= 2, '初始畫面未保留原並排');
  await set('overlay-reference-scale', 120);
  for (const [side, index] of [['reference', 0], ['self', 1]]) {
    await reset();
    await page.locator('#reference-mirror').setChecked(false); await idle();
    await page.locator('#self-mirror').setChecked(false); await idle();
    const before = await stored(), sideBefore = await signature('canvas'), overlayBefore = await signature('overlay-canvas'), x = index * 640;
    await half(1 - index, true);
    await set('adjusted-' + side + '-scale', 50);
    assert(red(await pixel(x + 180, 450)) && dark(await pixel(x + 50, 450)), side + ' 縮小沒有保持圖片中心');
    await set('adjusted-' + side + '-x', 25);
    assert(red(await pixel(x + 350, 450)) && dark(await pixel(x + 180, 450)), side + ' 水平移動不符');
    assert(await stored() === before && await signature('canvas') === sideBefore && await signature('overlay-canvas') === overlayBefore, '試看改了配方或其他兩框');
    await page.locator('#' + side + '-mirror').setChecked(true); await idle();
    assert(blue(await pixel(x + 350, 450)) && dark(await pixel(x + 180, 450)), side + ' 鏡像反轉了移動方向');
    await set('adjusted-' + side + '-y', 25);
    assert(blue(await pixel(x + 350, 620)) && dark(await pixel(x + 350, 450)), side + ' 向下移動不符');
    await set('adjusted-' + side + '-y', -25);
    assert(blue(await pixel(x + 350, 290)), side + ' 向上移動不符');
    await set('adjusted-' + side + '-scale', 400); await set('adjusted-' + side + '-x', index === 0 ? 200 : -200);
    const otherDifference = await half(1 - index);
    // 原生影片重畫只有零星一階捨入；逐 channel 限 1，任何明顯跨框像素仍會失敗。
    assert(otherDifference.max <= 1, '畫面跨過中線污染另一側：' + JSON.stringify(otherDifference));
    await set('adjusted-' + side + '-scale', 25); await reset();
  }
  await page.locator('#reference-mirror').setChecked(false); await idle();
  await page.locator('#self-mirror').setChecked(false); await idle();
  await reset(); await set('scrub', 0, 'change');
  const frozen = await signature();
  await page.locator('#play').click(); await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden);
  assert(await page.locator('#adjusted-reference-x').isEnabled(), '共同播放時不能調整');
  await page.waitForTimeout(200); assert(await signature() !== frozen, '新框沒有沿共同時間線更新');
  await set('adjusted-reference-x', 5);
  await page.locator('#pause-comparison').click(); await idle();
  const paused = await signature(); await page.waitForTimeout(150); assert(await signature() === paused, '一起暫停後試看還在動');
  await set('adjusted-reference-scale', 160); const preserved = await values();
  await set('scrub', 1, 'change'); assert(JSON.stringify(await values()) === JSON.stringify(preserved), '共同定位丟掉調整');
  await page.locator('#self-file').setInputFiles({ name: 'synthetic-invalid.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic-invalid-video') }); await idle();
  await page.locator('#self-file').setInputFiles([]); await idle();
  assert(JSON.stringify(await values()) === JSON.stringify(preserved), '壞檔或取消清掉調整');
  await set('offset', 1000, 'change');
  assert(await page.locator('#adjusted-side-canvas').isHidden() && await page.locator('#adjusted-reference-scale').isDisabled(), '空交集仍開放試看');
  await set('offset', 4, 'change');
  await set('adjusted-reference-scale', 400); await set('adjusted-reference-x', 200);
  await page.locator('#export').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('合成中'));
  assert(await page.locator('#adjusted-reference-x').isDisabled(), '匯出期間仍能調整');
  const exporting = await signature(); await page.waitForTimeout(150); assert(await signature() === exporting, '逐幀合成仍重畫試看框');
  await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '原並排無法成檔');
  await page.locator('#output').evaluate(async video => { if (video.readyState < 2) await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true })); await new Promise(resolve => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = 0.7; }); });
  const exported = await page.locator('#output').evaluate(video => { const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const ctx = c.getContext('2d'); ctx.drawImage(video, 0, 0); return [40, 1220].map(x => [...ctx.getImageData(x, 530, 1, 1).data].slice(0, 3)); });
  assert(red(exported[0]) && blue(exported[1]), '試看設定污染真正左右成品');
  await page.locator('#self-file').setInputFiles('output/comparison/self-0.75.mp4'); await idle();
  assert(JSON.stringify(await values()) === JSON.stringify(['100', '0', '0', '100', '0', '0']), '成功換片未重設');
  await page.locator('#reference-file').setInputFiles('output/media-probe/player/portrait.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/media-probe/player/portrait.mp4'); await idle();
  await set('start', 0, 'change'); await set('end', 2, 'change'); await set('offset', 0, 'change');
  for (const mirror of [false, true]) {
    await page.locator('#reference-mirror').setChecked(mirror); await idle(); await page.locator('#self-mirror').setChecked(!mirror); await idle();
    // 置中變換與原本左上角原點的同圖繪製，沿用跟隨裁切的兩階色值界線。
    const difference = await originalDifference();
    assert(difference <= 2, '直式或鏡像的預設畫面與原並排不符：' + difference);
  }
  await page.locator('#adjusted-reference-x').focus(); await page.keyboard.press('ArrowRight');
  assert(await page.locator('#adjusted-reference-x').inputValue() === '0.5', '無法用鍵盤微調');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '可調並排撐破窄版');
    const controls = await page.locator('#adjusted-side-layout').boundingBox(), preview = await page.locator('.adjusted-side-preview').boundingBox();
    assert(width > 800 || controls.y < preview.y, '窄版控制排在試看框之後');
  }
  assert(await page.locator('video').count() === videoCount, '新框增加了播放器');
  await page.locator('[aria-labelledby="adjusted-side-title"]').screenshot({ path: 'output/playwright/adjusted-side-preview.png' });
  return { independentLayers: true, scaleAndTranslation: true, mirrorDirection: true, halfClipping: true, viewOnly: true, sharedClock: true, exportUnchanged: true, newSourceResets: true, failedAndCancelledSourcePreserves: true, keyboardAndResponsive: true };
}
