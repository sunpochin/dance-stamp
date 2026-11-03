/* 檔案用途：單片自主練習與私人回顧介面。所在層：Web UI。主要關聯：practice-sessions.js、main.js、PRACTICE_SESSIONS.md。 */
import { practiceSegment, sessionHistory, practiceSuggestion, savePracticeSession, chooseNextPractice, assessments } from './practice-sessions.js';
import { captureDuration } from './timeline.js';
import { load } from './recorder.js';

export function createPracticeSessionsUI(api) {
  const node = id => /** @type {HTMLElement} */ (document.getElementById(id));
  const input = id => /** @type {HTMLInputElement} */ (node(id));
  const select = id => /** @type {HTMLSelectElement} */ (node(id));
  const controls = /** @type {HTMLFieldSetElement} */ (node('sessions-controls'));
  const video = /** @type {HTMLVideoElement} */ (node('session-video'));
  /** @type {{ segment: import('./types').PracticeSegment, id: string, startedAt: string, phase: string, rounds: number, takeId?: string } | undefined} */
  let draft;
  let selectedId = '', selectionVideoId, markerId, armed = false, replayUrl, replayOwner, recording = false;

  const rate = () => Number(select('session-rate').value);
  function action(id, task) { node(id).addEventListener('click', () => { task().catch(error => api.status(error.message)); }); }
  async function run(task) {
    let done = false;
    await api.operate(async signal => { await task(signal); done = true; });
    return done;
  }
  function historyButton(label, task) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => { run(task).catch(error => api.status(error.message)); });
    return button;
  }
  function selectSegment(segment) {
    selectedId = segment.id; selectionVideoId = segment.videoId; markerId = segment.markerId;
    input('session-title').value = segment.title; input('session-a').value = String(segment.startMs / 1000); input('session-b').value = String(segment.endMs / 1000);
    select('session-source').value = 'segment:' + segment.id;
    render();
  }
  function candidate() {
    if (!input('session-a').value.trim() || !input('session-b').value.trim()) throw new Error('請填寫 A 與 B；單點標記需要補終點。');
    return practiceSegment(api.data(), { id: crypto.randomUUID(), videoId: selectionVideoId || api.videoId(), title: input('session-title').value.trim(), startMs: Math.round(Number(input('session-a').value) * 1000), endMs: Math.round(Number(input('session-b').value) * 1000), ...(markerId ? { markerId } : {}) });
  }
  async function play() {
    if (!draft || !['observe', 'follow'].includes(draft.phase)) return;
    video.pause();
    await api.play();
    render();
  }
  async function start() {
    if (draft) return;
    const segment = candidate();
    const done = await run(async signal => {
      api.guard();
      await api.openSource(segment.videoId, signal);
      if (api.videoId() !== segment.videoId || !api.duration() || segment.endMs > api.duration()) throw new Error('示範待重連，或目前影片短於 B。請先預覽並人工確認連結，再開始。');
      if (!api.data().segments.some(s => s.id === segment.id)) await api.save(data => { data.segments.push(segment); }, signal);
      // UUID 只在開始成功後建立，觀看／重載沒有寫入跟跳計數。
      draft = { segment, id: crypto.randomUUID(), startedAt: new Date().toISOString(), phase: 'observe', rounds: 0 };
      selectedId = segment.id; selectionVideoId = segment.videoId;
      input('session-followed').checked = false; input('session-next').checked = false; select('session-assessment').value = '';
    });
    render(); if (done) await play();
  }
  function stopReplay() {
    replayOwner?.abort(); replayOwner = null; video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true;
    if (replayUrl) URL.revokeObjectURL(replayUrl); replayUrl = null;
  }
  async function replay(session, index, signal) {
    stopReplay();
    const take = api.data().takes.find(t => t.id === session.takeId);
    if (!take) { node('session-video-status').textContent = `第 ${index + 1} 回沒有錄影；日期與感受仍保留。`; return; }
    const blob = await api.media(take.cameraAssetId); signal.throwIfAborted();
    if (!blob) {
      node('session-video-status').textContent = `第 ${index + 1} 回錄影待重連；請使用這回自己的原片，不會借用其他回。`;
      await api.relink(take.cameraAssetId, `第 ${index + 1} 回自拍`); return;
    }
    replayOwner = new AbortController(); const owner = replayOwner;
    const abort = () => owner.abort(signal.reason); signal.addEventListener('abort', abort, { once: true });
    replayUrl = URL.createObjectURL(blob);
    try {
      await load(video, replayUrl, owner.signal); video.hidden = false;
      node('session-video-status').textContent = `第 ${index + 1} 回 · ${new Date(session.completedAt).toLocaleString()} · ${assessments[session.assessment] || '略過自評'}，按播放回看。`;
      api.focus(video);
    } catch (error) { stopReplay(); throw error; }
    finally { signal.removeEventListener('abort', abort); }
  }
  function renderHistory() {
    const list = node('session-history'); list.replaceChildren();
    const data = api.data(), segment = draft?.segment || data.segments.find(s => s.id === selectedId);
    const history = segment ? sessionHistory(data, segment.id) : [];
    const marker = segment?.markerId && data.markers.find(m => m.id === segment.markerId);
    const changed = segment?.markerId && (!marker || marker.startMs !== segment.startMs || marker.endMs !== segment.endMs);
    node('session-history-hint').textContent = segment ? `${segment.title} · ${segment.startMs / 1000}–${segment.endMs / 1000} 秒 · ${history.length} 回跟跳。${changed ? '來源標記已修改或刪除，這段仍保留原 A/B；要練新範圍請另選段。' : ''}` : '選片段後可依序回看每回的錄影與感受。';
    history.forEach((session, index) => {
      const li = document.createElement('li'), take = data.takes.find(t => t.id === session.takeId);
      const text = document.createElement('p');
      text.textContent = `第 ${index + 1} 回 · ${new Date(session.completedAt).toLocaleString()} · ${session.rate}× · ${assessments[session.assessment] || '略過自評'} · ${take ? '有錄影（可回看／缺片重連）' : '沒有錄影'}`;
      li.append(text, historyButton(`回看第 ${index + 1} 回`, signal => replay(session, index, signal)));
      const assessment = document.createElement('select'); assessment.setAttribute('aria-label', `第 ${index + 1} 回自評`);
      assessment.add(new Option('略過自評', '')); for (const [key, value] of Object.entries(assessments)) assessment.add(new Option(value, key)); assessment.value = session.assessment || '';
      li.append(assessment, historyButton(`更新第 ${index + 1} 回自評`, async signal => {
        await api.save(next => { const row = next.sessions.find(s => s.id === session.id); if (assessment.value) row.assessment = assessment.value; else delete row.assessment; row.revision++; }, signal);
        render();
      }));
      if (session.takeId) li.append(historyButton(`解除第 ${index + 1} 回錄影連結`, async signal => {
        if (!confirm('只解除這回的錄影連結？跟跳日期、自評、原片與既有比較都保留。')) return;
        await api.save(next => { const row = next.sessions.find(s => s.id === session.id); delete row.takeId; row.revision++; }, signal); render();
      }));
      li.append(historyButton(`刪除第 ${index + 1} 回紀錄`, async signal => {
        if (!confirm('只刪除這回的跟跳與自評？已錄原片和既有比較都保留。')) return;
        await api.save(next => { next.sessions = next.sessions.filter(s => s.id !== session.id); }, signal); render();
      }));
      list.append(li);
    });
  }
  function render() {
    const data = api.data(); if (!data) return;
    const source = select('session-source'), previous = source.value;
    source.replaceChildren(new Option('自行圈選目前示範', ''));
    for (const marker of data.markers.filter(m => m.videoId === api.videoId())) source.add(new Option(`標記 · ${marker.title}${marker.endMs === undefined ? '（需補終點）' : ''}`, 'marker:' + marker.id));
    for (const segment of data.segments) source.add(new Option(`${data.videos.find(v => v.id === segment.videoId)?.title} · ${segment.title} · ${segment.startMs / 1000}–${segment.endMs / 1000} 秒`, 'segment:' + segment.id));
    source.value = previous;
    if (!draft && !selectedId && !selectionVideoId && !input('session-a').value) { input('session-a').value = '0'; input('session-b').value = api.duration() ? String(api.duration() / 1000) : ''; }
    const suggestion = practiceSuggestion(data);
    node('session-suggestion').textContent = `${suggestion.reason}${suggestion.segment ? ` ${suggestion.segment.title} · ${suggestion.segment.startMs / 1000}–${suggestion.segment.endMs / 1000} 秒。缺片可先重連。` : ''}`;
    /** @type {HTMLButtonElement} */ (node('session-suggest')).disabled = !suggestion.segment || !!draft;
    for (const element of node('session-selection').querySelectorAll('input, select')) /** @type {HTMLInputElement} */ (element).disabled = !!draft;
    node('session-start').hidden = !!draft;
    node('session-follow').hidden = !draft || !['observe', 'observed'].includes(draft.phase);
    node('session-replay').hidden = !draft || draft.phase === 'review';
    node('session-pause').hidden = !draft || draft.phase === 'review';
    node('session-review').hidden = draft?.phase !== 'follow';
    node('session-exit').hidden = !draft;
    node('session-review-form').hidden = draft?.phase !== 'review';
    node('session-recording').hidden = draft?.phase !== 'follow';
    const stage = !draft ? '只觀察不會增加跟跳回合數。' : draft.phase === 'review' ? '3/3 回顧 · 有跟跳才勾選，可略過自評與錄影。' : draft.phase === 'follow' ? '2/3 跟跳 · 可調速、暫停；跳完後進入回顧。' : `1/3 觀察 · 已完整看 ${draft.rounds}/3 輪。${draft.phase === 'observed' ? '已停回 A，可開始跟跳或再看。' : '暫停或跳轉的半輪不計。'}`;
    node('session-stage').textContent = stage;
    let captureError = '';
    try { if (draft) captureDuration({ ...draft.segment, rate: rate() }); } catch (error) { captureError = error instanceof Error ? error.message : String(error); }
    node('session-record-hint').textContent = captureError ? `選錄需 15–60 秒且速度為 0.5／0.75／1×。${captureError} 可繼續不錄，或自行調速；不會自動改範圍。` : '選錄會開啟相機，不使用麥克風。拒絕或中斷仍能不錄並保存回顧；完成的原片留在裝置。';
    /** @type {HTMLButtonElement} */ (node('session-record')).disabled = !!captureError || recording;
    renderHistory(); busy();
  }
  function busy() { controls.disabled = api.busy(); }
  action('session-notes', async () => api.notes());
  action('session-start', start);
  action('session-suggest', async () => { const suggestion = practiceSuggestion(api.data()); if (!draft && suggestion.segment) { selectSegment(suggestion.segment); await start(); } });
  action('session-follow', async () => { if (draft) { api.stop(); draft.phase = 'follow'; render(); await play(); } });
  action('session-replay', async () => { if (draft?.phase === 'observed') { draft.phase = 'observe'; draft.rounds = 0; } await play(); });
  action('session-pause', async () => { api.stop(); render(); });
  action('session-review', async () => { if (draft?.phase === 'follow') { api.stop(); draft.phase = 'review'; render(); api.focus(input('session-followed')); } });
  action('session-exit', async () => {
    if (!draft || api.busy()) return;
    if (draft.phase !== 'observe' && draft.phase !== 'observed' && !confirm('退出這回？未保存的跟跳與自評不計次，已錄的原片仍保留。')) return;
    api.stop(); draft = undefined; render(); api.settings(); api.focus(node('session-start'));
  });
  action('session-save', async () => {
    if (draft?.phase !== 'review' || !input('session-followed').checked) { api.status('請本人確認「我有跟跳」；只觀察可直接退出。'); return; }
    const current = draft;
    const done = await run(async signal => {
      await api.save(data => {
        const assessment = /** @type {import('./types').PracticeSession['assessment']} */ (select('session-assessment').value || undefined);
        savePracticeSession(data, { id: current.id, segmentId: current.segment.id, startedAt: current.startedAt, completedAt: new Date().toISOString(), rate: rate(), followed: true, revision: 1, ...(assessment ? { assessment } : {}), ...(current.takeId ? { takeId: current.takeId } : {}) });
        if (input('session-next').checked) chooseNextPractice(data, current.segment.id);
      }, signal);
    });
    if (done && draft === current) { draft = undefined; render(); api.settings(); api.status('這回跟跳已保存。想再練時再開始新的一回。'); api.focus(node('session-start')); }
  });
  action('session-record', async () => {
    if (draft?.phase !== 'follow' || recording) return;
    const current = draft; recording = true;
    try {
      await run(async signal => {
        api.stop();
        const take = await api.record(current.segment, rate(), input('session-mirror').checked, signal);
        if (draft === current && take) current.takeId = take.id;
      });
    } finally { recording = false; render(); }
  });
  for (const [id, task] of [['session-skip', data => chooseNextPractice(data, undefined, true)], ['session-auto', data => { data.practiceChoices = []; }]]) action(id, async () => { if (!draft) { await run(signal => api.save(task, signal)); render(); } });
  select('session-source').addEventListener('change', () => {
    if (draft) return;
    const [kind, id] = select('session-source').value.split(':');
    const data = api.data();
    if (kind === 'segment') { const segment = data.segments.find(s => s.id === id); if (segment) selectSegment(segment); return; }
    selectedId = ''; selectionVideoId = api.videoId(); markerId = kind === 'marker' ? id : undefined;
    const marker = data.markers.find(m => m.id === markerId);
    input('session-title').value = marker?.title || '今天想練的片段'; input('session-a').value = String((marker?.startMs || 0) / 1000); input('session-b').value = marker ? marker.endMs === undefined ? '' : String(marker.endMs / 1000) : api.duration() ? String(api.duration() / 1000) : '';
    render();
  });
  for (const id of ['session-title', 'session-a', 'session-b']) input(id).addEventListener('input', () => { selectedId = ''; renderHistory(); });
  select('session-rate').addEventListener('change', () => { if (draft) api.settings(); render(); });
  input('session-mirror').addEventListener('change', () => api.settings());
  window.addEventListener('pagehide', stopReplay);
  return {
    render, busy, canvas: /** @type {HTMLCanvasElement} */ (node('session-canvas')), pauseReplay: () => video.pause(), hasDraft: () => !!draft, rate: () => draft ? rate() : undefined, mirrored: () => !!draft && input('session-mirror').checked,
    range: () => draft && ['observe', 'follow'].includes(draft.phase) ? { a: draft.segment.startMs / 1000, b: draft.segment.endMs / 1000 } : undefined,
    started: () => { armed = true; }, stopped: () => { armed = false; },
    boundary: () => {
      if (draft?.phase !== 'observe' || !armed) return false;
      // 片尾的影格通知與 ended 可同時送達；一輪只消耗一次，回 A 成功才重新計輪。
      armed = false;
      draft.rounds++;
      if (draft.rounds >= 3) { draft.phase = 'observed'; armed = false; render(); return true; }
      render(); return false;
    },
    sourceChanged: () => { if (!draft) { selectedId = ''; selectionVideoId = undefined; markerId = undefined; input('session-a').value = ''; input('session-b').value = ''; select('session-source').value = ''; } },
  };
}
