/* 檔案用途：僅本機合成驗收用的 SW 更新主機，可切換完整／損壞候選。所在層：瀏覽器測試工具。主要關聯：offline-update.js、build-web.ts；產品主機沒有測試控制入口。 */
import { resolve } from 'node:path'
import { webPaths, webHeaders } from '../../scripts/web-assets'
const root = resolve(import.meta.dir, '../../dist/web')
// 與產品共用資源清單，新增拍點等模組時才不會只在更新測試漏檔。
const paths = new Map(webPaths)
const port = Number(process.env.DANCE_STAMP_TEST_PORT ?? 4180)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('請指定有效的本機測試連接埠。')
let mode = 'current'
const server = Bun.serve({
  hostname: '127.0.0.1', port,
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
      // 更新測試仍提供真正人物模型；WASM 的 MIME 不能被當一般文字而失去串流編譯。
      'Content-Type': file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.tflite') ? 'application/octet-stream' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      ...webHeaders,
    } })
  },
})
console.log(`Dance Stamp Web：${server.url}（僅此電腦；未對外發布）`)
