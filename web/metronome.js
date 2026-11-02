/* 檔案用途：本機片段分析與可停止的獨立節拍器。所在層：Web 控制器。主要關聯：tempo.js、tempo-worklet.js、metronome.html。 */
import { estimateTempo, tapTempo } from './tempo.js';
/** @template {HTMLElement} T @param {string} id @returns {T} */
const element = id => /** @type {T} */ (document.getElementById(id));
const bpmInput = /** @type {HTMLInputElement} */ (element('bpm'));
const slider = /** @type {HTMLInputElement} */ (element('tempo-slider'));
const meter = /** @type {HTMLSelectElement} */ (element('meter'));
const volume = /** @type {HTMLInputElement} */ (element('volume'));
const source = /** @type {HTMLVideoElement} */ (element('source'));
const analyze = /** @type {HTMLButtonElement} */ (element('analyze'));
const toggle = /** @type {HTMLButtonElement} */ (element('toggle'));
const progress = /** @type {HTMLProgressElement} */ (element('analysis-progress'));
/** @type {AudioContext | undefined} */ let audio;
/** @type {AudioWorkletNode | undefined} */ let capture;
/** @type {MediaElementAudioSourceNode | undefined} */ let mediaSource;
/** @type {string | undefined} */ let sourceUrl;
let bpm = 120, running = false, starting = false, analyzing = false, analysisStarting = false, generation = 0;
/** @type {{generation:number, seek:boolean, rate:boolean} | undefined} */ let ownSourceChanges;
let nextBeat = 0, beat = 0, ticker = 0, animation = 0, deadline = 0, startedAt = 0, playGeneration = 0;
/** @type {number[]} */ let taps = [];
/** @type {{at:number, beat:number}[]} */ let visual = [];
/** @type {Set<OscillatorNode>} */ const tones = new Set();
const say = (id, message) => { element(id).textContent = message; };
function drawDots() {
  element('beat-dots').replaceChildren(...Array.from({ length: Number(meter.value) }, () => document.createElement('span')));
}
drawDots();
/** @param {number} value */
function setTempo(value) {
  if (!Number.isFinite(value) || value < 20 || value > 300) { say('play-status', '請輸入 20–300 BPM。'); return false; }
  bpm = Math.round(value * 10) / 10; bpmInput.value = slider.value = String(bpm);
  // 換速度重新起拍，避免上一個速度已預排的聲音繼續混入。
  if (running) { stop(); void start(); }
  return true;
}
async function context() {
  if (!audio || audio.state === 'closed') audio = new AudioContext();
  await audio.resume(); return audio;
}
function stop(message = '已停止。') {
  playGeneration++; running = false; starting = false; clearInterval(ticker); cancelAnimationFrame(animation); visual = [];
  for (const tone of tones) { try { tone.stop(); } catch { /* 已播放完仍可停止整個節拍器。 */ } tone.disconnect(); } tones.clear();
  toggle.textContent = '開始節拍器'; toggle.setAttribute('aria-pressed', 'false');
  element('pulse').textContent = '—'; for (const dot of element('beat-dots').children) dot.classList.remove('current');
  say('play-status', message);
}
async function start() {
  if (starting || running) return;
  if (!setTempo(Number(bpmInput.value))) return;
  cancelAnalysis(); starting = true; const token = ++playGeneration;
  try {
    const ctx = await context();
    if (token !== playGeneration || !starting || document.hidden) return;
    running = true; starting = false; beat = 0; nextBeat = ctx.currentTime + 0.05;
    toggle.textContent = '停止節拍器'; toggle.setAttribute('aria-pressed', 'true'); say('play-status', `播放中：${bpm} BPM，${meter.value} 拍循環。`);
    const schedule = () => {
      // 背景或主執行緒卡住時不能補打一串過期拍點；音訊時鐘才是排程基準。
      if (ctx.state !== 'running' || ctx.currentTime - nextBeat > 0.15) { stop('播放中斷，請重新開始。'); return; }
      while (nextBeat < ctx.currentTime + 0.1) {
        const tone = ctx.createOscillator(), gain = ctx.createGain(), accent = beat === 0;
        tone.frequency.value = accent ? 1000 : 660;
        const level = Number(volume.value) / 100 * 0.2;
        gain.gain.setValueAtTime(0, nextBeat); gain.gain.linearRampToValueAtTime(level, nextBeat + 0.004); gain.gain.linearRampToValueAtTime(0, nextBeat + 0.045);
        tone.connect(gain).connect(ctx.destination); tones.add(tone);
        tone.onended = () => { tones.delete(tone); tone.disconnect(); gain.disconnect(); };
        tone.start(nextBeat); tone.stop(nextBeat + 0.05); visual.push({ at: nextBeat, beat: beat + 1 });
        nextBeat += 60 / bpm; beat = (beat + 1) % Number(meter.value);
      }
    };
    const paint = () => {
      while (visual.length && visual[0].at <= ctx.currentTime) {
        const item = visual.shift(); if (!item) break;
        element('pulse').textContent = String(item.beat);
        for (const [i, dot] of [...element('beat-dots').children].entries()) dot.classList.toggle('current', i === item.beat - 1);
      }
      if (running) animation = requestAnimationFrame(paint);
    };
    schedule(); if (running) { ticker = window.setInterval(schedule, 25); paint(); }
  } catch { if (token === playGeneration) stop('無法播放提示音，請確認瀏覽器允許聲音後重試。'); }
}
function tap() {
  const now = performance.now(); if (now - (taps.at(-1) ?? 0) > 3000) taps = [];
  taps.push(now); taps = taps.slice(-9);
  const result = tapTempo(taps); if (result) setTempo(result);
  say('tap-status', result ? `${taps.length} 次點拍：約 ${result} BPM。` : `已點 ${taps.length} 次，請保持節奏繼續。`);
}
bpmInput.addEventListener('change', () => setTempo(Number(bpmInput.value)));
slider.addEventListener('input', () => setTempo(Number(slider.value)));
for (const [id, update] of /** @type {[string, (n:number)=>number][]} */ ([['slower', n => Math.max(20, n - 1)], ['faster', n => Math.min(300, n + 1)], ['half', n => n / 2], ['double', n => n * 2]])) element(id).addEventListener('click', () => setTempo(update(bpm)));
element('tap').addEventListener('click', tap);
element('reset-taps').addEventListener('click', () => { taps = []; say('tap-status', '已重設，跟著每一拍點至少 3 次。'); });
toggle.addEventListener('click', () => { if (running || starting) stop(); else void start(); });
meter.addEventListener('change', () => { drawDots(); if (running) { stop(); void start(); } });
document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLAnchorElement || event.target === source) return;
  if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); toggle.click(); }
  if (event.key.toLowerCase() === 't') { event.preventDefault(); tap(); }
});
function cancelAnalysis(message = '已取消分析，可重新選擇位置。') {
  generation++; ownSourceChanges = undefined;
  if (analysisStarting) { source.pause(); say('analysis-status', message); }
  analysisStarting = false;
  if (analyzing) { analyzing = false; capture?.port.postMessage('cancel'); source.pause(); say('analysis-status', message); }
  clearInterval(deadline); progress.hidden = true; element('cancel-analysis').hidden = true; analyze.disabled = !sourceUrl || source.readyState < 1;
}
function result({ id, values }) {
  // 取消後舊訊息可能晚到，不能覆蓋使用者剛開始的新片段。
  if (id !== generation || !analyzing) return;
  analyzing = false; source.pause(); clearInterval(deadline); progress.hidden = true; element('cancel-analysis').hidden = true; analyze.disabled = false;
  const tempo = estimateTempo(values);
  if (!tempo) { say('analysis-status', '這段沒有找到穩定數拍。請選數拍較清楚的位置重試，或播放原聲跟著點拍。'); return; }
  say('analysis-status', `已分析 ${(values.length / 100).toFixed(1)} 秒；${tempo.confidence}。`);
  say('result-text', `建議速度：約 ${tempo.bpm} BPM`); element('result').hidden = false;
  element('candidates').replaceChildren(...[tempo.bpm, ...tempo.candidates].map(value => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `使用 ${value} BPM`;
    button.addEventListener('click', () => { setTempo(value); say('play-status', `已套用 ${value} BPM，可開始節拍器或用半速／倍速校正。`); }); return button;
  }));
}
element('source-file').addEventListener('change', event => {
  cancelAnalysis(); stop(); source.pause(); element('result').hidden = true;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl); sourceUrl = undefined;
  const file = /** @type {HTMLInputElement} */ (event.target).files?.[0];
  source.removeAttribute('src'); source.load(); source.hidden = !file; analyze.disabled = true;
  if (!file) return;
  sourceUrl = URL.createObjectURL(file); source.src = sourceUrl;
  say('analysis-status', '正在開啟本機檔案；載入後請拖到數拍清楚的位置。');
});
source.addEventListener('loadedmetadata', () => { analyze.disabled = false; say('analysis-status', '可先播放找到清楚數拍的位置，再按分析。'); });
source.addEventListener('error', () => { cancelAnalysis(); analyze.disabled = true; say('analysis-status', '瀏覽器無法讀取這個格式。請改選可播放的音訊／影片，或手動點拍。'); });
source.addEventListener('play', () => { if (audio) void audio.resume().catch(() => say('analysis-status', '聲音啟動失敗，請暫停再播放。')); });
source.addEventListener('ended', () => { if (analyzing) capture?.port.postMessage('stop'); });
// 暫停、拖動、變速會破壞取樣時間，不能繼續把片段拼成貌似準確的 BPM。
for (const name of ['seeking', 'ratechange']) source.addEventListener(name, () => {
  // 片尾重播與回原速也會送原生事件；只消耗當次初始化預期的那一個，不放過使用者改段。
  const own = ownSourceChanges?.generation === generation ? ownSourceChanges : undefined;
  if (name === 'seeking' && own?.seek && source.currentTime === 0) { own.seek = false; return; }
  if (name === 'ratechange' && own?.rate && source.playbackRate === 1) { own.rate = false; return; }
  if (analysisStarting || analyzing) cancelAnalysis('位置或速度已改變，請重新分析。');
});
source.addEventListener('pause', () => { if ((analysisStarting || analyzing) && !source.ended) cancelAnalysis('播放已暫停，請重新分析。'); });
analyze.addEventListener('click', async () => {
  if (analysisStarting || analyzing) return;
  stop(); cancelAnalysis(); analysisStarting = true; analyze.disabled = true; element('cancel-analysis').hidden = false; element('result').hidden = true;
  const token = generation;
  try {
    const ctx = await context();
    if (!capture) {
      await ctx.audioWorklet.addModule('/tempo-worklet.js');
      if (token !== generation || document.hidden) return;
      capture = new AudioWorkletNode(ctx, 'tempo-envelope');
      mediaSource = ctx.createMediaElementSource(source); mediaSource.connect(capture).connect(ctx.destination);
      capture.port.onmessage = event => result(event.data);
    }
    if (token !== generation || document.hidden) return;
    ownSourceChanges = { generation: token, seek: source.ended, rate: source.playbackRate !== 1 };
    if (ownSourceChanges.seek) source.currentTime = 0;
    if (ownSourceChanges.rate) source.playbackRate = 1;
    await source.play();
    if (token !== generation) return;
    if (document.hidden) { source.pause(); return; }
    analysisStarting = false; analyzing = true; startedAt = performance.now(); capture.port.postMessage({ type: 'start', id: token });
    progress.value = 0; progress.hidden = false; say('analysis-status', '正在聽目前片段，最多 20 秒；請保持播放，可隨時取消。');
    deadline = window.setInterval(() => { const elapsed = (performance.now() - startedAt) / 1000; progress.value = elapsed; if (elapsed > 28) cancelAnalysis('播放或取樣中斷，請換一段重試。'); }, 100);
  } catch { if (token !== generation) return; cancelAnalysis(); say('analysis-status', '無法分析這個檔案的聲音，請確認可正常播放，或跟著原聲點拍。'); }
});
element('cancel-analysis').addEventListener('click', () => cancelAnalysis());
function leave() { stop('已暫停；回到頁面後可重新開始。'); cancelAnalysis(); source.pause(); void audio?.suspend(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) leave(); });
window.addEventListener('pagehide', event => { leave(); if (event.persisted) return; if (sourceUrl) URL.revokeObjectURL(sourceUrl); capture?.disconnect(); mediaSource?.disconnect(); void audio?.close(); });
