/* 檔案用途：只在 loopback 服務 Safari 原生儲存對照，不接收上傳。所在層：手動診斷入口。主要關聯：probe.html、probe.js、Safari 驗收文件。 */
import { resolve } from 'node:path'

const argument = process.argv[2] ?? '42847'
if (process.argv.length > 3 || !/^\d+$/.test(argument) || Number(argument) < 1024 || Number(argument) > 65535) {
  throw new Error('請提供 1024–65535 的本機測試 port')
}
// 白名單與固定 loopback 避免把診斷入口變成目錄服務或公開主機。
const files = new Map([['/', ['probe.html', 'text/html']], ['/probe.js', ['probe.js', 'text/javascript']]])
const server = Bun.serve({
  hostname: '127.0.0.1', port: Number(argument),
  fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 })
    const entry = files.get(new URL(request.url).pathname)
    if (!entry) return new Response('Not found', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : Bun.file(resolve(import.meta.dir, entry[0])), {
      headers: {
        'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'none'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'",
      },
    })
  },
})
console.log(`Safari 原生儲存對照：${server.url}`)
