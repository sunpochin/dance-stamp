/* 檔案用途：自主練習片段、回合與建議的純邏輯。所在層：本機資料。主要關聯：library.js、practice-sessions-ui.js。 */
import { validateMarkerRange } from './timeline.js';
export const assessments = { unfamiliar: '還不熟', smoother: '比上次順', done: '這段先放下' };
/** @param {import('./types').Library} data @param {import('./types').PracticeSegment} candidate */
export function practiceSegment(data, candidate) {
  const video = data.videos.find(v => v.id === candidate.videoId);
  if (!video || !candidate.title.trim() || candidate.endMs === undefined) throw new Error('請填段名與完整 A/B；單點標記需要補終點。');
  validateMarkerRange(candidate.startMs, candidate.endMs, video.durationMs);
  // 同名不同範圍不能混算；Marker 日後改動也不回寫這份快照。
  return data.segments.find(s => s.videoId === candidate.videoId && s.startMs === candidate.startMs && s.endMs === candidate.endMs) || candidate;
}
/** @param {import('./types').Library} data @param {string} segmentId */
export function sessionHistory(data, segmentId) {
  return data.sessions.filter(s => s.segmentId === segmentId).sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || a.id.localeCompare(b.id));
}
/** @param {import('./types').Library} data */
export function practiceSuggestion(data) {
  const choice = [...data.practiceChoices].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id))[0];
  if (choice?.mode === 'skip') return { reason: '已略過建議，可自由選段。' };
  if (choice?.segmentId) return { segment: data.segments.find(s => s.id === choice.segmentId), reason: '你選的下次片段。' };
  const latest = new Map();
  for (const session of [...data.sessions].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || a.id.localeCompare(b.id))) latest.set(session.segmentId, session);
  const next = [...latest.values()].filter(s => s.assessment === 'unfamiliar').sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || b.id.localeCompare(a.id))[0];
  return next ? { segment: data.segments.find(s => s.id === next.segmentId), reason: '這段最新一次自評是「還不熟」。' } : { reason: '選一段現在想練的地方。' };
}
/** @param {import('./types').Library} data @param {import('./types').PracticeSession} session */
export function savePracticeSession(data, session) {
  if (!session.followed) throw new Error('只有本人確認有跟跳才能保存回合。');
  // 回合 ID 在開始時固定；雙擊、寫入重試或重匯不增加另一回。
  if (!data.sessions.some(s => s.id === session.id)) data.sessions.push(structuredClone(session));
}
/** @param {import('./types').Library} data @param {string | undefined} segmentId @param {boolean} [skip] */
export function chooseNextPractice(data, segmentId, skip = false) {
  const previous = data.practiceChoices.find(c => c.id === data.sourceLibraryId);
  data.practiceChoices = data.practiceChoices.filter(c => c.id !== data.sourceLibraryId);
  if (!segmentId && !skip) return;
  data.practiceChoices.push({ id: data.sourceLibraryId, mode: skip ? 'skip' : 'selected', ...(segmentId ? { segmentId } : {}), updatedAt: new Date().toISOString(), revision: (previous?.revision || 0) + 1 });
}
