/* 檔案用途：僅本機合成驗收用的 SW 更新主機，可切換完整／損壞候選。所在層：瀏覽器測試工具。主要關聯：offline-update.js、build-web.ts；產品主機沒有測試控制入口。 */
import { resolve } from 'node:path'
const root = resolve(import.meta.dir, '../../dist/web')
const paths = new Map([
  ['/', 'index.html'], ['/style.css', 'style.css'], ['/main.js', 'main.js'],
  ['/timeline.js', 'timeline.js'], ['/recorder.js', 'recorder.js'], ['/library.js', 'library.js'], ['/storage.js', 'storage.js'], ['/offline.js', 'offline.js'], ['/sw.js', 'sw.js'], ['/LICENSE', 'LICENSE'], ['/THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
])
let mode = 'current'
const server = Bun.serve({
  hostname: '127.0.0.1', port: 4180,
  async fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    const url = new URL(request.url)
    if (url.pathname === '/__test__/version') { const next = url.searchParams.get('mode'); if (next && ['current','next','later','bad'].includes(next)) mode = next; return new Response(mode) }
    const file = paths.get(url.pathname)
    // 明確白名單且只允許讀取，不能用此伺服器上傳影片或讀到 .env／Git。
    if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    let content: Blob = Bun.file(resolve(root, file))
    if (file === 'sw.js' && mode !== 'current') { let source = await content.text(); source = source.replace(/const version = '([^']+)'/, (_, v) => `const version = '${v}-${mode}'`); if (mode === 'bad') source = source.replace(/(\"\/style.css\":\")[a-f0-9]+/, '$1' + '0'.repeat(64)); content = new Blob([source]); }
    return new Response(request.method === 'HEAD' ? null : content, { headers: {
      'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    } })
  },
})
console.log(`Dance Stamp Web：${server.url}（僅此電腦；未對外發布）`)
