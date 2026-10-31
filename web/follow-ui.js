/* 檔案用途：雙側共用的本機框選與可取消人物分析。所在層：畫面控制。主要關聯：follow.js、person-worker.js、main.js。 */
import { validBox, matchPerson, followBox, smoothTrack } from './follow.js';
import { load, seek } from './recorder.js';

/** @typedef {'reference'|'self'} Side */
/** @typedef {{source?:string,track:import('./follow').Track|null,enabled:boolean,revision:number}} FollowState */
/** @param {{reference:HTMLVideoElement,self:HTMLVideoElement}} videos
 * @param {{source:(side:Side)=>string|undefined, range:(side:Side)=>number[], busy:()=>boolean, operate:(task:(signal:AbortSignal)=>Promise<void>)=>Promise<void>, changed:()=>void}} options */
export function createFollowUI(videos, options) {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('follow-dialog'));
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('follow-canvas'));
  const context = canvas.getContext('2d');
  const controls = /** @type {HTMLFieldSetElement} */ (document.getElementById('follow-controls'));
  const confirm = /** @type {HTMLButtonElement} */ (document.getElementById('follow-confirm'));
  const message = /** @type {HTMLElement} */ (document.getElementById('follow-message'));
  const inputs = /** @type {HTMLInputElement[]} */ ([...dialog.querySelectorAll('input[type=number]')]);
  const sides = /** @type {Side[]} */ (['reference', 'self']);
  /** @type {Record<Side,FollowState>} */
  const states = { reference: { track: null, enabled: false, revision: 0 }, self: { track: null, enabled: false, revision: 0 } };
  /** @type {{side:Side,video:HTMLVideoElement,source:string,start:number,end:number,box:import('./follow').Box,trigger:HTMLElement|null}|null} */
  let draft = null;
  let analyzing = false, cancelAnalysis = () => {};
  /** @type {{x:number,y:number,id:number}|null} */
  let pointer = null;
  const label = side => side === 'reference' ? '示範影片' : '練習影片';
  const button = side => /** @type {HTMLButtonElement} */ (document.getElementById(`${side}-follow`));
  const toggle = side => /** @type {HTMLInputElement} */ (document.getElementById(`${side}-follow-enabled`));
  const clear = side => /** @type {HTMLButtonElement} */ (document.getElementById(`${side}-follow-clear`));
  const note = side => /** @type {HTMLElement} */ (document.getElementById(`${side}-follow-status`));
  function paint() {
    if (!draft || !context) return;
    const { video, box } = draft;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const x = box.x * canvas.width, y = box.y * canvas.height, width = box.width * canvas.width, height = box.height * canvas.height;
    context.fillStyle = '#0008'; context.fillRect(0, 0, canvas.width, y); context.fillRect(0, y + height, canvas.width, canvas.height - y - height);
    context.fillRect(0, y, x, height); context.fillRect(x + width, y, canvas.width - x - width, height);
    context.strokeStyle = '#65e8c2'; context.lineWidth = 3; context.strokeRect(x, y, width, height);
  }
  function setBox(box) {
    if (!draft) return;
    draft.box = validBox(box);
    for (const input of inputs) input.value = String(Math.round(draft.box[input.name] * 1000) / 10);
    paint();
  }
  function closeDraft() {
    const trigger = draft?.trigger;
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
    pointer = null;
    if (draft) { draft.video.pause(); draft.video.removeAttribute('src'); draft.video.load(); }
    draft = null; if (dialog.open) dialog.close(); trigger?.focus();
  }
  const cancel = () => { if (analyzing) cancelAnalysis(); else closeDraft(); };
  document.getElementById('follow-cancel')?.addEventListener('click', cancel);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  window.addEventListener('pagehide', () => { cancelAnalysis(); closeDraft(); });
  for (const input of inputs) input.addEventListener('change', () => {
    if (!draft || analyzing) return;
    try { setBox(Object.fromEntries(inputs.map(item => [item.name, Number(item.value) / 100]))); message.textContent = '框好完整身體，留一點手腳活動空間，再開始分析。'; }
    catch (error) { message.textContent = error instanceof Error ? error.message : '選框範圍不正確。'; setBox(draft.box); }
  });
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  canvas.addEventListener('pointerdown', event => {
    if (!draft || analyzing || event.button !== 0) return;
    pointer = { ...point(event), id: event.pointerId }; canvas.setPointerCapture(event.pointerId); event.preventDefault();
  });
  const move = event => {
    if (!pointer || pointer.id !== event.pointerId || !draft || analyzing) return;
    const next = point(event), width = Math.abs(next.x - pointer.x), height = Math.abs(next.y - pointer.y);
    if (width >= 0.02 && height >= 0.02) setBox({ x: Math.min(pointer.x, next.x), y: Math.min(pointer.y, next.y), width, height });
  };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', event => { move(event); if (pointer?.id === event.pointerId) { canvas.releasePointerCapture(event.pointerId); pointer = null; } });
  canvas.addEventListener('pointercancel', () => { pointer = null; });
  canvas.addEventListener('keydown', event => {
    if (!draft || analyzing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const box = { ...draft.box }, horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key), positive = ['ArrowRight', 'ArrowDown'].includes(event.key);
    const key = event.shiftKey ? horizontal ? 'width' : 'height' : horizontal ? 'x' : 'y';
    box[key] = Math.max(event.shiftKey ? 0.02 : 0, box[key] + (positive ? 0.01 : -0.01)); setBox(box);
  });
  for (const side of sides) {
    button(side).addEventListener('click', () => options.operate(async signal => {
      closeDraft(); const source = options.source(side), [start, end] = options.range(side);
      if (!source) throw new Error('請先選好兩側影片。');
      const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
      const trigger = /** @type {HTMLElement|null} */ (document.activeElement);
      try {
        // 分析播放器不掛在畫面上；等解碼 seeked 即可，不能等待不存在的螢幕呈現通知。
        await load(video, source, signal); await seek(video, start, signal);
        draft = { side, video, source, start, end, box: { x: 0.2, y: 0.05, width: 0.6, height: 0.9 }, trigger };
        canvas.width = 640; canvas.height = Math.round(640 * video.videoHeight / video.videoWidth);
        dialog.querySelector('h2')?.replaceChildren(`框選${side === 'reference' ? '老師' : '自己'} · ${label(side)}`);
        controls.disabled = false; confirm.disabled = false; message.textContent = `從比較起點 ${start.toFixed(2)} 秒開始，拖曳框住完整身體，再分析到 ${end.toFixed(2)} 秒。`;
        setBox(draft.box); dialog.showModal(); canvas.focus();
      } catch (error) { video.removeAttribute('src'); video.load(); throw error; }
    }));
    toggle(side).addEventListener('change', () => { states[side].enabled = toggle(side).checked; options.changed(); update(true); });
    clear(side).addEventListener('click', () => { states[side].track = null; states[side].enabled = false; states[side].revision++; options.changed(); update(true); });
  }
  confirm.addEventListener('click', () => options.operate(async parentSignal => {
    if (!draft || analyzing) return;
    const current = draft, controller = new AbortController(), signal = controller.signal;
    const aborted = () => controller.abort(parentSignal.reason);
    parentSignal.addEventListener('abort', aborted, { once: true }); if (parentSignal.aborted) aborted();
    analyzing = true; cancelAnalysis = () => controller.abort(); controls.disabled = true; confirm.disabled = true;
    let worker;
    try {
      worker = new Worker('/person-worker.js');
      const detect = async search => {
        signal.throwIfAborted();
        // 只看選框／目標附近，避免團體寬畫面把人物縮得太小而漏偵測；座標再映回完整原片。
        const width = search.width * current.video.videoWidth, height = search.height * current.video.videoHeight;
        const bitmap = await createImageBitmap(current.video, search.x * current.video.videoWidth, search.y * current.video.videoHeight, width, height, { resizeWidth: Math.round(640 * width / Math.max(width, height)), resizeHeight: Math.round(640 * height / Math.max(width, height)) });
        if (signal.aborted) { bitmap.close(); signal.throwIfAborted(); }
        return /** @type {Promise<import('./follow').Box[]>} */ (new Promise((resolve, reject) => {
          const finish = (error, boxes) => { clearTimeout(timer); signal.removeEventListener('abort', abort); worker.onmessage = null; worker.onerror = null; error ? reject(error) : resolve(boxes); };
          const abort = () => finish(signal.reason, null);
          const timer = setTimeout(() => finish(new Error('人物分析逾時，請縮短片段後重試。'), null), 30_000);
          signal.addEventListener('abort', abort, { once: true });
          worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.boxes?.map(box => ({ x: search.x + box.x * search.width, y: search.y + box.y * search.height, width: box.width * search.width, height: box.height * search.height })));
          worker.onerror = () => finish(new Error('無法啟動本機人物分析，請確認應用資源完整。'), null);
          try { worker.postMessage({ bitmap }, [bitmap]); }
          catch (error) { bitmap.close(); finish(error, null); }
        }));
      };
      let first, previous, lastSeen = current.start, held = 0;
      /** @type {import('./follow').Sample[]} */
      const samples = [];
      const count = Math.ceil((current.end - current.start) * 8);
      for (let index = 0; index <= count; index++) {
        const time = Math.min(current.end, current.start + index / 8);
        await seek(current.video, Math.min(time, current.video.duration - 0.02), signal);
        const search = previous ? validBox({ x: previous.x - previous.width * 0.75, y: previous.y - previous.height * 0.2, width: previous.width * 2.5, height: previous.height * 1.4 }) : current.box;
        const person = matchPerson(await detect(search), previous || current.box);
        if (!person && !first) throw new Error('選框中未找到明確人物，請只框住一個人的完整身體後重試。');
        if (person) { first ||= person; previous = person; lastSeen = time; }
        else { held++; if (time - lastSeen > 0.75) throw new Error(`在 ${time.toFixed(2)} 秒無法確定同一個人，請縮短片段或重新框選。`); }
        samples.push({ time, ...followBox(current.box, first, previous) });
        message.textContent = `只在本機分析 ${Math.round(index / count * 100)}%（${time.toFixed(2)} 秒）；可隨時取消。`;
      }
      signal.throwIfAborted();
      if (options.source(current.side) !== current.source) throw new Error('來源已更換，請重新框選。');
      // 完整成功才交換路徑；取消、偵測失敗或 Worker 錯誤都保留上次成功的設定。
      const state = states[current.side]; state.source = current.source; state.track = { start: current.start, end: current.end, samples: smoothTrack(samples), held }; state.enabled = true; state.revision++;
      closeDraft(); options.changed();
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      message.textContent = error.name === 'AbortError' ? '已取消分析，原片與上次成功的追蹤保留；可以調整選框再試。' : `${error.message} 上次成功的追蹤保留。`;
      throw error;
    } finally {
      worker?.terminate(); parentSignal.removeEventListener('abort', aborted); analyzing = false; cancelAnalysis = () => {}; controls.disabled = false; confirm.disabled = false;
    }
  }));
  function update(available) {
    for (const side of sides) {
      const state = states[side], source = options.source(side);
      if (state.source !== source) { state.source = source; state.track = null; state.enabled = false; state.revision++; }
      const track = state.track;
      button(side).disabled = !available || options.busy(); toggle(side).disabled = !track || options.busy(); clear(side).disabled = !track || options.busy(); toggle(side).checked = state.enabled;
      note(side).textContent = track ? `${state.enabled ? '已開啟跟隨' : '跟隨已暫停'} · ${track.start.toFixed(2)}–${track.end.toFixed(2)} 秒${track.held ? `；${track.held} 個分析點暫用前次位置，請預覽檢查。` : '；請預覽確認全段都跟對人。'} 設定只留本頁，匯出影片會保留裁切。` : '尚未框選，使用完整畫面。';
    }
  }
  return {
    update,
    /** @param {Side} side */
    track(side) { const state = states[side]; return state.enabled && state.source === options.source(side) && videos[side].getAttribute('src') === state.source ? state.track : null; },
    signature() { return sides.map(side => [states[side].enabled, states[side].revision]); },
    assertCoverage() {
      for (const side of sides) {
        const state = states[side]; if (!state.enabled || !state.track || state.source !== options.source(side)) continue;
        const [start, end] = options.range(side);
        if (start < state.track.start - 0.001 || end > state.track.end + 0.001) throw new Error(`${label(side)}的比較區間超出已分析範圍，請重新框選分析，或關閉該側跟隨。`);
      }
    },
  };
}
