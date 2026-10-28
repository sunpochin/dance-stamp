/* 檔案用途：量測桌面練習循環邊界與媒體生命週期。所在層：合成媒體瀏覽器驗收。主要關聯：main.js、ACCEPTANCE.md、issue-8-practice-loop.md。 */
async (page) => {
  const origin = new URL(page.url()).origin, checks = {};
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  const stage = value => page.evaluate(value => { window.practiceStage = value; }, value);
  await page.addInitScript(() => {
    const frames = new Map(), nativeFrame = HTMLVideoElement.prototype.requestVideoFrameCallback, nativeCancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
    const clock = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    window.practiceEvidence = { frames, maximumFrames: 0, overlappingSeeks: 0, trial: null };
    window.practiceNativeFrame = nativeFrame;
    window.practiceNativeCancel = nativeCancel;
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
      if (this.id !== 'reference') return nativeFrame.call(this, callback);
      const id = nativeFrame.call(this, (now, metadata) => { frames.delete(id); callback(now, metadata); });
      frames.set(id, true); window.practiceEvidence.maximumFrames = Math.max(window.practiceEvidence.maximumFrames, frames.size); return id;
    };
    HTMLVideoElement.prototype.cancelVideoFrameCallback = function(id) { if (this.id === 'reference') frames.delete(id); return nativeCancel.call(this, id); };
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { ...clock, set(value) {
      if (this.id === 'reference') {
        const evidence = window.practiceEvidence, trial = evidence.trial, from = clock.get.call(this);
        // 取消後 seeked 可能晚到；用原生 seeking 判斷是否重疊，不把觀察器舊旗標當成仍在跳轉。
        if (this.seeking) { evidence.overlappingSeeks++; (evidence.overlapDetails ??= []).push({ stage: window.practiceStage, from, to: value }); }
        if (trial && Math.abs(value - trial.a) < 0.001) {
          // 第一次是開始定位；其後才計算越過 B 的媒體時間，另獨立觀察呈現影格。
          if (trial.started && from >= trial.b) trial.rewinds.push({ from, overshootMs: (from - trial.b) * 1000 });
          trial.started = true;
        }
      }
      clock.set.call(this, value);
    } });
  });
  await page.goto(origin); await page.bringToFront();
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  const speedSamples = [];
  for (const rate of ['0.5', '0.75', '1', '1.25', '1.5', '2']) {
    await page.locator('#practice-rate').selectOption(rate);
    const result = await page.locator('#reference').evaluate(async video => {
      await video.play(); const before = video.currentTime; await new Promise(r => setTimeout(r, 200)); video.pause();
      return { rate: video.playbackRate, advance: video.currentTime - before, pitch: video.preservesPitch };
    });
    assert(result.rate === Number(rate) && result.advance > 0 && result.pitch === true, `速度 ${rate} 未實播或音高設定失敗`);
    speedSamples.push(result);
  }
  checks.sixRatesActuallyPlay = speedSamples;
  const trials = [];
  for (const tail of [false, true]) for (const rate of ['0.5', '1', '2']) {
    await stage(`matrix:${tail ? 'tail' : 'middle'}:${rate}`);
    const a = tail ? 64.75 : 1, b = tail ? 65 : 1.25;
    await page.locator('#start').fill(String(a)); await page.locator('#end').fill(String(b));
    await page.locator('#practice-rate').selectOption(rate);
    await page.evaluate(({ a, b }) => {
      const video = document.getElementById('reference'), evidence = window.practiceEvidence;
      evidence.trial = { a, b, started: false, rewinds: [], displayedOvershootMs: 0 };
      const observe = (_, metadata) => {
        if (!evidence.trial) return;
        evidence.trial.displayedOvershootMs = Math.max(evidence.trial.displayedOvershootMs, (metadata.mediaTime - b) * 1000);
        window.practiceObserver = window.practiceNativeFrame.call(video, observe);
      };
      window.practiceObserver = window.practiceNativeFrame.call(video, observe);
    }, { a, b });
    await page.locator('#loop').click();
    await page.waitForFunction(() => window.practiceEvidence.trial.rewinds.length >= 20, null, { timeout: 30_000 });
    await page.locator('#loop').click();
    const result = await page.evaluate(() => {
      const video = document.getElementById('reference'), evidence = window.practiceEvidence, trial = evidence.trial;
      window.practiceNativeCancel.call(video, window.practiceObserver); evidence.trial = null;
      return { loops: trial.rewinds.length, maximumBoundaryMs: Math.max(...trial.rewinds.map(r => r.overshootMs)), maximumDisplayedMs: trial.displayedOvershootMs, callbacks: evidence.frames.size, paused: video.paused, rate: video.playbackRate };
    });
    assert(result.loops >= 20 && result.maximumBoundaryMs <= 150 && result.maximumDisplayedMs <= 150, `循環邊界超標：${JSON.stringify(result)}`);
    assert(result.callbacks === 0 && result.paused && result.rate === Number(rate), '停止未清理或速度重設');
    trials.push({ tail, rate: Number(rate), ...result });
    await page.evaluate(result => { window.practiceTrials ??= []; window.practiceTrials.push(result); }, trials.at(-1));
  }
  checks.twentyLoopsAtEachSpeedAndTail = trials;
  await stage('startup-cancel');
  await page.locator('#start').fill('1'); await page.locator('#end').fill('2');
  await page.evaluate(() => {
    document.getElementById('reference').addEventListener('seeked', event => { event.stopImmediatePropagation(); window.practiceSeekDelayed = true; }, { once: true, capture: true });
  });
  await page.locator('#loop').click(); await page.waitForFunction(() => window.practiceSeekDelayed);
  await page.locator('#stop').click();
  await page.evaluate(() => document.getElementById('reference').dispatchEvent(new Event('seeked')));
  await page.waitForTimeout(100);
  assert(await page.locator('#reference').evaluate(v => v.paused && window.practiceEvidence.frames.size === 0), '晚到 seek 讓取消後重新播放');
  checks.cancelDuringStartup = true;
  await stage('play-rejection');
  await page.locator('#reference').evaluate(video => { video.play = () => Promise.reject(new Error('合成播放拒絕')); });
  await page.locator('#loop').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('合成播放拒絕'));
  assert(await page.locator('#reference').evaluate(v => v.paused && window.practiceEvidence.frames.size === 0), '播放拒絕留下 callback');
  await page.locator('#reference').evaluate(video => { delete video.play; });
  checks.playRejectionCleansUp = true;
  await stage('manual-seek');
  await page.locator('#loop').click(); await page.waitForFunction(() => !document.getElementById('reference').paused);
  await page.locator('#reference').evaluate(async video => { video.currentTime = 4; await new Promise(r => video.addEventListener('seeked', r, { once: true })); });
  assert((await page.locator('#status').textContent()).includes('手動跳轉') && await page.locator('#reference').evaluate(v => v.paused && window.practiceEvidence.frames.size === 0), '手動 seek 未停止或與循環打架');
  checks.manualSeekStopsLoop = true;
  await stage('mirror');
  await page.locator('#practice-mirror').check();
  const mirror = await page.evaluate(() => {
    const video = document.getElementById('reference'), mirrored = document.getElementById('practice-canvas');
    const original = document.createElement('canvas'); original.width = mirrored.width; original.height = mirrored.height;
    const context = original.getContext('2d'); context.drawImage(video, 0, 0, original.width, original.height);
    const pixels = context.getImageData(0, 0, original.width, original.height).data, reflected = mirrored.getContext('2d').getImageData(0, 0, mirrored.width, mirrored.height).data;
    let same = 0, flipped = 0;
    for (let y = 60; y < 480; y += 37) for (let x = 60; x < 900; x += 43) for (let c = 0; c < 3; c++) {
      same += Math.abs(pixels[(y * 960 + x) * 4 + c] - reflected[(y * 960 + x) * 4 + c]);
      flipped += Math.abs(pixels[(y * 960 + 959 - x) * 4 + c] - reflected[(y * 960 + x) * 4 + c]);
    }
    return { same, flipped, controlTransform: getComputedStyle(document.getElementById('practice-rate')).transform, videoTransform: getComputedStyle(video).transform };
  });
  assert(mirror.flipped < mirror.same * 0.1 && mirror.controlTransform === 'none' && mirror.videoTransform === 'none', `鏡像畫面或控制翻轉不正確：${JSON.stringify(mirror)}`);
  checks.mirrorPixelsAndUprightControls = mirror;
  await stage('simulated-visibility');
  await page.locator('#loop').click(); await page.waitForFunction(() => !document.getElementById('reference').paused);
  await page.evaluate(() => {
    // 這只驗證 visibility handler；真正分頁背景必須另跑 practice-background.js，不能互相替代。
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    try { document.dispatchEvent(new Event('visibilitychange')); } finally { delete document.hidden; }
  });
  assert(await page.locator('#reference').evaluate(v => v.paused && window.practiceEvidence.frames.size === 0), '可見度事件未停止或清理');
  await page.locator('#loop').click();
  await page.waitForFunction(() => !document.getElementById('reference').paused && document.getElementById('reference').currentTime < 2);
  await page.locator('#stop').click();
  checks.simulatedVisibilityStopAndExplicitRestartAligns = true;
  await stage('capture');
  await page.locator('#rate').selectOption('0.75'); await page.locator('#camera').click(); await idle();
  await page.locator('#capture').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('秒後開始'));
  assert(await page.evaluate(() => ['controls', 'practice'].every(id => document.getElementById(id).disabled) && ['start', 'end', 'rate', 'practice-rate'].every(id => document.getElementById(id).matches(':disabled'))), '倒數錄影未鎖定區間／速度');
  await page.locator('#stop').click(); await idle();
  assert(await page.locator('#reference').evaluate(v => v.playbackRate === 2) && await page.locator('#practice-rate').inputValue() === '2', '取消錄影後練習速度丟失');
  checks.captureLocksAndRestoresPracticeSpeed = true;
  await stage('replacement');
  await page.locator('#loop').click(); await page.waitForFunction(() => !document.getElementById('reference').paused);
  await page.locator('#reference-file').setInputFiles('output/media-probe/short/reference.mp4'); await idle();
  assert(await page.locator('#reference').evaluate(v => v.paused && v.playbackRate === 2 && window.practiceEvidence.frames.size === 0), '切片留下 callback 或速度重設');
  checks.replaceCleansUp = true;
  const ownership = await page.evaluate(() => ({ maximumCallbacks: window.practiceEvidence.maximumFrames, overlappingSeeks: window.practiceEvidence.overlappingSeeks, overlaps: window.practiceEvidence.overlapDetails || [] }));
  assert(ownership.maximumCallbacks <= 1 && ownership.overlappingSeeks === 0, `callback／seek 重疊：${JSON.stringify(ownership)}`);
  checks.ownership = ownership;
  await stage('pagehide');
  await page.locator('#reference').evaluate(video => video.play());
  await page.evaluate(() => window.addEventListener('pagehide', () => sessionStorage.setItem('practiceCleanup', JSON.stringify({ pending: window.practiceEvidence.frames.size, paused: document.getElementById('reference').paused })), { once: true }));
  await page.goto(`${origin}/LICENSE`);
  const cleanup = await page.evaluate(() => JSON.parse(sessionStorage.getItem('practiceCleanup')));
  assert(cleanup.pending === 0 && cleanup.paused, '離頁未清理 callback');
  checks.realPagehideCleansUp = cleanup;
  await page.goto(origin);
  return checks;
}
