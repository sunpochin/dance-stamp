/* 檔案用途：驗證斷網重開、真實快取缺檔、容量及 persist 拒絕。所在層：隔離 PWA 回歸。主要關聯：offline.js、sw.js、storage.js。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  const snapshot = () => page.evaluate(async () => await (await import('/storage.js')).readLibrary());
  await page.addInitScript(() => {
    window.syntheticPersistMode = 'denied'; window.syntheticPersistCalls = 0;
    Object.defineProperty(navigator.storage, 'persist', { value: async () => { window.syntheticPersistCalls++; if (window.syntheticPersistMode === 'error') throw new Error('synthetic persist'); return window.syntheticPersistMode === 'allowed'; } });
    Object.defineProperty(navigator.storage, 'estimate', { value: async () => ({ usage: 15 * 1048576, quota: 16 * 1048576 }) });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new Error('此測試禁止相機'); } });
  });
  await page.goto(origin); await idle();
  await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('已檢查應用資源完整'));
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  await page.locator('#copy-reference').click(); await idle(); await page.locator('#copy-self').click(); await idle();
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('離線前合成標記'); await page.locator('#marker-form').evaluate(f => f.requestSubmit()); await idle();
  const saved = await snapshot();
  for (const mode of ['quota', 'abort', 'cancel']) {
    await page.evaluate(mode => {
      window.offlinePut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name==='media' && mode==='quota') throw new DOMException('synthetic storage quota', 'QuotaExceededError');
        const req=window.offlinePut.apply(this,args);
        if (this.name==='media') { if (mode==='abort') this.transaction.abort(); else if (mode==='cancel') queueMicrotask(()=>document.getElementById('stop').click()); }
        return req;
      };
    }, mode);
    try { await page.locator('#copy-reference').click(); await idle(); }
    finally { await page.evaluate(()=> { IDBObjectStore.prototype.put=window.offlinePut; }); }
    assert(JSON.stringify(await snapshot())===JSON.stringify(saved) && await page.evaluate(async id => !!await (await import('/storage.js')).readMedia(id), saved.data.assets.find(a=>a.kind==='reference').id), mode+' 破壞舊副本或筆記');
  }
  await page.locator('#offline-panel').evaluate(d => { d.open = true; });
  assert(await page.evaluate(() => window.syntheticPersistCalls === 0), '未點按就請求 persist');
  assert((await page.locator('#capacity-status').textContent()).includes('可用 1.0 MiB'), '容量沒有顯示實際 API 回傳估計');
  for (const mode of ['denied', 'error', 'allowed']) {
    await page.evaluate(mode => { window.syntheticPersistMode = mode; }, mode);
    await page.locator('#request-persist').click(); await page.waitForFunction(() => !document.getElementById('request-persist').disabled);
    const text = await page.locator('#persistence-status').textContent();
    assert(text.includes(mode === 'denied' ? '未允許' : mode === 'error' ? '失敗' : '已允許'), 'persist 結果說法不實');
    assert(JSON.stringify(await snapshot()) === JSON.stringify(saved), 'persist 改了筆記');
  }
  await page.context().setOffline(true); await page.reload(); await idle();
  assert(await page.evaluate(() => !!navigator.serviceWorker.controller), '斷網後沒有受離線服務控制');
  await page.locator('#library').selectOption(saved.data.videos[0].id); await page.locator('#open-library').click(); await idle();
  await page.getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
  assert(await page.locator('#reference').evaluate(v => v.readyState >= 2) && await page.locator('#self').evaluate(v => v.readyState >= 2), '斷網重開沒有取回保存雙片');
  assert(JSON.stringify((await snapshot()).data.markers) === JSON.stringify(saved.data.markers), '斷網重開丟失標記');
  for (const [id, value] of [['start', '12'], ['end', '17'], ['offset', '4']]) { await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); await idle(); }
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '斷網雙片無法輸出');
  const download = page.waitForEvent('download'); await page.locator('#output-download').click(); await (await download).saveAs('output/media-probe/offline-existing-vs.mp4');
  // 直接移除這個隔離 context 的一個公開資源，必須回報不完整而非只看 SW 是否註冊。
  const afterExport = await snapshot();
  await page.evaluate(async () => { const keys = await caches.keys(); for (const key of keys.filter(k => k.startsWith('dance-stamp-web-'))) await (await caches.open(key)).delete('/timeline.js'); });
  await page.locator('#offline-panel').evaluate(d => { d.open = true; }); await page.locator('#check-offline').click();
  await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('不完整'));
  assert(JSON.stringify(await snapshot()) === JSON.stringify(afterExport), '快取缺檔改動私人資料');
  await page.context().setOffline(false); await page.evaluate(async () => { await fetch('/timeline.js'); });
  await page.locator('#check-offline').click(); await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('已檢查應用資源完整'));
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), '離線容量窄版溢出');
  await page.screenshot({ path: 'output/offline13-status.png', fullPage: true });
  await page.locator('#offline-panel').screenshot({ path:'output/offline13-capacity.png' });
  const first = await page.context().browser().newContext();
  try { await first.setOffline(true); const empty = await first.newPage(); let failed = false; try { await empty.goto(origin); } catch { failed = true; } assert(failed, '未快取環境竟冒充可首次離線開站'); }
  finally { await first.close(); }
  return { persistOnlyOnClick: true, deniedErrorAndAllowedTruthful: true, quotaAbortAndCancelKeepOldCopy: true, estimatedCapacityNotGuarantee: true, offlineReopensNotesAndTwoCopies: true, offlineExportsRealVs: true, missingCacheReportedAndRepaired: true, firstOfflineStartUnsupported: true, narrowLayout: true };
}
