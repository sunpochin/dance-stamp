/* 檔案用途：隔離啟動成檔保存尾段回歸並核對下載、獨立解碼及離站播放。所在層：本機 QA。主要關聯：tests/browser/vs-save-tail.js、analyze-export-failure.py。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir, release } from 'node:os'
import { pathToFileURL } from 'node:url'
import { webHeaders, webPaths, webFiles } from './web-assets'
import verify, { cases } from '../tests/browser/vs-save-tail.js'

const [modulePath, executablePath] = process.argv.slice(2)
assert(modulePath && executablePath && process.argv.length === 4, '用法：bun --no-env-file scripts/verify-vs-save-tail.ts <已安裝 playwright-core module> <Chrome executable>')
assert.equal(Bun.version, '1.4.4'); assert(existsSync(modulePath) && existsSync(executablePath))
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href)
const root = resolve(import.meta.dir, '..'), output = resolve(root, 'output/vs-save-tail')
mkdirSync(output, { recursive: true })
const run = mkdtempSync(join(output, 'run-')), nonce = randomUUID()
const lock = join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'dance-stamp-p0-media-test.lock')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const evidence: any = { startedAt: new Date().toISOString(), run, scope: 'synthetic Chrome product VS-save tail; notification loss is explicit injection, not natural Safari failure', source: {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  trackedChanges: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  runnerSha256: hash(readFileSync(import.meta.path)), testSha256: hash(readFileSync(join(root, 'tests/browser/vs-save-tail.js'))),
}, environment: { platform: process.platform, architecture: process.arch, kernel: release(), bun: Bun.version }, cases: {}, browserClosures: [], mediaCalls: 0 }
const save = () => writeFileSync(join(run, 'evidence.local.json'), JSON.stringify(evidence, null, 2))
let ownedLock = false, server: ReturnType<typeof Bun.serve> | undefined, context: any, launchUnknown = false
async function closeBrowser() {
  if (!context) return
  let info, failure, remaining = 'unverified'
  try {
    const cdp = await context.browser().newBrowserCDPSession(); info = await cdp.send('SystemInfo.getProcessInfo')
    assert(info.processInfo.length)
  } catch (error) { failure = error }
  // 稽核失敗仍可關閉自己握有的 handle；但 close 成功不能代替完整已知 PID 的退出證據。
  try { await context.close(); context = undefined } catch (error) { failure ||= error }
  if (info?.processInfo.length) try {
    const ids = info.processInfo.map(p => p.id).join(',')
    for (let i = 0; i < 40; i++) {
      const check = Bun.spawnSync(['/bin/ps', '-p', ids, '-o', 'pid=,ppid=,stat=,comm='])
      assert([0, 1].includes(check.exitCode) && !check.stderr.length, '自有程序查核失敗')
      remaining = check.stdout.toString().trim(); if (!remaining) break
      await Bun.sleep(100)
    }
  } catch (error) { failure ||= error }
  evidence.browserClosures.push({ processInfo: info?.processInfo || [], remaining, error: failure ? String(failure) : undefined }); save()
  if (failure) throw failure
  assert(!remaining, '自有瀏覽器未退出；保留鎖')
}
try {
  // 與既有檔案鎖、目錄鎖互斥；有界等待自然釋放，不接管、不刪鎖，也不提早啟動瀏覽器。
  const lockDeadline = Date.now() + 90000
  while (!ownedLock) {
    try { writeFileSync(lock, JSON.stringify({ nonce, pid: process.pid, task: 'vs-save-tail' }), { flag: 'wx' }); ownedLock = true }
    catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= lockDeadline) throw error
      evidence.waitingForLockSince ??= new Date().toISOString(); save(); await Bun.sleep(1000)
    }
  }
  for (const file of webFiles) if (file !== 'sw.js') assert.deepEqual(readFileSync(join(root, 'dist/web', file)), readFileSync(join(root, 'web', file)))
  evidence.staticVersion = readFileSync(join(root, 'dist/web/sw.js'), 'utf8').match(/const version = '([a-f0-9]{16})'/)?.[1]; assert(evidence.staticVersion)
  evidence.resources = Object.fromEntries([...webPaths.values()].map(file => [file, hash(readFileSync(join(root, 'dist/web', file)))]))
  evidence.analyzerSha256 = hash(readFileSync(join(root, 'scripts/analyze-export-failure.py')))
  const fixtures = resolve(root, 'output/export-failure')
  // 復用原本有界合成素材；不讀私人檔、不下載瀏覽器，不覆寫既有來源。
  if (!existsSync(join(fixtures, 'reference.mp4')) && !existsSync(join(fixtures, 'self.mp4'))) execFileSync(process.execPath, ['--no-env-file', 'scripts/make-export-fixtures.ts'], { cwd: root })
  assert(existsSync(join(fixtures, 'reference.mp4')) && existsSync(join(fixtures, 'self.mp4')))
  evidence.fixtures = Object.fromEntries(['reference', 'self'].map(name => [name, hash(readFileSync(join(fixtures, name + '.mp4')))]))
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    const file = webPaths.get(new URL(request.url).pathname)
    if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : Bun.file(join(root, 'dist/web', file)), { headers: { ...webHeaders,
      'Permissions-Policy': 'camera=(), microphone=(), display-capture=(), geolocation=()',
      'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/plain' } })
  } })
  const origin = server.url.origin; evidence.origin = origin; save()
  for (const kind of cases) {
    const folder = join(run, kind); mkdirSync(folder)
    const profile = join(folder, 'profile'); evidence.cases[kind] = { profile }; save()
    launchUnknown = true
    context = await chromium.launchPersistentContext(profile, { executablePath, headless: true, permissions: [], serviceWorkers: 'block', acceptDownloads: true,
      args: ['--disable-sync', '--disable-background-networking', '--mute-audio', '--deny-permission-prompts'] })
    launchUnknown = false; evidence.browser = context.browser().version(); context.setDefaultTimeout(20000)
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    await context.exposeBinding('blockedMedia', () => { evidence.mediaCalls++; save() })
    await context.addInitScript(() => {
      for (const key of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices) navigator.mediaDevices[key] = () => { window.blockedMedia(); throw new Error('禁止實體媒體擷取') }
    })
    const page = context.pages()[0], result = await verify(page, { origin, reference: join(fixtures, 'reference.mp4'), self: join(fixtures, 'self.mp4') }, folder, kind,
      async (stage, result) => { evidence.cases[kind] = { profile, stage, result }; save() })
    // 函式只接收確定的單一案例；所有 raw 在每個 barrier 即落盤，失敗也保留。
    evidence.cases[kind].result = result; save()
    // 復用原分析器逐格核對三秒成檔；不另設較寬的品質門檻，也不把靜態色條稱為同步矩陣。
    const files = ['old-vs', 'rescued-new-vs', ...(result.downloads['retry-new-vs'] ? ['retry-new-vs'] : [])].map(label => result.downloads[label].path)
    const decoded = execFileSync('python3', ['-c', 'import sys,json;sys.path.insert(0,sys.argv[1]);from pathlib import Path;from importlib import import_module;m=import_module("analyze-export-failure");level=m.tones(Path(sys.argv[2]))[0];print(json.dumps([m.analyze(Path(p),level) for p in sys.argv[3:]]))', join(root, 'scripts'), join(fixtures, 'reference.mp4'), ...files], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 })
    evidence.cases[kind].decode = JSON.parse(decoded); save()
    // 關閉所有產品頁再從 file origin 播放實際下載；無產品腳本或 HTTP 媒體，不能靠頁內輸出播放器冒充離站。
    for (const open of context.pages()) await open.close()
    await context.unroute('**/*'); await context.route(/^https?:/, route => route.abort())
    const download = result.downloads['rescued-new-vs'].path, html = join(folder, 'standalone.html')
    writeFileSync(html, '<!doctype html><title>Synthetic standalone VS</title><video muted playsinline controls src="' + download.split('/').at(-1) + '"></video>')
    const playback = await context.newPage(); await playback.goto(pathToFileURL(html).href)
    await playback.evaluate(async () => { await document.querySelector('video').play() })
    await playback.waitForFunction(() => document.querySelector('video').ended, null, { timeout: 15000 })
    evidence.cases[kind].standalone = await playback.evaluate(() => { const v = document.querySelector('video'), q = v.getVideoPlaybackQuality(); return { protocol: location.protocol, ended: v.ended, error: v.error?.code || 0, duration: v.duration, currentTime: v.currentTime, width: v.videoWidth, height: v.videoHeight, frames: q.totalVideoFrames, dropped: q.droppedVideoFrames } })
    assert.equal(evidence.cases[kind].standalone.protocol, 'file:'); assert(evidence.cases[kind].standalone.ended && !evidence.cases[kind].standalone.error)
    await closeBrowser()
  }
  assert.equal(evidence.mediaCalls, 0)
  evidence.success = true
} catch (error) { evidence.failure = String(error); process.exitCode = 1 } finally {
  try {
    await closeBrowser(); assert(!launchUnknown, '瀏覽器啟動結果未知；保留鎖')
    assert(evidence.browserClosures.every(x => !x.remaining), '程序未退出；保留鎖')
  } catch (error) { evidence.cleanupFailure = String(error); evidence.success = false; process.exitCode = 1 }
  // 瀏覽器／程序核對失敗仍要停止自己的 server；獨立收尾失敗不能跳過安全可做的下一步。
  try {
    if (server) { const url = server.url.origin; await server.stop(true); server = undefined; let reachable = false; try { await fetch(url); reachable = true } catch {} assert(!reachable); evidence.serverClosed = true }
  } catch (error) { evidence.cleanupFailure = [evidence.cleanupFailure, String(error)].filter(Boolean).join('; '); evidence.success = false; process.exitCode = 1 }
  try {
    if (ownedLock && !evidence.cleanupFailure) { assert.equal(JSON.parse(readFileSync(lock, 'utf8')).nonce, nonce); unlinkSync(lock); evidence.lockReleased = true }
  } catch (error) { evidence.cleanupFailure = String(error); evidence.success = false; process.exitCode = 1 }
  save(); console.log(JSON.stringify({ success: evidence.success || false, failure: evidence.failure, cleanupFailure: evidence.cleanupFailure, evidence: join(run, 'evidence.local.json') }))
}
