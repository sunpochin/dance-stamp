/* 檔案用途：選定練習的不可覆寫雲端快照與 ID 映射。所在層：Web 純資料／傳輸。主要關聯：library.js、google-drive.js、DATA_FORMAT.md。 */
import { validateBackup, parseBackup, tables } from './library.js';
import { chunkHashes, driveId, cloudChunkSize, cloudMediaLimit } from './google-drive.js';
const relations = { videos: {}, assets: { videoId: 'videos' }, markers: { videoId: 'videos', moveId: 'moves' }, takes: { referenceVideoId: 'videos', cameraAssetId: 'assets' }, recipes: { takeId: 'takes' }, exports: { recipeId: 'recipes', assetId: 'assets' }, moves: {}, segments: {}, sessions: {}, practiceChoices: {} };
function rewrite(data, mapping, reverse = false) {
  const maps = Object.fromEntries(tables.map(t => [t, new Map(Object.entries(mapping[t] || {}).map(([a, b]) => reverse ? [b, a] : [a, b]))]));
  const result = structuredClone(data);
  for (const table of tables) for (const row of result[table]) {
    row.id = maps[table].get(row.id) || row.id;
    for (const [key, parent] of Object.entries(relations[table])) if (row[key] !== undefined) row[key] = maps[parent].get(row[key]) || row[key];
  }
  return result;
}
export function selectedPractice(library, videoId, takeId, notes, binding) {
  const data = validateBackup(library), selected = data.takes.find(t => t.id === takeId && t.referenceVideoId === videoId && t.state === 'ready');
  if (!selected) throw new Error('請先完成兩片比較配對，再保存選定練習。');
  // 雲端續作只包含選定比較；私人自評與下次選擇不跟著影片或筆記離開裝置。
  data.segments = []; data.sessions = []; data.practiceChoices = [];
  data.videos = data.videos.filter(v => v.id === videoId); data.takes = [selected];
  data.recipes = data.recipes.filter(r => r.takeId === takeId);
  data.exports = data.exports.filter(e => e.state === 'ready' && data.recipes.some(r => r.id === e.recipeId));
  data.markers = notes ? data.markers.filter(m => m.videoId === videoId) : [];
  data.moves = data.moves.filter(m => data.markers.some(marker => marker.moveId === m.id));
  data.assets = data.assets.filter(a => a.kind === 'reference' && a.videoId === videoId || a.id === selected.cameraAssetId || data.exports.some(e => e.assetId === a.id));
  data.exportedAt = new Date().toISOString();
  const source = binding ? rewrite(data, binding.mapping, true) : data;
  if (binding) source.sourceLibraryId = binding.sourceLibraryId;
  return validateBackup(source);
}
export function validateSnapshot(text) {
  if (typeof text !== 'string' || new Blob([text]).size > 10 * 1024 * 1024) throw new Error('雲端快照超過 10 MiB。');
  const input = JSON.parse(text);
  if (input?.format !== 'dance-stamp-cloud' || input.version !== 1 || input.provider !== 'google-drive' || !/^[a-f0-9-]{36}$/.test(input.dataset) || !/^[a-f0-9-]{36}$/.test(input.snapshot) || input.parent !== null && !/^[a-f0-9-]{36}$/.test(input.parent) || input.parent === input.snapshot) throw new Error('雲端快照版本或識別無效。');
  const data = parseBackup(JSON.stringify(input.data));
  if (data.kind !== 'backup' || data.videos.length !== 1 || data.takes.length !== 1 || data.takes[0].state !== 'ready' || !Array.isArray(input.media) || input.media.length !== data.assets.length) throw new Error('快照必須是一份完整的選定練習。');
  const subset = selectedPractice(data, data.videos[0].id, data.takes[0].id, true);
  if (tables.some(table => JSON.stringify(subset[table]) !== JSON.stringify(data[table]))) throw new Error('快照含有未選練習的資料。');
  const media = [], seen = new Set();
  for (const item of input.media) {
    const asset = data.assets.find(a => a.id === item.assetId);
    if (!asset || seen.has(item.assetId) || asset.kind !== item.role || asset.byteLength !== item.byteLength || asset.mimeType !== item.mimeType) throw new Error('快照媒體關聯不符。');
    seen.add(item.assetId);
    if (item.fileId !== null && (!Array.isArray(item.hashes) || item.hashes.length !== Math.ceil(item.byteLength / cloudChunkSize) || item.hashes.some(h => typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h)) || item.byteLength < 1 || item.byteLength > cloudMediaLimit) || item.fileId === null && item.hashes !== null) throw new Error('快照媒體校驗資訊無效。');
    media.push({ assetId: asset.id, role: asset.kind, byteLength: asset.byteLength, mimeType: asset.mimeType, fileId: item.fileId === null ? null : driveId(item.fileId), hashes: item.hashes });
  }
  const remoteIds = media.filter(m => m.fileId !== null).map(m => m.fileId);
  if (new Set(remoteIds).size !== remoteIds.length) throw new Error('不同角色不能共用同一遠端檔案。');
  return { format: input.format, version: 1, provider: input.provider, account: driveId(input.account), root: driveId(input.root), dataset: input.dataset, snapshot: input.snapshot, parent: input.parent, data, media };
}
export function snapshotBranches(snapshots) {
  const parents = new Set(snapshots.map(s => s.parent).filter(Boolean));
  return snapshots.filter(s => !parents.has(s.snapshot));
}
export async function prepareSnapshot(drive, data, selectedIds, files, { root, dataset = crypto.randomUUID(), parent = null, mapping = {} }, signal) {
  const account = drive.binding(), operation = crypto.randomUUID(), snapshot = crypto.randomUUID(), media = [], jobs = [];
  for (const asset of data.assets) {
    signal?.throwIfAborted();
    const localId = mapping[asset.id] || asset.id, blob = files.get(localId);
    const item = { assetId: asset.id, role: asset.kind, mimeType: asset.mimeType, byteLength: asset.byteLength, fileId: null, hashes: null };
    if (selectedIds.has(localId)) {
      if (!blob || blob.size !== asset.byteLength) throw new Error('勾選的原片已失效或大小不同，請重新選片；尚未上傳。');
      const hashes = await chunkHashes(blob, signal), id = await drive.newId(signal);
      Object.assign(item, { fileId: id, hashes });
      jobs.push({ account, root, id, operation, kind: 'snapshot-media-v1', name: `dance-${asset.kind}-${snapshot}`, hashes, localId });
    }
    media.push(item);
  }
  const envelope = validateSnapshot(JSON.stringify({ format: 'dance-stamp-cloud', version: 1, provider: 'google-drive', account, root, dataset, snapshot, parent, data, media }));
  const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
  const manifest = { account, root, id: await drive.newId(signal), operation, kind: 'snapshot-v1', name: `dance-practice-${snapshot}.json`, hashes: await chunkHashes(blob, signal) };
  drive.checkAccount(account); return { operation, envelope, jobs, manifest };
}
export async function saveSnapshot(drive, work, resolveFile, signal, progress) {
  const { envelope, jobs, manifest } = work;
  validateSnapshot(JSON.stringify(envelope)); drive.checkAccount(envelope.account);
  // 全部來源先核對；關頁後重新選片也必須對完整內容，不能靠檔名接錯影片。
  const files = new Map();
  for (const job of jobs) {
    const blob = await resolveFile(job.localId, job.hashes, signal);
    if (!blob || JSON.stringify(await chunkHashes(blob, signal)) !== JSON.stringify(job.hashes)) throw new Error('待傳工作的來源已失效；請重新選取相同原片後重試。');
    files.set(job.id, blob);
  }
  for (const job of jobs) { await drive.upload(files.get(job.id), job, signal, progress); }
  // 完成 manifest 是最後一步；媒體失敗時，舊完整快照仍是可接續版本。
  await drive.upload(new Blob([JSON.stringify(envelope)], { type: 'application/json' }), manifest, signal, progress);
  return envelope;
}
export async function listSnapshots(drive, root, signal) {
  await drive.privateFile(root, signal, true);
  const rows = await drive.list(`trashed = false and '${driveId(root)}' in parents and appProperties has { key='dsKind' and value='snapshot-v1' }`, signal), result = [];
  for (const row of rows) {
    const { file, text } = await drive.readJSON(row.id, signal), value = validateSnapshot(text);
    if (value.account !== drive.binding() || value.root !== root || !file.parents?.includes(root)) throw new Error('快照不屬於目前帳號／資料夾。');
    result.push({ ...value, fileId: file.id });
  }
  return result;
}
