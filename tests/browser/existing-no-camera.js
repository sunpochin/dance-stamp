/* 檔案用途：驗證完全沒有相機 API 仍能走完正式雙片匯出。所在層：Web 能力邊界驗收。主要關聯：existing-comparison.js、comparison-matrix.js。 */
async (page) => {
  const origin = new URL(page.url()).origin, outside = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout: 30_000 });
  await page.addInitScript(() => {
    // 能力完全不存在時選片仍須可用；這個情境不能依賴相機測片注入。
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    window.confirm = () => true;
  });
  page.on('request', request => { if ((!request.url().startsWith(origin + '/') && !request.url().startsWith('blob:')) || !['GET', 'HEAD'].includes(request.method())) outside.push(request.method()); });
  await page.goto(origin); await idle();
  assert(await page.evaluate(() => navigator.mediaDevices === undefined), '沒有建立完全缺少相機 API 的情境');
  await page.getByRole('button', { name: '比較已有影片', exact: true }).click();
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  assert(await page.locator('#rate').inputValue() === '1', '新配對不是原速預設');
  for (const [id, value] of [['start', '12'], ['end', '17'], ['offset', '4']]) {
    await page.locator(`#${id}`).fill(value); await page.locator(`#${id}`).dispatchEvent('change'); await idle();
  }
  await page.locator('#play').click();
  await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden && document.getElementById('self').currentTime > 4.1);
  await page.locator('#pause-comparison').click(); await idle();
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '缺少相機 API 時沒有完成 VS');
  const info = JSON.parse(await page.locator('#diagnostics').textContent()).export;
  assert(info?.decodedDurationMs > 4700 && info.decodedDurationMs < 5300, '沒有真正讀回完整五秒輸出');
  const waiting = page.waitForEvent('download'); await page.locator('#output-download').click();
  const file = await waiting, filename = `output/comparison/vs-1-5-no-camera.${file.suggestedFilename().split('.').pop()}`; await file.saveAs(filename);
  const data = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  assert(data.takes.every(t => t.state === 'ready' && !t.captureTiming) && outside.length === 0, '選片冒充相機工作或送出外部請求');
  return { cameraApiAbsent: true, formalEntryPreviewsAndExports: true, noFakeCapture: true, outsideRequests: outside, filename, output: info };
}
