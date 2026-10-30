/* 檔案用途：以 Playwright CLI 與明確假相機驗證成檔及取消。所在層：M0 瀏覽器回歸函式。主要關聯：MEDIA_PROBE.md、make-media-fixtures.ts。 */
// 相機設定已收在選用區；先展開，再沿用原本的錄影與資料保護斷言。
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  // 與預覽主機使用相同入口，避免把其他本機網站當成回歸目標。
  await page.goto('http://127.0.0.1:4174/');
  // 只有設定合成相機的隔離 session 才可執行，禁止測試誤用真人相機。
  await page.evaluate(() => {
    if (window.__danceSyntheticCameraOnly !== true) throw new Error('請先以合成測片工具產生的 browser.json 開啟隔離 session。');
    window.probeTracks = [];
    window.probeRequests = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.probeRequests.push(constraints);
      const stream = await original(constraints);
      if (!/fake|test|camera\.y4m/i.test(stream.getVideoTracks()[0].label)) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error('回歸工具必須使用假相機。');
      }
      window.probeTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.getByLabel('選擇示範影片', { exact: true }).setInputFiles('output/media-probe/reference.mp4');
  await page.waitForFunction(() => !document.getElementById('camera').disabled);
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.getByRole('button', { name: '開啟前相機', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('capture').disabled);
  await page.getByRole('button', { name: '倒數並錄下我', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('compare').disabled, null, { timeout: 30_000 });
  assert(await page.evaluate(() => window.probeTracks.every(t => t.readyState === 'ended')), '相機未釋放');
  assert(await page.getByRole('combobox', { name: '速度', exact: true }).isDisabled(), '錄後速度仍可被誤改');
  const takeHref = await page.locator('#take-download').getAttribute('href');
  await page.getByRole('button', { name: '輸出單一 VS 影片', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('output-download').hidden, null, { timeout: 30_000 });
  // 下載連結會早於落盤／診斷報告出現；等操作完成才讀結果，避免把舊的 null 當成新證據。
  await page.waitForFunction(() => !document.getElementById('controls').disabled);
  const result = JSON.parse(await page.locator('#diagnostics').textContent());
  assert(result.export?.bytes > 0 && result.export?.decodedDurationMs > 0, '匯出沒有完成成檔與解碼紀錄');
  const saved = page.waitForEvent('download');
  await page.locator('#output-download').click();
  const download = await saved;
  await download.saveAs(`output/media-probe/${download.suggestedFilename()}`);
  const outputHref = await page.locator('#output-download').getAttribute('href');
  const requests = await page.evaluate(() => window.probeRequests);
  assert(requests.every(c => c.audio === false), '測試意外要求麥克風');
  // 第二次匯出取消，上一個輸出與原片下載必須仍有效。
  await page.getByRole('button', { name: '輸出單一 VS 影片', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('合成中'));
  await page.getByRole('button', { name: '停止／取消', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('compare').disabled);
  assert(await page.locator('#output-download').getAttribute('href') === outputHref, '取消破壞上次輸出');
  assert(await page.locator('#take-download').getAttribute('href') === takeHref, '取消破壞自拍原片');
  await page.getByLabel('練習影片起點（秒）', { exact: true }).fill('100');
  await page.getByLabel('練習影片起點（秒）', { exact: true }).press('Tab');
  assert(await page.getByRole('button', { name: '輸出單一 VS 影片', exact: true }).isDisabled(), '空交集仍可合成');
  await page.getByLabel('練習影片起點（秒）', { exact: true }).fill('0');
  await page.getByLabel('練習影片起點（秒）', { exact: true }).press('Tab');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '手機版面水平溢出');
  return { ...result, cancellationPreservesFiles: true, noMicrophone: true, cameraReleased: true, emptyIntersectionBlocked: true, mobileLayout: '390x844, simulated' };
}
