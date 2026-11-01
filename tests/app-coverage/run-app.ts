/* 檔案用途：合併同來源單元與隔離 Chromium 的完整 App 覆蓋率。所在層：本機／CI 測試入口。主要關聯：instrument.ts、tests/browser/、web/。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { appFiles, emptyCoverage, instrument, mergeReceipt, receipt, root, sourceHashes } from './instrument'
import { notices, webFiles, webHeaders, webNotice, webAssetBytes } from '../../scripts/web-assets'
import { fixtureFiles } from './prepare-fixtures'
import { observeKeyboardProtocol } from './keyboard-protocol'

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
// 獨立跟隨結果也走真正預設頁；整合時不能退回暫藏工具全開的介面。
const defaultInterfaceScenarios = new Set(['simplified-comparison', 'adjusted-side-preview', 'person-follow', 'follow-results', 'follow-performance', 'webkit-follow-results', 'follow-runtime'])
// 停止路徑名稱直接沿用原回歸模組，避免完整量測另抄清單而漏掉已存在的入口。
const { metadataStopCases } = await import(pathToFileURL(resolve(root, 'tests/browser/metadata-stop.js')).href)
// 新介面與更新排程必須進同一輪，否則舊版的高覆蓋率不能替整合後的來源背書。
// 筆記分享與 VS 分享是兩條控制路徑，不能用前者的高覆蓋率替後者的取消／重試背書。
// 保存尾段沿用真正成檔／原生交易回歸；只測比較設定失敗，碰不到已成檔的新 VS 救援。
// 原生權限拒絕與自然播完各有獨立生命週期，不能由拋錯或派送 ended 事件代替。
const scenarios = selected.length ? selected : ['coverage-navigation', 'storage', 'storage-boundaries', 'storage-startup-failure', 'markers', 'moves', 'beats', 'share', 'vs-share', 'vs-live-delete', 'vs-save-tail-stop-complete', 'vs-save-tail-native-reject', 'vs-save-tail-unknown-abort', 'vs-save-tail-unknown-complete', 'deletion', 'existing-comparison', 'comparison-overlay', 'comparison-overlay-layout', 'video-roles', 'self-failure', 'comparison-recovery', 'comparison-save-failure', 'review-recovery', 'take-open-failure', 'export-failure', 'comparison-capture-fallback', 'webkit-audio-branch', 'capture', 'capture-success', 'capture-integrity', 'camera-policy-denial', 'camera-preview-cancel', 'edges', 'relink', 'backup-conflicts', 'backup-recovery', 'backup-keyboard', 'storage-recovery-title', 'storage-recovery-import', 'comparison-keyboard', 'moves-storage', 'move-draft', 'practice-range-change', 'practice-fallback', 'practice-natural-end', 'practice-native-decode', 'practice-native-audio', 'practice-native-ended', 'offline-storage', 'offline-cache-failure', 'offline-multi-tab']
// 恢復守門沿原函式接入，不改前51條順序，保留既有鍵盤故障的前置環境。
// 匯出暖機中的停止須沿既有回歸執行，恢復片段或保存尾段不能代替這條生命週期。
if (!selected.length) scenarios.push('recovery-frame-guard', ...metadataStopCases.map((kind: string) => 'metadata-stop-' + kind), 'export-ready')
// 四條既有恢復回歸接在原63條之後，保留鍵盤與取消案例的原前置順序。
if (!selected.length) scenarios.push('overlay-export')
if (!selected.length) scenarios.push('recovery-offline-timeout', 'recovery-inventory-read', 'recovery-unknown-media', 'recovery-draft-navigation')
// 錄影供聲與匯出供聲生命週期不同；追加於原媒體案例之後，不能改變原鍵盤案例的前置順序。
if (!selected.length) scenarios.push('webkit-capture-branch')
// 已開舊頁收到升版通知與啟動前已有新庫不同；另接在供聲案例後，保留原生關閉／重開路徑。
if (!selected.length) scenarios.push('storage-version-change')

// 秒數尺另接在既有流程之後，保留原本媒體與恢復案例的相對順序。
if (!selected.length) scenarios.push('source-time-rulers')

// 簡化介面獨立追加，原有比較／疊影及恢復順序不變。
if (!selected.length) scenarios.push('simplified-comparison')
// 新的試看框走真正預設介面，接在原案例之後以保留既有前置順序。
if (!selected.length) scenarios.push('adjusted-side-preview')
// 跟隨分析使用真正的本機模型，與合成匯出共用相同資源政策。
if (!selected.length) scenarios.push('person-follow')
// 單側結果與原本 VS 分開驗，確保各自的原片聲音與真正下載都存在。
if (!selected.length) scenarios.push('follow-results')
// 計時只驗數字與保全；CI 機器速度不當成效能門檻或最佳化證據。
if (!selected.length) scenarios.push('follow-performance')
// Chrome 元素供聲不能替 Safari 的有界 AAC 供聲背書；重用完整單側結果案例並保留原76條順序。
if (!selected.length) scenarios.push('webkit-follow-results')
// 相容回退追加在原77案之後；阻擋 SW 僅為讓受控網路故障確實到達模型載入。
if (!selected.length) scenarios.push('follow-runtime')
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

  const resources = new Map<string, string | Uint8Array>()
  for (const file of [...webFiles, ...notices]) {
    if (file === 'sw.js') continue
    const path = file === 'index.html' ? '/' : `/${file}`
    resources.set(path, appFiles.includes(`web/${file}`) ? instrument(`web/${file}`).code : notices.includes(file) ? webNotice(file, readFileSync(resolve(root, file), 'utf8')) : webAssetBytes(root, file))
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
  let updateMode = 'current', recoveryWorkerDelayed = false
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
    const response = new Response(request.method === 'HEAD' ? null : text, { headers: { ...webHeaders, 'content-type': url.pathname.endsWith('.wasm') ? 'application/wasm' : url.pathname.endsWith('.tflite') ? 'application/octet-stream' : url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.md') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
    // 只延遲本案首次真正 SW 回應，讓「安裝尚未完成」穩定出現；原 bytes、安裝與15秒期限不變。
    if (activeScenario === 'recovery-frame-guard' && request.method === 'GET' && url.pathname === '/sw.js' && !recoveryWorkerDelayed) { recoveryWorkerDelayed = true; return Bun.sleep(1000).then(() => response) }
    return response
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
    await context.addInitScript(retainedInterface => {
      // 原功能只是暫藏：舊案例在產品模組載入前明示恢復 DOM，保留全部原斷言與順序。
      // 來源 HTML／CSS／SW 完全相同，不能改伺服器 bytes 破壞離線雜湊驗證；新案例不移除標記。
      if (retainedInterface) {
        const restoring = new MutationObserver(() => {
          if (document.body) { document.body.removeAttribute('data-comparison-only'); restoring.disconnect() }
        })
        restoring.observe(document, { childList: true, subtree: true })
      }
      (globalThis as any).__danceSyntheticCameraOnly = true
      // 頁內 location.reload 也會先經 beforeunload；不能只依賴控制器的方法或較晚的 pagehide。
      window.addEventListener('beforeunload', () => { (globalThis as any).__danceCoverageSnapshot103(JSON.stringify((globalThis as any).__coverage__ || {})) })
      // DOMContentLoaded 後才註冊，讓產品的 pagehide 清理先執行；只用控制器通道，不送 App 網路寫入。
      document.addEventListener('DOMContentLoaded', () => window.addEventListener('pagehide', () => { (globalThis as any).__danceCoverageSnapshot103(JSON.stringify((globalThis as any).__coverage__ || {})) }))
    }, !defaultInterfaceScenarios.has(activeScenario))
    context.on('page', watchPage)
    const close = context.close.bind(context)
    context.close = async options => { try { await collectContext(context) } finally { await close(options); contexts.delete(context) } }
    return context
  }
  for (const name of scenarios) {
    activeScenario = name
    updateMode = 'current'
    assert(/^[a-z][a-z-]+$/.test(name), '只接受明確的瀏覽器回歸名稱')
    const context = await browser.newContext(name === 'follow-runtime' ? { serviceWorkers: 'block' } : name === 'webkit-audio-branch' || name === 'webkit-capture-branch' || name === 'webkit-follow-results' ? { userAgent: 'AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' } : {}), page = await context.newPage(), started = Date.now()
    try {
      await page.goto(origin)
      if (name === 'self-failure') {
        // 既有回歸要求已存在的 ready take；透過真正選片入口準備，不能直接塞入假 UI state。
        for (const id of ['reference-file', 'self-file']) {
          await page.locator(`#${id}`).setInputFiles(resolve(media, 'media-probe/reference.mp4'))
          await page.waitForFunction(() => !(document.getElementById('controls') as HTMLFieldSetElement).disabled && document.getElementById('compare')?.getAttribute('aria-busy') !== 'true')
          // 此準備流程需建立 15 秒比較，不依賴新選片的完整長度預設。
          if (id === 'reference-file') await page.locator('#end').fill('15')
        }
      }
      // 操作外錯誤須由公開播放／循環入口驗證，不能直接呼叫內部 handler 湊行數。
      const practiceError = name.startsWith('practice-native-') ? name.slice('practice-native-'.length) : undefined
      const tail = name.startsWith('vs-save-tail-') ? name.slice('vs-save-tail-'.length) : undefined
      const metadataKind = name.startsWith('metadata-stop-') ? name.slice('metadata-stop-'.length) : undefined
      const frameGuard = name === 'recovery-frame-guard'
      // 影格守門也以recovery開頭，必須留在原TS函式入口，不能被一般恢復分流攔走。
      const recovery = !frameGuard && name.startsWith('recovery-') ? name.slice('recovery-'.length) : undefined
      const path = resolve(root, 'tests/browser', `${recovery ? 'coverage-recovery' : metadataKind ? 'metadata-stop' : practiceError ? 'practice-native-errors' : tail ? 'vs-save-tail' : name.startsWith('storage-recovery-') ? 'storage-recovery-keyboard' : name === 'webkit-follow-results' ? 'follow-results' : name}.${frameGuard ? 'ts' : 'js'}`)
      assert(existsSync(path), `找不到既有瀏覽器測試：${name}`)
      let result
      if (tail || metadataKind || frameGuard) {
        const module = await import(pathToFileURL(path).href), folder = resolve(directory, name); mkdirSync(folder)
        let captureCalls = 0
        await context.exposeBinding('blockedMedia', () => { captureCalls++ })
        await context.addInitScript(() => {
          for (const key of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices) navigator.mediaDevices[key] = () => { (window as any).blockedMedia(); throw new Error('保存回歸只允許合成檔案，不可擷取硬體') }
        })
        const fixtures = { origin, reference: resolve(media, 'export-failure/reference.mp4'), self: resolve(media, 'export-failure/self.mp4') }
        const reportCase = async (label: string, value: unknown) => writeFileSync(resolve(folder, `${label}.json`), JSON.stringify(value, null, 2))
        // 保存與恢復共用硬體禁用邊界，案例本身仍由原函式執行。
        if (frameGuard) {
          const frameEvidence: any = { events: [], bootstrapWorkerDelayMs: 1000, scope: 'Original native recovery frame guard; controlled initial SW response delay, chunks and failures, not process termination or camera.' }
          const saveFrame = () => writeFileSync(resolve(folder, 'evidence.local.json'), JSON.stringify(frameEvidence, null, 2))
          const event = (type: string, detail: any = {}) => { frameEvidence.events.push({ type, ...detail }); saveFrame() }
          const ready = async (page: Page) => {
            await page.waitForFunction(() => !(document.getElementById('controls') as HTMLFieldSetElement)?.disabled && document.getElementById('offline-status')?.textContent?.includes('已檢查應用資源完整'))
            await page.waitForFunction(() => !!navigator.serviceWorker.controller)
          }
          assert.equal(await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).revision), 0, '恢復回歸只允許全新合成資料，不清空舊庫')
          try { await module.recoveryFrameGuard({ page, origin, root, run: folder, evidence: frameEvidence, event, ready, fixtureSource: resolve(media, 'media-feasibility/reference.mp4') }); assert(recoveryWorkerDelayed, '必須真的經過首次 SW 延遲，不可只改案例名稱'); result = { ...frameEvidence, passed: true } }
          catch (error) { frameEvidence.failure = String(error); throw error }
          finally { saveFrame() }
        } else {
          const scenario = module.default
          result = metadataKind ? await scenario(page, fixtures, folder, reportCase, { kind: metadataKind }) : await scenario(page, fixtures, folder, tail, reportCase)
        }
        assert.equal(captureCalls, 0); result.cameraMicrophoneAndScreenCaptureCalls = captureCalls
      } else if (name.startsWith('storage-recovery-')) {
        const { default: scenario } = await import(pathToFileURL(path).href), folder = resolve(directory, name); mkdirSync(folder)
        result = await scenario(page, { origin, reference: resolve(media, 'comparison/reference.mp4'), self: resolve(media, 'comparison/self-1.mp4'), vs: resolve(media, 'export-failure/self.mp4') }, folder, async (label: string, value: unknown) => writeFileSync(resolve(folder, `${label}.json`), JSON.stringify(value, null, 2)), name.endsWith('import') ? 'import' : 'title')
      } else {
        const source = readFileSync(path, 'utf8').replace(/http:\/\/127\.0\.0\.1:417[34]\b/g, origin).replaceAll('output/', `${media}/`)
        const scenario = (0, eval)(`(${source})`) as (page: Page, options?: any) => Promise<any>
        if (name === 'webkit-capture-branch') {
          // 完整執行原有界音訊回歸作基線，不改它的素材、失敗／重試斷言或期限。
          const baselineSource = readFileSync(resolve(root, 'tests/browser/webkit-audio-branch.js'), 'utf8').replaceAll('output/', `${media}/`)
          const baseline = await ((0, eval)(`(${baselineSource})`))(page)
          result = { baseline, baselineSha256: createHash('sha256').update(readFileSync(resolve(root, 'tests/browser/webkit-audio-branch.js'))).digest('hex'), scenarioSha256: createHash('sha256').update(readFileSync(path)).digest('hex'), ...await scenario(page, { directory: media }) }
        } else if (name === 'comparison-keyboard') {
          const observing = observeKeyboardProtocol(page)
          try { result = await scenario(page, { interceptionReady: observing.interceptionReady }) }
          finally {
            // 成功與失敗同留原生回覆；只看DOM click無法分辨瀏覽器未開啟或driver尚未備妥。
            evidence.keyboardProtocol = observing.stop()
            console.log('comparison-keyboard native protocol:', JSON.stringify(evidence.keyboardProtocol))
          }
        } else if (name === 'move-draft') {
          const prepared = await scenario(page)
          assert.equal(prepared.beforeUnloadPrepared, true, '動作草稿尚未備妥真正離頁驗證')
          // 草稿預備不代表離頁保護已驗證；真正導航、拒絕原生提示後才執行既有回查階段。
          const asking = page.waitForEvent('dialog')
          const leaving = page.goto('about:blank').then(() => ({ resolved: true }), error => ({ resolved: false, error: String(error) }))
          const dialog = await asking, type = dialog.type(); await dialog.dismiss()
          assert.equal(type, 'beforeunload', '沒有真正的離頁確認提示')
          const navigationAttempt = await leaving
          result = { ...prepared, ...await scenario(page, 'verify-navigation'), nativeDialogType: type, navigationAttempt }
        } else if (name === 'capture-integrity') {
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
        } else result = await scenario(page, recovery ? { mode: recovery } : practiceError ? { mode: practiceError } : name === 'storage-version-change' ? { directory: media } : name === 'follow-results' || name === 'webkit-follow-results' ? { boundedAudio: name === 'webkit-follow-results' } : undefined)
      }
      // 兩條回歸共用逐檔完整核對；產品內Blob的指紋不能代替真正下載內容。
      if (name === 'webkit-capture-branch' || name === 'storage-version-change') {
        if (name === 'storage-version-change') result.scenarioSha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
        for (const download of result.downloads) {
          const bytes = readFileSync(download.path)
          assert.equal(bytes.length, download.expected.bytes, '真正下載長度不同')
          assert.equal(createHash('sha256').update(bytes).digest('hex'), download.expected.sha256, '真正下載完整指紋不同')
        }
      }
      if (result?.navigationCoverage) assert(map.fileCoverageFor(result.navigationCoverage.path).getLineCoverage()[result.navigationCoverage.line] > 0, `頁內重新載入遺失了舊頁面的計數：${JSON.stringify(result.navigationCoverage)}`)
      evidence.scenarios.push({ name, interface: defaultInterfaceScenarios.has(name) ? 'comparison-only-default' : 'retained-full-interface', status: 'passed', durationMs: Date.now() - started, result })
      console.log(`PASS ${name} (${Date.now() - started}ms)`)
    } catch (error) {
      evidence.scenarios.push({ name, interface: defaultInterfaceScenarios.has(name) ? 'comparison-only-default' : 'retained-full-interface', status: 'failed', durationMs: Date.now() - started, message: String(error), stack: error instanceof Error ? error.stack : undefined })
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
