/* 檔案用途：合併同來源單元與隔離 Chromium 的完整 App 覆蓋率。所在層：本機／CI 測試入口。主要關聯：instrument.ts、tests/browser/、web/。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { appFiles, emptyCoverage, instrument, mergeReceipt, receipt, root, sourceHashes } from './instrument'
import { notices, webFiles, webHeaders, webNotice } from '../../scripts/web-assets'
import { fixtureFiles } from './prepare-fixtures'

assert.equal(Bun.version, readFileSync(resolve(root, '.bun-version'), 'utf8').trim(), '請使用指定 Bun 版本')
mkdirSync(resolve(root, 'coverage'), { recursive: true })
const directory = mkdtempSync(resolve(root, 'coverage/app-')), units = resolve(directory, 'units')
mkdirSync(units)
const evidence: any = { status: 'running', matrix: process.argv.length > 2 ? 'selected' : 'full', sourceHead: Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim(), runnerSha256: createHash('sha256').update(readFileSync(import.meta.path)).digest('hex'), appFiles, navigationSnapshots: 0, scenarios: [], errors: [] }
evidence.trackedChanges = Boolean(Bun.spawnSync(['git', 'status', '--porcelain'], { cwd: root }).stdout.toString().trim())
evidence.sourceHashes = sourceHashes
evidence.environment = { bun: Bun.version, platform: process.platform, arch: process.arch }
const save = () => writeFileSync(resolve(directory, 'run.json'), JSON.stringify(evidence, null, 2))
const map = emptyCoverage()
let activeScenario = 'setup'
function report(name: string) {
  const files = Object.fromEntries(map.files().sort().map(path => {
    const coverage = map.fileCoverageFor(path)
    return [path, { ...coverage.toSummary().toJSON(), uncoveredLines: Object.entries(coverage.getLineCoverage()).filter(([, hits]) => hits === 0).map(([line]) => Number(line)), uncoveredFunctions: Object.entries(coverage.f).filter(([, hits]) => hits === 0).map(([id]) => ({ name: coverage.fnMap[id].name, line: coverage.fnMap[id].loc.start.line })) }]
  }))
  const summary = { total: map.getCoverageSummary().toJSON(), files }
  writeFileSync(resolve(directory, `${name}.json`), JSON.stringify(summary, null, 2))
  writeFileSync(resolve(directory, `${name}-coverage.json`), JSON.stringify(receipt(map.toJSON())))
  if (name === 'app') {
    const escape = (text: string) => text.replace(/[&<>]/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[value]!)
    const rows = `<tr><th>整個 App（加總）</th>${['lines', 'functions', 'branches'].map(key => `<td>${(summary.total as any)[key].pct}%</td>`).join('')}</tr>` + Object.entries(files).map(([path, result]) => `<tr><th><a href="#${path}">${path}</a></th>${['lines', 'functions', 'branches'].map(key => `<td>${(result as any)[key].pct}%</td>`).join('')}</tr>`).join('')
    const details = Object.entries(files).map(([path, result]) => {
      const counts = map.fileCoverageFor(path).getLineCoverage()
      const lines = readFileSync(resolve(root, path), 'utf8').split('\n').map((text, index) => `<span class="${counts[index + 1] === undefined ? '' : counts[index + 1] > 0 ? 'covered' : 'missing'}"><b>${String(index + 1).padStart(4)}</b> ${escape(text)}</span>`).join('\n')
      return `<details id="${path}"><summary>${path} — ${result.lines.pct}% lines</summary><pre>${lines}</pre></details>`
    }).join('')
    writeFileSync(resolve(directory, 'report.html'), `<!doctype html><meta charset="utf-8"><title>Dance Stamp App coverage</title><style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:16px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}details{margin:20px 0}pre{overflow:auto;font-size:12px;line-height:1.6}pre span{display:block}pre b{color:#666}.covered{background:#edf9ed}.missing{background:#ffe4e4}</style><h1>Dance Stamp App 覆蓋率</h1><p>狀態：${evidence.status}。${appFiles.length} 個產品 JS 模組全部列入分母；綠色已執行、紅色尚未執行。插樁合成測試不代表真機驗收。</p><table><tr><th>檔案</th><th>行數</th><th>函式</th><th>分支</th></tr>${rows}</table>${details}`)
  }
  console.log(`${name}: lines ${summary.total.lines.pct}%, functions ${summary.total.functions.pct}%, branches ${summary.total.branches.pct}% (${map.files().length} App modules)`)
  return summary
}
const collect = async (page: Page) => {
  if (page.isClosed()) return
  const coverage = await page.evaluate(() => (globalThis as any).__coverage__ || {}).catch(() => ({}))
  mergeReceipt(map, receipt(coverage))
}
const contexts = new Set<BrowserContext>()
async function collectContext(context: BrowserContext) {
  for (const page of context.pages()) await collect(page)
  for (const worker of context.serviceWorkers()) {
    const coverage = await worker.evaluate(() => (globalThis as any).__coverage__ || {}).catch(() => ({}))
    mergeReceipt(map, receipt(coverage))
  }
}
function watchPage(page: Page) {
  // 重載／關頁前先收上一頁；只在結束時讀 window 會遺失大部分恢復流程的執行證據。
  for (const method of ['goto', 'reload', 'close'] as const) {
    const original = page[method].bind(page) as any
    ;(page as any)[method] = async (...args: any[]) => { await collect(page); return original(...args) }
  }
  page.setDefaultTimeout(15_000)
  page.on('pageerror', error => evidence.errors.push({ scenario: activeScenario, url: page.url(), message: error.message, stack: error.stack }))
}

let server: ReturnType<typeof Bun.serve> | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
const selected = process.argv.slice(2)
// 新介面與更新排程必須進同一輪，否則舊版的高覆蓋率不能替整合後的來源背書。
// 筆記分享與 VS 分享是兩條控制路徑，不能用前者的高覆蓋率替後者的取消／重試背書。
// 保存尾段沿用真正成檔／原生交易回歸；只測比較設定失敗，碰不到已成檔的新 VS 救援。
// 原生權限拒絕與自然播完各有獨立生命週期，不能由拋錯或派送 ended 事件代替。
const scenarios = selected.length ? selected : ['coverage-navigation', 'storage', 'storage-boundaries', 'storage-startup-failure', 'markers', 'moves', 'beats', 'share', 'vs-share', 'vs-live-delete', 'vs-save-tail-stop-complete', 'vs-save-tail-native-reject', 'vs-save-tail-unknown-abort', 'vs-save-tail-unknown-complete', 'deletion', 'existing-comparison', 'comparison-overlay', 'comparison-overlay-layout', 'video-roles', 'self-failure', 'comparison-recovery', 'comparison-save-failure', 'review-recovery', 'take-open-failure', 'export-failure', 'comparison-capture-fallback', 'webkit-audio-branch', 'capture', 'capture-success', 'capture-integrity', 'camera-policy-denial', 'camera-preview-cancel', 'edges', 'relink', 'backup-conflicts', 'backup-recovery', 'backup-keyboard', 'storage-recovery-title', 'storage-recovery-import', 'comparison-keyboard', 'moves-storage', 'move-draft', 'practice-range-change', 'practice-fallback', 'practice-natural-end', 'practice-native-decode', 'practice-native-audio', 'practice-native-ended', 'offline-storage', 'offline-cache-failure', 'offline-multi-tab']
const lockPath = resolve(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'dance-stamp-p0-media-test.lock'), nonce = randomUUID()
let ownsLock = false, launchAttempted = false, browserClosed = false, serverStopped = false
try {
  {
    // 前置單元測試較久，先取得同一把鎖，避免備妥後才與另一輪 QA 搶跑；失敗仍只釋放自有 nonce。
    const fd = openSync(lockPath, 'wx'); ownsLock = true
    try { writeFileSync(fd, JSON.stringify({ owner: 'app-coverage-103', nonce, pid: process.pid })); } finally { closeSync(fd) }
  }
  save()
  const result = Bun.spawn([process.execPath, '--no-env-file', 'test', '--isolate', '--preload', './tests/app-coverage/unit-preload.ts', './tests/unit'], {
    cwd: root, env: { ...process.env, DANCE_STAMP_COVERAGE_DIR: units }, stdout: Bun.file(resolve(directory, 'unit.log')), stderr: Bun.file(resolve(directory, 'unit-errors.log')),
  })
  assert.equal(await result.exited, 0, `單元測試失敗，請讀 ${directory}/unit-errors.log`)
  const unitFiles = readdirSync(units).filter(path => path.endsWith('.json'))
  assert(unitFiles.length > 0, '單元計數器沒有產出收據')
  for (const file of unitFiles) mergeReceipt(map, JSON.parse(readFileSync(resolve(units, file), 'utf8')))
  evidence.baseline = report('baseline')
  // 只複製明列的合成輸入；每輪下載寫入自己的目錄，不拿上輪成檔湊依賴或覆寫舊證據。
  const media = resolve(directory, 'media')
  for (const file of fixtureFiles) {
    const target = resolve(media, file); mkdirSync(resolve(target, '..'), { recursive: true })
    copyFileSync(resolve(root, 'output', file), target)
  }

  const resources = new Map<string, string>()
  for (const file of [...webFiles, ...notices]) {
    if (file === 'sw.js') continue
    const path = file === 'index.html' ? '/' : `/${file}`
    resources.set(path, appFiles.includes(`web/${file}`) ? instrument(`web/${file}`).code : notices.includes(file) ? webNotice(file, readFileSync(resolve(root, file), 'utf8')) : readFileSync(resolve(root, 'web', file), 'utf8'))
  }
  const manifest = Object.fromEntries([...resources].map(([path, text]) => [path, createHash('sha256').update(text).digest('hex')]))
  let worker = instrument('web/sw.js').code.replace('__BUILD__', 'coverage-synthetic')
  assert(worker.includes('const files ='), 'SW manifest 注入位置改變，拒絕使用空 manifest 冒充覆蓋率')
  // 只在測試主機補 manifest；雜湊對應真正提供的插樁 bytes，不能讓 SW 每次安裝都假失敗。
  worker = worker.replace('const files =', `Object.assign(manifest, ${JSON.stringify(manifest)});\nconst files =`)
  resources.set('/sw.js', worker)
  // 候選仍安裝真正資源／manifest；只換 worker 版號，不能以假 waiting 事件取代原生生命週期。
  // 插樁會在賦值中加入計數器；改已知字串值，不依賴未插樁的宣告語法。
  const nextWorker = worker.replace("'coverage-synthetic'", "'coverage-synthetic-next'")
  assert.notEqual(nextWorker, worker, 'SW 版號注入位置改變，拒絕無變更的更新演練')
  let updateMode = 'current'
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    const url = new URL(request.url)
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    // 控制路由只在既有雙頁案例中開放，其他流程不能意外把下一頁切到候選版。
    if (activeScenario === 'offline-multi-tab' && url.pathname === '/__test__/version') {
      const mode = url.searchParams.get('mode')
      if (mode !== 'current' && mode !== 'next') return new Response('Not found', { status: 404 })
      updateMode = mode; return new Response(mode)
    }
    const text = url.pathname === '/sw.js' && updateMode === 'next' ? nextWorker : resources.get(url.pathname)
    if (text === undefined) return new Response('Not found', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : text, { headers: { ...webHeaders, 'content-type': url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.md') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  } })
  const origin = `http://127.0.0.1:${server.port}`
  const executable = process.env.DANCE_STAMP_CHROMIUM || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome')
  assert(existsSync(executable), '請用 DANCE_STAMP_CHROMIUM 指定已安裝 Chromium；不自動下載瀏覽器')
  assert(existsSync(resolve(root, 'output/media-probe/camera.y4m')), '請先產生合成測片：bun scripts/make-media-fixtures.ts')
  launchAttempted = true
  browser = await chromium.launch({ executablePath: executable, headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${resolve(root, 'output/media-probe/camera.y4m')}`, '--mute-audio'] })
  evidence.environment.chromium = browser.version()
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async options => {
    const context = await newContext({ viewport: { width: 1280, height: 960 }, acceptDownloads: true, ...options })
    contexts.add(context)
    await context.exposeBinding('__danceCoverageSnapshot103', (_source, payload) => {
      const coverage = JSON.parse(payload); mergeReceipt(map, receipt(coverage)); evidence.navigationSnapshots++
      writeFileSync(resolve(directory, `navigation-${evidence.navigationSnapshots}.json`), JSON.stringify(receipt(coverage)))
    })
    await context.addInitScript(() => {
      (globalThis as any).__danceSyntheticCameraOnly = true
      // 頁內 location.reload 也會先經 beforeunload；不能只依賴控制器的方法或較晚的 pagehide。
      window.addEventListener('beforeunload', () => { (globalThis as any).__danceCoverageSnapshot103(JSON.stringify((globalThis as any).__coverage__ || {})) })
      // DOMContentLoaded 後才註冊，讓產品的 pagehide 清理先執行；只用控制器通道，不送 App 網路寫入。
      document.addEventListener('DOMContentLoaded', () => window.addEventListener('pagehide', () => { (globalThis as any).__danceCoverageSnapshot103(JSON.stringify((globalThis as any).__coverage__ || {})) }))
    })
    context.on('page', watchPage)
    const close = context.close.bind(context)
    context.close = async options => { try { await collectContext(context) } finally { await close(options); contexts.delete(context) } }
    return context
  }
  for (const name of scenarios) {
    activeScenario = name
    updateMode = 'current'
    assert(/^[a-z][a-z-]+$/.test(name), '只接受明確的瀏覽器回歸名稱')
    const context = await browser.newContext(name === 'webkit-audio-branch' ? { userAgent: 'AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' } : {}), page = await context.newPage(), started = Date.now()
    try {
      await page.goto(origin)
      if (name === 'self-failure') {
        // 既有回歸要求已存在的 ready take；透過真正選片入口準備，不能直接塞入假 UI state。
        for (const id of ['reference-file', 'self-file']) {
          await page.locator(`#${id}`).setInputFiles(resolve(media, 'media-probe/reference.mp4'))
          await page.waitForFunction(() => !(document.getElementById('controls') as HTMLFieldSetElement).disabled && document.getElementById('compare')?.getAttribute('aria-busy') !== 'true')
        }
      }
      // 操作外錯誤須由公開播放／循環入口驗證，不能直接呼叫內部 handler 湊行數。
      const practiceError = name.startsWith('practice-native-') ? name.slice('practice-native-'.length) : undefined
      const tail = name.startsWith('vs-save-tail-') ? name.slice('vs-save-tail-'.length) : undefined
      const path = resolve(root, 'tests/browser', `${practiceError ? 'practice-native-errors' : tail ? 'vs-save-tail' : name.startsWith('storage-recovery-') ? 'storage-recovery-keyboard' : name}.js`)
      assert(existsSync(path), `找不到既有瀏覽器測試：${name}`)
      let result
      if (tail) {
        const { default: scenario } = await import(pathToFileURL(path).href), folder = resolve(directory, name); mkdirSync(folder)
        let captureCalls = 0
        await context.exposeBinding('blockedMedia', () => { captureCalls++ })
        await context.addInitScript(() => {
          for (const key of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices) navigator.mediaDevices[key] = () => { (window as any).blockedMedia(); throw new Error('保存尾段只允許合成檔案，不可擷取硬體') }
        })
        result = await scenario(page, { origin, reference: resolve(media, 'export-failure/reference.mp4'), self: resolve(media, 'export-failure/self.mp4') }, folder, tail, async (label: string, value: unknown) => writeFileSync(resolve(folder, `${label}.json`), JSON.stringify(value, null, 2)))
        assert.equal(captureCalls, 0); result.cameraMicrophoneAndScreenCaptureCalls = captureCalls
      } else if (name.startsWith('storage-recovery-')) {
        const { default: scenario } = await import(pathToFileURL(path).href), folder = resolve(directory, name); mkdirSync(folder)
        result = await scenario(page, { origin, reference: resolve(media, 'comparison/reference.mp4'), self: resolve(media, 'comparison/self-1.mp4'), vs: resolve(media, 'export-failure/self.mp4') }, folder, async (label: string, value: unknown) => writeFileSync(resolve(folder, `${label}.json`), JSON.stringify(value, null, 2)), name.endsWith('import') ? 'import' : 'title')
      } else {
        const source = readFileSync(path, 'utf8').replace(/http:\/\/127\.0\.0\.1:417[34]\b/g, origin).replaceAll('output/', `${media}/`)
        const scenario = (0, eval)(`(${source})`) as (page: Page, options?: any) => Promise<any>
        if (name === 'capture-integrity') {
          // 早停、真短 bytes、同頁重試與救援刪除共用原生回歸；不能以派發 error 事件替代。
          assert(await page.evaluate(() => (window as any).__danceSyntheticCameraOnly === true), '只允許既有合成相機')
          mkdirSync(resolve(media, 'media-feasibility'), { recursive: true })
          const phases: any[] = []
          const run = async (phase: string, mode = '') => {
            const value = await scenario(page, { phase, mode, origin, label: 'app-coverage', reference: resolve(media, 'media-probe/reference.mp4'), self: resolve(media, 'comparison/silent.mp4') })
            const path = value.actualPartialDownload || value.actualRetryDownload
            if (path) {
              const bytes = readFileSync(path), expected = value.expectedDownload || { bytes: value.partialBytes, sha256: value.partialSha }
              assert.equal(bytes.length, expected.bytes, '真正下載與頁內 Blob 長度不同')
              assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, '真正下載與頁內 Blob 完整指紋不同')
            }
            phases.push({ phase, mode, result: value }); return value
          }
          const idle = () => page.waitForFunction(() => !(document.getElementById('controls') as HTMLFieldSetElement).disabled && document.getElementById('compare')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30_000 })
          await run('prepare')
          for (const mode of ['early', 'short']) { await run('start', mode); await idle(); await run('verify-fault', mode) }
          await run('start'); await idle(); await run('verify-retry'); await run('verify-deletion')
          await run('reset-baseline'); await run('start', 'early'); await idle(); await run('verify-fault', 'early'); await run('delete-video')
          result = { phases, actualDownloadsMatchedFullBlobHashes: true }
        } else result = await scenario(page, practiceError ? { mode: practiceError } : undefined)
      }
      if (result?.navigationCoverage) assert(map.fileCoverageFor(result.navigationCoverage.path).getLineCoverage()[result.navigationCoverage.line] > 0, `頁內重新載入遺失了舊頁面的計數：${JSON.stringify(result.navigationCoverage)}`)
      evidence.scenarios.push({ name, status: 'passed', durationMs: Date.now() - started, result })
      console.log(`PASS ${name} (${Date.now() - started}ms)`)
    } catch (error) {
      evidence.scenarios.push({ name, status: 'failed', durationMs: Date.now() - started, message: String(error), stack: error instanceof Error ? error.stack : undefined })
      console.error(`FAIL ${name}:`, error)
    } finally {
      await context.close(); save(); report('app')
    }
  }
  assert(evidence.scenarios.every((scenario: any) => scenario.status === 'passed'), '瀏覽器回歸失敗，覆蓋率高也不能視為通過')
  assert.equal(evidence.errors.length, 0, '瀏覽器出現未處理例外')
  evidence.status = 'passed'
} catch (error) {
  evidence.status = 'failed'; evidence.failure = String(error); process.exitCode = 1
  console.error(error)
} finally {
  const cleanupError = (error: unknown) => { evidence.status = 'failed'; process.exitCode = 1; evidence.errors.push({ cleanup: String(error) }) }
  // 瀏覽器收尾失敗也要停止自己的主機；未取得 handle 或未確認 close 時保留鎖供人工追查。
  for (const context of [...contexts]) await context.close().catch(cleanupError)
  try { if (browser) { await browser.close(); browserClosed = true } } catch (error) { cleanupError(error) }
  try { await server?.stop(true); serverStopped = true } catch (error) { cleanupError(error) }
  if (ownsLock && (!launchAttempted || browserClosed)) {
    try {
      if (JSON.parse(readFileSync(lockPath, 'utf8')).nonce !== nonce) throw new Error('媒體鎖已換持有人，保留原鎖')
      unlinkSync(lockPath)
    } catch (error) { cleanupError(error) }
  }
  evidence.cleanup = { browserClosed, serverStopped, lockRetained: ownsLock && existsSync(lockPath) }
  evidence.final = report('app'); save()
  for (const [path, value] of Object.entries(evidence.final.files) as any) console.log(`${path}: lines ${value.lines.pct}% | functions ${value.functions.pct}% | branches ${value.branches.pct}% | uncovered lines ${value.uncoveredLines.join(',') || 'none'}`)
  console.log(`完整收據：${directory}`)
}
