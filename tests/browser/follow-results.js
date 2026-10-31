/* 檔案用途：驗雙側原生結果播放器、各自聲音的真下載與更新保全。所在層：合成短功能回歸。主要關聯：follow-ui.js、follow-export.js、make-follow-fixtures.ts。 */
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); }, runId = Date.now().toString(36), downloads = [];
  const origin = new URL(page.url()).origin, requests = [];
  page.context().on('request', request => requests.push({ url: request.url(), method: request.method() }));
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('單側結果禁止相機與麥克風'); }; window.confirm = () => true; });
  await page.goto(origin);
  assert(await page.locator('body').getAttribute('data-comparison-only') !== null, '沒有測到預設操作介面');
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await idle();
  for (const [side, file] of [['reference', 'reference'], ['self', 'self-audio']]) { await page.locator('#' + side + '-file').setInputFiles('output/follow/' + file + '.mp4'); await idle(); }
  for (const [id, value] of [['start', '.4'], ['end', '3.4'], ['offset', '.5']]) { await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); await idle(); }
  const originals = await page.evaluate(() => ['reference', 'self'].map(id => document.getElementById(id).getAttribute('src')));
  const originalTimes = await page.evaluate(() => ['reference', 'self'].map(id => document.getElementById(id).currentTime));
  const stored = await page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data));
  for (const side of ['reference', 'self']) {
    assert(await page.locator('#' + side + '-follow-result').isHidden(), '未分析已顯示假結果');
    await page.locator('#' + side + '-follow').click(); await page.waitForFunction(() => document.getElementById('follow-dialog').open); await idle();
    for (const [field, value] of [['width', side === 'reference' ? 37 : 40], ['x', side === 'reference' ? 3.5 : 55], ['y', 2.5], ['height', 95]]) { await page.locator('#follow-' + field).fill(String(value)); await page.locator('#follow-' + field).dispatchEvent('change'); }
    await page.locator('#follow-confirm').click();
    await page.waitForFunction(() => !document.getElementById('follow-dialog').open || !document.getElementById('controls').disabled && document.getElementById('follow-message').textContent.includes('保留'), null, { timeout: 60000 }); await idle();
    assert(!await page.locator('#follow-dialog').evaluate(d => d.open), '結果製作失敗：' + await page.locator('#follow-message').textContent());
    const video = page.locator('#' + side + '-follow-result'); await video.waitFor({ state: 'visible' });
    await page.waitForFunction(id => document.getElementById(id).readyState >= 2, side + '-follow-result');
    assert(await video.getAttribute('src') === await page.locator('#' + side + '-follow-download').getAttribute('href'), '預覽與匯出不是同一份結果');
    assert(await video.evaluate(v => v.controls && v.videoHeight > v.videoWidth && Math.abs(v.duration - 3) <= .1 && v.videoHeight <= 1280 && v.videoWidth % 2 === 0 && v.videoHeight % 2 === 0), '單側結果尺寸／原速片長不正確');
    assert(await page.evaluate(() => document.activeElement.id) === side + '-follow-result', '製作完成未將鍵盤焦點帶到結果');
    await video.evaluate(v => { v.muted = true; return v.play(); }); await page.waitForFunction(id => document.getElementById(id).currentTime > .2, side + '-follow-result');
    assert(await page.locator('#stop').isVisible(), '播放結果時停止鍵不可見'); await page.locator('#stop').click();
    assert(await video.evaluate(v => v.paused), '停止沒有暫停單側結果');
    const pixels = await video.evaluate(async v => {
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const context = c.getContext('2d'), centers = [];
      for (const time of [.4, 2.5]) { await new Promise(resolve => { v.addEventListener('seeked', resolve, { once: true }); v.currentTime = time; }); context.drawImage(v, 0, 0); const data = context.getImageData(0, 0, c.width, c.height).data; let sum = 0, count = 0;
        for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) { const p = (y * c.width + x) * 4; if (data[p] > 170 && data[p + 1] < 165 && data[p + 2] < 175 && data[p] > data[p + 1] * 1.35) { sum += x; count++; } } if (count < 300) throw new Error('結果缺少人物'); centers.push(sum / count); }
      return centers;
    });
    assert(Math.abs(pixels[0] - pixels[1]) < 20, '單側成品未跟隨移動人物');
    const pending = page.waitForEvent('download'); await page.locator('#' + side + '-follow-download').click(); const download = await pending;
    const path = 'output/playwright/result-' + side + '-' + runId + '.' + download.suggestedFilename().split('.').pop(); await download.saveAs(path);
    // 實際解碼下載的音軌；兩側不同頻率能抓出錯把老師音訊放進自己影片的問題。
    const { spawnSync } = await import('node:child_process');
    const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-ss', '0.3', '-t', '1', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']);
    assert(decoded.status === 0 && decoded.stdout.length >= 16000, '單側下載缺音訊或無法解碼');
    const pcm = new DataView(decoded.stdout.buffer, decoded.stdout.byteOffset, decoded.stdout.byteLength), strength = frequency => {
      let real = 0, imaginary = 0; for (let i = 0; i < pcm.byteLength / 4; i++) { const sample = pcm.getFloat32(i * 4, true), phase = 2 * Math.PI * frequency * i / 8000; real += sample * Math.cos(phase); imaginary += sample * Math.sin(phase); } return real * real + imaginary * imaginary;
    };
    const expected = side === 'reference' ? 660 : 880, other = side === 'reference' ? 880 : 660, ratio = strength(expected) / Math.max(1, strength(other));
    assert(ratio > 20, '單側音軌來源不正確：' + side + ' ratio=' + ratio); downloads.push({ side, path, pixels, expectedHz: expected, audioRatio: ratio });
  }
  assert(await page.evaluate(times => ['reference', 'self'].every((id, index) => document.getElementById(id).paused && Math.abs(document.getElementById(id).currentTime - times[index]) < .001), originalTimes), '單側結果播放／定位改動原片位置');
  assert(JSON.stringify(await page.evaluate(() => ['reference', 'self'].map(id => document.getElementById(id).getAttribute('src')))) === JSON.stringify(originals), '單側製作更換原片');
  assert(await page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data)) === stored, '單側結果誤存為 VS 或改動筆記／配方');
  const oldSelf = await page.locator('#self-follow-download').getAttribute('href'), oldTeacher = await page.locator('#reference-follow-download').getAttribute('href');
  await page.locator('#reference-follow-result').evaluate(async v => {
    await new Promise(resolve => { v.addEventListener('seeked', resolve, { once: true }); v.currentTime = 1; });
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const context = c.getContext('2d'); context.drawImage(v, 0, 0); window.nativeFollowBefore = context.getImageData(0, 0, c.width, c.height).data;
  });
  await page.locator('#reference-mirror').setChecked(true); await idle();
  assert((await page.locator('#reference-follow-result-status').textContent()).includes('先前') && !(await page.locator('#self-follow-result-status').textContent()).includes('先前'), '鏡像沒有逐側標示待更新');
  await page.locator('#reference-follow-refresh').click(); await page.waitForFunction(() => document.getElementById('reference-follow-result-status').textContent.includes('正在製作'));
  await page.locator('#stop').click(); await idle();
  assert(await page.locator('#reference-follow-download').getAttribute('href') === oldTeacher && await page.locator('#self-follow-download').getAttribute('href') === oldSelf, '取消更新破壞既有結果');
  // 真正先暫停原生 AudioContext，再讓 resume 保持等待；停止不能被這個未完成承諾卡住。
  await page.evaluate(async () => {
    window.followNativeAudioContext = window.AudioContext;
    window.followWaitingAudio = new window.AudioContext(); await window.followWaitingAudio.suspend();
    window.followResumeRequested = false;
    window.followWaitingAudio.resume = () => { window.followResumeRequested = true; return new Promise(() => {}); };
    window.AudioContext = function() { return window.followWaitingAudio; };
  });
  await page.locator('#reference-follow-refresh').click();
  await page.waitForFunction(() => window.followResumeRequested);
  await page.locator('#stop').click(); await idle();
  assert(await page.locator('#reference-follow-download').getAttribute('href') === oldTeacher && await page.locator('#self-follow-download').getAttribute('href') === oldSelf, '取消音訊啟動破壞既有結果');
  assert(await page.evaluate(() => window.followWaitingAudio.state === 'closed'), '取消未關閉尚在等待的音訊資源');
  await page.evaluate(() => { window.AudioContext = window.followNativeAudioContext; delete window.followWaitingAudio; });
  await page.evaluate(() => { window.resultRecorder = window.MediaRecorder; window.MediaRecorder = class { static isTypeSupported() { return false; } }; });
  await page.locator('#reference-follow-refresh').click(); await idle();
  assert(await page.locator('#reference-follow-download').getAttribute('href') === oldTeacher, '編碼失敗破壞舊結果');
  await page.evaluate(() => { window.MediaRecorder = window.resultRecorder; });
  await page.locator('#reference-follow-refresh').click(); await idle();
  assert(await page.locator('#reference-follow-download').getAttribute('href') !== oldTeacher && await page.locator('#self-follow-download').getAttribute('href') === oldSelf, '更新沒有逐側替換結果');
  assert(!(await page.locator('#reference-follow-result-status').textContent()).includes('先前'), '更新後仍標舊鏡像');
  const mirrorPixels = await page.locator('#reference-follow-result').evaluate(async v => {
    if (v.readyState < 2) await new Promise(resolve => v.addEventListener('loadeddata', resolve, { once: true }));
    await new Promise(resolve => { v.addEventListener('seeked', resolve, { once: true }); v.currentTime = 1; });
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const context = c.getContext('2d'); context.drawImage(v, 0, 0); const after = context.getImageData(0, 0, c.width, c.height).data, before = window.nativeFollowBefore;
    let points = 0, identity = 0, mirrored = 0;
    for (let y = 10; y < c.height - 10; y += 3) for (let x = 10; x < c.width - 10; x += 3) {
      const p = (y * c.width + x) * 4, q = (y * c.width + c.width - 1 - x) * 4, difference = Math.abs(before[p] - before[q]) + Math.abs(before[p + 1] - before[q + 1]) + Math.abs(before[p + 2] - before[q + 2]);
      if (difference < 90) continue; points++; identity += difference; for (let channel = 0; channel < 3; channel++) mirrored += Math.abs(after[p + channel] - before[q + channel]);
    }
    return { points, identity, mirrored };
  });
  assert(mirrorPixels.points > 100 && mirrorPixels.mirrored < mirrorPixels.identity * .6, '更新後的單側影片沒有真正左右鏡像：' + JSON.stringify(mirrorPixels));
  const mirroredDownload = page.waitForEvent('download'); await page.locator('#reference-follow-download').click(); const mirroredFile = await mirroredDownload;
  const mirroredPath = 'output/playwright/result-reference-mirrored-' + runId + '.' + mirroredFile.suggestedFilename().split('.').pop(); await mirroredFile.saveAs(mirroredPath); downloads.push({ side: 'reference-mirrored', path: mirroredPath });
  // 失敗換片不丟結果；成功換片也保留舊下載並明確標記來源已不同。
  await page.locator('#self-file').setInputFiles('output/media-probe/player/corrupt.mp4'); await idle();
  assert(await page.locator('#self-follow-download').getAttribute('href') === oldSelf && !(await page.locator('#self-follow-result-status').textContent()).includes('先前'), '壞檔改掉結果歸屬');
  await page.locator('#self-file').setInputFiles('output/follow/self.mp4'); await idle();
  assert(await page.locator('#self-follow-download').getAttribute('href') === oldSelf && (await page.locator('#self-follow-result-status').textContent()).includes('先前'), '換片未保留並標示舊結果');
  for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '獨立結果框窄版溢出'); }
  const screenshot = 'output/playwright/follow-results-' + runId + '.png'; await page.setViewportSize({ width: 1440, height: 1100 }); await page.locator('.players').screenshot({ path: screenshot });
  const mobileScreenshot = 'output/playwright/follow-results-mobile-' + runId + '.png'; await page.setViewportSize({ width: 390, height: 844 }); await page.locator('.follow-result').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: mobileScreenshot });
  assert(requests.every(r => r.method === 'GET' && (r.url.startsWith(origin + '/') || r.url.startsWith('blob:'))), '單側製作有外部請求或上傳');
  return { downloads, screenshot, mobileScreenshot, mirrorPixels, nativeIndependentPlayers: true, sourceAndMetadataPreserved: true, stopWorks: true, cancelAndEncoderFailurePreserved: true, suspendedAudioCancelPreserved: true, mirrorRefreshPerSide: true, replacedSourceMarked: true };
}
