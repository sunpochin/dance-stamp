/* 檔案用途：在大型外來源匯入的 hash 關卡點真正 Stop，核對沒有寫入交易且同檔可重試。所在層：隔離 Chrome 儲存回歸。主要關聯：backupPlanningStop.test.ts、backup-planning.js。 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { webPaths, webHeaders } from '../../scripts/web-assets'
import { planningLibrary, planningSource } from '../fixtures/backup-planning.js'

assert.equal(Bun.version, '1.4.4')
const [executable, playwrightModule] = process.argv.slice(2)
assert(executable && existsSync(executable) && playwrightModule && existsSync(playwrightModule), '請傳入已安裝 Chrome 執行檔與 playwright-core/index.mjs；不自動下載')
const { chromium } = await import(pathToFileURL(resolve(playwrightModule)).href)
const root = resolve(import.meta.dir, '../..'), dist = join(root, 'dist/web'), nonce = randomUUID()
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sw = readFileSync(join(dist, 'sw.js'), 'utf8'), version = sw.match(/const version = '([a-f0-9]{16})'/)?.[1]
assert(version, '請先執行原建置入口')
const resources = new Map([...webPaths].map(([path, file]) => [path, readFileSync(join(dist, file))]))
for (const [path, digest] of Object.entries(JSON.parse(sw.match(/const manifest = (\{[^\n]+\});/)![1]))) assert.equal(hash(resources.get(path)), digest)
for (const file of ['library.js', 'main.js', 'storage.js']) assert.deepEqual(readFileSync(join(dist, file)), readFileSync(join(root, 'web', file)))
const output = join(root, 'output'); mkdirSync(output, { recursive: true })
const run = mkdtempSync(join(output, 'backup-planning-stop-')), profile = join(run, 'profile')
const lock = join(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'dance-stamp-p0-media-test.lock'), owner = join(lock, 'owner.json')
const evidence: any = { status: 'running', nonce, run, profile, version, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), diff: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), runnerSha256: hash(readFileSync(import.meta.path)), fixtureSha256: hash(readFileSync(join(root, 'tests/fixtures/backup-planning.js'))), productSha256: Object.fromEntries(['library.js', 'main.js', 'storage.js'].map(file => [file, hash(readFileSync(join(dist, file)))])), outside: [], pageErrors: [] }
const save = () => writeFileSync(join(run, 'evidence.local.json'), JSON.stringify(evidence, null, 2))
const processes = () => execFileSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' }).split('\n').filter(line => line.includes(profile))
let ownsLock = false, server: ReturnType<typeof Bun.serve> | undefined, context: any
try {
  // 收尾需要可讀程序表；權限不足應在拿鎖之前留下前置失敗，不能留下自有程序。
  processes()
  // mkdir 原子取得共用鎖；鎖忙即保留前置失敗，不刪除、接管或換名字繞過。
  mkdirSync(lock); ownsLock = true
  writeFileSync(owner, JSON.stringify({ pid: process.pid, nonce, purpose: 'large import planning Stop', profile }))
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    const path = new URL(request.url).pathname, bytes = resources.get(path)
    if (!bytes || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: { ...webHeaders, 'Content-Type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path === '/' ? 'text/html' : 'text/plain' } })
  } })
  evidence.origin = server.url.origin; save()
  context = await chromium.launchPersistentContext(profile, { executablePath: resolve(executable), headless: true, args: ['--no-first-run', '--disable-sync', '--disable-background-networking', '--deny-permission-prompts', '--mute-audio'] })
  context.setDefaultTimeout(30_000)
  evidence.browserVersion = context.browser()?.version()
  await context.route('**/*', route => {
    const request = route.request()
    if (new URL(request.url()).origin === server!.url.origin && ['GET', 'HEAD'].includes(request.method())) return route.continue()
    evidence.outside.push({ method: request.method(), protocol: new URL(request.url()).protocol }); return route.abort()
  })
  await context.addInitScript(() => {
    (window as any).planningMediaCalls = 0
    for (const method of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices) navigator.mediaDevices[method] = async () => { (window as any).planningMediaCalls++; throw new Error('合成規劃測試禁止相機／麥克風／擷取') }
  })
  const page = context.pages()[0]
  page.on('pageerror', error => { evidence.pageErrors.push(String(error)) })
  const idle = () => page.waitForFunction(() => !(document.getElementById('controls') as HTMLFieldSetElement).disabled && document.getElementById('library-panel')?.getAttribute('aria-busy') !== 'true')
  const snapshot = () => page.evaluate(async () => {
    const storage = await import('/storage.js'), db = await storage.openStore()
    const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    const native = await request(db.transaction('metadata').objectStore('metadata').get('library')), blobs = {}
    for (const name of ['media', 'chunks']) {
      const store = db.transaction(name).objectStore(name), [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())])
      blobs[name] = await Promise.all((values as Blob[]).map(async (blob, i) => ({ key: keys[i], type: blob.type, bytes: [...new Uint8Array(await blob.arrayBuffer())] })))
    }
    return { native, library: await storage.readLibrary(), blobs, unconfirmed: storage.storageUnconfirmed() }
  })
  await page.goto(server.url.origin); await idle()
  await page.evaluate(async local => {
    const storage = await import('/storage.js'); let saved = await storage.readLibrary()
    if (saved.revision !== 0) throw new Error('只允許全新隔離 profile，不清除既有資料')
    // 不可播放的合成 Blob 只驗證 bytes 保存；不冒稱原片／VS 解碼或媒體品質驗收。
    for (let i = 0; i < local.assets.length; i++) saved = await storage.writeLibrary(local, saved.revision, { id: local.assets[i].id, blob: new Blob([Uint8Array.from({ length: 16 }, (_, j) => i * 16 + j)], { type: 'application/octet-stream' }) })
    await storage.saveChunk(local.takes[0].cameraAssetId, 0, new Blob(['synthetic-retained-chunk']))
  }, planningLibrary(1, 1))
  await page.reload(); await idle()
  const before = await snapshot(); evidence.before = before
  assert.equal(before.blobs.media.length, 3); assert.equal(before.blobs.chunks.length, 1)
  const incoming = planningSource(planningLibrary(), 'foreign'), file = join(run, 'synthetic-large-foreign.json'), bytes = Buffer.from(JSON.stringify(incoming))
  writeFileSync(file, bytes); evidence.file = { bytes: bytes.length, sha256: hash(bytes), counts: Object.fromEntries(['videos', 'assets', 'markers', 'takes', 'recipes', 'exports', 'moves'].map(table => [table, incoming[table].length])) }
  assert(bytes.length > 3 * 1024 * 1024 && bytes.length < 10 * 1024 * 1024)
  const expected = await page.evaluate(async incoming => (await import('/library.js')).planBackupImport((await (await import('/storage.js')).readLibrary()).data, incoming), incoming)
  await page.evaluate(() => {
    const q = (window as any).planningStop = { hashes: [], transactions: [], clicks: [], held: false, thrown: false, signal: null, release: null }
    const originalDigest = crypto.subtle.digest, digest = originalDigest.bind(crypto.subtle), transaction = IDBDatabase.prototype.transaction, throwIfAborted = AbortSignal.prototype.throwIfAborted
    q.restore = () => { crypto.subtle.digest = originalDigest; IDBDatabase.prototype.transaction = transaction; AbortSignal.prototype.throwIfAborted = throwIfAborted }
    document.getElementById('stop')!.addEventListener('click', event => { q.clicks.push({ trusted: event.isTrusted, id: (event.target as HTMLElement).id }) }, { capture: true })
    AbortSignal.prototype.throwIfAborted = function() {
      q.signal = this
      try { return throwIfAborted.call(this) } catch (error) { q.thrown = true; throw error }
    }
    IDBDatabase.prototype.transaction = function(...args) {
      const tx = transaction.apply(this, args), row = { mode: tx.mode, stores: [...tx.objectStoreNames], complete: false, abort: false, trusted: false }; q.transactions.push(row)
      tx.addEventListener('complete', event => { row.complete = true; row.trusted = event.isTrusted })
      tx.addEventListener('abort', event => { row.abort = true; row.trusted = event.isTrusted }); return tx
    }
    crypto.subtle.digest = async (algorithm, bytes) => {
      const descriptor = JSON.parse(new TextDecoder().decode(bytes as ArrayBuffer)), row = { namespace: descriptor[0], complete: false }; q.hashes.push(row)
      const result = await digest(algorithm, bytes); row.complete = true
      // 明示暫扣第二個原生 hash 結果，給真正點按可重現關卡；沒有偽造原生慢速／錯誤。
      if (q.hashes.length === 2) { q.held = true; await new Promise<void>(resolve => { q.release = resolve }) }
      return result
    }
  })
  const observation = () => page.evaluate(() => {
    const q = (window as any).planningStop
    return { hashes: q.hashes, transactions: q.transactions, clicks: q.clicks, held: q.held, thrown: q.thrown, aborted: q.signal?.aborted, busy: document.getElementById('library-panel')?.getAttribute('aria-busy'), dialogOpen: (document.getElementById('import-dialog') as HTMLDialogElement).open }
  })
  await page.locator('#restore').setInputFiles(file)
  await page.waitForFunction(() => (window as any).planningStop.held)
  evidence.barrier = await observation(); save()
  assert.equal(evidence.barrier.hashes.length, 2); assert(evidence.barrier.hashes.every(row => row.complete && row.namespace === 'dance-stamp-import-v1'))
  assert.equal(evidence.barrier.aborted, false); assert.equal(evidence.barrier.busy, 'true'); assert.equal(evidence.barrier.dialogOpen, false)
  assert.equal(evidence.barrier.transactions.filter(tx => tx.mode !== 'readonly').length, 0)
  await page.locator('#stop').click()
  evidence.afterClick = await observation(); save()
  assert(evidence.afterClick.aborted && evidence.afterClick.clicks.some(click => click.id === 'stop' && click.trusted))
  await page.evaluate(() => (window as any).planningStop.release()); await idle()
  evidence.afterStop = await observation()
  assert(evidence.afterStop.thrown && evidence.afterStop.hashes.length === 2 && !evidence.afterStop.dialogOpen && evidence.afterStop.busy === 'false')
  assert.equal(evidence.afterStop.transactions.filter(tx => tx.mode !== 'readonly').length, 0)
  await page.evaluate(() => (window as any).planningStop.restore())
  assert.deepEqual(await snapshot(), before)
  assert.equal(await page.locator('#restore').inputValue(), '')
  assert.equal(await page.locator('#diagnostics').evaluate(el => JSON.parse(el.textContent).lastError), 'cancelled')
  assert((await page.locator('#status').textContent()).includes('已停止'))
  // 同一個未修改檔案重新預覽，確認前仍不能寫入；確認後必須有 trusted native complete。
  await page.locator('#restore').setInputFiles(file); await idle(); assert(await page.locator('#import-dialog').evaluate(el => el.open))
  assert.deepEqual(await snapshot(), before)
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction, receipts = (window as any).retryReceipts = []
    IDBDatabase.prototype.transaction = function(...args) {
      const tx = original.apply(this, args)
      if (tx.mode === 'readwrite') { const row = { stores: [...tx.objectStoreNames], complete: false, abort: false, trusted: false }; receipts.push(row); tx.addEventListener('complete', event => { row.complete = true; row.trusted = event.isTrusted }); tx.addEventListener('abort', () => { row.abort = true }) }
      return tx
    }
  })
  await page.locator('#import-confirm').click(); await idle()
  const imported = await snapshot(); evidence.imported = imported; evidence.retryReceipts = await page.evaluate(() => (window as any).retryReceipts)
  assert.equal(imported.native.revision, before.native.revision + 1); assert.deepEqual(imported.native.data, expected.data); assert.deepEqual(imported.blobs, before.blobs); assert.equal(imported.unconfirmed, false)
  assert.equal(evidence.retryReceipts.length, 1); assert(evidence.retryReceipts.every(tx => tx.complete && tx.trusted && !tx.abort))
  await page.locator('#restore').setInputFiles(file); await idle(); assert.equal(await page.locator('#import-confirm').textContent(), '完成，沒有新資料')
  await page.locator('#import-confirm').click(); await idle(); assert.deepEqual(await snapshot(), imported)
  assert.equal(await page.evaluate(() => (window as any).retryReceipts.length), 1)
  assert.equal(hash(readFileSync(file)), evidence.file.sha256)
  assert.equal(await page.evaluate(() => (window as any).planningMediaCalls), 0)
  await page.reload(); await idle(); assert.deepEqual(await snapshot(), imported)
  assert.equal(evidence.outside.length, 0); assert.equal(evidence.pageErrors.length, 0)
  evidence.status = 'passed'; evidence.sameFileRetryAndReimport = true; evidence.reloadPreserved = true; save()
} catch (error) { evidence.status = 'failed'; evidence.error = String(error); save(); throw error }
finally {
  try {
    await context?.close()
    if (ownsLock) { evidence.remainingProfileProcesses = processes(); assert.equal(evidence.remainingProfileProcesses.length, 0, '自有 profile 尚有程序，保留鎖') }
    if (server) { const url = server.url; await server.stop(true); assert.equal(await fetch(url).then(() => true, () => false), false, '自有 port 尚未關閉，保留鎖') }
    if (ownsLock) { assert.equal(JSON.parse(readFileSync(owner, 'utf8')).nonce, nonce); unlinkSync(owner); rmdirSync(lock) }
    evidence.cleanedUp = true
  } catch (error) { evidence.cleanupError = String(error); throw error }
  finally { save() }
}
console.log(JSON.stringify({ status: evidence.status, version, fileBytes: evidence.file.bytes, hashesBeforeStop: evidence.barrier.hashes.length, readwriteBeforeStop: evidence.afterStop.transactions.filter(tx => tx.mode !== 'readonly').length, sameFileRetryAndReimport: evidence.sameFileRetryAndReimport, cleanedUp: evidence.cleanedUp, run }))
