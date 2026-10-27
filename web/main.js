/* 檔案用途：串起 M0 選片、相機、校正與單一 VS 成檔。所在層：獨立 Web 原型。主要關聯：timeline.js、recorder.js、MEDIA_PROBE.md。 */
import { comparison, positions, contain, validateMarkerRange, captureDuration } from './timeline.js';
import { mediaAction, seek, load, record, extension, cameraError } from './recorder.js';
import { validateBackup, parseBackup, mergeBackup } from './library.js';
import { readLibrary, writeLibrary, readMedia, saveChunk, recoverChunks, clearChunks, withTakeLock } from './storage.js';

/** @template {keyof import('./types').Elements} K @param {K} id @returns {import('./types').Elements[K]} */
function $(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少必要控制：${id}`);
  // ID 與 HTML 有明確對照，避免把非輸入元素誤當 value／disabled 控制。
  return /** @type {import('./types').Elements[K]} */ (element);
}
function drawingContext(canvas) {
  const value = canvas.getContext('2d', { alpha: false });
  if (!value) throw new Error('無法啟動 2D 畫面。');
  return value;
}
const reference = $('reference'), self = $('self'), preview = $('preview'), output = $('output');
const canvas = $('canvas'), context = drawingContext(canvas);
let camera, cameraWatch, active, referenceDurationMs = 0, selfDurationMs = 0, takeBlob, outputBlob;
let audio, audioSource, monitor, audioDestination;
const urls = new Map();
/** @type {import('./types').Diagnostics} */
const diagnostics = { stage: 'idle', camera: null, capture: null, export: null };
/** @type {import('./types').LibraryState} */
let state;
let ready, currentVideoId, currentReferenceFile, pendingLinkId, pendingTakeId, activeTakeId, markerEditingId;
let markerVideoId;
let looping = false, practiceStarting = false, practiceController, practiceSeek, practiceFrame, practiceFrameUsesVideo, practiceToken = 0;

function status(message) { $('status').textContent = message; }
function report() { $('diagnostics').textContent = JSON.stringify(diagnostics, null, 2); }
function urlFor(key, blob) {
  const previous = urls.get(key);
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  if (previous) URL.revokeObjectURL(previous);
  return url;
}
/** @param {'take-download' | 'output-download'} id @param {Blob} blob @param {string} prefix */
function download(id, blob, prefix) {
  const link = $(id);
  link.href = urlFor(id, blob);
  link.download = `${prefix}.${extension(blob.type)}`;
  link.hidden = false;
}
function releaseCamera() {
  cameraWatch?.abort(); cameraWatch = null;
  camera?.getTracks().forEach(track => { track.stop(); });
  camera = null;
  preview.srcObject = null;
  preview.hidden = true;
  $('preview-frame').hidden = true;
  self.hidden = false;
  $('capture').disabled = true;
}
function stop() {
  active?.abort();
  reference.pause(); self.pause();
  releaseCamera();
  stopPractice();
}
function updateControls() {
  $('camera').disabled = !referenceDurationMs || !currentVideoId;
  $('new-take').disabled = !referenceDurationMs || !currentVideoId || !!active;
  $('capture').disabled = !camera;
  $('compare').disabled = !referenceDurationMs || !selfDurationMs || !!active;
  // 錄製後固定來源區間與速度，避免調校時悄悄改變自拍的時間意義。
  for (const id of /** @type {const} */ (['start', 'end', 'rate'])) $(id).disabled = !!selfDurationMs;
  $('practice').disabled = !currentVideoId || !!active;
  for (const el of $('library-panel').querySelectorAll('button, input, select')) (/** @type {HTMLButtonElement | HTMLInputElement | HTMLSelectElement} */ (el)).disabled = !!active;
}
async function operation(task) {
  if (active) return;
  const controller = new AbortController();
  active = controller;
  stopPractice();
  $('controls').disabled = true; $('compare').disabled = true;
  reference.controls = false; self.controls = false;
  $('practice').disabled = true;
  for (const el of $('library-panel').querySelectorAll('button, input, select')) (/** @type {HTMLButtonElement | HTMLInputElement | HTMLSelectElement} */ (el)).disabled = true;
  try { await ready; await task(controller.signal); }
  catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught));
    releaseCamera();
    status(error.name === 'AbortError' ? '已停止，原片與上次成功的輸出仍保留。' : `${error.message} 原片仍保留，可重試。`);
    diagnostics.lastError = error.name === 'AbortError' ? 'cancelled' : error.message;
  } finally {
    reference.pause(); self.pause();
    if (monitor) monitor.gain.value = 1;
    if (audio?.state === 'running') await audio.suspend().catch(() => {});
    active = null; $('controls').disabled = false;
    applyPracticeSettings(); drawPractice();
    reference.controls = true; self.controls = true;
    updateControls(); report();
  }
}
function abortIfNeeded(signal) { signal.throwIfAborted(); }
/** @returns {Promise<void>} */
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, ms);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  });
}
function recipe() {
  const value = { startMs: Math.round(Number($('start').value) * 1000), endMs: Math.round(Number($('end').value) * 1000), rate: Number($('rate').value), offsetMs: Math.round(Number($('offset').value) * 1000), selfDurationMs,
    referenceMirror: $('reference-mirror').checked, selfMirror: $('self-mirror').checked };
  if (!referenceDurationMs || value.endMs > referenceDurationMs) throw new Error('片段終點超過示範影片長度。');
  comparison({ ...value, selfDurationMs: selfDurationMs || 60_000 });
  return value;
}
function mirrors() {
  // 只翻轉媒體層，避免連控制文字一起反向；取景與輸出刻意使用不同欄位。
  preview.classList.toggle('mirror', $('preview-mirror').checked);
  // 原生 video 控制不翻轉；真正的鏡像比較以 canvas 與同一份配方呈現。
  if (referenceDurationMs && selfDurationMs && !active) {
    try { draw(recipe()); } catch { /* 尚未填好配方時保留上一幀。 */ }
  }
}
async function prepareAudio() {
  if (!audio) {
    audio = new AudioContext();
    audioSource = audio.createMediaElementSource(reference);
    monitor = audio.createGain();
    audioDestination = audio.createMediaStreamDestination();
    // 同一個 video 一生只能掛一個來源節點；重試匯出時重用，避免第二次無聲或拋錯。
    audioSource.connect(monitor).connect(audio.destination);
    audioSource.connect(audioDestination);
  }
  await audio.resume();
  if (audio.state !== 'running') throw new Error('音訊尚未啟動，請再次點按重試。');
}
function draw(value) {
  context.fillStyle = '#080c0e'; context.fillRect(0, 0, 1280, 720);
  for (const [video, x, mirror, label] of [[reference, 0, value.referenceMirror, '示範'], [self, 640, value.selfMirror, '我']]) {
    if (video.readyState < 2) continue;
    const rect = contain(video.videoWidth, video.videoHeight, 640, 672);
    context.save(); context.translate(x + (mirror ? 640 : 0), 48); context.scale(mirror ? -1 : 1, 1);
    context.drawImage(video, rect.x, rect.y, rect.width, rect.height); context.restore();
    context.fillStyle = '#e8f2ed'; context.font = '24px sans-serif'; context.fillText(label, x + 22, 33);
  }
}
async function align(value, elapsedMs, signal) {
  reference.pause(); self.pause();
  const target = positions(value, elapsedMs);
  await Promise.all([seek(reference, target.referenceMs / 1000, signal), seek(self, target.selfMs / 1000, signal)]);
  draw(value);
}
async function timeline(value, signal, exporting) {
  const { durationMs } = comparison(value);
  const first = positions(value, 0);
  reference.playbackRate = value.rate; self.playbackRate = 1;
  await Promise.all([reference.play(), self.play()]);
  abortIfNeeded(signal);
  const began = performance.now();
  let maxDriftMs = 0, lastProgress = began, lastElapsed = 0;
  await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
    let frame;
    const finish = error => { cancelAnimationFrame(frame); signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
    const aborted = () => finish(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    const tick = () => {
      if (signal.aborted) return aborted();
      const elapsedMs = (reference.currentTime * 1000 - first.referenceMs) / value.rate;
      if (elapsedMs >= durationMs - 20 || (reference.ended && elapsedMs >= durationMs - 100)) return finish();
      if (reference.ended || self.ended || reference.paused || self.paused) return finish(new Error('播放提前中斷，未完成合成。'));
      const now = performance.now();
      if (elapsedMs > lastElapsed + 1) { lastProgress = now; lastElapsed = elapsedMs; }
      if (now - lastProgress > 1000 || now - began > durationMs + 10_000) return finish(new Error('播放停滯，請降低負載後重試。'));
      const driftMs = self.currentTime * 1000 - (first.selfMs + elapsedMs);
      maxDriftMs = Math.max(maxDriftMs, Math.abs(driftMs));
      // 小偏差用速率輕調，不逐幀 seek；大偏差停止輸出，避免把壞同步標成成功。
      self.playbackRate = Math.max(0.95, Math.min(1.05, 1 - driftMs / 2000));
      if (exporting && Math.abs(driftMs) > 250 && now - began > 500) return finish(new Error('兩側偏移超過 250ms，請重新校正／降低負載。'));
      draw(value);
      $('progress').value = Math.max(0, elapsedMs / durationMs);
      $('scrub').value = String(Math.max(0, elapsedMs / 1000));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }));
  reference.pause(); self.pause(); self.playbackRate = 1;
  $('progress').value = 1;
  return { elapsedMs: Math.round(performance.now() - began), observedMaxDriftMs: Math.round(maxDriftMs) };
}
/** @param {Blob} file @param {HTMLVideoElement} video @param {string} key @param {AbortSignal} [signal] */
async function loadCandidate(file, video, key, signal) {
  const previous = urls.get(key), previousTime = video.currentTime, previousRate = video.playbackRate;
  let nextUrl;
  try {
    if (!file.size) throw new Error('這是空檔案，請重新選取。');
    nextUrl = URL.createObjectURL(file);
    const duration = await load(video, nextUrl, signal);
    signal?.throwIfAborted();
    // 新片解碼成功才釋放舊 URL；取消或壞檔仍能回到原先位置，不破壞筆記綁定。
    if (previous) URL.revokeObjectURL(previous);
    urls.set(key, nextUrl);
    return duration;
  } catch (caught) {
    if (nextUrl) {
      URL.revokeObjectURL(nextUrl);
      if (previous) {
        try { const duration = await load(video, previous); await seek(video, Math.min(previousTime, duration / 1000)); }
        catch { /* 解碼資源不足仍保留舊 URL 與筆記，供重新選檔，不以重置解決。 */ }
        video.playbackRate = previousRate;
      } else { video.removeAttribute('src'); video.load(); }
    }
    throw caught;
  }
}
async function chooseFile(input, video, key, signal) {
  try {
    const file = input.files?.[0];
    return file ? { file, duration: await loadCandidate(file, video, key, signal) } : null;
  } finally { input.value = ''; }
}
$('reference-file').addEventListener('change', () => operation(async signal => {
  if (keepMarkerDraft()) { $('reference-file').value = ''; return; }
  if (takeBlob && !confirm('更換示範前，請先下載自拍與 VS。確定改選？')) { $('reference-file').value = ''; return; }
  releaseCamera();
  const selected = await chooseFile($('reference-file'), reference, 'reference', signal);
  if (!selected) return;
  clearMarkerEditor();
  referenceDurationMs = selected.duration;
  $('start').value = '0'; $('end').value = String(Math.min(15, selected.duration / 1000));
  $('offset').value = '0';
  // 新示範不能沿用舊自拍配方；下載連結保留，讓使用者仍能另存舊資料。
  selfDurationMs = 0; takeBlob = null;
  activeTakeId = null; pendingTakeId = null; $('confirm-take').hidden = true; currentVideoId = null; currentReferenceFile = selected.file;
  if (pendingLinkId) {
    currentVideoId = null; $('confirm-link').hidden = false;
    status('請播放並核對標記位置，再點「確認連結到這份筆記」。');
    return;
  }
  const videoId = crypto.randomUUID(), assetId = crypto.randomUUID();
  await saveData(data => {
    data.videos.push({ id: videoId, title: `練舞影片 ${data.videos.length + 1}`, durationMs: selected.duration, revision: 1 });
    data.assets.push({ id: assetId, videoId, kind: 'reference', byteLength: selected.file.size, mimeType: selected.file.type, durationMs: selected.duration, mediaIncluded: false, state: 'session-only', storageKind: 'session' });
  });
  currentVideoId = videoId; $('video-title').value = requireCurrentVideo().title; renderLibrary();
  status(`示範已載入：${reference.videoWidth}×${reference.videoHeight}，${(selected.duration / 1000).toFixed(1)} 秒。可設定片段練習或錄影。`);
}));
$('self-file').addEventListener('change', () => operation(async signal => {
  if (!referenceDurationMs || !currentVideoId) throw new Error('請先載入並連結示範影片。');
  if (takeBlob && !confirm('請先下載上一段自拍。確定載入另一段？')) { $('self-file').value = ''; return; }
  releaseCamera();
  const selected = await chooseFile($('self-file'), self, 'self', signal);
  if (!selected) return;
  // 新檔解碼成功才解除舊 take；失敗或取消時舊影片與配方必須一起保留。
  activeTakeId = null;
  selfDurationMs = selected.duration; takeBlob = selected.file;
  download('take-download', takeBlob, 'dance-self');
  if (pendingTakeId) { $('confirm-take').hidden = false; status('請播放預覽自拍原片，再確認連結到待恢復的 take。'); return; }
  await persistLoadedTake(recipe(), selected.file);
  status('自拍已載入。校正偏移後，可預覽及匯出。'); updateIntersection();
}));
$('camera-facing').addEventListener('change', () => {
  if (active) return;
  releaseCamera(); $('camera').textContent = $('camera-facing').value === 'environment' ? '開啟後相機' : '開啟前相機';
  status('鏡頭選擇已變更，請按開啟相機；尚未存取新鏡頭。');
});
$('new-take').addEventListener('click', () => operation(async () => {
  if (takeBlob && !confirm('請先下載目前自拍與 VS。準備新一段後，已保存的舊 take 仍會保留，確定繼續？')) { releaseCamera(); status('已取消準備下一段，原自拍仍保留。'); return; }
  releaseCamera(); self.pause(); self.removeAttribute('src'); self.load();
  const old = urls.get('self'); if (old) { URL.revokeObjectURL(old); urls.delete('self'); }
  selfDurationMs = 0; takeBlob = null; activeTakeId = null; pendingTakeId = null; $('confirm-take').hidden = true; $('offset').value = '0';
  $('intersection').textContent = '請設定新片段與速度，再開啟相機。'; status('已準備下一段；原有錄影與筆記仍保留。');
}));
$('camera').addEventListener('click', () => operation(async signal => {
  recipe();
  if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('相機需要受信任的 HTTPS 或此電腦的 localhost。');
  releaseCamera(); status('請在瀏覽器中允許相機；不會要求麥克風。');
  const facing = $('camera-facing').value;
  if (!['user', 'environment'].includes(facing)) throw new Error('請選擇前或後鏡頭。');
  // 後鏡頭缺少時明確失敗，不悄悄改用前鏡頭；桌面 webcam 仍可用預設前鏡頭。
  const pending = navigator.mediaDevices.getUserMedia({ video: { facingMode: facing === 'environment' ? { exact: 'environment' } : { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false }).catch(error => { throw signal.aborted ? signal.reason : cameraError(error, facing); });
  const stream = await /** @type {Promise<MediaStream>} */ (new Promise((resolve, reject) => {
    const cancelled = () => reject(signal.reason);
    signal.addEventListener('abort', cancelled, { once: true });
    pending.then(value => {
      signal.removeEventListener('abort', cancelled);
      if (signal.aborted) { value.getTracks().forEach(track => { track.stop(); }); reject(signal.reason); }
      else resolve(value);
    }, error => { signal.removeEventListener('abort', cancelled); reject(error); });
    if (signal.aborted) cancelled();
  }));
  // 權限對話框不能被 AbortController 關閉；遲到的串流仍要立即停止，不能漏開相機。
  if (signal.aborted) { stream.getTracks().forEach(track => { track.stop(); }); abortIfNeeded(signal); }
  camera = stream;
  const watch = new AbortController(); cameraWatch = watch;
  try {
    await mediaAction(preview, 'loadeddata', () => {
      preview.srcObject = stream; preview.hidden = false; $('preview-frame').hidden = false; self.hidden = true;
      return preview.play();
    }, signal);
    const interrupted = () => { if (camera === stream) { stop(); status('相機畫面已中斷，請重新開啟；已錄到的部分會保留。'); } };
    const track = stream.getVideoTracks()[0], width = preview.videoWidth, height = preview.videoHeight;
    track.addEventListener('ended', interrupted, { once: true, signal: watch.signal });
    track.addEventListener('mute', interrupted, { once: true, signal: watch.signal });
    preview.addEventListener('resize', () => { if (camera === stream && (preview.videoWidth !== width || preview.videoHeight !== height)) interrupted(); }, { signal: watch.signal });
    const cameraSettings = stream.getVideoTracks()[0].getSettings();
    // 裝置 label／deviceId 可能識別個人設備；診斷只留下必要能力數字。
    diagnostics.camera = Object.fromEntries(['width', 'height', 'frameRate', 'facingMode'].map(k => [k, cameraSettings[k]]));
    mirrors(); status(`相機已就緒${cameraSettings.facingMode ? '' : '（裝置未回報鏡頭方向，請自行確認畫面）'}。請把全身與腳步放在框內，再點倒數錄影。`);
  } catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught)); releaseCamera(); throw error; }
}));
$('capture').addEventListener('click', () => operation(async signal => {
  if (!camera) throw new Error('請先開啟相機。');
  const value = recipe(); captureDuration(value);
  // 確認框的取消也會關閉預覽，避免使用者退出重錄後相機仍持續開啟。
  if (takeBlob && !confirm('請先下載目前自拍與 VS。重錄會建立新 take，已保存的舊段仍會保留，確定繼續？')) { releaseCamera(); status('已取消新錄影，原自拍與已保存的舊段都保留。'); return; }
  const info = /** @type {import('./types').CaptureInfo} */ ({ rate: value.rate, interrupted: true }); diagnostics.capture = info;
  let recording, take, chunkQueue = Promise.resolve(), chunkError, persistenceError, chunkIndex = 0;
  try {
    take = await beginTake(value);
    // 與恢復操作共用原生鎖，避免另一分頁把尚在錄製的 take 當成中斷接管。
    await withTakeLock(take.id, async () => {
      try {
        await prepareAudio();
        await seek(reference, value.startMs / 1000, signal);
        reference.playbackRate = value.rate;
        for (let n = Number($('countdown').value); n > 0; n--) { status(`${n} 秒後開始，請就定位。`); await wait(1000, signal); }
        abortIfNeeded(signal);
        info.recorderRequestedMs = Math.round(performance.now());
        recording = record(camera, blob => {
          chunkQueue = chunkQueue.then(() => saveChunk(take.cameraAssetId, chunkIndex++, blob)).catch(error => {
            chunkError = error;
            // 舊 take 的遲到寫入失敗不能中止下一個操作；仍保留該 take 的 chunks 供恢復。
            if (active?.signal === signal && !signal.aborted) { active.abort(new Error('錄影片段保存失敗，請先下載原片。')); stop(); }
          });
        }, startedMs => { info.recorderStartedMs = startedMs; });
        recording.done.catch(error => { if (active?.signal === signal && !signal.aborted) { active.abort(error); stop(); } });
        const began = performance.now();
        await reference.play();
        info.referencePlayResolvedMs = Math.round(performance.now()); info.referenceAtPlayMs = Math.round(reference.currentTime * 1000); info.interrupted = false;
        status('錄影中。示範到片段終點會停止，也可隨時按停止。');
        while (reference.currentTime * 1000 < value.endMs && !reference.ended) {
          if (performance.now() - began > 62_000) throw new Error('播放／錄影逾時。');
          if (reference.paused) throw new Error('示範播放中斷。');
          await wait(30, signal);
        }
      } finally {
        reference.pause();
        if (recording) {
          info.interrupted = signal.aborted || reference.currentTime * 1000 < value.endMs - 100;
          try {
            const stopped = recording.stop(); releaseCamera();
            const blob = await stopped;
            // 先提供原片下載，再讀回驗證；解碼失敗也不能讓已錄下的資料消失。
            download('take-download', blob, 'dance-self');
            const durationMs = await loadCandidate(blob, self, 'self');
            // 新原片解碼成功才切換關聯；倒數取消或壞檔不能把舊畫面綁到新 take。
            takeBlob = blob; selfDurationMs = durationMs; activeTakeId = take.id; pendingTakeId = null; $('confirm-take').hidden = true; $('offset').value = '0';
            info.mime = blob.type; info.durationMs = durationMs;
            await chunkQueue;
            info.interrupted ||= signal.aborted || !!chunkError;
            const captureTiming = info.recorderRequestedMs === undefined ? undefined : { recorderRequestedMs: info.recorderRequestedMs, ...Object.fromEntries(['recorderStartedMs', 'referencePlayResolvedMs', 'referenceAtPlayMs'].filter(key => info[key] !== undefined).map(key => [key, info[key]])) };
            try { await finalizeTake(take, blob, durationMs, info.interrupted, captureTiming); }
            catch (error) { persistenceError = error instanceof Error ? error : new Error('儲存發生錯誤。'); }

          } finally { releaseCamera(); }
        } else releaseCamera();
      }
      if (persistenceError) throw persistenceError;
      if (chunkError) throw new Error('錄影片段落盤曾失敗；已保留可下載原片，請先下載。');
      status('自拍已錄好。先下載原片，再校正與合成。'); updateIntersection();
    });
  } catch (error) {
    if (take) await markStoppedTake(take, recording ? 'interrupted' : 'failed').catch(() => { diagnostics.lastError = '錄影狀態無法更新；原片與 chunks 保留，請下載原片後重開。'; });
    if (persistenceError) throw new Error(`自拍無法保存在此瀏覽器，請立即下載自拍原片。${persistenceError.message}`);
    throw error;
  } finally { releaseCamera(); await chunkQueue; }
}));
function updateIntersection() {
  try {
    const value = recipe(), range = comparison(value);
    $('scrub').max = String(range.durationMs / 1000); $('scrub').value = '0';
    $('intersection').textContent = `共同長度 ${(range.durationMs / 1000).toFixed(2)} 秒；輸出保持 ${value.rate}× 練習速度。`;
    $('play').disabled = false; $('export').disabled = false;
  } catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught)); $('intersection').textContent = error.message; $('play').disabled = true; $('export').disabled = true; }
}
for (const id of /** @type {const} */ (['start', 'end', 'rate', 'offset', 'reference-mirror', 'self-mirror', 'preview-mirror'])) $(id).addEventListener('change', () => { mirrors(); if (selfDurationMs) updateIntersection(); });
$('scrub').addEventListener('change', () => operation(async signal => { await align(recipe(), Number($('scrub').value) * 1000, signal); status('已定位兩側畫面。'); }));
$('play').addEventListener('click', () => operation(async signal => {
  const value = recipe(); await prepareAudio(); await align(value, 0, signal);
  status('共同預覽中，鏡像請看下方合成畫面。');
  diagnostics.preview = await timeline(value, signal, false); status('預覽結束，可調整偏移或輸出。');
}));
$('export').addEventListener('click', () => operation(async signal => {
  const value = recipe(); let stream, recording, blob;
  await saveCurrentRecipe();
  await prepareAudio(); await align(value, 0, signal); abortIfNeeded(signal);
  try {
    // ponytail: 前景即時合成免轉碼套件；通過 M0 實測後才評估更快的編碼路徑。
    monitor.gain.value = 0;
    stream = canvas.captureStream(30);
    audioDestination.stream.getAudioTracks().forEach(track => { stream.addTrack(track.clone()); });
    recording = record(stream);
    recording.done.catch(error => { if (active?.signal === signal && !signal.aborted) active.abort(error); });
    status('合成中，請保持此頁在前景。取消後仍可重試。');
    const measured = await timeline(value, signal, true);
    blob = await recording.stop();
    diagnostics.export = { ...measured, mime: blob.type, bytes: blob.size, requestedWidth: 1280, requestedHeight: 720, recipe: value };
    const temporary = URL.createObjectURL(blob), validationVideo = document.createElement('video');
    validationVideo.muted = true; validationVideo.playsInline = true;
    // 用獨立元素驗證新檔，取消或壞檔不能破壞上一個成功輸出的播放器。
    try { diagnostics.export.decodedDurationMs = await load(validationVideo, temporary, signal); }
    finally { validationVideo.removeAttribute('src'); validationVideo.load(); URL.revokeObjectURL(temporary); }
    abortIfNeeded(signal);
    outputBlob = blob; download('output-download', blob, 'dance-vs');
    output.pause(); output.src = urls.get('output-download'); output.hidden = false;
    $('share').disabled = false;
    try {
      await persistExport(blob, diagnostics.export.decodedDurationMs);
      status('VS 影片已成檔並保存在此瀏覽器。請下載，離開本站後重新播放驗證。');
    } catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught)); status(`VS 已成檔但無法保存到此瀏覽器：${error.message} 請立即下載；原片仍保留。`); }
  } finally {
    reference.pause(); self.pause();
    if (recording) await recording.stop().catch(() => {});
    stream?.getTracks().forEach(track => { track.stop(); });
  }
}));
$('share').addEventListener('click', async () => {
  if (!outputBlob) return;
  const file = new File([outputBlob], `dance-vs.${extension(outputBlob.type)}`, { type: outputBlob.type });
  if (!navigator.canShare?.({ files: [file] })) { status('此瀏覽器無法分享影片檔，請改用下載。'); return; }
  try { await navigator.share({ files: [file] }); status('已交給系統分享；請到目的端核對保存結果。'); }
  catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught)); status(error.name === 'AbortError' ? '已取消分享，影片仍保留。' : '分享失敗，影片仍可下載或重試。'); }
});
$('stop').addEventListener('click', () => { stop(); status('已要求停止，正在保留已錄到的資料。'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('orientationchange', stop);
document.addEventListener('freeze', () => { stop(); audio?.suspend().catch(() => {}); });
window.addEventListener('pagehide', e => {
  stop();
  // BFCache 仍保留同一個 video／音訊來源，不能關掉 context 後再替它建立第二個來源節點。
  if (e.persisted) { audio?.suspend().catch(() => {}); return; }
  audio?.close().catch(() => {});
  urls.forEach(url => { URL.revokeObjectURL(url); }); urls.clear();
});
window.addEventListener('pageshow', e => { if (e.persisted) status('已返回頁面。錄影保持停止，請確認片段後重新開啟相機。'); });
window.addEventListener('beforeunload', e => { if (active || !$('marker-form').hidden) { e.preventDefault(); e.returnValue = ''; } });

function currentVideo() { return state.data.videos.find(v => v.id === currentVideoId); }
function requireCurrentVideo() { const video = currentVideo(); if (!video) throw new Error('影片筆記已失聯，請重新開啟。'); return video; }
async function saveData(change, mediaChange) {
  const next = structuredClone(state.data); change(next); validateBackup(next);
  state = await writeLibrary(next, state.revision, mediaChange);
  $('storage-status').textContent = '已保存在此瀏覽器。JSON 備份及影片請另行下載。';
  renderLibrary();
}
function button(text, action) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
  el.addEventListener('click', () => operation(action)); return el;
}
function renderLibrary() {
  const selected = $('library').value;
  $('library').replaceChildren(new Option('選擇影片筆記', ''));
  for (const video of state.data.videos) $('library').add(new Option(video.title, video.id));
  $('library').value = currentVideoId || pendingLinkId || selected;
  $('markers').replaceChildren(); $('takes').replaceChildren();
  for (const marker of state.data.markers.filter(m => m.videoId === currentVideoId).sort((a, b) => a.startMs - b.startMs)) {
    const li = document.createElement('li'), text = document.createElement('p');
    text.textContent = `${(marker.startMs / 1000).toFixed(3)}s${marker.endMs === undefined ? '' : `–${(marker.endMs / 1000).toFixed(3)}s`} · ${marker.title}\n${marker.note}`;
    li.append(text);
    const outside = referenceDurationMs > 0 && (marker.endMs ?? marker.startMs) > referenceDurationMs;
    if (outside) text.append(document.createTextNode('（超出目前影片，請編輯修復）'));
    const jump = button('跳到這裡', async signal => {
      if (!referenceDurationMs || (marker.endMs ?? marker.startMs) > referenceDurationMs) throw new Error('請先重連足夠長度的示範，或修復超界標記。');
      await seek(reference, marker.startMs / 1000, signal);
      if (!selfDurationMs && marker.endMs !== undefined) { $('start').value = String(marker.startMs / 1000); $('end').value = String(marker.endMs / 1000); }
      status(marker.endMs === undefined ? '已跳到標記。' : selfDurationMs ? '已跳到標記；已有自拍，錄影片段維持原設定。' : '已跳到標記，並將區間設為下一次練習片段。');
    });
    jump.disabled = outside;
    li.append(jump, button('編輯', async () => editMarker(marker)), button('刪除標記', async () => {
      if (keepMarkerDraft()) return;
      if (!confirm('確定刪除這個標記？其他筆記與影片不受影響。')) return;
      await saveData(data => { data.markers = data.markers.filter(m => m.id !== marker.id); });
    }));
    $('markers').append(li);
  }
  for (const take of state.data.takes.filter(t => t.referenceVideoId === currentVideoId)) {
    const li = document.createElement('li');
    const mediaState = state.data.assets.find(a => a.id === take.cameraAssetId)?.state;
    const label = take.state === 'failed' ? '未錄成；可重新錄製' : take.state === 'interrupted' ? mediaState === 'ready' ? '中斷片段已保存' : '中斷待恢復' : mediaState === 'missing' ? '原片待重連' : take.state === 'ready' ? '已保存' : '可能錄製中／待恢復';
    li.append(document.createTextNode(`${take.rate}× · ${((take.referenceEndMs - take.referenceStartMs) / take.rate / 1000).toFixed(1)} 秒 · ${label} `));
    li.append(button('開啟自拍／恢復', signal => openTake(take, signal)));
    for (const artifact of state.data.exports.filter(e => state.data.recipes.some(r => r.id === e.recipeId && r.takeId === take.id))) li.append(button('下載已存 VS', async () => {
      const blob = await readMedia(artifact.assetId); if (!blob) throw new Error('找不到這個 VS，請用另存的影片或原片重新合成。');
      outputBlob = blob; download('output-download', blob, 'dance-vs'); output.src = urls.get('output-download'); output.hidden = false; $('share').disabled = false;
      status('已取回保存的 VS，可用下方連結下載。');
    }));
    $('takes').append(li);
  }
}
async function beginTake(value) {
  if (!currentVideoId) throw new Error('請先開啟並連結影片筆記。');
  /** @type {import('./types').Take} */
  const take = { id: crypto.randomUUID(), referenceVideoId: currentVideoId, cameraAssetId: crypto.randomUUID(), referenceStartMs: value.startMs, referenceEndMs: value.endMs, rate: value.rate, state: 'recording', createdAt: new Date().toISOString() };
  await saveData(data => {
    data.assets.push({ id: take.cameraAssetId, kind: 'take', byteLength: 0, mimeType: '', mediaIncluded: false, state: 'copying', storageKind: 'indexeddb' });
    data.takes.push(take);
    data.recipes.push({ id: crypto.randomUUID(), takeId: take.id, offsetMs: 0, referenceMirror: value.referenceMirror, selfMirror: value.selfMirror, layout: 'side-by-side', audioSource: 'reference', revision: 1 });
  });
  // 建立工作記錄不代表已換片，倒數取消時必須保留原自拍與配方的關聯。
  return take;
}
/** @param {import('./types').Take} take @param {Blob} blob @param {number} durationMs @param {boolean} interrupted @param {import('./types').CaptureTiming} [captureTiming] */
async function finalizeTake(take, blob, durationMs, interrupted = false, captureTiming) {
  await saveData(data => {
    const asset = data.assets.find(a => a.id === take.cameraAssetId);
    if (!asset) throw new Error('自拍媒體記錄失聯；原片仍可下載。');
    Object.assign(asset, { byteLength: blob.size, mimeType: blob.type, durationMs, state: 'ready', storageKind: 'indexeddb' });
    const savedTake = data.takes.find(t => t.id === take.id);
    if (!savedTake) throw new Error('自拍記錄失聯，未刪除任何媒體。');
    savedTake.state = interrupted ? 'interrupted' : 'ready';
    if (captureTiming) savedTake.captureTiming = captureTiming;
  }, { id: take.cameraAssetId, blob });
  await clearChunks(take.cameraAssetId).catch(() => { diagnostics.chunkCleanup = 'pending'; });
}
async function markStoppedTake(take, nextState) {
  const saved = state.data.takes.find(t => t.id === take.id);
  if (!saved || saved.state === 'ready' || saved.state === nextState) return;
  await saveData(data => {
    const row = data.takes.find(t => t.id === take.id), asset = data.assets.find(a => a.id === take.cameraAssetId);
    row.state = nextState;
    if (asset && !asset.durationMs) asset.state = nextState;
  });
}
async function persistLoadedTake(value, blob) {
  const take = await beginTake(value); activeTakeId = take.id; pendingTakeId = null; $('confirm-take').hidden = true;
  await finalizeTake(take, blob, selfDurationMs);
}
async function saveCurrentRecipe() {
  if (!activeTakeId) return;
  const value = recipe();
  await saveData(data => {
    const row = data.recipes.find(r => r.takeId === activeTakeId);
    if (row.offsetMs !== value.offsetMs || row.referenceMirror !== value.referenceMirror || row.selfMirror !== value.selfMirror) {
      Object.assign(row, { offsetMs: value.offsetMs, referenceMirror: value.referenceMirror, selfMirror: value.selfMirror, revision: row.revision + 1 });
    }
  });
}
async function persistExport(blob, durationMs) {
  const row = state.data.recipes.find(r => r.takeId === activeTakeId), assetId = crypto.randomUUID();
  if (!row) throw new Error('找不到比較配方。');
  await saveData(data => {
    data.assets.push({ id: assetId, kind: 'vs', byteLength: blob.size, mimeType: blob.type, durationMs, mediaIncluded: false, state: 'ready', storageKind: 'indexeddb' });
    data.exports.push({ id: crypto.randomUUID(), recipeId: row.id, recipeRevision: row.revision, assetId, mimeType: blob.type, state: 'ready', createdAt: new Date().toISOString() });
  }, { id: assetId, blob });
}
function openTake(take, signal) { return withTakeLock(take.id, () => openTakeUnlocked(take, signal)); }
async function openTakeUnlocked(take, signal) {
  if (!referenceDurationMs) throw new Error('請先重連示範影片，再開啟自拍。');
  if (takeBlob && activeTakeId !== take.id && !confirm('請先下載目前自拍。開啟另一段後，已保存的舊 take 仍保留，確定繼續？')) return;
  const row = state.data.recipes.find(r => r.takeId === take.id);
  if (!row) throw new Error('找不到此自拍的比較配方，沒有變更原畫面。');
  // 已持有同一 take 的恢復鎖，才可把無 owner 的工作狀態改成中斷。
  if (take.state === 'recording') await markStoppedTake(take, 'interrupted');
  releaseCamera();
  let blob = await readMedia(take.cameraAssetId);
  const recovered = !blob;
  if (!blob) {
    try { blob = await recoverChunks(take.cameraAssetId); }
    catch {
      selfDurationMs = 0; activeTakeId = null; takeBlob = null;
      self.removeAttribute('src'); self.load();
      pendingTakeId = take.id; const details = $('self-file').closest('details'); if (details) details.open = true;
      status('自拍原片缺少或暫存片段不完整；原有筆記與錄影片段都保留。請載入另存的自拍原片，預覽後確認連結。'); return;
    }
  }
  download('take-download', blob, 'dance-self');
  const durationMs = await loadCandidate(blob, self, 'self', signal);
  selfDurationMs = durationMs; takeBlob = blob; activeTakeId = take.id;
  $('start').value = String(take.referenceStartMs / 1000); $('end').value = String(take.referenceEndMs / 1000); $('rate').value = String(take.rate);
  $('offset').value = String(row.offsetMs / 1000); $('reference-mirror').checked = row.referenceMirror; $('self-mirror').checked = row.selfMirror;
  const interrupted = recovered || take.state !== 'ready';
  if (interrupted) await finalizeTake(take, blob, selfDurationMs, true);
  updateIntersection(); draw(recipe()); status(interrupted ? '已取回可播放的中斷片段，仍標示中斷；請檢查長度並下載原片。' : '自拍與校正配方已取回。原片可另外下載。');
}
$('confirm-take').addEventListener('click', () => operation(async signal => {
  const take = state.data.takes.find(t => t.id === pendingTakeId);
  if (!take || take.referenceVideoId !== currentVideoId || !takeBlob || !selfDurationMs) throw new Error('請先載入要重連的自拍原片。');
  await withTakeLock(take.id, async () => {
    await finalizeTake(take, takeBlob, selfDurationMs, take.state !== 'ready'); activeTakeId = take.id; pendingTakeId = null; $('confirm-take').hidden = true;
    await openTakeUnlocked(take, signal);
  });
}));
$('open-library').addEventListener('click', () => operation(async signal => {
  if (keepMarkerDraft()) return;
  const id = $('library').value, video = state.data.videos.find(v => v.id === id); if (!video) throw new Error('請先選一份影片筆記。');
  releaseCamera(); reference.pause(); currentVideoId = id; pendingLinkId = null; pendingTakeId = null; $('confirm-take').hidden = true; selfDurationMs = 0; activeTakeId = null; takeBlob = null;
  $('video-title').value = video.title; $('confirm-link').hidden = true; clearMarkerEditor();
  const asset = state.data.assets.find(a => a.videoId === id && a.kind === 'reference');
  const blob = asset && await readMedia(asset.id);
  referenceDurationMs = 0; currentReferenceFile = null;
  if (blob) {
    referenceDurationMs = await load(reference, urlFor('reference', blob), signal); currentReferenceFile = blob;
    status('已開啟此瀏覽器保存的示範及筆記。');
  } else {
    const previous = urls.get('reference'); if (previous) URL.revokeObjectURL(previous); urls.delete('reference');
    reference.removeAttribute('src'); reference.load(); pendingLinkId = id;
    status('筆記仍在，示範尚未連結。請選片、預覽後確認；不會依同名自動配對。');
  }
  $('start').value = '0'; $('end').value = String(Math.min(15, video.durationMs / 1000)); renderLibrary();
}));
$('confirm-link').addEventListener('click', () => operation(async () => {
  if (!pendingLinkId || !referenceDurationMs) throw new Error('請先選取要預覽的示範影片。');
  const linkedId = pendingLinkId;
  if (!state.data.assets.some(a => a.videoId === linkedId && a.kind === 'reference')) await saveData(data => data.assets.push({ id: crypto.randomUUID(), videoId: linkedId, kind: 'reference', byteLength: currentReferenceFile.size, mimeType: currentReferenceFile.type, durationMs: referenceDurationMs, mediaIncluded: false }));
  currentVideoId = pendingLinkId; pendingLinkId = null; $('confirm-link').hidden = true;
  $('video-title').value = requireCurrentVideo().title; renderLibrary();
  status(referenceDurationMs < requireCurrentVideo().durationMs ? '影片已連結；此檔較短，超界標記保留並需要修復。' : '影片已連結，筆記與配方保持原有時間。');
}));
$('copy-reference').addEventListener('click', () => operation(async () => {
  if (!currentReferenceFile) throw new Error('請先連結示範影片。');
  if (currentReferenceFile.size > 200 * 1024 * 1024) throw new Error('副本初期限制 200 MiB；仍可選片練習並保存筆記。');
  const asset = state.data.assets.find(a => a.videoId === currentVideoId && a.kind === 'reference');
  if (!asset) throw new Error('示範媒體記錄不存在，請重新連結。');
  status('正在保存示範副本，失敗時筆記仍會保留。');
  await saveData(data => { const savedAsset = data.assets.find(a => a.id === asset.id); if (savedAsset) Object.assign(savedAsset, { state: 'ready', storageKind: 'indexeddb', byteLength: currentReferenceFile.size, mimeType: currentReferenceFile.type, durationMs: referenceDurationMs }); }, { id: asset.id, blob: currentReferenceFile }); status('已保存本機示範副本；瀏覽器仍可能清除資料，請自行備份。');
}));
$('remove-copy').addEventListener('click', () => operation(async () => {
  if (!confirm('只移除此瀏覽器的示範副本？筆記、自拍與原始檔不會刪除。')) return;
  const asset = state.data.assets.find(a => a.videoId === currentVideoId && a.kind === 'reference');
  if (!asset) throw new Error('示範媒體記錄不存在，請重新連結。');
  await saveData(data => { const savedAsset = data.assets.find(a => a.id === asset.id); if (savedAsset) Object.assign(savedAsset, { state: 'missing', storageKind: 'external' }); }, { id: asset.id }); status('本機示範副本已移除，筆記保留。下次可重新選片。');
}));
$('save-title').addEventListener('click', () => operation(async () => {
  const title = $('video-title').value.trim(); if (!title) throw new Error('請填寫影片標題。');
  await saveData(data => { const video = data.videos.find(v => v.id === currentVideoId); video.title = title; video.revision++; }); status('標題已保存。');
}));
function clearMarkerEditor() {
  // 換片不能沿用舊標記 ID，否則存檔會把原筆記移到另一支影片。
  markerEditingId = null; markerVideoId = null; $('marker-form').reset(); $('marker-form').hidden = true;
}
function keepMarkerDraft() {
  if ($('marker-form').hidden) return false;
  // 不讓換片或另一個編輯入口靜默吃掉草稿；使用者可明確保存或取消。
  status('這份標記尚未保存，請先儲存或取消編輯。'); return true;
}
function editMarker(marker, clickedMs = Math.round(reference.currentTime * 1000)) {
  if (keepMarkerDraft()) return;
  markerEditingId = marker?.id;
  markerVideoId = currentVideoId;
  $('marker-start').value = String((marker?.startMs ?? clickedMs) / 1000);
  $('marker-end').value = marker?.endMs === undefined ? '' : String(marker.endMs / 1000);
  $('marker-title').value = marker?.title || ''; $('marker-note').value = marker?.note || '';
  $('marker-form').hidden = false; $('marker-title').focus();
}
$('mark').addEventListener('click', () => {
  // 在點擊事件內先取時間；後續打字、非同步保存或播放進度不能改寫它。
  const clickedMs = Math.round(reference.currentTime * 1000);
  if (!active && referenceDurationMs) editMarker(undefined, clickedMs);
});
$('cancel-marker').addEventListener('click', clearMarkerEditor);
$('marker-form').addEventListener('submit', e => {
  e.preventDefault(); operation(async () => {
    const video = requireCurrentVideo();
    if (markerVideoId !== video.id) throw new Error('這份草稿不屬於目前影片，請取消後重新開啟編輯。');
    if (!$('marker-start').value.trim()) throw new Error('請填寫標記起點。');
    const startMs = Math.round(Number($('marker-start').value) * 1000), endMs = $('marker-end').value === '' ? undefined : Math.round(Number($('marker-end').value) * 1000);
    validateMarkerRange(startMs, endMs, Math.min(video.durationMs, referenceDurationMs || video.durationMs));
    const title = $('marker-title').value.trim(); if (!title) throw new Error('請填寫標記標題。');
    status('正在保存時間標記…');
    /** @type {import('./types').Marker} */
    const row = { id: markerEditingId || crypto.randomUUID(), videoId: markerVideoId, startMs, ...(endMs === undefined ? {} : { endMs }), title, note: $('marker-note').value, revision: 1 };
    await saveData(data => {
      const index = data.markers.findIndex(m => m.id === row.id);
      // 即使殘留編輯事件晚到，也不允許跨影片更新既有標記。
      if (markerEditingId && data.markers[index]?.videoId !== row.videoId) throw new Error('這份標記已不屬於目前影片，請重新開啟編輯。');
      if (index < 0) data.markers.push(row); else { row.revision = data.markers[index].revision + 1; data.markers[index] = row; }
    });
    clearMarkerEditor(); status('時間標記已保存；點「跳到這裡」即可回看。');
  });
});
$('backup').addEventListener('click', () => operation(async () => {
  const data = validateBackup(state.data); data.exportedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = urlFor('backup', blob); a.download = 'notes.dance-stamp.json'; a.click();
  status('筆記與配方備份已下載，不含影片。請另存示範、自拍與 VS。');
}));
$('restore').addEventListener('change', () => operation(async () => {
  const file = $('restore').files?.[0]; $('restore').value = ''; if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error('備份超過 10 MiB。');
  const incoming = parseBackup(await file.text()), next = mergeBackup(state.data, incoming);
  if (!confirm(`匯入預覽：${incoming.videos.length} 份影片筆記、${incoming.markers.length} 個標記、${incoming.takes.length} 次自拍。JSON 不含影片，匯入後需重新連結。確定繼續？`)) return;
  state = await writeLibrary(next, state.revision); renderLibrary(); status('筆記已原子匯入；同一備份重匯不產生重複資料。請重連影片。');
}));
function clearPracticeWatch() {
  practiceToken++;
  // frame ID 只屬於原 API；暫停時也清理，避免沒有新影格而永遠掛住的 callback。
  if (practiceFrame !== undefined) {
    if (practiceFrameUsesVideo) reference.cancelVideoFrameCallback(practiceFrame);
    else cancelAnimationFrame(practiceFrame);
  }
  practiceFrame = undefined;
}
function stopPractice() {
  looping = false; practiceStarting = false; clearPracticeWatch(); practiceController?.abort(); practiceController = null;
  reference.pause(); $('loop').textContent = '開始 A–B 循環';
}
function applyPracticeSettings() {
  const rate = Number($('practice-rate').value);
  // 媒體操作暫用錄影速度，結束後還給練習選項；load 與原生播放也沿用同一預設。
  reference.defaultPlaybackRate = rate; reference.playbackRate = rate;
  if ('preservesPitch' in reference) {
    reference.preservesPitch = true;
    $('pitch-status').textContent = '已啟用瀏覽器音高保持；實際聽感依瀏覽器而定。';
  } else $('pitch-status').textContent = '此瀏覽器未提供音高保持，變速時聲音可能變調。';
}
function drawPractice() {
  if (!$('practice-mirror').checked || reference.readyState < 2) return;
  const c = $('practice-canvas'), ctx = drawingContext(c), rect = contain(reference.videoWidth, reference.videoHeight, c.width, c.height);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); ctx.save(); ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(reference, rect.x, rect.y, rect.width, rect.height); ctx.restore();
}
async function rewindPractice(seconds, signal) {
  // tick 與 ended 可能同時抵達尾端；共用進行中的 seek，不排入第二次回捲。
  if (practiceSeek) return practiceSeek;
  const pending = seek(reference, seconds, signal); practiceSeek = pending;
  try { await pending; } finally { if (practiceSeek === pending) practiceSeek = null; }
}
async function playLoopFromA(controller) {
  practiceStarting = true;
  try {
    const { a } = practiceRange(); reference.pause();
    await rewindPractice(a, controller.signal); controller.signal.throwIfAborted();
    applyPracticeSettings();
    // 開始就持有可取消的 owner；晚到的 seek／play 不能在使用者停止後重新啟動。
    await mediaAction(reference, 'playing', () => reference.play(), controller.signal);
    controller.signal.throwIfAborted();
    if (controller === practiceController && !reference.paused) watchPractice();
  } finally { if (controller === practiceController) practiceStarting = false; }
}
function practiceRange() {
  const a = Number($('start').value), b = Number($('end').value);
  if (!$('start').value || !$('end').value || !referenceDurationMs || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a || b * 1000 > referenceDurationMs) throw new Error('請填合法的 A–B 起訖；不會自動交換。');
  return { a, b };
}
function watchPractice() {
  if (active) return;
  clearPracticeWatch(); practiceController ??= new AbortController();
  const token = practiceToken, owner = practiceController;
  const tick = async () => {
    if (token !== practiceToken) return;
    practiceFrame = undefined;
    if (active || reference.paused || document.hidden) return;
    drawPractice();
    if (looping && !reference.seeking) {
      try {
        const { a, b } = practiceRange();
        if (reference.currentTime >= b) await rewindPractice(a, owner.signal);
      } catch (caught) {
        if (owner !== practiceController || token !== practiceToken) return;
        const error = caught instanceof Error ? caught : new Error(String(caught)); if (error.name !== 'AbortError') status(error.message); stopPractice(); return;
      }
    }
    if (token === practiceToken && owner === practiceController && !reference.paused) schedule();
  };
  const schedule = () => {
    practiceFrameUsesVideo = !!reference.requestVideoFrameCallback;
    practiceFrame = practiceFrameUsesVideo ? reference.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  };
  schedule();
}
$('practice-rate').addEventListener('change', () => { if (!active) applyPracticeSettings(); });
$('practice-mirror').addEventListener('change', () => { $('practice-canvas').hidden = !$('practice-mirror').checked; if (!active) drawPractice(); });
reference.addEventListener('seeked', () => { if (!active) drawPractice(); });
reference.addEventListener('seeking', () => {
  if (!active && looping && !practiceSeek) { stopPractice(); status('已手動跳轉並停止 A–B；重新開始會從 A 校正。'); }
});
$('set-a').addEventListener('click', () => { if (!active && !selfDurationMs) $('start').value = reference.currentTime.toFixed(3); else status('錄後來源片段固定，請先重新選片再改 A。'); });
$('set-b').addEventListener('click', () => { if (!active && !selfDurationMs) $('end').value = reference.currentTime.toFixed(3); else status('錄後來源片段固定，請先重新選片再改 B。'); });
$('loop').addEventListener('click', async () => {
  if (active) return;
  if (looping) { stopPractice(); return; }
  clearPracticeWatch(); practiceController?.abort();
  const controller = new AbortController(); practiceController = controller;
  looping = true; $('loop').textContent = '停止 A–B 循環';
  try { await playLoopFromA(controller); if (controller === practiceController) status('A–B 循環練習中。'); }
  catch (caught) {
    if (controller !== practiceController) return;
    const error = caught instanceof Error ? caught : new Error(String(caught)); stopPractice(); if (error.name !== 'AbortError') status(error.message);
  }
});
for (const video of [reference, self, output]) video.addEventListener('error', () => {
  if (active) return;
  stop(); status('播放中斷，這個影片內容或格式無法繼續解碼。筆記與原片保留，可重新選片。');
});
reference.addEventListener('play', async () => {
  if (active) return;
  try {
    applyPracticeSettings();
    // 接過 Web Audio 的 video 不會自動回到原生出聲路徑；一般播放與循環都需恢復同一 context。
    if (audio) await prepareAudio();
    if (!active && !reference.paused) watchPractice();
  } catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught)); reference.pause(); status(error.message); }
});
reference.addEventListener('pause', () => {
  if (!active && reference.paused && !practiceStarting) {
    if (reference.ended && looping) clearPracticeWatch(); else stopPractice();
  }
  // 練習暫停也要釋放音訊運算；合成中的暫停由 operation 統一清理。
  if (!active && reference.paused && audio?.state === 'running') audio.suspend().catch(() => {});
});
reference.addEventListener('ended', async () => {
  const owner = practiceController;
  if (looping && !active && owner) {
    try { await playLoopFromA(owner); }
    catch { if (owner === practiceController) stopPractice(); }
  }
});
for (const id of /** @type {const} */ (['offset', 'reference-mirror', 'self-mirror'])) $(id).addEventListener('change', () => { if (!active && activeTakeId) operation(saveCurrentRecipe); });
ready = (async () => {
  state = await readLibrary(); validateBackup(state.data);
  // 不自動改寫其他分頁可能仍在錄製的 take；恢復操作會先取得該 take 的互斥鎖。
  renderLibrary(); $('storage-status').textContent = `此瀏覽器有 ${state.data.videos.length} 份影片筆記。`;
  applyPracticeSettings(); updateControls();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { $('storage-status').textContent += ' 離線資源未備妥，請保持本機伺服器開啟。'; });
})().catch(error => { $('storage-status').textContent = `本機儲存無法開啟：${error.message} 沒有重置或刪除舊資料。`; throw error; });
ready.catch(() => {}); report();
