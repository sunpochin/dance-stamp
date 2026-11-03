/*
 * 用途：固定三秒、逐 PTS 合成的獨立 QA 原型；不是產品替代路徑。
 * 所在層：scripts/qa/explicit-pts；關聯：README.md、probe.js、Mediabunny 1.65.0。
 * Chrome 受測原檔 SHA256：cc1e71f0d0f68d6ada5ad5dfdc969be7717f29518d7856d15dc4c063d9e9b567。
 * 本檔相對該受測原檔僅改此檔頭，功能體不變；repo 主機另行驗證。
 */
import {
  Input, BlobSource, MP4, VideoSampleSink, AudioSampleSink,
  Output, Mp4OutputFormat, BufferTarget, CanvasSource,
  AudioBufferSource, Quality, canEncodeVideo, canEncodeAudio,
} from '/mediabunny.mjs';

const SECONDS = 3, FPS = 30, RATE = 48000, PCM_FRAMES = RATE * SECONDS;
const FIXTURE = {
  bytes: 1789027,
  sha256: '3fb42ffb14678b8c944d605cab684a1919801de7908c1f540f7fbfc29ea26548',
};
const errorInfo = error => ({ name: error?.name ?? 'Error', message: String(error?.message ?? error) });

export async function runSpike({ signal } = {}) {
  const metadata = {
    prototype: 'mediabunny-1.65.0-three-second-only',
    recipe: { A: 0, B: 3, C: 0, rate: 1, offset: 0, mirror: false, layout: 'side-by-side' },
    output: { width: 1280, height: 720, fps: FPS, seconds: SECONDS, videoCodec: 'avc', audioCodec: 'aac' },
    fixtures: [], capabilities: {}, videoSamples: [], submittedVideoFrames: 0,
    pcm: { sampleRate: RATE, channels: 1, expectedFrames: PCM_FRAMES, coveredFrames: 0, decodedSamples: 0 },
    cleanupErrors: [], cleanupCalls: [], canceledDuringFinalize: false,
    limitations: ['not a product fix', 'no drift measurement', 'finalize cannot be interrupted by Output.cancel'],
  };
  const inputs = [], iterators = [];
  let output, cancelJob, firstError, resultBlob, hasFirstError = false;
  const rememberError = error => {
    if (!hasFirstError) { firstError = error; hasFirstError = true; }
  };
  // 逾時與使用者取消是不同結果；也不能把明確提供的 null／其他 reason 當成沒錯。
  const abortError = () => signal?.reason === undefined ? new DOMException('Spike canceled', 'AbortError') : signal.reason;
  const check = () => {
    if (hasFirstError) throw firstError;
    if (signal?.aborted) throw abortError();
  };
  // 呼叫前後都查取消，避免已取消的非同步結果被當成成功成品。
  const checked = async work => { check(); const value = await work(); check(); return value; };
  const cleanup = async (label, work) => {
    try { await work(); metadata.cleanupCalls.push(label); }
    catch (error) { rememberError(error); metadata.cleanupErrors.push({ label, ...errorInfo(error) }); }
  };
  const closeSample = (sample, label) => {
    if (!sample) return;
    try { sample.close(); }
    catch (error) { rememberError(error); metadata.cleanupErrors.push({ label, ...errorInfo(error) }); }
  };
  // next 已交付的 sample 不再歸 iterator 管；取消剛好抵達時也須先關掉它。
  const nextSample = async iterator => {
    check();
    const result = await iterator.next();
    try { check(); return result; }
    catch (error) { closeSample(result.value, 'canceled-delivered-sample'); throw error; }
  };
  const stop = () => {
    for (const [index, input] of inputs.entries()) {
      try { input.dispose(); }
      catch (error) { metadata.cleanupErrors.push({ label: `stop-input-${index}`, ...errorInfo(error) }); }
    }
    if (output && !cancelJob) {
      metadata.canceledDuringFinalize ||= output.state === 'finalizing';
      cancelJob = cleanup('output.cancel', () => output.cancel());
    }
  };
  const onAbort = () => { rememberError(abortError()); stop(); };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    check();
    for (const name of ['VideoDecoder', 'VideoEncoder', 'VideoFrame', 'AudioDecoder', 'AudioEncoder', 'AudioData', 'AudioBuffer']) {
      metadata.capabilities[name] = typeof globalThis[name] === 'function';
      if (!metadata.capabilities[name]) throw new Error(`Unsupported API: ${name}`);
    }
    const videoQuality = new Quality({ bitrate: 5e6 });
    const audioQuality = new Quality({ bitrate: 128e3 });
    metadata.capabilities.avc = await checked(() => canEncodeVideo('avc', {
      width: 1280, height: 720, frameRate: FPS, quality: videoQuality,
    }));
    metadata.capabilities.aac = await checked(() => canEncodeAudio('aac', {
      numberOfChannels: 1, sampleRate: RATE, quality: audioQuality,
    }));
    if (!metadata.capabilities.avc || !metadata.capabilities.aac) throw new Error('Unsupported fixed AVC/AAC configuration');

    for (const role of ['reference', 'self']) {
      const response = await checked(() => fetch(`/fixtures/${role}.mp4`, { signal, cache: 'no-store' }));
      if (!response.ok || new URL(response.url).origin !== location.origin) throw new Error(`Fixture unavailable or cross-origin: ${role}`);
      const bytes = await checked(() => response.arrayBuffer());
      const digest = await checked(() => crypto.subtle.digest('SHA-256', bytes));
      const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      if (bytes.byteLength !== FIXTURE.bytes || sha256 !== FIXTURE.sha256) throw new Error(`Fixture fingerprint mismatch: ${role}`);
      const input = new Input({ formats: [MP4], source: new BlobSource(new Blob([bytes], { type: 'video/mp4' })) });
      inputs.push(input);
      metadata.fixtures.push({ role, bytes: bytes.byteLength, sha256 });
    }
    const videos = [];
    for (const [index, input] of inputs.entries()) {
      const track = await checked(() => input.getPrimaryVideoTrack());
      if (!track || !await checked(() => track.canDecode())) throw new Error(`Unsupported input video: ${index}`);
      const width = await checked(() => track.getDisplayWidth());
      const height = await checked(() => track.getDisplayHeight());
      const duration = await checked(() => track.computeDuration());
      if (width !== 640 || height !== 360 || !Number.isFinite(duration) || duration < SECONDS) throw new Error('Unexpected source geometry/duration');
      metadata.fixtures[index].video = { width, height, duration };
      videos.push(track);
    }
    const audioTrack = await checked(() => inputs[0].getPrimaryAudioTrack());
    if (!audioTrack || !await checked(() => audioTrack.canDecode())) throw new Error('Unsupported reference audio');

    // 不靠 AudioBuffer 的預設零值補缺音；每一個輸出 PCM 格都必須有來源覆蓋。
    const pcm = new AudioBuffer({ numberOfChannels: 1, length: PCM_FRAMES, sampleRate: RATE });
    const plane = pcm.getChannelData(0), coverage = new Uint8Array(PCM_FRAMES);
    const audioIterator = new AudioSampleSink(audioTrack).samples(0, SECONDS);
    iterators.push(audioIterator);
    while (true) {
      const { value: sample, done } = await nextSample(audioIterator);
      if (done) break;
      try {
        if (sample.sampleRate !== RATE || sample.numberOfChannels !== 1 || !Number.isFinite(sample.timestamp)) throw new Error('Unexpected decoded PCM format');
        const exactStart = sample.timestamp * RATE, start = Math.round(exactStart);
        // 容許原生微秒時間戳的量化，不接受半格以上的未知對齊。
        if (Math.abs(exactStart - start) > 0.1) throw new Error('PCM timestamp is not aligned to source sample grid');
        const from = Math.max(0, -start), to = Math.min(sample.numberOfFrames, PCM_FRAMES - start);
        if (to > from) {
          const part = new Float32Array(to - from);
          sample.copyTo(part, { planeIndex: 0, format: 'f32-planar', frameOffset: from, frameCount: part.length });
          for (let j = 0; j < part.length; j++) {
            const destination = start + from + j;
            if (coverage[destination] || !Number.isFinite(part[j])) throw new Error('Overlapping or invalid source PCM');
            coverage[destination] = 1;
            plane[destination] = part[j];
          }
          metadata.pcm.coveredFrames += part.length;
          metadata.pcm.firstCopiedTime ??= (start + from) / RATE;
          metadata.pcm.lastCopiedEnd = (start + to) / RATE;
        }
        metadata.pcm.decodedSamples++;
      } finally { closeSample(sample, 'decoded-audio-sample'); }
    }
    if (metadata.pcm.coveredFrames !== PCM_FRAMES || coverage.some(value => value !== 1)) throw new Error('Reference PCM does not cover the complete [0,3) interval');

    const canvas = document.createElement('canvas');
    canvas.width = 1280; canvas.height = 720;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Unsupported 2D canvas');
    output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const videoSource = new CanvasSource(canvas, { codec: 'avc', quality: videoQuality });
    const audioSource = new AudioBufferSource({ codec: 'aac', quality: audioQuality }, { startTimestamp: 0 });
    output.addVideoTrack(videoSource, { frameRate: FPS });
    output.addAudioTrack(audioSource);
    await checked(() => output.start());
    const timestamps = Array.from({ length: FPS * SECONDS }, (_, index) => index / FPS);
    const videoIterators = videos.map(track => new VideoSampleSink(track).samplesAtTimestamps(timestamps));
    iterators.push(...videoIterators);

    // 兩軌同時餵資料，避免 mux 等另一軌首包時被單軌 await 卡死；各軌內仍逐筆反壓。
    const producer = async work => {
      try { await work(); }
      catch (error) { rememberError(error); stop(); throw error; }
    };
    const tasks = [producer(async () => {
      for (let index = 0; index < timestamps.length; index++) {
        const t = timestamps[index], samples = [];
        try {
          for (const iterator of videoIterators) {
            const result = await nextSample(iterator);
            const sample = result.value;
            if (sample) samples.push(sample);
            if (result.done || !sample || !Number.isFinite(sample.timestamp) || !Number.isFinite(sample.duration)
              || sample.duration <= 0 || sample.timestamp > t + 1e-8 || sample.timestamp + sample.duration <= t + 1e-8
              || sample.displayWidth !== 640 || sample.displayHeight !== 360 || sample.rotation !== 0 || sample.flip) {
              throw new Error(`Source video does not cover output timestamp ${t}`);
            }
            if (index === timestamps.length - 1 && sample.timestamp + sample.duration < SECONDS - 1e-8) throw new Error('Source video does not cover B tail');
          }
          metadata.videoSamples.push({ output: t, reference: samples[0].timestamp, self: samples[1].timestamp,
            referenceDuration: samples[0].duration, selfDuration: samples[1].duration });
          context.fillStyle = 'black'; context.fillRect(0, 0, 1280, 720);
          // 原 640×672 半框起於 y=48；640×360 等比置中後 top=204，保留既有量尺幾何。
          samples[0].draw(context, 0, 204, 640, 360);
          samples[1].draw(context, 640, 204, 640, 360);
          await checked(() => videoSource.add(t, 1 / FPS));
          metadata.submittedVideoFrames++;
        } finally { samples.forEach((sample, side) => closeSample(sample, `video-${side}`)); }
      }
      videoSource.close();
    }), producer(async () => {
      await checked(() => audioSource.add(pcm));
      audioSource.close();
    })];
    // 即使其中一軌先失敗也必須等另一軌退出；不能用 fail-fast 把仍工作的 producer 留在背景。
    await Promise.allSettled(tasks);
    check();
    if (metadata.submittedVideoFrames !== 90) throw new Error('Incomplete video frame submission');
    await checked(() => output.finalize());
    metadata.mimeType = await checked(() => output.getMimeType());
    const buffer = output.target.buffer;
    if (!buffer?.byteLength) throw new Error('Empty finalized output');
    resultBlob = new Blob([buffer], { type: metadata.mimeType });
    metadata.output.bytes = resultBlob.size;
    metadata.output.finalState = output.state;
  } catch (error) { rememberError(error); }
  finally {
    // 先停止輸入以喚醒讀取，再各自收迭代器與輸出；一項失敗不能跳過其他清理。
    for (const [index, input] of inputs.entries()) await cleanup(`input-${index}.dispose`, () => input.dispose());
    for (const [index, iterator] of iterators.entries()) await cleanup(`iterator-${index}.return`, () => iterator.return());
    if (output) {
      if (cancelJob) await cancelJob;
      else await cleanup('output.cancel', () => output.cancel());
    }
    signal?.removeEventListener('abort', onAbort);
    metadata.cleanupCallsCompleted = metadata.cleanupErrors.length === 0;
  }
  if (signal?.aborted) rememberError(abortError());
  if (!hasFirstError && metadata.cleanupErrors.length) rememberError(new Error('Spike cleanup failed'));
  if (hasFirstError) {
    metadata.firstError = errorInfo(firstError);
    const failure = new Error(metadata.firstError.message, { cause: firstError });
    failure.name = metadata.firstError.name;
    failure.metadata = metadata;
    throw failure;
  }
  return { blob: resultBlob, metadata };
}
