/* 檔案用途：只快取靜態應用資源，讓已載入的 Web 版可離線重開。所在層：Service Worker。主要關聯：build-web.ts、main.js。 */
/** @type {ServiceWorkerGlobalScope} */
const worker = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));
const version = '__BUILD__', cacheName = `dance-stamp-web-${version}`;
/** @type {Record<string, string>} */
const manifest = /* __MANIFEST__ */ {};
const files = Object.keys(manifest);
async function matches(response, path) {
  if (!response?.ok) return false;
  const hash = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('') === manifest[path];
}
worker.addEventListener('install', e => {
  // 安裝不自動 skipWaiting／claim；整批驗證後才等待，失敗只移除這個未完成的新版 cache。
  e.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      for (const path of files) {
        const response = await fetch(new Request(path, { cache: 'reload' }));
        if (!await matches(response, path)) throw new Error('應用資源不完整，舊版保留。');
        await cache.put(path, response);
      }
    } catch (error) { await caches.delete(cacheName); throw error; }
  })());
});
worker.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('dance-stamp-web-') && k !== cacheName).map(k => caches.delete(k))))));
worker.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 影片、筆記、其他 origin 及非 GET 不進 SW；媒體保存在獨立的本機儲存層。
  if (e.request.method !== 'GET' || url.origin !== worker.location.origin || !files.includes(url.pathname)) return;
  e.respondWith((async () => {
    /** @type {Cache | undefined} */
    let cache;
    try {
      cache = await caches.open(cacheName);
      const cached = await cache.match(url.pathname);
      if (cached && await matches(cached, url.pathname)) return cached;
    } catch { /* 快取暫時無法讀取時仍可在線取回，但不能略過下面的版本驗證。 */ }
    // 舊版缺檔時不能從新版主機混入不相容模組；符合本版雜湊才可補回。
    const response = await fetch(e.request);
    if (!await matches(response, url.pathname)) return new Response('應用版本不完整，請先備份並關閉所有本站分頁後重開。', { status: 503 });
    // 容量不足不能讓正確的在線頁面也失效；未補存仍由離線檢查誠實回報不完整。
    try { await cache?.put(url.pathname, response.clone()); } catch { /* 本次回應可用，不代表已保存副本。 */ }
    return response;
  })());
});
worker.addEventListener('message', e => {
  if (e.data?.type === 'ACTIVATE_UPDATE' && e.ports[0]) {
    e.waitUntil((async () => {
      try {
        // 同意只涵蓋發起的分頁；其他舊頁可能正在錄影或有草稿，不能一併強制接管。
        const pages = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (pages.length !== 1 || !e.source || !('id' in e.source) || pages[0].id !== e.source.id) throw new Error('其他本站分頁仍開著。請先保存並關閉其他分頁，再按「立即更新」；目前工作保留。');
        await worker.skipWaiting();
      } catch (error) { e.ports[0].postMessage({ error: error instanceof Error ? error.message : '更新未完成，請稍後再試。' }); }
    })());
    return;
  }
  if (e.data?.type !== 'CHECK_OFFLINE' || !e.ports[0]) return;
  e.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName), missing = [];
      // API 存在不能當成離線就緒；被清掉或損壞的實際資源也要顯示缺少。
      for (const path of files) if (!await matches(await cache.match(path), path)) missing.push(path);
      e.ports[0].postMessage({ version, complete: files.length > 0 && missing.length === 0, missing });
    } catch { e.ports[0].postMessage({ version, complete: false }); }
  })());
});
