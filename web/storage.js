/* 檔案用途：筆記 revision、媒體與錄影 chunks 的本機交易。所在層：IndexedDB 儲存。主要關聯：library.js、main.js。 */
import { newLibrary } from './library.js';
let database;
function request(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
export async function openStore() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    let blocked = false;
    const req = indexedDB.open('dance-stamp', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('metadata'); db.createObjectStore('media'); db.createObjectStore('chunks');
    };
    req.onblocked = () => { blocked = true; database = null; reject(new Error('請先關閉其他 Dance Stamp 分頁，再重新開啟。')); };
    req.onerror = () => { database = null; reject(req.error); };
    req.onsuccess = () => {
      if (blocked) { req.result.close(); return; }
      req.result.onversionchange = () => { req.result.close(); database = null; };
      resolve(req.result);
    };
  });
  return database;
}
function completed(tx) { return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('資料沒有寫入；可能是另一分頁已更新，請保留草稿後重開。')); tx.onerror = () => {}; }); }
export async function readLibrary() {
  const db = await openStore(), tx = db.transaction('metadata');
  return await request(tx.objectStore('metadata').get('library')) || { revision: 0, data: newLibrary() };
}
export async function writeLibrary(next, expectedRevision, mediaChange) {
  const db = await openStore(), tx = db.transaction(['metadata', 'media'], 'readwrite');
  const done = completed(tx), store = tx.objectStore('metadata');
  let failure;
  const req = store.get('library');
  req.onsuccess = () => {
    // revision 檢查與寫入同一交易，兩個分頁不能先讀再各自蓋掉對方的筆記。
    if ((req.result?.revision || 0) !== expectedRevision) { failure = new Error('另一分頁已更新筆記。請先保留草稿，再重新開啟此頁。'); tx.abort(); return; }
    try {
      store.put({ revision: expectedRevision + 1, data: next }, 'library');
      if (mediaChange) mediaChange.blob ? tx.objectStore('media').put(mediaChange.blob, mediaChange.id) : tx.objectStore('media').delete(mediaChange.id);
    } catch (error) { failure = error; tx.abort(); }
  };
  try { await done; } catch (error) { throw failure || error; }
  return { revision: expectedRevision + 1, data: next };
}
export async function readMedia(id) {
  const db = await openStore(); return request(db.transaction('media').objectStore('media').get(id));
}
export async function saveChunk(id, index, blob) {
  const db = await openStore(), tx = db.transaction('chunks', 'readwrite'), done = completed(tx);
  tx.objectStore('chunks').put(blob, [id, index]); await done;
}
export async function recoverChunks(id) {
  const db = await openStore();
  const chunks = await request(db.transaction('chunks').objectStore('chunks').getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])));
  if (!chunks.length) throw new Error('沒有可恢復的錄影片段；筆記仍保留。');
  return new Blob(chunks, { type: chunks[0].type });
}
export async function clearChunks(id) {
  const db = await openStore(), tx = db.transaction('chunks', 'readwrite'), done = completed(tx);
  tx.objectStore('chunks').delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])); await done;
}
