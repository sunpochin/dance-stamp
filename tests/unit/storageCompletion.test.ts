/* 檔案用途：重現 IDB error 後缺少結束事件的忙碌鎖死，驗證保守收尾。所在層：儲存事件單元回歸，不冒充 Safari 原生驗收。主要關聯：web/storage.js、main.js、issue-13-unconfirmed-storage.md。 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { newLibrary, validateBackup, migrateLibrary, parseBackup, planBackupImport, tables } from '../../web/library.js'
import { assembleChunks } from '../../web/recorder.js'

type Mode = 'complete' | 'error-abort' | 'error-stuck' | 'pending' | 'cancel-stuck'
class Transaction extends EventTarget {
  error: DOMException | null = null
  oncomplete?: (event: Event) => void
  onabort?: (event: Event) => void
  onerror?: (event: Event) => void
  aborted = 0; failed = false; finished = false; queued = false
  listeners = new Set<EventListenerOrEventListenerObject>()
  override addEventListener(name: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) { if (listener) this.listeners.add(listener); super.addEventListener(name, listener, options) }
  override removeEventListener(name: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) { if (listener) this.listeners.delete(listener); super.removeEventListener(name, listener, options) }
  draft: any; media: Map<string, Blob>
  constructor(public db: Database, public mode = 'readonly') { super(); this.draft = structuredClone(db.record); this.media = new Map(db.media) }
  emit(type: 'error' | 'abort' | 'complete', error: DOMException | null = null) {
    this.error = error
    if (type !== 'error') this.finished = true
    if (type === 'complete' && this.mode === 'readwrite') { this.db.record = this.draft; this.db.media = this.media }
    const event = new Event(type); this.dispatchEvent(event); this[`on${type}`]?.(event)
  }
  abort() {
    this.aborted++
    if (!this.db.behavior.endsWith('stuck')) queueMicrotask(() => this.emit('abort', this.error))
  }
  objectStore(name: string) {
    const request = (result: any) => {
      const req: any = { result }
      if (this.mode !== 'readonly' || !this.db.holdReads) queueMicrotask(() => req.onsuccess?.(new Event('success')))
      return req
    }
    const write = (value: any, key: string) => {
      if (name === 'metadata') this.draft = structuredClone(value)
      else this.media.set(key, value)
      if (name !== 'metadata' && this.db.behavior.startsWith('error')) {
        this.failed = true
        queueMicrotask(() => {
          const error = new DOMException('synthetic Blob preparation failure', this.db.behavior === 'error-abort' ? 'QuotaExceededError' : 'UnknownError')
          this.emit('error', error)
          if (this.db.behavior === 'error-abort') queueMicrotask(() => this.emit('abort', error))
        })
      }
      if (!this.queued) {
        this.queued = true
        queueMicrotask(() => { if (!this.failed && !this.aborted && !['pending', 'cancel-stuck'].includes(this.db.behavior)) this.emit('complete') })
      }
      return request(undefined)
    }
    return { get: () => request(structuredClone(this.db.record)), getAllKeys: () => request([...this.db.media.keys()]), put: write, add: write, delete: () => write(undefined, '') }
  }
}
class Database {
  objectStoreNames = { contains: (name: string) => ['metadata', 'media', 'chunks'].includes(name) }
  transactions: Transaction[] = []; closes = 0; opens = 0
  holdReads = false
  media = new Map<string, Blob>()
  constructor(public record: any, public behavior: Mode) {}
  close() { this.closes++ }
  transaction(_stores: string | string[], mode?: string) { const tx = new Transaction(this, mode); this.transactions.push(tx); return tx }
}
async function fixture(behavior: Mode) {
  const data = newLibrary(), videoId = crypto.randomUUID(), assetId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成舊筆記', durationMs: 15000, revision: 1 })
  data.markers.push({ id: crypto.randomUUID(), videoId, startMs: 1000, title: '合成標記', note: '保留非空正文', revision: 1 })
  data.assets.push({ id: assetId, videoId, kind: 'reference', byteLength: 3, mimeType: 'application/octet-stream' })
  const db = new Database({ revision: 1, data }, behavior); db.media.set(assetId, new Blob(['old']))
  const indexedDB = { open() { db.opens++; const req: any = { result: db }; queueMicrotask(() => req.onsuccess?.()); return req } }
  // 每個案例用新頁面般的模組狀態；執行真正來源，只替換 import/export 入口，不重寫收尾邏輯。
  const source = readFileSync(new URL('../../web/storage.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '')
  const storage = runInNewContext(source + '\n;({ writeLibrary, readLibrary, saveChunk, clearChunks, storageUnconfirmed, storageUnconfirmedMessage })', { indexedDB, newLibrary, validateBackup, migrateLibrary, assembleChunks, Blob, Error, DOMException, AbortController, setTimeout, clearTimeout })
  const next = structuredClone(data); next.videos[0].title = '合成待保存筆記'
  return { db, storage, next, assetId }
}
const outcome = (promise: Promise<unknown>) => promise.then(value => ({ value, name: 'resolved' }), error => ({ error, name: error.name }))

test('合法中斷錄影備份在讀回補齊 runtime 狀態後，仍可正常與未確認救援下載', async () => {
  const { db, storage } = await fixture('complete'); db.record = undefined; db.media.clear()
  const local = await storage.readLibrary(), incoming = newLibrary(), limit = 10 * 1024 * 1024
  const videoId = crypto.randomUUID(), referenceId = crypto.randomUUID(), selfId = crypto.randomUUID(), vsId = crypto.randomUUID(), takeId = crypto.randomUUID(), recipeId = crypto.randomUUID(), moveId = crypto.randomUUID()
  incoming.videos.push({ id: videoId, title: '合成關聯備份', durationMs: 60000, revision: 1, beatGrid: { bpm: 120, firstBeatMs: 0, countInBeats: 4 } })
  incoming.moves.push({ id: moveId, name: '合成步伐', danceStyle: 'Salsa', status: 'practicing', revision: 1 })
  for (const [id, kind] of [[referenceId, 'reference'], [selfId, 'take'], [vsId, 'vs']]) incoming.assets.push({ id, ...(kind === 'reference' ? { videoId } : {}), kind, byteLength: 3, mimeType: 'video/webm', durationMs: 15000, mediaIncluded: false })
  incoming.takes.push({ id: takeId, referenceVideoId: videoId, cameraAssetId: selfId, referenceStartMs: 0, referenceEndMs: 15000, rate: 1, state: 'interrupted', createdAt: incoming.exportedAt })
  incoming.recipes.push({ id: recipeId, takeId, offsetMs: 0, referenceMirror: false, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
  incoming.exports.push({ id: crypto.randomUUID(), recipeId, recipeRevision: 1, assetId: vsId, mimeType: 'video/webm', state: 'ready', createdAt: incoming.exportedAt })
  incoming.markers = Array.from({ length: 530 }, () => ({ id: crypto.randomUUID(), videoId, moveId, startMs: 0, title: '合成拍點', note: '', revision: 1 }))
  // 依真正合併後的大小填滿；來源檔仍少於上限，沒有直接塞入人工 runtime state。
  const emptyPlan = await planBackupImport(local.data, parseBackup(JSON.stringify(incoming)))
  let remaining = limit - new Blob([JSON.stringify(emptyPlan.data)]).size
  for (const marker of incoming.markers) {
    const count = Math.min(Math.floor(remaining / 7), 6666)
    marker.note = '舞💃'.repeat(count); remaining -= count * 7
    const ascii = Math.min(remaining, 20_000 - marker.note.length)
    marker.note += 'x'.repeat(ascii); remaining -= ascii
  }
  expect(remaining).toBe(0)
  const original = parseBackup(JSON.stringify(incoming)), plan = await planBackupImport(local.data, original)
  expect(new Blob([JSON.stringify(plan.data)]).size).toBe(limit)
  await storage.writeLibrary(plan.data, local.revision)
  const read = await storage.readLibrary()
  expect(read.data.assets.find(a => a.id === selfId)!.state).toBe('interrupted')
  expect(new Blob([JSON.stringify(read.data)]).size).toBe(limit + 4)
  let exported: Blob | undefined, unconfirmed = false, downloaded = 0
  const main = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8')
  const source = ['saveData', 'downloadBackup'].map(name => main.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'))![0]).join('\n')
  const context: any = { state: read, writeLibrary: storage.writeLibrary, validateBackup, Blob, Date, structuredClone, renderLibrary() {},
    $: () => ({ open: false }), urlFor: (_key: string, blob: Blob) => { exported = blob; return 'blob:synthetic-backup' },
    document: { createElement: () => ({ click() { downloaded++ } }) }, storageUnconfirmed: () => unconfirmed, status() {},
  }
  const ui = runInNewContext(source + '\n;({ saveData, downloadBackup })', context)
  // 讀回後再走真正保存入口，將可攜內容補到零餘裕；runtime 欄位須保留在本機，不能刪欄換取可備份。
  const canonicalBytes = new Blob([JSON.stringify(validateBackup(read.data))]).size
  await ui.saveData(data => { data.markers.at(-1).note += 'x'.repeat(limit - canonicalBytes) })
  const reopened = await storage.readLibrary(), before = structuredClone(reopened), expected = validateBackup(reopened.data), transactions = db.transactions.length
  expect(reopened).toEqual(context.state)
  expect(new Blob([JSON.stringify(expected)]).size).toBe(limit)
  expect(new Blob([JSON.stringify(reopened.data)]).size).toBeGreaterThan(limit)
  const oversized = structuredClone(reopened.data); oversized.markers.at(-1).note += 'x'
  expect(() => validateBackup(oversized)).toThrow('10 MiB')
  await expect(storage.writeLibrary(oversized, reopened.revision)).rejects.toThrow('10 MiB')
  expect(db.transactions).toHaveLength(transactions)
  for (const rescue of [false, true]) {
    unconfirmed = rescue; ui.downloadBackup()
    const restored = parseBackup(await exported!.text())
    expect(exported!.size).toBe(limit)
    for (const table of tables) expect(restored[table]).toEqual(expected[table])
    expect(restored.sourceLibraryId).toBe(incoming.sourceLibraryId)
    const fresh = await planBackupImport(newLibrary(), restored)
    for (const table of tables) expect(validateBackup(fresh.data)[table]).toEqual(expected[table])
    expect((await planBackupImport(reopened.data, restored)).added).toBe(0)
    expect(context.state).toEqual(before)
    expect(db.transactions).toHaveLength(transactions)
    // 即使超出的只是會被白名單丟掉的外部欄位，也須先以原檔 bytes 拒絕。
    expect(() => parseBackup(JSON.stringify({ ...restored, extra: 'x' }))).toThrow('10 MiB')
  }
  expect(downloaded).toBe(2)
})

test('v1／v2 短日期匯入保留本機時間，零餘裕 UTF-8 筆記保存重讀後仍可正常／救援備份', async () => {
  const main = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8')
  const controllers = ['saveData', 'downloadBackup'].map(name => main.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'))![0]).join('\n')
  const limit = 10 * 1024 * 1024
  for (const schemaVersion of [1, 2]) for (const exportedAt of ['2026-10-30', '2026-10-30T00:00:00Z']) {
    const { db, storage } = await fixture('complete'); db.record = undefined; db.media.clear()
    const local = await storage.readLibrary(), incoming = newLibrary(), videoId = crypto.randomUUID()
    incoming.schemaVersion = schemaVersion; incoming.exportedAt = exportedAt
    incoming.videos.push({ id: videoId, title: '合成邊界課程', durationMs: 60000, revision: 1, beatGrid: { bpm: 120, firstBeatMs: 350, countInBeats: 4 } })
    incoming.markers = Array.from({ length: 530 }, () => ({ id: crypto.randomUUID(), videoId, startMs: 0, title: '合成拍點', note: '', revision: 1 }))
    // 匯入 owner 保留本機日期；以實際差額填滿合併後快照，不能用 128 bytes 餘裕避開問題。
    const dateGrowth = local.data.exportedAt.length - exportedAt.length
    let remaining = limit - dateGrowth - new Blob([JSON.stringify(incoming)]).size
    for (const marker of incoming.markers) {
      const count = Math.min(Math.floor(remaining / 7), 6666)
      marker.note = '舞💃'.repeat(count); remaining -= count * 7
      const ascii = Math.min(remaining, 20_000 - marker.note.length)
      marker.note += 'x'.repeat(ascii); remaining -= ascii
    }
    expect(remaining).toBe(0)
    const parsed = parseBackup(JSON.stringify(incoming))
    expect(parsed.exportedAt).toBe(exportedAt)
    const oversized = structuredClone(incoming); oversized.markers.at(-1)!.note += 'x'.repeat(dateGrowth)
    expect(new Blob([JSON.stringify(oversized)]).size).toBe(limit)
    // 已滿上限的短日期檔在既有合併驗證就遭拒；不能把人工塞入的短日期 state 冒稱正常匯入結果。
    await expect(planBackupImport(local.data, parseBackup(JSON.stringify(oversized)))).rejects.toThrow('10 MiB')
    expect(db.record).toBeUndefined()
    const plan = await planBackupImport(local.data, parsed)
    expect(plan.data.exportedAt).toBe(local.data.exportedAt)
    expect(plan.data.exportedAt).toHaveLength(24)
    expect(new Blob([JSON.stringify(plan.data)]).size).toBe(limit)
    await storage.writeLibrary(plan.data, local.revision)
    const read = await storage.readLibrary()
    let exported: Blob | undefined, unconfirmed = false, downloaded = 0
    const context: any = {
      state: read, writeLibrary: storage.writeLibrary, validateBackup, Blob, Date, structuredClone, renderLibrary() {},
      $: () => ({ open: false, textContent: '' }), urlFor: (_key: string, blob: Blob) => { exported = blob; return 'blob:synthetic-backup' },
      document: { createElement: () => ({ click() { downloaded++ } }) }, storageUnconfirmed: () => unconfirmed, status() {},
    }
    // 執行產品 saveData／writeLibrary／readLibrary；只用既有事件後端，不宣稱原生 IndexedDB 或實際 UI 驗收。
    const ui = runInNewContext(controllers + '\n;({ saveData, downloadBackup })', context)
    await ui.saveData(data => { data.markers.at(-1).revision++ })
    const reopened = await storage.readLibrary(), before = structuredClone(reopened), transactions = db.transactions.length
    expect(reopened).toEqual(context.state)
    expect(reopened.data.exportedAt).toBe(local.data.exportedAt)
    expect(new Blob([JSON.stringify(reopened.data)]).size).toBe(limit)
    for (const rescue of [false, true]) {
      unconfirmed = rescue; ui.downloadBackup()
      expect(exported!.size).toBe(limit)
      const restored = parseBackup(await exported!.text())
      for (const table of tables) expect(restored[table]).toEqual(reopened.data[table])
      const fresh = await planBackupImport(newLibrary(), restored)
      for (const table of tables) expect(fresh.data[table]).toEqual(reopened.data[table])
      expect(fresh.data.sourceLibraryId).toBe(reopened.data.sourceLibraryId)
      expect((await planBackupImport(reopened.data, restored)).added).toBe(0)
      expect(context.state).toEqual(before)
      expect(db.transactions).toHaveLength(transactions)
    }
    expect(downloaded).toBe(2)
  }
})

test('error 後即使取消也沒有 abort/complete：結束等待但只回報保存狀態未確認', async () => {
  const { db, storage, next, assetId } = await fixture('error-stuck'), before = structuredClone(db.record), controller = new AbortController()
  const saving = outcome(storage.writeLibrary(next, 1, { id: assetId, blob: new Blob(['new']) }, controller.signal))
  await Bun.sleep(10)
  const queued = outcome(storage.writeLibrary(next, 1, { id: assetId, blob: new Blob(['queued']) }))
  db.holdReads = true
  const reading = outcome(storage.readLibrary())
  controller.abort()
  const result = await Promise.race([saving, Bun.sleep(1400).then(() => ({ name: 'still-pending' }))])
  expect(result.name).toBe('StorageUnconfirmedError')
  expect(storage.storageUnconfirmed()).toBe(true)
  expect((await queued).name).toBe('StorageUnconfirmedError')
  expect((await reading).name).toBe('StorageUnconfirmedError')
  expect(db.record).toEqual(before)
  expect(await db.media.get(assetId)!.text()).toBe('old')
  expect(db.closes).toBe(1)
  const transactionCount = db.transactions.length
  await expect(storage.writeLibrary(next, 1)).rejects.toThrow('保存狀態未確認')
  await expect(storage.saveChunk(assetId, 0, new Blob(['chunk']))).rejects.toThrow('保存狀態未確認')
  await expect(storage.clearChunks(assetId)).rejects.toThrow('保存狀態未確認')
  expect(db.transactions.length).toBe(transactionCount)
  expect(db.opens).toBe(1)
  expect(db.transactions[0].listeners.size).toBe(0)
})

test('沒有取消也能辨識缺結束事件；遲到 complete 不能把未確認結果改成已保存', async () => {
  const { db, storage, next, assetId } = await fixture('error-stuck')
  const result = await outcome(storage.writeLibrary(next, 1, { id: assetId, blob: new Blob(['late']) }))
  expect(result.name).toBe('StorageUnconfirmedError')
  // 刻意允許假後端遲到提交：這個測試驗的是不再宣稱回滾／成功，不是模擬原生原子性。
  db.transactions[0].emit('complete')
  expect(db.record.data.videos[0].title).toBe(next.videos[0].title)
  expect(storage.storageUnconfirmed()).toBe(true)
  await expect(storage.readLibrary()).rejects.toThrow('保存狀態未確認')
  expect(result.name).toBe('StorageUnconfirmedError')
})

test('單獨取消但原生 abort 返回後仍無通知，不冒充已取消／回滾成功', async () => {
  const { db, storage, next } = await fixture('cancel-stuck'), controller = new AbortController()
  const saving = outcome(storage.writeLibrary(next, 1, undefined, controller.signal))
  await Bun.sleep(5); controller.abort()
  expect((await saving).name).toBe('StorageUnconfirmedError')
  expect(storage.storageUnconfirmed()).toBe(true)
  expect(db.record.revision).toBe(1)
  expect(db.transactions[0].listeners.size).toBe(0)
})

test('正常 complete、quota abort 與取消仍保留原結果，清除監聽／期限且可正常重試', async () => {
  const good = await fixture('complete')
  expect((await good.storage.writeLibrary(good.next, 1, { id: good.assetId, blob: new Blob(['new']) })).revision).toBe(2)
  expect(await good.db.media.get(good.assetId)!.text()).toBe('new')
  expect(good.db.transactions[0].listeners.size).toBe(0)
  const quota = await fixture('error-abort'), before = structuredClone(quota.db.record)
  await expect(quota.storage.writeLibrary(quota.next, 1, { id: quota.assetId, blob: new Blob(['new']) })).rejects.toHaveProperty('name', 'QuotaExceededError')
  expect(quota.db.record).toEqual(before)
  expect(quota.db.transactions[0].listeners.size).toBe(0)
  quota.db.behavior = 'complete'
  expect((await quota.storage.writeLibrary(quota.next, 1)).revision).toBe(2)
  const cancelled = await fixture('pending'), controller = new AbortController()
  const saving = outcome(cancelled.storage.writeLibrary(cancelled.next, 1, undefined, controller.signal))
  await Bun.sleep(5); controller.abort()
  expect((await saving).name).toBe('AbortError')
  expect(cancelled.db.record.revision).toBe(1)
  expect(cancelled.db.transactions[0].listeners.size).toBe(0)
  cancelled.db.behavior = 'complete'
  expect((await cancelled.storage.writeLibrary(cancelled.next, 1)).revision).toBe(2)
  await Bun.sleep(1100)
  for (const item of [good, quota, cancelled]) { expect(item.storage.storageUnconfirmed()).toBe(false); expect(item.db.closes).toBe(0) }
})

test('chunks error 缺少結束通知也會釋放等待並封鎖本頁後續交易', async () => {
  const { db, storage, assetId } = await fixture('error-stuck')
  await expect(storage.saveChunk(assetId, 0, new Blob(['chunk']))).rejects.toHaveProperty('name', 'StorageUnconfirmedError')
  expect(db.transactions[0].listeners.size).toBe(0)
  expect(db.closes).toBe(1)
  await expect(storage.writeLibrary(db.record.data, 1)).rejects.toThrow('保存狀態未確認')
})

test('產品操作在未知保存後退出忙碌：保留原片／VS URL，可另存舊筆記且不再次寫入', async () => {
  const { db, storage, assetId } = await fixture('error-stuck'), data = db.record.data
  const takeId = crypto.randomUUID(), selfId = crypto.randomUUID(), recipeId = crypto.randomUUID()
  data.assets.push({ id: selfId, kind: 'take', byteLength: 4, mimeType: 'video/mp4' })
  data.takes.push({ id: takeId, referenceVideoId: data.videos[0].id, cameraAssetId: selfId, referenceStartMs: 0, referenceEndMs: 15000, rate: 1, state: 'ready', createdAt: '2026-10-29T00:00:00.000Z' })
  data.recipes.push({ id: recipeId, takeId, offsetMs: 0, referenceMirror: false, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
  const before = structuredClone(db.record), nodes = new Map<string, any>(), downloaded: any[] = [], blobs = new Map<string, Blob>(), revoked: string[] = []
  const node = (id: string): any => {
    if (!nodes.has(id)) nodes.set(id, { id, disabled: false, hidden: true, attributes: new Map(), dataset: {}, textContent: '', href: '', download: '',
      setAttribute(name: string, value: string) { this.attributes.set(name, value) },
      querySelectorAll() { return id === 'library-panel' ? [node('backup'), node('restore'), node('open-library')] : [] },
      click() { downloaded.push({ href: this.href, name: this.download }) },
      close() { this.open = false },
    })
    return nodes.get(id)
  }
  const urls = new Map(['reference-download', 'take-download', 'output-download'].map(id => { node(id).href = 'blob:synthetic-' + id; node(id).hidden = false; return [id, node(id).href] }))
  // 選片摘要會讀來源 URL；補足原生 DOM 屬性，救援測試仍使用真正的產品控制器。
  const originals = new Map(urls), reference = { pause() {}, controls: true, getAttribute: () => 'blob:synthetic-reference' }, self = { pause() {}, controls: true, getAttribute: () => 'blob:synthetic-self' }
  node('media-dialog').open = true; node('relink-file').value = 'synthetic candidate'
  const document = { body: {}, documentElement: {}, activeElement: null as any, createElement: () => node('new-download') }; document.activeElement = document.body
  const context: any = { ...storage, writeLibrary: storage.writeLibrary, validateBackup, structuredClone, crypto, Blob, Error, AbortController, document, reference, self,
    $: node, status: (text: string) => { node('status').textContent = text }, releaseCamera() {}, stopPractice() {}, applyPracticeSettings() {}, drawPractice() {}, updateOverlayControls() {}, renderLibrary() {}, report() {}, focusControl() {},
    ready: Promise.resolve(), comparisonSave: Promise.resolve(), state: structuredClone(db.record), active: null, operationFocus: null, operationTrigger: null, diagnostics: {}, monitor: null, audio: null,
    // 載入狀態也讀取待重連 ID；補足真實頁面初值，保留既有未確認保存斷言。
    pendingLinkId: null, shareSending: false, shareDraft: null, relinkDraft: null, camera: null, referenceDurationMs: 15000, selfDurationMs: 15000, currentVideoId: data.videos[0].id, activeTakeId: takeId, pendingTakeId: null, existingMode: true,
    currentReferenceFile: new Blob(['reference']), takeBlob: new Blob(['self']), outputBlob: new Blob(['synthetic VS']), outputAssetId: null, urls,
    URL: { createObjectURL(blob: Blob) { const url = 'blob:backup-' + blobs.size; blobs.set(url, blob); return url }, revokeObjectURL(url: string) { revoked.push(url) } },
  }
  // 疊影只做視覺更新，由瀏覽器回歸驗證；這裡沿用視圖 stub，專測儲存保全。
  // 不啟動 DOM／瀏覽器：取實際控制器函式驗證錯誤傳遞、finally 與救援入口，沒有鏡像一份 UI 邏輯。
  const source = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8')
  const functions = ['urlFor', 'showStorageRecovery', 'updateControls', 'operation', 'saveData', 'persistExport', 'downloadBackup'].map(name => {
    const match = source.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n}'))
    if (!match) throw new Error('missing controller: ' + name)
    return match[0]
  })
  const ui = runInNewContext(functions.join('\n') + '\n;({ operation, persistExport, downloadBackup })', context)
  const currentVs = context.outputBlob, currentOriginal = context.currentReferenceFile
  await ui.operation(() => ui.persistExport(currentVs, 15000))
  expect(context.active).toBeNull()
  expect(node('controls').attributes.get('aria-busy')).toBe('false')
  expect(node('controls').disabled).toBe(true)
  expect(node('storage-recovery').hidden).toBe(false)
  expect(node('media-dialog').open).toBe(false)
  expect(node('relink-file').value).toBe('synthetic candidate')
  expect(node('storage-status').textContent).toContain('保存狀態未確認')
  expect(node('status').textContent).not.toContain('可重試')
  expect(context.diagnostics.lastError).toBe('storage-unconfirmed')
  expect(context.state).toEqual(before)
  expect(context.outputBlob).toBe(currentVs); expect(context.currentReferenceFile).toBe(currentOriginal)
  expect(context.outputAssetId).toBeNull()
  for (const [id, url] of originals) { expect(node(id).href).toBe(url); expect(node(id).hidden).toBe(false); expect(urls.get(id)).toBe(url) }
  expect(revoked).toEqual([])
  const count = db.transactions.length
  let ran = false; await ui.operation(() => { ran = true }); expect(ran).toBe(false)
  ui.downloadBackup()
  const backup = JSON.parse(await blobs.get(downloaded[0].href)!.text())
  expect(backup.videos).toEqual(before.data.videos); expect(backup.exports).toEqual([])
  expect(node('backup').disabled).toBe(false)
  expect(node('restore').disabled).toBe(true)
  expect(db.transactions.length).toBe(count)
})

test('佇列等待期間轉為未確認，真正「準備下一段」控制器不得清掉自拍', async () => {
  for (const gate of ['comparisonSave', 'ready']) {
    const { storage, next, assetId } = await fixture('error-stuck')
    const saving = storage.writeLibrary(next, 1, { id: assetId, blob: new Blob(['new']) }).catch(() => {})
    const nodes = new Map<string, any>(), revoked: string[] = []
    const node = (id: string): any => {
      if (!nodes.has(id)) nodes.set(id, { disabled: false, hidden: false, attributes: new Map(), handlers: new Map(),
        setAttribute(name: string, value: string) { this.attributes.set(name, value) }, querySelectorAll: () => [],
        addEventListener(name: string, handler: unknown) { this.handlers.set(name, handler) },
      })
      return nodes.get(id)
    }
    const original = new Blob(['synthetic self']), urls = new Map([['self', 'blob:synthetic-self']])
    let confirmations = 0, sourceChanges = 0
    const context: any = { storageUnconfirmed: storage.storageUnconfirmed, storageUnconfirmedMessage: storage.storageUnconfirmedMessage,
      $: node, active: null, document: { activeElement: null, body: {}, documentElement: {} },
      ready: gate === 'ready' ? saving : Promise.resolve(), comparisonSave: gate === 'comparisonSave' ? saving : Promise.resolve(),
      AbortController, Error, operationTrigger: null, operationFocus: null, diagnostics: {}, monitor: null, audio: null,
      reference: { pause() {}, controls: true }, self: { pause() {}, removeAttribute() { sourceChanges++ }, load() { sourceChanges++ }, controls: true },
      stopPractice() {}, releaseCamera() {}, status() {}, showStorageRecovery() {}, applyPracticeSettings() {}, drawPractice() {}, updateOverlayControls() {}, updateControls() {}, report() {}, focusControl() {},
      takeBlob: original, selfDurationMs: 15000, activeTakeId: 'synthetic take', pendingTakeId: null, urls,
      URL: { revokeObjectURL(url: string) { revoked.push(url) } }, confirm() { confirmations++; return true },
    }
    // 直接觸發真正的 new-take handler；任意回呼通過不足以證明自拍 Blob／播放 URL 沒被清除。
    const source = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8')
    const operation = source.match(/async function operation\([^]*?\n}/)![0]
    const newTake = source.slice(source.indexOf("$('new-take').addEventListener"), source.indexOf("$('camera').addEventListener"))
    runInNewContext(operation + '\n' + newTake, context)
    await node('new-take').handlers.get('click')()
    expect(storage.storageUnconfirmed()).toBe(true)
    expect(context.takeBlob).toBe(original)
    expect(context.activeTakeId).toBe('synthetic take')
    expect(context.selfDurationMs).toBe(15000)
    expect(urls.get('self')).toBe('blob:synthetic-self')
    expect(revoked).toEqual([]); expect(sourceChanges).toBe(0); expect(confirmations).toBe(0)
    expect(context.active).toBeNull()
    expect(node('controls').attributes.get('aria-busy')).toBe('false')
    expect(context.diagnostics.lastError).toBe('storage-unconfirmed')
  }
})
