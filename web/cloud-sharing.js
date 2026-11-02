/* 檔案用途：獨立成品的唯讀觀看連結、權限收據與撤銷。所在層：Web 雲端分享邊界。主要關聯：google-drive.js、cloud-share-ui.js、CLOUD_SYNC_SHARING.md。 */
import { chunkHashes, driveId } from './google-drive.js';
export async function prepareVideoShare(drive, blob, name, signal) {
  if (!(blob instanceof Blob) || !blob.type.startsWith('video/') || typeof name !== 'string' || !name.trim() || name.length > 250 || /[/\\]/.test(name) || [...name].some(c => c.charCodeAt(0) < 32)) throw new Error('請選擇已完成的影片並核對分享檔名。');
  const account = drive.binding(), hashes = await chunkHashes(blob, signal), id = await drive.newId(signal);
  return { account, root: null, id, operation: crypto.randomUUID(), kind: 'shared-video-v1', name, size: blob.size, hashes, intent: false, permissionId: null };
}
export function driveViewLink(file) {
  const url = new URL(file.webViewLink);
  if (url.origin !== 'https://drive.google.com' || url.pathname !== `/file/d/${driveId(file.id)}/view`) throw new Error('供應商尚未提供可用的觀看網址。');
  // 只保留供應商的 resourcekey，不讓回應中的任意跳轉或參數混入可複製連結。
  const safe = new URL(url.pathname, url.origin), resource = url.searchParams.get('resourcekey');
  if (resource) { if (!/^[a-zA-Z0-9_-]{1,250}$/.test(resource)) throw new Error('觀看網址識別無效。'); safe.searchParams.set('resourcekey', resource); }
  return safe.href;
}
const publicReader = permission => permission.type === 'anyone' && permission.role === 'reader' && permission.allowFileDiscovery === false && !permission.permissionDetails?.some(d => d.inherited);
export async function videoShareState(drive, job, signal) {
  drive.checkAccount(job.account);
  const file = await drive.file(job.id, signal);
  if (file.trashed || file.driveId || !file.ownedByMe || file.owners?.length !== 1 || file.owners[0].permissionId !== job.account || file.appProperties?.dsKind !== 'shared-video-v1' || file.appProperties?.dsOperation !== job.operation || Number(file.size) !== job.size) throw new Error('這不是此帳號建立的獨立成品副本。');
  const permissions = await drive.permissions(job.id, signal), publicPermissions = permissions.filter(publicReader);
  const ownId = job.permissionId || file.appProperties.dsPermission || null;
  const grant = publicPermissions.find(p => p.id === ownId);
  const otherAccess = permissions.some(p => !(p.type === 'user' && p.role === 'owner' && p.id === job.account) && p.id !== grant?.id);
  drive.checkAccount(job.account);
  return { file, permissions, publicPermissions, grant, otherAccess, link: grant ? driveViewLink(file) : null, permissionId: ownId };
}
async function receipt(drive, job, persist, signal) {
  persist(job);
  // 收據跟著獨立成品保存，另一台裝置才能只撤銷本 App 建立的這項授權。
  await drive.json(`files/${driveId(job.id)}?fields=id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appProperties: { dsPermission: driveId(job.permissionId) } }) }, signal);
}
export async function publishVideoShare(drive, job, blob, persist, signal, progress) {
  if (job.kind !== 'shared-video-v1' || job.root !== null) throw new Error('分享必須使用獨立成品副本。');
  drive.checkAccount(job.account);
  const existing = await drive.request(`files/${driveId(job.id)}?fields=id`, {}, signal);
  if (existing.status === 404) { if (!blob) throw new Error('分享來源已不在本頁；請重新選取相同成品。'); await drive.upload(blob, job, signal, progress); }
  else if (!existing.ok) throw new Error('成品副本狀態待確認，請先重新讀取。');
  else await drive.download(job.id, job.size, job.hashes, signal);
  let state = await videoShareState(drive, job, signal);
  if (state.grant) job.permissionId = state.grant.id;
  if (!state.grant) {
    if (job.intent && state.publicPermissions.length === 1 && !state.permissions.some(p => p.role !== 'owner' && !publicReader(p))) {
      // 已記錄「原本私人→建立這個連結」的意圖，但收據回應遺失；先讀同一副本再恢復收據。
      job.permissionId = state.publicPermissions[0].id;
    } else {
      if (state.otherAccess || state.permissions.some(p => p.type !== 'user' || p.role !== 'owner' || p.id !== job.account)) throw new Error('副本已有其他授權；沒有擴大權限，請到 Drive 核對。');
      job.intent = true; persist(job);
      const permission = await drive.json(`files/${driveId(job.id)}/permissions?fields=id,type,role,allowFileDiscovery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }) }, signal);
      job.permissionId = driveId(permission.id);
    }
  }
  // 本機已知權限不代表遠端收據已到；回應失敗後重試也須補齊跨裝置撤銷所需資料。
  if (!state.grant || state.file.appProperties.dsPermission !== job.permissionId) {
    await receipt(drive, job, persist, signal); state = await videoShareState(drive, job, signal);
  }
  if (!state.grant || state.otherAccess || !state.link) throw new Error('分享狀態待確認；請重新讀取這份副本的權限。');
  return state;
}
export async function stopVideoShare(drive, job, persist, signal) {
  let state = await videoShareState(drive, job, signal);
  const permission = state.permissions.find(p => p.id === state.permissionId);
  if (permission) {
    if (!publicReader(permission)) throw new Error('這項權限已被外部修改或繼承，沒有自動撤銷；請到 Drive 核對。');
    await drive.request(`files/${driveId(job.id)}/permissions/${driveId(permission.id)}`, { method: 'DELETE' }, signal);
  } else if (!state.permissionId && state.publicPermissions.length) throw new Error('沒有這項授權的建立收據，請先恢復分享狀態或到 Drive 管理。');
  state = await videoShareState(drive, job, signal);
  if (state.permissions.some(p => p.id === state.permissionId)) throw new Error('撤銷結果待確認，請重新讀取權限。');
  persist({ ...job, stopped: true }); return state;
}
export async function listVideoShares(drive, signal) {
  const account = drive.binding(), rows = await drive.list("trashed = false and appProperties has { key='dsKind' and value='shared-video-v1' }", signal);
  return rows.map(file => ({ account, root: null, id: driveId(file.id), operation: file.appProperties.dsOperation, kind: 'shared-video-v1', name: file.name, size: Number(file.size), permissionId: file.appProperties.dsPermission || null, intent: !!file.appProperties.dsPermission }));
}
