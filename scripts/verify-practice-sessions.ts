/* 檔案用途：以合成媒體驗證 #259 桌面回合與資料保全。所在層：本機瀏覽器 QA。主要關聯：practice-sessions-ui.js、tests/unit/practiceSessions.test.ts。 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { webPaths, webHeaders } from './web-assets'

const root = resolve(import.meta.dir, '..'), out = resolve(root, 'output/playwright/practice-sessions', new Date().toISOString().replaceAll(':', '-'))
mkdirSync(out, { recursive: true })
const media = Bun.spawnSync(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '40', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov', 'pipe:1'])
assert.equal(media.exitCode, 0, media.stderr.toString())
const fixture = { name: 'synthetic-practice.mp4', mimeType: 'video/mp4', buffer: Buffer.from(media.stdout) }
// 合成來源也隨每輪保留，失敗不能只剩截圖或改用下一輪素材。
writeFileSync(resolve(out, 'reference.mp4'), fixture.buffer)
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
  const file = webPaths.get(new URL(request.url).pathname)
  return file ? new Response(Bun.file(resolve(root, 'dist/web', file)), { headers: { ...webHeaders, 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' } }) : new Response('missing', { status: 404 })
} })
const browser = await chromium.launch({ executablePath: process.env.DANCE_STAMP_CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
const page = await context.newPage(), errors: string[] = [], external: string[] = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (!request.url().startsWith(String(server.url)) && /^https?:/.test(request.url())) external.push(request.url()) })
page.on('dialog', dialog => dialog.accept())
const idle = (p = page) => p.waitForFunction(() => document.getElementById('controls')?.getAttribute('aria-busy') !== 'true' && !document.getElementById('storage-status')?.textContent?.includes('正在開啟'))
const read = (p = page): Promise<any> => p.evaluate(async () => (await import('/storage.js')).readLibrary())
async function click(id: string, p = page) { await p.locator('#' + id).click(); await idle(p) }
async function start(p = page) { await click('session-start', p); await p.waitForFunction(() => !document.querySelector<HTMLVideoElement>('#reference')!.paused) }
async function follow(p = page) { await click('session-follow', p); await p.waitForFunction(() => document.querySelector('#session-stage')!.textContent!.includes('2/3')) }
async function save(assessment = '', p = page, next = false) {
  await click('session-review', p); await p.locator('#session-followed').check(); await p.locator('#session-assessment').selectOption(assessment)
  if (next) await p.locator('#session-next').check()
  await click('session-save', p); await p.waitForFunction(() => !document.querySelector<HTMLElement>('#session-start')!.hidden)
}
const checks: Record<string, unknown> = {}
try {
  await page.addInitScript(() => {
    // 測試觀察已交付播放器的 Blob；不放寬產品禁止 fetch blob: 的 CSP。
    const createURL = URL.createObjectURL.bind(URL); (window as any).practiceBlobs = new Map()
    URL.createObjectURL = blob => { const url = createURL(blob); (window as any).practiceBlobs.set(url, blob); return url }
    const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    ;(window as any).cameraRequests = 0; (window as any).cameraTracks = []
    navigator.mediaDevices.getUserMedia = async constraints => {
      ;(window as any).cameraRequests++
      if ((window as any).denyCamera) throw new DOMException('synthetic denied', 'NotAllowedError')
      const stream = await native(constraints); (window as any).cameraTracks.push(...stream.getTracks()); return stream
    }
  })
  await page.goto(String(server.url)); await idle()
  assert(await page.locator('#practice-sessions').isVisible())
  await page.locator('#reference-file').setInputFiles(fixture); await idle()
  await click('session-notes')
  // 從可見的標記表單建立四段，不移除首頁模式或偽造播放器時間。
  const ranges = [[1, 2], [5, 7], [18, 26], [30, 32]]
  for (const [i, [a, b]] of ranges.entries()) {
    await click('mark'); await page.locator('#marker-title').fill(`合成第 ${i + 1} 段`)
    await page.locator('#marker-start').fill(String(a)); await page.locator('#marker-end').fill(String(b)); await page.locator('#marker-form button[type=submit]').click(); await idle()
  }
  const markers = (await read()).data.markers
  await page.locator('#session-source').selectOption('marker:' + markers[0].id)
  await page.locator('#session-b').fill(''); await click('session-start')
  assert.match(await page.locator('#status').innerText(), /終點|B/)
  await page.locator('#session-source').focus(); await page.locator('#session-source').selectOption('marker:' + markers[2].id)
  await page.locator('#session-start').focus(); await page.keyboard.press('Enter'); await idle()
  await page.waitForFunction(() => document.querySelector('#session-stage')!.textContent!.includes('已停回 A'), null, { timeout: 40000 })
  assert(Math.abs(await page.locator('#reference').evaluate((v: HTMLVideoElement) => v.currentTime) - 18) < 0.15)
  assert.equal((await read()).data.sessions.length, 0)
  checks.keyboardThirdSegmentThreeRounds = true
  console.log('PASS: keyboardThirdSegmentThreeRounds')
  await click('session-exit')
  // 真正播至 EOF，原生 ended 與影格 callback 不能把一輪計兩次。
  await page.locator('#session-source').selectOption(''); await page.locator('#session-a').fill('38'); await page.locator('#session-b').fill('40'); await page.locator('#session-rate').selectOption('2')
  await page.evaluate(() => { (window as any).eofRewinds = 0; document.querySelector<HTMLVideoElement>('#reference')!.addEventListener('seeking', () => { if (Math.abs(document.querySelector<HTMLVideoElement>('#reference')!.currentTime - 38) < 0.001) (window as any).eofRewinds++ }) })
  await start(); await page.waitForFunction(() => document.querySelector('#session-stage')!.textContent!.includes('已停回 A'), null, { timeout: 12000 })
  await page.waitForFunction(() => !document.querySelector<HTMLVideoElement>('#reference')!.seeking)
  assert.equal(await page.evaluate(() => (window as any).eofRewinds), 4)
  assert.equal((await read()).data.sessions.length, 0); await click('session-exit')
  await page.locator('#session-rate').selectOption('0.75'); checks.eofExactlyThreeRounds = true
  // 暫停的半輪不算完整觀看；拒絕播放後仍可從 A 重試。
  await page.locator('#session-source').selectOption('marker:' + markers[0].id); await start(); await click('session-pause')
  assert.match(await page.locator('#session-stage').innerText(), /0\/3/)
  await page.evaluate(() => { (window as any).nativePlay259 = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('synthetic play denied', 'NotAllowedError')) })
  await click('session-replay'); assert(await page.locator('#reference').evaluate((v: HTMLVideoElement) => v.paused))
  await page.evaluate(() => { HTMLMediaElement.prototype.play = (window as any).nativePlay259 })
  await click('session-replay'); await follow(); await click('session-review'); await click('session-save')
  assert.equal((await read()).data.sessions.length, 0)
  await page.locator('#session-followed').check(); await click('session-save')
  assert.equal((await read()).data.sessions.length, 1)
  checks.partialPauseFailureRetryAndFollowConfirmation = true
  // 建立已成檔的另一組比較，再驗回合選錄不改其原片、設定或 VS。
  await page.locator('#start').fill('1'); await page.locator('#end').fill('2')
  await page.locator('#self-file').setInputFiles(fixture); await idle()
  await click('export')
  assert.match(await page.locator('#status').innerText(), /已成檔/)
  const workbench = () => page.evaluate(() => ({
    self: document.querySelector<HTMLVideoElement>('#self')!.src,
    start: (document.getElementById('start') as HTMLInputElement).value, end: (document.getElementById('end') as HTMLInputElement).value,
    output: (document.getElementById('output-download') as HTMLAnchorElement).href,
    selfDownload: (document.getElementById('take-download') as HTMLAnchorElement).href,
  }))
  const originalWorkbench = await workbench()
  // 18–26 在 0.75× 太短；0.5× 合法。授權拒絕後保留跟跳流程。
  await page.locator('#session-source').selectOption('marker:' + markers[2].id); await start(); await follow()
  assert(await page.locator('#session-record').isDisabled())
  assert.match(await page.locator('#session-record-hint').innerText(), /15–60/)
  await page.locator('#session-rate').selectOption('0.5'); await page.locator('#session-mirror').check()
  assert(await page.locator('#session-canvas').isVisible())
  assert.equal(await page.locator('#reference').evaluate(v => getComputedStyle(v).transform), 'none')
  assert.equal(await page.locator('#session-rate').evaluate(v => getComputedStyle(v).transform), 'none')
  await page.evaluate(() => { (window as any).denyCamera = true }); await click('session-record')
  assert.match(await page.locator('#status').innerText(), /相機|授權/)
  await page.evaluate(() => { (window as any).denyCamera = false })
  await page.locator('#session-next').evaluate((el: HTMLInputElement) => { el.checked = false })
  // 保存第 1 回合法選錄；實際假相機與原生 MediaRecorder 跑完整 16 秒。
  await click('session-record')
  await page.waitForFunction(() => document.getElementById('controls')!.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 })
  assert.equal((await read()).data.takes.filter(t => t.state === 'ready').length, 2)
  await save('unfamiliar')
  const segmentId = (await read()).data.segments.find(s => s.startMs === 18000).id
  for (let i = 2; i <= 4; i++) {
    await start(); await follow()
    if (i === 3) {
      await click('session-review'); await page.locator('#session-followed').check(); await page.locator('#session-assessment').selectOption('unfamiliar')
      const count = (await read()).data.sessions.length
      await page.evaluate(() => { (window as any).practicePut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { if (this.name === 'metadata') throw new DOMException('synthetic session quota', 'QuotaExceededError'); return (window as any).practicePut.apply(this, args) } })
      await click('session-save')
      assert.equal((await read()).data.sessions.length, count); assert(await page.locator('#session-followed').isChecked()); assert.equal(await page.locator('#session-assessment').inputValue(), 'unfamiliar')
      await page.evaluate(() => { IDBObjectStore.prototype.put = (window as any).practicePut })
      await page.locator('#session-save').evaluate(el => { el.dispatchEvent(new MouseEvent('click')); el.dispatchEvent(new MouseEvent('click')) }); await idle()
      await page.waitForFunction(() => !document.querySelector<HTMLElement>('#session-start')!.hidden)
      assert.equal((await read()).data.sessions.length, count + 1); checks.sessionQuotaRetryAndDoubleSave = true
    } else await save(i === 4 ? 'smoother' : '', page, i === 4)
  }
  await start(); await follow()
  await page.locator('#session-record').click()
  await page.waitForFunction(() => document.querySelector('#status')!.textContent!.includes('錄影中'), null, { timeout: 10000 })
  await click('stop')
  assert.equal((await read()).data.sessions.filter(s => s.segmentId === segmentId).length, 4)
  assert((await read()).data.takes.some(t => t.state === 'interrupted' || t.state === 'failed'))
  await click('session-record')
  await page.waitForFunction(() => document.getElementById('controls')!.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 })
  await save('unfamiliar')
  const five = (await read()).data.sessions.filter(s => s.segmentId === segmentId)
  assert.equal(five.length, 5); assert(five[0].takeId && five[4].takeId && five[0].takeId !== five[4].takeId)
  assert.deepEqual(await workbench(), originalWorkbench)
  const beforeReplay = await page.evaluate(() => ({ self: document.querySelector<HTMLVideoElement>('#self')!.src, start: (document.getElementById('start') as HTMLInputElement).value, end: (document.getElementById('end') as HTMLInputElement).value }))
  await page.getByRole('button', { name: '回看第 1 回', exact: true }).click(); await idle()
  const firstUrl = await page.locator('#session-video').getAttribute('src')
  const replayMatches = (takeId: string) => page.evaluate(async id => {
    const s = await import('/storage.js'), data = (await s.readLibrary()).data, take = data.takes.find(t => t.id === id)!
    const actual = await (window as any).practiceBlobs.get(document.querySelector<HTMLVideoElement>('#session-video')!.src).arrayBuffer(), stored = await (await s.readMedia(take.cameraAssetId))!.arrayBuffer()
    return actual.byteLength === stored.byteLength && new Uint8Array(actual).every((v, i) => v === new Uint8Array(stored)[i])
  }, takeId)
  assert(await replayMatches(five[0].takeId))
  await page.locator('#session-video').evaluate((v: HTMLVideoElement) => v.play()); await page.locator('#session-video').evaluate((v: HTMLVideoElement) => v.pause())
  await page.getByRole('button', { name: '回看第 5 回', exact: true }).click(); await idle()
  assert.notEqual(await page.locator('#session-video').getAttribute('src'), firstUrl)
  assert(await replayMatches(five[4].takeId))
  assert.deepEqual(await page.evaluate(() => ({ self: document.querySelector<HTMLVideoElement>('#self')!.src, start: (document.getElementById('start') as HTMLInputElement).value, end: (document.getElementById('end') as HTMLInputElement).value })), beforeReplay)
  assert(await page.evaluate(() => (window as any).cameraTracks.every(t => t.readyState === 'ended')))
  checks.shortCaptureDeniedAndFiveHistoryTakes = { first: !!five[0].takeId, fifth: !!five[4].takeId, distinct: true, noBorrowedSelf: true, tracksStopped: true }
  assert.match(await page.locator('#session-suggestion').innerText(), /你選/)
  await click('session-skip'); assert(await page.locator('#session-suggest').isDisabled())
  await click('session-auto'); assert.match(await page.locator('#session-suggestion').innerText(), /最新/)
  await page.getByRole('combobox', { name: '第 5 回自評', exact: true }).selectOption('smoother')
  await page.getByRole('button', { name: '更新第 5 回自評', exact: true }).click(); await idle()
  assert(await page.locator('#session-suggest').isDisabled())
  await page.getByRole('combobox', { name: '第 5 回自評', exact: true }).selectOption('unfamiliar')
  await page.getByRole('button', { name: '更新第 5 回自評', exact: true }).click(); await idle()
  assert(await page.locator('#session-suggest').isEnabled()); checks.latestAssessmentManualAndSkip = true
  await page.locator('#practice-sessions').screenshot({ path: resolve(out, 'desktop.png') })
  console.log('PASS: shortCaptureDeniedAndFiveHistoryTakes')
  // 真實下載 JSON，再隔離環境還原；原片另存，不將 Blob 放進 JSON。
  await page.locator('#backup').evaluate(el => { for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true })
  const [download] = await Promise.all([page.waitForEvent('download'), click('backup')])
  const backup = JSON.parse(readFileSync((await download.path())!, 'utf8'))
  assert.equal(backup.schemaVersion, 3); assert.equal(backup.sessions.length, 6)
  assert(!JSON.stringify(backup).includes('blob:'))
  const restoredContext = await browser.newContext(), restored = await restoredContext.newPage(); restored.on('dialog', d => d.accept())
  await restored.goto(String(server.url)); await idle(restored); await click('session-notes', restored)
  await restored.locator('#note-tools > summary').click()
  await restored.locator('#restore').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) }); await idle(restored)
  await click('import-confirm', restored); assert.equal((await read(restored)).data.sessions.length, 6)
  await restored.locator('#session-source').selectOption('segment:' + segmentId)
  await click('session-start', restored); assert.match(await restored.locator('#status').innerText(), /重連|連結/)
  assert.equal((await read(restored)).data.sessions.length, 6)
  const beforeMissingTake = (await read(restored)).revision
  await restored.getByRole('button', { name: '回看第 1 回', exact: true }).click(); await idle(restored)
  assert(await restored.locator('#media-dialog').evaluate((d: HTMLDialogElement) => d.open))
  assert(await restored.locator('#session-video').isHidden())
  await click('relink-cancel', restored); assert.equal((await read(restored)).revision, beforeMissingTake)
  // 原片缺失仍能看歷史；取消／壞候選不改舊連結。這裡只重連該回自己的原片。
  const firstTake = (await read()).data.takes.find(t => t.id === five[0].takeId)
  const bytes = await page.evaluate(async id => Array.from(new Uint8Array(await (await (await import('/storage.js')).readMedia(id))!.arrayBuffer())), firstTake.cameraAssetId)
  await restored.getByRole('button', { name: '回看第 1 回', exact: true }).click(); await idle(restored)
  await restored.locator('#relink-file').setInputFiles({ name: 'synthetic-take.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) }); await idle(restored)
  await restored.locator('#relink-checked').check(); await click('relink-confirm', restored)
  await restored.getByRole('button', { name: '回看第 1 回', exact: true }).click(); await idle(restored)
  assert(await restored.locator('#session-video').isVisible())
  await restored.getByRole('button', { name: '回看第 5 回', exact: true }).click(); await idle(restored)
  assert(await restored.locator('#session-video').isHidden()); assert(await restored.locator('#media-dialog').evaluate((d: HTMLDialogElement) => d.open))
  await click('relink-cancel', restored)
  await restoredContext.close(); checks.fullJsonRoundTripMissingReferenceAndExactTakeRelink = true
  // 原頁重開不計新回合，改標記保留快照；真正競寫與 quota／取消在同一 IDB 檢查。
  await page.reload(); await idle(); assert.equal((await read()).data.sessions.length, 6)
  checks.storage = await page.evaluate(async () => {
    const storage = await import('/storage.js'), library = await import('/library.js'), { data, revision } = await storage.readLibrary()
    const original = JSON.stringify(library.validateBackup(data)), aborted = new AbortController(); aborted.abort()
    let cancelled = false, conflict = false, quota = false
    try { await storage.writeLibrary(data, revision, undefined, aborted.signal) } catch { cancelled = true }
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function(...args) { if (this.name === 'metadata') throw new DOMException('synthetic quota', 'QuotaExceededError'); return put.apply(this, args) }
    try { await storage.writeLibrary(data, revision) } catch { quota = true } finally { IDBObjectStore.prototype.put = put }
    // 保留原生交易失敗後的精確資料比對，不用重設儲存。
    const unchanged = JSON.stringify(library.validateBackup((await storage.readLibrary()).data)) === original
    await storage.writeLibrary(data, revision)
    try { await storage.writeLibrary(data, revision) } catch { conflict = true }
    return { cancelled, quota, conflict, unchanged }
  })
  assert(Object.values(checks.storage as object).every(Boolean))
  const other = await context.newPage(); await other.goto(String(server.url)); await idle(other)
  const oldRevision = (await read(other)).revision
  await page.evaluate(async () => { const s = await import('/storage.js'), before = await s.readLibrary(); await s.writeLibrary(before.data, before.revision) })
  assert(await other.evaluate(async revision => { const s = await import('/storage.js'); try { await s.writeLibrary((await s.readLibrary()).data, revision); return false } catch { return true } }, oldRevision))
  await other.close(); checks.realTwoTabConflict = true
  await page.setViewportSize({ width: 375, height: 812 }); await page.locator('#session-source').selectOption('segment:' + segmentId); await page.locator('#practice-sessions').scrollIntoViewIfNeeded()
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: resolve(out, 'narrow.png'), fullPage: true })
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  const build = readFileSync(resolve(root, 'dist/web/sw.js'), 'utf8').match(/const version = ['"]([^'"]+)/)?.[1]
  const result = { browser: browser.version(), build, checks, errors, externalRequests: external.length }
  writeFileSync(resolve(out, 'result.json'), JSON.stringify(result, null, 2)); console.log('PASS:', JSON.stringify(result))
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {})
  writeFileSync(resolve(out, 'failure.json'), JSON.stringify({ message: String(error), checks, errors, status: await page.locator('#status').innerText().catch(() => ''), stage: await page.locator('#session-stage').innerText().catch(() => '') }, null, 2))
  throw error
} finally { await context.close(); await browser.close(); await server.stop() }
