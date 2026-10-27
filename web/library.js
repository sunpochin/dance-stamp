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
  incoming = validateBackup(incoming);
  const next = structuredClone(local);
  const normalizedLocal = validateBackup(local);
  // 以整份來源記錄的對照表保證重匯入冪等；同 ID 衝突直接拒絕，保留全部本機資料。
  for (const table of tables) {
    const existing = new Map(normalizedLocal[table].map(row => /** @type {const} */ ([row.id, row])));
    for (const row of incoming[table]) {
      const old = existing.get(row.id);
      if (old && JSON.stringify(old) !== JSON.stringify(row)) throw new Error('備份與本機有相同 ID 的不同內容；請保留原檔，改用另一個瀏覽器資料夾還原。');
      if (!old) (/** @type {Array<{id: string, state?: string, storageKind?: string}>} */ (next[table])).push(table === 'assets' ? { ...row, state: 'missing', storageKind: 'external' } : row);
    }
  }
  validateBackup(next);
  return next;
}

// 同一份關聯表用於依賴閉包與 ID 重寫，避免副本把 take／輸出連到本機另一支影片。
const backupRelations = { videos: {}, assets: { videoId: 'videos' }, markers: { videoId: 'videos' }, takes: { referenceVideoId: 'videos', cameraAssetId: 'assets' }, recipes: { takeId: 'takes' }, exports: { recipeId: 'recipes', assetId: 'assets' }, moves: {} };
const rowKey = (table, id) => table + ':' + id;
const canonical = row => JSON.stringify(row);
function rewriteBackupRow(row, table, ids) {
  const next = { ...row, id: ids[table].get(row.id) || row.id };
  for (const [field, parent] of Object.entries(backupRelations[table])) if (row[field] !== undefined) next[field] = ids[parent].get(row[field]) || row[field];
  return next;
}
async function backupUUID(value, signal) {
  signal?.throwIfAborted();
  if (!crypto.subtle) throw new Error('安全匯入副本需要受信任的 HTTPS 或本機預覽；原資料保留。');
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))).slice(0, 16);
  signal?.throwIfAborted();
  // 只對筆記描述建立可重現的 UUIDv8，不讀影片內容，也不把 hash 當身分或授權證明。
  bytes[6] = (bytes[6] & 15) | 128; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
/** @param {import('./types').Library} local @param {import('./types').Library} source @param {AbortSignal} [signal] */
export async function planBackupImport(local, source, signal) {
  const existingData = validateBackup(local), incoming = validateBackup(source);
  const empty = tables.every(table => local[table].length === 0), foreign = !empty && local.sourceLibraryId !== incoming.sourceLibraryId;
  const ids = Object.fromEntries(tables.map(table => [table, new Map()]));
  if (foreign) {
    for (const table of tables) for (const row of incoming[table]) ids[table].set(row.id, await backupUUID(['dance-stamp-import-v1', incoming.sourceLibraryId, table, row.id], signal));
    for (const table of tables) for (const row of incoming[table]) Object.assign(row, rewriteBackupRow(row, table, ids));
  }
  const existing = Object.fromEntries(tables.map(table => [table, new Map(existingData[table].map(row => /** @type {const} */ ([row.id, row])))]));
  const conflicts = [];
  const forks = new Set();
  for (const table of tables) for (const row of incoming[table]) {
    const old = existing[table].get(row.id);
    if (old && canonical(old) !== canonical(row)) { conflicts.push({ table, id: row.id }); forks.add(rowKey(table, row.id)); }
  }
  // 示範媒體變更也要分開筆記主體，否則同一 video 會出現兩個不同的 reference。
  let changed = true;
  while (changed) {
    changed = false;
    const fork = (table, id) => { const key = rowKey(table, id); if (!forks.has(key)) { forks.add(key); changed = true; } };
    for (const asset of incoming.assets) if (asset.kind === 'reference' && asset.videoId && forks.has(rowKey('assets', asset.id))) fork('videos', asset.videoId);
    for (const artifact of incoming.exports) if (forks.has(rowKey('exports', artifact.id))) fork('assets', artifact.assetId);
    for (const table of tables) for (const row of incoming[table]) {
      if (Object.entries(backupRelations[table]).some(([field, parent]) => row[field] !== undefined && forks.has(rowKey(parent, row[field])))) fork(table, row.id);
    }
  }
  const referenceGroups = new Map();
  for (const asset of incoming.assets) if (asset.kind === 'reference' && asset.videoId) {
    const group = referenceGroups.get(asset.videoId) || []; group.push(asset); referenceGroups.set(asset.videoId, group);
  }
  for (const group of referenceGroups.values()) group.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const records = Object.fromEntries(tables.map(table => [table, new Map(incoming[table].map(row => /** @type {const} */ ([row.id, row])))]));
  const exportGroups = new Map(), videoSignatures = new Map();
  for (const artifact of incoming.exports) { const group = exportGroups.get(artifact.assetId) || []; group.push(artifact); exportGroups.set(artifact.assetId, group); }
  for (const group of exportGroups.values()) group.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const videoSignature = id => {
    // 共用的示範描述只 hash 一次，避免大型備份中每個輸出重複序列化整份來源。
    if (!videoSignatures.has(id)) videoSignatures.set(id, backupUUID(['dance-stamp-origin-v1', records.videos.get(id), referenceGroups.get(id) || []], signal));
    return videoSignatures.get(id);
  };
  const copies = Object.fromEntries(tables.map(table => [table, new Map()]));
  for (const table of tables) {
    const reserved = new Set(incoming[table].map(row => row.id));
    for (const row of incoming[table]) {
      if (!forks.has(rowKey(table, row.id))) continue;
      const rewritten = rewriteBackupRow(row, table, copies);
      let referenceFingerprint = table === 'videos' ? await videoSignature(row.id) : [];
      if (table === 'assets' && 'kind' in row && row.kind === 'vs') {
        const origins = [];
        // 複製配方不能誤取本機舊 VS；描述含來源版本，沒有複製影片 bytes。
        for (const artifact of exportGroups.get(row.id) || []) {
          const recipe = records.recipes.get(artifact.recipeId), take = records.takes.get(recipe.takeId);
          origins.push([artifact, recipe, take, await videoSignature(take.referenceVideoId), records.assets.get(take.cameraAssetId)]);
        }
        referenceFingerprint = origins;
      }
      let assigned = false;
      // 已匯入的副本若再被編輯，尋找下一個穩定 ID；原件及編輯版都不能覆寫。
      for (let counter = 0; counter <= existing[table].size + incoming[table].length; counter++) {
        const id = await backupUUID(['dance-stamp-copy-v1', incoming.sourceLibraryId, table, rewritten, referenceFingerprint, counter], signal);
        if (reserved.has(id)) continue;
        const old = existing[table].get(id);
        if (old && canonical(old) !== canonical({ ...rewritten, id })) continue;
        copies[table].set(row.id, id); reserved.add(id); assigned = true; break;
      }
      if (!assigned) throw new Error('無法安全配置副本 ID；原資料保留，沒有匯入。');
    }
  }
  for (const table of tables) for (const row of incoming[table]) Object.assign(row, rewriteBackupRow(row, table, copies));
  const additions = Object.fromEntries(tables.map(table => [table, incoming[table].filter(row => !existing[table].has(row.id)).length]));
  const added = Object.values(additions).reduce((sum, count) => sum + count, 0);
  const data = mergeBackup(local, incoming);
  if (empty) data.sourceLibraryId = incoming.sourceLibraryId;
  signal?.throwIfAborted();
  return { data, additions, added, conflicts, copied: forks.size, differentSource: foreign, skipped: tables.reduce((sum, table) => sum + incoming[table].length, 0) - added };
}

/** @param {import('./types').Video[]} videos */
export function videoLabels(videos) {
  const counts = new Map(), seen = new Map();
  for (const video of videos) counts.set(video.title, (counts.get(video.title) || 0) + 1);
  return new Map(videos.map(video => {
    const index = (seen.get(video.title) || 0) + 1; seen.set(video.title, index);
    return [video.id, counts.get(video.title) > 1 ? video.title + '（第' + index + '份）' : video.title];
  }));
}

/** @param {import('./types').Library} local @param {'copy'|'take'|'export'|'video'} kind @param {string} id */
export function planDeletion(local, kind, id) {
  validateBackup(local);
  const data = structuredClone(local), candidates = new Set(), locks = new Set();
  const table = ({ copy: 'assets', take: 'takes', export: 'exports', video: 'videos' })[kind];
  if (!table || !data[table].some(row => row.id === id)) throw new Error('找不到要移除的資料；原資料保留。');
  if (kind === 'copy') {
    const asset = data.assets.find(a => a.id === id);
    if (!asset) throw new Error('媒體描述已失聯；原資料保留。');
    Object.assign(asset, { state: 'missing', storageKind: 'external', mediaIncluded: false });
    data.takes.filter(t => t.cameraAssetId === id || asset.videoId === t.referenceVideoId).forEach(t => { locks.add(t.id); });
  } else {
    const removedTakes = new Set(data.takes.filter(t => kind === 'take' ? t.id === id : kind === 'video' && t.referenceVideoId === id).map(t => t.id));
    const removedRecipes = new Set(data.recipes.filter(r => removedTakes.has(r.takeId)).map(r => r.id));
    for (const t of data.takes) if (removedTakes.has(t.id)) { candidates.add(t.cameraAssetId); locks.add(t.id); }
    for (const a of data.exports) if ((kind === 'export' && a.id === id) || removedRecipes.has(a.recipeId)) candidates.add(a.assetId);
    data.exports = data.exports.filter(a => !(kind === 'export' && a.id === id) && !removedRecipes.has(a.recipeId));
    data.recipes = data.recipes.filter(r => !removedRecipes.has(r.id));
    data.takes = data.takes.filter(t => !removedTakes.has(t.id));
    if (kind === 'video') {
      data.assets.filter(a => a.videoId === id).forEach(a => { candidates.add(a.id); });
      data.videos = data.videos.filter(v => v.id !== id); data.markers = data.markers.filter(m => m.videoId !== id);
    }
    // 多個配方可共用原片；只刪失去所有關聯的媒體，不能順手清掉其他 take 的副本。
    const videos = new Set(data.videos.map(v => v.id));
    const used = new Set([...data.takes.map(t => t.cameraAssetId), ...data.exports.map(a => a.assetId), ...data.assets.filter(a => a.videoId && videos.has(a.videoId)).map(a => a.id)]);
    data.assets = data.assets.filter(a => !candidates.has(a.id) || used.has(a.id));
  }
  validateBackup(data);
  const assets = new Set(data.assets.map(a => a.id)), takes = new Set(data.takes.map(t => t.id));
  const mediaIds = kind === 'copy' ? [id] : local.assets.filter(a => !assets.has(a.id)).map(a => a.id);
  const takeIds = local.takes.filter(t => !takes.has(t.id)).map(t => t.id);
  // chunks 以相機 asset ID 為 key，不是 take ID；共用原片仍被引用時不得清理其分段。
  const chunkIds = kind === 'copy' ? [] : local.assets.filter(a => a.kind === 'take' && !assets.has(a.id)).map(a => a.id);
  const counts = Object.fromEntries(['videos', 'markers', 'takes', 'recipes', 'exports'].map(name => [name, local[name].length - data[name].length]));
  return { data, mediaIds, takeIds, chunkIds, locks: [...locks].sort(), counts, kind, id };
}
/** @param {import('./types').Library} data @param {Set<string>} stored @param {Set<string>} session */
export function mediaInventory(data, stored, session) {
  const names = videoLabels(data.videos), owners = new Map(), takes = new Map(data.takes.map(t => [t.id, t])), recipes = new Map(data.recipes.map(r => [r.id, r]));
  const addOwner = (assetId, videoId) => { const group = owners.get(assetId) || new Set(); group.add(videoId); owners.set(assetId, group); };
  for (const asset of data.assets) if (asset.videoId) addOwner(asset.id, asset.videoId);
  for (const take of data.takes) addOwner(take.cameraAssetId, take.referenceVideoId);
  for (const artifact of data.exports) {
    const recipe = recipes.get(artifact.recipeId), take = recipe && takes.get(recipe.takeId);
    if (take) addOwner(artifact.assetId, take.referenceVideoId);
  }
  const interrupted = new Set(data.takes.filter(t => t.state === 'interrupted' || t.state === 'recording').map(t => t.cameraAssetId));
  return data.assets.map(asset => {
    const ids = [...(owners.get(asset.id) || [])], labels = ids.slice(0, 3).map(id => names.get(id));
    const owner = labels.join('、') + (ids.length > 3 ? '等 ' + ids.length + ' 份筆記' : '');
    // 只依實際媒體 key／已確認的本次 File 判斷可用，不相信備份中的 ready 宣告。
    const availability = stored.has(asset.id) ? 'stored' : session.has(asset.id) ? 'session' : 'missing';
    return { asset, owner: owner || '未關聯的媒體', availability, interrupted: interrupted.has(asset.id) };
  });
}
