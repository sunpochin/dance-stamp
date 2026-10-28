/* 檔案用途：版本化初始化、筆記 revision 與媒體短交易。所在層：IndexedDB 儲存。主要關聯：library.js、main.js、DATA_FORMAT.md。 */
import { assembleChunks } from './recorder.js';
import { newLibrary, validateBackup } from './library.js';
/** @type {Promise<IDBDatabase> | null} */
let database = null;
const stores = ['metadata', 'media', 'chunks'];
/** @template T @param {IDBRequest<T>} req @returns {Promise<T>} */
function request(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
/** @param {IDBDatabase} db @param {number} oldVersion */
export function upgradeSchema(db, oldVersion) {
  // 目前只有 0→1；未知升級必須回滾，不能猜 schema 或刪庫來繞過 migration。
  if (oldVersion !== 0) throw new Error('沒有可用的資料版本升級路徑，舊資料保留。');
  for (const name of stores) db.createObjectStore(name);
}
export async function openStore() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    let blocked = false, upgradeError;
    const req = indexedDB.open('dance-stamp', 1);
    req.onupgradeneeded = e => {
      try { upgradeSchema(req.result, e.oldVersion); }
      catch (error) { upgradeError = error; req.transaction?.abort(); }
    };
    req.onblocked = () => { blocked = true; database = null; reject(new Error('請先關閉其他 Dance Stamp 分頁，再重新開啟。')); };
    req.onerror = () => { database = null; reject(upgradeError || req.error); };
    req.onsuccess = () => {
      if (blocked) { req.result.close(); return; }
      if (!stores.every(name => req.result.objectStoreNames.contains(name))) {
        req.result.close(); database = null; reject(new Error('資料庫結構不完整；沒有刪除舊資料，請先保留備份。')); return;
      }
      req.result.onversionchange = () => { req.result.close(); database = null; };
      resolve(req.result);
    };
  });
  return database;
}
/** @param {IDBTransaction} tx @returns {Promise<void>} */
function completed(tx) { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || new Error('資料未寫入，請保留草稿後重試。')); tx.onerror = () => {}; }); }
/** @returns {Promise<import('./types').LibraryState>} */
export async function readLibrary() {
  const db = await openStore(), tx = db.transaction(['metadata', 'media']);
  const [saved, keys] = await Promise.all([request(tx.objectStore('metadata').get('library')), request(tx.objectStore('media').getAllKeys())]);
  if (!saved) return { revision: 0, data: newLibrary() };
  if (!Number.isSafeInteger(saved.revision) || saved.revision < 1) throw new Error('筆記版本無效；沒有重置資料。');
  validateBackup(saved.data);
  /** @type {import('./types').LibraryState} */
  const result = structuredClone(saved);
  const present = new Set(keys);
  const unfinished = new Set(result.data.takes.filter(t => ['recording', 'interrupted'].includes(t.state)).map(t => t.cameraAssetId));
  for (const asset of result.data.assets) {
    asset.storageKind = present.has(asset.id) ? 'indexeddb' : 'external';
    asset.state = present.has(asset.id) ? 'ready' : 'missing';
    if (!present.has(asset.id) && unfinished.has(asset.id)) asset.state = 'interrupted';
  }
  // 讀取不改寫正在錄製的 take；另一分頁可能仍握有錄影鎖，只有明確恢復才能 finalize。
  return result;
}
/** @param {import('./types').Library} next @param {number} expectedRevision @param {{id: string, blob?: Blob}} [mediaChange] @param {AbortSignal} [signal] @param {{mediaIds: string[], chunkIds: string[]}} [cleanup] */
export async function writeLibrary(next, expectedRevision, mediaChange, signal, cleanup) {
  validateBackup(next);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('筆記版本無效，未寫入。');
  if (mediaChange && !next.assets.some(a => a.id === mediaChange.id)) throw new Error('媒體沒有對應資料記錄，未寫入。');
  if (cleanup) {
    const retained = new Set(next.assets.map(a => a.id));
    if ([...cleanup.mediaIds, ...cleanup.chunkIds].some(id => retained.has(id))) throw new Error('清理仍有關聯的資料遭拒，原資料保留。');
  }
  const db = await openStore(); signal?.throwIfAborted();
  const tx = db.transaction(cleanup ? ['metadata', 'media', 'chunks'] : ['metadata', 'media'], 'readwrite');
  const done = completed(tx), store = tx.objectStore('metadata');
  // 取消匯入或重連須取消同一個原生交易，不能只關畫面後仍偷偷寫入。
  const abort = () => { try { tx.abort(); } catch { /* 已完成的交易不能再回滾。 */ } };
  signal?.addEventListener('abort', abort, { once: true });
  let failure;
  const req = store.get('library');
  req.onsuccess = () => {
    // revision 與 metadata／Blob 在同一交易；失敗不能留下半份配方或蓋過其他分頁。
    if ((req.result?.revision || 0) !== expectedRevision) { failure = new Error('另一分頁已更新筆記。請先保留草稿，再重新開啟此頁。'); tx.abort(); return; }
    try {
      store.put({ revision: expectedRevision + 1, data: next }, 'library');
      if (mediaChange) mediaChange.blob ? tx.objectStore('media').put(mediaChange.blob, mediaChange.id) : tx.objectStore('media').delete(mediaChange.id);
      // metadata、失去關聯的副本及 chunks 同一交易；中斷不能留下半刪的筆記。
      if (cleanup) {
        for (const id of cleanup.mediaIds) tx.objectStore('media').delete(id);
        for (const id of cleanup.chunkIds) tx.objectStore('chunks').delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
      }
    } catch (error) { failure = error; tx.abort(); }
  };
  try { await done; } catch (error) { throw signal?.aborted ? signal.reason : failure || error; }
  finally { signal?.removeEventListener('abort', abort); }
  return { revision: expectedRevision + 1, data: next };
}
/** @param {string} id @returns {Promise<Blob | undefined>} */
export async function readMedia(id) { const db = await openStore(); return request(db.transaction('media').objectStore('media').get(id)); }
export async function readMediaKeys() { const db = await openStore(); return request(db.transaction('media').objectStore('media').getAllKeys()); }
/** @param {string} id @param {number} index @param {Blob} blob */
export async function saveChunk(id, index, blob) {
  if (!Number.isSafeInteger(index) || index < 0 || !(blob instanceof Blob) || !blob.size) throw new Error('錄影片段的順序或內容無效，未寫入。');
  const db = await openStore(), tx = db.transaction('chunks', 'readwrite'), done = completed(tx);
  // 同一塊不能覆寫；重複通知必須保留第一份並回報錯誤。
  tx.objectStore('chunks').add(blob, [id, index]); await done;
}
/** @param {string} id */
export async function recoverChunks(id) {
  const db = await openStore(), store = db.transaction('chunks').objectStore('chunks'), range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
  const [chunks, keys] = await Promise.all([request(store.getAll(range)), request(store.getAllKeys(range))]);
  return assembleChunks(chunks.map((blob, index) => ({ index: Array.isArray(keys[index]) && keys[index].length === 2 ? Number(keys[index][1]) : -1, blob })));
}
/** @param {string} id */
export async function clearChunks(id) {
  const db = await openStore(), tx = db.transaction('chunks', 'readwrite'), done = completed(tx);
  tx.objectStore('chunks').delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])); await done;
}
/** @template T @param {string} id @param {() => Promise<T>} action @returns {Promise<T>} */
export async function withTakeLock(id, action) {
  if (!navigator.locks) throw new Error('此瀏覽器無法安全處理錄影恢復，請改用受測的桌面 Chrome；筆記與播放器仍可使用。');
  return navigator.locks.request(`dance-stamp:take:${id}`, { ifAvailable: true }, lock => {
    if (!lock) throw new Error('另一個分頁仍在錄影或恢復這個 take，請先停止該分頁。');
    return action();
  });
}
