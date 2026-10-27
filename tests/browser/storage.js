/* 檔案用途：實際 IndexedDB migration 回滾與跨分頁恢復鎖驗證。所在層：合成本機資料回歸。主要關聯：storage.js、DATA_FORMAT.md。 */
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await page.goto('http://127.0.0.1:4173/');
  const migration = await page.evaluate(async () => {
    const { upgradeSchema } = await import('/storage.js');
    const name = `synthetic-migration-${crypto.randomUUID()}`;
    const original = IDBDatabase.prototype.createObjectStore;
    const open = version => new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = e => { try { upgradeSchema(req.result, e.oldVersion); } catch { req.transaction.abort(); } };
      req.onerror = () => reject(req.error); req.onsuccess = () => resolve(req.result);
    });
    let failed = false;
    IDBDatabase.prototype.createObjectStore = function(key, ...args) {
      if (this.name === name && key === 'media') throw new DOMException('synthetic migration failure', 'AbortError');
      return original.call(this, key, ...args);
    };
    try { await open(1); } catch { failed = true; }
    finally { IDBDatabase.prototype.createObjectStore = original; }
    let db = await open(1);
    const recovered = db.objectStoreNames.length === 3;
    await new Promise((resolve, reject) => { const tx = db.transaction('metadata', 'readwrite'); tx.objectStore('metadata').put('synthetic-kept', 'sentinel'); tx.oncomplete = resolve; tx.onabort = reject; });
    db.close();
    let unknownRejected = false;
    try { await open(2); } catch { unknownRejected = true; }
    db = await open(1);
    const sentinel = await new Promise((resolve, reject) => { const req = db.transaction('metadata').objectStore('metadata').get('sentinel'); req.onsuccess = () => resolve(req.result); req.onerror = reject; });
    const oldVersionPreserved = db.version === 1 && sentinel === 'synthetic-kept'; db.close();
    return { failed, recovered, unknownRejected, oldVersionPreserved };
  });
  assert(Object.values(migration).every(Boolean), 'migration 未完整回滾或無法恢復');
  const takeId = await page.evaluate(async () => {
    const { readLibrary, writeLibrary } = await import('/storage.js');
    const saved = await readLibrary(), data = structuredClone(saved.data);
    const videoId = crypto.randomUUID(), assetId = crypto.randomUUID(), takeId = crypto.randomUUID();
    data.videos.push({ id: videoId, title: '合成恢復鎖', durationMs: 15000, revision: 1 });
    data.assets.push({ id: assetId, kind: 'take', byteLength: 0, mimeType: 'video/mp4', state: 'copying' });
    data.takes.push({ id: takeId, referenceVideoId: videoId, cameraAssetId: assetId, referenceStartMs: 0, referenceEndMs: 15000, rate: 1, state: 'recording', createdAt: new Date().toISOString() });
    await writeLibrary(data, saved.revision);
    return takeId;
  });
  const before = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).revision);
  const other = await page.context().newPage();
  try {
    await other.goto('http://127.0.0.1:4173/');
    await other.waitForFunction(() => document.getElementById('storage-status').textContent.includes('份影片筆記'));
    const observed = await other.evaluate(async id => {
      const data = await (await import('/storage.js')).readLibrary();
      return { revision: data.revision, state: data.data.takes.find(t => t.id === id).state };
    }, takeId);
    assert(observed.revision === before && observed.state === 'recording', '開另一頁誤改正在錄製的 take');
    await page.evaluate(async id => {
      const { withTakeLock } = await import('/storage.js');
      window.keepTakeLock = withTakeLock(id, async () => { window.takeLockHeld = true; await new Promise(resolve => { window.releaseTakeLock = resolve; }); });
    }, takeId);
    await page.waitForFunction(() => window.takeLockHeld);
    const rejected = await other.evaluate(async id => {
      try { await (await import('/storage.js')).withTakeLock(id, async () => true); return false; }
      catch (error) { return error.message.includes('另一個分頁'); }
    }, takeId);
    assert(rejected, '另一頁可搶走錄製／恢復中的 take');
    await page.evaluate(async () => { window.releaseTakeLock(); await window.keepTakeLock; });
    const reusable = await other.evaluate(async id => (await import('/storage.js')).withTakeLock(id, async () => true), takeId);
    assert(reusable, '停止後無法恢復同一 take');
  } finally { await other.close(); }
  return { migration, openingAnotherTabPreservesRecording: true, concurrentTakeRecoveryRejected: true, lockReusableAfterRelease: true };
}
