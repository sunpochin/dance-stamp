/* 檔案用途：用既有編碼工具製作帶原片聲音的單側跟隨影片。所在層：本機媒體流程。主要關聯：follow.js、recorder.js、local-audio.js、follow-ui.js。 */
import { load, seek, presentedFrame, record, mediaAction } from './recorder.js';
import { safariAudio, decodeLocalAudio } from './local-audio.js';
import { drawFollow, followSize } from './follow.js';

/** @param {Blob} file @param {import('./follow').Track} track @param {boolean} mirror @param {AbortSignal} parentSignal @param {(fraction:number)=>void} progress */
export async function exportFollow(file, track, mirror, parentSignal, progress) {
  const controller = new AbortController(), signal = controller.signal, cancel = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener('abort', cancel, { once: true }); if (parentSignal.aborted) cancel();
  const video = document.createElement('video'), canvas = document.createElement('canvas'), bounded = safariAudio();
  video.playsInline = true; video.muted = bounded;
  let audio, source, destination, bufferSource, stream, recording, audioStart = 0;
  const url = URL.createObjectURL(file), hidden = () => { if (document.hidden) controller.abort(new Error('離開前景，已停止製作跟隨結果；上次結果保留。')); };
  document.addEventListener('visibilitychange', hidden);
  try {
    signal.throwIfAborted();
    const durationMs = (track.end - track.start) * 1000;
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 60_001) throw new Error('單側跟隨結果每次最多 60 秒，請縮短片段後重新框選。');
    await load(video, url, signal);
    Object.assign(canvas, followSize(video, track));
    const context = canvas.getContext('2d', { alpha: false }); if (!context) throw new Error('無法建立跟隨結果畫面。');
    audio = new AudioContext();
    // resume 可能一直等待原生允許；沿既有事件期限與取消收尾，不讓停止鍵被未完成承諾卡住。
    if (audio.state !== 'running') await mediaAction(audio, 'statechange', () => { audio.resume().catch(error => controller.abort(error)); }, signal);
    if (audio.state !== 'running') throw new Error('音訊尚未啟動，請再按一次重試。');
    destination = audio.createMediaStreamDestination();
    if (bounded) {
      const buffer = await decodeLocalAudio(file, audio, track.start, durationMs / 1000, signal);
      if (buffer) { bufferSource = audio.createBufferSource(); bufferSource.buffer = buffer; bufferSource.connect(destination); }
    } else {
      // 每次只把這個臨時播放器接到輸出聲路，不碰原片播放器一生只能建立一次的 AudioNode。
      source = audio.createMediaElementSource(video); source.connect(destination);
    }
    await seek(video, track.start, signal);
    await Promise.all([presentedFrame(video, signal, frame => !bounded || frame.mediaTime > track.start + 0.001), video.play()]);
    video.pause(); await seek(video, track.start, signal, bounded); signal.throwIfAborted();
    drawFollow(context, video, track, mirror);
    stream = canvas.captureStream(0);
    let canvasTrack = /** @type {CanvasCaptureMediaStreamTrack} */ (stream.getVideoTracks()[0]);
    if (typeof canvasTrack.requestFrame !== 'function') { stream.getTracks().forEach(t => { t.stop(); }); stream = canvas.captureStream(30); canvasTrack = /** @type {CanvasCaptureMediaStreamTrack} */ (stream.getVideoTracks()[0]); }
    if (!bounded || bufferSource) destination.stream.getAudioTracks().forEach(t => { stream.addTrack(t.clone()); });
    recording = record(stream, undefined, undefined, { webmOnly: bounded });
    recording.done.catch(error => controller.abort(error));
    audioStart = audio.currentTime + 0.01; bufferSource?.start(audioStart);
    await mediaAction(video, 'playing', () => video.play(), signal);
    const began = performance.now();
    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      let frame, videoFrame, finished = false, lastCapture = -Infinity, lastTime = -1, lastProgress = began;
      const finish = error => {
        if (finished) return; finished = true; cancelAnimationFrame(frame); if (videoFrame !== undefined) video.cancelVideoFrameCallback(videoFrame);
        signal.removeEventListener('abort', aborted); error ? reject(error) : resolve();
      };
      const aborted = () => finish(signal.reason);
      const paint = now => { if (now - lastCapture >= 1000 / 30 - 1) { drawFollow(context, video, track, mirror); canvasTrack.requestFrame?.(); lastCapture = now; } };
      const watch = () => {
        if (!video.requestVideoFrameCallback || finished) return;
        videoFrame = video.requestVideoFrameCallback(() => { if (finished) return; try { paint(performance.now()); watch(); } catch (error) { finish(error); } });
      };
      const tick = () => {
        if (signal.aborted) return aborted();
        const elapsed = (video.currentTime - track.start) * 1000, now = performance.now();
        // 沿用既有 100ms 聲畫護欄；原生 PCM 時鐘停住或領先時不交付錯位影片。
        if (bufferSource && (audio.state !== 'running' || Math.abs((audio.currentTime - audioStart) * 1000 - elapsed) > 100)) return finish(new Error('音訊與畫面偏移超過 100ms，未完成跟隨影片。'));
        if (elapsed >= durationMs - 20 || video.ended && elapsed >= durationMs - 100) return finish();
        if (video.paused || video.ended) return finish(new Error('原片播放提前中斷，跟隨結果未完成。'));
        if (elapsed > lastTime + 1) { lastTime = elapsed; lastProgress = now; }
        if (now - lastProgress > 1000 || now - began > durationMs + 10_000) return finish(new Error('原片播放停滯，跟隨結果未完成。'));
        try { paint(now); progress(Math.max(0, Math.min(1, elapsed / durationMs))); } catch (error) { return finish(error); }
        frame = requestAnimationFrame(tick);
      };
      signal.addEventListener('abort', aborted, { once: true }); if (signal.aborted) aborted(); else { watch(); tick(); }
    }));
    video.pause(); if (bufferSource) { bufferSource.stop(); bufferSource.disconnect(); bufferSource.buffer = null; }
    const blob = await recording.stop(); signal.throwIfAborted();
    const validation = document.createElement('video'), resultUrl = URL.createObjectURL(blob); validation.muted = true; validation.playsInline = true;
    try {
      await load(validation, resultUrl, signal);
      if (Math.abs(validation.duration * 1000 - durationMs) > 100 || validation.videoWidth !== canvas.width || validation.videoHeight !== canvas.height) throw new Error('跟隨影片的片長或尺寸不符，上次結果保留。');
    } finally { validation.removeAttribute('src'); validation.load(); URL.revokeObjectURL(resultUrl); }
    signal.throwIfAborted(); progress(1); return blob;
  } finally {
    parentSignal.removeEventListener('abort', cancel); document.removeEventListener('visibilitychange', hidden);
    video.pause(); if (bufferSource) { try { bufferSource.stop(); } catch { /* 尚未排程或已停止仍須斷線。 */ } bufferSource.disconnect(); bufferSource.buffer = null; }
    if (recording) await recording.stop().catch(() => {});
    stream?.getTracks().forEach(t => { t.stop(); }); source?.disconnect(); destination?.stream.getTracks().forEach(t => { t.stop(); }); destination?.disconnect();
    if (audio && audio.state !== 'closed') await audio.close().catch(() => {});
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
  }
}
