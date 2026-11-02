/* 用途：合成串流診斷的有界生命週期；層：QA，不隨產品分發；關聯：capture-content.html、captureLifecycle.test.ts。 */
export const limits = Object.freeze({ play: 2000, observe: 5000, stop: 2000, cleanup: 2000, duration: 3000 });

// Safari要求Window receiver；薄包裝保留原生呼叫方式，也讓回歸檢驗這個限制。
export const frameScheduler = window => ({ raf: callback => window.requestAnimationFrame(callback), caf: id => window.cancelAnimationFrame(id) });

export function bounded(task, ms, label, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(signal.reason ?? Error('interrupted'));
    const timer = setTimeout(() => finish(Error(label + ' timeout')), ms);
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(task).then(value => finish(null, value), error => finish(error));
  });
}
const errorInfo = error => ({ name: error?.name ?? 'Error', message: error?.message ?? String(error) });

// 與原生頁共用整條順序；測試替換外部 API，不能另寫一條永遠成功的假流程。
export async function runCapture(env, timing = limits) {
  const result = { firstError: null, cleanupErrors: [], cleanup: [], paintLog: [], requests: [], captureMetadata: [], blobs: [], visibility: [] };
  let stream, audio, recorder, raf, rvfc, sourceStarted = false, accepting = true, producing = true, start = null, lastCapture = null;
  const interrupt = new AbortController();
  const cancel = error => { if (!interrupt.signal.aborted) interrupt.abort(error); };
  const unlisten = env.onInterrupt(cancel);
  const wait = (task, ms, label) => bounded(task, ms, label, interrupt.signal);
  let endFrames, finishRecording;
  const framesDone = new Promise(resolve => { endFrames = resolve; });
  const stopped = new Promise(resolve => { finishRecording = resolve; });
  let stopObserved = false;
  const cleanup = async (name, task) => {
    try { await bounded(task, timing.cleanup, name); result.cleanup.push({ name, ok: true }); }
    catch (error) { const detail = { name, error: errorInfo(error) }; result.cleanupErrors.push(detail); result.cleanup.push({ ...detail, ok: false }); }
  };
  const step = () => {
    if (!producing) return;
    try {
      result.visibility.push({ now: env.now(), state: env.visible() });
      if (env.visible() !== 'visible') throw Error('page hidden');
      if (start !== null && env.now() - start >= timing.duration) { endFrames(); return; }
      env.paint(result, audio, start);
      const before = env.now(); stream.getVideoTracks()[0].requestFrame();
      result.requests.push({ id: result.paintLog.at(-1).id, before, after: env.now() });
      raf = env.raf(step);
    } catch (error) { cancel(error); }
  };
  const callback = (now, metadata) => {
    if (!accepting) return;
    const entry = { callbackNow: now, entered: env.now(), metadata: env.snapshot(metadata) };
    try {
      entry.pixels = env.readPixels();
      const capture = metadata.captureTime;
      if (typeof capture !== 'number' || !Number.isFinite(capture) || capture <= 0 || lastCapture !== null && capture <= lastCapture) throw Error('native captureTime missing/invalid/nonincreasing');
      lastCapture = capture;
    } catch (error) { entry.error = errorInfo(error); cancel(error); }
    entry.exited = env.now(); result.captureMetadata.push(entry);
    if (!interrupt.signal.aborted) rvfc = env.video.requestVideoFrameCallback(callback);
  };
  try {
    stream = env.makeStream(result);
    if (env.makeAudio) { audio = env.makeAudio(); audio.prepare(stream); await wait(() => audio.clock.resume(), timing.play, 'audio resume'); }
    env.video.srcObject = stream;
    result.originalStreamVideo = env.video.srcObject === stream;
    rvfc = env.video.requestVideoFrameCallback(callback);
    // play 可能等首影格；必須先排生產者，不能把首影格排在 await play 後面。
    raf = env.raf(step);
    result.playCall = env.now();
    await wait(() => env.video.play(), timing.play, 'direct video play');
    result.playResolved = env.now();
    recorder = env.makeRecorder(stream);
    result.originalStreamRecorder = recorder.stream === stream;
    recorder.ondataavailable = event => { if (accepting) { env.chunk(event.data); result.blobs.push({ timecode: event.timecode, received: env.now(), bytes: event.data.size }); } };
    recorder.onstop = () => { stopObserved = true; finishRecording(); };
    recorder.onerror = event => { if (accepting) cancel(event.error ?? Error('recorder error')); };
    result.recordStartCall = env.now(); recorder.start(); result.recordStartReturned = env.now();
    start = env.now(); result.observationStart = start;
    if (audio) {
      result.audioBase = audio.clock.currentTime + .3;
      result.audioScheduleCall = { before: env.now(), audioNow: audio.clock.currentTime, when: result.audioBase + env.delay };
      audio.start(result.audioBase + env.delay); sourceStarted = true;
      result.audioScheduleCall.after = env.now();
    }
    await wait(() => framesDone, timing.observe, 'observation');
    producing = false; result.stopCall = env.now();
    if (recorder.state !== 'inactive') recorder.stop();
    await wait(() => stopped, timing.stop, 'recorder stop');
    result.stopObserved = stopObserved;
    result.media = await wait(() => env.saveMedia(recorder, result), timing.stop, 'media receipt');
  } catch (error) { result.firstError = errorInfo(error); }
  finally {
    // 先封住外部事件，再逐項收尾；任何一步出錯都不能蓋掉第一個例外或跳過後續資源。
    producing = false; accepting = false;
    await cleanup('listeners', () => unlisten());
    await cleanup('animation frame', () => env.caf(raf));
    await cleanup('video frame callback', () => { if (rvfc !== undefined) env.video.cancelVideoFrameCallback(rvfc); });
    await cleanup('video pause', () => env.video.pause());
    await cleanup('video detach', () => { env.video.srcObject = null; });
    if (recorder) {
      await cleanup('recorder stop', () => { if (recorder.state !== 'inactive') recorder.stop(); });
      if (!stopObserved && recorder.state === 'inactive') await cleanup('recorder drain', () => stopped);
      recorder.onstop = recorder.ondataavailable = recorder.onerror = null;
    }
    if (sourceStarted) await cleanup('audio source stop', () => audio.stop());
    // 逐軌獨立嘗試，不能讓一軌 stop 失敗阻止另一軌與 AudioContext 收尾。
    const tracks = [...(stream?.getTracks() ?? []), ...(audio?.tracks ?? [])];
    for (const [index, track] of [...new Set(tracks)].entries()) await cleanup('track ' + index, () => track.stop());
    if (audio) await cleanup('audio close', () => audio.clock.close());
    result.tracks = [...new Set(tracks)].map(track => ({ kind: track.kind, state: track.readyState }));
    result.stopObserved = stopObserved;
    result.audioState = audio?.clock.state ?? null;
    result.videoDetached = env.video.srcObject === null;
    result.resourceEnd = env.now(); result.sourceStarted = sourceStarted;
  }
  // POST 的內容先凍結；逾時後的 play、rVFC、dataavailable 都不能回寫已結束收據。
  const receipt = JSON.parse(JSON.stringify(result));
  let publication;
  try { await bounded(() => env.publish(receipt), timing.stop, 'result receipt'); publication = { ok: true }; }
  catch (error) { publication = { ok: false, error: errorInfo(error) }; }
  return { receipt, publication };
}
