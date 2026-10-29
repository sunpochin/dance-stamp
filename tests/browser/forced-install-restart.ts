/* 檔案用途：在部分安裝或尚未提交的筆記交易中強制結束自有 Chromium，重啟核對合成資料。所在層：本機瀏覽器儲存回歸。主要關聯：sw.js、storage.js、MEDIA_PROBE.md。 */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { webPaths, webHeaders } from '../../scripts/web-assets'

assert.equal(Bun.version, '1.4.4', '請使用專案固定的 Bun 1.4.4')
assert(['darwin', 'linux'].includes(process.platform), '此強制終止工具只支援 POSIX 程序群組')
const [executable, playwrightModule] = process.argv.slice(2)
assert(executable && existsSync(executable) && playwrightModule && existsSync(playwrightModule), '請傳入已安裝 Chromium 執行檔及 playwright-core/index.mjs 的完整路徑；不自動安裝')
const mode = process.argv[4]
assert(!mode || mode === '--pending-write', '第三個參數僅接受 --pending-write')
const { chromium } = await import(pathToFileURL(resolve(playwrightModule)).href)
const root = resolve(import.meta.dir, '../..'), dist = join(root, 'dist/web')
const source = readFileSync(join(dist, 'sw.js'), 'utf8')
const oldVersion = source.match(/const version = '([a-f0-9]{16})'/)?.[1]
assert(oldVersion, '請先執行原建置入口')
const manifest = JSON.parse(source.match(/const manifest = (\{[^\n]+\});/)![1])
const output = join(root, 'output'); mkdirSync(output, { recursive: true })
// 每次都新建目錄，失敗的 profile／日誌也保留，不能換空庫來把同一次失敗變成功。
const run = mkdtempSync(join(output, mode ? 'pending-write-' : 'forced-install-')), profile = join(run, 'profile'), nonce = randomUUID()
const candidateVersion = `${oldVersion}-forced-${nonce.slice(0, 8)}`
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const oldFiles = new Map([...webPaths].map(([path, file]) => [path, readFileSync(join(dist, file))]))
for (const [path, digest] of Object.entries(manifest)) assert.equal(hash(oldFiles.get(path)!), digest, `建置資源不符合舊版 manifest：${path}`)
const candidateFiles = new Map(oldFiles)
candidateFiles.set('/', Buffer.from(`${oldFiles.get('/')}\n<!-- synthetic candidate ${nonce} -->\n`))
candidateFiles.set('/style.css', Buffer.from(`${oldFiles.get('/style.css')}\n/* synthetic candidate ${nonce} */\n`))
const candidateManifest = Object.fromEntries(Object.keys(manifest).map(path => [path, hash(candidateFiles.get(path)!)]))
candidateFiles.set('/sw.js', Buffer.from(source.replace(`'${oldVersion}'`, `'${candidateVersion}'`).replace(JSON.stringify(manifest), JSON.stringify(candidateManifest))))
// macOS 沿用既有共用鎖；Linux 改用系統暫存目錄，避免不存在的 /private/tmp 阻止測試。
const lock = join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'dance-stamp-p0-media-test.lock'), ownerFile = join(lock, 'owner.json')
const evidence: any = { status: 'running', scenario: mode ? 'pending-write' : 'partial-install', nonce, run, profile, oldVersion, candidateVersion: mode ? undefined : candidateVersion, sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), trackedChanges: execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim(), runnerSha256: hash(readFileSync(import.meta.path)), workerSha256: hash(source), storageSha256: hash(readFileSync(join(dist, 'storage.js'))), startedAt: new Date().toISOString(), events: [] }
const save = () => writeFileSync(join(run, 'evidence.local.json'), JSON.stringify(evidence, null, 2))
const event = (type: string, detail: any = {}) => { evidence.events.push({ at: new Date().toISOString(), type, ...detail }); save() }
let ownsLock = false, server: ReturnType<typeof Bun.serve> | undefined, browser: any, child: ReturnType<typeof spawn> | undefined
let candidate = false, held = 0, probeHits = 0, mediaCalls = 0
const pending: Array<() => void> = []
const members = (pid: number) => execFileSync('ps', ['-ax', '-o', 'pid=,ppid=,pgid=,lstart=,command='], { encoding: 'utf8' }).split('\n').filter(line => Number(line.trim().split(/\s+/)[2]) === pid)
const waitFor = async (check: () => any, message: string) => {
  const deadline = Date.now() + 20_000
  while (!await check()) { assert(Date.now() < deadline, message); await Bun.sleep(50) }
}
async function stop(signal: 'SIGKILL' | 'SIGTERM') {
  if (!child) return
  const owned = child, pid = owned.pid!
  assert(Number.isInteger(pid) && pid > 0, '缺少自有程序 PID，無法確認收尾')
  // 主程序已退出仍可能留下子程序；整個已知群組都消失，才可交回共用鎖。
  if (owned.exitCode !== null || owned.signalCode !== null) {
    assert.equal(members(pid).length, 0, '自有瀏覽器主程序已退出，但群組仍有程序')
    child = undefined
    return
  }
  const group = members(pid)
  assert(group.some(line => Number(line.trim().split(/\s+/)[0]) === pid && line.includes(`--user-data-dir=${profile}`)), 'PID／profile provenance 不符，拒絕發訊號')
  // detached 建立獨立群組；只終止本次 child 及其群組，不能用名稱掃殺日常瀏覽器。
  event('signal', { pid, processGroup: pid, signal, members: group })
  let timer: ReturnType<typeof setTimeout>
  const exited = new Promise(resolve => owned.once('exit', (code, actualSignal) => resolve({ code, signal: actualSignal })))
  process.kill(-pid, signal)
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('自有瀏覽器未確認退出')), 10_000) })
  const result = await Promise.race([exited, timeout]).finally(() => clearTimeout(timer))
  if (signal === 'SIGKILL') assert.equal((result as any).signal, 'SIGKILL')
  await waitFor(() => members(pid).length === 0, '自有瀏覽器群組仍有程序')
  event('exited', { pid, result, remainingGroupMembers: 0 })
  child = undefined
}
async function launch(phase: string) {
  mkdirSync(profile, { recursive: true })
  const address = join(profile, 'DevToolsActivePort')
  // 上輪強制結束可能留下舊除錯端點；只移除工具端點，不碰任何 cache 或資料庫。
  if (existsSync(address)) unlinkSync(address)
  const args = [`--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking', '--deny-permission-prompts', '--mute-audio', 'about:blank']
  child = spawn(resolve(executable), args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
  const owned = child
  let spawnError: Error | undefined
  owned.once('error', error => {
    spawnError = error; event('spawn-error', { message: String(error) })
    // 明確 spawn error 且沒有 PID 才能證明未產生自有程序；已有 PID 的失敗仍須由 stop 查群組。
    if (child === owned && owned.pid === undefined) child = undefined
  })
  owned.stderr?.on('data', data => { appendFileSync(join(run, `${phase}-chromium.log`), data) })
  event('spawn', { phase, pid: owned.pid, executable: resolve(executable), args })
  await waitFor(() => { if (spawnError) throw spawnError; assert(owned.exitCode === null && owned.signalCode === null, '專用瀏覽器啟動失敗'); return existsSync(address) }, '專用瀏覽器除錯入口逾時')
  const port = Number(readFileSync(address, 'utf8').split('\n')[0])
  assert(Number.isInteger(port) && port > 0 && port < 65536)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  evidence.browserVersion = browser.version()
  const context = browser.contexts()[0]
  context.setDefaultTimeout(20_000)
  await context.clearPermissions()
  await context.exposeBinding('blockedSyntheticMedia', () => { mediaCalls++ })
  await context.addInitScript(() => {
    for (const method of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices) navigator.mediaDevices[method] = async () => { (globalThis as any).blockedSyntheticMedia(); throw new Error('此儲存測試禁止相機／麥克風／擷取') }
  })
  await context.route('**/*', route => new URL(route.request().url()).origin === server!.url.origin ? route.continue() : route.abort())
  event('connected', { phase, pid: child.pid, profile, processGroup: members(child.pid!) })
  return { context, page: await context.newPage() }
}
const ready = async (page: any) => {
  await page.waitForFunction(() => !(document.getElementById('controls') as HTMLFieldSetElement)?.disabled && document.getElementById('offline-status')?.textContent.includes('已檢查應用資源完整'))
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
}
const snapshot = (page: any) => page.evaluate(async () => {
  const storage = await import('/storage.js'), library = await storage.readLibrary(), db = await storage.openStore()
  const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
  const native = await request(db.transaction('metadata').objectStore('metadata').get('library'))
  const keys = await request(db.transaction('media').objectStore('media').getAllKeys()), blobs = []
  for (const id of keys as string[]) {
    const blob = await storage.readMedia(id), bytes = new Uint8Array(await blob.arrayBuffer())
    blobs.push({ id, bytes: bytes.length, type: blob.type, allBytesMatch: bytes.every((b, i) => b === (i * 31 + 17) % 251), sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('') })
  }
  return { library, native, keys, blobs }
})
const cacheSnapshot = (page: any, name: string) => page.evaluate(async name => {
  if (!await caches.has(name)) return null
  const cache = await caches.open(name), entries = {}
  for (const request of await cache.keys()) {
    const response = await cache.match(request), bytes = await response.arrayBuffer()
    entries[new URL(request.url).pathname] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('')
  }
  return entries
}, name)
const workerStatus = (page: any) => page.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration(), channel = new MessageChannel()
  const status = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('舊 worker 狀態逾時')), 10_000); channel.port1.onmessage = e => { clearTimeout(timer); resolve(e.data) }; navigator.serviceWorker.controller!.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]) })
  return { status, active: registration?.active?.state, installing: registration?.installing?.state ?? null, waiting: registration?.waiting?.state ?? null, controller: navigator.serviceWorker.controller?.scriptURL }
})
try {
  // mkdir 原子競爭；別人的鎖保持原樣，無鎖時才開始正式瀏覽器驗證。
  mkdirSync(lock); ownsLock = true
  writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, nonce, purpose: `issue-13 synthetic ${evidence.scenario} restart`, startedAt: new Date().toISOString() }))
  event('lock-acquired')
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const path = new URL(request.url).pathname
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    if (path === '/__test__/offline-probe') { probeHits++; event('probe-network-hit'); return new Response('network reachable') }
    const bytes = (candidate ? candidateFiles : oldFiles).get(path)
    if (!bytes) return new Response('Not found', { status: 404 })
    event('network', { path, mode: candidate ? 'candidate' : 'old' })
    if (candidate && path === '/style.css') {
      held++; event('barrier-held', { path, held })
      // 真正 HTTP 回應保持未完成，讓原生 install 等下載；不替換 Cache API 或偽造生命週期。
      await new Promise<void>(resolve => pending.push(resolve))
      return new Response('barrier closed', { status: 503 })
    }
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: { ...webHeaders, 'Content-Type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path === '/' ? 'text/html' : 'text/plain' } })
  } })
  evidence.origin = server.url.origin; save()
  const first = await launch('prepare'), page = first.page, origin = server.url.origin
  await page.goto(origin); await page.waitForFunction(() => document.getElementById('offline-status')?.textContent.includes('已檢查應用資源完整'))
  await page.reload(); await ready(page)
  assert.equal((await snapshot(page)).library.revision, 0, '只允許本次全新 profile，不清空既有資料')
  await page.evaluate(async () => {
    const { readLibrary, writeLibrary } = await import('/storage.js'), { data, revision } = await readLibrary()
    const videoId = crypto.randomUUID(), assetId = crypto.randomUUID(), bytes = Uint8Array.from({ length: 1048613 }, (_, i) => (i * 31 + 17) % 251)
    const blob = new Blob([bytes], { type: 'application/octet-stream' })
    data.videos.push({ id: videoId, title: '合成強制中斷筆記', durationMs: 15000, revision: 3 })
    data.markers.push({ id: crypto.randomUUID(), videoId, title: '合成標記', note: '新版部分安裝前已保存', startMs: 1000, revision: 2 })
    data.assets.push({ id: assetId, videoId, kind: 'reference', byteLength: blob.size, mimeType: blob.type })
    await writeLibrary(data, revision, { id: assetId, blob })
  })
  const before = await snapshot(page)
  assert.equal(before.blobs.length, 1); assert(before.blobs[0].allBytesMatch)
  assert.equal(before.blobs[0].sha256, hash(Uint8Array.from({ length: 1048613 }, (_, i) => (i * 31 + 17) % 251)))
  const oldCache = `dance-stamp-web-${oldVersion}`, nextCache = `dance-stamp-web-${candidateVersion}`
  assert.deepEqual(await cacheSnapshot(page, oldCache), manifest)
  evidence.before = before; evidence.oldCacheBefore = await cacheSnapshot(page, oldCache); event('baseline-saved')
  if (mode) {
    assert.deepEqual(readFileSync(join(dist, 'storage.js')), readFileSync(join(root, 'web/storage.js')), '必須測真正產品儲存模組，不能使用舊建置')
    const next = structuredClone(before.library.data), assetId = next.assets[0].id, bytes = 1048613
    next.videos[0].title = '中斷後重試的新筆記'; next.videos[0].revision++
    next.markers[0].note = '只有完整提交才取代舊筆記'; next.markers[0].revision++
    const replacementHash = hash(Uint8Array.from({ length: bytes }, (_, i) => (i * 31 + 23) % 251))
    evidence.candidateWrite = { data: next, assetId, bytes, sha256: replacementHash }
    await page.evaluate(async ({ next, assetId, bytes }) => {
      const storage = await import('/storage.js'), saved = await storage.readLibrary()
      const state = (window as any).pendingWrite = { ticks: 0, writes: [], settled: false, completed: false, aborted: false, candidateSeen: false }
      const original = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function(names, access, ...rest) {
        const tx = original.call(this, names, access, ...rest)
        if (access !== 'readwrite' || !Array.isArray(names) || !names.includes('metadata') || !names.includes('media')) return tx
        IDBDatabase.prototype.transaction = original
        tx.addEventListener('complete', () => { state.completed = true })
        tx.addEventListener('abort', () => { state.aborted = true })
        tx.addEventListener('success', event => {
          const request = event.target as IDBRequest
          // 真正 put 的成功回覆是 key；get 回覆物件不算已經寫入，事件也必須是原生的。
          if (request instanceof IDBRequest && typeof request.result === 'string') state.writes.push({ store: (request.source as IDBObjectStore).name, key: request.result, trusted: event.isTrusted })
        }, { capture: true })
        // 只延長原生交易的未提交時段；所有 put、Blob 與產品完成／失敗處理仍原樣執行。
        const keepAlive = () => {
          const request = tx.objectStore('metadata').get('library')
          request.onsuccess = () => {
            state.ticks++
            if (request.result?.revision === saved.revision + 1 && request.result.data.videos[0].title === next.videos[0].title) state.candidateSeen = true
            keepAlive()
          }
        }
        keepAlive(); return tx
      }
      const blob = new Blob([Uint8Array.from({ length: bytes }, (_, i) => (i * 31 + 23) % 251)], { type: 'application/octet-stream' })
      void storage.writeLibrary(next, saved.revision, { id: assetId, blob }).then(() => { state.settled = true }, error => { state.settled = true; state.error = String(error) })
    }, { next, assetId, bytes })
    await page.waitForFunction(() => {
      const state = (window as any).pendingWrite
      return state.candidateSeen && state.ticks > 2 && state.writes.some(write => write.store === 'metadata' && write.trusted) && state.writes.some(write => write.store === 'media' && write.trusted)
    })
    const firstBarrier = await page.evaluate(() => structuredClone((window as any).pendingWrite))
    await Bun.sleep(100)
    const secondBarrier = await page.evaluate(() => structuredClone((window as any).pendingWrite))
    assert(secondBarrier.ticks > firstBarrier.ticks && !secondBarrier.settled && !secondBarrier.completed && !secondBarrier.aborted, '必須是在 put 已成功但尚未提交的交易內強制終止')
    evidence.writeBarrier = { first: firstBarrier, second: secondBarrier }; event('pending-write-proven')
    await stop('SIGKILL')
    const restarted = await launch('write-restart'); await restarted.page.goto(origin); await ready(restarted.page)
    const after = await snapshot(restarted.page)
    assert.deepEqual(after, before, '交易中斷後原生筆記／revision／Blob 不同')
    evidence.afterInterruptedWrite = after; event('old-data-retained')
    const retry = await restarted.page.evaluate(async ({ next, assetId, bytes }) => {
      const storage = await import('/storage.js'), saved = await storage.readLibrary()
      const expected = Uint8Array.from({ length: bytes }, (_, i) => (i * 31 + 23) % 251)
      const result = await storage.writeLibrary(next, saved.revision, { id: assetId, blob: new Blob([expected], { type: 'application/octet-stream' }) })
      const actual = new Uint8Array(await (await storage.readMedia(assetId)).arrayBuffer())
      return { revision: result.revision, everyByteMatches: actual.length === expected.length && actual.every((value, i) => value === expected[i]) }
    }, { next, assetId, bytes })
    assert(retry.everyByteMatches); assert.equal(retry.revision, before.library.revision + 1)
    const committed = await snapshot(restarted.page)
    assert.deepEqual(committed.native, { revision: retry.revision, data: next })
    assert.deepEqual(committed.keys, before.keys); assert.equal(committed.blobs[0].sha256, replacementHash)
    evidence.retry = { ...retry, committed }; event('same-candidate-retry-committed')
    await stop('SIGTERM')
    const reopened = await launch('committed-restart'); await reopened.page.goto(origin); await ready(reopened.page)
    assert.deepEqual(await snapshot(reopened.page), committed, '重試提交後同 profile 新程序重開資料不同')
    assert.equal(mediaCalls, 0); evidence.mediaCalls = mediaCalls; event('committed-restart-verified')
  } else {
  candidate = true
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update() })
  await waitFor(() => held > 0, '候選沒有抵達真正 HTTP barrier')
  await page.waitForFunction(async name => await caches.has(name) && (await (await caches.open(name)).keys()).length > 0, nextCache)
  const partial = await cacheSnapshot(page, nextCache), status = await workerStatus(page)
  assert.deepEqual(partial, { '/': candidateManifest['/'] }); assert.notEqual(partial['/'], manifest['/'])
  assert.equal(status.installing, 'installing'); assert.equal(status.waiting, null); assert.equal(status.active, 'activated')
  assert.equal(status.status.version, oldVersion); assert.equal(status.status.complete, true)
  assert.deepEqual(await cacheSnapshot(page, oldCache), manifest); assert.deepEqual(await snapshot(page), before)
  evidence.barrier = { held, path: '/style.css', partial, candidateManifest, status, beforeKillAt: new Date().toISOString() }; event('partial-install-proven')
  // 先保存 barrier 與原生資料證據，再送不可攔截的 SIGKILL；此處絕不先呼叫 browser.close。
  await stop('SIGKILL')
  const restarted = await launch('restart')
  await restarted.context.setOffline(true)
  const hitsBefore = probeHits, eventsBefore = evidence.events.length
  const response = await restarted.page.goto(origin); await ready(restarted.page)
  assert(response?.fromServiceWorker(), '重啟頁面沒有由舊 SW 提供')
  assert.equal(hash(await response.body()), manifest['/'], '重啟拿到的不是原舊殼 bytes')
  const probe = await restarted.page.evaluate(async () => { try { await fetch('/__test__/offline-probe'); return 'reachable' } catch { return 'offline' } })
  assert.equal(probe, 'offline'); assert.equal(probeHits, hitsBefore)
  assert.equal(evidence.events.slice(eventsBefore).filter(e => ['network', 'barrier-held', 'probe-network-hit'].includes(e.type)).length, 0, '斷網重開仍碰到測試主機')
  assert.equal(await restarted.page.evaluate(() => navigator.onLine), false)
  const after = await snapshot(restarted.page), afterStatus = await workerStatus(restarted.page)
  assert.deepEqual(after, before); assert.equal(afterStatus.status.version, oldVersion); assert.equal(afterStatus.status.complete, true)
  assert.equal(afterStatus.active, 'activated'); assert.equal(afterStatus.waiting, null)
  assert.deepEqual(await cacheSnapshot(restarted.page, oldCache), manifest)
  assert.equal(mediaCalls, 0)
  evidence.after = after; evidence.afterStatus = afterStatus
  evidence.offline = { sameProfile: profile, fromServiceWorker: true, oldShellSha256: manifest['/'], probe, serverProbeHits: probeHits, nativeOnline: false }
  evidence.candidateCacheAfter = await cacheSnapshot(restarted.page, nextCache)
  evidence.mediaCalls = mediaCalls; event('offline-restart-verified')
  }
  evidence.status = 'passed'
} catch (error) {
  evidence.status = 'failed'; evidence.error = String(error); evidence.stack = (error as Error).stack
  event('failure', { error: String(error) }); process.exitCode = 1
} finally {
  try { await stop('SIGTERM') } catch (error) { evidence.status = 'failed'; evidence.cleanupError = String(error); process.exitCode = 1 }
  // 清理未確認必須留鎖；nonce 讀取失敗也只記錯誤，不能略過後面的自有主機收尾。
  if (ownsLock) {
    try {
      assert(!child, 'browser cleanup unverified; own lock retained')
      assert.equal(JSON.parse(readFileSync(ownerFile, 'utf8')).nonce, nonce, 'nonce changed; did not remove')
      unlinkSync(ownerFile); rmdirSync(lock); evidence.lockReleased = true
    } catch (error) { evidence.lockReleaseError = String(error); evidence.status = 'failed'; process.exitCode = 1 }
  }
  for (const release of pending) release()
  server?.stop(true)
  evidence.finishedAt = new Date().toISOString(); save()
  console.log(JSON.stringify({ status: evidence.status, scenario: evidence.scenario, oldVersion, candidateVersion: evidence.candidateVersion, raw: join(run, 'evidence.local.json'), lockReleased: evidence.lockReleased ?? false }))
}
