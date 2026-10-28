/* 檔案用途：用真正 SW 驗證快取損壞及模擬 quota 後仍可在線開啟，恢復才宣告離線完整。所在層：隔離瀏覽器回歸。主要關聯：sw.js、offlineCache.test.ts。 */
async (entry) => {
  const context = await entry.context().browser().newContext(), page = await context.newPage();
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const ready = () => page.waitForFunction(() => document.getElementById('offline-status')?.textContent.includes('已檢查應用資源完整'));
  const snapshot = () => page.evaluate(async () => {
    const { readLibrary, readMedia } = await import('/storage.js'), library = await readLibrary();
    return { library, blob: await (await readMedia(library.data.assets[0].id)).text() };
  });
  try {
    await page.goto(new URL(entry.url()).origin); await ready(); await page.reload(); await ready();
    const expected = await page.evaluate(async () => await (await fetch('/timeline.js')).text());
    // 只保存合成描述與不可播放的 sentinel bytes；不需要真人媒體或相機。
    await page.evaluate(async () => {
      const { readLibrary, writeLibrary } = await import('/storage.js'), { data, revision } = await readLibrary();
      const videoId = crypto.randomUUID(), assetId = crypto.randomUUID(), blob = new Blob(['synthetic preserved bytes']);
      data.videos.push({ id: videoId, title: '合成快取故障筆記', durationMs: 15000, revision: 1 });
      data.assets.push({ id: assetId, videoId, kind: 'reference', byteLength: blob.size, mimeType: 'video/mp4' });
      data.markers.push({ id: crypto.randomUUID(), videoId, title: '合成標記', note: '保留', startMs: 1000, revision: 1 });
      await writeLibrary(data, revision, { id: assetId, blob });
    });
    const before = await snapshot(), worker = context.serviceWorkers().find(w => new URL(w.url()).pathname === '/sw.js');
    assert(worker, '沒有真正的 Service Worker');
    await worker.evaluate(() => {
      const open = CacheStorage.prototype.open, match = Cache.prototype.match, put = Cache.prototype.put;
      const timeline = key => new URL(typeof key === 'string' ? key : key.url, self.location.origin).pathname === '/timeline.js';
      CacheStorage.prototype.open = function(...args) { if (self.cacheFault === 'open') return Promise.reject(new DOMException('synthetic cache unavailable', 'UnknownError')); return open.apply(this, args); };
      Cache.prototype.match = function(key, ...args) { if (self.cacheFault === 'match' && timeline(key)) return Promise.reject(new DOMException('synthetic cache read failure', 'UnknownError')); return match.call(this, key, ...args); };
      Cache.prototype.put = function(key, ...args) { if (self.cacheFault === 'put' && timeline(key)) return Promise.reject(new DOMException('synthetic cache quota', 'QuotaExceededError')); return put.call(this, key, ...args); };
    });
    for (const mode of ['put', 'open', 'match']) {
      await page.evaluate(async () => {
        for (const name of (await caches.keys()).filter(k => k.startsWith('dance-stamp-web-'))) await (await caches.open(name)).put('/timeline.js', new Response('synthetic corrupt module'));
      });
      await worker.evaluate(mode => { self.cacheFault = mode; }, mode);
      const result = await page.evaluate(async () => {
        try { const response = await fetch('/timeline.js', { cache: 'reload' }); return { status: response.status, text: await response.text() }; }
        catch (error) { return { error: String(error) }; }
      });
      assert(result.status === 200 && result.text === expected, `${mode} 快取故障阻止正確在線資源：${JSON.stringify(result)}`);
      await page.reload();
      await page.waitForFunction(() => !document.getElementById('controls')?.disabled && document.getElementById('offline-status')?.textContent.includes('不完整'));
      assert(JSON.stringify(await snapshot()) === JSON.stringify(before), `${mode} 故障改動筆記或合成副本`);
      await worker.evaluate(() => { self.cacheFault = ''; });
    }
    await page.evaluate(async () => { await fetch('/timeline.js', { cache: 'reload' }); });
    await page.locator('#offline-panel').evaluate(d => { d.open = true; }); await page.locator('#check-offline').click(); await ready();
    await context.setOffline(true); await page.reload(); await ready();
    assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '修復後離線重開改動資料');
    return { realWorker: true, corruptCacheNeverServed: true, quotaOpenAndReadFailureKeepOnlineAppUsable: true, incompleteUntilRepair: true, repairedOfflineReload: true, notesAndSyntheticBytesPreserved: true };
  } finally { await context.close(); }
}
