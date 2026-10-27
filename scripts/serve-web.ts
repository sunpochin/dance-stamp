/* 檔案用途：只提供 M0 原型白名單資源，不暴露 repo 或私人媒體。所在層：本機試驗入口。主要關聯：web/、MEDIA_PROBE.md、PHONE_MEDIA_CHECK.md。 */
import { resolve } from 'node:path'
const root = resolve(import.meta.dir, '../dist/web')
const port = Number(process.env.DANCE_STAMP_PORT ?? 4173)
const hostname = process.env.DANCE_STAMP_HOST ?? '127.0.0.1'
const cert = process.env.DANCE_STAMP_TLS_CERT, key = process.env.DANCE_STAMP_TLS_KEY
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('測試連接埠必須介於 1–65535。')
if (!!cert !== !!key) throw new Error('HTTPS 測試必須同時提供憑證與私鑰。')
// 手機相機必須使用可信 HTTPS；只有明確設定才開放區網，不更動預設本機入口。
if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) && !cert) throw new Error('區網媒體測試必須提供 HTTPS 憑證。')
const paths = new Map([
  ['/', 'index.html'], ['/style.css', 'style.css'], ['/main.js', 'main.js'],
  ['/timeline.js', 'timeline.js'], ['/recorder.js', 'recorder.js'], ['/library.js', 'library.js'], ['/storage.js', 'storage.js'], ['/sw.js', 'sw.js'], ['/LICENSE', 'LICENSE'], ['/THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
])
// 測片只有明確開啟時可讀，仍不提供目錄、任意路徑或上傳入口。
if (process.env.DANCE_STAMP_TEST_MEDIA === '1') paths.set('/test-reference.mp4', '../../output/media-feasibility/reference.mp4')
const server = Bun.serve({
  hostname, port,
  tls: cert && key ? { cert: Bun.file(cert), key: Bun.file(key) } : undefined,
  fetch(request) {
    const file = paths.get(new URL(request.url).pathname)
    // 明確白名單且只允許讀取，不能用此伺服器上傳影片或讀到 .env／Git。
    if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : Bun.file(resolve(root, file)), { headers: {
      'Content-Type': file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    } })
  },
})
console.log(`Dance Stamp Web：${server.url}（${cert ? 'HTTPS 媒體測試' : '僅此電腦'}；未發布）`)
