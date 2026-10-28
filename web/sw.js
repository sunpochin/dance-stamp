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
  // 不呼叫 skipWaiting／claim；整批驗證後才安裝，失敗只移除這個未完成的新版 cache。
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
  e.respondWith(caches.open(cacheName).then(async cache => {
    const cached = await cache.match(url.pathname);
    if (cached && await matches(cached, url.pathname)) return cached;
    // 舊版缺檔時不能從新版主機混入不相容模組；符合本版雜湊才可補回。
    const response = await fetch(e.request);
    if (!await matches(response, url.pathname)) return new Response('應用版本不完整，請先備份並關閉所有本站分頁後重開。', { status: 503 });
    await cache.put(url.pathname, response.clone()); return response;
  }));
});
worker.addEventListener('message', e => {
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
