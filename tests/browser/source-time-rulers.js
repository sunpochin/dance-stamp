/* 檔案用途：驗證雙側秒數尺定位、明確設起點及原資料保全。所在層：瀏覽器回歸。主要關聯：main.js、comparison-keyboard.js、WEB_PREVIEW.md。 */
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const data = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const locate = async (side, time) => {
    await page.locator('#' + side + '-seek').fill(String(time));
    await page.locator('#' + side + '-seek').dispatchEvent('input');
    await page.waitForFunction(({ side, time }) => { const v = document.getElementById(side); return !v.seeking && Math.abs(v.currentTime - time) < 0.02; }, { side, time });
  };
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('時間尺測試禁止相機與麥克風'); }; window.confirm = () => true; });
  await page.goto(origin); await idle();
  assert(await page.locator('#reference-seek').isDisabled() && await page.locator('#self-seek').isDisabled(), '缺片仍可拖動時間尺');
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  // 新選片預設全長；此比較案例明確選 15 秒，保留原本的媒體護欄與測試範圍。
  await page.locator('#end').fill('15');
  assert(await page.locator('#reference-seek').isEnabled() && await page.locator('#self-seek').isDisabled(), '兩側尺未各自按來源啟用');
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  assert((await page.locator('#reference-ruler').textContent()).includes('80 秒') && (await page.locator('#self-ruler').textContent()).includes('75 秒'), '刻度沒有顯示各自來源的秒數');
  const before = JSON.stringify(await data());
  await locate('reference', 12); await locate('self', 4);
  assert(JSON.stringify(await data()) === before, '拖尺偷改比較配方');
  assert((await page.locator('#reference-seek-time').textContent()).includes('12.000') && (await page.locator('#self-seek-time').textContent()).includes('4.000'), '目前秒數沒有跟畫面同步');
  await page.locator('#reference-seek').focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => !document.getElementById('reference').seeking && Math.abs(document.getElementById('reference').currentTime - 12.01) < 0.001);
  await page.locator('#reference-seek-buttons button[data-seek="0.1"]').click();
  await page.waitForFunction(() => !document.getElementById('reference').seeking && Math.abs(document.getElementById('reference').currentTime - 12.11) < 0.001);
  await locate('reference', 0); await page.locator('#reference-seek-buttons button[data-seek="-0.1"]').click();
  assert(await page.locator('#reference').evaluate(v => v.currentTime === 0), '微調超出片頭');
  await locate('reference', 80); await page.locator('#reference-seek-buttons button[data-seek="0.1"]').click();
  assert(await page.locator('#reference').evaluate(v => v.currentTime <= v.duration), '微調超出片尾');
  await locate('reference', 12); await page.locator('#reference-start').click(); await idle();
  await locate('self', 4); await page.locator('#self-start').click(); await idle();
  const chosen = await data(), take = chosen.takes.at(-1), recipe = chosen.recipes.find(r => r.takeId === take.id);
  assert(take.referenceStartMs === 12000 && recipe.offsetMs === 4000, '明確設起點未沿用原有時間映射');
  assert((await page.locator('#reference-chosen-start').textContent()).includes('12.000') && (await page.locator('#self-chosen-start').textContent()).includes('4.000'), '已選起點不清楚');
  await page.locator('#play').click();
  await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden && document.getElementById('self').currentTime > 4.1);
  assert(await page.locator('#reference-seek').isDisabled() && await page.locator('#self-seek').isDisabled(), '共同比較中還能獨立跳片');
  await page.locator('#pause-comparison').click(); await idle();
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '時間尺設起點後無法匯出');
  const oldOutput = await page.locator('#output-download').getAttribute('href'), oldData = JSON.stringify(await data()), oldSelf = await page.locator('#self').getAttribute('src');
  await locate('reference', 13); await locate('self', 5);
  assert(oldData === JSON.stringify(await data()) && oldOutput === await page.locator('#output-download').getAttribute('href'), '只定位卻改了已保存設定或輸出');
  await page.locator('#self-file').setInputFiles({ name: 'synthetic-invalid.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic-invalid') }); await idle();
  assert(await page.locator('#self').getAttribute('src') === oldSelf && await page.locator('#self-seek').inputValue() === '5' && oldData === JSON.stringify(await data()), '壞檔破壞舊尺、位置或資料');
  await page.locator('#self-file').setInputFiles([]); await idle();
  assert(await page.locator('#self-seek').inputValue() === '5', '取消選片重設定位');
  for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '刻度尺窄版溢出'); }
  await page.locator('.players').screenshot({ path: 'output/playwright/source-time-rulers.png' });
  return { independentRulers: true, previewDoesNotSave: true, nativeSeekAndMsReadout: true, keyboardAndFineSteps: true, boundaries: true, explicitStartsUseOriginalMapping: true, lockedDuringComparison: true, exportWorks: true, badFileAndCancelPreserve: true, responsive: true };
}
