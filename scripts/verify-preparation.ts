/* 檔案用途：用合成影片從正常首頁走準備、本人回報與備份恢復。所在層：本機瀏覽器回歸，不代替實體手機。主要關聯：preparation-ui.js、PRACTICE_SESSIONS.md。 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { webHeaders, webPaths } from './web-assets'
const root = resolve(import.meta.dir, '..'), out = resolve(root, 'output/preparation')
mkdirSync(out, { recursive: true })
const file = resolve(out, 'synthetic.mp4')
if (!await Bun.file(file).exists()) {
  const made = Bun.spawnSync(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', 'testsrc2=s=160x120:r=30:d=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file], { stderr: 'pipe' })
  assert.equal(made.exitCode, 0, made.stderr.toString())
}
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
  const file = webPaths.get(new URL(request.url).pathname)
  if (!file) return new Response('missing', { status: 404 })
  return new Response(Bun.file(resolve(root, 'dist/web', file)), { headers: { ...webHeaders, 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream' } })
} })
const browser = await chromium.launch({ executablePath: process.env.DANCE_STAMP_CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const evidence: any = { browser: browser.version(), workingTree: true, baseRevision: Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim(), build: (await Bun.file(resolve(root, 'dist/web/sw.js')).text()).match(/const version = '([^']+)'/)?.[1], checks: [], errors: [] }
try {
  const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage(), origin = String(server.url)
  page.on('pageerror', error => evidence.errors.push(error.message))
  const settle = () => page.waitForFunction(() => !(document.querySelector('#controls') as HTMLFieldSetElement).disabled && !(document.querySelector('#preparation-controls') as HTMLFieldSetElement).disabled)
  const data = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data)
  const click = async (id: string) => { await page.locator('#' + id).click(); await settle() }
  await page.goto(origin); await settle()
  await click('open-preparation')
  await page.locator('#reference-file').setInputFiles(file); await settle()
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.startsWith('示範影片已載入'))
  await page.locator('#preparation-name').fill('合成目標')
  await page.locator('#preparation-reason').fill('合成練習理由')
  for (const [id, value] of [['target-start', '1'], ['target-end', '7'], ['starter-start', '2'], ['starter-end', '9']]) await page.locator('#' + id).fill(value)
  await page.getByRole('button', { name: '保存目標，準備下一次開練', exact: true }).click(); await settle()
  assert.equal((await data()).preparations.length, 0, '非法區間不能提交')
  assert.equal(await page.locator('#starter-end').inputValue(), '9', '失敗保留草稿')
  await page.locator('#starter-end').fill('3')
  await page.getByRole('button', { name: '保存目標，準備下一次開練', exact: true }).click(); await settle()
  assert.equal((await data()).preparations.length, 1)
  assert.match(await page.locator('#preparation-reminder').inputValue(), /合成練習理由/)
  evidence.checks.push('正常入口、人工提醒文字、越界拒絕與草稿保全、雙選段保存')
  await page.locator('#preparation-context').selectOption('out'); await page.locator('#preparation-place').fill('合成地點')
  await click('preparation-begin'); await click('preparation-skip')
  assert.equal((await data()).preparations[0].step, 1)
  await page.reload(); await settle(); await click('open-preparation')
  assert.match(await page.locator('#preparation-step').innerText(), /2\/5/)
  assert.equal(await page.locator('#preparation-place').inputValue(), '合成地點')
  await page.locator('#preparation-context').selectOption('venue'); await click('preparation-begin')
  assert.match(await page.locator('#preparation-step').innerText(), /1\/3/)
  await click('preparation-next'); await click('preparation-skip'); await click('preparation-next')
  assert.equal((await data()).preparations[0].phase, 'ready'); assert.equal((await data()).preparations[0].danced, undefined)
  // 缺片是真正重開後只有 metadata，不能借前頁 File 假裝影片已持久保存。
  await click('preparation-watch')
  await page.waitForFunction(() => document.querySelector('#preparation-message')?.textContent?.includes('尚未連結'))
  assert.equal((await data()).preparations[0].phase, 'ready')
  await page.locator('#reference-file').setInputFiles(file); await settle()
  await click('confirm-link')
  await page.locator('#practice-rate').selectOption('0.75'); await click('copy-reference')
  await click('preparation-watch')
  await page.waitForFunction(() => !(document.querySelector('#reference') as HTMLVideoElement).paused)
  await page.waitForFunction(() => (document.querySelector('#reference') as HTMLVideoElement).paused, { timeout: 5000 })
  const once = await page.locator('#reference').evaluate((v: HTMLVideoElement) => ({ time: v.currentTime, rate: v.playbackRate }))
  assert(once.time >= 3 && once.time < 3.2); assert.equal(once.rate, 0.75)
  assert.equal((await data()).preparations[0].danced, undefined)
  await click('preparation-dance'); await click('stop')
  assert.equal(await page.locator('#reference').evaluate((v: HTMLVideoElement) => v.paused), true)
  await click('preparation-full')
  await page.waitForFunction(() => !(document.querySelector('#reference') as HTMLVideoElement).paused)
  const fullTime = await page.locator('#reference').evaluate((v: HTMLVideoElement) => v.currentTime)
  assert(fullTime >= 1 && fullTime < 2); await click('stop')
  evidence.checks.push('略過、重開續接、改情境、地點保留、缺片提示／人工重連、0.75×單次範圍／停止／完整目標、觀看不計次')
  await page.locator('#preparation-danced').check(); await page.locator('#preparation-rating').selectOption('stuck')
  await page.locator('#preparation-note').fill('<img src=x onerror=alert(1)> 合成心得')
  await page.getByRole('button', { name: '保存這次收尾', exact: true }).dblclick(); await settle()
  let library = await data()
  assert.equal(library.preparations.length, 1); assert.equal(library.preparations[0].danced, true); assert.equal(library.preparations[0].mastery, false)
  assert.equal(await page.locator('#preparation-result img').count(), 0)
  await click('preparation-new'); library = await data()
  assert.equal(library.preparations.length, 2); assert.equal(library.preparations[1].step, 0); assert.equal(library.preparations[1].context, ''); assert.equal(library.preparations[1].danced, undefined)
  await click('preparation-begin'); for (let i = 0; i < 3; i++) await click('preparation-skip')
  await page.locator('#preparation-danced').check()
  await page.getByRole('button', { name: '保存這次收尾', exact: true }).click(); await settle()
  assert.equal((await data()).preparations[1].rating, '')
  evidence.checks.push('本人跟跳確認、未熟保留、純文字心得、雙擊不重複、新一次重新準備、略過自評')
  // 真正第二個分頁提交 revision；原頁舊版本必須拒絕並保留草稿。
  const second = await context.newPage(); await second.goto(origin); await second.waitForFunction(() => !(document.querySelector('#controls') as HTMLFieldSetElement).disabled)
  await second.evaluate(async () => { const s = await import('/storage.js'), state = await s.readLibrary(); state.data.videos[0].title = '合成另一分頁'; await s.writeLibrary(state.data, state.revision) })
  await page.locator('#preparation-plan').evaluate((d: HTMLDetailsElement) => d.open = true)
  await page.locator('#preparation-name').fill('合成競寫草稿')
  await page.getByRole('button', { name: '保存目標，準備下一次開練', exact: true }).click(); await settle()
  assert.equal(await page.locator('#preparation-name').inputValue(), '合成競寫草稿'); assert.equal((await data()).preparations.length, 2)
  await click('preparation-cancel-plan'); await second.close()
  await page.reload(); await settle(); await click('open-preparation')
  // 走既有 JSON 下載及空環境匯入，確認影片 bytes 不在 JSON 內。
  await page.locator('#note-tools > summary').click();
  const downloadPromise = page.waitForEvent('download'); await click('backup'); const download = await downloadPromise
  const backup = JSON.parse(await Bun.file((await download.path())!).text())
  assert.equal(backup.schemaVersion, 3); assert.equal(backup.preparations.length, 2); assert.equal(backup.preparations[0].rating, 'stuck')
  const fresh = await browser.newContext({ serviceWorkers: 'block', hasTouch: true, isMobile: true, viewport: { width: 393, height: 852 } }), restored = await fresh.newPage()
  await restored.goto(origin); await restored.waitForFunction(() => !(document.querySelector('#controls') as HTMLFieldSetElement).disabled)
  await restored.locator('#open-preparation').click()
  await restored.locator('#restore').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await restored.locator('#import-dialog').waitFor({ state: 'visible' }); await restored.locator('#import-confirm').click()
  await restored.waitForFunction(() => !(document.querySelector('#controls') as HTMLFieldSetElement).disabled)
  assert.equal(await restored.locator('#preparation-selection option').count(), 3)
  const restoredData = await restored.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data)
  assert.deepEqual(restoredData.preparations, backup.preparations)
  await restored.locator('#preparation-new').tap(); await restored.waitForFunction(() => !(document.querySelector('#controls') as HTMLFieldSetElement).disabled);
  await restored.locator('#preparation-begin').tap(); await restored.waitForFunction(() => document.querySelector('#preparation-step')?.textContent?.includes('1/3'));
  await restored.locator('#preparation-next').tap(); await restored.waitForFunction(() => document.querySelector('#preparation-step')?.textContent?.includes('2/3'));
  await restored.locator('#preparation-panel').screenshot({ path: resolve(out, 'phone-touch.png') });
  evidence.checks.push('模擬觸控：開練／下一步及393px手機畫面');
  await fresh.close()
  evidence.checks.push('兩真分頁競寫拒絕、保留草稿、JSON實際下載／空環境還原')
  for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }, { width: 320, height: 740 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '版面不可橫向溢出')
    await page.locator('#preparation-title').focus(); await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'preparation-selection')
    await page.locator('#preparation-panel').screenshot({ path: resolve(out, `layout-${viewport.width}.png`) })
  }
  await page.setViewportSize({ width: 393, height: 852 }); await click('preparation-new'); await click('preparation-begin')
  await page.locator('#preparation-panel').screenshot({ path: resolve(out, 'phone-preparing.png') })
  for (let i = 0; i < 3; i++) await click('preparation-skip')
  await page.reload(); await settle(); await click('open-preparation')
  // 重開後從已保存的原片直接進預選區間；合成拒絕只改一次原生 play 的回應。
  await page.evaluate(() => {
    const video = document.querySelector('#reference') as HTMLVideoElement, play = video.play.bind(video)
    video.play = () => { video.play = play; return Promise.reject(new DOMException('synthetic denied playback', 'NotAllowedError')) }
  })
  await click('preparation-watch'); assert.equal((await data()).preparations.at(-1).phase, 'ready')
  await page.waitForFunction(() => document.querySelector('#preparation-message')?.textContent?.includes('synthetic denied playback'))
  await click('preparation-dance'); await page.waitForFunction(() => !(document.querySelector('#reference') as HTMLVideoElement).paused)
  await click('stop'); assert.equal((await data()).preparations.at(-1).danced, undefined)
  evidence.checks.push('重開已存原片直接起步、原生播放拒絕／重試保留進度與未確認跟跳')
  assert.deepEqual(evidence.errors, [])
  evidence.checks.push('393／852／320／1280px版面及鍵盤焦點')
  await context.close()
  // 原有比較案例保留全部原斷言；疊影案沿既有工具開 retained full interface。
  for (const name of ['comparison-appearance', 'comparison-overlay-layout']) {
    const prior = await browser.newContext({ serviceWorkers: 'block' }), tab = await prior.newPage()
    try {
      if (name === 'comparison-overlay-layout') await prior.addInitScript(() => {
        const observer = new MutationObserver(() => { if (document.body) { document.body.removeAttribute('data-comparison-only'); observer.disconnect() } }); observer.observe(document, { childList: true, subtree: true })
      })
      tab.on('pageerror', error => evidence.errors.push(error.message)); await tab.goto(origin)
      const scenario = (0, eval)(readFileSync(resolve(root, `tests/browser/${name}.js`), 'utf8'))
      evidence.checks.push({ name, result: await scenario(tab) })
    } finally { await prior.close() }
  }
  assert.deepEqual(evidence.errors, [])
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) { evidence.failure = String(error); throw error; } finally {
  await browser.close(); await server.stop(); evidence.browserClosed = true; evidence.serverStopped = true
  writeFileSync(resolve(out, `evidence-${Date.now()}.json`), JSON.stringify(evidence, null, 2))
}
