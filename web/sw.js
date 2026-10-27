/* 檔案用途：只快取靜態應用資源，讓已載入的 Web 版可離線重開。所在層：Service Worker。主要關聯：build-web.ts、main.js。 */
/** @type {ServiceWorkerGlobalScope} */
const worker = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));
const cacheName = 'dance-stamp-web-__BUILD__';
const files = ['/', '/style.css', '/main.js', '/timeline.js', '/recorder.js', '/library.js', '/storage.js'];
worker.addEventListener('install', e => {
  // 不呼叫 skipWaiting，避免錄影或資料交易中途被新版接管。
  e.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)));
});
worker.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('dance-stamp-web-') && k !== cacheName).map(k => caches.delete(k))))));
worker.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 影片、筆記、其他 origin 及非 GET 不進 SW；媒體保存在獨立的本機儲存層。
  if (e.request.method !== 'GET' || url.origin !== worker.location.origin || !files.includes(url.pathname)) return;
  e.respondWith(caches.open(cacheName).then(async cache => await cache.match(url.pathname) || fetch(e.request)));
});
