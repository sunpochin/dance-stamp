/* 檔案用途：有界讀取本機 MP4 的 AAC 片段，避開 Safari 元素來源漏音。所在層：媒體。主要關聯：main.js、timeline.js、RECORD_COMPARE.md。 */
import { MAX_COMPARISON_MS } from './timeline.js';
// ponytail: 只支援單軌 AAC-LC 的一般 MP4；其餘格式明確拒絕，之後有實片需求才擴充 demux。
export const audioBudget = Object.freeze({ metadata: 8 * 1024 * 1024, samples: 250_000, packet: 16 * 1024, batch: 8, seconds: MAX_COMPARISON_MS / 1000, sampleRate: 48_000, channels: 2 });
const unsupported = () => new Error('Safari 音訊相容合成目前支援一般 MP4 的單一 AAC-LC 音軌（最多雙聲道、48kHz）。此片格式或資源超出範圍，請改用 Chrome；原片與前次 VS 保留。');
const require = value => { if (!value) throw unsupported(); };
export function safariAudio(userAgent = navigator.userAgent) {
  return /AppleWebKit/.test(userAgent) && !/Chrome|Chromium|Edg|OPR|Android/.test(userAgent);
}
const u32 = (v, p) => v.getUint32(p);
const u64 = (v, p) => { const n = Number(v.getBigUint64(p)); require(Number.isSafeInteger(n)); return n; };
const text = (v, p) => String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset + p, 4));
function boxes(v, start = 0, end = v.byteLength) {
  const result = [];
  while (start < end) {
    require(result.length < 4096 && end - start >= 8);
    let size = u32(v, start), header = 8;
    if (size === 1) { require(end - start >= 16); size = u64(v, start + 8); header = 16; }
    if (size === 0) size = end - start;
    require(size >= header && size <= end - start);
    result.push({ type: text(v, start + 4), start: start + header, end: start + size }); start += size;
  }
  return result;
}
function one(list, type, optional = false) {
  const found = list.filter(b => b.type === type);
  require(found.length === 1 || (optional && found.length === 0)); return found[0];
}
function children(v, b) { return boxes(v, b.start, b.end); }
function need(b, length) { require(b.end - b.start >= length); return b.start; }
function table(v, b, stride, extra = 0) {
  const p = need(b, 8 + extra), count = u32(v, p + 4 + extra);
  require(v.getUint8(p) === 0 && count <= audioBudget.samples && b.end - p === 8 + extra + count * stride);
  return { p: p + 8 + extra, count };
}
async function read(file, start, size, signal) {
  signal.throwIfAborted(); require(size <= audioBudget.metadata && start >= 0 && start + size <= file.size);
  const data = await file.slice(start, start + size).arrayBuffer(); signal.throwIfAborted();
  require(data.byteLength === size); return new DataView(data);
}
function descriptor(v, p, end) {
  require(p + 2 <= end); const tag = v.getUint8(p++); let length = 0, byte;
  for (let i = 0; i < 4; i++) { require(p < end); byte = v.getUint8(p++); length = length * 128 + (byte & 127); if (!(byte & 128)) break; }
  require(!(byte & 128) && p + length <= end); return { tag, start: p, end: p + length };
}
function aacConfig(v, stsd) {
  const p = need(stsd, 8); require(u32(v, p) === 0 && u32(v, p + 4) === 1);
  const entry = one(boxes(v, p + 8, stsd.end), 'mp4a'); need(entry, 28);
  // QuickTime v1/v2、外部資料參照與加密 entry 另有語意；不能猜它們的封包位置。
  require(v.getUint16(entry.start + 8) === 0 && v.getUint16(entry.start + 6) === 1);
  const esds = one(boxes(v, entry.start + 28, entry.end), 'esds'); need(esds, 4);
  require(u32(v, esds.start) === 0);
  const es = descriptor(v, esds.start + 4, esds.end); require(es.tag === 3 && es.end - es.start >= 3 && v.getUint8(es.start + 2) === 0);
  const config = descriptor(v, es.start + 3, es.end); require(config.tag === 4 && config.end - config.start >= 13 && v.getUint8(config.start) === 0x40 && v.getUint8(config.start + 1) === 0x15);
  const asc = descriptor(v, config.start + 13, config.end); require(asc.tag === 5 && asc.end - asc.start >= 2 && asc.end - asc.start <= 16);
  const bits = v.getUint16(asc.start), rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const rate = rates[(bits >> 7) & 15], channels = (bits >> 3) & 15;
  // 排除 SBR、PCE、960-frame 與擴充設定；解碼後仍逐包檢查，不能只信容器聲道數。
  require(bits >> 11 === 2 && rate >= 8000 && rate <= audioBudget.sampleRate && channels >= 1 && channels <= audioBudget.channels && (bits & 7) === 0);
  const description = new Uint8Array(v.buffer, v.byteOffset + asc.start, asc.end - asc.start).slice();
  require(description.length === 2 || (description.length === 5 && description[2] === 0x56 && description[3] === 0xe5 && description[4] === 0));
  return { codec: 'mp4a.40.2', sampleRate: rate, numberOfChannels: channels, description };
}
function timescale(v, b) {
  const p = need(b, 24), version = v.getUint8(p); require(version <= 1); if (version) need(b, 36);
  const result = u32(v, p + (version ? 20 : 12)); require(result > 0); return result;
}

/** @param {Blob} file @param {AbortSignal} signal */
export async function readAudioTrack(file, signal) {
  // 只跳過 mdat；不把長影片或未知大小的 moov 整檔讀進記憶體。
  let moov, count = 0; const media = [];
  for (let pos = 0; pos < file.size;) {
    require(++count <= 4096 && file.size - pos >= 8);
    const h = await read(file, pos, Math.min(16, file.size - pos), signal), type = text(h, 4);
    let size = u32(h, 0), header = 8;
    if (size === 1) { require(h.byteLength >= 16); size = u64(h, 8); header = 16; }
    if (!size) size = file.size - pos;
    require(size >= header && size <= file.size - pos && !['moof', 'mfra'].includes(type));
    if (type === 'moov') { require(!moov && size <= audioBudget.metadata); moov = await read(file, pos + header, size - header, signal); }
    if (type === 'mdat') { require(media.length < 4096); media.push({ start: pos + header, end: pos + size }); }
    pos += size;
  }
  require(moov); const v = moov, root = boxes(v); require(!root.some(b => b.type === 'mvex'));
  const tracks = root.filter(b => b.type === 'trak'); require(tracks.length > 0 && tracks.length <= 16);
  const audio = tracks.filter(track => {
    const mdia = children(v, one(children(v, track), 'mdia')), handler = one(mdia, 'hdlr'); need(handler, 12);
    return text(v, handler.start + 8) === 'soun';
  });
  require(audio.length <= 1); if (!audio.length) return null;
  const track = children(v, audio[0]), mdia = children(v, one(track, 'mdia')), scale = timescale(v, one(mdia, 'mdhd'));
  const minf = children(v, one(mdia, 'minf')), stbl = children(v, one(minf, 'stbl')), stsd = one(stbl, 'stsd'), config = aacConfig(v, stsd);
  require(scale === config.sampleRate && !stbl.some(b => ['ctts', 'stz2', 'senc', 'saiz', 'saio'].includes(b.type)));
  // 只接受自包含資料，不可依外部 URL 讀取來源或將壞 offset 當音訊。
  const dref = one(children(v, one(minf, 'dinf')), 'dref'), dr = need(dref, 8);
  require(u32(v, dr + 4) === 1); const url = one(boxes(v, dr + 8, dref.end), 'url '); require(url.end - url.start === 4 && u32(v, url.start) === 1);
  let shift = 0, audioStart = 0, audioEnd = Infinity;
  const edts = one(track, 'edts', true);
  if (edts) {
    const elst = one(children(v, edts), 'elst'), p = need(elst, 8), version = v.getUint8(p); require(version <= 1);
    const n = u32(v, p + 4), stride = version ? 20 : 12; require(n >= 1 && n <= 2 && elst.end - p === 8 + n * stride);
    const movieScale = timescale(v, one(root, 'mvhd')); let delay = 0;
    for (let i = 0; i < n; i++) {
      const q = p + 8 + i * stride, duration = version ? u64(v, q) : u32(v, q), at = version ? Number(v.getBigInt64(q + 8)) : v.getInt32(q + 4);
      require(Number.isSafeInteger(at) && u32(v, q + stride - 4) === 0x10000);
      if (at === -1) { require(i === 0 && n === 2); delay = duration / movieScale; }
      else { require(at >= 0 && i === n - 1); shift = delay - at / scale; audioStart = delay; audioEnd = delay + duration / movieScale; }
    }
  }
  const sz = one(stbl, 'stsz'), sp = need(sz, 12), fixed = u32(v, sp + 4), n = u32(v, sp + 8);
  require(u32(v, sp) === 0 && n > 0 && n <= audioBudget.samples && sz.end - sp === 12 + (fixed ? 0 : n * 4) && fixed <= audioBudget.packet);
  const sizes = new Uint32Array(n), offsets = new Float64Array(n), times = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { sizes[i] = fixed || u32(v, sp + 12 + i * 4); require(sizes[i] > 0 && sizes[i] <= audioBudget.packet); }
  const stts = table(v, one(stbl, 'stts'), 8); let index = 0, time = 0;
  for (let i = 0; i < stts.count; i++) {
    const q = stts.p + i * 8, repeat = u32(v, q), delta = u32(v, q + 4); require(repeat > 0 && index + repeat <= n && delta > 0 && delta <= 1024);
    for (let j = 0; j < repeat; j++) { require(delta === 1024 || index === n - 1); times[index++] = time / scale + shift; time += delta; }
  }
  require(index === n); times[n] = time / scale + shift;
  const co = one(stbl, 'stco', true), large = one(stbl, 'co64', true); require(!!co !== !!large);
  const chunks = table(v, co || large, co ? 4 : 8), sc = table(v, one(stbl, 'stsc'), 12);
  require(chunks.count > 0 && sc.count > 0); index = 0; let run = 0;
  for (let i = 0; i < sc.count; i++) {
    const q = sc.p + i * 12, first = u32(v, q); require((i ? first > u32(v, q - 12) : first === 1) && first <= chunks.count && u32(v, q + 4) > 0 && u32(v, q + 8) === 1);
  }
  for (let chunk = 1; chunk <= chunks.count; chunk++) {
    if (run + 1 < sc.count && chunk === u32(v, sc.p + (run + 1) * 12)) run++;
    const perChunk = u32(v, sc.p + run * 12 + 4); require(index + perChunk <= n);
    let offset = co ? u32(v, chunks.p + (chunk - 1) * 4) : u64(v, chunks.p + (chunk - 1) * 8);
    const begin = offset;
    for (let j = 0; j < perChunk; j++) { offsets[index] = offset; offset += sizes[index++]; }
    require(media.some(b => begin >= b.start && offset <= b.end));
  }
  require(index === n);
  return { config, sizes, offsets, times, audioStart, audioEnd: Math.min(audioEnd, times[n]) };
}

// timeout 與取消涵蓋原生解碼等待；close() 才能真正取消 queue，不能只有 Promise.race。
export async function audioReady(promise, signal) {
  signal.throwIfAborted();
  return await new Promise((resolve, reject) => {
    const abort = () => finish(signal.reason), timer = setTimeout(() => finish(new Error('音訊準備逾時，請重試；原片與前次 VS 保留。')), 10_000);
    const finish = (error, value) => { clearTimeout(timer); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
    signal.addEventListener('abort', abort, { once: true }); promise.then(value => finish(null, value), finish);
  });
}

/** @param {Blob} file @param {AudioContext} context @param {number} start @param {number} duration @param {AbortSignal} signal */
export async function decodeLocalAudio(file, context, start, duration, signal) {
  require(Number.isFinite(start) && start >= 0 && Number.isFinite(duration) && duration > 0 && duration <= audioBudget.seconds);
  let decoder, buffer, failure;
  /** @type {(() => void) | undefined} */
  let wake;
  const cancel = () => { if (decoder && decoder.state !== 'closed') decoder.close(); buffer = null; };
  signal.throwIfAborted(); signal.addEventListener('abort', cancel, { once: true });
  try {
    const track = await readAudioTrack(file, signal); if (!track) return null;
    require(globalThis.AudioDecoder && globalThis.EncodedAudioChunk);
    const support = await audioReady(AudioDecoder.isConfigSupported(track.config), signal); require(support.supported); signal.throwIfAborted();
    const rate = track.config.sampleRate, channels = track.config.numberOfChannels, frames = Math.ceil(duration * rate);
    buffer = context.createBuffer(channels, frames, rate);
    let outputs = 0, submitted = 0;
    decoder = new AudioDecoder({
      output(data) {
        try {
          if (signal.aborted || failure) return;
          require(data.sampleRate === rate && data.numberOfChannels === channels && data.numberOfFrames > 0 && data.numberOfFrames <= 1024);
          // 前置封包只供解碼器暖機；空 edit 尚未結束前，不能把被丟棄的來源音訊寫進靜音區。
          const position = Math.round((data.timestamp / 1e6 - start) * rate), from = Math.max(0, -position, Math.round((track.audioStart - start) * rate) - position), to = Math.min(data.numberOfFrames, frames - position, Math.round((track.audioEnd - start) * rate) - position);
          if (to > from) for (let channel = 0; channel < channels; channel++) {
            const pcm = new Float32Array(data.numberOfFrames); data.copyTo(pcm, { planeIndex: channel, format: 'f32-planar' });
            buffer.getChannelData(channel).set(pcm.subarray(from, to), position + from);
          }
          outputs++;
        } catch (error) { failure = error; }
        finally { data.close(); wake?.(); }
      },
      error(error) { failure = error; wake?.(); },
    });
    decoder.configure(track.config);
    const { times, sizes, offsets } = track;
    let first = 0; while (first < sizes.length && times[first + 1] <= start) first++;
    // AAC 需要前置封包恢復重疊窗；取來源時間戳裁入固定片段，不能用固定裝置延遲冒充校正。
    first = Math.max(0, first - 2);
    for (let i = first; i < sizes.length && times[i] < start + duration; i++) {
      signal.throwIfAborted(); if (failure) throw failure;
      const packet = await read(file, offsets[i], sizes[i], signal);
      decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(times[i] * 1e6), data: packet })); submitted++;
      // 中途 flush 會破壞 Safari 的 AAC 重疊窗；等真正 PCM 交付才補包，仍最多八包未交付。
      // decodeQueueSize 只計控制佇列，不能代替尚在 codec 內的輸出；訂閱後再查一次避免漏掉交付。
      if (submitted - outputs >= audioBudget.batch) {
        try {
          await audioReady(new Promise((resolve, reject) => {
            wake = () => { if (failure) reject(failure); else if (submitted - outputs < audioBudget.batch) resolve(undefined); };
            wake();
          }), signal);
        } finally { wake = undefined; }
        if (failure) throw failure;
      }
    }
    await audioReady(decoder.flush(), signal); signal.throwIfAborted(); if (failure) throw failure;
    // AAC 每包 1024 格；兩包暖機與首尾跨界也須計入，不能殘留舊 60 秒封包上限。
    require(outputs === submitted && submitted <= Math.ceil(audioBudget.seconds * audioBudget.sampleRate / 1024) + 3);
    return buffer;
  } catch (error) {
    buffer = null; if (signal.aborted) throw signal.reason;
    if (error instanceof Error && /Safari|逾時/.test(error.message)) throw error;
    throw unsupported();
  } finally { signal.removeEventListener('abort', cancel); if (decoder && decoder.state !== 'closed') decoder.close(); }
}
