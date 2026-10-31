/* 檔案用途：雙側共用的本機框選與可取消人物分析。所在層：畫面控制。主要關聯：follow.js、person-worker.js、main.js。 */
import { validBox, matchPerson, followBox, smoothTrack } from './follow.js';
import { load, seek, extension } from './recorder.js';
import { exportFollow } from './follow-export.js';
import { followMeasurements } from './follow-metrics.js';

/** @typedef {'reference'|'self'} Side */
/** @typedef {{source?:string,track:import('./follow').Track|null,enabled:boolean,revision:number,result?:{url:string,source:string,mirror:boolean,revision:number}}} FollowState */
/** @param {{reference:HTMLVideoElement,self:HTMLVideoElement}} videos
 * @param {{source:(side:Side)=>string|undefined,file:(side:Side)=>Blob|undefined,mirror:(side:Side)=>boolean,focus:(element:HTMLElement)=>void,playbackChanged:()=>void, range:(side:Side)=>number[], busy:()=>boolean, operate:(task:(signal:AbortSignal)=>Promise<void>)=>Promise<void>, changed:()=>void}} options */
export function createFollowUI(videos, options) {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('follow-dialog'));
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('follow-canvas'));
  const context = canvas.getContext('2d');
  const controls = /** @type {HTMLFieldSetElement} */ (document.getElementById('follow-controls'));
  const confirm = /** @type {HTMLButtonElement} */ (document.getElementById('follow-confirm'));
  const message = /** @type {HTMLElement} */ (document.getElementById('follow-message'));
  const metricsEnabled = /** @type {HTMLInputElement} */ (document.getElementById('follow-metrics-enabled'));
  const measurements = followMeasurements();
  let metricsUrl;
  function showMetrics(report) {
    if (!report) return;
    const ms = value => value === null ? '未取得' : `${value.toFixed(3)} ms`;
    const row = (label, stage) => `${label}：${stage.count} 次；平均 ${ms(stage.meanMs)}／P50 ${ms(stage.p50Ms)}／P95 ${ms(stage.p95Ms)}`;
    const lines = [
      `第 ${report.sequence} 輪 · ${report.side === 'reference' ? '老師' : '自己'} · ${{ complete: '分析完成', cancelled: '分析已取消（部分數據）', failed: '分析失敗（部分數據）' }[report.outcome]}`,
      `確認後總分析 ${ms(report.totalAnalysisMs)}；處理 ${report.processedFrames}／${report.plannedFrames} 格，路徑 ${report.trackedFrames} 格；${report.framesPerSecond ?? '—'} 格／秒`,
      `框選前載入 ${ms(report.preparation.loadMs)}；第一次定位 ${ms(report.preparation.firstSeekMs)}（不含手動框選時間）`,
      `Worker 建構 ${ms(report.worker.constructionMs)}／啟動 ${ms(report.worker.startupMs)}；程式載入 ${ms(report.worker.scriptImportMs)}／模型初始化 ${ms(report.worker.modelInitMs)}`,
      row('逐次定位', report.stages.seek), row('擷取影格', report.stages.bitmap), row('模型推論', report.stages.detect), row('Worker 等待（含初始化與推論）', report.stages.roundTrip),
      report.comparison ? `同來源／片段／選框第 ${report.sameInputRun} 次，比上次 ${ms(report.comparison.differenceMs)}。` : '尚無相同來源、片段及選框的完成輪可比較。',
      '各段可能包含或重疊，不能全部相加；再次分析仍建立新 Worker／模型。',
    ];
    document.getElementById('follow-metrics-report')?.replaceChildren(lines.join('\n'));
    const link = /** @type {HTMLAnchorElement} */ (document.getElementById('follow-metrics-download'));
    const previous = metricsUrl;
    metricsUrl = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, reports: measurements.reports }, null, 2)], { type: 'application/json' }));
    link.href = metricsUrl; link.download = 'dance-follow-timing.json'; link.hidden = false;
    if (previous) URL.revokeObjectURL(previous);
  }
  const inputs = /** @type {HTMLInputElement[]} */ ([...dialog.querySelectorAll('input[type=number]')]);
  const sides = /** @type {Side[]} */ (['reference', 'self']);
  /** @type {Record<Side,FollowState>} */
  const states = { reference: { track: null, enabled: false, revision: 0 }, self: { track: null, enabled: false, revision: 0 } };
  /** @type {{side:Side,video:HTMLVideoElement,source:string,start:number,end:number,box:import('./follow').Box,trigger:HTMLElement|null,measuring:boolean,preparation:{loadMs:number,firstSeekMs:number}}|null} */
  let draft = null;
  let analyzing = false, cancelAnalysis = () => {};
  /** @type {{x:number,y:number,id:number}|null} */
  let pointer = null;
  const label = side => side === 'reference' ? '示範影片' : '練習影片';
  const button = side => /** @type {HTMLButtonElement} */ (document.getElementById(`${side}-follow`));
  const toggle = side => /** @type {HTMLInputElement} */ (document.getElementById(`${side}-follow-enabled`));
  const clear = side => /** @type {HTMLButtonElement} */ (document.getElementById(`${side}-follow-clear`));
  const note = side => /** @type {HTMLElement} */ (document.getElementById(`${side}-follow-status`));
  const resultVideo = side => /** @type {HTMLVideoElement} */ (document.getElementById(`${side}-follow-result`));
  const resultStatus = side => /** @type {HTMLElement} */ (document.getElementById(`${side}-follow-result-status`));
  const refresh = side => /** @type {HTMLButtonElement} */ (document.getElementById(`${side}-follow-refresh`));
  const download = side => /** @type {HTMLAnchorElement} */ (document.getElementById(`${side}-follow-download`));
  async function makeResult(side, track, mirror, signal, showProgress) {
    const file = options.file(side); if (!file) throw new Error('找不到這一側的原片，請重新選片。');
    for (const key of sides) videos[key].pause();
    let last = -1;
    return exportFollow(file, track, mirror, signal, fraction => {
      const percent = Math.floor(fraction * 100); if (percent === last) return; last = percent;
      showProgress(`正在製作${side === 'reference' ? '老師' : '自己'}的單側跟隨影片 ${percent}%；約需片段長度，可隨時取消。`);
    });
  }
  function publishResult(side, blob, source, mirror) {
    const state = states[side], previous = state.result?.url, url = URL.createObjectURL(blob), video = resultVideo(side), link = download(side);
    state.result = { url, source, mirror, revision: state.revision };
    video.pause(); video.src = url; video.hidden = false; video.load();
    link.href = url; link.download = `dance-${side}-follow.${extension(blob.type)}`; link.hidden = false;
    // 新檔已獨立驗證才能換掉前次結果；失敗／取消不會執行到這裡。
    if (previous) URL.revokeObjectURL(previous);
  }
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
    draft = null; if (dialog.open) dialog.close(); if (trigger) options.focus(trigger);
  }
  const cancel = () => { if (analyzing) cancelAnalysis(); else closeDraft(); };
  document.getElementById('follow-cancel')?.addEventListener('click', cancel);
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  window.addEventListener('pagehide', event => {
    cancelAnalysis(); closeDraft();
    // 返回同頁的 BFCache 仍需原下載 URL；真正離頁才釋放這份本頁結果。
    for (const side of sides) { resultVideo(side).pause(); if (!event.persisted && states[side].result) URL.revokeObjectURL(states[side].result.url); }
    if (!event.persisted && metricsUrl) URL.revokeObjectURL(metricsUrl);
  });
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
      const trigger = button(side);
      const measuring = metricsEnabled.checked;
      try {
        // 分析播放器不掛在畫面上；等解碼 seeked 即可，不能等待不存在的螢幕呈現通知。
        let began = measuring ? performance.now() : 0;
        await load(video, source, signal); const loadMs = measuring ? performance.now() - began : 0;
        began = measuring ? performance.now() : 0;
        await seek(video, start, signal); const firstSeekMs = measuring ? performance.now() - began : 0;
        draft = { side, video, source, start, end, box: { x: 0.2, y: 0.05, width: 0.6, height: 0.9 }, trigger, measuring, preparation: { loadMs, firstSeekMs } };
        canvas.width = 640; canvas.height = Math.round(640 * video.videoHeight / video.videoWidth);
        dialog.querySelector('h2')?.replaceChildren(`框選${side === 'reference' ? '老師' : '自己'} · ${label(side)}`);
        controls.disabled = false; confirm.disabled = false; message.textContent = `從比較起點 ${start.toFixed(2)} 秒開始，框住完整身體後分析到 ${end.toFixed(2)} 秒，接著自動製作可播放、下載的單側結果。`;
        setBox(draft.box); dialog.showModal(); canvas.focus();
      } catch (error) { video.removeAttribute('src'); video.load(); throw error; }
    }));
    toggle(side).addEventListener('change', () => { states[side].enabled = toggle(side).checked; options.changed(); update(true); });
    clear(side).addEventListener('click', () => { states[side].track = null; states[side].enabled = false; states[side].revision++; options.changed(); update(true); });
    for (const type of ['play', 'pause', 'ended']) resultVideo(side).addEventListener(type, () => {
      if (!resultVideo(side).paused) {
        if (options.busy()) resultVideo(side).pause();
        else { for (const other of sides) { videos[other].pause(); if (other !== side) resultVideo(other).pause(); } }
      }
      options.playbackChanged();
    });
    refresh(side).addEventListener('click', () => options.operate(async signal => {
      const state = states[side], source = options.source(side), track = state.track, mirror = options.mirror(side);
      if (!source || state.source !== source || !track) throw new Error('請先框選這一側並完成分析。');
      const blob = await makeResult(side, track, mirror, signal, text => { resultStatus(side).textContent = text; });
      signal.throwIfAborted(); if (options.source(side) !== source) throw new Error('來源已變更，原結果保留。');
      publishResult(side, blob, source, mirror); options.focus(resultVideo(side));
    }));
  }
  confirm.addEventListener('click', () => options.operate(async parentSignal => {
    if (!draft || analyzing) return;
    const current = draft, controller = new AbortController(), signal = controller.signal;
    const sampleHz = 8, count = Math.ceil((current.end - current.start) * sampleHz);
    const probe = current.measuring ? measurements.start({ side: current.side, source: current.source, start: current.start, end: current.end, box: current.box, sampleHz, plannedFrames: count + 1, preparation: current.preparation }) : null;
    /** @type {'complete'|'cancelled'|'failed'} */
    let outcome = 'failed';
    let trackedFrames = 0;
    const aborted = () => controller.abort(parentSignal.reason);
    parentSignal.addEventListener('abort', aborted, { once: true }); if (parentSignal.aborted) aborted();
    analyzing = true; cancelAnalysis = () => controller.abort(); controls.disabled = true; confirm.disabled = true;
    let worker;
    try {
      if (probe) { probe.workerCreatedNow = performance.now(); probe.workerCreatedAt = performance.timeOrigin + probe.workerCreatedNow; }
      worker = new Worker('/person-worker.js');
      if (probe) probe.workerConstructorMs = performance.now() - probe.workerCreatedNow;
      const detect = async search => {
        signal.throwIfAborted();
        // 只看選框／目標附近，避免團體寬畫面把人物縮得太小而漏偵測；座標再映回完整原片。
        const width = search.width * current.video.videoWidth, height = search.height * current.video.videoHeight;
        const began = probe ? performance.now() : 0;
        const bitmap = await createImageBitmap(current.video, search.x * current.video.videoWidth, search.y * current.video.videoHeight, width, height, { resizeWidth: Math.round(640 * width / Math.max(width, height)), resizeHeight: Math.round(640 * height / Math.max(width, height)) });
        probe?.samples.bitmap.push(performance.now() - began);
        if (signal.aborted) { bitmap.close(); signal.throwIfAborted(); }
        return /** @type {Promise<import('./follow').Box[]>} */ (new Promise((resolve, reject) => {
          const requested = probe ? performance.now() : 0;
          let settled = false;
          const finish = (error, boxes) => { if (settled) return; settled = true; probe?.samples.roundTrip.push(performance.now() - requested); clearTimeout(timer); signal.removeEventListener('abort', abort); worker.onmessage = null; worker.onerror = null; error ? reject(error) : resolve(boxes); };
          const abort = () => finish(signal.reason, null);
          const timer = setTimeout(() => finish(new Error('人物分析逾時，請縮短片段後重試。'), null), 30_000);
          signal.addEventListener('abort', abort, { once: true });
          worker.onmessage = ({ data }) => {
            probe?.recordWorker(data.timing); if (probe && !data.error) probe.processedFrames++;
            finish(data.error ? new Error(data.error) : null, data.boxes?.map(box => ({ x: search.x + box.x * search.width, y: search.y + box.y * search.height, width: box.width * search.width, height: box.height * search.height })));
          };
          worker.onerror = () => finish(new Error('無法啟動本機人物分析，請確認應用資源完整。'), null);
          try { worker.postMessage({ bitmap, measure: !!probe }, [bitmap]); }
          catch (error) { bitmap.close(); finish(error, null); }
        }));
      };
      let first, previous, lastSeen = current.start, held = 0;
      /** @type {import('./follow').Sample[]} */
      const samples = [];
      for (let index = 0; index <= count; index++) {
        const time = Math.min(current.end, current.start + index / sampleHz);
        const began = probe ? performance.now() : 0;
        await seek(current.video, Math.min(time, current.video.duration - 0.02), signal);
        probe?.samples.seek.push(performance.now() - began);
        const search = previous ? validBox({ x: previous.x - previous.width * 0.75, y: previous.y - previous.height * 0.2, width: previous.width * 2.5, height: previous.height * 1.4 }) : current.box;
        const person = matchPerson(await detect(search), previous || current.box);
        if (!person && !first) throw new Error('選框中未找到明確人物，請只框住一個人的完整身體後重試。');
        if (person) { first ||= person; previous = person; lastSeen = time; }
        else { held++; if (time - lastSeen > 0.75) throw new Error(`在 ${time.toFixed(2)} 秒無法確定同一個人，請縮短片段或重新框選。`); }
        samples.push({ time, ...followBox(current.box, first, previous) });
        trackedFrames++;
        message.textContent = `只在本機分析 ${Math.round(index / count * 100)}%（${time.toFixed(2)} 秒）；可隨時取消。`;
      }
      signal.throwIfAborted();
      if (options.source(current.side) !== current.source) throw new Error('來源已更換，請重新框選。');
      const track = { start: current.start, end: current.end, samples: smoothTrack(samples), held }, mirror = options.mirror(current.side);
      // 推論已結束就釋放模型，製作影片不需同時占用另一份 WASM 記憶體。
      worker.terminate(); worker = undefined;
      // 人物分析先結束碼表，之後的即時成片另有進度；編碼取消不能改寫已完成的分析收據。
      showMetrics(probe?.finish('complete', trackedFrames));
      const blob = await makeResult(current.side, track, mirror, signal, text => { message.textContent = text; });
      signal.throwIfAborted(); if (options.source(current.side) !== current.source) throw new Error('來源已變更，請重新框選。');
      // 路徑與可播放影片完整成功後一起交換；取消或製作失敗保留上次整組結果。
      const state = states[current.side]; state.source = current.source; state.track = track; state.enabled = true; state.revision++;
      publishResult(current.side, blob, current.source, mirror);
      closeDraft(); options.changed(); options.focus(resultVideo(current.side));
    } catch (caught) {
      if (signal.aborted) outcome = 'cancelled';
      const error = caught instanceof Error ? caught : new Error(String(caught));
      message.textContent = error.name === 'AbortError' ? '已取消分析，原片與上次成功的追蹤保留；可以調整選框再試。' : `${error.message} 上次成功的追蹤保留。`;
      throw error;
    } finally {
      worker?.terminate(); parentSignal.removeEventListener('abort', aborted); analyzing = false; cancelAnalysis = () => {}; controls.disabled = false; confirm.disabled = false;
      showMetrics(probe?.finish(outcome, trackedFrames));
    }
  }));
  function update(available) {
    for (const side of sides) {
      const state = states[side], source = options.source(side);
      if (state.source !== source) { state.source = source; state.track = null; state.enabled = false; state.revision++; }
      const track = state.track;
      const result = state.result, current = result && track && result.source === source && result.revision === state.revision && result.mirror === options.mirror(side);
      const busy = options.busy(); refresh(side).disabled = !track || state.source !== source || busy;
      refresh(side).classList.toggle('primary', !!track && !!result && !current);
      download(side).textContent = `匯出${result && !current ? '上次' : ''}${side === 'reference' ? '老師' : '自己'}跟隨影片`;
      if (busy) resultVideo(side).pause(); resultVideo(side).controls = !busy;
      resultStatus(side).textContent = !result ? '框選完成後，這裡會顯示可獨立播放與匯出的跟隨影片。' : current ? '這是目前選框與鏡像的單側結果，以原速播放並保留該側原片聲音。請匯出另存；結果只留本頁。' : '這是先前影片或設定的結果，原檔保留。請重新框選，或按「更新跟隨結果」套用目前鏡像，再匯出。';
      button(side).disabled = !available || options.busy(); toggle(side).disabled = !track || options.busy(); clear(side).disabled = !track || options.busy(); toggle(side).checked = state.enabled;
      note(side).textContent = track ? `${state.enabled ? '已開啟跟隨' : '跟隨已暫停'} · ${track.start.toFixed(2)}–${track.end.toFixed(2)} 秒${track.held ? `；${track.held} 個分析點暫用前次位置，請預覽檢查。` : '；請預覽確認全段都跟對人。'} 設定只留本頁，匯出影片會保留裁切。` : '尚未框選，使用完整畫面。';
    }
  }
  return {
    update,
    playing() { return sides.some(side => !resultVideo(side).paused); },
    pauseResults() { for (const side of sides) resultVideo(side).pause(); },
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
