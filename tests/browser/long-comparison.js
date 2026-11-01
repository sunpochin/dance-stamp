/* 檔案用途：驗證五分鐘雙片配對、取消保全與真正下載。所在層：合成媒體驗收。主要關聯：timeline.js、RECORD_COMPARE.md、MEDIA_PROBE.md。 */
async (page, directory = 'output/long-comparison') => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled, null, { timeout: 330000 });
  await page.addInitScript(() => {
    window.confirm = () => true;
    for (const name of ['getUserMedia', 'getDisplayMedia']) navigator.mediaDevices[name] = () => { throw new Error('長比較驗收禁止硬體擷取'); };
  });
  await page.goto(origin); await idle();
  const read = () => page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data));
  const change = async (id, value) => { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).dispatchEvent('change'); await idle(); };
  await page.locator('#reference-file').setInputFiles(directory + '/reference.mp4'); await idle();
  assert(Number(await page.locator('#end').inputValue()) > 300, '測片必須真正超過五分鐘，不可改寫原生片長');
  const beforeRejected = await read();
  await page.locator('#self-file').setInputFiles(directory + '/self.mp4'); await idle();
  assert((await page.locator('#status').textContent()).includes('最多 5 分鐘') && await read() === beforeRejected, '超界選片未拒絕或改動舊資料');
  await change('end', 300);
  await page.locator('#self-file').setInputFiles(directory + '/self.mp4'); await idle();
  // 先縮短再切慢速，避免中間設定真的超界；三速度都須能保存完整五分鐘配方。
  for (const rate of [0.5, 0.75, 1]) {
    await change('end', 150);
    await page.locator('#rate').selectOption(String(rate)); await idle();
    await change('end', 300 * rate);
    assert((await page.locator('#intersection').textContent()).includes('300.00 秒') && await page.locator('#export').isEnabled(), '五分鐘配方被拒絕或截短');
  }
  const beforeCancel = await read();
  await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('progress').value > 0.01);
  await page.locator('#stop').click(); await idle();
  assert(await read() === beforeCancel, '取消匯出改動既有資料');
  const began = Date.now();
  await page.locator('#export').click(); await idle();
  const totalExportMs = Date.now() - began, status = await page.locator('#status').textContent();
  assert(status.includes('已成檔') && await page.locator('#output-download').isVisible(), '五分鐘沒有真正成檔：' + status);
  const waiting = page.waitForEvent('download'); await page.locator('#output-download').click();
  const download = await waiting, file = directory + '/vs-1-300-single.' + download.suggestedFilename().split('.').pop();
  await download.saveAs(file);
  const stored = await page.evaluate(async () => {
    const storage = await import('/storage.js'), { data } = await storage.readLibrary(), latest = data.exports.at(-1);
    const bytes = await (await storage.readMedia(latest.assetId)).arrayBuffer();
    const restored = (await import('/library.js')).parseBackup(JSON.stringify(data));
    return { durationMs: data.assets.find(asset => asset.id === latest.assetId).durationMs, byteLength: bytes.byteLength,
      sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join(''),
      takesRoundTrip: JSON.stringify(data.takes) === JSON.stringify(restored.takes) };
  });
  assert(Math.abs(stored.durationMs - 300000) <= 100 && stored.takesRoundTrip, '成檔片長或長配方備份不符');
  return { file, totalExportMs, stored, diagnostics: JSON.parse(await page.locator('#diagnostics').textContent()).export,
    overLimitPreservesData: true, cancelledExportPreservesData: true, rates: [0.5, 0.75, 1] };
}
