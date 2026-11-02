/* 用途：旁聽原產品雙片匯出的真實事件與像素；層：合成QA注入；關聯：vs-content.js、serve-vs.ts。 */
import { mark, composite, readSource } from './vs-content.js';
const config = globalThis.__vsQAConfig;
const result = { config, timeOrigin: performance.timeOrigin, userAgent: navigator.userAgent, paints: [], native: [], source: [], audio: [], events: [], errors: [], hardware: [], snapshots: [] };
const stamp = () => ({ now: performance.now(), visible: document.visibilityState, focus: document.hasFocus() });
const field = value => ({ type: typeof value, value: value === undefined ? 'undefined' : typeof value === 'number' && !Number.isFinite(value) ? String(value) : value });
const metadata = value => Object.fromEntries([...new Set([...Object.keys(value), ...Reflect.ownKeys(value).map(String)])].map(key => [key, field(value[key])]));
let phase = 'setup', drawing = null, stream, capturedTrack, direct, nativeId, serial = 0, sealed = false;
const sources = new Map(), audioContexts = new Set();
const fail = (where, error) => result.errors.push({ where, error: String(error), ...stamp() });
const surface = (width, height) => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; };
const small = surface(288, 132), reader = small.getContext('2d', { willReadFrequently: true, alpha: false });
const appendPaint = canvas => {
  const entered = performance.now(), ctx = canvas.getContext('2d');
  mark(ctx, serial++);
  const pixels = composite(reader, canvas);
  result.paints.push({ ...drawing, ...pixels, markEntered: entered, end: performance.now(), audio: [...audioContexts].map(c => ({ time: c.currentTime, state: c.state })) });
};
function finishObserver(reason) {
  if (sealed) return; sealed = true;
  // 旁聽失敗不能蓋掉產品stop回傳，也不能讓後續資源漏收。
  const attempt = (where, action) => { try { action(); } catch (e) { fail(where, e); } };
  if (nativeId !== undefined) attempt('cancel native observer', () => direct.cancelVideoFrameCallback(nativeId));
  for (const [video, state] of sources) { attempt('cancel source observer', () => video.cancelVideoFrameCallback(state.id)); state.canvas.width = 0; }
  sources.clear(); attempt('pause observer', () => direct?.pause()); attempt('detach observer', () => { if (direct) direct.srcObject = null; });
  result.events.push({ kind: 'observer-stopped', reason, directDetached: !direct?.srcObject, ...stamp() });
}
function observeSource(video, side) {
  const canvas = surface(288, 50), ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false }), state = { id: 0, canvas };
  const next = () => { state.id = video.requestVideoFrameCallback((now, meta) => {
    const entered = performance.now();
    try { const code = readSource(ctx, video); result.source.push({ side, code, callbackNow: now, metadata: metadata(meta), entered, png: canvas.toDataURL('image/png'), exited: performance.now(), geometry: (() => { const r = video.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth }; })(), ...stamp() }); }
    catch (e) { fail('source ' + side, e); }
    if (!sealed) next();
  }); };
  sources.set(video, state); next();
}
const forbidden = () => { result.hardware.push(stamp()); return Promise.reject(Error('synthetic-only')); };
if (navigator.mediaDevices) for (const name of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices[name]) navigator.mediaDevices[name] = forbidden;
const fill = CanvasRenderingContext2D.prototype.fillRect;
CanvasRenderingContext2D.prototype.fillRect = function(...args) {
  if (phase === 'export' && this.canvas.id === 'canvas' && args.join(',') === '0,0,1280,720') drawing = { begin: performance.now() };
  return fill.apply(this, args);
};
const capture = HTMLCanvasElement.prototype.captureStream;
HTMLCanvasElement.prototype.captureStream = function(...args) {
  if (phase !== 'export' || this.id !== 'canvas') return capture.apply(this, args);
  // 額外序號只佔標題空白，不覆蓋來源碼；這是有觀察負擔的診斷，並非原樣產品品質案。
  try { appendPaint(this); } catch (e) { fail('capture observation', e); }
  const entered = performance.now(); stream = capture.apply(this, args); capturedTrack = stream.getVideoTracks()[0];
  result.events.push({ kind: 'captureStream', args, entered, exited: performance.now(), ...stamp() });
  try {
  const nativeRequest = capturedTrack.requestFrame;
  // 只旁聽原生已有的方法，缺能力必須留給產品的自動擷取回退。
  if (typeof nativeRequest === 'function') capturedTrack.requestFrame = (...when) => { try { appendPaint(this); } catch (e) { fail('request observation', e); } const before = performance.now(); const value = nativeRequest.apply(capturedTrack, when); result.events.push({ kind: 'requestFrame', id: serial - 1, before, after: performance.now() }); return value; };
  direct = document.createElement('video'); direct.muted = true; direct.playsInline = true;
  direct.style.cssText = 'position:fixed;right:0;top:0;width:160px;height:90px;z-index:9999;background:black'; direct.setAttribute('aria-label', '合成擷取旁聽'); document.body.append(direct);
  direct.srcObject = stream;
  const next = () => { nativeId = direct.requestVideoFrameCallback((now, meta) => {
    const entered = performance.now(), row = { callbackNow: now, metadata: metadata(meta), entered, ...stamp() };
    try { row.pixels = composite(reader, direct); row.png = small.toDataURL('image/png'); }
    catch (e) { row.error = String(e); }
    row.exited = performance.now(); result.native.push(row); if (!sealed) next();
  }); }; next();
  direct.play().then(() => result.events.push({ kind: 'direct-playing', ...stamp() }), e => fail('direct play', e));
  } catch (e) { fail('native sink setup', e); }
  return stream;
};
const stop = MediaStreamTrack.prototype.stop;
MediaStreamTrack.prototype.stop = function(...args) { const value = stop.apply(this, args); if (this === capturedTrack) { result.events.push({ kind: 'product-track-stopped', state: this.readyState, ...stamp() }); finishObserver('product native stop returned'); } return value; };
const create = BaseAudioContext.prototype.createBufferSource;
BaseAudioContext.prototype.createBufferSource = function(...args) {
  const node = create.apply(this, args), clock = this, start = node.start; audioContexts.add(clock);
  node.start = function(...when) { const row = { kind: 'start', args: when, audioBefore: clock.currentTime, rate: node.playbackRate.value, frames: node.buffer?.length, sampleRate: node.buffer?.sampleRate, ...stamp() }; result.audio.push(row); try { const value = start.apply(this, when); row.audioAfter = clock.currentTime; row.returned = performance.now(); return value; } catch (e) { row.error = String(e); throw e; } };
  node.addEventListener('ended', e => result.audio.push({ kind: 'ended', trusted: e.isTrusted, audioTime: clock.currentTime, ...stamp() })); return node;
};
for (const kind of ['visibilitychange', 'pagehide', 'focus', 'blur']) window.addEventListener(kind, e => result.events.push({ kind, trusted: e.isTrusted, ...stamp() }), true);
window.addEventListener('error', e => fail('window', e.message)); window.addEventListener('unhandledrejection', e => fail('rejection', e.reason));
document.addEventListener('click', e => {
  const id = e.target.closest('button')?.id;
  if (!id) return; result.events.push({ kind: 'click', id, trusted: e.isTrusted, ...stamp() });
  if (id === 'export' && phase === 'setup') { phase = 'export'; observeSource(document.getElementById('reference'), 'reference'); observeSource(document.getElementById('self'), 'self'); }
}, true);
async function snapshot() {
  const storage = await import('/storage.js');
  if (document.getElementById('controls').disabled || storage.storageUnconfirmed()) throw Error('busy or storage unconfirmed');
  const library = await storage.readLibrary(), media = [];
  for (const id of await storage.readMediaKeys()) {
    const blob = await storage.readMedia(id), bytes = await blob.arrayBuffer(), sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
    const response = await fetch('/qa/media/' + sha256, { method: 'POST', body: bytes }); if (!response.ok) throw Error('media archive refused');
    media.push({ id, bytes: blob.size, mime: blob.type, sha256 });
  }
  return { library, media, storageUnconfirmed: storage.storageUnconfirmed(), controller: navigator.serviceWorker.controller?.scriptURL ?? null, fields: Object.fromEntries(['start', 'end', 'offset', 'rate'].map(id => [id, document.getElementById(id).value])), diagnostics: document.getElementById('diagnostics').textContent, status: document.getElementById('status').textContent, ...stamp() };
}
const box = document.createElement('div'); box.style.cssText = 'position:fixed;right:0;bottom:0;z-index:9999;background:#fff4bb;color:black;padding:6px';
const button = document.createElement('button'); button.textContent = 'QA 完整收據'; button.id = 'qa-receipt'; const label = document.createElement('span'); box.append(button, label); document.body.append(box);
button.onclick = async e => {
  if (!e.isTrusted) return; button.disabled = true;
  try { result.snapshots.push(await snapshot()); result.audioStates = [...audioContexts].map(c => ({ time: c.currentTime, state: c.state })); result.trackStates = stream?.getTracks().map(t => ({ kind: t.kind, state: t.readyState })); result.finished = stamp(); const response = await fetch('/qa/receipt', { method: 'POST', body: JSON.stringify(result) }); if (!response.ok) throw Error('receipt refused ' + response.status); label.textContent = '完整收據 ' + result.snapshots.length; }
  catch (e) { fail('snapshot', e); label.textContent = String(e); } finally { button.disabled = false; }
};
