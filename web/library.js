/* 檔案用途：本機筆記與 v1 備份的信任邊界。所在層：純資料邏輯。主要關聯：DATA_FORMAT.md、storage.js、main.js。 */
import { validateMarkerRange } from './timeline.js';
export const tables = /** @type {const} */ (['videos', 'assets', 'markers', 'takes', 'recipes', 'exports', 'moves']);
/** @returns {import('./types').Library} */
export function newLibrary() {
  return { format: 'dance-stamp', schemaVersion: 1, kind: 'backup', exportedAt: new Date().toISOString(), sourceLibraryId: crypto.randomUUID(), videos: [], assets: [], markers: [], takes: [], recipes: [], exports: [], moves: [] };
}
function check(ok, message = '備份格式不正確，沒有匯入任何資料。') { if (!ok) throw new Error(message); }
const id = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = (value, limit = 500) => typeof value === 'string' && value.length <= limit;
function rejectDangerous(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    check(!['__proto__', 'constructor', 'prototype'].includes(key));
    rejectDangerous(value[key]);
  }
}
/** @returns {import('./types').Library} */
export function validateBackup(input) {
  check(input && typeof input === 'object');
  rejectDangerous(input);
  check(new Blob([JSON.stringify(input)]).size <= 10 * 1024 * 1024, '筆記資料超過 10 MiB，請先保存備份。');
  check(input.format === 'dance-stamp' && input.schemaVersion === 1 && input.kind === 'backup', '不支援這個備份版本或種類，沒有改動本機資料。');
  check(id(input.sourceLibraryId) && text(input.exportedAt) && Number.isFinite(Date.parse(input.exportedAt)));
  for (const table of tables) check(Array.isArray(input[table]) && input[table].length <= 10_000);
  check(input.moves.length === 0, '此 Web 版本尚不處理動作庫，請保留原備份。');
  const maps = Object.fromEntries(tables.map(table => {
    const map = new Map();
    for (const row of input[table]) { check(row && id(row.id) && !map.has(row.id)); map.set(row.id, row); }
    return [table, map];
  }));
  const out = newLibrary(); out.sourceLibraryId = input.sourceLibraryId; out.exportedAt = input.exportedAt;
  for (const v of input.videos) {
    check(text(v.title) && integer(v.durationMs) && v.durationMs > 0 && integer(v.revision) && v.revision > 0);
    out.videos.push({ id: v.id, title: v.title, durationMs: v.durationMs, revision: v.revision });
  }
  for (const a of input.assets) {
    check(['reference', 'take', 'vs'].includes(a.kind) && integer(a.byteLength) && text(a.mimeType, 200));
    check(a.videoId === undefined || maps.videos.has(a.videoId));
    check(a.durationMs === undefined || (integer(a.durationMs) && a.durationMs > 0));
    out.assets.push({ id: a.id, ...(a.videoId ? { videoId: a.videoId } : {}), kind: a.kind, byteLength: a.byteLength, mimeType: a.mimeType, ...(a.durationMs ? { durationMs: a.durationMs } : {}), mediaIncluded: false });
  }
  for (const m of input.markers) {
    check(maps.videos.has(m.videoId));
    validateMarkerRange(m.startMs, m.endMs, maps.videos.get(m.videoId).durationMs);
    check(text(m.title) && text(m.note, 20_000) && integer(m.revision) && m.revision > 0);
    out.markers.push({ id: m.id, videoId: m.videoId, startMs: m.startMs, ...(m.endMs !== undefined ? { endMs: m.endMs } : {}), title: m.title, note: m.note, revision: m.revision });
  }
  for (const t of input.takes) {
    check(maps.videos.has(t.referenceVideoId) && maps.assets.get(t.cameraAssetId)?.kind === 'take');
    check(integer(t.referenceStartMs) && integer(t.referenceEndMs) && t.referenceEndMs > t.referenceStartMs && t.referenceEndMs <= maps.videos.get(t.referenceVideoId).durationMs);
    check([0.5, 0.75, 1].includes(t.rate) && (t.referenceEndMs - t.referenceStartMs) / t.rate <= 60_000);
    check(['ready', 'interrupted', 'failed', 'recording'].includes(t.state) && text(t.createdAt) && Number.isFinite(Date.parse(t.createdAt)));
    let captureTiming;
    if (t.captureTiming !== undefined) {
      check(t.captureTiming && typeof t.captureTiming === 'object' && integer(t.captureTiming.recorderRequestedMs));
      const timing = t.captureTiming;
      for (const key of ['recorderStartedMs', 'referencePlayResolvedMs', 'referenceAtPlayMs']) check(timing[key] === undefined || integer(timing[key]));
      check(timing.referenceAtPlayMs === undefined || timing.referenceAtPlayMs <= maps.videos.get(t.referenceVideoId).durationMs);
      // 單調時間只供觀測，不推導影格同步；白名單排除裝置與原始錯誤資訊。
      captureTiming = { recorderRequestedMs: timing.recorderRequestedMs, ...Object.fromEntries(['recorderStartedMs', 'referencePlayResolvedMs', 'referenceAtPlayMs'].filter(key => timing[key] !== undefined).map(key => [key, timing[key]])) };
    }
    out.takes.push({ id: t.id, referenceVideoId: t.referenceVideoId, cameraAssetId: t.cameraAssetId, referenceStartMs: t.referenceStartMs, referenceEndMs: t.referenceEndMs, rate: t.rate, state: t.state === 'recording' ? 'interrupted' : t.state, createdAt: t.createdAt, ...(captureTiming ? { captureTiming } : {}) });
  }
  for (const r of input.recipes) {
    check(maps.takes.has(r.takeId) && Number.isSafeInteger(r.offsetMs) && typeof r.referenceMirror === 'boolean' && typeof r.selfMirror === 'boolean');
    check(r.layout === 'side-by-side' && r.audioSource === 'reference' && integer(r.revision) && r.revision > 0);
    out.recipes.push({ id: r.id, takeId: r.takeId, offsetMs: r.offsetMs, referenceMirror: r.referenceMirror, selfMirror: r.selfMirror, layout: r.layout, audioSource: r.audioSource, revision: r.revision });
  }
  for (const e of input.exports) {
    check(maps.recipes.has(e.recipeId) && maps.assets.get(e.assetId)?.kind === 'vs' && integer(e.recipeRevision) && e.recipeRevision > 0);
    check(text(e.mimeType, 200) && ['ready', 'interrupted', 'failed'].includes(e.state) && text(e.createdAt) && Number.isFinite(Date.parse(e.createdAt)));
    out.exports.push({ id: e.id, recipeId: e.recipeId, recipeRevision: e.recipeRevision, assetId: e.assetId, mimeType: e.mimeType, state: e.state, createdAt: e.createdAt });
  }
  // 白名單重新建立物件，絕不把路徑、object URL 或任意外部欄位帶進資料庫。
  return out;
}
export function parseBackup(source) {
  check(new Blob([source]).size <= 10 * 1024 * 1024, '備份超過 10 MiB。');
  let input;
  try { input = JSON.parse(source); } catch { throw new Error('備份不是有效 JSON。'); }
  return validateBackup(input);
}
/** @param {import('./types').Library} local @param {import('./types').Library} incoming */
export function mergeBackup(local, incoming) {
  const next = structuredClone(local);
  const normalizedLocal = validateBackup(local);
  // 以整份來源記錄的對照表保證重匯入冪等；同 ID 衝突直接拒絕，保留全部本機資料。
  for (const table of tables) {
    const existing = new Map(normalizedLocal[table].map(row => /** @type {const} */ ([row.id, row])));
    for (const row of incoming[table]) {
      const old = existing.get(row.id);
      if (old && JSON.stringify(old) !== JSON.stringify(row)) throw new Error('備份與本機有相同 ID 的不同內容；請保留原檔，改用另一個瀏覽器資料夾還原。');
      if (!old) (/** @type {Array<{id: string}>} */ (next[table])).push(row);
    }
  }
  validateBackup(next);
  return next;
}
