/* 檔案用途：檢查真實 IndexedDB 的保留、chunk 邊界與開啟失敗。所在層：合成瀏覽器回歸。主要關聯：web/storage.js、run-app.ts。 */
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const result = await page.evaluate(async () => {
    const store = await import('/storage.js'), initial = await store.readLibrary();
    await store.writeLibrary(initial.data, initial.revision);
    const before = await store.readLibrary();
    const rejected = async (action, message) => { try { await action(); return false; } catch (error) { return error.message.includes(message); } };
    const checks = [];
    for (const revision of [-1, 0.5, NaN]) checks.push(await rejected(() => store.writeLibrary(before.data, revision), '版本無效'));
    checks.push(await rejected(() => store.writeLibrary(before.data, before.revision, { id: crypto.randomUUID() }), '沒有對應'));
    const next = structuredClone(before.data), id = crypto.randomUUID();
    next.assets.push({ id, kind: 'take', byteLength: 4, mimeType: 'video/mp4' });
    checks.push(await rejected(() => store.writeLibrary(next, before.revision, undefined, undefined, { mediaIds: [id], chunkIds: [] }), '仍有關聯'));
    for (const [index, blob] of [[-1, new Blob(['x'])], [0.5, new Blob(['x'])], [0, new Blob([])], [0, 'synthetic']]) checks.push(await rejected(() => store.saveChunk(id, index, blob), '順序或內容'));
    const other = crypto.randomUUID(), chunk = text => new Blob([text], { type: 'video/mp4' });
    await store.saveChunk(id, 0, chunk('head')); await store.saveChunk(id, 1, chunk('tail')); await store.saveChunk(other, 0, chunk('other'));
    checks.push(await (await store.recoverChunks(id)).text() === 'headtail');
    checks.push(await store.saveChunk(id, 0, chunk('overwrite')).then(() => false, error => error.name === 'ConstraintError'));
    checks.push(await (await store.recoverChunks(id)).text() === 'headtail');
    await store.clearChunks(id);
    checks.push(await rejected(() => store.recoverChunks(id), '沒有可恢復'));
    checks.push(await (await store.recoverChunks(other)).text() === 'other');
    await store.saveChunk(id, 1, chunk('missing-head'));
    checks.push(await rejected(() => store.recoverChunks(id), '不完整'));
    checks.push(JSON.stringify(await store.readLibrary()) === JSON.stringify(before));
    // 刪除 metadata、媒體與殘塊必須同一交易；其他 take 的 chunks 不能被一併清除。
    const removedId = crypto.randomUUID(), withCopy = structuredClone(before.data);
    withCopy.assets.push({ id: removedId, kind: 'take', byteLength: 3, mimeType: 'video/mp4' });
    const saved = await store.writeLibrary(withCopy, before.revision, { id: removedId, blob: chunk('old') });
    await store.saveChunk(removedId, 0, chunk('residue'));
    const cleaned = await store.writeLibrary(before.data, saved.revision, undefined, undefined, { mediaIds: [removedId], chunkIds: [removedId] });
    checks.push(!await store.readMedia(removedId), await rejected(() => store.recoverChunks(removedId), '沒有可恢復'), cleaned.revision === before.revision + 2, JSON.stringify(cleaned.data) === JSON.stringify(before.data), await (await store.recoverChunks(other)).text() === 'other');
    const locks = Object.getOwnPropertyDescriptor(navigator, 'locks');
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    try { checks.push(await rejected(() => store.withTakeLock(id, async () => true), '無法安全處理')); }
    finally { if (locks) Object.defineProperty(navigator, 'locks', locks); else delete navigator.locks; }
    return checks;
  });
  assert(result.every(Boolean), 'chunk／失敗操作未保留原資料：' + JSON.stringify(result));
  const opening = await page.evaluate(async () => {
    const nativeOpen = indexedDB.open.bind(indexedDB), name = `synthetic-incomplete-${crypto.randomUUID()}`;
    const request = nativeOpen(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('metadata');
    const incomplete = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    incomplete.close();
    const original = indexedDB.open;
    indexedDB.open = () => nativeOpen(name, 1);
    let refused = false;
    try { await (await import('/storage.js?incomplete')).openStore(); }
    catch (error) { refused = error.message.includes('結構不完整'); }
    finally { indexedDB.open = original; }
    const check = nativeOpen(name, 1), preserved = await new Promise((resolve, reject) => { check.onsuccess = () => resolve(check.result); check.onerror = reject; });
    const kept = preserved.objectStoreNames.length === 1 && preserved.objectStoreNames.contains('metadata'); preserved.close();
    // 以真實 VersionError 驗證開啟失敗會清掉 rejected cache，之後可正常再開原庫。
    const upgrade = nativeOpen(name, 2);
    await new Promise((resolve, reject) => { upgrade.onsuccess = () => { upgrade.result.close(); resolve(); }; upgrade.onerror = reject; });
    indexedDB.open = () => nativeOpen(name, 1);
    const retry = await import('/storage.js?retry');
    let failed = false;
    try { await retry.openStore(); } catch (error) { failed = error.name === 'VersionError'; }
    finally { indexedDB.open = original; }
    const reopened = await retry.openStore();
    return { refused, kept, failed, reopened: reopened.objectStoreNames.length === 3 };
  });
  assert(Object.values(opening).every(Boolean), '不完整 schema／開啟失敗沒有保留或無法重試：' + JSON.stringify(opening));
  return { nativeIndexedDB: true, invalidInputsNeverWrite: true, duplicateChunkPreservesFirst: true, orderedRecovery: true, scopedCleanup: true, incompleteSchemaPreserved: true, failedOpenRetry: true };
}
