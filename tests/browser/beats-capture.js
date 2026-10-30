/* 檔案用途：合成相機驗證三速度拍數倒數、取消與既有中斷鎖。所在層：隔離瀏覽器回歸。主要關聯：main.js、beats.js、capture.js。 */
// 相機設定已收在選用區；先展開，再沿用原本的錄影與資料保護斷言。
async (page) => {
  const origin = new URL(page.url()).origin, results = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  await page.addInitScript(() => {
    window.confirm = () => true; window.beatCameraTracks = []; window.beatRequests = []; window.beatTones = []; window.beatStarts = [];
    // 不轉呼叫原生 getUserMedia；此頁所有相機畫面都來自自製 canvas，沒有硬體權限。
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.beatRequests.push(constraints);
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const context = canvas.getContext('2d'); let frame = 0;
      const paint = () => { context.fillStyle = frame++ % 2 ? '#346352' : '#172d35'; context.fillRect(0, 0, 320, 180); context.fillStyle = '#fff'; context.fillText(String(frame), 20, 40); };
      paint(); const timer = setInterval(paint, 33), stream = canvas.captureStream(30);
      for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); }; window.beatCameraTracks.push(track); }
      return stream;
    };
    const NativeAudio = AudioContext, NativeRecorder = MediaRecorder;
    window.AudioContext = class extends NativeAudio {
      constructor(...args) { super(...args); window.beatAudio = this; }
      createOscillator() {
        const node = super.createOscillator(), start = node.start.bind(node), stop = node.stop.bind(node), disconnect = node.disconnect.bind(node);
        const observed = { stopped: false, disconnected: false }; window.beatTones.push(observed);
        node.start = at => { observed.at = at; start(at); };
        node.stop = at => { if (at === undefined) observed.stopped = true; stop(at); };
        node.disconnect = () => { observed.disconnected = true; disconnect(); }; return node;
      }
    };
    window.MediaRecorder = class extends NativeRecorder { start(...args) { window.beatStarts.push({ at: window.beatAudio.currentTime, source: document.getElementById('reference').currentTime }); super.start(...args); } };
  });
  await page.goto(origin); await page.locator('#reference-file').setInputFiles('output/beats/reference.mp4'); await idle();
  await page.locator('#practice details summary').click();
  await page.locator('#beat-bpm').fill('120'); await page.locator('#beat-first').fill('0.35'); await page.locator('#beat-count-in').selectOption('4'); await page.locator('#beat-save').click(); await idle();
  await page.locator('#practice-rate').selectOption('2');
  for (const rate of [0.5, 0.75, 1]) {
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#new-take').click(); await idle();
    await page.locator('#start').fill('0.35'); await page.locator('#end').fill(String(0.35 + 15 * rate)); await page.locator('#rate').selectOption(String(rate));
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle(); await page.locator('#capture').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('拍後開始'));
    assert(await page.evaluate(() => ['beat-bpm', 'beat-first', 'beat-count-in', 'start', 'end', 'rate', 'practice-rate'].every(id => document.getElementById(id).matches(':disabled')) && document.getElementById('reference').paused), '倒數未鎖設定或提前播放');
    await page.locator('#stop').click(); await idle();
    assert(await page.evaluate(() => window.beatTones.every(t => t.stopped && t.disconnected) && window.beatCameraTracks.every(t => t.readyState === 'ended') && window.beatStarts.length === 0), '取消留下提示音、相機或仍開始錄影');
  }
  for (const rate of [0.5, 0.75, 1]) {
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#new-take').click(); await idle();
    await page.locator('#start').fill('0.35'); await page.locator('#end').fill(String(0.35 + 15 * rate)); await page.locator('#rate').selectOption(String(rate));
    await page.evaluate(() => { window.beatTones = []; window.beatStarts = []; });
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle(); await page.locator('#capture').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'), null, { timeout: 10000 });
    assert(await page.evaluate(() => ['beat-bpm', 'beat-save', 'start', 'end', 'rate'].every(id => document.getElementById(id).matches(':disabled'))), '錄影中設定解鎖');
    await page.waitForFunction(() => !document.getElementById('controls').disabled, null, { timeout: 22000 });
    const result = await page.evaluate(async () => {
      const storage = await import('/storage.js'), data = (await storage.readLibrary()).data, take = data.takes.at(-1), blob = await storage.readMedia(take.cameraAssetId);
      return { take, bytes: blob?.size, decodedMs: document.getElementById('self').duration * 1000, tones: window.beatTones, started: window.beatStarts[0], rateAfter: document.getElementById('reference').playbackRate, closed: window.beatCameraTracks.every(t => t.readyState === 'ended') };
    });
    const first = result.tones[0].at, startDelay = (result.started.at - first) * 1000, expected = 2000 / rate;
    assert(startDelay >= expected - 10 && startDelay - expected < 150, `倒數跟錄影速度不符 ${rate}: ${startDelay}`);
    assert(result.tones.length === 4 && result.tones.every((t, i) => Math.abs((t.at - first) * 1000 - i * 500 / rate) < 0.01 && t.stopped && t.disconnected), '提示音間隔或清理不符');
    assert(result.take.rate === rate && result.take.state === 'ready' && result.take.beatGrid.firstBeatMs === 350 && result.bytes > 0 && Math.abs(result.decodedMs - 15000) < 200 && result.rateAfter === 2 && result.closed, `錄影保存／快照／速度恢復失敗 ${JSON.stringify(result)}`);
    results.push({ rate, startDelayMs: startDelay, decodedMs: result.decodedMs, bytes: result.bytes });
  }
  // 倒數完成後模擬既有 freeze 中斷；#9 的原片與恢復狀態仍應保留。
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#new-take').click(); await idle(); await page.locator('#end').fill('15.35');
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle(); await page.locator('#capture').click(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
  await page.waitForTimeout(1100); await page.evaluate(() => document.dispatchEvent(new Event('freeze'))); await idle();
  assert(await page.evaluate(async () => { const data = (await (await import('/storage.js')).readLibrary()).data; return data.takes.at(-1).state === 'interrupted' && window.beatTones.every(t => t.disconnected) && window.beatCameraTracks.every(t => t.readyState === 'ended'); }), '既有中斷恢復遭破壞');
  await page.locator('#beat-clear').click(); await idle(); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#new-take').click(); await idle(); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
  const count = await page.evaluate(() => window.beatTones.length); await page.locator('#capture').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('秒後開始')); await page.locator('#stop').click(); await idle();
  assert(await page.evaluate(count => window.beatRequests.every(c => c.audio === false) && window.beatTones.length === count && window.beatCameraTracks.every(t => t.readyState === 'ended'), count), '秒數備援仍產生拍數聲音或請求麥克風');
  return { threeRates: results, countdownCancelAndLocks: true, freezeKeepsInterrupted: true, secondsFallbackAndNoMicrophone: true };
}
