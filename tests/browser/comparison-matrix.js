/* 檔案用途：下載實際 VS 供獨立同步、音訊與穩定性分析。所在層：合成媒體驗收。主要關聯：make-comparison-fixtures.ts、analyze-comparison.py。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout: 95000 });
  await page.addInitScript(() => {
    window.confirm = () => true;
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('比較驗收禁止相機'); };
  });
  await page.goto(origin); await idle();
  const cases = [
    { rate: 1, duration: 15 }, { rate: 0.75, duration: 15 }, { rate: 0.5, duration: 15 },
    { rate: 1, duration: 30 }, { rate: 0.75, duration: 30 }, { rate: 0.5, duration: 30 },
    { rate: 0.75, duration: 60 }, { rate: 0.5, duration: 60 },
    ...Array.from({ length: 10 }, (_, index) => ({ rate: 1, duration: 60, repeat: index + 1 })),
    { rate: 1, duration: 5, silent: true }, { rate: 1, duration: 5, mirror: true },
  ];
  const results = [];
  for (const item of cases) {
    await page.locator('#existing-mode').click();
    await page.locator('#reference-file').setInputFiles(`output/comparison/${item.silent ? 'silent' : 'reference'}.mp4`); await idle();
    // 新選片預設全長；此比較案例明確選 15 秒，保留原本的媒體護欄與測試範圍。
    await page.locator('#end').fill('15');
    await page.locator('#self-file').setInputFiles(`output/comparison/self-${item.rate}.mp4`); await idle();
    await page.locator('#start').fill('12'); await page.locator('#start').dispatchEvent('change'); await idle();
    // 先調短結尾再切慢速，避免舊的合法區間在新比例下超過 60 秒。
    await page.locator('#end').fill(String(12 + item.rate * item.duration)); await page.locator('#end').dispatchEvent('change'); await idle();
    await page.locator('#rate').selectOption(String(item.rate)); await idle();
    await page.locator('#offset').fill('4'); await page.locator('#offset').dispatchEvent('change'); await idle();
    await page.locator('#reference-mirror').setChecked(!!item.mirror); await idle();
    await page.locator('#self-mirror').setChecked(!!item.mirror); await idle();
    const exportBegan = Date.now();
    await page.locator('#export').click(); await idle();
    const totalExportMs = Date.now() - exportBegan;
    if (item.duration === 60 && totalExportMs > 90000) throw new Error('60 秒完整匯出超過 90 秒目標');
    const result = JSON.parse(await page.locator('#diagnostics').textContent()).export;
    const status = await page.locator('#status').textContent();
    if (!status.includes('已成檔') || !result || Math.abs(result.decodedDurationMs - item.duration * 1000) > 300) throw new Error(`成檔失敗：${JSON.stringify(item)} ${status}`);
    const waiting = page.waitForEvent('download'); await page.locator('#output-download').click();
    const download = await waiting, filename = `vs-${item.rate}-${item.duration}-${item.repeat || (item.silent ? 'silent' : item.mirror ? 'mirror' : 'single')}.${download.suggestedFilename().split('.').pop()}`;
    await download.saveAs(`output/comparison/${filename}`);
    results.push({ ...item, filename, totalExportMs, ...result });
  }
  return results;
}
