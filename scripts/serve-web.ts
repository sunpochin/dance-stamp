/* 檔案用途：只提供白名單應用資源，不暴露 repo 或私人媒體。所在層：開發與下載包的本機入口。主要關聯：web-assets.ts、START_HERE.md。 */
import { resolve } from 'node:path'
import { webPaths as paths, webHeaders } from './web-assets'
const root = resolve(import.meta.dir, '../dist/web')
// 下載包可固定使用自己的 port；不搶用已有主機或自動改位址，避免資料看似消失。
const port = process.argv[2] === undefined ? 4173 : Number(process.argv[2])
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('請指定 1–65535 的固定本機連接埠。')
const server = Bun.serve({
  hostname: '127.0.0.1', port,
  fetch(request) {
    const file = paths.get(new URL(request.url).pathname)
    // 明確白名單且只允許讀取，不能用此伺服器上傳影片或讀到 .env／Git。
    if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : Bun.file(resolve(root, file)), { headers: {
      'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      ...webHeaders,
    } })
  },
})
console.log(`Dance Stamp Web：${server.url}（僅此電腦；未對外發布）`)
