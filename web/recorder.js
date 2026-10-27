/* 檔案用途：原型的媒體等待、編碼與停止順序。所在層：瀏覽器媒體工具。主要關聯：main.js、RECORD_COMPARE.md。 */
export function event(target, name, signal, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const finish = (error, value) => {
      clearTimeout(timer);
      target.removeEventListener(name, success);
      target.removeEventListener('error', failure);
      signal?.removeEventListener('abort', aborted);
      error ? reject(error) : resolve(value);
    };
    const success = value => finish(null, value);
    const failure = () => finish(new Error('媒體無法解碼或裝置發生錯誤。'));
    const aborted = () => finish(new DOMException('操作已停止', 'AbortError'));
    const timer = setTimeout(() => finish(new Error(`等待 ${name} 逾時，請重試或換合成測片。`)), timeoutMs);
    target.addEventListener(name, success, { once: true });
    target.addEventListener('error', failure, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

export async function seek(video, seconds, signal) {
  if (Math.abs(video.currentTime - seconds) < 0.001 && video.readyState >= 2) return;
  const pending = event(video, 'seeked', signal);
  video.currentTime = seconds;
  await pending;
}

export async function load(video, url, signal) {
  const pending = event(video, 'loadeddata', signal);
  video.src = url;
  video.load();
  await pending;
  if (!video.videoWidth || !video.videoHeight) throw new Error('選取的檔案沒有可解碼的視訊。');
  // Chromium 的即時 WebM 可能沒有 duration；實際 seek 尾端，不能拿 chunks 數猜長度。
  if (!Number.isFinite(video.duration)) await seek(video, 1e9, signal);
  const durationMs = Math.round(video.duration * 1000);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error('無法讀回影片長度，請先另存原片。');
  await seek(video, 0, signal);
  return durationMs;
}

/** @param {MediaStream} stream @param {(blob: Blob) => void} onChunk */
export function record(stream, onChunk = () => {}) {
  if (!globalThis.MediaRecorder) throw new Error('此瀏覽器沒有錄影能力。');
  const candidates = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm', ''];
  let recorder;
  for (const mimeType of candidates) {
    if (mimeType && !MediaRecorder.isTypeSupported(mimeType)) continue;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
      recorder.start(1000);
      break;
    } catch { recorder = null; }
  }
  if (!recorder) throw new Error('裝置無法啟動任何候選錄影格式。');
  const chunks = [];
  recorder.addEventListener('dataavailable', e => { if (e.data.size) { chunks.push(e.data); onChunk(e.data); } });
  const done = /** @type {Promise<Blob>} */ (new Promise((resolve, reject) => {
    recorder.addEventListener('error', () => reject(new Error('編碼失敗；保留來源，請降低負載後重試。')), { once: true });
    recorder.addEventListener('stop', () => {
      // stop 之後最後一塊資料才齊全，不能在呼叫 stop 的當下組出半個影片。
      const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type });
      blob.size ? resolve(blob) : reject(new Error('沒有錄到影片資料。'));
    }, { once: true });
  }));
  done.catch(() => {});
  return {
    done,
    stop() { if (recorder.state !== 'inactive') recorder.stop(); return done; },
  };
}

export function extension(mimeType) {
  if (mimeType.startsWith('video/mp4')) return 'mp4';
  if (mimeType.startsWith('video/webm')) return 'webm';
  throw new Error('未知輸出容器，無法提供正確副檔名。');
}
