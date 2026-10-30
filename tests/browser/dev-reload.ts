/* 檔案用途：以獨立原始碼副本實測改檔更新、草稿／原片保留及舊 SW 退出。所在層：本機開發整合回歸。主要關聯：scripts/dev-web.ts、scripts/dev-reload.js。 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { webFiles, notices } from '../../scripts/web-assets'

const [executable, modulePath] = process.argv.slice(2)
assert(executable && modulePath, '請提供自有 Chromium 與已安裝的 playwright-core/index.mjs；不自動安裝')
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href)
const root = resolve(import.meta.dir, '../..'), output = join(root, 'output')
mkdirSync(output, { recursive: true })
// 只複製明列公開檔；所有改檔都發生在本輪副本，不碰使用者正在看的 4174 或共用 checkout。
const fixture = mkdtempSync(join(output, 'dev-reload-'))
for (const name of [...webFiles.map(file => 'web/' + file), ...notices, 'package.json', ...['serve-web.ts', 'dev-web.ts', 'dev-reload.js', 'build-web.ts', 'web-assets.ts', 'package-web.ts', 'publicSafety.ts', 'stagedSafety.ts'].map(file => 'scripts/' + file)]) {
  const target = join(fixture, name); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, readFileSync(join(root, name)))
}
const built = Bun.spawnSync([process.execPath, '--no-env-file', 'scripts/build-web.ts'], { cwd: fixture })
assert.equal(built.exitCode, 0, built.stderr.toString())
const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('reserved') })
const port = reservation.port; reservation.stop(true)
const origin = `http://127.0.0.1:${port}`
let server: ReturnType<typeof Bun.spawn> | undefined
const start = async (watching: boolean) => {
  server = Bun.spawn([process.execPath, '--no-env-file', 'scripts/serve-web.ts', String(port), ...(watching ? ['--watch'] : [])], { cwd: fixture, env: { PATH: process.env.PATH, DANCE_STAMP_HOST: '127.0.0.1' }, stdout: 'ignore', stderr: Bun.file(join(fixture, watching ? 'dev.log' : 'static.log')) })
  for (let attempt = 0; attempt < 200; attempt++) {
    try { if ((await fetch(origin)).ok) return } catch {}
    assert(server.exitCode === null, '測試主機提前退出'); await Bun.sleep(25)
  }
  throw new Error('測試主機未就緒')
}
const stop = async () => { if (server) { server.kill(); await server.exited; server = undefined } }
const browser = await chromium.launch({ executablePath: executable, headless: true, args: ['--mute-audio'] })
const context = await browser.newContext({ acceptDownloads: true })
try {
  await start(false)
  assert.equal((await fetch(origin + '/__dev/revision')).status, 404)
  let page = await context.newPage(); await page.goto(origin)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await page.evaluate(async () => {
    const storage = await import('/storage.js'), before = await storage.readLibrary(), data = before.data
    data.videos.push({ id: crypto.randomUUID(), title: '合成既有筆記', durationMs: 3000, revision: 1 })
    await storage.writeLibrary(data, before.revision)
  })
  await stop(); await start(true)
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration?.update() })
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)
  await page.close(); await Bun.sleep(300)
  page = await context.newPage(); await page.goto(origin); await page.locator('#dev-live').waitFor()
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 0)
  assert.equal(await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data.videos[0].title), '合成既有筆記')
  const htmlPath = join(fixture, 'web/index.html'), originalHTML = readFileSync(htmlPath, 'utf8')
  // 頁首文案會隨 UI 調整；只替換標題元素，才能持續驗證真正改檔觸發更新。
  const headingHTML = (title: string) => originalHTML.replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${title}</h1>`)
  writeFileSync(htmlPath, headingHTML('合成即時更新一'))
  await page.getByRole('heading', { name: /合成即時更新一/ }).waitFor()
  await page.getByText('分類搜尋與動作庫', { exact: true }).click(); await page.locator('#library-keyword').fill('合成未存輸入')
  writeFileSync(htmlPath, headingHTML('合成即時更新二'))
  await page.locator('#dev-live button').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#library-keyword').inputValue(), '合成未存輸入')
  assert.equal(await page.getByRole('heading', { name: /合成即時更新一/ }).count(), 1)
  await page.locator('#dev-live button').click(); await page.getByRole('heading', { name: /合成即時更新二/ }).waitFor()
  await page.locator('#reference-file').setInputFiles(join(root, 'output/media-probe/reference.mp4'))
  await page.waitForFunction(() => !document.getElementById('practice').disabled)
  const source = await page.locator('#reference').getAttribute('src')
  const videos = await page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data.videos))
  writeFileSync(htmlPath, headingHTML('合成即時更新三'))
  await page.locator('#dev-live button').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#reference').getAttribute('src'), source)
  const timeline = join(fixture, 'web/timeline.js'), originalTimeline = readFileSync(timeline, 'utf8')
  writeFileSync(timeline, originalTimeline + '\nexport const = ;\n')
  await page.getByText('修改暫時無法更新，先保留上一版；修正後會自動再試。', { exact: true }).waitFor()
  assert.equal(await page.locator('#reference').getAttribute('src'), source)
  assert.equal(await page.locator('#dev-live button').isDisabled(), true)
  writeFileSync(timeline, originalTimeline)
  await page.waitForFunction(() => !document.querySelector('#dev-live button').disabled)
  assert.equal(await page.locator('#reference').getAttribute('src'), source)
  await page.locator('#dev-live button').click(); await page.getByRole('heading', { name: /合成即時更新三/ }).waitFor()
  assert.equal(await page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data.videos)), videos)
  const evidence = { oldServiceWorkerExitsWithoutDataReset: true, idlePageReloadsAfterRealEdit: true, inputSurvivesUntilExplicitReload: true, selectedFileSurvivesUpdatesAndBuildFailure: true, failedBuildKeepsLastGoodPage: true, fixedBuildCanReload: true, notesSurviveReload: true, staticServerHasNoDevRoutes: true }
  writeFileSync(join(fixture, 'evidence.local.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence))
} finally { await context.close(); await browser.close(); await stop() }
