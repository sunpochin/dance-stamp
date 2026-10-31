/* 檔案用途：以合成色條與影格碼驗證疊影混色、共同定位及舊 VS 保全。所在層：瀏覽器回歸。主要關聯：main.js、make-comparison-fixtures.ts。 */
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const change = async (id, value) => { await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); await idle(); };
  const opacity = async value => { await page.locator('#overlay-opacity').fill(String(value)); await page.locator('#overlay-opacity').dispatchEvent('input'); };
  const sample = () => page.locator('#overlay-canvas').evaluate(c => [...c.getContext('2d').getImageData(100, 480, 1, 1).data].slice(0, 3));
  const signature = () => page.locator('#overlay-canvas').evaluate(c => {
    const pixels = c.getContext('2d').getImageData(0, 100, 900, 230).data;
    let sum = 0; for (let i = 0; i < pixels.length; i += 20) sum = (sum + pixels[i] * i) % 2147483647;
    return sum;
  });
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('疊影測試禁止相機／麥克風'); }; window.confirm = () => true; });
  await page.goto(origin); await idle();
  assert(await page.locator('#overlay-canvas').isHidden() && await page.locator('#overlay-play').isDisabled(), '缺片仍能播放疊影');
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  // 新選片預設全長；此比較案例明確選 15 秒，保留原本的媒體護欄與測試範圍。
  await page.locator('#end').fill('15');
  assert(await page.locator('#overlay-canvas').isHidden(), '只有老師片仍顯示舊疊影');
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  await change('start', '12'); await change('end', '15'); await change('offset', '4');
  assert(await page.locator('#overlay-canvas').isVisible(), '兩片載入未顯示疊影');
  for (const teacher of [false, true]) for (const own of [false, true]) {
    await page.locator('#reference-mirror').setChecked(teacher); await idle();
    await page.locator('#self-mirror').setChecked(own); await idle();
    // 合成測片左紅右藍，先核對兩端，再用線性混色檢查半透明，避免把 CSS 外觀當像素證據。
    await opacity(0); const ownPixel = await sample();
    await opacity(100); const teacherPixel = await sample();
    for (const [rgb, mirrored] of [[ownPixel, own], [teacherPixel, teacher]]) {
      assert(rgb[mirrored ? 2 : 0] > 200 && rgb[mirrored ? 0 : 2] < 30, '疊影鏡像或 0/100% 圖層錯誤');
    }
    await opacity(50); const mixed = await sample();
    assert(mixed.every((v, i) => Math.abs(v - (ownPixel[i] + teacherPixel[i]) / 2) < 3), '50% 未正確混色');
  }
  const stored = () => page.evaluate(async () => JSON.stringify(await (await import('/storage.js')).readLibrary()));
  const before = await stored(), oldSide = await page.locator('#canvas').evaluate(c => c.toDataURL());
  await opacity(20); await opacity(80);
  assert(await stored() === before && await page.locator('#canvas').evaluate(c => c.toDataURL()) === oldSide, '調透明度改了配方或左右輸出');
  await opacity(50);
  const timing = [];
  for (const rate of [0.5, 0.75, 1]) {
    await page.locator('#rate').selectOption(String(rate)); await idle();
    await change('end', String(12 + rate * 3));
    await change('scrub', '1.25');
    const times = await page.evaluate(() => ({ reference: document.getElementById('reference').currentTime, self: document.getElementById('self').currentTime }));
    assert(Math.abs(times.reference - (12 + rate * 1.25)) < 0.05 && Math.abs(times.self - 5.25) < 0.05, '共同定位未沿用比例與 offset');
    const first = await signature();
    await page.locator('#overlay-play').click();
    await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden);
    assert(await page.locator('#overlay-opacity').isEnabled() && await page.locator('#pause-comparison').isEnabled(), '預覽時無法調透明度或暫停');
    await opacity(40); await opacity(50);
    await page.waitForTimeout(350);
    assert(await signature() !== first, '播放期間疊影像素未更新');
    await page.locator('#pause-comparison').click(); await idle();
    const frozen = await signature(); await page.waitForTimeout(150);
    assert(await signature() === frozen && await page.locator('#reference').evaluate(v => v.paused) && await page.locator('#self').evaluate(v => v.paused), '一起暫停後畫面仍在變');
    timing.push({ rate, ...times });
  }
  await change('offset', '-0.2'); await change('scrub', '1');
  const negative = await page.evaluate(() => [document.getElementById('reference').currentTime, document.getElementById('self').currentTime]);
  assert(Math.abs(negative[0] - 13.2) < 0.05 && Math.abs(negative[1] - 1) < 0.05, '負偏移未沿用合法交集');
  await change('offset', '1000');
  assert(await page.locator('#overlay-canvas').isHidden() && await page.locator('#overlay-play').isDisabled() && await page.locator('#play').isDisabled(), '無交集仍能播放比較');
  await change('offset', '4');
  await page.locator('#overlay-play').click(); await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden);
  await page.locator('#stop').click(); await idle();
  assert(await page.locator('#overlay-play').isEnabled() && await page.locator('#pause-comparison').isHidden(), '停止後不能重試');
  // 真正下載舊有 VS，驗證額外畫布沒有取代錄製來源；長片品質仍由既有媒體矩陣驗收。
  await page.locator('#export').click();
  await page.waitForTimeout(800);
  assert(await page.locator('#overlay-opacity').isDisabled(), 'VS 合成時仍接受疊影操作');
  await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '原有 VS 無法成檔');
  const pending = page.waitForEvent('download'); await page.locator('#output-download').click(); const download = await pending;
  const path = 'output/playwright/overlay-vs.' + download.suggestedFilename().split('.').pop(); await download.saveAs(path);
  const previous = await page.locator('#output-download').getAttribute('href');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '疊影窄版水平溢出');
  }
  await page.locator('#overlay-opacity').focus(); await page.keyboard.press('ArrowRight');
  assert(await page.locator('#overlay-opacity').inputValue() === '51', '透明度無法鍵盤操作');
  await page.locator('#reference-mirror').setChecked(false); await idle();
  await page.locator('section[aria-labelledby="overlay-title"]').screenshot({ path: 'output/playwright/overlay-comparison.png' });
  await page.locator('#camera-tools').evaluate(el => { el.open = true; });
  await page.locator('#new-take').click(); await idle();
  assert(await page.locator('#overlay-canvas').isHidden() && await page.locator('#overlay-play').isDisabled() && previous === await page.locator('#output-download').getAttribute('href'), '新 take 未清空疊影或破壞舊 VS');
  return { fourMirrorCombinations: true, alphaEndpointsAndMix: true, viewOnlySetting: true, timing, negativeOffset: true, invalidRange: true, playbackPauseStop: true, responsiveAndKeyboard: true, previousOutputPreserved: true, download: path };
}
