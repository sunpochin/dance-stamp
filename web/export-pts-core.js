/* 用途：依原共同時間線逐格合成完整合法片段。所在層：專用 Worker 匯出。關聯：comparison-renderer.js、pts-audio.js、pts-plan.js、Mediabunny1.65.0。 */
import { Input, BlobSource, MP4, QTFF, WEBM, MATROSKA, VideoSampleSink, AudioSampleSink, AudioSample, AudioSampleSource, CanvasSource, Output, Mp4OutputFormat, BufferTarget, AppendOnlyStreamTarget, Quality, canEncodeVideo, canEncodeAudio } from './mediabunny.js';
import { drawSideBySide, drawOverlay } from './comparison-renderer.js';
import { exportPlan, outputFrames, validateFrame, validateSourceRange, validateTrack, FPS, AUDIO_RATE } from './pts-plan.js';
import { pcmCursor, copyPcm } from './pts-audio.js';
import { auditEdits } from './pts-input.js';
import { useSamples, runProducer, closeSource } from './pts-lifecycle.js';

/** @param {import('./pts-types').Request} request @param {AbortSignal} signal @param {(value: import('./pts-types').Progress) => void} [progress] */
export async function exportPts(request, signal, progress = () => {}) {
  const { reference, self, recipe, presentation, tracks = {}, targetMode = 'buffer' } = request;
  const plan = exportPlan(recipe), inputs = [], iterators = [];
  /** @type {import('./pts-types').Diagnostics} */
  const diagnostics = { backend: 'explicit-pts', recipe: { ...recipe }, plannedDurationMs: plan.durationMs,
    submittedFrames: 0, sourceVideoFrameCloseCalls: 0, audio: null, sources: [], cleanupErrors: [],
    selectedPresentationLagMs: { reference: 0, self: 0 }, checkpoints: [],
    memoryPolicy: { targetMode, retainedEncodedWholeFile: true, pcmCopyChunkBytes: 4 * 1024 * 1024, libraryResamplerSeconds: 5, fullPcmNotRetained: true, peakMemoryVerified: false },
    measurements: 'source-PTS scheduling only; encoded pixel/AV quality independently unverified' };
  let output, videoSource, audioSource, firstError, failed = false, candidate, cancelPromise, heldAudio;
  const remember = error => { if (!failed) { failed = true; firstError = error; } };
  const check = () => { if (failed) throw firstError; signal.throwIfAborted(); };
  const checked = async work => { check(); const value = await work(); check(); return value; };
  const cleanup = async (name, work) => { try { await work(); } catch (error) { remember(error); diagnostics.cleanupErrors.push({ name, error: error instanceof Error ? error.name : 'Error' }); } };
  const close = sample => { if (!sample) return; try { sample.close(); } catch (error) { remember(error); diagnostics.cleanupErrors.push({ name: 'sample.close', error: error instanceof Error ? error.name : 'Error' }); } };
  const next = async iterator => {
    check(); const item = await iterator.next();
    try { check(); return item; } catch (error) { remember(error); close(item.value); throw error; }
  };
  const stop = () => {
    for (const input of inputs) { try { input.dispose(); } catch (error) { remember(error); diagnostics.cleanupErrors.push({ name: 'input.dispose.onStop', error: error instanceof Error ? error.name : 'Error' }); } }
    if (output && !cancelPromise) cancelPromise = cleanup('output.cancel', () => output.cancel());
  };
  const aborted = () => { remember(signal.reason); stop(); };
  signal.addEventListener('abort', aborted, { once: true });
  const began = performance.now();
  let encodedBytes = 0, maximumPcmChunkFrames = 0;
  try {
    check();
    if (!(reference instanceof Blob) || !reference.size || !(self instanceof Blob) || !self.size) throw Error('需要兩支本機原片。');
    if (!['buffer', 'fragmented'].includes(targetMode)) throw Error('尚未選定經驗證的成檔 target。');
    for (const name of ['VideoDecoder', 'VideoEncoder', 'VideoFrame', 'OffscreenCanvas']) if (typeof globalThis[name] !== 'function') throw Error(`此瀏覽器缺少 ${name}，原片保留。`);
    for (const side of ['reference', 'self']) validateTrack(tracks[side], plan.first[`${side}Ms`] / 1000, plan.last[`${side}Ms`] / 1000);
    if (presentation && (presentation.layout !== 'overlay' || !Number.isFinite(presentation.opacity) || presentation.opacity < 0 || presentation.opacity > 1)) throw Error('疊影設定無效。');
    if (presentation) for (const layer of [presentation.reference, presentation.self]) if (!layer || ![layer.x, layer.y, layer.scale].every(Number.isFinite) || layer.scale < .25 || layer.scale > 4 || Math.abs(layer.x) > 2 || Math.abs(layer.y) > 2) throw Error('疊影位置無效。');
    const videos = [];
    for (const [index, blob] of [reference, self].entries()) {
      // 本機容器才可解碼；不接受 HLS manifest 觸發額外網路來源。
      const input = new Input({ source: new BlobSource(blob), formats: [MP4, QTFF, WEBM, MATROSKA] }); inputs.push(input);
      const format = await checked(() => input.getFormat());
      const edits = await auditEdits(blob, signal, format === MP4 || format === QTFF); check();
      const track = await checked(() => input.getPrimaryVideoTrack());
      if (!track || !await checked(() => track.canDecode())) throw Error('原片視訊格式不支援，原配對保留。');
      const rawStart = await checked(() => track.getFirstTimestamp()), rawEnd = await checked(() => track.computeDuration());
      const edit = edits.trackBounds?.[track.id];
      const start = Math.max(rawStart, edit?.start ?? -Infinity), end = Math.min(rawEnd, edit?.end ?? Infinity);
      const role = index ? 'self' : 'reference';
      validateSourceRange(start, end, plan.first[`${role}Ms`] / 1000, plan.last[`${role}Ms`] / 1000);
      videos.push(track); diagnostics.sources.push({ role, start, end, edits, codec: await checked(() => track.getCodec()) });
      progress({ stage: 'input', fraction: 0 });
    }
    const track = await checked(() => inputs[0].getPrimaryAudioTrack());
    let audioIterator, cursor, audioFormat;
    const firstRef = plan.first.referenceMs / 1000, lastRef = plan.last.referenceMs / 1000;
    if (track) {
      for (const name of ['AudioDecoder', 'AudioEncoder', 'AudioData']) if (typeof globalThis[name] !== 'function') throw Error(`此瀏覽器缺少 ${name}，不能把解碼失敗當無聲。`);
      if (!await checked(() => track.canDecode())) throw Error('示範音訊格式不支援，不能改成無聲。');
      const rawStart = await checked(() => track.getFirstTimestamp()), rawEnd = await checked(() => track.computeDuration());
      const edit = diagnostics.sources[0].edits.trackBounds?.[track.id];
      const start = Math.max(rawStart, edit?.start ?? -Infinity), end = Math.min(rawEnd, edit?.end ?? Infinity);
      if (![start, end].every(Number.isFinite) || end < start) throw Error('無法確認音軌有效時間。');
      if (Math.max(start, firstRef) < Math.min(end, lastRef)) {
        audioIterator = new AudioSampleSink(track).samples(Math.max(start, firstRef), Math.min(end, lastRef)); iterators.push(audioIterator);
        const item = await next(audioIterator); heldAudio = item.value;
        if (item.done || !heldAudio) throw Error('音軌宣告有內容但未解碼到 PCM。');
        audioFormat = { sampleRate: heldAudio.sampleRate, channels: heldAudio.numberOfChannels, gridOrigin: heldAudio.timestamp };
      } else audioFormat = { sampleRate: AUDIO_RATE, channels: Math.min(2, await checked(() => track.getNumberOfChannels())), gridOrigin: firstRef };
      cursor = pcmCursor({ start: firstRef, end: lastRef, declaredStart: start, declaredEnd: end, ...audioFormat, rate: recipe.rate });
      diagnostics.audio = { declaredStart: start, declaredEnd: end, ...audioFormat, outputSampleRate: AUDIO_RATE, outputChannels: Math.min(2, audioFormat.channels), sourceBlocks: 0, sourceFrames: 0, silenceBasis: 'outside declared audio track range only' };
    }
    const audioInfo = diagnostics.audio;
    const videoQuality = new Quality({ bitrate: 4e6 }), audioQuality = new Quality({ bitrate: 128e3 });
    if (!await checked(() => canEncodeVideo('avc', { width: 1280, height: 720, frameRate: FPS, quality: videoQuality }))) throw Error('此瀏覽器無法編碼比較用 AVC，原片保留。');
    if (audioInfo && !await checked(() => canEncodeAudio('aac', { sampleRate: AUDIO_RATE, numberOfChannels: audioInfo.outputChannels, quality: audioQuality }))) throw Error('此瀏覽器無法編碼示範 AAC，原片保留。');
    const canvas = new OffscreenCanvas(1280, 720), context = canvas.getContext('2d', { alpha: false });
    if (!context) throw Error('無法建立輸出畫布。');
    const parts = [];
    const target = targetMode === 'buffer' ? new BufferTarget() : new AppendOnlyStreamTarget(new WritableStream({ write(bytes) {
      parts.push(new Uint8Array(bytes)); encodedBytes += bytes.byteLength;
    } }));
    // BufferTarget 的連續配置峰值尚待量測；不能把 write 邊界當實際 RSS 上限。
    if (targetMode === 'buffer') target.on('write', ({ end }) => { encodedBytes = Math.max(encodedBytes, end); });
    output = new Output({ target, format: new Mp4OutputFormat(targetMode === 'fragmented' ? { fastStart: 'fragmented', minimumFragmentDuration: 1 } : {}) });
    videoSource = new CanvasSource(canvas, { codec: 'avc', quality: videoQuality });
    // 明確 duration 允許最後短格，不套 frameRate metadata 的整格 snapping。
    output.addVideoTrack(videoSource);
    if (audioInfo) {
      audioSource = new AudioSampleSource({ codec: 'aac', quality: audioQuality, transform: { sampleRate: AUDIO_RATE, numberOfChannels: audioInfo.outputChannels } });
      output.addAudioTrack(audioSource);
    }
    await checked(() => output.start());
    const videoIterators = videos.map((track, side) => {
      function* times() { for (const frame of outputFrames(recipe)) yield side ? frame.self : frame.reference; }
      const iterator = new VideoSampleSink(track).samplesAtTimestamps(times()); iterators.push(iterator); return iterator;
    });
    const producer = work => runProducer(work, remember, stop);
    const tasks = [producer(async () => {
      for (const frame of outputFrames(recipe)) {
        const samples = [];
        await useSamples(samples, async () => {
          /** @type {import('./comparison-renderer').Sources} */
          const sources = { reference: { frame: null, track: tracks.reference ?? null }, self: { frame: null, track: tracks.self ?? null } };
          for (let side = 0; side < 2; side++) {
            const item = await next(videoIterators[side]), sample = item.value; if (sample) samples.push(sample);
            const role = side ? 'self' : 'reference', targetTime = frame[role];
            const lag = validateFrame(sample, targetTime, side ? 1 : recipe.rate);
            diagnostics.selectedPresentationLagMs[role] = Math.max(diagnostics.selectedPresentationLagMs[role], lag);
            // 裁切路徑沿配方的來源時間，不能因選中覆蓋該點的前一格而把跟隨框也往前移。
            sources[role] = { frame: { width: sample.displayWidth, height: sample.displayHeight, time: targetTime,
              draw(ctx, ...rect) { sample.draw(ctx, ...rect); } }, track: tracks[role] ?? null };
          }
          if (presentation) drawOverlay(context, 1280, 720, sources, recipe, presentation);
          else drawSideBySide(context, sources, recipe);
          await checked(() => videoSource.add(frame.timestamp, frame.duration)); diagnostics.submittedFrames++;
          if ([0, Math.floor(plan.frames / 2), plan.frames - 1].includes(frame.index)) diagnostics.checkpoints.push({ output: frame.timestamp, referencePts: samples[0].timestamp, selfPts: samples[1].timestamp });
          if (frame.index % 10 === 0) progress({ stage: 'encoding', fraction: (frame.index + 1) / plan.frames });
        }, remember, sample => { close(sample); diagnostics.sourceVideoFrameCloseCalls++; }); check();
      }
      await closeSource(videoSource);
    })];
    if (audioSource && audioInfo) tasks.push(producer(async () => {
      const add = async (data, packet) => {
        const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: packet.numberOfChannels, sampleRate: packet.sampleRate, timestamp: packet.timestamp });
        await useSamples([sample], () => checked(() => audioSource.add(sample)), remember, close); check();
      };
      const silence = async (from, to) => {
        for (let at = from; at < to;) {
          const size = Math.min(Math.ceil(cursor.sampleRate), Math.max(1, Math.floor(4 * 1024 * 1024 / (cursor.channels * 4))), to - at), packet = cursor.packet(at, size);
          await add(new Float32Array(size * cursor.channels), packet); at += size; progress({ stage: 'audio', fraction: Math.min(1, (cursor.gridOrigin + at / cursor.sampleRate - firstRef) / (lastRef - firstRef)) });
        }
      };
      await silence(cursor.first, cursor.audibleFirst);
      let sample = heldAudio; heldAudio = undefined;
      try {
        while (sample) {
          try {
            const part = cursor.accept(sample);
            if (part) {
              // 就算 codec 一次交很大的 AudioData，也只逐塊複製，不另留整段三百秒 PCM。
              const step = Math.min(Math.ceil(cursor.sampleRate), Math.max(1, Math.floor(4 * 1024 * 1024 / (cursor.channels * 4))));
              for (let offset = 0; offset < part.frameCount; offset += step) {
                const frameCount = Math.min(step, part.frameCount - offset), portion = { frameOffset: part.frameOffset + offset, frameCount };
                maximumPcmChunkFrames = Math.max(maximumPcmChunkFrames, frameCount);
                await add(copyPcm(sample, portion), cursor.packet(part.sourceFrame + offset, frameCount)); audioInfo.sourceFrames += frameCount;
                progress({ stage: 'audio', fraction: Math.min(1, (cursor.gridOrigin + (part.sourceFrame + offset + frameCount) / cursor.sampleRate - firstRef) / (lastRef - firstRef)) });
              }
            }
            audioInfo.sourceBlocks++;
          } catch (error) { remember(error); throw error; }
          finally { close(sample); sample = undefined; }
          const item = await next(audioIterator); if (item.done) break; sample = item.value;
        }
      } finally { close(sample); }
      Object.assign(audioInfo, cursor.finish());
      await silence(cursor.audibleLast, cursor.last); await closeSource(audioSource);
    }));
    await Promise.allSettled(tasks); check();
    if (diagnostics.submittedFrames !== plan.frames) throw Error('合成影格未完整交付。');
    progress({ stage: 'finalizing', fraction: 1 });
    await checked(() => output.finalize());
    const mime = await checked(() => output.getMimeType());
    if (target instanceof BufferTarget && !(target.buffer instanceof ArrayBuffer)) throw Error('成檔 buffer 尚未完成。');
    candidate = new Blob(target instanceof BufferTarget && target.buffer ? [target.buffer] : parts, { type: mime });
    if (!candidate.size) throw Error('成檔大小無效。');
    diagnostics.output = { mime, bytes: candidate.size, targetMode, fmp4CompatibilityVerified: false };
    diagnostics.maximumPcmChunkFrames = maximumPcmChunkFrames; diagnostics.maximumTargetEndBytes = encodedBytes;
  } catch (error) { remember(error); }
  finally {
    if (signal.aborted) remember(signal.reason);
    close(heldAudio);
    for (const input of inputs) await cleanup('input.dispose', () => input.dispose());
    for (const iterator of iterators) await cleanup('iterator.return', () => iterator.return());
    if (output) { if (cancelPromise) await cancelPromise; else await cleanup('output.cancel', () => output.cancel()); }
    signal.removeEventListener('abort', aborted);
    diagnostics.elapsedMs = performance.now() - began;
    diagnostics.cleanupCallsCompleted = !diagnostics.cleanupErrors.length;
  }
  if (signal.aborted) remember(signal.reason);
  if (failed) { throw Object.assign(new Error(firstError?.message ?? String(firstError), { cause: firstError }), { name: firstError?.name ?? 'Error', metadata: diagnostics }); }
  return { blob: candidate, diagnostics };
}
