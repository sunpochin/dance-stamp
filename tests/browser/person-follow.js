/* 檔案用途：用真正本機模型驗雙側框選、裁切成檔、鏡像及失敗保全。所在層：合成瀏覽器回歸。主要關聯：make-follow-fixtures.ts、web/follow-ui.js。 */
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const origin = new URL(page.url()).origin, requests = [], downloads = [], runId = Date.now().toString(36);
  page.context().on('request', request => requests.push({ url: request.url(), method: request.method() }));
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('框選只允許本機合成影片'); }; window.confirm = () => true; });
  await page.goto(origin);
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const set = async (id, value) => { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).dispatchEvent('change'); await idle(); };
  await idle();
  for (const side of ['reference', 'self']) { await page.locator('#' + side + '-file').setInputFiles('output/follow/' + side + '.mp4'); await idle(); }
  await set('end', 3); await set('offset', 0);
  const open = async side => { await page.locator('#' + side + '-follow').click(); await page.waitForFunction(() => document.getElementById('follow-dialog').open); await idle(); };
  const analyze = async () => { await page.locator('#follow-confirm').click(); await page.waitForFunction(() => !document.getElementById('follow-dialog').open || !document.getElementById('controls').disabled && document.getElementById('follow-message').textContent.includes('保留'), null, { timeout: 60000 }); await idle(); assert(!await page.locator('#follow-dialog').evaluate(d => d.open), '分析失敗：' + await page.locator('#follow-message').textContent()); };
  await open('reference');
  const frame = await page.locator('#follow-canvas').boundingBox();
  await page.mouse.move(frame.x + frame.width * .025, frame.y + frame.height * .025); await page.mouse.down();
  await page.mouse.move(frame.x + frame.width * .395, frame.y + frame.height * .975, { steps: 8 }); await page.mouse.up();
  assert(Number(await page.locator('#follow-width').inputValue()) < 40, '拖曳未更新選框');
  await page.locator('#follow-canvas').focus(); await page.keyboard.press('ArrowRight');
  assert(Number(await page.locator('#follow-x').inputValue()) > 2.5, '方向鍵未移動選框');
  await analyze();
  await open('self');
  for (const [id, value] of [['follow-width', 40], ['follow-x', 55], ['follow-y', 2.5], ['follow-height', 95]]) { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).dispatchEvent('change'); }
  await analyze();
  for (const side of ['reference', 'self']) assert(await page.locator('#' + side + '-follow-enabled').isChecked(), side + ' 未開啟獨立跟隨');
  const trackedStatus = await page.locator('#reference-follow-status').textContent();
  for (const [side, half] of [['reference', 0], ['self', 1]]) {
    await page.locator('#canvas').evaluate(canvas => { window.followMirrorBefore = canvas.getContext('2d').getImageData(0, 0, 1280, 720).data; });
    await page.locator('#' + side + '-mirror').setChecked(true); await idle();
    const mirrored = await page.locator('#canvas').evaluate((canvas, half) => {
      const before = window.followMirrorBefore, after = canvas.getContext('2d').getImageData(0, 0, 1280, 720).data;
      const start = half * 640, end = start + 640;
      let left = start, right = end - 1;
      while (left < right && before[(60 * 1280 + left) * 4] < 40) left++;
      while (right > left && before[(60 * 1280 + right) * 4] < 40) right--;
      let identityError = 0, mirrorError = 0, points = 0, otherError = 0, otherMax = 0;
      // 只比較原圖與反射圖確實不同的像素，灰背景不能替無效鏡像灌出成功。
      for (let y = 90; y < 660; y += 3) for (let x = left + 3; x < right - 3; x += 3) {
        const p = (y * 1280 + x) * 4, q = (y * 1280 + left + right - x) * 4;
        const difference = Math.abs(before[p] - before[q]) + Math.abs(before[p + 1] - before[q + 1]) + Math.abs(before[p + 2] - before[q + 2]);
        if (difference < 90) continue;
        points++; identityError += difference;
        for (let c = 0; c < 3; c++) mirrorError += Math.abs(after[p + c] - before[q + c]);
      }
      for (let y = 90; y < 660; y += 10) for (let x = (1 - half) * 640; x < (2 - half) * 640; x += 10) { const p = (y * 1280 + x) * 4; for (let c = 0; c < 3; c++) { const error = Math.abs(after[p + c] - before[p + c]); otherError += error; otherMax = Math.max(otherMax, error); } }
      return { points, identityError, mirrorError, otherError, otherMax };
    }, half);
    // 原生影片重畫可能有一階色彩捨入；逐 channel 限定 1，仍會抓到另一側被移動或翻轉。
    assert(mirrored.points > 100 && mirrored.mirrorError < mirrored.identityError * .35 && mirrored.otherMax <= 1, side + ' 裁切鏡像錯誤或影響另一側：' + JSON.stringify(mirrored));
  }
  // 裁切與鏡像後，新試看預設仍須同一畫面；只容許原生繪圖的一階色彩捨入。
  const adjustedDifference = await page.evaluate(() => {
    const pixels = id => document.getElementById(id).getContext('2d').getImageData(0, 0, 1280, 720).data;
    const original = pixels('canvas'), adjusted = pixels('adjusted-side-canvas');
    return original.reduce((max, value, i) => Math.max(max, Math.abs(value - adjusted[i])), 0);
  });
  assert(adjustedDifference <= 1, '可調並排沒有沿用人物跟隨裁切：' + adjustedDifference);
  const metrics = async (id, times, layout) => page.locator('#' + id).evaluate(async (video, { times, layout }) => {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720; const context = canvas.getContext('2d'), results = [];
    for (const time of times) {
      if (Math.abs(video.currentTime - time) > .001) await new Promise(resolve => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = time; });
      context.drawImage(video, 0, 0, 1280, 720); const pixels = context.getImageData(0, 0, 1280, 720).data;
      const halves = layout === 'side-by-side' ? [[0, 640], [640, 1280]] : [[0, 1280]], centers = [];
      for (const [left, right] of halves) {
        let sum = 0, count = 0;
        for (let y = 60; y < 680; y += 2) for (let x = left; x < right; x += 2) { const p = (y * 1280 + x) * 4; if (pixels[p] > 170 && pixels[p + 1] < 165 && pixels[p + 2] < 175 && pixels[p] > pixels[p + 1] * 1.35) { sum += x; count++; } }
        if (count < 500) throw new Error('成品未包含可辨識的合成人物'); centers.push(sum / count);
      }
      results.push(centers);
    }
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, centers: results };
  }, { times, layout });
  for (const layout of ['side-by-side', 'overlay']) {
    await page.locator('#export-layout').selectOption(layout); await page.locator('#export').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('合成中')); await idle();
    assert((await page.locator('#status').textContent()).includes('已成檔'), '裁切匯出失敗：' + await page.locator('#status').textContent());
    const measured = await metrics('output', [.4, 2.5], layout);
    assert(measured.width === 1280 && measured.height === 720 && Math.abs(measured.duration - 3) <= .1, '裁切改變既有尺寸或時間');
    measured.centers[0].forEach((center, side) => assert(Math.abs(center - measured.centers[1][side]) < 35, '人物在成品中未維持跟隨：' + JSON.stringify(measured)));
    const pending = page.waitForEvent('download'); await page.locator('#output-download').click(); const download = await pending;
    const path = 'output/playwright/follow-' + layout + '-' + runId + '.' + download.suggestedFilename().split('.').pop(); await download.saveAs(path); downloads.push({ path, measured });
  }
  // 先成功再取消與偵測失敗，才有資料可證明保全，不能只驗空狀態。
  await open('reference'); await page.locator('#follow-confirm').click();
  await page.waitForFunction(() => document.getElementById('controls').disabled && document.getElementById('follow-confirm').disabled);
  await page.locator('#follow-cancel').click(); await idle();
  assert(await page.locator('#reference-follow-status').textContent() === trackedStatus, '取消清掉舊追蹤');
  await page.locator('#follow-cancel').click();
  await open('reference');
  for (const [id, value] of [['follow-width', 10], ['follow-x', 80], ['follow-y', 5], ['follow-height', 80]]) { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).dispatchEvent('change'); }
  await page.locator('#follow-confirm').click(); await page.waitForFunction(() => document.getElementById('follow-message').textContent.includes('未找到')); await idle();
  assert(await page.locator('#reference-follow-status').textContent() === trackedStatus, '偵測失敗破壞舊追蹤'); await page.locator('#follow-cancel').click();
  await set('end', 4); assert(await page.locator('#export').isDisabled(), '擴大區間仍匯出未分析的路徑'); await set('end', 3); assert(await page.locator('#export').isEnabled(), '回到分析範圍仍無法匯出');
  const oldOutput = await page.locator('#output-download').getAttribute('href');
  await page.locator('#self-file').setInputFiles('output/media-probe/player/corrupt.mp4'); await idle();
  assert(await page.locator('#self-follow-enabled').isChecked(), '壞檔清掉已成功的自己追蹤');
  await page.locator('#self-file').setInputFiles('output/follow/self.mp4'); await idle();
  assert(await page.locator('#self-follow-enabled').isDisabled() && await page.locator('#reference-follow-enabled').isChecked(), '換自己影片影響另一側或沿用舊路徑');
  assert(await page.locator('#output-download').getAttribute('href') === oldOutput, '換片刪掉先前成品');
  for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '框選介面窄版溢出'); }
  const selectionScreenshot = 'output/playwright/follow-selection-' + runId + '.png';
  await open('self'); await page.locator('#follow-dialog').screenshot({ path: selectionScreenshot }); await page.locator('#follow-cancel').click();
  assert(requests.every(request => request.method === 'GET' && (request.url.startsWith(origin + '/') || request.url.startsWith('blob:'))), '人物分析有外部請求或寫入');
  assert(requests.some(request => request.url.endsWith('/person-model.tflite')), '未真正執行本機人物模型');
  return { downloads, selectionScreenshot, bothSidesTracked: true, pointerAndKeyboardSelection: true, cancelAndFailurePreserved: true, staleRangeBlocked: true, replaceSideOnly: true, localModel: true, requests: requests.length };
}
