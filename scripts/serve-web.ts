/* 檔案用途：只提供 M0 原型白名單資源，不暴露 repo 或私人媒體。所在層：本機試驗入口。主要關聯：prototypes/media/、MEDIA_PROBE.md。 */
import { resolve } from 'node:path'
const root = resolve(import.meta.dir, '../dist/web')
const paths = new Map([
  ['/', 'index.html'], ['/style.css', 'style.css'], ['/main.js', 'main.js'],
  ['/timeline.js', 'timeline.js'], ['/recorder.js', 'recorder.js'], ['/library.js', 'library.js'], ['/storage.js', 'storage.js'], ['/sw.js', 'sw.js'],
])
const server = Bun.serve({
  hostname: '127.0.0.1', port: 4173,
  fetch(request) {
    const file = paths.get(new URL(request.url).pathname)
    // 明確白名單且只允許讀取，不能用此伺服器上傳影片或讀到 .env／Git。
    if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : Bun.file(resolve(root, file)), { headers: {
      'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    } })
  },
})
console.log(`Dance Stamp Web：${server.url}（僅此電腦；未對外發布）`)
