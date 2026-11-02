/* 檔案用途：以合成數拍驗證節拍器的真瀏覽器流程。所在層：本機 QA。主要關聯：web/metronome.js、tests/unit/tempo.test.ts。 */
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { webPaths, webHeaders } from './web-assets'
import { verifyMetronomeStartup } from '../tests/browser/metronome-startup'
const root = resolve(import.meta.dir, '..')
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
  const file = webPaths.get(new URL(request.url).pathname)
  return file ? new Response(Bun.file(resolve(root, 'dist/web', file)), { headers: { ...webHeaders, 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' } }) : new Response('missing', { status: 404 })
} })
const browser = await chromium.launch({ executablePath: process.env.DANCE_STAMP_CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const workspace = await browser.newPage({ viewport: { width: 320, height: 800 } }), errors: string[] = []
  workspace.on('pageerror', error => errors.push(error.message))
  await workspace.addInitScript(() => Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }))
  await workspace.goto(String(server.url))
  const idle = () => workspace.waitForFunction(() => document.querySelector('#storage-status')!.textContent !== '正在開啟本機筆記…' && document.querySelector('#library-panel')!.getAttribute('aria-busy') !== 'true')
  await idle()
  // 真正選取未保存的雙片後開工具；只驗空白首頁會漏掉切頁丟失當次原片。
  const video = Bun.spawnSync(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov', 'pipe:1'])
  assert.equal(video.exitCode, 0, video.stderr.toString())
  const fixture = { name: 'synthetic.mp4', mimeType: 'video/mp4', buffer: Buffer.from(video.stdout) }
  await workspace.locator('#reference-file').setInputFiles(fixture)
  await idle()
  await workspace.waitForFunction(() => document.querySelector<HTMLVideoElement>('#reference')!.readyState >= 2 && !document.querySelector<HTMLButtonElement>('#select-self-video')!.disabled)
  await workspace.locator('#self-file').setInputFiles(fixture)
  await idle()
  await workspace.waitForFunction(() => document.querySelector<HTMLVideoElement>('#self')!.readyState >= 2)
  const snapshot = () => workspace.evaluate(async () => ({
    library: JSON.stringify(await (await import('/storage.js')).readLibrary()),
    sources: ['reference', 'self'].map(id => document.querySelector<HTMLVideoElement>('#' + id)!.src),
  }))
  const before = await snapshot()
  assert(before.sources.every(Boolean))
  const popup = workspace.waitForEvent('popup', { timeout: 5000 })
  await workspace.getByRole('link', { name: /節拍器／偵測 BPM/ }).click()
  const page = await popup
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForLoadState()
  assert.equal(await page.evaluate(() => window.opener), null)
  assert.deepEqual(await snapshot(), before, '開節拍器改掉原工作台的原片或配方')
  // 用已知 120 BPM 的音節狀包絡走原生檔案解碼和 AudioWorklet；不只呼叫估算函式。
  const wav = Buffer.alloc(44 + 16000 * 21 * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
  for (let i = 0; i < 16000 * 21; i++) {
    const t = i / 16000, phase = t % 0.5, envelope = Math.exp(-(((phase - 0.07) / 0.035) ** 2))
    wav.writeInt16LE(Math.round(Math.sin(t * 440 * 2 * Math.PI) * envelope * 12000), 44 + i * 2)
  }
  console.log('PASS startup:', JSON.stringify(await verifyMetronomeStartup(browser, String(server.url), wav)))
  await page.locator('#source-file').setInputFiles({ name: 'synthetic-count.wav', mimeType: 'audio/wav', buffer: wav })
  await page.waitForFunction(() => document.querySelector<HTMLVideoElement>('#source')!.readyState >= 1)
  await page.locator('#analyze').click()
  await page.waitForFunction(() => !document.querySelector<HTMLElement>('#result')!.hidden, {}, { timeout: 28000 })
  assert.match(await page.locator('#result-text').innerText(), /120 BPM/)
  await page.locator('#candidates button').first().click()
  assert.equal(await page.locator('#bpm').inputValue(), '120')
  await page.locator('#half').click(); assert.equal(await page.locator('#bpm').inputValue(), '60')
  await page.locator('#double').click(); assert.equal(await page.locator('#bpm').inputValue(), '120')
  await page.locator('#bpm').fill(''); await page.locator('#toggle').click()
  assert.match(await page.locator('#play-status').innerText(), /20–300/)
  await page.locator('#bpm').fill('120'); await page.locator('#bpm').dispatchEvent('change')
  await page.locator('#source').evaluate(async (video: HTMLVideoElement) => { video.currentTime = 0; await video.play() })
  await page.locator('#toggle').click()
  await page.waitForTimeout(700)
  assert.equal(await page.locator('#toggle').getAttribute('aria-pressed'), 'true')
  assert.notEqual(await page.locator('#pulse').innerText(), '—')
  assert.equal(await page.locator('#source').evaluate((video: HTMLVideoElement) => video.paused), false)
  // 合成 hidden 事件只證明應用的停止處理；不冒充真機鎖屏或聽感驗收。
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  assert.equal(await page.locator('#toggle').getAttribute('aria-pressed'), 'false')
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: false }))
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('#analyze').click(); await page.waitForTimeout(200); await page.locator('#cancel-analysis').click()
    assert.match(await page.locator('#analysis-status').innerText(), /取消/)
    assert.equal(await page.locator('#source').evaluate((video: HTMLVideoElement) => video.paused), true)
  }
  await page.close()
  assert.deepEqual(await snapshot(), before, '關閉節拍器後原片或配方未保留')
  const standalone = await browser.newPage()
  standalone.on('pageerror', error => errors.push(error.message))
  await standalone.goto(new URL('/metronome.html', server.url).href)
  assert.equal(await standalone.evaluate(() => window.opener), null)
  assert.equal(await standalone.getByRole('link', { name: '開啟練舞工作台' }).getAttribute('href'), '/')
  await standalone.locator('#toggle').click()
  await standalone.waitForFunction(() => document.querySelector('#toggle')!.getAttribute('aria-pressed') === 'true')
  await standalone.locator('#toggle').click()
  assert.equal(await standalone.locator('#toggle').getAttribute('aria-pressed'), 'false')
  await standalone.close()
  assert.deepEqual(errors, [])
  console.log('PASS: 原工作台雙片／配方保全、獨立直開、120 BPM 原生分析、套用、半速／倍速、無效輸入、播放／停止、背景處理、320px、取消重試；無頁面錯誤。')
} finally { await browser.close(); await server.stop() }
