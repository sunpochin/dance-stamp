/* 檔案用途：用 Chromium 真正配額拒絕驗證產品交易回滾與同 profile 重試。所在層：獨立儲存 QA，不隨產品分發。主要關聯：web/storage.js、docs/evidence/issue-13-native-quota.md。 */
import { deepStrictEqual, ok } from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { closeSync, fsyncSync, openSync, readdirSync, statfsSync, statSync, writeSync } from 'node:fs'
import { webHeaders, webPaths } from './web-assets'

// 使用已安裝的 QA 工具；不替產品新增 Playwright 依賴或自動下載瀏覽器。
const modulePath = process.argv[2], executablePath = process.argv[3]
if (!modulePath || !executablePath) throw new Error('用法：bun --no-env-file scripts/verify-native-quota.ts <playwright module> <Chromium executable>')
const lowSpace = process.argv[4] === '--low-space'
ok(process.argv.length === (lowSpace ? 5 : 4), '只接受選用的 --low-space；不接受使用者磁碟或 profile 路徑')
ok(!lowSpace || process.platform === 'darwin', '小型測試映像目前僅支援 macOS')
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href)
const root = resolve(import.meta.dir, '..'), output = resolve(root, 'output/native-quota')
mkdirSync(output, { recursive: true })
const run = mkdtempSync(resolve(output, 'run-')), volume = resolve(run, 'volume'), image = resolve(run, 'volume.dmg')
const profile = resolve(lowSpace ? volume : run, 'profile'), filler = resolve(volume, 'owned-filler')
// 兩支儲存工具須使用同一個平台暫存目錄，才能互斥，不能各建一份測試鎖。
const lockPath = resolve(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'dance-stamp-p0-media-test.lock'), nonce = randomUUID()
const report: any = { startedAt: new Date().toISOString(), mode: lowSpace ? 'bounded-filesystem' : 'origin-quota', scope: 'product storage functions; no product UI or playable media', run, profile }
const save = () => writeFileSync(resolve(run, 'result.json'), JSON.stringify(report, null, 2) + '\n')
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
// 原生 Promise 卡住也是失敗；工具逾時只進清理，不能偽稱資料已回滾。
const observe = async <T>(work: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('原生儲存觀察逾時；回滾未驗證')), 20_000) })]) }
  finally { clearTimeout(timer!) }
}
let locked = false, server: ReturnType<typeof Bun.serve> | undefined, context: any, cdp: any, origin: string
let attached = false, attachUnconfirmed = false, ownsFiller = false, launchUnconfirmed = false
const diskSpace = () => { const fs = statfsSync(volume); return { bytes: fs.blocks * fs.bsize, available: fs.bavail * fs.bsize, device: statSync(volume).dev } }
const fillVolume = () => {
  const before = diskSpace()
  // 只能填本輪新建的小型獨立映像；容量或裝置不符就停，絕不填宿主磁碟。
  ok(attached && before.device !== statSync(run).dev && before.bytes <= 256 * 1048576 && before.bytes > 32 * 1048576, '不是本輪小型測試 volume')
  const fd = openSync(filler, 'wx'), block = new Uint8Array(65536).fill(83)
  ownsFiller = true
  let bytes = 0, diskFull = false
  try {
    while (bytes <= 256 * 1048576) {
      try { bytes += writeSync(fd, block) }
      catch (error) { if (error.code !== 'ENOSPC') throw error; diskFull = true; break }
    }
    fsyncSync(fd)
  } finally { closeSync(fd) }
  const result = { before, after: diskSpace(), bytes, diskFull }
  ;(report.diskFills ??= []).push(result); save()
  ok(diskFull && result.after.available < block.length, '沒有真正 ENOSPC，不能宣稱低空間通過')
}
const releaseVolume = () => {
  if (ownsFiller) { unlinkSync(filler); ownsFiller = false; report.diskReleased = diskSpace(); save() }
}
const closeOwnedBrowser = async () => {
  // 關閉或程序稽核失敗時須保留鎖與映像，避免另一輪測試碰到仍在使用的 profile。
  report.browserClosed = false
  report.browserCloseError = 'browser cleanup unverified; own lock retained'
  // CDP 僅列出自己啟動的瀏覽器程序；關閉後只查這些 PID，不掃描或終止其他程序。
  let processInfo
  try {
    const browserCDP = await context.browser().newBrowserCDPSession()
    processInfo = (await browserCDP.send('SystemInfo.getProcessInfo')).processInfo
  } catch (error) { report.processAuditError = String(error); process.exitCode = 1 }
  await context.close(); context = undefined; cdp = undefined
  ok(processInfo?.length, '自己瀏覽器已關閉，但缺少程序核對資料')
  const ids = processInfo.map(p => p.id).join(',')
  let remaining = ''
  for (let i = 0; i < 20; i++) {
    const check = Bun.spawnSync(['/bin/ps', '-p', ids, '-o', 'pid=,ppid=,stat=,comm='])
    // ps 的 1 也可能是權限錯誤；只有沒有診斷訊息的空結果才可當作程序已退出。
    ok((check.exitCode === 0 || check.exitCode === 1) && check.stderr.length === 0, '無法核對自己的程序')
    remaining = check.stdout.toString().trim()
    if (!remaining) break
    await Bun.sleep(100)
  }
  ;(report.browserClosures ??= []).push({ processInfo, remaining })
  if (remaining) report.browserCloseError = 'owned browser processes remain; own lock retained'
  ok(!remaining, '自己瀏覽器仍有程序，未掃殺或釋放測試鎖')
  report.browserClosed = true
  delete report.browserCloseError
}
try {
  // 原子取得且只釋放同 nonce 的鎖；既有檔案即拒絕，不猜測或刪除其他測試的鎖。
  writeFileSync(lockPath, JSON.stringify({ nonce, pid: process.pid, task: 'issue-13-native-quota' }), { flag: 'wx' })
  locked = true
  if (lowSpace) {
    // 建立全新的固定上限映像；不接收既有 device，失敗時也不強制卸載或格式化其他磁碟。
    const host = statfsSync(run)
    ok(host.bavail * host.bsize > 1073741824, '宿主至少需保留 1 GiB 可用空間')
    mkdirSync(volume)
    execFileSync('hdiutil', ['create', '-size', '256m', '-fs', 'HFS+', '-volname', 'DanceStampSynthetic', '-type', 'UDIF', '-nospotlight', image])
    // attach 可能已建立裝置才拋錯；未交回成功前保留鎖，不能猜測掛載不存在或卸載別的裝置。
    attachUnconfirmed = true
    execFileSync('hdiutil', ['attach', '-nobrowse', '-owners', 'off', '-mountpoint', volume, image])
    attached = true; attachUnconfirmed = false
    report.volume = diskSpace(); save()
  }
  report.source = { head: Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim(), trackedChanges: !!Bun.spawnSync(['git', 'status', '--porcelain', '--untracked-files=no'], { cwd: root }).stdout.toString().trim(), testSha256: hash(readFileSync(import.meta.path)), storageSha256: hash(readFileSync(resolve(root, 'dist/web/storage.js'))) }
  deepStrictEqual(readFileSync(resolve(root, 'dist/web/storage.js')), readFileSync(resolve(root, 'web/storage.js')), '受測儲存模組必須與來源逐 byte 相同')
  report.staticVersion = readFileSync(resolve(root, 'dist/web/sw.js'), 'utf8').match(/const version = '([a-f0-9]{16})'/)?.[1]
  ok(report.staticVersion, '先執行 bun run build')
  // 動態 loopback 與空白 QA 頁只載入真正產品模組，避開 SW 快取寫入干擾這個儲存層實驗。
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    const path = new URL(request.url).pathname
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    const file = webPaths.get(path)
    if (path !== '/quota-test' && !file) return new Response('Not found', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : path === '/quota-test' ? '<!doctype html><title>synthetic storage QA</title>' : Bun.file(resolve(root, 'dist/web', file!)), { headers: {
      ...webHeaders, 'Content-Type': path === '/quota-test' || file?.endsWith('.html') ? 'text/html' : file?.endsWith('.js') ? 'text/javascript' : file?.endsWith('.css') ? 'text/css' : 'text/plain',
      'Permissions-Policy': 'camera=(), microphone=(), display-capture=(), geolocation=()',
    } })
  } })
  origin = server.url.origin
  const launch = async () => {
    // 啟動若拋錯但未交回 handle，不能假設子程序不存在而釋放鎖或卸載 profile。
    launchUnconfirmed = true
    context = await chromium.launchPersistentContext(profile, { executablePath, headless: true, serviceWorkers: 'block', permissions: [], args: ['--disable-sync', '--disable-background-networking', '--mute-audio'] })
    launchUnconfirmed = false
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    await context.addInitScript(() => {
      (window as any).mediaCalls = []
      for (const key of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices?.[key]) Object.defineProperty(navigator.mediaDevices, key, { value: () => { (window as any).mediaCalls.push(key); throw new Error('此儲存測試禁止媒體擷取') } })
    })
    const page = context.pages()[0] || await context.newPage()
    await page.goto(origin + '/quota-test')
    cdp = await context.newCDPSession(page)
    return page
  }
  let page = await launch()
  report.browser = await cdp.send('Browser.getVersion')
  report.platform = { platform: process.platform, arch: process.arch, bun: Bun.version }
  ok(Bun.version === '1.4.4', '本次證據固定 Bun 1.4.4')
  const seed = await page.evaluate(async () => {
    const storage = await import('/storage.js'), { newLibrary } = await import('/library.js')
    const data = newLibrary(), ids = Object.fromEntries(['video', 'reference', 'self', 'vs', 'marker', 'move', 'take', 'recipe', 'export', 'newAsset'].map(key => [key, crypto.randomUUID()]))
    data.videos.push({ id: ids.video, title: '合成容量筆記', durationMs: 15000, revision: 3 })
    data.moves.push({ id: ids.move, name: '合成腳步', danceStyle: 'Salsa', status: 'practicing', revision: 2 })
    data.markers.push({ id: ids.marker, videoId: ids.video, moveId: ids.move, startMs: 2000, endMs: 5000, title: '保留片段', note: '非空筆記：容量拒絕也不能消失。', revision: 4 })
    for (const [id, kind] of [[ids.reference, 'reference'], [ids.self, 'take'], [ids.vs, 'vs']]) data.assets.push({ id, ...(kind === 'reference' ? { videoId: ids.video } : {}), kind, byteLength: 1048613, mimeType: 'application/octet-stream', durationMs: 15000 })
    data.takes.push({ id: ids.take, referenceVideoId: ids.video, cameraAssetId: ids.self, referenceStartMs: 0, referenceEndMs: 15000, rate: 1, state: 'ready', createdAt: '2026-10-29T00:00:00.000Z' })
    data.recipes.push({ id: ids.recipe, takeId: ids.take, offsetMs: 250, referenceMirror: true, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 2 })
    data.exports.push({ id: ids.export, recipeId: ids.recipe, recipeRevision: 2, assetId: ids.vs, mimeType: 'application/octet-stream', state: 'ready', createdAt: '2026-10-29T00:00:00.000Z' })
    // 固定總量：三份約 1 MiB 原件、兩份約 4 MiB 候選、一個 257-byte chunk；不填滿磁碟。
    const makeBlob = (length, salt) => { const bytes = new Uint8Array(length); let state = salt; for (let i = 0; i < length; i++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; bytes[i] = state & 255 } return new Blob([bytes], { type: 'application/octet-stream' }) }
    let saved = await storage.readLibrary()
    if (saved.revision !== 0) throw new Error('全新 profile 應為空庫，不清庫重建')
    for (const [index, id] of [ids.reference, ids.self, ids.vs].entries()) saved = await storage.writeLibrary(data, saved.revision, { id, blob: makeBlob(1048613, index + 71) })
    await storage.saveChunk(ids.self, 0, makeBlob(257, 19))
    const replacement = structuredClone(data)
    replacement.videos[0].title = '重試替換後筆記'; replacement.videos[0].revision++
    replacement.markers[0].note = '替換原片時一起保存的新筆記'; replacement.markers[0].revision++
    replacement.assets[0].byteLength = 4194341
    const addition = structuredClone(replacement)
    addition.videos[0].title = '重試新增後筆記'; addition.videos[0].revision++
    addition.assets.push({ id: ids.newAsset, videoId: ids.video, kind: 'reference', byteLength: 4194363, mimeType: 'application/octet-stream' })
    ;(window as any).quotaFixture = { ids, candidates: [
      { name: 'replace', data: replacement, media: { id: ids.reference, blob: makeBlob(4194341, 101) } },
      { name: 'add', data: addition, media: { id: ids.newAsset, blob: makeBlob(4194363, 103) } },
    ] }
    const db = await storage.openStore(); (window as any).originalDatabase = db; (window as any).nativeEvents = []
    // capture 先記原生事件；避免產品的 abort handler 拒絕 Promise 後，觀察已早於 DB 的 bubble listener。
    // 不包裝 put、不 throw、不 abort、不 preventDefault 或偽造事件。
    for (const type of ['error', 'abort', 'versionchange']) db.addEventListener(type, event => {
      const target = event.target as IDBRequest | IDBTransaction
      ;(window as any).nativeEvents.push({ type, trusted: event.isTrusted, target: target instanceof IDBRequest ? 'IDBRequest' : target instanceof IDBTransaction ? 'IDBTransaction' : 'IDBDatabase', error: target.error && { name: target.error.name, message: target.error.message }, store: target instanceof IDBRequest ? (target.source as IDBObjectStore)?.name : undefined, mode: target instanceof IDBTransaction ? target.mode : target.transaction?.mode })
    }, { capture: true })
    return { ids, initialRevision: saved.revision, syntheticBlobBytes: 3 * 1048613 + 4194341 + 4194363 + 257 }
  })
  report.seed = seed
  ok(seed.syntheticBlobBytes < 32 * 1048576)
  if (lowSpace) {
    const indexedDB = resolve(profile, 'Default/IndexedDB')
    report.databaseFiles = readdirSync(indexedDB).map(name => ({ name, device: statSync(resolve(indexedDB, name)).dev }))
    ok(report.databaseFiles.length && report.databaseFiles.every(file => file.device === diskSpace().device), 'IndexedDB 不在本輪測試映像')
    save()
  }
  const snapshot = async (label: string) => {
    const value = await page.evaluate(async () => {
      const storage = await import('/storage.js'), db = await storage.openStore()
      const read = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
      const tx = db.transaction(['metadata', 'media', 'chunks'])
      const all = await Promise.all(['metadata', 'media', 'chunks'].map(async name => { const store = tx.objectStore(name); const [keys, values] = await Promise.all([read(store.getAllKeys()), read(store.getAll())]); return { name, keys, values } }))
      const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('')
      const stores = []
      for (const store of all) {
        const values = []
        for (const value of store.values) {
          if (!(value instanceof Blob)) { values.push(value); continue }
          const bytes = new Uint8Array(await value.arrayBuffer())
          // 完整 bytes 回到 runner 逐 byte 比對；SHA 另由兩端獨立重算，沒有抽樣。
          let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
          values.push({ byteLength: bytes.length, mimeType: value.type, sha256: await digest(bytes), base64: btoa(binary) })
        }
        stores.push({ ...store, values })
      }
      return { version: db.version, names: [...db.objectStoreNames], stores, library: await storage.readLibrary(), mediaCalls: (window as any).mediaCalls, sameDatabase: !(window as any).originalDatabase || db === (window as any).originalDatabase }
    })
    for (const store of value.stores) for (const entry of store.values) if (entry?.base64) { const bytes = Buffer.from(entry.base64, 'base64'); ok(bytes.length === entry.byteLength); ok(hash(bytes) === entry.sha256) }
    ok(value.mediaCalls.length === 0 && value.sameDatabase, '媒體 API 或資料庫被替換')
    writeFileSync(resolve(run, label + '.json'), JSON.stringify(value, null, 2) + '\n')
    return value
  }
  const before = await snapshot('before')
  report.before = { jsonSha256: hash(JSON.stringify(before)), revision: before.library.revision, stores: before.stores.map(store => ({ name: store.name, keys: store.keys, blobs: store.values.filter(v => v?.sha256).map(({ base64, ...rest }) => rest) })) }
  report.failures = []
  report.retries = []
  for (const index of [0, 1]) {
    const baseline = await snapshot('before-scenario-' + index)
    const quotaBefore = await cdp.send('Storage.getUsageAndQuota', { origin }), quotaSize = 524288
    ok(quotaBefore.usageBreakdown.some(entry => entry.storageType === 'indexeddb' && entry.usage > quotaSize), '原生 IndexedDB 應已保存非空原件')
    if (lowSpace) { ok(!quotaBefore.overrideActive, '低空間測試不得使用配額 override'); fillVolume() }
    else await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize })
    const quotaRestricted = await cdp.send('Storage.getUsageAndQuota', { origin })
    const estimateRestricted = await page.evaluate(async () => await navigator.storage.estimate())
    ok(lowSpace ? !quotaRestricted.overrideActive : quotaRestricted.overrideActive && quotaRestricted.quota === quotaSize, '配額模式不符')
    // Chromium 可暫存先前核准的空間30秒；立即縮限不等於下一筆已重新詢問配額。
    // https://chromium.googlesource.com/chromium/src/+/c0811f657d5ae8c42a9fb827e7e36e7e58a16bab/content/browser/indexed_db/instance/bucket_context.h
    // 等待只排除這個工具前置，仍須後續 trusted quota error／abort 才能判定成功。
    report.quotaCacheBarrierMs = 31_000; save()
    await Bun.sleep(report.quotaCacheBarrierMs)
    const quotaAfterBarrier = await cdp.send('Storage.getUsageAndQuota', { origin })
    ok(lowSpace ? !quotaAfterBarrier.overrideActive : quotaAfterBarrier.overrideActive && quotaAfterBarrier.quota === quotaSize)
    const result = await observe(page.evaluate(async index => {
      const storage = await import('/storage.js'), candidate = (window as any).quotaFixture.candidates[index], saved = await storage.readLibrary()
      ;(window as any).nativeEvents.length = 0
      let reply
      try { await storage.writeLibrary(candidate.data, saved.revision, candidate.media); reply = { resolved: true } }
      catch (error) { reply = { resolved: false, name: error.name, message: error.message } }
      return { name: candidate.name, reply, events: [...(window as any).nativeEvents] }
    }, index))
    report.failures.push({ ...result, quotaBefore, quotaRestricted, estimateRestricted, quotaAfterBarrier }); save()
    // 真磁碟的 Blob I/O 失敗可回 DataError；配額模式仍嚴格要求原來的 QuotaExceededError。
    const refused = result.reply.name === 'QuotaExceededError' || (lowSpace && result.reply.name === 'DataError' && result.reply.message === 'Failed to write blobs (IOError)')
    ok(!result.reply.resolved && refused, '產品必須收到本模式的原生空間拒絕')
    ok(result.events.some(e => e.trusted && ['IDBRequest', 'IDBTransaction'].includes(e.target) && e.error?.name === result.reply.name), '缺少與產品回覆一致的 native error/abort')
    ok(result.events.some(e => e.type === 'abort' && e.trusted && e.target === 'IDBTransaction'), '缺少真正原生交易 abort')
    deepStrictEqual(await snapshot('after-' + result.name + '-refusal'), baseline, '拒絕後原生 keys／JSON／每個 Blob byte 不同')
    // 等待後再查原生 stores，避免只在 Promise 拒絕瞬間觀察、漏掉延遲提交。
    await Bun.sleep(1000)
    deepStrictEqual(await snapshot('after-' + result.name + '-settled'), baseline)
    if (lowSpace) {
      releaseVolume()
      // 真正釋放空間後仍排除瀏覽器的短期空間快取，成功重試才算恢復。
      await Bun.sleep(31_000)
    } else await cdp.send('Storage.overrideQuotaForOrigin', { origin })
    const quotaReleased = await cdp.send('Storage.getUsageAndQuota', { origin })
    ok(!quotaReleased.overrideActive, '未解除 quota override')
    const retry = await page.evaluate(async index => {
      const storage = await import('/storage.js'), candidate = (window as any).quotaFixture.candidates[index], saved = await storage.readLibrary()
      ;(window as any).nativeEvents.length = 0
      // 使用原候選物件及同一 Blob；預期 revision 只跟隨前一次成功交易。
      const result = await storage.writeLibrary(candidate.data, saved.revision, candidate.media)
      const db = await storage.openStore(), raw = await new Promise(resolve => { const req = db.transaction('metadata').objectStore('metadata').get('library'); req.onsuccess = () => resolve(req.result) })
      const blob = await storage.readMedia(candidate.media.id)
      const actual = new Uint8Array(await blob.arrayBuffer()), expected = new Uint8Array(await candidate.media.blob.arrayBuffer())
      return { name: candidate.name, revision: result.revision, rawMatchesCandidate: JSON.stringify(raw) === JSON.stringify({ revision: result.revision, data: candidate.data }), everyByteMatchesCandidate: actual.length === expected.length && actual.every((b, i) => b === expected[i]), events: [...(window as any).nativeEvents] }
    }, index)
    report.retries.push({ ...retry, quotaReleased })
    ok(retry.rawMatchesCandidate && retry.everyByteMatchesCandidate && retry.events.length === 0 && retry.revision === seed.initialRevision + index + 1, '同樣資料無法完整重試')
    const after = await snapshot('after-' + retry.name + '-retry')
    for (const name of ['metadata', 'chunks']) deepStrictEqual(after.stores.find(s => s.name === name).keys, baseline.stores.find(s => s.name === name).keys)
    deepStrictEqual(after.stores.find(s => s.name === 'chunks'), baseline.stores.find(s => s.name === 'chunks'))
    const oldMedia = baseline.stores.find(s => s.name === 'media'), newMedia = after.stores.find(s => s.name === 'media')
    for (const [i, id] of oldMedia.keys.entries()) if (index === 1 || id !== seed.ids.reference) deepStrictEqual(newMedia.values[newMedia.keys.indexOf(id)], oldMedia.values[i], '重試改動無關原件')
    deepStrictEqual(newMedia.keys, [...oldMedia.keys, ...(index === 1 ? [seed.ids.newAsset] : [])].sort())
  }
  const committed = await snapshot('committed')
  // 正常關閉後重新啟動同 profile，不能用 reload 或新 context 冒充跨程序保存。
  await closeOwnedBrowser()
  report.firstBrowserClosed = true
  page = await launch()
  report.quotaReopened = await cdp.send('Storage.getUsageAndQuota', { origin })
  ok(!report.quotaReopened.overrideActive)
  deepStrictEqual(await snapshot('reopened'), committed, '同 profile 正常重開後內容改變')
  report.committed = { jsonSha256: hash(JSON.stringify(committed)), revision: committed.library.revision, stores: committed.stores.map(store => ({ name: store.name, keys: store.keys, blobs: store.values.filter(v => v?.sha256).map(({ base64, ...rest }) => rest) })) }
  // 舊回歸另用空 context，不能改寫本輪配額實驗的原件；同步預設入口才能正確替換隔離測試埠。
  report.regressions = {}
  for (const name of ['storage', 'moves-storage']) {
    const isolated = await context.browser().newContext({ serviceWorkers: 'block', permissions: [] })
    try {
      const probe = await isolated.newPage(); await probe.goto(origin)
      const source = readFileSync(resolve(root, 'tests/browser', name + '.js'), 'utf8').replaceAll('http://127.0.0.1:4174', origin)
      const verify = new Function('return (' + source + ')')()
      report.regressions[name] = { sourceSha256: hash(readFileSync(resolve(root, 'tests/browser', name + '.js'))), result: await verify(probe) }
    } finally { await isolated.close() }
  }
  report.passed = true
} catch (error) {
  report.passed = false; report.error = { name: error.name, message: error.message, stack: error.stack }
  process.exitCode = 1
} finally {
  try { releaseVolume() } catch (error) { report.diskReleaseError = String(error); process.exitCode = 1 }
  // 無論測試在哪一段失敗，都先重設自己的 origin 配額，再關自己的 browser／服務；raw 與 profile 保留。
  if (cdp && origin) try { if (!lowSpace) await cdp.send('Storage.overrideQuotaForOrigin', { origin }); report.cleanupQuota = await cdp.send('Storage.getUsageAndQuota', { origin }); ok(!report.cleanupQuota.overrideActive) } catch (error) { report.cleanupError = String(error); process.exitCode = 1 }
  if (context) try { await closeOwnedBrowser() } catch (error) { report.browserCloseError = String(error); process.exitCode = 1 }
  if (server) {
    await server.stop(true)
    try { await fetch(origin); report.serverStopped = false; process.exitCode = 1 }
    catch { report.serverStopped = true }
  }
  report.volumeAttachUnconfirmed = attachUnconfirmed
  if (attached && !attachUnconfirmed && !report.browserCloseError && !launchUnconfirmed) {
    try { execFileSync('hdiutil', ['detach', volume]); attached = false; report.volumeDetached = true }
    catch (error) { report.volumeDetachError = String(error); process.exitCode = 1 }
  }
  if (locked) {
    if (report.browserCloseError || attached || attachUnconfirmed || launchUnconfirmed) report.lockReleaseError = 'browser or volume cleanup incomplete; own lock retained'
    else if (JSON.parse(readFileSync(lockPath, 'utf8')).nonce === nonce) { unlinkSync(lockPath); report.lockReleased = !existsSync(lockPath) }
    else { report.lockReleaseError = 'nonce changed; did not remove'; process.exitCode = 1 }
  }
  if (process.exitCode) report.passed = false
  report.finishedAt = new Date().toISOString(); save()
  console.log(JSON.stringify({ passed: report.passed, error: report.error?.message, raw: resolve(run, 'result.json'), cleanup: { overrideInactive: report.cleanupQuota?.overrideActive === false, browserClosed: report.browserClosed, serverStopped: report.serverStopped, lockReleased: report.lockReleased } }))
}
