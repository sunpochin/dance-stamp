/* 檔案用途：驗證 chunks 恢復影格守門的取消／能力缺失／播放拒絕。所在層：原程序工具的有界瀏覽器回歸。主要關聯：main.js、recorder.js、take-open-failure.js。 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export async function recoveryFrameGuard({ page, origin, root, run, evidence, event, ready, fixtureSource }: any) {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  // 完整量測讀自己複製的同一來源；原獨立工具未傳參數時仍沿原檔。
  const source = fixtureSource ?? join(root, 'output/media-feasibility/reference.mp4'), fixture = join(run, 'synthetic.mp4')
  assert(existsSync(source), '先用原 make-sync-fixtures.py 準備合成來源，不能改用私人影片')
  // 只需短片觸發新守門，避免把本次失敗分支補驗擴成完整媒體矩陣。
  execFileSync('ffmpeg', ['-v', 'error', '-n', '-i', source, '-t', '4', '-c', 'copy', '-movflags', '+faststart', fixture])
  const fixtureBytes = readFileSync(fixture)
  evidence.fixture = { file: fixture, source, bytes: fixtureBytes.length, sha256: hash(fixtureBytes), sourceSha256: hash(readFileSync(source)) }
  const idle = () => page.waitForFunction(() => !(document.getElementById('controls') as HTMLFieldSetElement).disabled && document.getElementById('compare')!.getAttribute('aria-busy') !== 'true')
  const snapshot = async label => {
    const result = await page.evaluate(async () => {
      const storage = await import('/storage.js'), library = await storage.readLibrary(), db = await storage.openStore()
      const get = req => new Promise<any>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
      const tx = db.transaction(['metadata', 'media', 'chunks'])
      const [native, keys, media, chunkKeys, chunks] = await Promise.all([get(tx.objectStore('metadata').get('library')), get(tx.objectStore('media').getAllKeys()), get(tx.objectStore('media').getAll()), get(tx.objectStore('chunks').getAllKeys()), get(tx.objectStore('chunks').getAll())])
      const rows = async (values, ids) => Promise.all(values.map(async (blob, i) => ({ key: ids[i], type: blob.type, content: Array.from(new Uint8Array(await blob.arrayBuffer())) })))
      return { library, native, media: await rows(media, keys), chunks: await rows(chunks, chunkKeys) }
    })
    for (const kind of ['media', 'chunks']) result[kind] = result[kind].map((row, i) => {
      const bytes = Buffer.from(row.content); writeFileSync(join(run, `${label}-${kind}-${i}.bin`), bytes)
      return { key: row.key, type: row.type, bytes: bytes.length, sha256: hash(bytes) }
    })
    evidence[label] = result; event('frame-snapshot', { label }); return result
  }
  await page.context().addInitScript(() => {
    const w = window as any, nativeFrame = HTMLVideoElement.prototype.requestVideoFrameCallback, nativeCancel = HTMLVideoElement.prototype.cancelVideoFrameCallback
    const nativePlay = HTMLMediaElement.prototype.play, nativeSet = window.setTimeout, nativeClear = window.clearTimeout
    const nativeAdd = AbortSignal.prototype.addEventListener, nativeRemove = AbortSignal.prototype.removeEventListener
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL
    w.guardAudit = { active: false, reset(mode) { this.state = { mode, loaded: [], frames: [], held: [], parents: new Set(), listeners: [], timers: new Map(), scheduled: 0, cleared: 0, fired: 0, plays: 0, resolved: 0, released: 0, created: [], revoked: [] }; this.active = true } }
    const state = () => w.guardAudit.active ? w.guardAudit.state : null
    document.addEventListener('loadeddata', e => { const a = state(); if (a && (e.target as HTMLElement).id === 'self') a.loaded.push({ trusted: e.isTrusted, url: (e.target as HTMLVideoElement).src }) }, true)
    URL.createObjectURL = blob => { const url = create.call(URL, blob); state()?.created.push(url); return url }
    URL.revokeObjectURL = url => { state()?.revoked.push(url); return revoke.call(URL, url) }
    AbortSignal.prototype.addEventListener = function(name, callback, ...args) {
      const a = state(), stack = new Error().stack || ''
      if (a && name === 'abort' && callback) {
        if (stack.includes('presentedFrame')) { a.waiting = this; a.listeners.push({ signal: this, callback, removed: false }) }
        else if ((callback as Function).name === 'cancel' && stack.includes('main.js')) { a.parents.add(this); a.listeners.push({ signal: this, callback, removed: false }) }
      }
      return nativeAdd.call(this, name, callback, ...args)
    }
    AbortSignal.prototype.removeEventListener = function(name, callback, ...args) {
      if (name === 'abort') for (const row of state()?.listeners || []) if (row.signal === this && row.callback === callback) row.removed = true
      return nativeRemove.call(this, name, callback, ...args)
    }
    window.setTimeout = function(callback, delay, ...args) {
      const a = state(), watched = a && delay === 15000 && (new Error().stack || '').includes('presentedFrame')
      const id = nativeSet.call(window, watched ? (...values) => { a.timers.delete(id); a.fired++; callback(...values) } : callback, delay, ...args)
      if (watched) { a.timers.set(id, true); a.scheduled++ } return id
    } as typeof setTimeout
    window.clearTimeout = id => { const a = state(); if (a?.timers.delete(id)) a.cleared++; return nativeClear.call(window, id) }
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
      const a = state(); if (!a || this.id !== 'self') return nativeFrame.call(this, callback)
      const row = { id: 0, cancelled: false, delivered: false, native: false }; a.frames.push(row)
      row.id = nativeFrame.call(this, (now, metadata) => {
        row.native = true
        if (a.mode === 'stop') a.held.push({ callback, now, metadata, video: this, row })
        else { row.delivered = true; callback(now, metadata) }
      }); return row.id
    }
    HTMLVideoElement.prototype.cancelVideoFrameCallback = function(id) {
      for (const row of state()?.frames || []) if (row.id === id) row.cancelled = true
      return nativeCancel.call(this, id)
    }
    HTMLMediaElement.prototype.play = function() {
      const a = this.id === 'self' ? state() : null
      if (a) a.plays++
      return nativePlay.call(this).then(() => { if (a) a.resolved++ })
    }
    window.confirm = () => true
  })
  await page.reload(); await ready(page)
  await page.locator('#reference-file').setInputFiles(fixture); await idle()
  await page.locator('#copy-reference').click(); await idle()
  const videoId = await page.locator('#library').inputValue()
  await page.locator('#self-file').setInputFiles(fixture); await idle()
  for (const [id, value] of [['end', '2'], ['offset', '0.25']]) { await page.locator(`#${id}`).fill(value); await page.locator(`#${id}`).dispatchEvent('change'); await idle() }
  await page.locator('#reference-mirror').check(); await idle()
  await page.locator('#copy-self').click(); await idle()
  await page.locator('#export').click(); await idle()
  assert(await page.locator('#output-download').isVisible(), '舊 VS 前置失敗不能略過')
  // 可見連結還不足以證明檔案可用；保留真正下載供網站外重播，並在每個基準核對完整bytes。
  const downloading = page.waitForEvent('download'); await page.locator('#output-download').click()
  const downloaded = await downloading, suffix = downloaded.suggestedFilename().split('.').pop()
  assert(['mp4', 'webm'].includes(suffix!))
  const vsFile = join(run, `baseline-vs.${suffix}`); await downloaded.saveAs(vsFile)
  const vsBytes = readFileSync(vsFile); evidence.vsDownload = { file: vsFile, bytes: vsBytes.length, sha256: hash(vsBytes) }
  const targets = await page.evaluate(async () => {
    const storage = await import('/storage.js'), saved = await storage.readLibrary(), old = saved.data.takes.at(-1), original = await storage.readMedia(old.cameraAssetId), targets = []
    saved.data.markers.push({ id: crypto.randomUUID(), videoId: old.referenceVideoId, title: '合成守門筆記', note: '停止與拒絕不能改寫舊資料', startMs: 500, revision: 1 })
    for (const mode of ['stop', 'missing', 'play-reject']) {
      const take = { ...old, id: crypto.randomUUID(), cameraAssetId: crypto.randomUUID(), referenceStartMs: 1000, referenceEndMs: 3500, state: 'interrupted' }
      // 只有 chunks，尚未有完整 media；沿 readLibrary 的缺片投影，避免前置 location 在正常保存時被正規化。
      saved.data.takes.push(take); saved.data.assets.push({ id: take.cameraAssetId, kind: 'take', byteLength: 0, mimeType: original.type, state: 'interrupted', storageKind: 'external', mediaIncluded: false })
      saved.data.recipes.push({ id: crypto.randomUUID(), takeId: take.id, offsetMs: 500, referenceMirror: false, selfMirror: true, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
      const middle = Math.floor(original.size / 2)
      await storage.saveChunk(take.cameraAssetId, 0, original.slice(0, middle, original.type)); await storage.saveChunk(take.cameraAssetId, 1, original.slice(middle, original.size, original.type))
      targets.push({ mode, takeId: take.id, assetId: take.cameraAssetId })
    }
    await storage.writeLibrary(saved.data, saved.revision)
    return { oldTakeId: old.id, targets }
  })
  await page.reload(); await ready(page)
  await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle()
  const open = async id => { await page.locator(`[data-focus-key="take:${id}:open"]`).click(); await idle() }
  const ui = () => page.evaluate(() => ({ urls: ['self', 'take-download', 'output-download'].map(id => { const el = document.getElementById(id) as HTMLVideoElement & HTMLAnchorElement; return id === 'self' ? el.src : el.href }), fields: ['start', 'end', 'rate', 'offset', 'reference-mirror', 'self-mirror'].map(id => { const el = document.getElementById(id) as HTMLInputElement; return el.type === 'checkbox' ? el.checked : el.value }) }))
  const audit = () => page.evaluate(() => {
    const a = (window as any).guardAudit.state
    return { loaded: a.loaded, frames: a.frames, held: a.held.map(row => ({ mediaTime: row.metadata.mediaTime, presentedFrames: row.metadata.presentedFrames })), parents: [...a.parents].map((signal: AbortSignal) => signal.aborted), waitingAborted: a.waiting?.aborted, remainingListeners: a.listeners.filter(row => !row.removed).length, timers: a.timers.size, scheduled: a.scheduled, cleared: a.cleared, fired: a.fired, plays: a.plays, resolved: a.resolved, released: a.released, created: a.created, revoked: a.revoked }
  })
  const sibling = await page.context().newPage(); await sibling.goto(origin); await ready(sibling); await page.bringToFront()
  for (const target of targets.targets) {
    await open(targets.oldTakeId)
    const before = await snapshot(`${target.mode}-before`), previous = await ui()
    const vsAsset = before.native.data.assets.find(asset => asset.kind === 'vs'), vsIndex = before.media.findIndex(row => row.key === vsAsset?.id)
    assert(vsIndex >= 0); assert.deepEqual(readFileSync(join(run, `${target.mode}-before-media-${vsIndex}.bin`)), vsBytes, '實際舊VS下載與原生保存bytes不同')
    await page.evaluate(mode => {
      const w = window as any, video = document.getElementById('self') as HTMLVideoElement; w.guardAudit.reset(mode)
      if (mode === 'missing') Object.defineProperty(video, 'requestVideoFrameCallback', { configurable: true, value: undefined })
      if (mode === 'play-reject') Object.defineProperty(video, 'play', { configurable: true, value: () => { w.guardAudit.state.plays++; return Promise.reject(new DOMException('synthetic recovery play rejection', 'NotAllowedError')) } })
    }, target.mode)
    await page.locator(`[data-focus-key="take:${target.takeId}:open"]`).click()
    if (target.mode === 'stop') {
      await page.waitForFunction(() => { const a = (window as any).guardAudit.state; return a.loaded.some(row => row.trusted) && a.held.length === 1 && a.resolved === 1 && (document.getElementById('controls') as HTMLFieldSetElement).disabled })
      evidence.frameBarrier = await audit(); event('native-frame-result-held')
      assert(await sibling.evaluate(async id => { try { await (await import('/storage.js')).withTakeLock(id, async () => {}); return false } catch { return true } }, target.takeId))
      await page.locator('#stop').click()
    }
    await idle()
    const state = await audit(); evidence[`${target.mode}-audit`] = state
    assert.deepEqual(await snapshot(`${target.mode}-failed`), before, `${target.mode} 改變舊資料或 chunks`)
    assert.deepEqual(await ui(), previous, `${target.mode} 改變舊影片／下載／配方`)
    assert(state.created.length === 1 && state.revoked.includes(state.created[0]))
    assert(previous.urls.every(url => !state.revoked.includes(url)))
    assert(state.remainingListeners === 0 && state.timers === 0 && state.fired === 0)
    assert(state.parents.length === 1 && state.parents[0] === (target.mode === 'stop'))
    if (target.mode === 'missing') { assert.equal(state.frames.length, 0); assert.equal(state.scheduled, 0); assert((await page.locator('#status').textContent()).includes('無法確認恢復片段的影格')) }
    else { assert.equal(state.scheduled, 1); assert.equal(state.cleared, 1); assert(state.waitingAborted && state.frames.every(row => row.cancelled)) }
    assert(await page.evaluate(async id => (await import('/storage.js')).withTakeLock(id, async () => true), target.takeId))
    if (target.mode === 'stop') {
      // 只釋放先前真正原生 callback 的同一份 now／metadata；不能派發假影格或偽造 duration。
      await page.evaluate(() => { const a = (window as any).guardAudit.state; for (const row of a.held) { a.released++; row.callback(row.now, row.metadata) } })
      assert.deepEqual(await snapshot('stop-late-frame'), before, '遲到原生通知偷偷提交')
      assert.deepEqual(await ui(), previous); evidence.lateFrameAudit = await audit()
    }
    await page.evaluate(() => { const video = document.getElementById('self') as any; delete video.requestVideoFrameCallback; delete video.play; (window as any).guardAudit.reset('retry') })
    await open(target.takeId)
    const retried = await snapshot(`${target.mode}-retry`), retryAudit = await audit()
    assert.equal(retried.library.data.takes.find(take => take.id === target.takeId).state, 'interrupted')
    assert(!retried.chunks.some(row => row.key[0] === target.assetId))
    const row = retried.media.find(row => row.key === target.assetId), index = retried.media.indexOf(row)
    assert(row && row.sha256 === hash(fixtureBytes)); assert.deepEqual(readFileSync(join(run, `${target.mode}-retry-media-${index}.bin`)), fixtureBytes)
    assert(retryAudit.frames.some(row => row.native && row.delivered) && !retryAudit.timers && !retryAudit.remainingListeners)
    // 成功只追加目標媒體／狀態；所有既存筆記、配方、媒體都仍按原 ID／完整 bytes 核對。
    for (const old of before.media) assert.deepEqual(retried.media.find(row => row.key === old.key), old)
    for (const key of ['videos', 'markers', 'recipes', 'exports']) assert.deepEqual(retried.native.data[key], before.native.data[key])
    for (const [key, id] of [['takes', target.takeId], ['assets', target.assetId]]) assert.deepEqual(retried.native.data[key].filter(row => row.id !== id), before.native.data[key].filter(row => row.id !== id))
    evidence[`${target.mode}-retry-audit`] = retryAudit; event('frame-case-passed', { mode: target.mode })
    await page.evaluate(() => { (window as any).guardAudit.active = false })
  }
  await sibling.close()
  // 完整原片已落盤後，清 chunks 失敗也不能撤銷原片；沿原合成來源再補一段真正交易 abort。
  const cleanupOriginal = await snapshot('cleanup-original')
  const cleanupTarget = await page.evaluate(async oldTakeId => {
    const storage = await import('/storage.js'), saved = await storage.readLibrary(), old = saved.data.takes.find(row => row.id === oldTakeId), original = await storage.readMedia(old.cameraAssetId)
    const take = { ...old, id: crypto.randomUUID(), cameraAssetId: crypto.randomUUID(), state: 'interrupted' }
    saved.data.takes.push(take); saved.data.assets.push({ id: take.cameraAssetId, kind: 'take', byteLength: 0, mimeType: original.type, state: 'interrupted', storageKind: 'external', mediaIncluded: false })
    saved.data.recipes.push({ ...saved.data.recipes.find(row => row.takeId === oldTakeId), id: crypto.randomUUID(), takeId: take.id })
    const middle = Math.floor(original.size / 2)
    await storage.saveChunk(take.cameraAssetId, 0, original.slice(0, middle, original.type)); await storage.saveChunk(take.cameraAssetId, 1, original.slice(middle, original.size, original.type))
    await storage.writeLibrary(saved.data, saved.revision)
    return { takeId: take.id, assetId: take.cameraAssetId }
  }, targets.oldTakeId)
  await page.reload(); await ready(page)
  await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle()
  const cleanupBefore = await snapshot('cleanup-before')
  await page.evaluate(assetId => {
    const w = window as any, original = IDBObjectStore.prototype.delete
    w.cleanupFault = { calls: 0, errors: [], aborts: [] }; w.guardAudit.reset('cleanup')
    const wrapped = function(this: IDBObjectStore, key) {
      const request = original.call(this, key), tx = this.transaction, fault = w.cleanupFault
      if (this.name === 'chunks' && tx.objectStoreNames.length === 1 && tx.mode === 'readwrite' && key instanceof IDBKeyRange && key.lower[0] === assetId && !fault.calls) {
        // 中止真正的指定清理交易，保留引擎 AbortError／abort 收據；不偽造 Promise 拒絕或改完成期限。
        fault.calls++; request.addEventListener('error', event => fault.errors.push({ trusted: event.isTrusted, name: request.error?.name }))
        tx.addEventListener('abort', event => fault.aborts.push({ trusted: event.isTrusted, mode: tx.mode, stores: [...tx.objectStoreNames] })); tx.abort()
      }
      return request
    }
    IDBObjectStore.prototype.delete = wrapped
    w.restoreCleanupFault = () => { if (IDBObjectStore.prototype.delete !== wrapped) throw new Error('清理注入已換持有人'); IDBObjectStore.prototype.delete = original }
  }, cleanupTarget.assetId)
  try { await open(cleanupTarget.takeId) }
  finally { await page.evaluate(() => (window as any).restoreCleanupFault()) }
  const cleanupNative = await page.evaluate(() => (window as any).cleanupFault), cleanupAfter = await snapshot('cleanup-after'), cleanupAudit = await audit()
  assert.equal(cleanupNative.calls, 1); assert.deepEqual(cleanupNative.errors, [{ trusted: true, name: 'AbortError' }]); assert.deepEqual(cleanupNative.aborts, [{ trusted: true, mode: 'readwrite', stores: ['chunks'] }])
  assert.equal(JSON.parse(await page.locator('#diagnostics').textContent()).chunkCleanup, 'pending')
  assert(await page.locator('#storage-recovery').isHidden()); assert.equal(cleanupAfter.native.revision, cleanupBefore.native.revision + 1)
  assert.deepEqual(cleanupAfter.chunks, cleanupBefore.chunks, '清理 abort 沒有原子保留完整 chunks')
  for (const key of ['videos', 'markers', 'recipes', 'exports', 'takes']) assert.deepEqual(cleanupAfter.native.data[key], cleanupBefore.native.data[key])
  assert.deepEqual(cleanupAfter.native.data.assets.filter(row => row.id !== cleanupTarget.assetId), cleanupBefore.native.data.assets.filter(row => row.id !== cleanupTarget.assetId))
  for (const old of cleanupBefore.media) assert.deepEqual(cleanupAfter.media.find(row => row.key === old.key), old)
  const recovered = cleanupAfter.media.find(row => row.key === cleanupTarget.assetId)
  assert(recovered && recovered.sha256 === hash(fixtureBytes)); assert.equal(cleanupAfter.media.length, cleanupBefore.media.length + 1)
  assert(cleanupAudit.frames.some(row => row.native && row.delivered) && !cleanupAudit.timers && !cleanupAudit.remainingListeners)
  assert(await page.locator('#self').evaluate((video: HTMLVideoElement) => video.readyState >= 2 && !video.error))
  const recovering = page.waitForEvent('download'); await page.locator('#take-download').click(); const recoveredFile = await recovering
  const recoveredPath = join(run, `cleanup-recovered.${recoveredFile.suggestedFilename().split('.').pop()}`); await recoveredFile.saveAs(recoveredPath)
  assert.deepEqual(readFileSync(recoveredPath), fixtureBytes, '清理失敗後真正原片下載不等於原合成 bytes')
  await page.evaluate(() => { (window as any).guardAudit.active = false })
  await page.reload(); await ready(page); await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle(); await open(cleanupTarget.takeId)
  assert.deepEqual(await snapshot('cleanup-reopened'), cleanupAfter, '已有完整原片重開仍重複保存或改動 chunks')
  // 用公開刪除入口清理這一段，證明後續操作仍可完成；不能直接呼叫 clearChunks 來代替使用者流程。
  await page.locator(`[data-focus-key="take:${cleanupTarget.takeId}:delete"]`).click(); await page.locator('#delete-dialog').waitFor({ state: 'visible' }); await page.locator('#delete-confirm').click(); await idle()
  const cleanupDeleted = await snapshot('cleanup-deleted')
  assert.deepEqual(cleanupDeleted.native.data, cleanupOriginal.native.data); assert.deepEqual(cleanupDeleted.media, cleanupOriginal.media); assert.deepEqual(cleanupDeleted.chunks, cleanupOriginal.chunks)
  assert.equal(cleanupDeleted.native.revision, cleanupOriginal.native.revision + 3)
  evidence.chunkCleanup = { target: cleanupTarget, native: cleanupNative, audit: cleanupAudit, pendingReported: true, originalMediaAndAllOtherMetadataPreserved: true, chunksRetainedAfterAbort: true, sameProfileReopenDoesNotRewrite: true, publicDeleteOnlyTarget: true, recoveredDownload: { file: recoveredPath, bytes: fixtureBytes.length, sha256: hash(fixtureBytes) } }
  event('recovery-chunk-cleanup-verified')
  event('recovery-frame-guards-verified')
}
