/* 檔案用途：只提供白名單資源並支援明確啟用的媒體測試。所在層：開發與下載包本機入口。主要關聯：web-assets.ts、START_HERE.md、PHONE_MEDIA_CHECK.md。 */
import { lstatSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { webPaths, webHeaders } from './web-assets'
const base = resolve(import.meta.dir, '..'), root = resolve(base, 'dist/web')
// 預設固定 4174，避免與其他本機網站衝突或切換網址後讀不到原筆記；明確設定仍供隔離測試使用。
const port = Number(process.argv[2] ?? process.env.DANCE_STAMP_PORT ?? 4174)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('請指定 1–65535 的固定本機連接埠。')
const hostname = process.env.DANCE_STAMP_HOST ?? '127.0.0.1'
const cert = process.env.DANCE_STAMP_TLS_CERT, key = process.env.DANCE_STAMP_TLS_KEY
if (!!cert !== !!key) throw new Error('HTTPS 測試必須同時提供憑證與私鑰。')
// 手機相機必須使用可信 HTTPS；只有明確設定才開放區網，不更動預設本機入口。
if (!['127.0.0.1', 'localhost', '::1'].includes(hostname) && !cert) throw new Error('區網媒體測試必須提供 HTTPS 憑證。')
// 測試路由只加在副本，避免改到打包與一般主機共用的產品白名單。
const paths = new Map(webPaths)
if (process.env.DANCE_STAMP_TEST_MEDIA === '1') paths.set('/test-reference.mp4', '../../output/media-feasibility/reference.mp4')
const server = Bun.serve({
  hostname, port,
  tls: cert && key ? { cert: Bun.file(cert), key: Bun.file(key) } : undefined,
  fetch(request) {
    const file = paths.get(new URL(request.url).pathname)
    // 明確白名單且只允許讀取，不能用此伺服器上傳影片或讀到 .env／Git。
    if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    const target = resolve(root, file)
    try {
      // 網址白名單不能阻止檔案／父目錄被接到包外；每次讀取前都查，啟動後誤換連結也拒絕。
      let path = base
      for (const part of ['', ...relative(base, target).split(sep)]) {
        path = resolve(path, part)
        const stat = lstatSync(path)
        if (path === target ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory()) return new Response('Not found', { status: 404 })
      }
    } catch { return new Response('Not found', { status: 404 }) }
    return new Response(request.method === 'HEAD' ? null : Bun.file(target), { headers: {
      'Content-Type': file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      ...webHeaders,
    } })
  },
})
console.log(`Dance Stamp Web：${server.url}（${cert ? 'HTTPS 媒體測試' : '僅此電腦'}；未發布）`)
