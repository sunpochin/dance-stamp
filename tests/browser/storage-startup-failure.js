/* 檔案用途：驗證啟動遇到較新原生資料庫版本時不清除未知資料。所在層：合成瀏覽器回歸。主要關聯：main.js 的 ready 失敗提示、storage.js、issue #103。 */
async controller => {
  const origin = new URL(controller.url()).origin, context = await controller.context().browser().newContext(), page = await context.newPage(), errors = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  page.on('pageerror', error => errors.push(error.message));
  try {
    await context.addInitScript(() => {
      const open = IDBFactory.prototype.open; window.__futureStorageErrors = [];
      IDBFactory.prototype.open = function(...args) {
        const request = open.apply(this, args);
        if (args[0] === 'dance-stamp' && args[1] === 1) request.addEventListener('error', event => window.__futureStorageErrors.push({ name: request.error.name, trusted: event.isTrusted }));
        return request;
      };
      // 在空白的自有 context 先建立 v2；VersionError 由真正引擎產生，不替產品 throw 假錯誤或重置資料。
      window.__futureStorageSeed = new Promise((resolve, reject) => {
        const request = open.call(indexedDB, 'dance-stamp', 2);
        request.onupgradeneeded = event => {
          if (event.oldVersion !== 0) throw new Error('QA 拒絕改寫已有資料庫');
          const db = request.result;
          db.createObjectStore('metadata').put({ revision: 41, future: { schema: 2, note: '合成未知格式，必須逐值保留' } }, 'library');
          db.createObjectStore('media').put(new Blob(['synthetic-future-media'], { type: 'application/octet-stream' }), 'future-media');
          db.createObjectStore('chunks').put({ bytes: [0, 255, 17] }, 'future-chunk');
          db.createObjectStore('future-only').put({ untouched: ['合成', 2] }, 'future-field');
        };
        request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
      });
    });
    const rejected = async () => {
      await page.waitForFunction(() => document.getElementById('storage-status').textContent.startsWith('本機儲存無法開啟：'));
      await page.evaluate(() => window.__futureStorageSeed);
      const native = await page.evaluate(() => window.__futureStorageErrors);
      assert(native.length === 1 && native[0].name === 'VersionError' && native[0].trusted, '不是較新版本造成的真正原生拒絕');
      assert((await page.locator('#storage-status').textContent()).includes('沒有重置或刪除舊資料'), '啟動失敗沒有清楚提示保留舊資料');
    };
    const snapshot = () => page.evaluate(async () => {
      const request = indexedDB.open('dance-stamp', 2), db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try {
        const read = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const names = [...db.objectStoreNames], tx = db.transaction(names), rows = await Promise.all(names.map(async name => ({ name, keys: await read(tx.objectStore(name).getAllKeys()), values: await read(tx.objectStore(name).getAll()) })));
        for (const row of rows) row.values = await Promise.all(row.values.map(async value => value instanceof Blob ? { type: value.type, bytes: [...new Uint8Array(await value.arrayBuffer())] } : value));
        return { version: db.version, rows };
      } finally { db.close(); }
    });
    await page.goto(origin); await rejected(); const before = await snapshot();
    // 第一次讀回就核對預置原值，不能只比較兩次錯誤後的快照而漏掉首次損壞。
    const expected = { version: 2, rows: [
      { name: 'chunks', keys: ['future-chunk'], values: [{ bytes: [0, 255, 17] }] },
      { name: 'future-only', keys: ['future-field'], values: [{ untouched: ['合成', 2] }] },
      { name: 'media', keys: ['future-media'], values: [{ type: 'application/octet-stream', bytes: [...new TextEncoder().encode('synthetic-future-media')] }] },
      { name: 'metadata', keys: ['library'], values: [{ revision: 41, future: { schema: 2, note: '合成未知格式，必須逐值保留' } }] },
    ] };
    assert(JSON.stringify(before) === JSON.stringify(expected), '首次拒絕已改掉預置的未知欄位、完整 bytes 或資料庫版本');
    await page.reload(); await rejected(); const after = await snapshot();
    assert(JSON.stringify(after) === JSON.stringify(before) && errors.length === 0, '重新開啟後未知欄位、完整 bytes 或資料庫版本改變');
    await page.locator('#library-panel').screenshot({ path: 'output/playwright/storage-startup-failure.png' });
    return { nativeTrustedVersionError: true, clearFailureWithoutReset: true, futureSchemaAndAllRawValuesPreservedAfterReload: true, databaseVersion: after.version, objectStores: after.rows.map(row => row.name), pageErrors: errors };
  } finally { await context.close(); }
}
