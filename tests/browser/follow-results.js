/* 檔案用途：驗雙側原生結果播放器、各自聲音的真下載與更新保全。所在層：合成短功能回歸。主要關聯：follow-ui.js、follow-export.js、make-follow-fixtures.ts。 */
async (page, { boundedAudio = false } = {}) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); }, runId = Date.now().toString(36), downloads = [];
  const origin = new URL(page.url()).origin, requests = [];
  page.context().on('request', request => requests.push({ url: request.url(), method: request.method() }));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('單側結果禁止相機與麥克風'); }; window.confirm = () => true;
    window.followAudioOrder = []; window.followAudioContexts = [];
    const NativeAudioContext = window.AudioContext, NativeWorker = window.Worker;
    // 只旁聽真正建構與呼叫順序；Chrome 自動允許音訊也不能掩蓋 Safari 分析後才啟動的問題。
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) { super(...args); const id = window.followAudioContexts.push(this) - 1; window.followAudioOrder.push({ type: 'created', id, active: navigator.userActivation.isActive }); }
      resume(...args) { window.followAudioOrder.push({ type: 'resume', id: window.followAudioContexts.indexOf(this), active: navigator.userActivation.isActive }); return super.resume(...args); }
      close(...args) { window.followAudioOrder.push({ type: 'close', id: window.followAudioContexts.indexOf(this) }); return super.close(...args); }
    };
    window.Worker = class extends NativeWorker { constructor(...args) { window.followAudioOrder.push({ type: 'worker' }); super(...args); } };
    document.addEventListener('click', event => { if (event.target.closest('button')?.id === 'follow-confirm') window.followAudioOrder.push({ type: 'confirm', trusted: event.isTrusted }); }, true);
  });
  await page.goto(origin);
  // 同一份下載與保全斷言分別跑兩條真供聲路徑，避免只改名稱卻仍測到 Chrome 分支。
  assert(await page.evaluate(async () => (await import('/local-audio.js')).safariAudio()) === boundedAudio, '沒有選到指定的單側結果音訊分支');
  assert(await page.locator('body').getAttribute('data-comparison-only') !== null, '沒有測到預設操作介面');
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await idle();
  for (const [side, file] of [['reference', 'reference'], ['self', 'self-audio']]) { await page.locator('#' + side + '-file').setInputFiles('output/follow/' + file + '.mp4'); await idle(); }
  // 先真正失焦保存片段，再由可見定位尺設 C；保留原 .4／.5 秒時間映射。
  for (const [id, value] of [['start', '.4'], ['end', '3.4']]) { await page.locator('#' + id).fill(value); await page.locator('#' + id).press('Tab'); await idle(); }
  // 原生 range 的填值需有前導 0；時間仍是原本的半秒。
  await page.locator('#self-seek').fill('0.5'); await page.locator('#self-seek').dispatchEvent('input');
  await page.waitForFunction(() => { const video = document.getElementById('self'); return !video.seeking && Math.abs(video.currentTime - .5) < .02; });
  await page.locator('#self-start').click(); await idle();
  const originals = await page.evaluate(() => ['reference', 'self'].map(id => document.getElementById(id).getAttribute('src')));
  const originalTimes = await page.evaluate(() => ['reference', 'self'].map(id => document.getElementById(id).currentTime));
  const stored = await page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data));
  const audioSequences = [];
  for (const side of ['reference', 'self']) {
    assert(await page.locator('#' + side + '-follow-result').isHidden(), '未分析已顯示假結果');
    await page.locator('#' + side + '-follow').click(); await page.waitForFunction(() => document.getElementById('follow-dialog').open); await idle();
    for (const [field, value] of [['width', side === 'reference' ? 37 : 40], ['x', side === 'reference' ? 3.5 : 55], ['y', 2.5], ['height', 95]]) { await page.locator('#follow-' + field).fill(String(value)); await page.locator('#follow-' + field).dispatchEvent('change'); }
    const audioOrderStart = await page.evaluate(() => window.followAudioOrder.length);
    await page.locator('#follow-confirm').click();
    await page.waitForFunction(() => !document.getElementById('follow-dialog').open || !document.getElementById('controls').disabled && document.getElementById('follow-message').textContent.includes('保留'), null, { timeout: 60000 }); await idle();
    assert(!await page.locator('#follow-dialog').evaluate(d => d.open), '結果製作失敗：' + await page.locator('#follow-message').textContent());
    const video = page.locator('#' + side + '-follow-result'); await video.waitFor({ state: 'visible' });
    await page.waitForFunction(id => document.getElementById(id).readyState >= 2, side + '-follow-result');
    const audioOrder = await page.evaluate(start => window.followAudioOrder.slice(start), audioOrderStart);
    const createdAt = audioOrder.findIndex(row => row.type === 'created'), resumedAt = audioOrder.findIndex(row => row.type === 'resume'), workerAt = audioOrder.findIndex(row => row.type === 'worker');
    assert(audioOrder[0]?.type === 'confirm' && audioOrder[0].trusted && createdAt > 0 && resumedAt > createdAt && resumedAt < workerAt && audioOrder[createdAt].active && audioOrder[resumedAt].active, '音訊沒有在真正確認手勢內、人物分析前啟動：' + JSON.stringify(audioOrder));
    assert(await page.evaluate(id => window.followAudioContexts[id].state === 'closed', audioOrder[createdAt].id), '正常完成未關閉預先啟動的音訊');
    audioSequences.push({ side, order: audioOrder });
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
  // 音訊現在早於分析存在，分析取消及尚未交付製片的失敗也必須關閉它並保留舊結果。
  await page.locator('#reference-follow').click(); await idle();
  await page.locator('#follow-confirm').click();
  await page.waitForFunction(() => document.getElementById('follow-controls').disabled);
  await page.locator('#follow-cancel').click(); await idle();
  assert(await page.evaluate(() => window.followAudioContexts.at(-1).state === 'closed'), '分析取消遺留預先啟動的音訊');
  assert(await page.locator('#reference-follow-download').getAttribute('href') === oldTeacher && await page.locator('#self-follow-download').getAttribute('href') === oldSelf, '分析取消破壞舊結果');
  await page.locator('#follow-cancel').click();
  // 建構就失敗時還沒有可關閉的環境；必須在建立 Worker 前停止，避免整合時漏掉早停保護。
  const beforeAudioFailure = await page.evaluate(() => ({ contexts: window.followAudioContexts.length, workers: window.followAudioOrder.filter(row => row.type === 'worker').length }));
  await page.evaluate(() => { window.followConstructorAudio = window.AudioContext; window.AudioContext = class { constructor() { throw new Error('Synthetic follow audio construction failure'); } }; });
  await page.locator('#reference-follow').click(); await idle(); await page.locator('#follow-confirm').click(); await idle();
  assert((await page.locator('#follow-message').textContent()).includes('Synthetic follow audio construction failure') && (await page.locator('#follow-metrics-report').textContent()).includes('失敗'), '音訊建構失敗沒有回報真正失敗');
  assert(await page.evaluate(before => window.followAudioContexts.length === before.contexts && window.followAudioOrder.filter(row => row.type === 'worker').length === before.workers, beforeAudioFailure), '建立音訊失敗仍啟動人物分析或遺留額外環境');
  assert(await page.locator('#reference-follow-download').getAttribute('href') === oldTeacher && await page.locator('#self-follow-download').getAttribute('href') === oldSelf, '音訊建構失敗破壞舊結果');
  assert(await page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data)) === stored && await page.evaluate(times => ['reference', 'self'].every((id, index) => document.getElementById(id).paused && Math.abs(document.getElementById(id).currentTime - times[index]) < .001), originalTimes), '音訊建構失敗改動資料或原片位置');
  await page.locator('#follow-cancel').click(); await page.evaluate(() => { window.AudioContext = window.followConstructorAudio; });
  await page.evaluate(() => { window.followOriginalWorker = window.Worker; window.Worker = class { constructor() { throw new Error('Synthetic follow worker startup failure'); } }; });
  await page.locator('#reference-follow').click(); await idle(); await page.locator('#follow-confirm').click(); await idle();
  assert((await page.locator('#follow-message').textContent()).includes('Synthetic follow worker startup failure'), '沒有命中分析啟動失敗');
  assert(await page.evaluate(() => window.followAudioContexts.at(-1).state === 'closed'), '分析啟動失敗遺留預先啟動的音訊');
  assert(await page.locator('#reference-follow-download').getAttribute('href') === oldTeacher && await page.locator('#self-follow-download').getAttribute('href') === oldSelf, '分析失敗破壞舊結果');
  await page.locator('#follow-cancel').click(); await page.evaluate(() => { window.Worker = window.followOriginalWorker; });
  // 控制真正環境的 resume 拒絕，不偽造成功；報告須列失敗，不能誤列使用者取消。
  await page.evaluate(async () => {
    window.followOriginalAudio = window.AudioContext; window.followRejectedAudio = new window.AudioContext(); await window.followRejectedAudio.suspend();
    window.followRejectedAudio.resume = () => Promise.reject(new Error('Synthetic follow audio activation failure'));
    window.AudioContext = function() { return window.followRejectedAudio; };
  });
  await page.locator('#reference-follow').click(); await idle(); await page.locator('#follow-confirm').click(); await idle();
  assert((await page.locator('#follow-message').textContent()).includes('Synthetic follow audio activation failure') && (await page.locator('#follow-metrics-report').textContent()).includes('失敗'), '音訊拒絕沒有回報真正失敗');
  assert(await page.evaluate(() => window.followRejectedAudio.state === 'closed'), '音訊拒絕遺留未交付環境');
  assert(await page.locator('#reference-follow-download').getAttribute('href') === oldTeacher && await page.locator('#self-follow-download').getAttribute('href') === oldSelf, '音訊拒絕破壞舊結果');
  await page.locator('#follow-cancel').click(); await page.evaluate(() => { window.AudioContext = window.followOriginalAudio; });
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
  assert(await page.evaluate(() => window.followAudioContexts.every(context => context.state === 'closed')), '操作收尾後仍有音訊環境未關閉');
  for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '獨立結果框窄版溢出'); }
  const screenshot = 'output/playwright/follow-results-' + runId + '.png'; await page.setViewportSize({ width: 1440, height: 1100 }); await page.locator('.players').screenshot({ path: screenshot });
  const mobileScreenshot = 'output/playwright/follow-results-mobile-' + runId + '.png'; await page.setViewportSize({ width: 390, height: 844 }); await page.locator('.follow-result').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: mobileScreenshot });
  assert(requests.every(r => r.method === 'GET' && (r.url.startsWith(origin + '/') || r.url.startsWith('blob:'))), '單側製作有外部請求或上傳');
  return { downloads, screenshot, mobileScreenshot, mirrorPixels, audioSequences, audioBeforeAnalysis: true, audioConstructorFailurePreserved: true, analysisCancelAndStartupFailureCloseAudio: true, audioRejectionReportedAsFailure: true, nativeIndependentPlayers: true, sourceAndMetadataPreserved: true, stopWorks: true, cancelAndEncoderFailurePreserved: true, suspendedAudioCancelPreserved: true, mirrorRefreshPerSide: true, replacedSourceMarked: true, selectedWebKitAudioBranch: boundedAudio, safariDeviceAcceptance: false };
}
