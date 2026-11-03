/* 檔案用途：驗證主機 HTML 轉址遇到原生離線快取仍可導航。所在層：本機 QA。主要關聯：sw.js、web-assets.ts、WEB_PREVIEW.md。 */
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { webHeaders, webPaths } from './web-assets'
const root = resolve(import.meta.dir, '..')
let htmlFetches = 0, wrongHtml = false
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
  const path = new URL(request.url).pathname
  // 重現主機的真 307，而非偽造 Response.redirected 或直接注入快取成功。
  if (path === '/metronome.html') { htmlFetches++; return Response.redirect(new URL('/metronome', request.url), 307) }
  const file = path === '/metronome' ? 'metronome.html' : webPaths.get(path)
  if (!file) return new Response('missing', { status: 404 })
  return new Response(wrongHtml && path === '/metronome' ? 'synthetic wrong version' : Bun.file(resolve(root, 'dist/web', file)), { headers: { ...webHeaders, 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream' } })
} })
const browser = await chromium.launch({ executablePath: process.env.DANCE_STAMP_CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const context = await browser.newContext(), errors: string[] = []
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
  const page = await context.newPage(), origin = String(server.url)
  await page.goto(origin)
  await page.waitForFunction(() => document.querySelector('#offline-status')?.textContent?.includes('已檢查應用資源完整'))
  await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  const cached = await page.evaluate(async () => {
    const names = await caches.keys(), name = names.find(n => n.startsWith('dance-stamp-web-'))!
    const response = await (await caches.open(name)).match('/metronome.html')
    return { name, redirected: response?.redirected }
  })
  assert.equal(cached.redirected, true, '必須真的留下平台轉址後的快取，才涵蓋原失敗')
  const visit = async () => {
    const tab = await context.newPage(), response = await tab.goto(new URL('/metronome.html', origin).href)
    assert.equal(response?.status(), 200); assert.equal(response?.fromServiceWorker(), true)
    assert.equal(await response!.headerValue('Content-Security-Policy'), webHeaders['Content-Security-Policy'])
    await tab.getByRole('button', { name: '開始節拍器', exact: true }).click()
    await tab.waitForFunction(() => document.querySelector('#toggle')?.getAttribute('aria-pressed') === 'true')
    await tab.getByRole('button', { name: '停止節拍器', exact: true }).click()
    await tab.close()
  }
  await visit()
  await context.setOffline(true); const before = htmlFetches
  await visit(); assert.equal(htmlFetches, before, '離線導航不能繞回網路')
  await context.setOffline(false)
  // 遺失副本要走真轉址在線補回，且仍維持原 manifest 雜湊驗證。
  await page.evaluate(async name => { await (await caches.open(name)).delete('/metronome.html') }, cached.name)
  wrongHtml = true
  const invalid = await context.newPage(), rejected = await invalid.goto(new URL('/metronome.html', origin).href)
  assert.equal(rejected?.status(), 503)
  assert.equal(await page.evaluate(async name => !!await (await caches.open(name)).match('/metronome.html'), cached.name), false)
  await invalid.close(); wrongHtml = false
  await visit(); assert(htmlFetches > before)
  await context.setOffline(true); await visit()
  assert.deepEqual(errors, [])
  console.log('PASS: 原生307快取、在線／離線HTML導航、錯版拒絕／缺檔補回及再次離線、節拍器播放／停止；無頁面錯誤。')
} finally { await browser.close(); await server.stop() }
