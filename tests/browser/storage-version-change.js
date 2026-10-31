/* 檔案用途：驗證已開舊頁收到真正資料庫升版通知後的草稿、備份與媒體保全。所在層：#103 原生 IndexedDB 瀏覽器回歸。主要關聯：storage.js、storage-startup-failure.js、run-app.ts。 */
async (page, options) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const origin = new URL(page.url()).origin, downloads = [];
  await page.context().addInitScript(() => {
    const a = window.versionNative = { errors: [], hardwareCalls: 0 };
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      const request = open.apply(this, args);
      if (args[0] === 'dance-stamp' && args[1] === 1) request.addEventListener('error', event => a.errors.push({ name: request.error.name, trusted: event.isTrusted }));
      return request;
    };
    // 儲存升版只用既有合成檔案，任何相機／麥克風／螢幕擷取呼叫都視為失敗。
    for (const key of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices) navigator.mediaDevices[key] = () => { a.hardwareCalls++; throw new Error('升版回歸不可擷取硬體'); };
  });
  await page.reload(); await idle(); await page.locator('#existing-mode').click();
  for (const [id, path] of [['reference-file', 'output/export-failure/reference.mp4'], ['self-file', 'output/export-failure/self.mp4']]) { await page.locator('#' + id).setInputFiles(path); await idle(); }
  for (const id of ['copy-reference', 'copy-self']) { await page.locator('#' + id).click(); await idle(); }
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成升版保留'); await page.locator('#marker-note').fill('舊頁保存失敗也不清除'); await page.locator('#marker-form button[type="submit"]').click(); await idle();
  await page.locator('#end').fill('1.5'); await page.locator('#end').dispatchEvent('change'); await idle();
  await page.locator('#export').click(); await idle(); assert((await page.locator('#status').textContent()).includes('已成檔'), '升版前未真正VS成檔');
  await page.evaluate(async () => {
    const store = await import('/storage.js'), state = await store.readLibrary(), db = await store.openStore(); window.versionDb = db;
    const a = window.versionAudit = { events: [], closes: 0, blobs: new Map(), revoked: [] };
    a.sha = async blob => ({ bytes: blob.size, mime: blob.type, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('') });
    a.ui = () => ['reference', 'self', 'take-download', 'output-download'].map(id => document.getElementById(id)[id.endsWith('download') ? 'href' : 'src']); a.beforeUi = a.ui();
    for (const [id, asset] of [['take-download', state.data.takes.at(-1).cameraAssetId], ['output-download', state.data.exports.at(-1).assetId]]) a.blobs.set(document.getElementById(id).href, await store.readMedia(asset));
    // 只旁聽原生versionchange與close，不替產品關庫或直接呼叫其handler。
    db.addEventListener('versionchange', event => a.events.push({ trusted: event.isTrusted, oldVersion: event.oldVersion, newVersion: event.newVersion }));
    const close = IDBDatabase.prototype.close, create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    IDBDatabase.prototype.close = function (...args) { if (this === db) a.closes++; return close.apply(this, args); };
    URL.createObjectURL = blob => { const url = create.call(URL, blob); a.blobs.set(url, blob); return url; };
    URL.revokeObjectURL = url => { a.revoked.push(url); a.blobs.delete(url); return revoke.call(URL, url); };
  });
  const snapshot = target => target.evaluate(async () => {
    const db = window.versionDb, names = [...db.objectStoreNames], tx = db.transaction(names);
    const get = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const rows = await Promise.all(names.map(async name => ({ name, keys: await get(tx.objectStore(name).getAllKeys()), values: await get(tx.objectStore(name).getAll()) })));
    for (const row of rows) row.values = await Promise.all(row.values.map(async value => value instanceof Blob ? { mime: value.type, bytes: value.size, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await value.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('') } : value));
    return { version: db.version, rows };
  });
  const before = await snapshot(page);
  const metadata = before.rows.find(row => row.name === 'metadata');
  await page.evaluate(data => { window.versionAudit.savedData = data; }, metadata.values[metadata.keys.indexOf('library')].data);
  const other = await page.context().newPage();
  try {
    // 同origin的無產品控制頁代表未知新版；不改產品schema，也不讓舊App先在此頁開庫。
    await other.goto(origin + '/__version-controller');
    await other.evaluate(() => {
      const a = window.versionUpgrade = { settled: false, events: [] }, request = indexedDB.open('dance-stamp', 2);
      request.onblocked = event => a.events.push({ name: 'blocked', trusted: event.isTrusted });
      request.onupgradeneeded = event => {
        a.events.push({ name: 'upgradeneeded', trusted: event.isTrusted, oldVersion: event.oldVersion, newVersion: event.newVersion });
        request.result.createObjectStore('future-only').put({ synthetic: 'unknown-version-kept', bytes: [0, 255, 17] }, 'sentinel');
      };
      request.onerror = () => { a.error = request.error.name; a.settled = true; };
      request.onsuccess = () => { window.versionDb = request.result; a.version = request.result.version; a.settled = true; };
    });
    // 不等待無期限的open Promise；仍用入口原15秒期限驗證舊頁真的釋放連線。
    await other.waitForFunction(() => window.versionUpgrade.settled);
    const upgraded = await other.evaluate(() => window.versionUpgrade);
    assert(!upgraded.error && upgraded.version === 2 && upgraded.events.some(row => row.name === 'upgradeneeded' && row.trusted && row.oldVersion === 1 && row.newVersion === 2), '未收到真正升版成功');
    const changed = await page.evaluate(() => ({ events: window.versionAudit.events, closes: window.versionAudit.closes }));
    assert(changed.closes === 1 && changed.events.length === 1 && changed.events[0].trusted && changed.events[0].oldVersion === 1 && changed.events[0].newVersion === 2, '舊頁未沿真正versionchange關閉原連線');
    const afterUpgrade = await snapshot(other);
    assert(JSON.stringify(afterUpgrade.rows.filter(row => row.name !== 'future-only')) === JSON.stringify(before.rows), '升版改動舊筆記／媒體／chunks');
    assert(JSON.stringify(afterUpgrade.rows.find(row => row.name === 'future-only')) === JSON.stringify({ name: 'future-only', keys: ['sentinel'], values: [{ synthetic: 'unknown-version-kept', bytes: [0, 255, 17] }] }), '未知新版資料不完整');
    const draft = '合成尚未保存的升版草稿'; await page.locator('#video-title').fill(draft); await page.locator('#save-title').click(); await idle();
    assert(await page.locator('#video-title').inputValue() === draft && (await page.locator('#status').textContent()).includes('原片仍保留'), '保存拒絕後草稿遺失或誤報完成');
    const native = await page.evaluate(() => window.versionNative.errors);
    assert(native.length === 1 && native[0].name === 'VersionError' && native[0].trusted, '舊cache未清除，或不是原生新版拒絕');
    assert(await page.evaluate(() => JSON.stringify(window.versionAudit.ui()) === JSON.stringify(window.versionAudit.beforeUi) && window.versionAudit.beforeUi.every(url => !window.versionAudit.revoked.includes(url))), '舊頁保存失敗撤銷原片／VS連結');
    for (const [id, label] of [['take-download', 'original'], ['output-download', 'vs']]) {
      const expected = await page.evaluate(id => window.versionAudit.sha(window.versionAudit.blobs.get(document.getElementById(id).href)), id);
      const pending = page.waitForEvent('download'); await page.locator('#' + id).click(); const file = await pending;
      const path = `${options.directory}/storage-version-${label}.${file.suggestedFilename().split('.').pop()}`; await file.saveAs(path); downloads.push({ label, path, expected });
    }
    await page.locator('#note-tools').evaluate(element => { element.open = true; });
    const pending = page.waitForEvent('download'); await page.locator('#backup').click(); await idle(); const file = await pending;
    const backup = await page.evaluate(async () => {
      const a = window.versionAudit, blob = [...a.blobs.values()].filter(blob => blob.type === 'application/json').at(-1), data = JSON.parse(await blob.text());
      // 可攜JSON刻意不含資產state／storageKind；基準來自升版前的原生快照，不比較讀回補上的顯示欄位。
      const expected = (await import('/library.js')).validateBackup(a.savedData);
      const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
      const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
      data.exportedAt = expected.exportedAt;
      if (!same(data, expected)) throw new Error('備份與原生已存資料的可攜格式不同：' + Object.keys(expected).filter(key => !same(data[key], expected[key])).join(','));
      // 逐表獨立核對使用者內容／關聯，不能只與同一正規化函式比較而漏掉筆記損壞。
      for (const key of ['videos', 'markers', 'takes', 'recipes', 'exports', 'moves']) if (!same(data[key], a.savedData[key])) throw new Error('備份改變原生已存資料：' + key);
      if (data.assets.some(asset => asset.mediaIncluded !== false || 'state' in asset || 'storageKind' in asset)) throw new Error('可攜備份混入本機資產狀態');
      return { expected: await a.sha(blob), data };
    });
    const path = `${options.directory}/storage-version-notes.json`; await file.saveAs(path); downloads.push({ label: 'backup', path, expected: backup.expected });
    assert(await page.locator('#video-title').inputValue() === draft, '下載備份清除未保存草稿');
    assert(JSON.stringify(await snapshot(other)) === JSON.stringify(afterUpgrade), '舊頁操作改動新版資料庫');
    assert(await page.evaluate(() => window.versionNative.hardwareCalls) === 0 && await other.evaluate(() => window.versionNative.hardwareCalls) === 0, '升版回歸觸碰硬體');
    await page.reload(); await page.waitForFunction(() => document.getElementById('storage-status').textContent.startsWith('本機儲存無法開啟：'));
    const reopened = await page.evaluate(() => window.versionNative.errors);
    assert(reopened.length === 1 && reopened[0].name === 'VersionError' && reopened[0].trusted, '同profile重開未以原生版本拒絕');
    assert(JSON.stringify(await snapshot(other)) === JSON.stringify(afterUpgrade), '同profile重開重置未知新版資料');
    return { nativeVersionChange: changed, nativeUpgrade: upgraded, oldPageSaveRejected: native, unsavedDraftRetainedBeforeReload: true, backupMatchesLastSavedData: true, sameProfileReopenPreservesFutureDatabase: true, original: before, upgraded: afterUpgrade, downloads, hardwareCalls: 0 };
  } finally { if (!other.isClosed()) { await other.evaluate(() => window.versionDb?.close()); await other.close(); } }
}
