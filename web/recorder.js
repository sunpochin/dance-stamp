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
    const failure = () => {
      const code = target.error?.code;
      finish(new Error(code === 4 ? '此瀏覽器無法播放這個影片格式，可改選 H.264 MP4。' : code === 3 ? '影片解碼失敗，可能內容損壞或編碼不相容。' : '媒體無法解碼或裝置發生錯誤。'));
    };
    const aborted = () => finish(new DOMException('操作已停止', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('等待影片準備逾時，請重新選片或重試。')), timeoutMs);
    target.addEventListener(name, success, { once: true });
    target.addEventListener('error', failure, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

/** @param {EventTarget} target @param {string} name @param {() => void | Promise<unknown>} action @param {AbortSignal} [signal] @param {number} [timeoutMs] */
export async function mediaAction(target, name, action, signal, timeoutMs = 15_000) {
  const waiting = new AbortController();
  const cancel = () => waiting.abort(signal?.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  // 啟動失敗與事件等待必須共用清理，否則 play 拒絕或 setter 拋錯會留下逾時與監聽。
  const pending = event(target, name, waiting.signal, timeoutMs);
  try { await Promise.all([pending, Promise.resolve().then(() => { waiting.signal.throwIfAborted(); return action(); })]); }
  finally { waiting.abort(); signal?.removeEventListener('abort', cancel); }
}

// 啟播承諾完成不代表兩側像素已呈現；先收原生影格通知，輸出才不會錄入啟動等待。
/** @param {HTMLVideoElement} video @param {AbortSignal} signal @param {(frame: VideoFrameCallbackMetadata) => boolean} [accept] */
export async function presentedFrame(video, signal, accept = _frame => true) {
  signal.throwIfAborted();
  if (!video.requestVideoFrameCallback) { await event(video, 'playing', signal); return; }
  return /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
    let id, finished = false;
    const finish = error => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal.removeEventListener('abort', aborted);
      if (id !== undefined) video.cancelVideoFrameCallback(id);
      error ? reject(error) : resolve();
    };
    const aborted = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new Error('等待比較畫面逾時，原片保留，請重新預覽後重試。')), 15_000);
    const watch = () => {
      try {
        id = video.requestVideoFrameCallback((_now, frame) => {
          id = undefined;
          // 暖機用來源時間確認播放確實前進；定位後則只把此通知當成呈現步驟屏障。
          try { if (accept(frame)) finish(); else watch(); } catch (error) { finish(error); }
        });
      } catch (error) { finish(error); }
    };
    signal.addEventListener('abort', aborted, { once: true }); watch();
  }));
}

export async function seek(video, seconds, signal, waitForFrame = false) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('跳轉時間不正確。');
  if (video.readyState < 1) throw new Error('影片尚未準備好，請先重新選片。');
  signal?.throwIfAborted();
  if (!waitForFrame) {
    if (Math.abs(video.currentTime - seconds) < 0.001 && video.readyState >= 2) return;
    await mediaAction(video, 'seeked', () => { video.currentTime = seconds; }, signal); return;
  }
  if (!video.requestVideoFrameCallback) throw new Error('此瀏覽器無法確認起始畫面，未開始合成；原片保留。');
  const waiting = new AbortController(), cancel = () => waiting.abort(signal?.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    // 訂閱必須先於 seek；seeked 只代表播放位置完成，不能保證 Canvas 已讀到那一格。
    // Safari 暫停回零的唯一通知可能仍帶舊 mediaTime；再等 metadata 歸零會永久卡住。
    // 通知與 seeked 分別等待，完成後由呼叫端重畫 Canvas；metadata 不當作像素正確的證據。
    const frame = presentedFrame(video, waiting.signal);
    await Promise.all([frame, mediaAction(video, 'seeked', () => { video.currentTime = seconds; }, waiting.signal)]);
  } finally { waiting.abort(); signal?.removeEventListener('abort', cancel); }
}

export async function load(video, url, signal) {
  await mediaAction(video, 'loadeddata', () => { video.src = url; video.load(); }, signal);
  if (!video.videoWidth || !video.videoHeight) throw new Error('選取的檔案沒有可解碼的視訊。');
  // Chromium 的即時 WebM 可能沒有 duration；實際 seek 尾端，不能拿 chunks 數猜長度。
  if (!Number.isFinite(video.duration)) await seek(video, 1e9, signal);
  const durationMs = Math.round(video.duration * 1000);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error('無法讀回影片長度，請先另存原片。');
  await seek(video, 0, signal);
  return durationMs;
}

export function cameraError(error, facing) {
  switch (error?.name) {
    case 'NotAllowedError': case 'SecurityError': return new Error('相機權限未開啟。請在瀏覽器允許相機，再按開啟；不需要麥克風。');
    case 'NotFoundError': return new Error('找不到可用相機，請接上相機或換裝置後重試。');
    case 'OverconstrainedError': return new Error(facing === 'environment' ? '沒有可用的後鏡頭，請選前鏡頭再重試。' : '目前相機無法使用這組設定，請重新開啟或換相機。');
    case 'NotReadableError': case 'AbortError': return new Error('相機可能被其他程式使用或暫時中斷。請關閉其他相機程式，再按開啟重試。');
    default: return new Error('相機無法開啟，請確認連接與瀏覽器權限後重試。');
  }
}

/** @param {Array<{index: number, blob: Blob}>} rows */
export function assembleChunks(rows) {
  if (!rows.length) throw new Error('沒有可恢復的錄影片段；筆記仍保留。');
  const mime = rows.find(row => row.blob?.type)?.blob.type || '', family = mime.split(';')[0];
  // 缺首塊、缺號或混合容器不拼成「成功」；原始 chunks 留在庫中，不能靠重置修復。
  if (rows.some((row, index) => row.index !== index || !(row.blob instanceof Blob) || !row.blob.size || (row.blob.type && row.blob.type.split(';')[0] !== family))) throw new Error('錄影片段不完整或格式不一致；已保留原資料，不能標示成功。');
  return new Blob(rows.map(row => row.blob), { type: mime });
}

/** @param {MediaStream} stream @param {(blob: Blob) => void} onChunk @param {(timeMs: number) => void} onStart @param {{webmOnly?: boolean}} [options] */
export function record(stream, onChunk = () => {}, onStart = () => {}, { webmOnly = false } = {}) {
  if (!globalThis.MediaRecorder) throw new Error('此瀏覽器沒有錄影能力。');
  // Safari VS 的 MP4 成檔仍超出覆蓋門檻；專用選項不能默退該路徑，也不能改掉相機／Chrome 順序。
  const candidates = webmOnly ? ['video/webm;codecs=vp8,opus'] : ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm', ''];
  let recorder;
  for (const mimeType of candidates) {
    if (mimeType && !MediaRecorder.isTypeSupported(mimeType)) continue;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
      // start() 呼叫與原生 start 事件分開觀測，不能冒充影格同步證據。
      recorder.addEventListener('start', () => onStart(Math.round(performance.now())), { once: true });
      recorder.start(1000);
      break;
    } catch { recorder = null; }
  }
  if (!recorder) throw new Error(webmOnly ? '此瀏覽器無法啟動 WebM（VP8／Opus）比較匯出，請改用 Chrome；原片、設定及前次 VS 保留。' : '裝置無法啟動任何候選錄影格式。');
  const chunks = [];
  let resolveDone, rejectDone, resolveStopped, rejectStopped, failure, finished = false, timer;
  const done = /** @type {Promise<Blob>} */ (new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; }));
  const stopped = /** @type {Promise<Blob>} */ (new Promise((resolve, reject) => { resolveStopped = resolve; rejectStopped = reject; }));
  const data = e => { if (e.data.size) { chunks.push(e.data); onChunk(e.data); } };
  const error = () => { failure = new Error('編碼失敗；原始片段保留，請降低負載後重試。'); rejectDone(failure); };
  const cleanup = () => {
    finished = true; clearTimeout(timer);
    recorder.removeEventListener('dataavailable', data); recorder.removeEventListener('error', error); recorder.removeEventListener('stop', stoppedEvent);
  };
  const stoppedEvent = () => {
    // 編碼 error 先通知 owner 停止，但仍等原生 stop 收齊最後一塊，不能提早撤銷落盤監聽。
    const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type }); cleanup();
    if (blob.size) { resolveStopped(blob); failure ? rejectDone(failure) : resolveDone(blob); }
    else { const empty = failure || new Error('沒有錄到影片資料。'); rejectStopped(empty); rejectDone(empty); }
  };
  recorder.addEventListener('dataavailable', data); recorder.addEventListener('error', error); recorder.addEventListener('stop', stoppedEvent, { once: true });
  done.catch(() => {}); stopped.catch(() => {});
  return {
    done,
    async stop() {
      if (!finished && !timer) timer = setTimeout(() => { failure ??= new Error('等待錄影停止逾時；已保留原始片段。'); cleanup(); rejectStopped(failure); rejectDone(failure); }, 15_000);
      if (recorder.state !== 'inactive') recorder.stop();
      const blob = await stopped;
      if (failure) throw failure;
      return blob;
    },
  };
}

/** @param {Blob} file */
export async function normalizedVideo(file) {
  if (!file.size) throw new Error('這是空檔案，請重新選取。');
  // 只讀固定小段檔頭補正下載容器；不讀完整原片、不轉碼，也不以此取代實際播放驗證。
  const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer()), header = String.fromCharCode(...bytes);
  const declared = file.type.split(';')[0];
  let mime = header.slice(4, 8) === 'ftyp' ? header.slice(8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4' : '';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    if (header.includes('\x42\x82\x84webm')) mime = 'video/webm';
    else if (header.includes('\x42\x82\x88matroska')) mime = 'video/x-matroska';
  }
  mime ||= ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'].includes(declared) ? declared : '';
  if (!mime) throw new Error('無法確認影片容器，請改選 H.264 MP4／MOV 或受測 WebM；原片未修改。');
  return declared === mime ? file : new Blob([file], { type: mime });
}

export function extension(mimeType) {
  if (mimeType.startsWith('video/mp4')) return 'mp4';
  if (mimeType.startsWith('video/webm')) return 'webm';
  if (mimeType.startsWith('video/quicktime')) return 'mov';
  if (mimeType.startsWith('video/x-matroska')) return 'mkv';
  throw new Error('未知輸出容器，無法提供正確副檔名。');
}
