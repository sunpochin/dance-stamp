/* 檔案用途：把本人目標接到逐步準備與收尾。所在層：Web 介面薄接線。主要關聯：preparation.js、main.js、index.html。 */
import { preparationSteps, preparationContexts, preparationRatings, nextPreparation } from './preparation.js';
export function createPreparationUI(deps) {
  /** @param {string} id @returns {HTMLInputElement} */
  const input = id => /** @type {HTMLInputElement} */ (document.getElementById(id));
  const node = id => { const el = document.getElementById(id); if (!el) throw new Error(`缺少準備控制：${id}`); return el; };
  const selection = /** @type {HTMLSelectElement} */ (node('preparation-selection'));
  const markers = /** @type {HTMLSelectElement} */ (node('preparation-marker'));
  const controls = /** @type {HTMLFieldSetElement} */ (node('preparation-controls'));
  let formVideoId;
  let starting = false;
  let selectedId = '', formDirty = false, feedbackDirty = false, loadedId = '';
  const current = () => deps.data()?.preparations.find(p => p.id === selectedId);
  const message = text => { node('preparation-message').textContent = text; deps.status(text); };
  const run = task => deps.operate(async signal => { await task(signal); render(); });
  const focusStep = () => deps.focus(node(current()?.phase === 'preparing' ? 'preparation-step' : 'preparation-watch'));
  function updateControls() { controls.disabled = !deps.data() || deps.busy() || starting; }
  function render() {
    const data = deps.data(); updateControls(); if (!data) return;
    if (!data.preparations.some(p => p.id === selectedId)) selectedId = data.preparations.at(-1)?.id || '';
    selection.replaceChildren(new Option('選擇已保存的準備', ''));
    for (const p of data.preparations) selection.add(new Option(`${p.title} · ${p.phase === 'completed' ? p.danced ? '已確認跟跳' : '這次未跟跳' : '可接續準備'} · ${new Date(p.createdAt).toLocaleString('zh-TW')}`, p.id));
    selection.value = selectedId;
    const oldMarker = markers.value;
    markers.replaceChildren(new Option('手動選起訖', ''));
    for (const m of data.markers.filter(m => m.videoId === deps.currentVideo())) markers.add(new Option(`${m.title || '未命名標記'} · ${m.startMs / 1000}–${m.endMs === undefined ? '需補終點' : m.endMs / 1000} 秒`, m.id));
    markers.value = oldMarker;
    const places = [...new Set(data.preparations.map(p => p.place).filter(Boolean))];
    node('preparation-places').replaceChildren(...places.map(place => new Option(place)));
    const p = current(); node('preparation-saved').hidden = !p;
    if (!p) { /** @type {HTMLDetailsElement} */ (node('preparation-plan')).open = true; return; }
    node('preparation-summary').textContent = `${p.title}：完整目標 ${p.targetStartMs / 1000}–${p.targetEndMs / 1000} 秒；起步 8 拍 ${p.starterStartMs / 1000}–${p.starterEndMs / 1000} 秒。${p.reason}`;
    input('preparation-reminder').value = `為了「${p.reason}」，開始準備「${p.title}」，先跟跳自選 8 拍一次。收到後開 Dance Stamp → 準備練舞。\n${location.origin}${location.pathname}`;
    if (loadedId !== p.id) {
      loadedId = p.id; deps.setSettings(p);
      if (!formDirty) /** @type {HTMLDetailsElement} */ (node('preparation-plan')).open = false;
      input('preparation-context').value = p.context || 'home'; input('preparation-place').value = p.place;
      input('preparation-danced').checked = false; input('preparation-rating').value = ''; input('preparation-note').value = ''; input('preparation-mastery').checked = false;
      feedbackDirty = false;
    }
    node('preparation-context-controls').hidden = p.phase === 'completed';
    node('preparation-step-box').hidden = p.phase !== 'preparing';
    node('preparation-ready').hidden = p.phase !== 'ready';
    if (p.phase === 'preparing') node('preparation-step').textContent = `${preparationContexts[p.context]} · ${p.step + 1}/${preparationSteps[p.context].length}　${preparationSteps[p.context][p.step]}${p.place ? ` · ${p.place}` : ''}`;
    node('preparation-result').textContent = p.phase === 'completed' ? p.danced ? `你已確認這次有跟跳。${preparationRatings[p.rating] || '已略過自評'}。${p.note || ''}${p.mastery ? ' 本人自評：原速完整目標一次，不用一直看示範。' : ' 熟練目標未自評達成；這次跟跳仍保留。'}` : '這次沒有確認跟跳；選段仍保留。' : '';
  }
  function markDirty() { formVideoId ||= deps.currentVideo(); formDirty = true; }
  function setValue(id, ms) { input(id).value = String(ms / 1000); markDirty(); }
  node('preparation-form').addEventListener('input', markDirty);
  node('preparation-feedback').addEventListener('input', () => { feedbackDirty = true; });
  selection.addEventListener('change', () => {
    if (formDirty || feedbackDirty) { selection.value = selectedId; message('請先保存目前表單；草稿仍在。'); return; }
    deps.stop(); selectedId = selection.value; render();
  });
  node('target-current').addEventListener('click', () => {
    if (!deps.duration()) { message('請先選示範影片，再填完整目標。'); return; }
    const range = deps.range(); setValue('target-start', Math.round(range.a * 1000)); setValue('target-end', Math.round(range.b * 1000));
  });
  for (const [button, field] of [['starter-a', 'starter-start'], ['starter-b', 'starter-end']]) node(button).addEventListener('click', () => setValue(field, deps.position()));
  markers.addEventListener('change', () => {
    const m = deps.data().markers.find(m => m.id === markers.value); if (!m) return;
    setValue('target-start', m.startMs); input('target-end').value = m.endMs === undefined ? '' : String(m.endMs / 1000);
    if (!input('preparation-name').value) input('preparation-name').value = m.title;
  });
  node('preparation-form').addEventListener('submit', e => {
    e.preventDefault();
    run(async signal => {
      const videoId = deps.currentVideo(); if (!videoId || !deps.duration()) throw new Error('請先在上方選一支示範影片。');
      if (formVideoId && formVideoId !== videoId) throw new Error('這份目標草稿屬於另一支影片；請取消草稿後重新選段，已保存資料保留。');
      const ms = id => { const value = input(id).value; if (!value.trim()) throw new Error('請填完整目標與起步 8 拍的起訖。'); return Math.round(Number(value) * 1000); };
      const plan = { id: crypto.randomUUID(), videoId, title: input('preparation-name').value.trim(), reason: input('preparation-reason').value.trim(), targetStartMs: ms('target-start'), targetEndMs: ms('target-end'), starterStartMs: ms('starter-start'), starterEndMs: ms('starter-end'), ...deps.settings(), context: '', place: '', step: 0, phase: 'planned', revision: 1, createdAt: new Date().toISOString() };
      if (plan.targetEndMs > deps.duration()) throw new Error('完整目標超出實際原片，請修改選段或重新連結。');
      await deps.save(data => data.preparations.push(plan), signal);
      selectedId = plan.id; formDirty = false; formVideoId = undefined; /** @type {HTMLDetailsElement} */ (node('preparation-plan')).open = false;
      message('目標與起步 8 拍已分別保存。可手動約一次提醒，或現在開始準備。');
    });
  });
  async function update(change, signal) {
    const p = current(); if (!p) throw new Error('請先保存或選取一份準備。');
    await deps.save(data => { const row = data.preparations.find(row => row.id === p.id); change(row); row.revision++; }, signal);
  }
  node('preparation-begin').addEventListener('click', () => run(async signal => {
    const context = input('preparation-context').value, place = input('preparation-place').value.trim();
    await update(row => Object.assign(row, { context, place, step: 0, phase: 'preparing' }), signal);
    render(); focusStep(); message('已保存今天的情境，按眼前步驟繼續；也可隨時改選情境。');
  }));
  for (const id of ['preparation-next', 'preparation-skip']) node(id).addEventListener('click', () => run(async signal => {
    await update(row => { row.step++; row.phase = row.step === preparationSteps[row.context].length ? 'ready' : 'preparing'; }, signal);
    render(); focusStep(); message(current()?.phase === 'ready' ? '準備好了，可先看或直接跟跳。' : '進度已保存；完成眼前這一步再繼續。');
  }));
  for (const id of ['preparation-watch', 'preparation-dance', 'preparation-full']) node(id).addEventListener('click', async () => {
    if (deps.busy() || starting) return;
    const p = current(); if (p?.phase !== 'ready') return;
    starting = true; updateControls();
    try { await deps.play(p, id === 'preparation-full'); }
    catch (error) { message(error instanceof Error ? error.message : '播放失敗；原進度保留，可重試。'); }
    finally { starting = false; updateControls(); }
  });
  node('preparation-feedback').addEventListener('submit', e => {
    e.preventDefault();
    run(async signal => {
      if (current()?.phase !== 'ready') return;
      const danced = input('preparation-danced').checked, rating = input('preparation-rating').value, note = input('preparation-note').value, mastery = input('preparation-mastery').checked;
      if (!danced && (rating || note || mastery)) throw new Error('請先確認「我有跟跳」，或清空自評／心得再以未跟跳收尾；草稿保留。');
      const settings = deps.settings();
      await update(row => Object.assign(row, { phase: 'completed', danced, rating, note, mastery, completedAt: new Date().toISOString(), ...settings }), signal);
      feedbackDirty = false; message(danced ? '已保存你確認的跟跳；是否變熟分開記錄。' : '這次未跟跳，已保留選段。');
    });
  });
  node('preparation-new').addEventListener('click', () => run(async signal => {
    if (formDirty || feedbackDirty) throw new Error('請先保存目前草稿，再開始新一次。');
    const p = current(); if (!p) return;
    const next = nextPreparation(p); await deps.save(data => data.preparations.push(next), signal); selectedId = next.id;
    message('新一次準備尚未開始，請重新選今天的情境。');
  }));
  node('preparation-cancel-plan').addEventListener('click', () => { /** @type {HTMLFormElement} */ (node('preparation-form')).reset(); formDirty = false; formVideoId = undefined; message('已取消新目標草稿，已保存資料保留。'); });
  node('preparation-cancel-feedback').addEventListener('click', () => { /** @type {HTMLFormElement} */ (node('preparation-feedback')).reset(); feedbackDirty = false; message('已清除未保存的回饋，準備進度保留。'); });
  return { render, updateControls, dirty: () => formDirty || feedbackDirty };
}
