/* 檔案用途：驗證 v1 延遲升版、失敗回滾與多分頁保護。所在層：真實 IndexedDB 合成回歸。主要關聯：storage.js、moves.js。 */
async (root) => {
  const context = await root.context().browser().newContext(), page = await context.newPage(), origin = new URL(root.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = p => p.waitForFunction(() => !document.getElementById('controls').disabled);
  try {
    await page.goto(origin); await idle(page);
    const fixture = await page.evaluate(async () => {
      const { newLibrary } = await import('/library.js'), { openStore } = await import('/storage.js');
      const data = newLibrary(), videoId = crypto.randomUUID(), assetId = crypto.randomUUID(); data.schemaVersion = 1;
      data.videos.push({ id: videoId, title: '合成舊筆記', durationMs: 12000, revision: 1 });
      data.markers.push({ id: crypto.randomUUID(), videoId, startMs: 2000, title: '舊腳步', note: '舊筆記不應消失', revision: 1 });
      data.assets.push({ id: assetId, videoId, kind: 'reference', byteLength: 4, mimeType: 'video/mp4' });
      const db = await openStore();
      await new Promise((resolve, reject) => { const tx = db.transaction(['metadata','media','chunks'], 'readwrite'); tx.objectStore('metadata').put({ revision: 1, data }, 'library'); tx.objectStore('media').put(new Blob(['kept']), assetId); tx.objectStore('chunks').put(new Blob(['chunk-kept']), [assetId,0]); tx.oncomplete = resolve; tx.onabort = reject; });
      return { videoId, assetId, data };
    });
    const raw = p => p.evaluate(async () => { const db = await (await import('/storage.js')).openStore(); return await new Promise((resolve, reject) => { const req = db.transaction('metadata').objectStore('metadata').get('library'); req.onsuccess = () => resolve(req.result); req.onerror = reject; }); });
    const before = await raw(page);
    const read = await page.evaluate(async () => await (await import('/storage.js')).readLibrary());
    assert(read.data.schemaVersion === 2 && JSON.stringify(await raw(page)) === JSON.stringify(before), '讀取升版暗中寫入');
    // 複製品是合成不可解碼 sentinel；移除其媒體描述的本機可用狀態並不刪 bytes。
    await page.reload(); await idle(page); await page.locator('#library').selectOption(fixture.videoId); await page.locator('#open-library').click(); await idle(page);
    // 不靠播放器成功驗證 metadata：即使缺片或壞片，分類／筆記仍可編輯。
    await page.locator('#video-title').fill('合成新標題'); await page.locator('#video-teacher').fill('合成老師');
    await page.evaluate(() => { window.originalPut17 = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { const result = window.originalPut17.apply(this,args); if (this.name === 'metadata' && args[1] === 'library') throw new DOMException('synthetic migration quota', 'QuotaExceededError'); return result; }; });
    await page.locator('#save-title').click(); await idle(page);
    assert(JSON.stringify(await raw(page)) === JSON.stringify(before) && await page.locator('#video-title').inputValue() === '合成新標題', '升版 quota 未回滾或遺失草稿');
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalPut17; });
    const other = await context.newPage(); await other.goto(origin); await idle(other); await other.locator('#library').selectOption(fixture.videoId); await other.locator('#open-library').click(); await idle(other);
    await other.locator('#video-title').fill('另一頁草稿');
    await page.locator('#save-title').click(); await idle(page);
    const after = await raw(page);
    assert(after.data.schemaVersion === 2 && after.revision === 2 && after.data.videos[0].teacher === '合成老師' && JSON.stringify(after.data.markers) === JSON.stringify(fixture.data.markers), '成功升版未保留筆記或分類');
    await other.locator('#save-title').click(); await idle(other);
    assert((await other.locator('#status').textContent()).includes('另一分頁') && await other.locator('#video-title').inputValue() === '另一頁草稿' && JSON.stringify(await raw(page)) === JSON.stringify(after), '舊版分頁覆蓋新資料或遺失草稿');
    const failureChecks = await page.evaluate(async ({ assetId }) => {
      const { readLibrary, writeLibrary, openStore, readMedia } = await import('/storage.js');
      const db = await openStore(), before = await readLibrary(), cancelled = new AbortController(); cancelled.abort();
      let aborted = false; try { await writeLibrary({ ...before.data, moves: [{ id: crypto.randomUUID(), name: '取消動作', danceStyle: '', status: 'wanted', revision: 1 }] }, before.revision, undefined, cancelled.signal); } catch { aborted = true; }
      const chunk = await new Promise(resolve => { const req = db.transaction('chunks').objectStore('chunks').get([assetId,0]); req.onsuccess = () => resolve(req.result); });
      const preserved = await (await readMedia(assetId)).text() === 'kept' && await chunk.text() === 'chunk-kept' && (await readLibrary()).revision === before.revision;
      await new Promise(resolve => { const tx = db.transaction('metadata','readwrite'); tx.objectStore('metadata').put({ ...before, data: { ...before.data, schemaVersion: 99 } }, 'library'); tx.oncomplete = resolve; });
      let futureRejected = false; try { await readLibrary(); } catch { futureRejected = true; }
      const stored = await new Promise(resolve => { const req = db.transaction('metadata').objectStore('metadata').get('library'); req.onsuccess = () => resolve(req.result); });
      return { aborted, preserved, futureRejected, futureUnchanged: stored.data.schemaVersion === 99 && stored.data.markers[0].note === '舊筆記不應消失' };
    }, fixture);
    assert(Object.values(failureChecks).every(Boolean), '取消／未知版本未保留資料');
    return { readOnlyMigration: true, queuedWriteQuotaRollback: true, retryMigratesAtomically: true, otherTabConflictKeepsDraft: true, ...failureChecks };
  } finally { await context.close(); }
}
