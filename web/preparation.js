/* 檔案用途：準備清單、本人選段與回報的資料邊界。所在層：純邏輯。主要關聯：library.js、preparation-ui.js、PRACTICE_SESSIONS.md。 */
export const preparationSteps = {
  home: ['留出可活動空間', '換裝／穿鞋', '開啟所選片段'],
  out: ['選練習地點', '換裝／帶用品', '出門', '到場準備', '開啟所選片段'],
  venue: ['確認可練空間', '換裝／穿鞋', '開啟所選片段'],
};
export const preparationContexts = { home: '在住處練', out: '準備外出練', venue: '已到練習地點' };
export const preparationRatings = { better: '比上次順', same: '差不多', stuck: '還卡住' };
/** @returns {import('./types').Preparation} */
export function validatePreparation(p, durationMs) {
  const check = ok => { if (!ok) throw new Error('準備資料不完整或選段越界；原資料保留。'); };
  const text = (value, max) => typeof value === 'string' && value.length <= max;
  check(p && Number.isSafeInteger(durationMs) && durationMs > 0);
  check(text(p.title, 500) && p.title.trim() && text(p.reason, 2000) && text(p.place, 200));
  check([p.targetStartMs, p.targetEndMs, p.starterStartMs, p.starterEndMs].every(v => Number.isSafeInteger(v) && v >= 0));
  check(p.targetStartMs < p.targetEndMs && p.targetEndMs <= durationMs && p.starterStartMs >= p.targetStartMs && p.starterStartMs < p.starterEndMs && p.starterEndMs <= p.targetEndMs);
  check([0.5, 0.75, 1, 1.25, 1.5, 2].includes(p.rate) && typeof p.mirror === 'boolean');
  check(['planned', 'preparing', 'ready', 'completed'].includes(p.phase) && (p.context === '' || Object.hasOwn(preparationSteps, p.context)));
  const count = p.context ? preparationSteps[p.context].length : 0;
  check(Number.isSafeInteger(p.step) && p.step >= 0 && p.step <= count && (p.phase === 'planned' || !!p.context));
  check(p.phase !== 'planned' || (p.context === '' && p.step === 0));
  check(p.phase !== 'preparing' || p.step < count);
  check(!['ready', 'completed'].includes(p.phase) || p.step === count);
  check(Number.isSafeInteger(p.revision) && p.revision > 0 && text(p.createdAt, 100) && Number.isFinite(Date.parse(p.createdAt)));
  const out = { id: p.id, videoId: p.videoId, title: p.title, reason: p.reason, targetStartMs: p.targetStartMs, targetEndMs: p.targetEndMs, starterStartMs: p.starterStartMs, starterEndMs: p.starterEndMs, rate: p.rate, mirror: p.mirror, context: p.context, place: p.place, step: p.step, phase: p.phase, revision: p.revision, createdAt: p.createdAt };
  if (p.phase === 'completed') {
    check(typeof p.danced === 'boolean' && (p.rating === '' || Object.hasOwn(preparationRatings, p.rating)) && text(p.note, 2000) && typeof p.mastery === 'boolean');
    check(text(p.completedAt, 100) && Number.isFinite(Date.parse(p.completedAt)) && Date.parse(p.completedAt) >= Date.parse(p.createdAt));
    // 沒有本人確認，不保存自評為跟跳證據；熟練也是獨立的本人判斷。
    check(p.danced || (!p.rating && !p.note && !p.mastery));
    Object.assign(out, { danced: p.danced, rating: p.rating, note: p.note, mastery: p.mastery, completedAt: p.completedAt });
  } else check(['danced', 'rating', 'note', 'mastery', 'completedAt'].every(k => p[k] === undefined));
  return out;
}
/** @param {import('./types').Preparation} source @returns {import('./types').Preparation} */
export function nextPreparation(source) {
  // 新一次只沿用選段與地點，不把上次穿好鞋或本人回報當成本次已完成。
  const { danced: _d, rating: _r, note: _n, mastery: _m, completedAt: _c, ...plan } = source;
  return { ...plan, id: crypto.randomUUID(), createdAt: new Date().toISOString(), revision: 1, context: '', step: 0, phase: 'planned' };
}
