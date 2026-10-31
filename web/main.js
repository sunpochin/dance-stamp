/* 檔案用途：串起 M0 選片、相機、校正與單一 VS 成檔。所在層：獨立 Web 原型。主要關聯：timeline.js、recorder.js、MEDIA_PROBE.md。 */
import { comparison, positions, contain, validateMarkerRange, captureDuration } from './timeline.js';
import { event, normalizedVideo, mediaAction, presentedFrame, seek, load, record, extension, cameraError } from './recorder.js';
import { validateBackup, parseBackup, planBackupImport, createShare, mediaInventory, videoLabels, planDeletion, moveStatuses, searchLibrary, practiceHistory } from './library.js';
import { startOffline } from './offline.js';
import { safariAudio, decodeLocalAudio } from './local-audio.js';
import { validateBeatGrid, beatPosition, countInPlan, scheduleCountIn } from './beats.js';
import { readLibrary, writeLibrary, readMedia, readMediaKeys, saveChunk, recoverChunks, clearChunks, withTakeLock, storageUnconfirmed, storageUnconfirmedMessage } from './storage.js';

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
const overlay = $('overlay-canvas'), overlayContext = drawingContext(overlay);
const localAudio = safariAudio();
let camera, cameraWatch, active, referenceDurationMs = 0, selfDurationMs = 0, takeBlob, outputBlob;
let audio, audioSource, monitor, audioDestination;
const urls = new Map();
let overlaySources = '';
const overlayLayoutFields = /** @type {const} */ ([
  ['overlay-reference-scale', 'overlay-reference-scale-value'], ['overlay-reference-x', 'overlay-reference-x-value'], ['overlay-reference-y', 'overlay-reference-y-value'],
  ['overlay-self-scale', 'overlay-self-scale-value'], ['overlay-self-x', 'overlay-self-x-value'], ['overlay-self-y', 'overlay-self-y-value'],
]);
const sourceTimelines = [
  { video: reference, slider: $('reference-seek'), time: $('reference-seek-time'), ruler: $('reference-ruler'), chosen: $('reference-chosen-start'), buttons: $('reference-seek-buttons'), duration: () => referenceDurationMs, start: () => Number($('start').value) },
  { video: self, slider: $('self-seek'), time: $('self-seek-time'), ruler: $('self-ruler'), chosen: $('self-chosen-start'), buttons: $('self-seek-buttons'), duration: () => selfDurationMs, start: () => Number($('offset').value) },
];
// File 只保留在本次頁面；不為了重開配方而暗中複製使用者的原片。
const sessionMedia = new Map();
let importDraft, relinkDraft, deleteDraft, inventoryToken = 0, outputAssetId;
let operationTrigger, operationFocus;
/** @type {{ file: File, revision: number } | null} */
let shareDraft = null;
let shareSending = false;

let existingMode = false, outputRecipe, comparisonSave = Promise.resolve(), comparisonSaveVersion = 0;
/** @type {import('./types').Diagnostics} */
// 原生測試要辨識真正執行的聲路；只有主機檔案版本不能排除舊 SW 仍控制頁面。
const diagnostics = { stage: 'idle', camera: null, capture: null, export: null, audioPath: localAudio ? 'bounded-aac-v1' : 'media-element' };
/** @type {import('./types').LibraryState} */
let state;
let ready, currentVideoId, currentReferenceFile, pendingLinkId, pendingTakeId, activeTakeId, partialAssetId, markerEditingId;
let markerVideoId;
let moveEditingId, moveDirty = false;
let metadataVideoId;
let beatEditorVideoId, beatDirty = false;

let looping = false, practiceStarting = false, practiceController, practiceSeek, practiceFrame, practiceFrameUsesVideo, practiceToken = 0;

function status(message) { $('status').textContent = message; }
function showStorageRecovery() {
  if (!storageUnconfirmed()) return;
  // 使用記憶體中的原片／VS 與最後確認的筆記另存；不重新讀取可能仍卡住的 DB。
  const first = $('storage-recovery').hidden;
  $('storage-recovery').hidden = false;
  $('storage-status').textContent = storageUnconfirmedMessage; status(storageUnconfirmedMessage);
  // modal 會讓外面的救援控制無法操作；只關視窗，不清預覽 File、表單或現有下載 URL。
  for (const id of /** @type {const} */ (['import-dialog', 'media-dialog', 'delete-dialog', 'share-dialog'])) if ($(id).open) $(id).close();
  releaseCamera(); stopPractice();
  if (first) focusControl($('storage-backup'));
}
function focusControl(element) {
  if (!(element instanceof HTMLElement)) return;
  // 先等 fieldset 重新啟用；直接 focus 停用中的輸入不會生效。
  if (active) { operationFocus = element; return; }
  /** @type {HTMLElement | null} */
  let target = element;
  if (!element.isConnected) {
    const key = element.dataset.focusKey;
    target = key ? document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`) : null;
    if (!target && key?.startsWith('asset:')) target = document.querySelector(`[data-asset-id="${CSS.escape(key.split(':')[1])}"] button`) || $('refresh-media');
    target ||= key?.startsWith('marker:') ? $('mark') : $('library');
  }
  const modal = document.querySelector('dialog[open]');
  if (target && !target.matches(':disabled') && target.getClientRects().length && (!modal || modal.contains(target))) target.focus();
}
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
/** @param {'reference-download' | 'take-download' | 'output-download' | 'partial-download'} id @param {Blob} blob @param {string} prefix */
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
  closeImportDialog(); closeMediaDialog(); closeDeleteDialog(); closeShareDialog();
  reference.pause(); self.pause();
  releaseCamera();
  stopPractice();
  // 原生錯誤可能先把影片變成 paused，pause() 就不再發事件；閒置停止仍須明確暫停音訊。
  // active 的成檔保全由 operation 收尾持有，不能借一般停止提早截斷它的音訊生命週期。
  if (!active && audio?.state === 'running') audio.suspend().catch(() => {});
}
function updateControls() {
  for (const id of /** @type {const} */ (['inventory-controls', 'import-controls', 'relink-controls', 'delete-controls'])) $(id).disabled = !!active;
  $('share-controls').disabled = !!active || shareSending;
  $('share-download').disabled = !shareDraft || shareSending;
  $('relink-confirm').disabled = !relinkDraft?.candidate || !!relinkDraft.candidate.blocked || !$('relink-checked').checked;
  $('camera').disabled = !referenceDurationMs || !currentVideoId;
  // 自己的影片必須有老師筆記可配對；停用時在欄位旁交代原因，避免誤選成左片。
  $('select-self-video').disabled = !referenceDurationMs || !currentVideoId;
  // 摘要綁目前來源 URL；切到另一段錄影時，不能留下上一段的檔名。
  for (const [video, duration, picker, label, role] of /** @type {const} */ ([
    [reference, referenceDurationMs, $('reference-picker'), $('reference-selection'), '示範影片'],
    [self, selfDurationMs, $('self-picker'), $('self-selection'), '練習影片'],
  ])) {
    if (!duration) { picker.open = true; label.textContent = '尚未選擇'; delete label.dataset.source; }
    else if (label.dataset.source !== video.getAttribute('src')) {
      label.textContent = `已載入${role}`; label.dataset.source = video.getAttribute('src') || ''; picker.open = false;
    }
  }
  $('reference-file-hint').textContent = referenceDurationMs ? `已載入示範影片 · ${(referenceDurationMs / 1000).toFixed(1)} 秒${pendingLinkId ? '；請先預覽並確認連結。' : '。'}` : '支援 MOV／MP4 等；選片不會自動上傳。';
  $('self-file-hint').textContent = selfDurationMs ? `已載入練習影片 · ${(selfDurationMs / 1000).toFixed(1)} 秒${pendingTakeId ? '；請先預覽並確認連結。' : '。'}` : !currentVideoId ? '先選左邊示範影片；若正在重連，請先預覽並確認。' : '選已錄好的影片放在右邊；還沒錄好可展開下方相機錄影。';
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
  if (storageUnconfirmed()) {
    // 停止接受可能改寫或換掉當次影片的操作；原生下載連結及救援備份在 fieldset 外，仍可使用。
    for (const id of /** @type {const} */ (['controls', 'compare', 'practice', 'inventory-controls', 'import-controls', 'relink-controls', 'delete-controls', 'share-controls'])) $(id).disabled = true;
    for (const el of $('library-panel').querySelectorAll('button, input, select')) (/** @type {HTMLButtonElement | HTMLInputElement | HTMLSelectElement} */ (el)).disabled = el.id !== 'backup' || !!active;
    showStorageRecovery();
  }
  updateOverlayControls(); updateSourceTimelines();
}
function updateOverlayControls() {
  let available = !!referenceDurationMs && !!selfDurationMs && !!activeTakeId && !pendingTakeId && !pendingLinkId;
  try { if (available) recipe(); } catch { available = false; }
  const previewing = !$('pause-comparison').hidden;
  overlay.hidden = !available; $('overlay-empty').hidden = available;
  $('overlay-opacity').disabled = !available || !!active && !previewing;
  $('overlay-layout').disabled = $('overlay-opacity').disabled;
  // 控制始終可見，停用時要交代缺片或處理中的原因，避免使用者以為滑桿消失。
  $('overlay-layout-status').textContent = !available ? '先選好老師與自己的影片，並確認兩片有共同的比較區間，即可使用下方滑桿。' : $('overlay-layout').disabled ? '正在處理影片，完成後即可繼續調整。' : '拖動下方的大小、左右位置與上下位置，讓老師與自己的身體對齊。';
  if (available) {
    // 只認已提交成功的來源 URL；壞檔與取消回復舊片時，不能順便丟掉使用者的對齊。
    const sources = `${urls.get('reference')}\n${urls.get('self')}`;
    if (sources !== overlaySources) { overlaySources = sources; resetOverlayLayout(false); }
  }
  $('export-controls').disabled = !available || !!active || storageUnconfirmed();
  if (available && !active) drawOverlay(recipe());
}
function updateSourceTimelines() {
  for (const entry of sourceTimelines) {
    const duration = entry.duration() / 1000;
    const disabled = !duration || !!active || storageUnconfirmed() || $('compare').getAttribute('aria-busy') === 'true';
    entry.slider.disabled = disabled;
    for (const button of entry.buttons.querySelectorAll('button')) button.disabled = disabled;
    entry.slider.max = String(duration || 1);
    const time = Math.max(0, Math.min(duration, entry.video.currentTime || 0));
    entry.slider.value = String(time); entry.time.value = `${time.toFixed(3)} 秒`; entry.slider.setAttribute('aria-valuetext', `${time.toFixed(3)} 秒`);
    const start = entry.start();
    entry.chosen.textContent = !duration ? '尚未選片' : start < 0 ? `原片從 0 秒開始；比較偏移 ${start.toFixed(3)} 秒` : `已設起點 ${start.toFixed(3)} 秒`;
    // 刻度只隨來源長度重建；播放位置更新不能每次換掉滑桿或鍵盤焦點。
    if (entry.ruler.dataset.duration !== String(duration)) {
      entry.ruler.dataset.duration = String(duration); entry.ruler.replaceChildren();
      for (let i = 0; i <= 4; i++) {
        const tick = document.createElement('span'); tick.textContent = `${Number((duration * i / 4).toFixed(2))} 秒`; entry.ruler.append(tick);
      }
    }
  }
}
function locateSource(entry, seconds) {
  if (entry.slider.disabled || active) return;
  // 共同比較的偏移只能明確設起點時改；此處只讓使用者在原片中找同一個動作。
  stopPractice(); entry.video.pause();
  try { entry.video.currentTime = Math.max(0, Math.min(entry.duration() / 1000, seconds)); updateSourceTimelines(); }
  catch { status('影片尚未就緒，請重新選片後再定位；原片與起點保留。'); }
}
for (const entry of sourceTimelines) {
  entry.slider.addEventListener('input', () => locateSource(entry, Number(entry.slider.value)));
  for (const button of entry.buttons.querySelectorAll('button')) button.addEventListener('click', () => locateSource(entry, entry.video.currentTime + Number(button.dataset.seek)));
  for (const name of ['timeupdate', 'seeked']) entry.video.addEventListener(name, updateSourceTimelines);
}
async function operation(task) {
  if (active) return;
  if (storageUnconfirmed()) { showStorageRecovery(); return; }
  const controller = new AbortController(), trigger = document.activeElement;
  operationTrigger = trigger; operationFocus = null;
  active = controller;
  for (const id of /** @type {const} */ (['controls', 'compare', 'practice', 'library-panel'])) $(id).setAttribute('aria-busy', 'true');
  for (const id of /** @type {const} */ (['inventory-controls', 'import-controls', 'relink-controls', 'delete-controls'])) $(id).disabled = true;
  $('share-controls').disabled = true;
  $('existing-mode').disabled = true;
  for (const id of /** @type {const} */ (['reference-start', 'reference-end', 'self-start'])) $(id).disabled = true;
  stopPractice();
  $('controls').disabled = true; $('compare').disabled = true;
  reference.controls = false; self.controls = false;
  updateOverlayControls();
  $('practice').disabled = true;
  for (const el of $('library-panel').querySelectorAll('button, input, select')) (/** @type {HTMLButtonElement | HTMLInputElement | HTMLSelectElement} */ (el)).disabled = true;
  try {
    await ready; await comparisonSave;
    // 等待期間也可能轉為未確認；已排隊的換片不能越過封鎖，否則仍會清掉當次自拍。
    if (storageUnconfirmed()) throw new Error(storageUnconfirmedMessage);
    await task(controller.signal);
  }
  catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught));
    releaseCamera();
    status(storageUnconfirmed() ? storageUnconfirmedMessage : error.name === 'AbortError' ? '已停止，原片與上次成功的輸出仍保留。' : `${error.message} 原片仍保留，可重試。`);
    // 原生錯誤可能含檔名／裝置資訊；可帶走的診斷只留分類，詳細說明留在本機狀態。
    diagnostics.lastError = storageUnconfirmed() ? 'storage-unconfirmed' : error.name === 'AbortError' ? 'cancelled' : error.name === 'QuotaExceededError' ? 'storage-full' : 'operation-failed';
  } finally {
    reference.pause(); self.pause();
    if (monitor) monitor.gain.value = 1;
    if (audio?.state === 'running') await audio.suspend().catch(() => {});
    active = null; $('controls').disabled = false; $('pause-comparison').hidden = true;
    // 比較結束先收起暫停控制，再恢復練習速度，避免下一次播放沿用合成設定。
    applyPracticeSettings(); drawPractice();
    reference.controls = true; self.controls = true;
    for (const id of /** @type {const} */ (['controls', 'compare', 'practice', 'library-panel'])) $(id).setAttribute('aria-busy', 'false');
    updateControls(); report();
    const current = document.activeElement, requested = operationFocus;
    operationTrigger = null; operationFocus = null;
    // 明確下一步且仍停在觸發控制時也要換焦；使用者已移到停止鍵等處則不搶回。
    if (current === document.body || current === document.documentElement || (requested && (current === trigger || current?.closest('dialog') === requested.closest('dialog') && current?.closest('dialog')))) focusControl(requested || trigger);
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
    monitor = audio.createGain();
    // Safari 直接播放原片；一旦掛上元素來源便無法還原原生聲路，會再次觸發開頭漏音。
    if (!localAudio) {
      audioSource = audio.createMediaElementSource(reference);
      audioDestination = audio.createMediaStreamDestination();
      // 同一個 video 一生只能掛一個來源節點；重試匯出時重用，避免第二次無聲或拋錯。
      audioSource.connect(monitor).connect(audio.destination);
      audioSource.connect(audioDestination);
    }
  }
  await audio.resume();
  if (audio.state !== 'running') throw new Error('音訊尚未啟動，請再次點按重試。');
}
async function countIn(grid, rate, signal) {
  const plan = countInPlan(grid, rate), start = audio.currentTime + 0.05;
  const cancel = scheduleCountIn(audio, plan, start), deadline = performance.now() + plan.durationMs + 2050;
  try {
    while (audio.currentTime < start + plan.durationMs / 1000) {
      abortIfNeeded(signal);
      if (audio.state !== 'running' || performance.now() > deadline) throw new Error('拍數倒數中斷，請重新點按錄影。');
      // 聲音與文字跟同一音訊時鐘；不逐拍累加 setTimeout，避免慢速倒數越來越偏。
      const passed = Math.max(0, (audio.currentTime - start) * 1000);
      status(`${Math.max(1, plan.beats - Math.floor(passed / plan.intervalMs))} 拍後開始（${rate}×），請就定位。`);
      await wait(30, signal);
    }
  } finally { cancel(); }
}
function resetOverlayLayout(repaint = true) {
  for (const [input, output] of overlayLayoutFields) {
    $(input).value = $(input).defaultValue; $(output).textContent = `${$(input).value}%`;
  }
  if (repaint && !overlay.hidden) drawOverlay(recipe());
}
function drawOverlay(value, target = overlay, targetContext = overlayContext, presentation = overlayPresentation()) {
  const width = target.width, height = target.height;
  targetContext.fillStyle = '#080c0e'; targetContext.fillRect(0, 0, width, height);
  // ponytail: 重用兩個已解碼的 video，不新增播放器或時鐘，疊影才能跟共同時間線一起停與走。
  // 自己當底圖、老師最後半透明覆蓋，避免不透明自拍把老師完全擋住。
  for (const [video, mirror, alpha, scale, x, y] of [
    [self, value.selfMirror, 1, presentation.self.scale, presentation.self.x, presentation.self.y],
    [reference, value.referenceMirror, presentation.opacity, presentation.reference.scale, presentation.reference.x, presentation.reference.y],
  ]) {
    if (video.readyState < 2) continue;
    const rect = contain(video.videoWidth, video.videoHeight, width, height);
    targetContext.save();
    // 解碼／繪製失敗也須還原變換，否則重試會累加縮放與透明度。
    try {
      targetContext.globalAlpha = alpha;
      // 位移先放在畫框座標，鏡像只翻人物；向右不應因勾鏡像而變成向左。
      targetContext.translate(width / 2 + x * width, height / 2 + y * height);
      targetContext.scale(scale * (mirror ? -1 : 1), scale);
      targetContext.drawImage(video, rect.x - width / 2, rect.y - height / 2, rect.width, rect.height);
    } finally { targetContext.restore(); }
  }
}
function draw(value, withOverlay = true) {
  context.fillStyle = '#080c0e'; context.fillRect(0, 0, 1280, 720);
  for (const [video, x, mirror, label] of [[reference, 0, value.referenceMirror, '示範'], [self, 640, value.selfMirror, '我']]) {
    if (video.readyState < 2) continue;
    const rect = contain(video.videoWidth, video.videoHeight, 640, 672);
    // 全身等比保留，留白移到外側；只翻影片本身，鏡像後仍須貼著共同中線。
    const imageX = x === 0 ? 640 - rect.width : 0;
    context.save(); context.translate(x + imageX + (mirror ? rect.width : 0), 48); context.scale(mirror ? -1 : 1, 1);
    context.drawImage(video, 0, rect.y, rect.width, rect.height); context.restore();
    context.fillStyle = '#e8f2ed'; context.font = '24px sans-serif'; context.fillText(label, x + 22, 33);
  }
  if (withOverlay) drawOverlay(value);
}
async function align(value, elapsedMs, signal, waitForFrame = false) {
  reference.pause(); self.pause();
  // 慢速音高處理曾讓成檔聲音早於畫面；預覽與輸出共用自然變調，結束後才恢復練習音高。
  if ('preservesPitch' in reference) reference.preservesPitch = false;
  const target = positions(value, elapsedMs);
  await Promise.all([seek(reference, target.referenceMs / 1000, signal, waitForFrame), seek(self, target.selfMs / 1000, signal, waitForFrame)]);
  draw(value);
}
async function timeline(value, signal, exporting, captureFrame = () => {}, startOutput = () => {}, outputAudioTime = () => NaN, render = () => draw(value, !exporting)) {
  const { durationMs } = comparison(value);
  const first = positions(value, 0);
  reference.playbackRate = value.rate; self.playbackRate = 1; self.muted = true;
  const starting = new AbortController(), cancelStart = () => starting.abort(signal.reason);
  signal.addEventListener('abort', cancelStart, { once: true }); if (signal.aborted) cancelStart();
  try {
    // Safari 先看到真正前進的來源影格，回零後的 seek 才會產生新的目標影格通知。
    const frames = exporting ? [presentedFrame(reference, starting.signal, frame => !localAudio || frame.mediaTime > first.referenceMs / 1000 + 0.001), presentedFrame(self, starting.signal, frame => !localAudio || frame.mediaTime > first.selfMs / 1000 + 0.001)] : [];
    await Promise.all([...frames, Promise.resolve().then(() => reference.play()), Promise.resolve().then(() => self.play())]);
    // 先喚醒解碼與音訊，再回到配方起點；不能靠錄晚一點而省略自拍開頭。
    if (exporting) await align(value, 0, starting.signal, localAudio);
    // 錄製先接受輸入再啟播；不能等依賴後續影格的 start 通知，否則彼此等待。
    abortIfNeeded(signal); await startOutput(); abortIfNeeded(signal);
    if (exporting) await Promise.all([reference.play(), self.play()]);
  } finally { starting.abort(); signal.removeEventListener('abort', cancelStart); }
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
        // 每輪只畫選定的輸出佈局，兩種影片沿用同一時鐘與編碼護欄。
        render(); captureFrame();
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
      // BufferSource 不會跟著影片等 play 或停滯；沿用 G2 的 100ms 限制，超標先拒絕，不能保存錯位影片。
      const audioElapsedMs = outputAudioTime();
      if (exporting && !Number.isNaN(audioElapsedMs) && Math.abs(audioElapsedMs - elapsedMs) > 100) return finish(new Error('音訊與畫面偏移超過 100ms，未完成合成；請降低負載後重試。'));
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
    const duration = await loadCandidate(file, video, key, signal, beforeCommit);
    const picker = key === 'reference' ? $('reference-picker') : $('self-picker');
    // 解碼與資料提交成功才收合；壞檔、取消或保存失敗要留在原選片位置重試。
    const label = key === 'reference' ? $('reference-selection') : $('self-selection');
    label.textContent = selected.name; label.dataset.source = video.getAttribute('src') || '';
    picker.open = false;
    focusControl(picker.querySelector('summary'));
    return { file, duration };
  } finally { input.value = ''; }
}
$('existing-mode').addEventListener('click', () => {
  if (active) return;
  releaseCamera(); stopPractice(); existingMode = true;
  if (!activeTakeId) $('rate').value = '1';
  updateControls();
  status('先選左邊示範影片，再選右邊練習影片；各自播放找到同一個動作，設為起點。全程不開相機。');
  const choosingSelf = referenceDurationMs && currentVideoId;
  // 入口可能在上次成功選片後收起，先展開才能把鍵盤焦點交給選片按鈕。
  (choosingSelf ? $('self-picker') : $('reference-picker')).open = true;
  (choosingSelf ? $('select-self-video') : $('select-video')).focus();
});
// 每張卡片只開自己的原生欄位；清空檔案欄位以便同檔重試後，仍用旁邊狀態顯示已載入。
$('select-video').addEventListener('click', () => $('reference-file').click());
$('select-self-video').addEventListener('click', () => $('self-file').click());
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
    }, undefined, signal);
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
  status(`示範影片已載入：${reference.videoWidth}×${reference.videoHeight}，${(selected.duration / 1000).toFixed(1)} 秒。可選練習影片比較，也可錄下自己。`);
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
    }, undefined, signal);
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
  if (beatDirty) throw new Error('請先保存或取消拍點編輯，再開始錄影。');
  const value = recipe(), expectedDurationMs = captureDuration(value);
  // 確認框的取消也會關閉預覽，避免使用者退出重錄後相機仍持續開啟。
  if (takeBlob && !confirm('請先下載目前自拍與 VS。重錄會建立新 take，已保存的舊段仍會保留，確定繼續？')) { releaseCamera(); status('已取消新錄影，原自拍與已保存的舊段都保留。'); return; }
  const info = /** @type {import('./types').CaptureInfo} */ ({ rate: value.rate, interrupted: true }); diagnostics.capture = info;
  let recording, take, partialBlob, captureIntegrityError, captureBuffer, captureSource, captureGain, captureAudioAt = NaN, stopRequested = false, chunkQueue = Promise.resolve(), chunkError, persistenceError, chunkIndex = 0;
  const muted = reference.muted;
  try {
    take = await beginTake(value);
    // 與恢復操作共用原生鎖，避免另一分頁把尚在錄製的 take 當成中斷接管。
    await withTakeLock(take.id, async () => {
      try {
        await prepareAudio();
        if (localAudio) {
          // Safari 切回音高保持會回跳；示範維持音高設定並靜音，只從同一原片準備本輪有界聲音。
          reference.muted = true;
          if ('preservesPitch' in reference && !reference.preservesPitch) reference.preservesPitch = true;
          if (!muted && reference.volume > 0) captureBuffer = await decodeLocalAudio(currentReferenceFile, audio, value.startMs / 1000, (value.endMs - value.startMs) / 1000, signal);
        }
        await seek(reference, value.startMs / 1000, signal);
        if (localAudio) {
          // 先用非原速喚醒真實影格再回 A；否則原速長段在下一次改速播放仍可能退回關鍵影格。
          const warming = new AbortController(), cancelWarm = () => warming.abort(signal.reason);
          const timer = setTimeout(() => warming.abort(new Error('示範畫面準備逾時，請重新錄影。')), 2000);
          signal.addEventListener('abort', cancelWarm, { once: true });
          if (signal.aborted) cancelWarm();
          try {
            reference.playbackRate = 2;
            // 回 A 後可能收到前輪 17 秒的舊通知；位置真的前進且影格符合本輪 2× 的原 100ms 容差才算暖機。
            await Promise.all([presentedFrame(reference, warming.signal, frame => frame.mediaTime > value.startMs / 1000 + 0.001 && reference.currentTime > value.startMs / 1000 + 0.001 && Math.abs(frame.mediaTime - reference.currentTime) * 1000 / 2 <= 100), reference.play()]);
            reference.pause();
            await seek(reference, value.startMs / 1000, warming.signal);
          } finally { reference.pause(); warming.abort(); clearTimeout(timer); signal.removeEventListener('abort', cancelWarm); }
        }
        reference.playbackRate = value.rate;
        if (take.beatGrid?.countInBeats) await countIn(take.beatGrid, value.rate, signal);
        else for (let n = Number($('countdown').value); n > 0; n--) { status(`${n} 秒後開始，請就定位。`); await wait(1000, signal); }
        abortIfNeeded(signal);
        info.recorderRequestedMs = Math.round(performance.now());
        recording = record(camera, blob => {
          chunkQueue = chunkQueue.then(() => saveChunk(take.cameraAssetId, chunkIndex++, blob)).catch(error => {
            chunkError = error;
            // 舊 take 的遲到寫入失敗不能中止下一個操作；仍保留該 take 的 chunks 供恢復。
            if (active?.signal === signal && !signal.aborted) { active.abort(new Error('錄影片段保存失敗，請先下載原片。')); stop(); }
          });
        }, startedMs => { info.recorderStartedMs = startedMs; });
        // 原生也可能提早成功 stop；只有本輪明確要求的停止才可進完整錄影收尾。
        recording.done.then(() => {
          if (!stopRequested && active?.signal === signal && !signal.aborted) {
            captureIntegrityError = new Error('錄影未完成：錄製提早停止。未完成原片可另存；舊自拍與 VS 保留。');
            active.abort(captureIntegrityError); stop();
          }
        }, error => { if (active?.signal === signal && !signal.aborted) { active.abort(error); stop(); } });
        if (captureBuffer) {
          captureSource = audio.createBufferSource(); captureGain = audio.createGain();
          captureSource.buffer = captureBuffer; captureSource.playbackRate.value = value.rate;
          captureGain.gain.value = reference.volume;
          captureSource.connect(captureGain).connect(audio.destination);
        }
        const began = performance.now();
        await reference.play();
        info.referencePlayResolvedMs = Math.round(performance.now()); info.referenceAtPlayMs = Math.round(reference.currentTime * 1000); info.interrupted = false;
        if (captureSource) {
          // 錄影仍先於示範；等原生啟播接受後才供聲，避免聲音先跑，並沿用既有 10ms 排程而非裝置補償值。
          try { captureAudioAt = audio.currentTime + 0.01; captureSource.start(captureAudioAt); }
          catch (error) { captureIntegrityError = error instanceof Error ? error : new Error('示範聲音無法啟動。'); throw captureIntegrityError; }
        }
        status('錄影中。示範到片段終點會停止，也可隨時按停止。');
        while (reference.currentTime * 1000 < value.endMs && !reference.ended) {
          if (performance.now() - began > 62_000) throw new Error('播放／錄影逾時。');
          if (reference.paused) throw new Error('示範播放中斷。');
          // 聲音與示範沿同一 A／r 映射；時鐘超過原 100ms 就保留中斷原片，不能把錯位錄影標成功。
          if (captureSource && (audio.state !== 'running' || Math.abs((reference.currentTime * 1000 - value.startMs) / value.rate - (audio.currentTime - captureAudioAt) * 1000) > 100)) {
            captureIntegrityError = new Error('示範聲音中斷或不同步，請重新錄影。'); throw captureIntegrityError;
          }
          await wait(30, signal);
          renderBeatPosition();
        }
      } finally {
        reference.pause();
        // 先停聲再等編碼／保存尾段；取消或失敗也不能留下播放中的本輪音訊。
        if (captureSource) { try { captureSource.stop(); } catch { /* 尚未排程也必須斷線。 */ } captureSource.disconnect(); captureSource.buffer = null; }
        captureGain?.disconnect(); captureBuffer = null;
        if (recording) {
          info.interrupted = signal.aborted || reference.currentTime * 1000 < value.endMs - 100;
          try {
            // 必須先標記，再 stop／關相機；否則正常完成的 done 也會被誤當提早停止。
            stopRequested = true;
            const stopped = recording.stop(); releaseCamera();
            const blob = await stopped; partialBlob = blob;
            info.mime = blob.type;
            const durationMs = await loadCandidate(blob, self, 'self', undefined, candidate => {
              info.durationMs = candidate.duration;
              if (captureIntegrityError) throw captureIntegrityError;
              // 沿原 media-feasibility 的 expected−500ms 下限；驗證前不能撤銷舊播放器／下載或清 chunks。
              if (!info.interrupted && candidate.duration <= expectedDurationMs - 500) {
                info.interrupted = true;
                captureIntegrityError = new Error('錄影未完成：原片長度不足。未完成原片可另存；舊自拍與 VS 保留。');
                throw captureIntegrityError;
              }
              return Promise.resolve();
            });
            download('take-download', blob, 'dance-self');
            // 新原片解碼成功才切換關聯；倒數取消或壞檔不能把舊畫面綁到新 take。
            takeBlob = blob; selfDurationMs = durationMs; activeTakeId = take.id; pendingTakeId = null; $('confirm-take').hidden = true; $('offset').value = '0';
            await chunkQueue;
            info.interrupted ||= signal.aborted || !!chunkError;
            const captureTiming = info.recorderRequestedMs === undefined ? undefined : { recorderRequestedMs: info.recorderRequestedMs, ...Object.fromEntries(['recorderStartedMs', 'referencePlayResolvedMs', 'referenceAtPlayMs'].filter(key => info[key] !== undefined).map(key => [key, info[key]])) };
            try { await finalizeTake(take, blob, durationMs, info.interrupted, captureTiming); }
            catch (error) { persistenceError = error instanceof Error ? error : new Error('儲存發生錯誤。'); }

          } finally {
            releaseCamera();
            // 編碼或讀回失敗也要持鎖等尾塊落盤，否則另一分頁會恢復尚未收齊的片段。
            await chunkQueue;
          }
        } else releaseCamera();
      }
      if (persistenceError) throw persistenceError;
      if (chunkError) throw new Error('錄影片段落盤曾失敗；已保留可下載原片，請先下載。');
      status('自拍已錄好。先下載原片，再校正與合成。'); updateIntersection();
    });
  } catch (error) {
    // 失敗原片另給下載，不能為了保全新片覆蓋舊自拍連結；chunks 留待明確恢復。
    if (partialBlob && takeBlob !== partialBlob) { download('partial-download', partialBlob, 'dance-self-incomplete'); partialAssetId = take?.cameraAssetId; }
    if (take) await markStoppedTake(take, recording ? 'interrupted' : 'failed').catch(() => { diagnostics.lastError = '錄影狀態無法更新；原片與 chunks 保留，請下載原片後重開。'; });
    if (captureIntegrityError) throw captureIntegrityError;
    if (persistenceError) throw new Error(`自拍無法保存在此瀏覽器，請立即下載自拍原片。${persistenceError.message}`);
    throw error;
  } finally { reference.muted = muted; releaseCamera(); await chunkQueue; }
}));
function updateIntersection() {
  try {
    const value = recipe(), range = comparison(value);
    $('scrub').max = String(range.durationMs / 1000); $('scrub').value = String(Math.min(Number($('scrub').value), range.durationMs / 1000));
    $('intersection').textContent = `共同長度 ${(range.durationMs / 1000).toFixed(2)} 秒；老師 ${((value.startMs + value.rate * range.lowerMs) / 1000).toFixed(3)} 秒／我 ${((range.lowerMs + value.offsetMs) / 1000).toFixed(3)} 秒起跳，示範 ${value.rate}×。${range.durationMs < (value.endMs - value.startMs) / value.rate ? '片尾不足，只輸出兩片都有畫面的區間。' : ''}`;
    $('play').disabled = false; $('export').disabled = false;
    if (outputBlob) $('output-status').textContent = outputRecipe === recipeSignature(value) ? `這支${$('export-layout').value === 'overlay' ? '疊影' : '左右並排'}影片對應目前的比較設定。` : '這是先前設定的 VS，原檔仍保留；若要目前設定的畫面，請重新匯出。';
  } catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught)); $('intersection').textContent = error.message; $('play').disabled = true; $('export').disabled = true; }
  updateOverlayControls(); updateSourceTimelines();
}
for (const id of /** @type {const} */ (['start', 'end', 'rate', 'offset', 'reference-mirror', 'self-mirror', 'preview-mirror'])) $(id).addEventListener('change', () => { mirrors(); if (selfDurationMs) updateIntersection(); });
// 空間設定只留本頁並烘焙進新疊影；變更後須提示舊輸出不會跟著改。
$('overlay-opacity').addEventListener('input', () => {
  $('overlay-opacity-value').textContent = `${$('overlay-opacity').value}%`;
  if (!overlay.hidden) drawOverlay(recipe());
  updateIntersection();
});
for (const [input, output] of overlayLayoutFields) $(input).addEventListener('input', () => {
  $(output).textContent = `${$(input).value}%`;
  if (!overlay.hidden) drawOverlay(recipe());
  updateIntersection();
});
$('overlay-layout-reset').addEventListener('click', () => { resetOverlayLayout(); updateIntersection(); });
$('export-layout').addEventListener('change', updateIntersection);
$('scrub').addEventListener('change', () => operation(async signal => { await align(recipe(), Number($('scrub').value) * 1000, signal); status('已定位兩側畫面。'); }));
$('play').addEventListener('click', () => operation(async signal => {
  const value = recipe(), durationMs = comparison(value).durationMs;
  const startMs = Number($('scrub').value) * 1000;
  await saveCurrentRecipe(value, signal); await prepareAudio(); await align(value, startMs >= durationMs - 20 ? 0 : startMs, signal);
  $('pause-comparison').hidden = false; updateOverlayControls();
  status('共同預覽中；疊影與左右畫面一起播放，可調整老師可見度。一起暫停後可拖動共同時間線再繼續。');
  diagnostics.preview = await timeline(value, signal, false); status('預覽結束，可調整偏移或輸出。');
}));
$('export').addEventListener('click', () => operation(async signal => {
  const value = recipe(), presentation = currentPresentation();
  // 操作鎖固定本輪可見度與位置；直接以輸出尺寸繪製，避免放大低解析預覽。
  const render = () => presentation ? drawOverlay(value, canvas, context, presentation) : draw(value, false);
  let stream, recording, blob, buffer, bufferSource, destination, audioStartedAt;
  const muted = reference.muted;
  await saveCurrentRecipe(value, signal);
  try {
    await prepareAudio();
    if (localAudio) {
      status('正在準備 Safari 相容音訊，可隨時取消；原片保留。');
      const first = positions(value, 0);
      buffer = await decodeLocalAudio(currentReferenceFile, audio, first.referenceMs / 1000, comparison(value).durationMs * value.rate / 1000, signal);
      reference.muted = true;
    }
    await align(value, 0, signal); abortIfNeeded(signal);
    monitor.gain.value = 0;
    /** @type {CanvasCaptureMediaStreamTrack | undefined} */
    let canvasTrack;
    status('正在準備比較畫面，請保持此頁在前景。');
    // 兩側真正呈現後才建立輸出流，不裁首尾或硬填音訊延遲來掩蓋啟播差。
    const measured = await timeline(value, signal, true, () => canvasTrack?.requestFrame?.(), async () => {
      render();
      // ponytail: 前景即時合成免轉碼套件；通過 M0 實測後才評估更快的編碼路徑。
      // 明確在畫面畫好後請求擷取，避免慢速素材與自動擷取計時器互相錯開而留住舊畫面。
      stream = canvas.captureStream(0);
      canvasTrack = /** @type {CanvasCaptureMediaStreamTrack} */ (stream.getVideoTracks()[0]);
      if (typeof canvasTrack.requestFrame !== 'function') {
        stream.getTracks().forEach(track => { track.stop(); });
        stream = canvas.captureStream(30); canvasTrack = /** @type {CanvasCaptureMediaStreamTrack} */ (stream.getVideoTracks()[0]);
      }
      if (localAudio) {
        // 每輪自己的目的端與一次性來源都由 finally 釋放；無音軌就保持真正無聲，不猜測壞解碼為靜音。
        if (buffer) {
          destination = audio.createMediaStreamDestination(); bufferSource = audio.createBufferSource();
          bufferSource.buffer = buffer; bufferSource.playbackRate.value = value.rate; bufferSource.connect(destination);
          destination.stream.getAudioTracks().forEach(track => { stream.addTrack(track.clone()); });
        }
        // start 事件可依賴後續影格，不能等它才啟播；start() 已成功回傳才啟動音畫，仍用原偏移護欄拒絕失步。
        recording = record(stream, undefined, undefined, { webmOnly: true });
        // 10ms 只給原生音訊排程留前置；不是量測後硬填的裝置補償，來源零點與片長都不改。
        audioStartedAt = audio.currentTime + 0.01;
        bufferSource?.start(audioStartedAt);
      } else {
        audioDestination.stream.getAudioTracks().forEach(track => { stream.addTrack(track.clone()); });
        recording = record(stream);
      }
      recording.done.catch(error => { if (active?.signal === signal && !signal.aborted) active.abort(error); });
      status('合成中，請保持此頁在前景。取消後仍可重試。');
    }, () => !bufferSource ? NaN : audio.state === 'running' ? Math.max(0, (audio.currentTime - audioStartedAt) * 1000) : Infinity, render);
    blob = await recording.stop();
    diagnostics.export = { ...measured, mime: blob.type, bytes: blob.size, requestedWidth: 1280, requestedHeight: 720, recipe: value, ...(presentation ? { presentation } : {}) };
    const temporary = URL.createObjectURL(blob), validationVideo = document.createElement('video');
    validationVideo.muted = true; validationVideo.playsInline = true;
    // 用獨立元素驗證新檔，取消或壞檔不能破壞上一個成功輸出的播放器。
    try {
      diagnostics.export.decodedDurationMs = await load(validationVideo, temporary, signal);
      // 可播放不代表錄完整；沿原 100ms 覆蓋容差，確認共同片長後才能替換舊 VS 並保存新檔。
      const rawDurationMs = validationVideo.duration * 1000;
      if (!Number.isFinite(rawDurationMs) || Math.abs(rawDurationMs - comparison(value).durationMs) > 100) throw new Error('匯出片長與共同區間不符，未完成合成；原片與前次 VS 保留。');
    }
    finally { validationVideo.removeAttribute('src'); validationVideo.load(); URL.revokeObjectURL(temporary); }
    abortIfNeeded(signal);
    outputBlob = blob; outputAssetId = null; outputRecipe = recipeSignature(value); download('output-download', blob, presentation ? 'dance-overlay' : 'dance-vs');
    $('output-download').textContent = presentation ? '下載疊影影片' : '下載 VS 影片';
    $('output-status').textContent = `這支${$('export-layout').value === 'overlay' ? '疊影' : '左右並排'}影片對應目前的比較設定。`;
    output.pause(); output.src = urls.get('output-download'); output.hidden = false;
    $('share').disabled = false;
    try {
      await persistExport(blob, diagnostics.export.decodedDurationMs, presentation);
      status('VS 影片已成檔並保存在此瀏覽器。請下載，離開本站後重新播放驗證。');
    } catch (caught) { const error = caught instanceof Error ? caught : new Error(String(caught));
      if (storageUnconfirmed()) $('output-status').textContent = 'VS 已成檔可下載；這次保存狀態未確認。';
      status(storageUnconfirmed() ? `VS 已成檔可下載。${storageUnconfirmedMessage}` : `VS 已成檔但無法保存到此瀏覽器：${error.message} 請立即下載；原片仍保留。`);
    }
  } finally {
    reference.pause(); self.pause();
    reference.muted = muted;
    // 取消、背景或原生錯誤立即停聲並放開 PCM，不能等編碼收尾才釋放來源。
    if (bufferSource) { try { bufferSource.stop(); } catch { /* 尚未排程也需斷線。 */ } bufferSource.disconnect(); bufferSource.buffer = null; }
    buffer = null;
    destination?.stream.getTracks().forEach(track => { track.stop(); }); destination?.disconnect();
    if (recording) await recording.stop().catch(() => {});
    stream?.getTracks().forEach(track => { track.stop(); });
    // 共用擷取畫布在成檔後還原左右預覽；否則疊影會留在標示左右的框內。
    draw(value);
  }
}));
$('share').addEventListener('click', async () => {
  if (!outputBlob) return;
  const file = new File([outputBlob], $('output-download').download, { type: outputBlob.type });
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
// BFCache 仍是原模組與原連線；返回上一頁不能解除未確認旗標，必須真正重新導航讀回。
window.addEventListener('pageshow', e => { if (e.persisted) { status('已返回頁面。錄影保持停止，請確認片段後重新開啟相機。'); updateControls(); } });
// 更新與離頁共用草稿判斷，不能讓「立即更新」繞過原本的保存保護。
function hasUnsavedWork() {
  const video = state?.data.videos.find(value => value.id === currentVideoId);
  const metadataDirty = video && /** @type {const} */ ([['title', 'video-title'], ['teacher', 'video-teacher'], ['danceStyle', 'video-style'], ['recordedDate', 'video-date']]).some(([field, id]) => $(id).value !== (video[field] || ''));
  return storageUnconfirmed() || active || beatDirty || moveDirty || metadataDirty || !$('marker-form').hidden || $('import-dialog').open || $('media-dialog').open || $('delete-dialog').open || $('share-dialog').open;
}
window.addEventListener('beforeunload', e => { if (hasUnsavedWork()) { e.preventDefault(); e.returnValue = ''; } });


function currentVideo() { return state.data.videos.find(v => v.id === currentVideoId); }
function requireCurrentVideo() { const video = currentVideo(); if (!video) throw new Error('影片筆記已失聯，請重新開啟。'); return video; }
function beatLabel(grid, sourceMs) {
  const position = beatPosition(grid, sourceMs);
  return position ? `第 ${position.eight} 組八拍 · 第 ${position.beat} 拍` : grid ? '第一拍之前' : '';
}
function renderBeatPosition() {
  const grid = state && currentVideo()?.beatGrid;
  $('beat-position').textContent = grid && referenceDurationMs ? `原片 ${reference.currentTime.toFixed(3)} 秒 · ${beatLabel(grid, reference.currentTime * 1000)}` : '尚未設定拍點或影片未連結；仍可使用秒數與秒倒數。';
}
function resetBeatEditor() {
  const video = state && currentVideo(), grid = video?.beatGrid;
  beatEditorVideoId = currentVideoId; beatDirty = false;
  $('beat-bpm').value = grid ? String(grid.bpm) : ''; $('beat-first').value = grid ? String(grid.firstBeatMs / 1000) : '';
  $('beat-count-in').value = String(grid?.countInBeats || 0);
  $('beat-status').textContent = grid ? `已保存：原速 ${grid.bpm} BPM，第一拍 ${grid.firstBeatMs / 1000} 秒；${grid.countInBeats ? `${grid.countInBeats} 拍提示音倒數` : '使用秒倒數'}。` : '未設定拍點；使用秒數與秒倒數。';
  renderBeatPosition();
}
for (const id of /** @type {const} */ (['beat-bpm', 'beat-first', 'beat-count-in'])) $(id).addEventListener('input', () => {
  beatDirty = true; $('beat-status').textContent = '拍點輸入尚未保存，現有拍點與倒數設定仍保留。';
});
$('beat-set-first').addEventListener('click', () => {
  if (active || !referenceDurationMs) return;
  $('beat-first').value = reference.currentTime.toFixed(3); beatDirty = true; $('beat-status').textContent = '第一拍位置尚未保存。';
});
$('beat-cancel').addEventListener('click', () => { if (!active) resetBeatEditor(); });
for (const id of /** @type {const} */ (['beat-save', 'beat-clear'])) $(id).addEventListener('click', () => operation(async signal => {
  const video = requireCurrentVideo();
  if (beatEditorVideoId !== video.id) throw new Error('拍點草稿不屬於目前影片，請取消編輯後重試。');
  let grid;
  if (id === 'beat-save') {
    if (!$('beat-bpm').value.trim() || !$('beat-first').value.trim()) throw new Error('請填寫 BPM 與第一拍原片秒數；不設定時可取消或移除拍點。');
    const firstMs = Number($('beat-first').value) * 1000;
    if (!Number.isFinite(firstMs) || firstMs < 0 || firstMs >= video.durationMs) throw new Error('第一拍須在原片內，不能是負數或超出片長。');
    grid = validateBeatGrid({ bpm: Number($('beat-bpm').value), firstBeatMs: Math.round(firstMs), countInBeats: Number($('beat-count-in').value) }, video.durationMs);
  }
  // 只提交 metadata；quota、取消或另一分頁衝突時，舊設定與表單草稿都還在。
  await saveData(data => { const row = data.videos.find(v => v.id === video.id); if (grid) row.beatGrid = grid; else delete row.beatGrid; row.revision++; }, undefined, signal);
  resetBeatEditor(); status(grid ? '拍點已保存，影片與比較配方不變。' : '已移除拍點，仍可使用秒數與秒倒數。');
}));
// UI 入口明確傳自己的 signal；不能借用 active，否則停止會連帶取消錄影保全或別次比較佇列。
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
  focusControl($('restore'));
  if (abort) status('已取消匯入，原資料保留。');
}
function invalidateShare() {
  shareDraft = null; $('share-content').textContent = ''; $('share-readable').replaceChildren(); $('share-summary').textContent = '請先預覽，再下載或交給系統分享。';
  $('share-download').disabled = true; $('share-system').hidden = true;
  const url = urls.get('share-notes'); if (url) URL.revokeObjectURL(url); urls.delete('share-notes');
}
function closeShareDialog() {
  const wasOpen = $('share-dialog').open; invalidateShare(); $('share-dialog').close();
  // 取消可能發生在控制仍停用時；沿用共用的延後焦點，且未開分享時不搶焦。
  if (wasOpen) focusControl($('share-notes'));
}
function shareChoice(parent, table, value, text) {
  const label = document.createElement('label'), input = document.createElement('input');
  label.className = 'check-label'; input.type = 'checkbox'; input.value = value; input.dataset.table = table;
  label.append(input, document.createTextNode(text)); parent.append(label);
}
function closeMediaDialog(abort = true) {
  if (!relinkDraft && !$('media-dialog').open) return;
  const opener = relinkDraft?.opener;
  if (abort) active?.abort(); relinkDraft = null;
  const video = $('relink-preview'); video.pause(); video.removeAttribute('src'); video.load();
  const url = urls.get('relink-preview'); if (url) URL.revokeObjectURL(url); urls.delete('relink-preview');
  $('relink-file').value = ''; $('media-dialog').close();
  focusControl(opener || $('refresh-media'));
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
  const focused = $('media-items').contains(document.activeElement) ? document.activeElement : null;
  $('media-items').replaceChildren();
  for (const row of rows) {
    const li = document.createElement('li'); li.dataset.assetId = row.asset.id; li.dataset.availability = row.availability;
    const statusText = row.availability === 'stored' ? '已存瀏覽器副本' : row.availability === 'session' ? '本次已連結，未存瀏覽器副本' : '缺片，需要另選原檔';
    li.append(document.createTextNode(labels[row.asset.kind] + ' · ' + row.owner + ' · ' + statusText + (row.interrupted ? '（錄影／中斷片段，需檢查完整性）' : '') + '。描述大小 ' + (row.asset.byteLength / 1048576).toFixed(2) + ' MiB。 '));
    if (row.availability === 'missing') li.append(button('選片並預覽重連', () => openMediaRelink(row.asset.id, row.owner), `asset:${row.asset.id}:link`));
    else {
      li.append(button('另存影片檔', async () => {
        const original = await getAvailableMedia(row.asset.id); if (!original) throw new Error('原片已不在，請重新檢查清單並選片。');
        // 保留救援下載；無法識別容器時仍可帶走原始 bytes，不改成假的 MP4。
        const blob = await normalizedVideo(original).catch(() => original), link = document.createElement('a');
        link.href = urlFor('inventory:' + row.asset.id, blob); link.download = mediaFilename(blob, 'dance-' + row.asset.kind); link.click();
        status('已交給瀏覽器另存影片；請確認下載完成，JSON 本身不含影片。');
      }, `asset:${row.asset.id}:download`));
      if (row.availability === 'session') li.append(button('保存瀏覽器副本', async signal => {
        const blob = await getAvailableMedia(row.asset.id); if (!blob) throw new Error('原片已不在，請重新連結。');
        if (blob.size > 200 * 1024 * 1024) throw new Error('副本初期限 200 MiB；仍可另存影片檔。');
        await saveData(data => {
          const asset = data.assets.find(a => a.id === row.asset.id); if (!asset) throw new Error('媒體描述已失聯。');
          Object.assign(asset, { byteLength: blob.size, mimeType: linkedMime(asset.mimeType, blob), state: 'ready', storageKind: 'indexeddb' });
        }, { id: row.asset.id, blob }, signal);
        status('已保存副本，仍請另存影片與 JSON。');
      }, `asset:${row.asset.id}:save`));
      if (row.availability === 'stored') li.append(button('移除此瀏覽器副本…', () => showDelete('copy', row.asset.id), `asset:${row.asset.id}:remove`));
    }
    $('media-items').append(li);
  }
  if (focused) focusControl(focused);
}
async function openMediaRelink(assetId, owner) {
  if (await getAvailableMedia(assetId)) { await refreshMediaInventory(); status('這支影片已可用，原比較畫面保留。'); return; }
  const asset = state.data.assets.find(a => a.id === assetId); if (!asset) throw new Error('媒體描述已失聯，原資料保留。');
  releaseCamera(); closeMediaDialog(false);
  relinkDraft = { assetId, revision: state.revision, candidate: null, opener: operationTrigger };
  $('media-title').textContent = ({ reference: '示範', take: '自己原片', vs: 'VS' })[asset.kind] + ' · ' + owner;
  $('relink-file-label').textContent = asset.kind === 'vs' ? '已合成的單一 VS（不取代比較原片）' : '未合成的' + (asset.kind === 'reference' ? '老師原片' : '自己原片') + '（請勿用 VS 代替）';
  $('relink-checked').checked = false; $('relink-save').checked = false; $('relink-file').value = '';
  $('relink-summary').textContent = '請選片並預覽。備份描述 ' + (asset.byteLength / 1048576).toFixed(2) + ' MiB' + (asset.durationMs ? '、' + (asset.durationMs / 1000).toFixed(3) + ' 秒' : '') + '；本期預設只在這次連結。';
  $('media-dialog').showModal(); focusControl($('relink-file'));
}
function button(text, action, focusKey) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
  if (focusKey) el.dataset.focusKey = focusKey;
  el.addEventListener('click', () => operation(action)); return el;
}
function closeDeleteDialog(abort = true) {
  if (!deleteDraft && !$('delete-dialog').open) return;
  const opener = deleteDraft?.opener;
  if (abort) active?.abort(); deleteDraft = null; $('delete-dialog').close();
  focusControl(opener || $('library'));
}
async function showDelete(kind, id) {
  if (keepMarkerDraft()) return;
  const plan = planDeletion(state.data, kind, id), keys = new Set(await readMediaKeys());
  // 新動作刪除也保留開啟來源，確認框結束後才能找回鍵盤焦點。
  deleteDraft = { plan, revision: state.revision, opener: operationTrigger };
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
  // 只在明確刪到這份原片後撤銷救援 URL；取消、無關刪除或一般換片仍須保留。
  if (partialAssetId && plan.kind !== 'copy' && plan.mediaIds.includes(partialAssetId)) {
    const url = urls.get('partial-download'); if (url) URL.revokeObjectURL(url); urls.delete('partial-download');
    $('partial-download').hidden = true; $('partial-download').removeAttribute('href'); partialAssetId = null;
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
  const focused = document.activeElement;
  if (beatEditorVideoId !== currentVideoId) resetBeatEditor();
  renderBeatPosition();

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
    const move = state.data.moves.find(m => m.id === marker.moveId), grid = currentVideo()?.beatGrid;
    text.textContent = `${(marker.startMs / 1000).toFixed(3)}s${marker.endMs === undefined ? '' : `–${(marker.endMs / 1000).toFixed(3)}s`} · ${marker.title}${move ? ` · ${move.name}（${moveStatuses[move.status]}）` : ''}${grid ? ` · ${beatLabel(grid, marker.startMs)}${marker.endMs === undefined ? '' : ` → ${beatLabel(grid, marker.endMs)}`}` : ''}\n${marker.note}`;

    li.append(text);
    const outside = referenceDurationMs > 0 && (marker.endMs ?? marker.startMs) > referenceDurationMs;
    if (outside) text.append(document.createTextNode('（超出目前影片，請編輯修復）'));
    const jump = button('跳到這裡', async signal => {
      if (!referenceDurationMs || (marker.endMs ?? marker.startMs) > referenceDurationMs) throw new Error('請先重連足夠長度的示範，或修復超界標記。');
      await seek(reference, marker.startMs / 1000, signal);
      if (!selfDurationMs && marker.endMs !== undefined) { $('start').value = String(marker.startMs / 1000); $('end').value = String(marker.endMs / 1000); }
      status(marker.endMs === undefined ? '已跳到標記。' : selfDurationMs ? '已跳到標記；已有自拍，錄影片段維持原設定。' : '已跳到標記，並將區間設為下一次練習片段。');
    }, `marker:${marker.id}:jump`);
    jump.disabled = outside;
    li.append(jump, button('編輯', async () => editMarker(marker), `marker:${marker.id}:edit`), button('刪除標記', async signal => {
      if (keepMarkerDraft()) return;
      if (!confirm('確定刪除這個標記？其他筆記與影片不受影響。')) return;
      await saveData(data => { data.markers = data.markers.filter(m => m.id !== marker.id); }, undefined, signal);
    }, `marker:${marker.id}:delete`));
    $('markers').append(li);
  }
  for (const take of state.data.takes.filter(t => t.referenceVideoId === currentVideoId)) {
    const li = document.createElement('li');
    const asset = state.data.assets.find(a => a.id === take.cameraAssetId);
    const mediaState = sessionMedia.has(take.cameraAssetId) && asset?.state !== 'ready' ? 'session-only' : asset?.state;
    const label = take.state === 'failed' ? '未錄成；可重新錄製' : take.state === 'interrupted' ? mediaState === 'ready' ? '中斷片段已保存' : '中斷待恢復' : mediaState === 'missing' ? '原片待重連' : take.state === 'ready' ? mediaState === 'session-only' ? '當次開啟，原片請另存' : '已保存' : '可能錄製中／待恢復';
    li.append(document.createTextNode(`${take.rate}× · ${((take.referenceEndMs - take.referenceStartMs) / take.rate / 1000).toFixed(1)} 秒 · ${label} `));
    li.append(button('開啟自拍／恢復', signal => openTake(take, signal), `take:${take.id}:open`), button('刪除此練習與比較…', () => showDelete('take', take.id), `take:${take.id}:delete`));
    for (const artifact of state.data.exports.filter(e => state.data.recipes.some(r => r.id === e.recipeId && r.takeId === take.id))) {
      const savedRecipe = state.data.recipes.find(r => r.id === artifact.recipeId);
      const name = artifact.presentation ? '疊影' : 'VS';
      li.append(button(artifact.recipeRevision === savedRecipe?.revision ? `下載已存 ${name}` : `下載舊版 ${name}（設定已變更）`, async () => {
        const blob = await getAvailableMedia(artifact.assetId); if (!blob) throw new Error('找不到這個 VS，請用另存的影片或原片重新合成。');
        outputBlob = blob; outputAssetId = artifact.assetId; outputRecipe = undefined; download('output-download', blob, artifact.presentation ? 'dance-overlay' : 'dance-vs');
        $('output-download').textContent = artifact.presentation ? '下載疊影影片' : '下載 VS 影片';
        $('output-status').textContent = `已取回當時保存的${artifact.presentation ? '疊影影片' : 'VS'}；影片對應其原本的比較設定。`;
        output.src = urls.get('output-download'); output.hidden = false; $('share').disabled = false;
        status('已取回保存的 VS，可用下方連結下載。');
      }, `export:${artifact.id}:download`));
      li.append(button('刪除此 VS 輸出…', () => showDelete('export', artifact.id), `export:${artifact.id}:delete`));
    }
    $('takes').append(li);
  }
  if (focused instanceof HTMLElement && focused.dataset.focusKey && !focused.isConnected) focusControl(focused);
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
      if (keepMoveDraft()) return;
      moveEditingId = move.id; $('move-name').value = move.name; $('move-style').value = move.danceStyle; $('move-status').value = move.status; focusControl($('move-name'));
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
function keepMoveDraft() {
  if (!moveDirty) return false;
  // 切換只讀編輯也不能蓋掉輸入；失敗時不清旗標，直到明確保存或取消。
  status('動作欄位尚未保存，請先儲存或取消動作編輯。'); focusControl($('move-name')); return true;
}
$('move-form').addEventListener('input', () => { moveDirty = true; });
$('cancel-move').addEventListener('click', () => { moveEditingId = null; moveDirty = false; $('move-form').reset(); focusControl($('move-name')); });
$('move-form').addEventListener('submit', e => {
  e.preventDefault(); operation(async signal => {
    const name = $('move-name').value.trim(); if (!name) throw new Error('請填寫動作名稱。');
    await saveData(data => {
      const old = data.moves.find(m => m.id === moveEditingId);
      if (moveEditingId && !old) throw new Error('動作已移除，請保留草稿後重新新增。');
      const row = { id: old?.id || crypto.randomUUID(), name, danceStyle: $('move-style').value.trim(), status: /** @type {import('./types').Move['status']} */ ($('move-status').value), revision: (old?.revision || 0) + 1 };
      if (old) Object.assign(old, row); else data.moves.push(row);
    }, undefined, signal);
    moveEditingId = null; moveDirty = false; $('move-form').reset(); status('動作與你選擇的練習狀態已保存。');
  });
});
async function beginTake(value) {
  if (!currentVideoId) throw new Error('請先開啟並連結影片筆記。');
  /** @type {import('./types').Take} */
  const take = { id: crypto.randomUUID(), referenceVideoId: currentVideoId, cameraAssetId: crypto.randomUUID(), referenceStartMs: value.startMs, referenceEndMs: value.endMs, rate: value.rate, state: 'recording', createdAt: new Date().toISOString(), ...(requireCurrentVideo().beatGrid ? { beatGrid: structuredClone(requireCurrentVideo().beatGrid) } : {}) };
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
/** @returns {import('./types').OverlayPresentation} */
function overlayPresentation() {
  const values = overlayLayoutFields.map(([input]) => Number($(input).value) / 100);
  const layer = offset => ({ scale: values[offset], x: values[offset + 1], y: values[offset + 2] });
  return { layout: 'overlay', opacity: Number($('overlay-opacity').value) / 100, reference: layer(0), self: layer(3) };
}
function currentPresentation() { return $('export-layout').value === 'overlay' ? overlayPresentation() : undefined; }
function recipeSignature(value) {
  // 相同時間與原片仍可能輸出不同外觀；調整疊影不能誤標舊片為新結果。
  return JSON.stringify({ referenceVideoId: currentVideoId, selfAssetId: state.data.takes.find(t => t.id === activeTakeId)?.cameraAssetId, ...value, presentation: currentPresentation() });
}
/** @param {import('./types').Comparison} [value] @param {AbortSignal} [signal] */
async function saveCurrentRecipe(value = recipe(), signal) {
  // 預覽／匯出可取消自己的準備交易；changeComparison 不傳 signal，仍由獨立佇列完成保存。
  if (!activeTakeId) return;
  const take = state.data.takes.find(t => t.id === activeTakeId);
  if (!take || take.referenceVideoId !== currentVideoId) throw new Error('比較配對已失聯，請重新開啟。');
  if (take.referenceStartMs !== value.startMs || take.referenceEndMs !== value.endMs || take.rate !== value.rate) {
    let savedTake;
    // take 沒有 revision；另建紀錄才能讓已輸出的影片仍保有原本的時間意義。
    await saveData(data => { savedTake = addComparison(data, value, take.cameraAssetId); }, undefined, signal);
    activeTakeId = savedTake.id; renderLibrary(); return;
  }
  await saveData(data => {
    const row = data.recipes.find(r => r.takeId === activeTakeId);
    if (row.offsetMs !== value.offsetMs || row.referenceMirror !== value.referenceMirror || row.selfMirror !== value.selfMirror) {
      Object.assign(row, { offsetMs: value.offsetMs, referenceMirror: value.referenceMirror, selfMirror: value.selfMirror, revision: row.revision + 1 });
    }
  }, undefined, signal);
}
/** @param {Blob} blob @param {number} durationMs @param {import('./types').OverlayPresentation} [presentation] */
async function persistExport(blob, durationMs, presentation) {
  const row = state.data.recipes.find(r => r.takeId === activeTakeId), assetId = crypto.randomUUID();
  if (!row) throw new Error('找不到比較配方。');
  await saveData(data => {
    data.assets.push({ id: assetId, kind: 'vs', byteLength: blob.size, mimeType: blob.type, durationMs, mediaIncluded: false, state: 'ready', storageKind: 'indexeddb' });
    data.exports.push({ id: crypto.randomUUID(), recipeId: row.id, recipeRevision: row.revision, assetId, mimeType: blob.type, state: 'ready', createdAt: new Date().toISOString(), ...(presentation ? { presentation } : {}) });
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
      status('自拍原片缺少或暫存片段不完整；原有筆記與錄影片段都保留。請用右邊「選擇練習影片」載入另存原片，預覽後確認連結。'); return;
    }
  }
  const durationMs = await loadCandidate(blob, self, 'self', signal, async () => {
    if (!recovered) return;
    // 中斷 MP4 可能只剩檔頭，loadeddata／尺寸仍可成功；真正呈現影格後才能保存並清 chunks。
    if (!self.requestVideoFrameCallback) throw new Error('此瀏覽器無法確認恢復片段的影格；錄影片段與舊原片都保留，請改用受測 Chrome。');
    const waiting = new AbortController(), cancel = () => waiting.abort(signal?.reason);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try { await Promise.all([presentedFrame(self, waiting.signal), self.play()]); }
    finally { self.pause(); waiting.abort(); signal?.removeEventListener('abort', cancel); }
    await seek(self, 0, signal);
  });
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
$('confirm-link').addEventListener('click', () => operation(async signal => {
  if (!pendingLinkId || !referenceDurationMs) throw new Error('請先選取要預覽的示範影片。');
  const linkedId = pendingLinkId;
  if (!state.data.assets.some(a => a.videoId === linkedId && a.kind === 'reference')) await saveData(data => data.assets.push({ id: crypto.randomUUID(), videoId: linkedId, kind: 'reference', byteLength: currentReferenceFile.size, mimeType: currentReferenceFile.type, durationMs: referenceDurationMs, mediaIncluded: false }), undefined, signal);
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
$('save-title').addEventListener('click', () => operation(async signal => {
  const title = $('video-title').value.trim(); if (!title) throw new Error('請填寫影片標題。');
  await saveData(data => {
    const video = data.videos.find(v => v.id === currentVideoId);
    video.title = title; video.revision++;
    for (const [field, element] of /** @type {const} */ ([['teacher', 'video-teacher'], ['danceStyle', 'video-style'], ['recordedDate', 'video-date']])) {
      // 空白表示使用者清除分類；日期不從檔案時間或建立 take 的時間推測。
      const value = $(element).value.trim(); if (value) video[field] = value; else delete video[field];
    }
  }, undefined, signal); status('標題與課程分類已保存。');
}));
function clearMarkerEditor() {
  // 換片不能沿用舊標記 ID，否則存檔會把原筆記移到另一支影片。
  markerEditingId = null; markerVideoId = null; $('marker-form').reset(); $('marker-form').hidden = true;
}
function keepMarkerDraft() {
  if (beatDirty) { status('拍點尚未保存，請先保存或取消拍點編輯。'); return true; }
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
  $('marker-form').hidden = false; focusControl($('marker-title'));
}
$('mark').addEventListener('click', () => {
  // 在點擊事件內先取時間；後續打字、非同步保存或播放進度不能改寫它。
  const clickedMs = Math.round(reference.currentTime * 1000);
  if (!active && referenceDurationMs) editMarker(undefined, clickedMs);
});
$('cancel-marker').addEventListener('click', () => { clearMarkerEditor(); focusControl($('mark')); });
$('marker-form').addEventListener('submit', e => {
  e.preventDefault(); operation(async signal => {
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
    }, undefined, signal);
    clearMarkerEditor(); focusControl($('mark')); status('時間標記已保存；點「跳到這裡」即可回看。');
  });
});
function downloadBackup() {
  $('media-inventory').open = true;
  const data = validateBackup({ ...state.data, exportedAt: new Date().toISOString() });
  // 匯入上限按實際 UTF-8 bytes 計算；額外縮排會讓接近上限的合法筆記無法還原。
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = urlFor('backup', blob); a.download = 'notes.dance-stamp.json'; a.click();
  status(storageUnconfirmed() ? '已交給瀏覽器另存本頁最後確認的筆記；不含未保存的表單草稿或影片。請確認下載完成，並另存原片與 VS。' : '筆記與配方備份已下載，不含影片。請另存示範、自拍與 VS。');
}
// 救援備份只讀記憶體，刻意繞過已封鎖的操作佇列；不把未確認的交易結果合進備份。
$('backup').addEventListener('click', () => { if (storageUnconfirmed()) downloadBackup(); else operation(async () => downloadBackup()); });
$('storage-backup').addEventListener('click', downloadBackup);
$('storage-reopen').addEventListener('click', () => {
  if (confirm('請先確認筆記、原片與 VS 已下載完成。未保存的表單草稿不會自動帶回。要重新開啟同一頁讀回保存結果嗎？')) location.reload();
});
$('share-notes').addEventListener('click', () => operation(async () => {
  if (keepMarkerDraft()) return;
  invalidateShare(); $('share-items').replaceChildren();
  for (const input of $('share-fields').querySelectorAll('input')) input.checked = false;
  const names = videoLabels(state.data.videos);
  for (const video of state.data.videos) {
    const group = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = names.get(video.id) || video.title; group.append(legend);
    shareChoice(group, 'videos', video.id, '只含這份影片筆記的標題與媒體描述（不含全部標記）');
    for (const marker of state.data.markers.filter(m => m.videoId === video.id).sort((a, b) => a.startMs - b.startMs)) shareChoice(group, 'markers', marker.id, `${(marker.startMs / 1000).toFixed(3)} 秒 · ${marker.title}`);
    for (const take of state.data.takes.filter(t => t.referenceVideoId === video.id)) {
      shareChoice(group, 'takes', take.id, `加入練習配方 ${take.referenceStartMs / 1000}–${take.referenceEndMs / 1000} 秒／${take.rate}×（自己原片另傳）`);
      for (const artifact of state.data.exports.filter(e => state.data.recipes.some(r => r.id === e.recipeId && r.takeId === take.id))) shareChoice(group, 'exports', artifact.id, '加入 VS 描述與所需練習配方（VS 檔另傳）');
    }
    $('share-items').append(group);
  }
  $('share-dialog').showModal(); $('share-cancel').focus();
}));
for (const id of /** @type {const} */ (['share-items', 'share-fields'])) $(id).addEventListener('change', invalidateShare);
$('share-preview').addEventListener('click', () => operation(async () => {
  invalidateShare();
  const selected = table => [...$('share-items').querySelectorAll('input:checked')].filter(input => /** @type {HTMLInputElement} */ (input).dataset.table === table).map(input => /** @type {HTMLInputElement} */ (input).value);
  const fields = [...$('share-fields').querySelectorAll('input:checked')].map(input => /** @type {HTMLInputElement} */ (input).value);
  const data = createShare(state.data, { videoIds: selected('videos'), markerIds: selected('markers'), takeIds: selected('takes'), exportIds: selected('exports'), fields });
  const content = JSON.stringify(data, null, 2), file = new File([content], 'shared-notes.dance-stamp.json', { type: 'application/json' });
  // 驗證實際下載的 UTF-8 大小，避免縮排後超限而產生自己也無法匯入的分享檔。
  if (file.size > 10 * 1024 * 1024) throw new Error('分享檔超過 10 MiB，請減少選取的片段或正文。');
  shareDraft = { file, revision: state.revision }; $('share-content').textContent = content;
  const line = text => { const p = document.createElement('p'); p.textContent = text; $('share-readable').append(p); };
  // 人先看得懂實際會傳的文字，再提供完整 JSON；兩份預覽都從同一個已篩選物件產生。
  for (const video of data.videos) {
    line('影片筆記：' + video.title);
    if (video.teacher !== undefined) line('老師：' + video.teacher);
    if (video.danceStyle !== undefined) line('舞風：' + video.danceStyle);
    if (video.recordedDate !== undefined) line('拍攝日期：' + video.recordedDate);
    for (const marker of data.markers.filter(m => m.videoId === video.id)) line(`${marker.startMs / 1000}${marker.endMs === undefined ? '' : '–' + marker.endMs / 1000} 秒 · ${marker.title}\n${fields.includes('note') ? marker.note : '（不含筆記正文）'}`);
  }
  for (const asset of data.assets) if (asset.originalName !== undefined) line('原檔名：' + asset.originalName);
  const allowed = [...$('share-fields').querySelectorAll('label')].filter(label => label.querySelector('input')?.checked).map(label => label.textContent);
  $('share-summary').textContent = `筆記檔預覽：${data.videos.length} 份影片筆記、${data.markers.length} 個標記、${data.takes.length} 份練習、${data.exports.length} 份 VS 描述；${file.size} bytes，不含影片。額外欄位：${allowed.length ? allowed.join('、') : '無'}。`;
  try { $('share-system').hidden = !(typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })); } catch { $('share-system').hidden = true; }
}));
$('share-download').addEventListener('click', () => operation(async () => {
  if (!shareDraft || shareDraft.revision !== state.revision) { invalidateShare(); throw new Error('內容已變更，請重新預覽。'); }
  const a = document.createElement('a'); a.href = urlFor('share-notes', shareDraft.file); a.download = shareDraft.file.name; a.click();
  $('share-summary').textContent = '已交給瀏覽器下載筆記檔；請確認下載完成，再自行傳送。沒有確認對方接收結果。';
}));
$('share-system').addEventListener('click', async () => {
  if (active || shareSending || !shareDraft || shareDraft.revision !== state.revision) return;
  const draft = shareDraft;
  shareSending = true; updateControls();
  try {
    // 必須在明確點按當下交給系統，不能先 await 儲存而失去瀏覽器的使用者啟動資格。
    await navigator.share({ files: [draft.file] });
    if (shareDraft === draft) $('share-summary').textContent = '已交給系統分享；無法確認對方是否下載或匯入。仍可下載此檔。';
  } catch (error) {
    if (shareDraft === draft) $('share-summary').textContent = error instanceof Error && error.name === 'AbortError' ? '已取消系統分享，原資料保留；仍可下載。' : '系統分享未完成，原資料保留；請改用下載筆記檔。';
  } finally { shareSending = false; updateControls(); }
});
$('share-cancel').addEventListener('click', closeShareDialog);
$('share-dialog').addEventListener('cancel', e => { e.preventDefault(); closeShareDialog(); });
$('restore').addEventListener('change', () => operation(async signal => {
  const file = $('restore').files?.[0]; $('restore').value = ''; if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error('備份超過 10 MiB。');
  releaseCamera();
  const revision = state.revision, incoming = parseBackup(await file.text());
  const plan = await planBackupImport(state.data, incoming, signal); signal.throwIfAborted();
  importDraft = { plan, revision };
  $('import-title').textContent = incoming.kind === 'share' ? '匯入分享筆記預覽（重建 ID）' : '還原筆記預覽';
  $('import-content').textContent = JSON.stringify(incoming, null, 2);
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
  renderBeatPosition();
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
reference.addEventListener('timeupdate', renderBeatPosition);
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
  if (storageUnconfirmed()) { showStorageRecovery(); return; }
  if (active || pendingTakeId) return;
  change(); $('scrub').value = '0'; updateIntersection();
  if (!activeTakeId) return;
  let value;
  try { value = recipe(); } catch { return; }
  const version = ++comparisonSaveVersion;
  // blur 先於按鈕 click；保存時若停用按鈕，使用者剛按的播放／匯出就會被吃掉。
  // 以同一佇列保存，媒體操作進來時等待佇列，既不漏點擊也不讓 revision 互撞。
  $('compare').setAttribute('aria-busy', 'true'); updateSourceTimelines(); status('正在保存比較設定…');
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
    updateControls();
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
  startOffline({ offline: $('offline-status'), capacity: $('capacity-status'), persistence: $('persistence-status'), updates: $('update-status'), updateNotice: $('update-notice'), applyUpdate: $('apply-update'),
    // 保存佇列、播放與相機也要結束；已選 File 則由提示明說重載後須重新選取。
    canUpdate: () => !hasUnsavedWork() && !camera && reference.paused && self.paused && !looping && !practiceStarting && !practiceSeek && !document.querySelector('[aria-busy="true"]'),
    refresh: $('check-offline'), persist: $('request-persist'), checkUpdate: $('check-update') }).catch(() => { $('offline-status').textContent = '離線能力暫時無法確認；本機資料保留。'; });
})().catch(error => { $('storage-status').textContent = `本機儲存無法開啟：${error.message} 沒有重置或刪除舊資料。`; throw error; });
ready.catch(() => {}); report();
