/* 檔案用途：真正下載三速度的音訊對照，並驗比較取消／失敗恢復一般練習。所在層：#11 隔離瀏覽器回歸。主要關聯：analyze-comparison-pitch.py、RECORD_COMPARE.md。 */
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('音訊對照禁止相機／麥克風'); }; window.confirm = () => true; });
  await page.goto(origin); await idle();
  const change = async (id, value) => { await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); await idle(); };
  const results = [];
  for (const rate of [0.5, 0.75, 1]) {
    await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
    await page.locator('#self-file').setInputFiles('output/comparison/self-' + rate + '.mp4'); await idle();
    await change('start', '12'); await change('end', String(12 + rate * 3));
    await page.locator('#rate').selectOption(String(rate)); await idle(); await change('offset', '4');
    assert((await page.locator('#comparison-pitch-status').textContent()).includes('隨速度變調'), '比較沒有明示音高差異');
    await page.locator('#play').click();
    await page.waitForFunction(() => document.getElementById('reference').currentTime > 12.1);
    assert(await page.locator('#reference').evaluate(v => !v.preservesPitch), '共同預覽仍套用音高處理');
    await page.locator('#pause-comparison').click(); await idle();
    assert(await page.locator('#reference').evaluate(v => v.preservesPitch && v.paused), '取消預覽沒有恢復一般練習');
    await page.locator('#export').click(); await idle();
    assert((await page.locator('#status').textContent()).includes('已成檔'), '三速度輸出未完成');
    const pending = page.waitForEvent('download'); await page.locator('#output-download').click(); const file = await pending;
    const path = 'output/comparison/pitch-' + rate + '.' + file.suggestedFilename().split('.').pop(); await file.saveAs(path);
    assert(await page.locator('#reference').evaluate(v => v.preservesPitch && v.playbackRate === 1 && v.paused), '成檔沒有恢復一般練習');
    results.push({ rate, path });
  }
  const previous = await page.locator('#output-download').getAttribute('href');
  await page.evaluate(() => { window.nativePitchDraw = CanvasRenderingContext2D.prototype.drawImage; CanvasRenderingContext2D.prototype.drawImage = function(...args) { if (this.canvas.id === 'canvas') throw new Error('synthetic comparison draw failure'); return window.nativePitchDraw.apply(this, args); }; });
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('synthetic comparison draw failure'), '繪製故障沒有觸發');
  await page.evaluate(() => { CanvasRenderingContext2D.prototype.drawImage = window.nativePitchDraw; });
  assert(await page.locator('#output-download').getAttribute('href') === previous && await page.locator('#reference').evaluate(v => v.preservesPitch && v.paused), '失敗破壞舊片或一般練習音高');
  return { downloads: results, previewAndExportAgree: true, cancellationAndFailureRestorePracticePitch: true, previousOutputPreserved: true };
}
