/* 檔案用途：串起 M0 選片、相機、校正與單一 VS 成檔。所在層：獨立 Web 原型。主要關聯：timeline.js、recorder.js、MEDIA_PROBE.md。 */
import { comparison, positions, contain, validateMarkerRange, captureDuration } from './timeline.js';
import { event, normalizedVideo, mediaAction, seek, load, record, extension, cameraError } from './recorder.js';
import { validateBackup, parseBackup, planBackupImport, mediaInventory, videoLabels, planDeletion, moveStatuses, searchLibrary, practiceHistory } from './library.js';
import { startOffline } from './offline.js';
import { readLibrary, writeLibrary, readMedia, readMediaKeys, saveChunk, recoverChunks, clearChunks, withTakeLock } from './storage.js';

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
// File 只保留在本次頁面；不為了重開配方而暗中複製使用者的原片。
const sessionMedia = new Map();
let importDraft, relinkDraft, deleteDraft, inventoryToken = 0, outputAssetId;
let existingMode = false, outputRecipe, comparisonSave = Promise.resolve(), comparisonSaveVersion = 0;
/** @type {import('./types').Diagnostics} */
const diagnostics = { stage: 'idle', camera: null, capture: null, export: null };
/** @type {import('./types').LibraryState} */
let state;
let ready, currentVideoId, currentReferenceFile, pendingLinkId, pendingTakeId, activeTakeId, markerEditingId;
let markerVideoId;
let moveEditingId;
let metadataVideoId;
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
/** @param {Blob} blob @param {string} prefix @param {boolean} [output] */
function mediaFilename(blob, prefix, output = false) {
  const originalSuffix = blob instanceof File ? blob.name.match(/\.(mp4|mov|webm|mkv|m4v)$/i)?.[1]?.toLowerCase() : undefined;
  // 原片下載沿用真實容器；未知格式保留 bytes 為 bin，不冒充轉碼。
  const suffix = output ? extension(blob.type) : originalSuffix || (blob.type.includes('quicktime') ? 'mov' : blob.type.startsWith('video/mp4') ? 'mp4' : blob.type.startsWith('video/webm') ? 'webm' : blob.type.includes('matroska') ? 'mkv' : 'bin');
  return `${prefix}.${suffix}`;
}
/** @param {'reference-download' | 'take-download' | 'output-download'} id @param {Blob} blob @param {string} prefix */
function download(id, blob, prefix) {
  const link = $(id); link.href = urlFor(id, blob); link.download = mediaFilename(blob, prefix, id === 'output-download'); link.hidden = false;
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
  closeImportDialog(); closeMediaDialog(); closeDeleteDialog();
  reference.pause(); self.pause();
  releaseCamera();
  stopPractice();
}
function updateControls() {
  for (const id of /** @type {const} */ (['inventory-controls', 'import-controls', 'relink-controls', 'delete-controls'])) $(id).disabled = !!active;
  $('relink-confirm').disabled = !relinkDraft?.candidate || !!relinkDraft.candidate.blocked || !$('relink-checked').checked;
  $('camera').disabled = !referenceDurationMs || !currentVideoId;
  $('new-take').disabled = !referenceDurationMs || !currentVideoId || !!active;
  $('capture').disabled = !camera;
  $('compare').disabled = !referenceDurationMs || !selfDurationMs || !!pendingTakeId || !activeTakeId || !!active;
  $('existing-mode').disabled = !!active;
  $('existing-mode').setAttribute('aria-pressed', String(existingMode));
  for (const id of /** @type {const} */ (['reference-start', 'reference-end'])) $(id).disabled = !referenceDurationMs || !existingMode || !!active;
  $('self-start').disabled = !selfDurationMs || !existingMode || !!pendingTakeId || !!active;
  $('copy-self').disabled = !activeTakeId || !takeBlob || !!active;
  // 錄製後固定來源區間與速度，避免調校時悄悄改變自拍的時間意義。
  for (const id of /** @type {const} */ (['start', 'end', 'rate'])) $(id).disabled = !!selfDurationMs && !existingMode;
  $('practice').disabled = !currentVideoId || !!active;
  for (const el of $('library-panel').querySelectorAll('button, input, select')) (/** @type {HTMLButtonElement | HTMLInputElement | HTMLSelectElement} */ (el)).disabled = !!active;
}
async function operation(task) {
  if (active) return;
  const controller = new AbortController();
  active = controller;
  for (const id of /** @type {const} */ (['inventory-controls', 'import-controls', 'relink-controls', 'delete-controls'])) $(id).disabled = true;
  $('existing-mode').disabled = true;
  for (const id of /** @type {const} */ (['reference-start', 'reference-end', 'self-start'])) $(id).disabled = true;
  stopPractice();
  $('controls').disabled = true; $('compare').disabled = true;
  reference.controls = false; self.controls = false;
  $('practice').disabled = true;
  for (const el of $('library-panel').querySelectorAll('button, input, select')) (/** @type {HTMLButtonElement | HTMLInputElement | HTMLSelectElement} */ (el)).disabled = true;
  try { await ready; await comparisonSave; await task(controller.signal); }
  catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught));
    releaseCamera();
    status(error.name === 'AbortError' ? '已停止，原片與上次成功的輸出仍保留。' : `${error.message} 原片仍保留，可重試。`);
    diagnostics.lastError = error.name === 'AbortError' ? 'cancelled' : error.message;
  } finally {
    reference.pause(); self.pause();
    if (monitor) monitor.gain.value = 1;
    if (audio?.state === 'running') await audio.suspend().catch(() => {});
    active = null; $('controls').disabled = false; $('pause-comparison').hidden = true;
    // 比較結束先收起暫停控制，再恢復練習速度，避免下一次播放沿用合成設定。
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
/** @param {Partial<import('./types').Comparison>} [overrides] */
function recipe(overrides = {}) {
  const value = { startMs: Math.round(Number($('start').value) * 1000), endMs: Math.round(Number($('end').value) * 1000), rate: Number($('rate').value), offsetMs: Math.round(Number($('offset').value) * 1000), selfDurationMs,
    referenceMirror: $('reference-mirror').checked, selfMirror: $('self-mirror').checked, ...overrides };
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
async function timeline(value, signal, exporting, captureFrame = () => {}) {
  const { durationMs } = comparison(value);
  const first = positions(value, 0);
  reference.playbackRate = value.rate; self.playbackRate = 1; self.muted = true;
  await Promise.all([reference.play(), self.play()]);
  abortIfNeeded(signal);
  const began = performance.now();
  let maxDriftMs = 0, maxRenderGapMs = 0, lastFrameAt = began, lastCaptureAt = began - 1000 / 30, lastProgress = began, lastElapsed = 0;
  await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
    let frame, finished = false;
    const videoFrames = new Map();
    const finish = error => {
      if (finished) return;
      finished = true; cancelAnimationFrame(frame); signal.removeEventListener('abort', aborted);
      for (const [video, id] of videoFrames) video.cancelVideoFrameCallback(id);
      videoFrames.clear(); error ? reject(error) : resolve();
    };
    const paint = now => {
      if (now - lastCaptureAt >= 1000 / 30 - 1) {
        draw(value); captureFrame();
        lastCaptureAt = now - ((now - lastCaptureAt) % (1000 / 30));
      }
    };
    const watchVideo = video => {
      if (!video.requestVideoFrameCallback || finished) return;
      const id = video.requestVideoFrameCallback(() => {
        if (finished || signal.aborted) return;
        try { paint(performance.now()); watchVideo(video); } catch (error) { finish(error); }
      });
      videoFrames.set(video, id);
    };
    // 影片元素捲出可見區時仍須消費實際影格更新；只看 currentTime 不代表像素已換新。
    // rAF 保持共同時鐘與輸出節奏，影格通知則讓兩側解碼內容持續進入合成。
    watchVideo(reference); watchVideo(self);
    const aborted = () => finish(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    const tick = () => {
      if (signal.aborted) return aborted();
      const elapsedMs = (reference.currentTime * 1000 - first.referenceMs) / value.rate;
      if (elapsedMs >= durationMs - 20 || (reference.ended && elapsedMs >= durationMs - 100)) return finish();
      if (reference.ended || self.ended || reference.paused || self.paused) return finish(new Error('播放提前中斷，未完成合成。'));
      const now = performance.now();
      maxRenderGapMs = Math.max(maxRenderGapMs, now - lastFrameAt); lastFrameAt = now;
      if (elapsedMs > lastElapsed + 1) { lastProgress = now; lastElapsed = elapsedMs; }
      if (now - lastProgress > 1000 || now - began > durationMs + 10_000) return finish(new Error('播放停滯，請降低負載後重試。'));
      const driftMs = self.currentTime * 1000 - (first.selfMs + elapsedMs);
      maxDriftMs = Math.max(maxDriftMs, Math.abs(driftMs));
      // 小偏差用速率輕調，不逐幀 seek；大偏差停止輸出，避免把壞同步標成成功。
      self.playbackRate = Math.max(0.95, Math.min(1.05, 1 - driftMs / 2000));
      if (exporting && Math.abs(driftMs) > 250 && now - began > 500) return finish(new Error('兩側偏移超過 250ms，請重新校正／降低負載。'));
      try { paint(now); } catch (error) { return finish(error); }
      $('progress').value = Math.max(0, elapsedMs / durationMs);
      $('scrub').value = String(Math.max(0, elapsedMs / 1000));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }));
  reference.pause(); self.pause(); self.playbackRate = 1;
  $('progress').value = 1;
  return { elapsedMs: Math.round(performance.now() - began), observedMaxDriftMs: Math.round(maxDriftMs), maxRenderGapMs: Math.round(maxRenderGapMs) };
}
/** @param {Blob} file @param {HTMLVideoElement} video @param {string} key @param {AbortSignal} [signal] @param {(selection: {file: Blob, duration: number}) => Promise<void>} [beforeCommit] */
async function loadCandidate(file, video, key, signal, beforeCommit = async _selection => {}) {
  const previous = urls.get(key), previousTime = video.currentTime, previousRate = video.playbackRate;
  let nextUrl;
  try {
    if (!file.size) throw new Error('這是空檔案，請重新選取。');
    nextUrl = URL.createObjectURL(file);
    const duration = await load(video, nextUrl, signal);
    signal?.throwIfAborted();
    // metadata 寫入失敗時也要還原舊影片；不能先換掉畫面再發現配方無法保存。
    await beforeCommit({ file, duration });
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
async function chooseFile(input, video, key, signal, beforeCommit = async _selection => {}) {
  try {
    const selected = input.files?.[0]; if (!selected) return null;
    const file = await normalizedVideo(selected);
    return { file, duration: await loadCandidate(file, video, key, signal, beforeCommit) };
  } finally { input.value = ''; }
}
$('existing-mode').addEventListener('click', () => {
  if (active) return;
  releaseCamera(); stopPractice(); existingMode = true;
  if (!activeTakeId) $('rate').value = '1';
  updateControls();
  status('先選左邊老師示範，再選右邊我的已錄影片；各自播放找到同一個動作，設為起點。全程不開相機。');
  (referenceDurationMs ? $('self-file') : $('reference-file')).focus();
});
$('reference-file').addEventListener('change', () => operation(async signal => {
  if (keepMarkerDraft()) { $('reference-file').value = ''; return; }
  if (takeBlob && !pendingLinkId && !confirm('更換示範前，請先下載自拍與 VS。確定改選？')) { $('reference-file').value = ''; return; }
  releaseCamera();
  const videoId = crypto.randomUUID(), assetId = crypto.randomUUID();
  const selected = await chooseFile($('reference-file'), reference, 'reference', signal, async candidate => {
    if (pendingLinkId) return;
    await saveData(data => {
      data.videos.push({ id: videoId, title: `練舞影片 ${data.videos.length + 1}`, durationMs: candidate.duration, revision: 1 });
      data.assets.push({ id: assetId, videoId, kind: 'reference', byteLength: candidate.file.size, mimeType: candidate.file.type, durationMs: candidate.duration, mediaIncluded: false, state: 'session-only', storageKind: 'session' });
    });
  });
  if (!selected) return;
  clearMarkerEditor(); referenceDurationMs = selected.duration; currentReferenceFile = selected.file;
  download('reference-download', selected.file, 'dance-reference'); updateAudioStatus();
  if (pendingLinkId) {
    currentVideoId = null; $('confirm-link').hidden = false;
    status('請播放並核對標記位置，再點「確認連結到這份筆記」。'); return;
  }
  $('start').value = '0'; $('end').value = String(Math.min(15, selected.duration / 1000));
  $('offset').value = '0'; $('rate').value = '1';
  selfDurationMs = 0; takeBlob = null; activeTakeId = null; pendingTakeId = null; $('confirm-take').hidden = true;
  if (outputBlob) $('output-status').textContent = '這是上一組比較的 VS；原檔仍保留，新片請重新對齊及匯出。';
  self.pause(); self.removeAttribute('src'); self.load();
  const previous = urls.get('self'); if (previous) URL.revokeObjectURL(previous); urls.delete('self');
  currentVideoId = videoId; sessionMedia.set(assetId, selected.file);
  $('video-title').value = requireCurrentVideo().title; renderLibrary();
  status(`老師示範已載入：${reference.videoWidth}×${reference.videoHeight}，${(selected.duration / 1000).toFixed(1)} 秒。可選我的已錄影片比較，也可錄下自己。`);
}));
$('self-file').addEventListener('change', () => operation(async signal => {
  if (!referenceDurationMs || !currentVideoId) throw new Error('請先載入並連結示範影片。');
  if (takeBlob && !pendingTakeId && !confirm('請先下載上一段自拍。確定載入另一段？')) { $('self-file').value = ''; return; }
  releaseCamera();
  let savedTake;
  const selected = await chooseFile($('self-file'), self, 'self', signal, async candidate => {
    if (pendingTakeId) return;
    const value = recipe({ rate: 1, offsetMs: 0, selfDurationMs: candidate.duration });
    comparison(value);
    const assetId = crypto.randomUUID();
    // 外部影片直接建立 ready 配對；不經相機 recording／chunks，也不自動寫入 Blob。
    await saveData(data => {
      data.assets.push({ id: assetId, kind: 'take', byteLength: candidate.file.size, mimeType: candidate.file.type, durationMs: candidate.duration, mediaIncluded: false, state: 'session-only', storageKind: 'session' });
      savedTake = addComparison(data, value, assetId);
    });
  });
  if (!selected) return;
  selfDurationMs = selected.duration; takeBlob = selected.file; self.muted = true;
  existingMode = true; download('take-download', takeBlob, 'dance-self');
  if (pendingTakeId) { $('confirm-take').hidden = false; status('請播放預覽自拍原片，再確認連結到待恢復的 take。'); return; }
  activeTakeId = savedTake.id; $('rate').value = '1'; $('offset').value = '0';
  sessionMedia.set(savedTake.cameraAssetId, selected.file);
  status('兩片已載入，原片只在本次開啟。各自選起點，或直接共同預覽；需要重開自動取回時再保存副本。'); updateIntersection(); draw(recipe());
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
  existingMode = false;
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
    $('scrub').max = String(range.durationMs / 1000); $('scrub').value = String(Math.min(Number($('scrub').value), range.durationMs / 1000));
    $('intersection').textContent = `共同長度 ${(range.durationMs / 1000).toFixed(2)} 秒；老師 ${((value.startMs + value.rate * range.lowerMs) / 1000).toFixed(3)} 秒／我 ${((range.lowerMs + value.offsetMs) / 1000).toFixed(3)} 秒起跳，示範 ${value.rate}×。${range.durationMs < (value.endMs - value.startMs) / value.rate ? '片尾不足，只輸出兩片都有畫面的區間。' : ''}`;
    $('play').disabled = false; $('export').disabled = false;
    if (outputBlob) $('output-status').textContent = outputRecipe === recipeSignature(value) ? '這支 VS 對應目前的比較設定。' : '這是先前設定的 VS，原檔仍保留；若要目前設定的畫面，請重新匯出。';
  } catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught)); $('intersection').textContent = error.message; $('play').disabled = true; $('export').disabled = true; }
}
for (const id of /** @type {const} */ (['start', 'end', 'rate', 'offset', 'reference-mirror', 'self-mirror', 'preview-mirror'])) $(id).addEventListener('change', () => { mirrors(); if (selfDurationMs) updateIntersection(); });
$('scrub').addEventListener('change', () => operation(async signal => { await align(recipe(), Number($('scrub').value) * 1000, signal); status('已定位兩側畫面。'); }));
$('play').addEventListener('click', () => operation(async signal => {
  const value = recipe(), durationMs = comparison(value).durationMs;
  const startMs = Number($('scrub').value) * 1000;
  await saveCurrentRecipe(); await prepareAudio(); await align(value, startMs >= durationMs - 20 ? 0 : startMs, signal);
  $('pause-comparison').hidden = false;
  status('共同預覽中；可一起暫停後拖動時間線，再繼續預覽。鏡像請看下方合成畫面。');
  diagnostics.preview = await timeline(value, signal, false); status('預覽結束，可調整偏移或輸出。');
}));
$('export').addEventListener('click', () => operation(async signal => {
  const value = recipe(); let stream, recording, blob;
  await saveCurrentRecipe();
  await prepareAudio(); await align(value, 0, signal); abortIfNeeded(signal);
  try {
    // ponytail: 前景即時合成免轉碼套件；通過 M0 實測後才評估更快的編碼路徑。
    monitor.gain.value = 0;
    // 明確在畫面畫好後請求擷取，避免慢速素材與自動擷取計時器互相錯開而留住舊畫面。
    stream = canvas.captureStream(0);
    let canvasTrack = /** @type {CanvasCaptureMediaStreamTrack} */ (stream.getVideoTracks()[0]);
    if (typeof canvasTrack.requestFrame !== 'function') {
      stream.getTracks().forEach(track => { track.stop(); });
      stream = canvas.captureStream(30); canvasTrack = /** @type {CanvasCaptureMediaStreamTrack} */ (stream.getVideoTracks()[0]);
    }
    audioDestination.stream.getAudioTracks().forEach(track => { stream.addTrack(track.clone()); });
    recording = record(stream);
    recording.done.catch(error => { if (active?.signal === signal && !signal.aborted) active.abort(error); });
    status('合成中，請保持此頁在前景。取消後仍可重試。');
    const measured = await timeline(value, signal, true, () => canvasTrack.requestFrame?.());
    blob = await recording.stop();
    diagnostics.export = { ...measured, mime: blob.type, bytes: blob.size, requestedWidth: 1280, requestedHeight: 720, recipe: value };
    const temporary = URL.createObjectURL(blob), validationVideo = document.createElement('video');
    validationVideo.muted = true; validationVideo.playsInline = true;
    // 用獨立元素驗證新檔，取消或壞檔不能破壞上一個成功輸出的播放器。
    try { diagnostics.export.decodedDurationMs = await load(validationVideo, temporary, signal); }
    finally { validationVideo.removeAttribute('src'); validationVideo.load(); URL.revokeObjectURL(temporary); }
    abortIfNeeded(signal);
    outputBlob = blob; outputAssetId = null; outputRecipe = recipeSignature(value); download('output-download', blob, 'dance-vs');
    $('output-status').textContent = '這支 VS 對應目前的比較設定。';
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
$('pause-comparison').addEventListener('click', () => { stop(); status('兩片已一起暫停；可拖動共同時間線再預覽。'); });
$('stop').addEventListener('click', () => { stop(); status('已要求停止，正在保留已錄到的資料。'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('orientationchange', stop);
document.addEventListener('freeze', () => { stop(); audio?.suspend().catch(() => {}); });
window.addEventListener('pagehide', e => {
  stop();
  // BFCache 仍保留同一個 video／音訊來源，不能關掉 context 後再替它建立第二個來源節點。
  if (e.persisted) { audio?.suspend().catch(() => {}); return; }
  audio?.close().catch(() => {});
  urls.forEach(url => { URL.revokeObjectURL(url); }); urls.clear(); sessionMedia.clear();
});
window.addEventListener('pageshow', e => { if (e.persisted) status('已返回頁面。錄影保持停止，請確認片段後重新開啟相機。'); });
window.addEventListener('beforeunload', e => { if (active || !$('marker-form').hidden || $('import-dialog').open || $('media-dialog').open || $('delete-dialog').open) { e.preventDefault(); e.returnValue = ''; } });

function currentVideo() { return state.data.videos.find(v => v.id === currentVideoId); }
function requireCurrentVideo() { const video = currentVideo(); if (!video) throw new Error('影片筆記已失聯，請重新開啟。'); return video; }
async function saveData(change, mediaChange, signal) {
  const next = structuredClone(state.data); change(next); validateBackup(next);
  state = await writeLibrary(next, state.revision, mediaChange, signal);
  $('storage-status').textContent = '已保存在此瀏覽器。JSON 備份及影片請另行下載。';
  renderLibrary();
}

function linkedMime(previous, file) {
  // 相同容器保留備份已有的 codec 描述；File.type 沒有 codec 不能當成已驗證它變了。
  return previous.split(';')[0] === file.type.split(';')[0] ? previous : file.type;
}
function closeImportDialog(abort = true) {
  if (!importDraft && !$('import-dialog').open) return;
  if (abort) active?.abort(); importDraft = null; $('import-dialog').close();
  if (abort) status('已取消匯入，原資料保留。');
}
function closeMediaDialog(abort = true) {
  if (!relinkDraft && !$('media-dialog').open) return;
  if (abort) active?.abort(); relinkDraft = null;
  const video = $('relink-preview'); video.pause(); video.removeAttribute('src'); video.load();
  const url = urls.get('relink-preview'); if (url) URL.revokeObjectURL(url); urls.delete('relink-preview');
  $('relink-file').value = ''; $('media-dialog').close();
  if (abort) status('已取消重連，原資料與比較畫面保留。');
}
function sessionFile(id) {
  if (sessionMedia.has(id)) return sessionMedia.get(id);
  if (currentVideoId && currentReferenceFile && state.data.assets.some(a => a.id === id && a.kind === 'reference' && a.videoId === currentVideoId)) return currentReferenceFile;
  if (!pendingTakeId && takeBlob && state.data.takes.some(t => t.id === activeTakeId && t.cameraAssetId === id)) return takeBlob;
}
async function getAvailableMedia(id) { return sessionFile(id) || await readMedia(id); }
async function refreshMediaInventory() {
  if (!state) return;
  const token = ++inventoryToken, data = state.data;
  const keys = await readMediaKeys();
  if (token !== inventoryToken || data !== state.data) return;
  const stored = new Set(keys.filter(key => typeof key === 'string')), session = new Set(data.assets.filter(a => sessionFile(a.id)).map(a => a.id));
  const rows = mediaInventory(data, stored, session), labels = { reference: '示範', take: '自己原片', vs: 'VS' };
  $('media-summary').textContent = 'JSON 不含影片。共 ' + rows.length + ' 份描述：本機副本 ' + rows.filter(r => r.availability === 'stored').length + '、本次連結 ' + rows.filter(r => r.availability === 'session').length + '、缺片 ' + rows.filter(r => r.availability === 'missing').length + '。本機副本仍須另行備份，瀏覽器可能清除資料。';
  $('media-items').replaceChildren();
  for (const row of rows) {
    const li = document.createElement('li'); li.dataset.assetId = row.asset.id; li.dataset.availability = row.availability;
    const statusText = row.availability === 'stored' ? '已存瀏覽器副本' : row.availability === 'session' ? '本次已連結，未存瀏覽器副本' : '缺片，需要另選原檔';
    li.append(document.createTextNode(labels[row.asset.kind] + ' · ' + row.owner + ' · ' + statusText + (row.interrupted ? '（錄影／中斷片段，需檢查完整性）' : '') + '。描述大小 ' + (row.asset.byteLength / 1048576).toFixed(2) + ' MiB。 '));
    if (row.availability === 'missing') li.append(button('選片並預覽重連', () => openMediaRelink(row.asset.id, row.owner)));
    else {
      li.append(button('另存影片檔', async () => {
        const original = await getAvailableMedia(row.asset.id); if (!original) throw new Error('原片已不在，請重新檢查清單並選片。');
        // 保留救援下載；無法識別容器時仍可帶走原始 bytes，不改成假的 MP4。
        const blob = await normalizedVideo(original).catch(() => original), link = document.createElement('a');
        link.href = urlFor('inventory:' + row.asset.id, blob); link.download = mediaFilename(blob, 'dance-' + row.asset.kind); link.click();
        status('已交給瀏覽器另存影片；請確認下載完成，JSON 本身不含影片。');
      }));
      if (row.availability === 'session') li.append(button('保存瀏覽器副本', async signal => {
        const blob = await getAvailableMedia(row.asset.id); if (!blob) throw new Error('原片已不在，請重新連結。');
        if (blob.size > 200 * 1024 * 1024) throw new Error('副本初期限 200 MiB；仍可另存影片檔。');
        await saveData(data => {
          const asset = data.assets.find(a => a.id === row.asset.id); if (!asset) throw new Error('媒體描述已失聯。');
          Object.assign(asset, { byteLength: blob.size, mimeType: linkedMime(asset.mimeType, blob), state: 'ready', storageKind: 'indexeddb' });
        }, { id: row.asset.id, blob }, signal);
        status('已保存副本，仍請另存影片與 JSON。');
      }));
      if (row.availability === 'stored') li.append(button('移除此瀏覽器副本…', () => showDelete('copy', row.asset.id)));
    }
    $('media-items').append(li);
  }
}
async function openMediaRelink(assetId, owner) {
  if (await getAvailableMedia(assetId)) { await refreshMediaInventory(); status('這支影片已可用，原比較畫面保留。'); return; }
  const asset = state.data.assets.find(a => a.id === assetId); if (!asset) throw new Error('媒體描述已失聯，原資料保留。');
  releaseCamera(); closeMediaDialog(false);
  relinkDraft = { assetId, revision: state.revision, candidate: null };
  $('media-title').textContent = ({ reference: '示範', take: '自己原片', vs: 'VS' })[asset.kind] + ' · ' + owner;
  $('relink-file-label').textContent = asset.kind === 'vs' ? '已合成的單一 VS（不取代比較原片）' : '未合成的' + (asset.kind === 'reference' ? '老師原片' : '自己原片') + '（請勿用 VS 代替）';
  $('relink-checked').checked = false; $('relink-save').checked = false; $('relink-file').value = '';
  $('relink-summary').textContent = '請選片並預覽。備份描述 ' + (asset.byteLength / 1048576).toFixed(2) + ' MiB' + (asset.durationMs ? '、' + (asset.durationMs / 1000).toFixed(3) + ' 秒' : '') + '；本期預設只在這次連結。';
  $('media-dialog').showModal(); $('relink-file').focus();
}
function button(text, action) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
  el.addEventListener('click', () => operation(action)); return el;
}
function closeDeleteDialog(abort = true) {
  if (!deleteDraft && !$('delete-dialog').open) return;
  if (abort) active?.abort(); deleteDraft = null; $('delete-dialog').close();
}
async function showDelete(kind, id) {
  if (keepMarkerDraft()) return;
  const plan = planDeletion(state.data, kind, id), keys = new Set(await readMediaKeys());
  deleteDraft = { plan, revision: state.revision };
  const names = { copy: '只移除此瀏覽器副本', take: '刪除此練習影片與比較', export: '刪除此 VS 輸出', video: '刪除整份影片筆記', move: '移除動作並解除標記關聯' };
  // 按 ID 各查一次，避免大型備份的三層關聯搜尋卡住刪除預覽。
  const artifact = kind === 'export' ? state.data.exports.find(e => e.id === id) : undefined;
  const relatedRecipe = artifact && state.data.recipes.find(r => r.id === artifact.recipeId);
  const targetTake = state.data.takes.find(t => t.id === (kind === 'take' ? id : relatedRecipe?.takeId));
  const videoId = kind === 'video' ? id : targetTake?.referenceVideoId || state.data.assets.find(a => a.id === id)?.videoId;
  const owner = state.data.videos.find(v => v.id === videoId)?.title;
  $('delete-title').textContent = names[kind] + (owner ? ` · ${owner}` : '');
  const c = plan.counts;
  $('delete-summary').textContent = `將移除：影片筆記 ${c.videos}、標記 ${c.markers}、練習影片 ${c.takes}、配方 ${c.recipes}、VS 輸出 ${c.exports}；本機影片副本 ${plan.mediaIds.filter(id => keys.has(id)).length} 份。${kind === 'copy' ? '保留筆記、配方與媒體描述；本次已開啟的影片可繼續使用，下次需要重連。' : '共用原片仍有其他練習使用時保留；移除的練習同時清理其殘留錄影片段。'}`;
  if (kind === 'move') $('delete-summary').textContent = `將移除動作「${state.data.moves.find(m => m.id === id)?.name}」，並解除 ${state.data.markers.filter(m => m.moveId === id).length} 個標記關聯。全部標記、筆記、練習、比較與影片保留。`;
  releaseCamera(); $('delete-dialog').showModal(); $('delete-cancel').focus();
}
function clearDeletedPlayer(id, keys) {
  const video = $(id); video.pause(); video.removeAttribute('src'); video.load();
  for (const key of keys) { const url = urls.get(key); if (url) URL.revokeObjectURL(url); urls.delete(key); }
}
$('delete-video').addEventListener('click', () => operation(() => showDelete('video', $('library').value)));
$('delete-cancel').addEventListener('click', () => { closeDeleteDialog(); status('已取消移除，原資料保留。'); });
$('delete-dialog').addEventListener('cancel', () => { closeDeleteDialog(); status('已取消移除，原資料保留。'); });
$('delete-confirm').addEventListener('click', () => operation(async signal => {
  const draft = deleteDraft; if (!draft) return;
  if (draft.revision !== state.revision) throw new Error('預覽後資料已改變，請取消並重新檢查。');
  const { plan } = draft, retained = plan.kind === 'copy' ? await getAvailableMedia(plan.id) : null;
  const remove = async index => {
    // 先取得所有受影響 take 的鎖，避免別頁仍錄製／恢復時刪掉來源或分段。
    if (index < plan.locks.length) return withTakeLock(plan.locks[index], () => remove(index + 1));
    state = await writeLibrary(plan.data, draft.revision, plan.kind === 'copy' ? { id: plan.id } : undefined, signal, plan.kind === 'copy' ? undefined : plan);
  };
  await remove(0);
  if (retained) sessionMedia.set(plan.id, retained);
  for (const id of plan.mediaIds) if (plan.kind !== 'copy') {
    sessionMedia.delete(id);
    const key = `inventory:${id}`, url = urls.get(key); if (url) URL.revokeObjectURL(url); urls.delete(key);
  }
  if (currentVideoId && !state.data.videos.some(v => v.id === currentVideoId)) {
    clearDeletedPlayer('reference', ['reference', 'reference-download']); $('reference-download').hidden = true;
    currentVideoId = null; pendingLinkId = null; referenceDurationMs = 0; currentReferenceFile = null; $('confirm-link').hidden = true;
    clearMarkerEditor(); $('video-title').value = '';
  }
  if ((activeTakeId && !state.data.takes.some(t => t.id === activeTakeId)) || (pendingTakeId && !state.data.takes.some(t => t.id === pendingTakeId))) {
    clearDeletedPlayer('self', ['self', 'take-download']); $('take-download').hidden = true;
    activeTakeId = null; pendingTakeId = null; takeBlob = null; selfDurationMs = 0; $('confirm-take').hidden = true;
  }
  if (outputAssetId && !state.data.assets.some(a => a.id === outputAssetId)) {
    clearDeletedPlayer('output', ['output-download']); $('output-download').hidden = true; output.hidden = true;
    outputAssetId = null; outputBlob = null; outputRecipe = undefined; $('share').disabled = true; $('output-status').textContent = '此 VS 已移除，仍可用保留的原片重新合成。';
  }
  closeDeleteDialog(false); renderLibrary();
  status('指定的本站資料已移除；原始檔、原相簿與其他筆記保留。');
}));
function renderLibrary() {
  refreshMediaInventory().catch(() => { $('media-summary').textContent = '暫時無法檢查媒體，原資料保留；仍可下載 JSON。'; });
  const selected = $('library').value;
  $('library').replaceChildren(new Option('選擇影片筆記', ''));
  const names = videoLabels(state.data.videos);
  for (const video of state.data.videos) $('library').add(new Option(names.get(video.id), video.id));
  $('library').value = currentVideoId || pendingLinkId || selected;
  if (metadataVideoId !== currentVideoId) {
    metadataVideoId = currentVideoId;
    const video = currentVideo();
    $('video-teacher').value = video?.teacher || ''; $('video-style').value = video?.danceStyle || ''; $('video-date').value = video?.recordedDate || '';
  }
  const moveSelection = $('marker-move').value;
  $('marker-move').replaceChildren(new Option('不連結動作', ''));
  for (const move of state.data.moves) $('marker-move').add(new Option(`${move.name} · ${move.danceStyle} · ${moveStatuses[move.status]}`, move.id));
  $('marker-move').value = moveSelection;
  renderSearch();
  $('markers').replaceChildren(); $('takes').replaceChildren();
  for (const marker of state.data.markers.filter(m => m.videoId === currentVideoId).sort((a, b) => a.startMs - b.startMs)) {
    const li = document.createElement('li'), text = document.createElement('p');
    const move = state.data.moves.find(m => m.id === marker.moveId);
    text.textContent = `${(marker.startMs / 1000).toFixed(3)}s${marker.endMs === undefined ? '' : `–${(marker.endMs / 1000).toFixed(3)}s`} · ${marker.title}${move ? ` · ${move.name}（${moveStatuses[move.status]}）` : ''}\n${marker.note}`;
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
    const asset = state.data.assets.find(a => a.id === take.cameraAssetId);
    const mediaState = sessionMedia.has(take.cameraAssetId) && asset?.state !== 'ready' ? 'session-only' : asset?.state;
    const label = take.state === 'failed' ? '未錄成；可重新錄製' : take.state === 'interrupted' ? mediaState === 'ready' ? '中斷片段已保存' : '中斷待恢復' : mediaState === 'missing' ? '原片待重連' : take.state === 'ready' ? mediaState === 'session-only' ? '當次開啟，原片請另存' : '已保存' : '可能錄製中／待恢復';
    li.append(document.createTextNode(`${take.rate}× · ${((take.referenceEndMs - take.referenceStartMs) / take.rate / 1000).toFixed(1)} 秒 · ${label} `));
    li.append(button('開啟自拍／恢復', signal => openTake(take, signal)), button('刪除此練習與比較…', () => showDelete('take', take.id)));
    for (const artifact of state.data.exports.filter(e => state.data.recipes.some(r => r.id === e.recipeId && r.takeId === take.id))) {
      const savedRecipe = state.data.recipes.find(r => r.id === artifact.recipeId);
      li.append(button(artifact.recipeRevision === savedRecipe?.revision ? '下載已存 VS' : '下載舊版 VS（設定已變更）', async () => {
        const blob = await getAvailableMedia(artifact.assetId); if (!blob) throw new Error('找不到這個 VS，請用另存的影片或原片重新合成。');
        outputBlob = blob; outputAssetId = artifact.assetId; outputRecipe = undefined; download('output-download', blob, 'dance-vs');
        $('output-status').textContent = '已取回當時保存的 VS；影片對應其原本的比較設定。';
        output.src = urls.get('output-download'); output.hidden = false; $('share').disabled = false;
        status('已取回保存的 VS，可用下方連結下載。');
      }));
      li.append(button('刪除此 VS 輸出…', () => showDelete('export', artifact.id)));
    }
    $('takes').append(li);
  }
}
function renderSearch() {
  const filters = { keyword: $('library-keyword').value, danceStyle: $('library-style').value, teacher: $('library-teacher').value, from: $('library-from').value, to: $('library-to').value, status: $('library-status').value };
  const result = searchLibrary(state.data, filters), names = videoLabels(state.data.videos);
  $('search-summary').textContent = filters.from && filters.to && filters.from > filters.to ? '起日比迄日晚，請修正日期範圍。' : `找到 ${result.videos.length} 堂課程、${result.moves.length} 個動作。缺片時仍可開啟筆記及重連。`;
  $('search-videos').replaceChildren(); $('move-results').replaceChildren();
  for (const video of result.videos) {
    const li = document.createElement('li');
    li.append(document.createTextNode([names.get(video.id), video.danceStyle, video.teacher, video.recordedDate].filter(Boolean).join(' · ') + ' '), button('開啟課程', signal => openVideoNotes(video.id, signal)));
    $('search-videos').append(li);
  }
  for (const { move, markers } of result.moves) {
    const li = document.createElement('li'), heading = document.createElement('h4'), clips = document.createElement('ul');
    heading.textContent = `${move.name} · ${move.danceStyle} · ${moveStatuses[move.status]}`;
    li.append(heading, button('編輯動作／狀態', async () => {
      moveEditingId = move.id; $('move-name').value = move.name; $('move-style').value = move.danceStyle; $('move-status').value = move.status; $('move-name').focus();
    }), button('移除動作…', () => showDelete('move', move.id)));
    for (const marker of markers) {
      const clip = document.createElement('li'), text = document.createElement('p');
      text.textContent = `${names.get(marker.videoId)} · ${(marker.startMs / 1000).toFixed(3)}s${marker.endMs === undefined ? '' : `–${(marker.endMs / 1000).toFixed(3)}s`} · ${marker.title}\n${marker.note}`;
      clip.append(text, button('開啟指定片段', async signal => {
        if (!await openVideoNotes(marker.videoId, signal)) return;
        if (!referenceDurationMs) { status('筆記仍在，示範尚未連結；請選片預覽確認後，再點指定片段。'); return; }
        if ((marker.endMs ?? marker.startMs) > referenceDurationMs) throw new Error('這個片段超出目前原片，請重連完整影片或編輯修復。');
        await seek(reference, marker.startMs / 1000, signal);
        $('start').value = String(marker.startMs / 1000);
        $('end').value = String((marker.endMs ?? Math.min(marker.startMs + 15000, referenceDurationMs)) / 1000);
        status('已開啟動作片段，可慢速循環練習。');
      }), button('編輯片段／關聯', async signal => { if (await openVideoNotes(marker.videoId, signal)) editMarker(marker); }));
      clips.append(clip);
    }
    li.append(clips);
    const history = document.createElement('ul'), label = document.createElement('p');
    const takes = practiceHistory(state.data, markers);
    label.textContent = `${markers.length} 個片段 · ${takes.length} 次涵蓋片段的練習（新到舊）`;
    li.append(label, history);
    for (const take of takes) {
      const item = document.createElement('li'), row = state.data.recipes.find(r => r.takeId === take.id);
      const takeState = { ready: '可開啟（原片依保存清單）', interrupted: '中斷待檢查', failed: '未完成', recording: '錄製中／待恢復' };
      item.append(document.createTextNode(`${new Date(take.createdAt).toLocaleString()} · ${names.get(take.referenceVideoId)} · ${take.referenceStartMs / 1000}–${take.referenceEndMs / 1000}s · ${take.rate}× · ${takeState[take.state]}${row ? ` · 配方第 ${row.revision} 版／偏移 ${row.offsetMs / 1000}s` : ' · 無比較配方'} `));
      if (row) item.append(button('開啟這次比較配方', async signal => {
        if (!await openVideoNotes(take.referenceVideoId, signal)) return;
        if (!referenceDurationMs) { status('練習歷史與配方仍在，示範尚未連結；請先重連原片再開啟這次比較。'); return; }
        await openTake(take, signal);
      }));
      history.append(item);
    }
    $('move-results').append(li);
  }
}
for (const id of /** @type {const} */ (['library-keyword', 'library-style', 'library-teacher', 'library-from', 'library-to', 'library-status'])) $(id).addEventListener('input', () => { if (state && !active) renderSearch(); });
$('library-reset').addEventListener('click', () => {
  for (const id of /** @type {const} */ (['library-keyword', 'library-style', 'library-teacher', 'library-from', 'library-to', 'library-status'])) $(id).value = '';
  renderSearch();
});
$('cancel-move').addEventListener('click', () => { moveEditingId = null; $('move-form').reset(); });
$('move-form').addEventListener('submit', e => {
  e.preventDefault(); operation(async () => {
    const name = $('move-name').value.trim(); if (!name) throw new Error('請填寫動作名稱。');
    await saveData(data => {
      const old = data.moves.find(m => m.id === moveEditingId);
      if (moveEditingId && !old) throw new Error('動作已移除，請保留草稿後重新新增。');
      const row = { id: old?.id || crypto.randomUUID(), name, danceStyle: $('move-style').value.trim(), status: /** @type {import('./types').Move['status']} */ ($('move-status').value), revision: (old?.revision || 0) + 1 };
      if (old) Object.assign(old, row); else data.moves.push(row);
    });
    moveEditingId = null; $('move-form').reset(); status('動作與你選擇的練習狀態已保存。');
  });
});
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
function addComparison(data, value, assetId) {
  const take = { id: crypto.randomUUID(), referenceVideoId: currentVideoId, cameraAssetId: assetId, referenceStartMs: value.startMs, referenceEndMs: value.endMs, rate: value.rate, state: /** @type {const} */ ('ready'), createdAt: new Date().toISOString() };
  data.takes.push(take);
  data.recipes.push({ id: crypto.randomUUID(), takeId: take.id, offsetMs: value.offsetMs, referenceMirror: value.referenceMirror, selfMirror: value.selfMirror, layout: 'side-by-side', audioSource: 'reference', revision: 1 });
  return take;
}
function recipeSignature(value) {
  // 相同時間設定仍可能是不同原片；不能把上一組的 VS 誤標成這一組的結果。
  return JSON.stringify({ referenceVideoId: currentVideoId, selfAssetId: state.data.takes.find(t => t.id === activeTakeId)?.cameraAssetId, ...value });
}
async function saveCurrentRecipe(value = recipe()) {
  if (!activeTakeId) return;
  const take = state.data.takes.find(t => t.id === activeTakeId);
  if (!take || take.referenceVideoId !== currentVideoId) throw new Error('比較配對已失聯，請重新開啟。');
  if (take.referenceStartMs !== value.startMs || take.referenceEndMs !== value.endMs || take.rate !== value.rate) {
    let savedTake;
    // take 沒有 revision；另建紀錄才能讓已輸出的影片仍保有原本的時間意義。
    await saveData(data => { savedTake = addComparison(data, value, take.cameraAssetId); });
    activeTakeId = savedTake.id; renderLibrary(); return;
  }
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
  outputAssetId = assetId;
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
  let blob = sessionMedia.get(take.cameraAssetId) || await readMedia(take.cameraAssetId);
  const recovered = !blob;
  if (!blob) {
    try { blob = await recoverChunks(take.cameraAssetId); }
    catch {
      existingMode = true;
      $('start').value = String(take.referenceStartMs / 1000); $('end').value = String(take.referenceEndMs / 1000); $('rate').value = String(take.rate);
      $('offset').value = String(row.offsetMs / 1000); $('reference-mirror').checked = row.referenceMirror; $('self-mirror').checked = row.selfMirror;
      selfDurationMs = 0; activeTakeId = null; takeBlob = null;
      self.removeAttribute('src'); self.load();
      pendingTakeId = take.id;
      status('自拍原片缺少或暫存片段不完整；原有筆記與錄影片段都保留。請用「我的已錄影片」載入另存原片，預覽後確認連結。'); return;
    }
  }
  const durationMs = await loadCandidate(blob, self, 'self', signal);
  // 原片讀回成功才一起切換配方與下載；壞檔或取消不得把另一段設定寫進舊 take。
  download('take-download', blob, 'dance-self'); existingMode = true;
  selfDurationMs = durationMs; takeBlob = blob; activeTakeId = take.id;
  pendingTakeId = null; $('confirm-take').hidden = true;
  $('start').value = String(take.referenceStartMs / 1000); $('end').value = String(take.referenceEndMs / 1000); $('rate').value = String(take.rate);
  $('offset').value = String(row.offsetMs / 1000); $('reference-mirror').checked = row.referenceMirror; $('self-mirror').checked = row.selfMirror;
  const interrupted = recovered || take.state !== 'ready';
  // 只有從 chunks 組回的原片需要落盤；外部 File 與已存中斷片段不能因狀態標籤被自動複製。
  if (recovered) await finalizeTake(take, blob, selfDurationMs, true);
  updateIntersection(); draw(recipe()); status(interrupted ? '已取回可播放的中斷片段，仍標示中斷；請檢查長度並下載原片。' : '自拍與校正配方已取回。原片可另外下載。');
}
$('confirm-take').addEventListener('click', () => operation(async signal => {
  const take = state.data.takes.find(t => t.id === pendingTakeId);
  if (!take || take.referenceVideoId !== currentVideoId || !takeBlob || !selfDurationMs) throw new Error('請先載入要重連的自拍原片。');
  await withTakeLock(take.id, async () => {
    // 人工確認只重新連結，不把外部原片當新錄影自動複製，也不改掉原配方。
    if (takeBlob.size !== state.data.assets.find(a => a.id === take.cameraAssetId)?.byteLength && !confirm('此檔與原片大小不同。請確認內容與時間對齊，仍要連結？')) return;
    const value = { ...recipe(), selfDurationMs }; comparison(value);
    // 人工選回的原片一律只連結；即使原紀錄是中斷，也要另按保存才可建立瀏覽器副本。
    sessionMedia.set(take.cameraAssetId, takeBlob); activeTakeId = take.id; pendingTakeId = null; $('confirm-take').hidden = true;
    await openTakeUnlocked(take, signal);
  });
}));
async function openVideoNotes(id, signal) {
  if (keepMarkerDraft()) return;
  const video = state.data.videos.find(v => v.id === id); if (!video) throw new Error('請先選一份影片筆記。');
  releaseCamera(); reference.pause(); currentVideoId = id; pendingLinkId = null; pendingTakeId = null; $('confirm-take').hidden = true; selfDurationMs = 0; activeTakeId = null; takeBlob = null;
  $('video-title').value = video.title; $('confirm-link').hidden = true; clearMarkerEditor();
  const asset = state.data.assets.find(a => a.videoId === id && a.kind === 'reference');
  const blob = asset && (sessionMedia.get(asset.id) || await readMedia(asset.id));
  referenceDurationMs = 0; currentReferenceFile = null;
  if (blob) {
    referenceDurationMs = await load(reference, urlFor('reference', blob), signal); currentReferenceFile = blob; download('reference-download', blob, 'dance-reference'); updateAudioStatus();
    status('已開啟此瀏覽器保存的示範及筆記。');
  } else {
    const previous = urls.get('reference'); if (previous) URL.revokeObjectURL(previous); urls.delete('reference');
    reference.removeAttribute('src'); reference.load(); pendingLinkId = id;
    status('筆記仍在，示範尚未連結。請選片、預覽後確認；不會依同名自動配對。');
  }
  $('start').value = '0'; $('end').value = String(Math.min(15, video.durationMs / 1000)); renderLibrary();
  return true;
}
$('open-library').addEventListener('click', () => operation(signal => openVideoNotes($('library').value, signal)));
$('confirm-link').addEventListener('click', () => operation(async () => {
  if (!pendingLinkId || !referenceDurationMs) throw new Error('請先選取要預覽的示範影片。');
  const linkedId = pendingLinkId;
  if (!state.data.assets.some(a => a.videoId === linkedId && a.kind === 'reference')) await saveData(data => data.assets.push({ id: crypto.randomUUID(), videoId: linkedId, kind: 'reference', byteLength: currentReferenceFile.size, mimeType: currentReferenceFile.type, durationMs: referenceDurationMs, mediaIncluded: false }));
  currentVideoId = pendingLinkId; pendingLinkId = null; $('confirm-link').hidden = true;
  const linkedAsset = state.data.assets.find(a => a.videoId === currentVideoId && a.kind === 'reference');
  if (!linkedAsset) throw new Error('找不到示範媒體記錄，請重新開啟筆記。');
  sessionMedia.set(linkedAsset.id, currentReferenceFile);
  $('video-title').value = requireCurrentVideo().title; renderLibrary();
  status(referenceDurationMs < requireCurrentVideo().durationMs ? '影片已連結；此檔較短，超界標記保留並需要修復。' : '影片已連結，筆記與配方保持原有時間。');
}));
$('copy-reference').addEventListener('click', () => operation(async signal => {
  if (!currentReferenceFile) throw new Error('請先連結示範影片。');
  if (currentReferenceFile.size > 200 * 1024 * 1024) throw new Error('副本初期限制 200 MiB；仍可選片練習並保存筆記。');
  const asset = state.data.assets.find(a => a.videoId === currentVideoId && a.kind === 'reference');
  if (!asset) throw new Error('示範媒體記錄不存在，請重新連結。');
  status('正在保存示範副本，失敗時筆記仍會保留。');
  // 停止也要取消副本交易，不能只停播放器後仍在背景寫入。
  await saveData(data => { const savedAsset = data.assets.find(a => a.id === asset.id); if (savedAsset) Object.assign(savedAsset, { state: 'ready', storageKind: 'indexeddb', byteLength: currentReferenceFile.size, mimeType: currentReferenceFile.type, durationMs: referenceDurationMs }); }, { id: asset.id, blob: currentReferenceFile }, signal); status('已保存本機示範副本；瀏覽器仍可能清除資料，請自行備份。');
}));
$('remove-copy').addEventListener('click', () => operation(async () => {
  const asset = state.data.assets.find(a => a.videoId === currentVideoId && a.kind === 'reference');
  if (!asset) throw new Error('示範媒體記錄不存在，請重新連結。');
  await showDelete('copy', asset.id);
}));
$('save-title').addEventListener('click', () => operation(async () => {
  const title = $('video-title').value.trim(); if (!title) throw new Error('請填寫影片標題。');
  await saveData(data => {
    const video = data.videos.find(v => v.id === currentVideoId);
    video.title = title; video.revision++;
    for (const [field, element] of /** @type {const} */ ([['teacher', 'video-teacher'], ['danceStyle', 'video-style'], ['recordedDate', 'video-date']])) {
      // 空白表示使用者清除分類；日期不從檔案時間或建立 take 的時間推測。
      const value = $(element).value.trim(); if (value) video[field] = value; else delete video[field];
    }
  }); status('標題與課程分類已保存。');
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
  $('marker-move').value = marker?.moveId || '';
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
    const row = { id: markerEditingId || crypto.randomUUID(), videoId: markerVideoId, startMs, ...(endMs === undefined ? {} : { endMs }), title, note: $('marker-note').value, revision: 1, ...($('marker-move').value ? { moveId: $('marker-move').value } : {}) };
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
  $('media-inventory').open = true;
  const data = validateBackup(state.data); data.exportedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = urlFor('backup', blob); a.download = 'notes.dance-stamp.json'; a.click();
  status('筆記與配方備份已下載，不含影片。請另存示範、自拍與 VS。');
}));
$('restore').addEventListener('change', () => operation(async signal => {
  const file = $('restore').files?.[0]; $('restore').value = ''; if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error('備份超過 10 MiB。');
  releaseCamera();
  const revision = state.revision, incoming = parseBackup(await file.text());
  const plan = await planBackupImport(state.data, incoming, signal); signal.throwIfAborted();
  importDraft = { plan, revision };
  $('import-summary').textContent = `將新增 ${plan.additions.videos} 份影片筆記、${plan.additions.markers} 個標記、${plan.additions.moves} 個動作、${plan.additions.takes} 個練習、${plan.additions.recipes} 個配方、${plan.additions.exports} 個 VS 描述。已存在 ${plan.skipped} 筆。${plan.conflicts.length ? `有 ${plan.conflicts.length} 處內容衝突，會為衝突與相關項目另存副本，原資料不變。` : plan.differentSource ? '這是另一個來源，將分開匯入，不與本機同名資料混合。' : ''}`;
  const count = kind => incoming.assets.filter(a => a.kind === kind).length;
  $('import-media').textContent = `JSON 不含影片：示範 ${count('reference')}、自己 ${count('take')}、VS ${count('vs')} 份描述。確認後請核對保存清單，缺片須另外選取並預覽確認。`;
  $('import-media').textContent += ' 備份影片：' + incoming.videos.slice(0, 10).map(v => v.title).join('、') + (incoming.videos.length > 10 ? `等 ${incoming.videos.length} 份。` : '。');
  $('import-confirm').textContent = !plan.added ? '完成，沒有新資料' : plan.conflicts.length ? '另存衝突副本' : '確認匯入';
  $('import-dialog').showModal(); $('import-cancel').focus();
}));
$('import-confirm').addEventListener('click', () => operation(async signal => {
  const draft = importDraft; if (!draft) return;
  if (state.revision !== draft.revision) throw new Error('預覽後資料已改變，請取消後重新選擇備份。');
  if (draft.plan.added) { state = await writeLibrary(draft.plan.data, draft.revision, undefined, signal); renderLibrary(); }
  closeImportDialog(false); $('media-inventory').open = true;
  status(draft.plan.added ? '筆記與配方已原子匯入，原資料保留。請另存或重新連結清單中的影片。' : '這份備份內容已在本機，沒有新增或覆寫資料。');
}));
$('import-cancel').addEventListener('click', () => closeImportDialog());
$('import-dialog').addEventListener('cancel', e => { e.preventDefault(); closeImportDialog(); });
$('refresh-media').addEventListener('click', () => operation(refreshMediaInventory));
$('relink-cancel').addEventListener('click', () => closeMediaDialog());
$('media-dialog').addEventListener('cancel', e => { e.preventDefault(); closeMediaDialog(); });
$('relink-checked').addEventListener('change', updateControls);
$('relink-file').addEventListener('change', () => operation(async signal => {
  const selected = $('relink-file').files?.[0]; $('relink-file').value = ''; if (!selected || !relinkDraft) return;
  const old = relinkDraft.candidate, video = $('relink-preview');
  try {
    const file = await normalizedVideo(selected), durationMs = await loadCandidate(file, video, 'relink-preview', signal);
    await mediaAction(video, 'timeupdate', () => video.play(), signal);
    while (video.currentTime <= 0 && !video.ended) await event(video, 'timeupdate', signal);
    video.pause(); await seek(video, 0, signal); signal.throwIfAborted();
    if (!relinkDraft) throw new DOMException('已取消', 'AbortError');
    $('relink-checked').checked = false;
    const asset = state.data.assets.find(a => a.id === relinkDraft.assetId);
    if (!asset) throw new Error('媒體描述已失聯，沒有變更原資料。');
    // 比較原片必須涵蓋已存 B；裁切候選可以預覽，但不能悄悄綁成完整老師原片。
    const blocked = asset.kind === 'reference' && state.data.takes.some(t => t.referenceVideoId === asset.videoId && t.referenceEndMs > durationMs);
    relinkDraft.candidate = { file, durationMs, blocked };
    const mismatch = asset.byteLength !== file.size || asset.durationMs && asset.durationMs !== durationMs;
    $('relink-summary').textContent = `候選 ${(durationMs / 1000).toFixed(3)} 秒、${(file.size / 1048576).toFixed(2)} MiB。${blocked ? '原片短於既有比較結尾，不能連結；請改選完整老師原片。' : mismatch ? '與備份描述不同：請核對是否裁切／轉碼；舊時間與配方保留，超界處需修復。' : '請核對內容與標記位置，不能只憑檔名判斷。'}`;
  } catch (error) { if (old && $('media-dialog').open) await loadCandidate(old.file, video, 'relink-preview').catch(() => {}); throw error; }
  finally { video.pause(); }
}));
$('relink-confirm').addEventListener('click', () => operation(async signal => {
  const draft = relinkDraft, candidate = draft?.candidate;
  if (!draft || !candidate || candidate.blocked || !$('relink-checked').checked) throw new Error('請先選片、實播預覽並確認。');
  if (state.revision !== draft.revision || await getAvailableMedia(draft.assetId)) throw new Error('此片資料已改變，原片保留；請取消後重新檢查清單。');
  const copy = $('relink-save').checked;
  if (copy && candidate.file.size > 200 * 1024 * 1024) throw new Error('副本初期限 200 MiB；取消勾選仍可只在本次連結。');
  await saveData(data => {
    const asset = data.assets.find(a => a.id === draft.assetId); if (!asset) throw new Error('媒體描述已失聯，原資料保留。');
    Object.assign(asset, { byteLength: candidate.file.size, mimeType: linkedMime(asset.mimeType, candidate.file), durationMs: candidate.durationMs, state: copy ? 'ready' : 'session-only', storageKind: copy ? 'indexeddb' : 'session' });
    if (asset.kind === 'vs') for (const artifact of data.exports.filter(e => e.assetId === asset.id)) artifact.mimeType = linkedMime(artifact.mimeType, candidate.file);
  }, copy ? { id: draft.assetId, blob: candidate.file } : undefined, signal);
  sessionMedia.set(draft.assetId, candidate.file); closeMediaDialog(false); await refreshMediaInventory();
  status('影片已確認連結，原比較畫面與配方保留。可另存影片，或從對應筆記開啟。');
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
  looping = false; practiceStarting = false; clearPracticeWatch(); practiceController?.abort(); practiceController = null; practiceSeek = null;
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
  // 取消等待不會取消原生 seek；新 owner 先等舊跳轉結束，避免重啟時重疊。
  const pending = (async () => {
    if (reference.seeking) await mediaAction(reference, 'seeked', () => {}, signal);
    await seek(reference, seconds, signal);
  })(); practiceSeek = pending;
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
        // 循環中改 A 也要重新定位，不能繼續播放新起點之前的畫面。
        if (reference.currentTime >= b || reference.currentTime < a - 0.15) await rewindPractice(a, owner.signal);
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
// ended 只保留上方可取消的循環 owner；重複掛舊 handler 會在停止後重新播放。
function changeComparison(change) {
  if (active || pendingTakeId) return;
  change(); $('scrub').value = '0'; updateIntersection();
  if (!activeTakeId) return;
  let value;
  try { value = recipe(); } catch { return; }
  const version = ++comparisonSaveVersion;
  // blur 先於按鈕 click；保存時若停用按鈕，使用者剛按的播放／匯出就會被吃掉。
  // 以同一佇列保存，媒體操作進來時等待佇列，既不漏點擊也不讓 revision 互撞。
  $('compare').setAttribute('aria-busy', 'true'); status('正在保存比較設定…');
  const saving = comparisonSave.then(async () => {
    await saveCurrentRecipe(value);
    if (version === comparisonSaveVersion && !active) await align(value, 0);
  });
  // 佇列只代表前次工作已結束；單次錯誤另行回報，不能阻擋備份、另存或恢復。
  // 匯出／預覽仍會重新保存目前配方，實際 quota／revision 檢查沒有被略過。
  comparisonSave = saving.catch(() => {});
  saving.then(() => {
    if (version !== comparisonSaveVersion) return;
    $('compare').setAttribute('aria-busy', 'false'); updateIntersection();
    if (!active) status('比較設定已保存；原片與舊輸出仍保留。');
  }, error => {
    if (version !== comparisonSaveVersion) return;
    $('compare').setAttribute('aria-busy', 'false'); status(`${error.message} 原片與目前輸入仍保留。`);
  });
}
for (const id of /** @type {const} */ (['start', 'end', 'rate', 'offset', 'reference-mirror', 'self-mirror'])) $(id).addEventListener('change', () => changeComparison(() => {}));
for (const [id, target, video] of /** @type {const} */ ([['reference-start', 'start', reference], ['reference-end', 'end', reference], ['self-start', 'offset', self]])) $(id).addEventListener('click', () => {
  const time = video.currentTime.toFixed(3);
  changeComparison(() => { $(target).value = time; });
});
for (const el of $('offset-controls').querySelectorAll('button')) el.addEventListener('click', () => changeComparison(() => {
  $('offset').value = String((Math.round(Number($('offset').value) * 1000) + Number(el.dataset.offset)) / 1000);
}));
$('copy-self').addEventListener('click', () => operation(async signal => {
  const take = state.data.takes.find(t => t.id === activeTakeId), blob = takeBlob;
  if (!take || !blob) throw new Error('請先選取並連結我的影片。');
  if (blob.size > 200 * 1024 * 1024) throw new Error('副本初期限制 200 MiB；仍可當次比較，原片請自行保存。');
  await saveData(data => {
    const asset = data.assets.find(a => a.id === take.cameraAssetId);
    Object.assign(asset, { state: 'ready', storageKind: 'indexeddb', byteLength: blob.size, mimeType: blob.type, durationMs: selfDurationMs });
  }, { id: take.cameraAssetId, blob }, signal);
  status('已保存我的影片副本；JSON 仍不含影片，請另行下載備份。');
}));
function updateAudioStatus() {
  // 有些瀏覽器不提供音軌資訊；未知時不冒稱有聲，最後仍須重播輸出確認。
  const video = /** @type {HTMLVideoElement & {audioTracks?: {length: number}, webkitAudioDecodedByteCount?: number, mozHasAudio?: boolean}} */ (reference);
  const hasAudio = video.audioTracks ? video.audioTracks.length > 0 : (video.webkitAudioDecodedByteCount ?? 0) > 0 ? true : video.mozHasAudio;
  $('audio-status').textContent = hasAudio === false ? '老師影片未偵測到音軌，將輸出無聲影片；我的影片不混音。' : hasAudio === true ? '只播放老師影片的聲音，我的影片靜音。' : '只使用老師影片音訊；沒有音軌時輸出無聲。請下載後重播確認聲音。';
}
ready = (async () => {
  state = await readLibrary(); validateBackup(state.data);
  // 不自動改寫其他分頁可能仍在錄製的 take；恢復操作會先取得該 take 的互斥鎖。
  renderLibrary(); $('storage-status').textContent = `此瀏覽器有 ${state.data.videos.length} 份影片筆記。`;
  applyPracticeSettings(); updateControls();
  // 能力檢查獨立於筆記開啟；離線服務或 persist 失敗不能讓既有資料無法使用。
  startOffline({ offline: $('offline-status'), capacity: $('capacity-status'), persistence: $('persistence-status'), updates: $('update-status'), refresh: $('check-offline'), persist: $('request-persist'), checkUpdate: $('check-update') }).catch(() => { $('offline-status').textContent = '離線能力暫時無法確認；本機資料保留。'; });
})().catch(error => { $('storage-status').textContent = `本機儲存無法開啟：${error.message} 沒有重置或刪除舊資料。`; throw error; });
ready.catch(() => {}); report();
