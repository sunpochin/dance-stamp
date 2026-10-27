/* 檔案用途：從正式雙片入口產生可量測的 VS。所在層：成檔整合驗收。主要關聯：analyze-comparison.ts、make-comparison-fixtures.ts。 */
async (page, { rate = 1, seconds = 60, referenceMirror = false, selfMirror = false, absentCamera = false } = {}) => {
  const origin = new URL(page.url()).origin, idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  const outsideRequests = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && (new URL(request.url()).origin !== origin || request.method() !== 'GET')) outsideRequests.push({ url: request.url(), method: request.method() }); });
  await page.addInitScript(({ absentCamera }) => { window.externalCaptureCalls = 0; if (absentCamera) { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); return; } if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.externalCaptureCalls++; throw new DOMException('synthetic denied', 'NotAllowedError'); }; }, { absentCamera });
  await page.goto(origin); await page.locator('#compare-existing').click(); await idle();
  await page.locator('#pair-reference-file').setInputFiles('output/comparison-fixtures/teacher.mp4'); await idle();
  await page.locator('#pair-self-file').setInputFiles(`output/comparison-fixtures/own-${rate}.mp4`); await idle();
  await page.locator('#pair-a').fill('12'); await page.locator('#pair-b').fill(String(12 + seconds * rate)); await page.locator('#pair-c').fill((4 / rate).toFixed(3)); await page.locator('#pair-rate').selectOption(String(rate));
  await page.locator('#pair-reference-ok').check(); await page.locator('#pair-self-ok').check(); await page.locator('#pair-confirm').click(); await idle();
  await page.locator('#reference-mirror').setChecked(referenceMirror); await idle(); await page.locator('#self-mirror').setChecked(selfMirror); await idle();
  await page.locator('#export').click();
  await page.waitForFunction(() => !document.getElementById('output-download').hidden && !document.getElementById('controls').disabled, null, { timeout: 90_000 });
  const diagnostics = JSON.parse(await page.locator('#diagnostics').textContent()), captureCalls = await page.evaluate(() => window.externalCaptureCalls);
  if (!diagnostics.export?.decodedDurationMs || captureCalls || outsideRequests.length) throw new Error(JSON.stringify({ diagnostics, captureCalls, outsideRequests }));
  const downloaded = page.waitForEvent('download'); await page.locator('#output-download').click();
  const download = await downloaded, ext = download.suggestedFilename().split('.').at(-1), file = `output/comparison-fixtures/vs-${String(rate).replace('.', '_')}-${seconds}.${ext}`;
  await download.saveAs(file);
  return { file, seconds, recipe: diagnostics.export.recipe, elapsedMs: diagnostics.export.elapsedMs, decodedDurationMs: diagnostics.export.decodedDurationMs, captureCalls, absentCamera, outsideRequests };
}
