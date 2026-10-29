/* 檔案用途：建立合法的大型合成匯入及完整舊關聯。所在層：備份測試資料。主要關聯：backupPlanningStop.test.ts、backup-planning-stop.ts。 */
import { newLibrary, validateBackup } from '../../web/library.js';

export function planningLibrary(groups = 32, markersPerGroup = 48) {
  const data = newLibrary();
  for (let i = 0; i < groups; i++) {
    const videoId = crypto.randomUUID(), moveId = crypto.randomUUID(), referenceId = crypto.randomUUID(), selfId = crypto.randomUUID(), vsId = crypto.randomUUID(), takeId = crypto.randomUUID(), recipeId = crypto.randomUUID();
    data.videos.push({ id: videoId, title: `合成規劃課程 ${i}`, durationMs: 90000, revision: 1 });
    data.moves.push({ id: moveId, name: `合成動作 ${i}`, danceStyle: 'Salsa', status: 'practicing', revision: 1 });
    data.assets.push({ id: referenceId, videoId, kind: 'reference', byteLength: 16, mimeType: 'application/octet-stream' }, { id: selfId, kind: 'take', byteLength: 16, mimeType: 'application/octet-stream' }, { id: vsId, kind: 'vs', byteLength: 16, mimeType: 'application/octet-stream' });
    for (let j = 0; j < markersPerGroup; j++) data.markers.push({ id: crypto.randomUUID(), videoId, moveId, startMs: j * 100, title: `合成片段 ${j}`, note: 'synthetic-note-'.repeat(146), revision: 1 });
    data.takes.push({ id: takeId, referenceVideoId: videoId, cameraAssetId: selfId, referenceStartMs: 12000, referenceEndMs: 32000, rate: 1, state: 'ready', createdAt: '2026-10-30T00:00:00.000Z' });
    data.recipes.push({ id: recipeId, takeId, offsetMs: 4000, referenceMirror: true, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 });
    data.exports.push({ id: crypto.randomUUID(), recipeId, recipeRevision: 1, assetId: vsId, mimeType: 'application/octet-stream', state: 'ready', createdAt: '2026-10-30T00:00:01.000Z' });
  }
  return validateBackup(data);
}

export function planningSource(local, kind) {
  const source = structuredClone(local);
  if (kind === 'foreign') source.sourceLibraryId = crypto.randomUUID();
  else if (kind === 'share') { source.kind = 'share'; source.moves = []; for (const marker of source.markers) delete marker.moveId; }
  else if (kind === 'conflict') {
    // 上游衝突必須帶出整個副本閉包，不能刪掉 take／配方／VS 來縮小測試。
    for (const video of source.videos) { video.title += ' 來源版本'; video.revision++; }
    for (const asset of source.assets.filter(a => a.kind === 'reference')) asset.byteLength++;
  } else throw new Error('未知合成規劃案例');
  return validateBackup(source);
}
