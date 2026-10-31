/* 檔案用途：真實錄影 chunk 未提交時強制中斷，再核對同 profile 恢復。所在層：原 forced-install-restart 的選用情境。主要關聯：storage.js、main.js、issue-9-capture-recovery.md。 */
// 相機設定已收在選用區；先展開，再沿用原本的錄影與資料保護斷言。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export async function chunkWriteRestart({ page, origin, root, run, evidence, event, launch, stop, ready }: any) {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  const idle = p => p.waitForFunction(() => !(document.getElementById('controls') as HTMLFieldSetElement).disabled && document.getElementById('compare')!.getAttribute('aria-busy') !== 'true')
  // 每次快照也落完整二進位；不能只靠雜湊或第三次「已通過」事件推斷重開內容。
  const snapshot = async (p, label) => {
    const result = await p.evaluate(async () => {
      const storage = await import('/storage.js'), library = await storage.readLibrary(), db = await storage.openStore()
      const get = req => new Promise<any>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
      const tx = db.transaction(['metadata', 'media', 'chunks'])
      const [native, mediaKeys, media, chunkKeys, chunks] = await Promise.all([get(tx.objectStore('metadata').get('library')), get(tx.objectStore('media').getAllKeys()), get(tx.objectStore('media').getAll()), get(tx.objectStore('chunks').getAllKeys()), get(tx.objectStore('chunks').getAll())])
      const bytes = async (blob, key) => ({ key, type: blob.type, content: Array.from(new Uint8Array(await blob.arrayBuffer())) })
      return { library, native, media: await Promise.all(media.map((blob, i) => bytes(blob, mediaKeys[i]))), chunks: await Promise.all(chunks.map((blob, i) => bytes(blob, chunkKeys[i]))) }
    })
    for (const kind of ['media', 'chunks']) result[kind] = result[kind].map((row, i) => {
      const bytes = Buffer.from(row.content); writeFileSync(join(run, `${label}-${kind}-${i}.bin`), bytes)
      return { key: row.key, type: row.type, bytes: bytes.length, sha256: hash(bytes) }
    })
    evidence[label] = result; event('snapshot', { label }); return result
  }
  const retainOld = current => {
    for (const source of ['library', 'native']) for (const [key, rows] of Object.entries(baseline[source].data)) {
      if (Array.isArray(rows)) assert.deepEqual(current[source].data[key].filter(row => rows.some(old => old.id === row.id)), rows, `舊 ${source}/${key} 改變`)
      else assert.deepEqual(current[source].data[key], rows)
    }
    assert.deepEqual(current.media.filter(row => baseline.media.some(old => old.key === row.key)), baseline.media, '舊影片／VS bytes 改變')
  }
  const download = async (p, label, expected, selector = '#take-download') => {
    const pending = p.waitForEvent('download'); await p.locator(selector).click()
    const file = join(run, `${label}.mp4`); await (await pending).saveAs(file)
    const actual = readFileSync(file); assert.deepEqual(actual, expected, '實際下載與已提交 chunks 不同')
    execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-'], { timeout: 20_000 })
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }))
    assert(probe.streams.some(stream => stream.codec_type === 'video' && Number(stream.nb_read_frames) > 0))
    // 另開無產品程式的空頁，從真正下載檔重建來源，實播至 ended；不採用產品 ready 當解碼證據。
    const player = await p.context().newPage(); await player.goto('about:blank')
    const playback = await player.evaluate(async content => {
      const video = document.createElement('video'); video.muted = true; document.body.append(video)
      const url = URL.createObjectURL(new Blob([new Uint8Array(content)], { type: 'video/mp4' })); video.src = url
      try {
        return await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('獨立播放器未播完')), 15_000)
          video.onerror = () => { clearTimeout(timer); reject(new Error('獨立播放器解碼失敗')) }
          video.onended = () => { clearTimeout(timer); resolve({ currentTime: video.currentTime, width: video.videoWidth, ended: video.ended }) }
          video.play().catch(reject)
        })
      } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
    }, Array.from(actual))
    await player.close(); evidence[label] = { bytes: actual.length, sha256: hash(actual), probe, playback }; event('download-decoded', { label })
  }
  await page.locator('#reference-file').setInputFiles(join(root, 'output/media-feasibility/reference.mp4')); await idle(page)
  // 中斷回歸的舊比較固定 15 秒，不能讓完整影片預設阻擋其建立。
  await page.locator('#end').fill('15')
  await page.locator('#copy-reference').click(); await idle(page)
  const videoId = await page.locator('#library').inputValue()
  await page.locator('#self-file').setInputFiles(join(root, 'output/media-feasibility/reference.mp4')); await idle(page)
  await page.locator('#copy-self').click(); await idle(page)
  await page.locator('#export').click(); await idle(page)
  assert(await page.locator('#output-download').isVisible(), '前置舊 VS 未成功，不能跳過')
  await page.evaluate(async () => {
    const storage = await import('/storage.js'), saved = await storage.readLibrary()
    saved.data.markers.push({ id: crypto.randomUUID(), videoId: saved.data.videos[0].id, title: '合成中斷前標記', note: '舊筆記必須完整保留', startMs: 1000, revision: 2 })
    await storage.writeLibrary(saved.data, saved.revision)
  })
  await page.reload(); await ready(page)
  await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle(page)
  const baseline = await snapshot(page, 'chunkBaseline')
  assert.equal(baseline.media.length, 3); assert.equal(baseline.library.data.exports.length, 1)
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction, Native = MediaRecorder
    const a = (window as any).chunkRestart = { transactions: [], native: [], tracks: [], requests: [], started: 0, stopped: 0 }
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async constraints => {
      a.requests.push(constraints); const stream = await getMedia(constraints); a.tracks.push(...stream.getTracks()); return stream
    }
    window.confirm = () => true
    ;(window as any).MediaRecorder = class extends Native {
      constructor(...args) {
        super(...args)
        this.addEventListener('start', event => { if (event.isTrusted) a.started++ })
        this.addEventListener('stop', event => { if (event.isTrusted) a.stopped++ })
        this.addEventListener('dataavailable', async event => {
          if (event.data.size) a.native.push({ trusted: event.isTrusted, type: event.data.type, content: Array.from(new Uint8Array(await event.data.arrayBuffer())) })
        })
      }
    }
    IDBDatabase.prototype.transaction = function(names, access, ...rest) {
      const tx = transaction.call(this, names, access, ...rest)
      if (access !== 'readwrite' || names !== 'chunks') return tx
      const row = { ticks: 0, writes: [], complete: false, abort: false, candidateSeen: false }; a.transactions.push(row)
      tx.addEventListener('complete', event => { row.complete = event.isTrusted })
      tx.addEventListener('abort', event => { row.abort = event.isTrusted })
      tx.addEventListener('success', event => {
        const request = event.target as IDBRequest
        if (Array.isArray(request.result) && typeof request.result[0] === 'string' && Number.isSafeInteger(request.result[1])) row.writes.push({ key: request.result, trusted: event.isTrusted })
      }, { capture: true })
      if (a.transactions.length === 3) {
        // MP4 第一塊可能只有檔頭；先提交含影格的前兩塊，再延長第三次真正 add 的未提交時段。
        const keepAlive = () => {
          const request = tx.objectStore('chunks').getAllKeys()
          request.onsuccess = () => { row.ticks++; row.candidateSeen = request.result.some(key => key[1] === 2); keepAlive() }
        }
        keepAlive()
      }
      return tx
    }
  })
  // 先建觀察分頁再回到錄影頁；錄影中另開前景頁會觸發真正背景中斷，改變本案要殺掉的狀態。
  const sibling = await page.context().newPage(); await sibling.goto(origin); await ready(sibling); await page.bringToFront()
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle(page)
  await page.locator('#capture').click()
  await page.waitForFunction(() => {
    const a = (window as any).chunkRestart, [first, second, third] = a.transactions
    return a.native.length >= 3 && first?.complete && second?.complete && third?.candidateSeen && third.ticks > 2 && third.writes.some(write => write.trusted && write.key[1] === 2)
  })
  const barrier = () => page.evaluate(async () => {
    const a = (window as any).chunkRestart, saved = await (await import('/storage.js')).readLibrary()
    return { transactions: structuredClone(a.transactions), native: a.native.slice(0, 3), started: a.started, stopped: a.stopped, requests: a.requests, tracks: a.tracks.map(track => ({ label: track.label, state: track.readyState })), take: saved.data.takes.at(-1), busy: (document.getElementById('controls') as HTMLFieldSetElement).disabled }
  })
  const first = await barrier(); await Bun.sleep(100); const second = await barrier()
  assert(second.transactions[2].ticks > first.transactions[2].ticks)
  for (const b of [first, second]) {
    assert(b.transactions.slice(0, 2).every(row => row.complete && !row.abort))
    assert(!b.transactions[2].complete && !b.transactions[2].abort && b.transactions[2].candidateSeen)
    assert(b.busy && b.started === 1 && b.stopped === 0 && b.take.state === 'recording')
    assert(b.native.every(row => row.trusted && row.content.length > 0))
    assert(b.tracks.length === 1 && b.tracks.every(track => track.state === 'live' && /fake|y4m/i.test(track.label)))
    assert(b.requests.length === 1 && b.requests[0].audio === false)
  }
  const active = second.take, native = second.native.map((row, index) => {
    const bytes = Buffer.from(row.content); writeFileSync(join(run, `native-chunk-${index}.bin`), bytes)
    return { type: row.type, bytes: bytes.length, sha256: hash(bytes), trusted: row.trusted }
  })
  assert(await sibling.evaluate(async id => { try { await (await import('/storage.js')).withTakeLock(id, async () => {}); return false } catch (error) { return error.message.includes('另一個分頁') } }, active.id), '中斷前 take 鎖未保護錄影')
  await sibling.close()
  evidence.chunkBarrier = { first: { ...first, native }, second: { ...second, native } }; event('native-chunk-write-pending')
  // 證據寫到本機後才 SIGKILL；此處不可正常 stop／close 來替代程序中斷。
  await stop('SIGKILL')
  const restarted = await launch('chunk-restart'), p = restarted.page
  await p.goto(origin); await ready(p)
  const after = await snapshot(p, 'chunkAfterKill'); retainOld(after)
  assert.equal(after.native.revision, baseline.native.revision + 1)
  assert.equal(after.chunks.length, 2)
  for (let index = 0; index < 2; index++) assert.deepEqual(after.chunks[index], { key: [active.cameraAssetId, index], type: native[index].type, bytes: native[index].bytes, sha256: native[index].sha256 })
  assert.equal(after.library.data.takes.at(-1).state, 'recording'); assert.equal(after.library.data.assets.find(row => row.id === active.cameraAssetId).state, 'interrupted')
  assert(await p.evaluate(async id => (await import('/storage.js')).withTakeLock(id, async () => true), active.id), '新程序未釋放 take 鎖')
  const committed = Buffer.concat([0, 1].map(index => {
    const bytes = readFileSync(join(run, `native-chunk-${index}.bin`)); assert.deepEqual(readFileSync(join(run, `chunkAfterKill-chunks-${index}.bin`)), bytes); return bytes
  })), pending = readFileSync(join(run, 'native-chunk-2.bin'))
  await p.evaluate(async id => {
    const blob = await (await import('/storage.js')).recoverChunks(id), link = document.createElement('a')
    link.id = 'chunk-prefix-download'; link.href = URL.createObjectURL(blob); link.download = 'synthetic-prefix.mp4'; link.textContent = '合成片段下載'; document.body.append(link)
  }, active.cameraAssetId)
  await download(p, 'committed-part-download', committed, '#chunk-prefix-download')
  await p.evaluate(() => { const link = document.getElementById('chunk-prefix-download') as HTMLAnchorElement; URL.revokeObjectURL(link.href); link.remove() })
  // 用完全相同 asset／index／原生 bytes 重試；這是儲存重試，不假稱重新接續被殺掉的 recorder。
  const retry = await p.evaluate(async ({ active, content, type }) => {
    const storage = await import('/storage.js')
    await storage.withTakeLock(active.id, () => storage.saveChunk(active.cameraAssetId, 2, new Blob([new Uint8Array(content)], { type })))
    let duplicateRejected = false
    try { await storage.saveChunk(active.cameraAssetId, 0, new Blob(['不得覆寫'])) } catch { duplicateRejected = true }
    return { assetId: active.cameraAssetId, index: 2, duplicateRejected }
  }, { active, content: Array.from(pending), type: native[2].type })
  assert(retry.duplicateRejected); evidence.chunkRetry = retry
  const retried = await snapshot(p, 'chunkRetried'); retainOld(retried)
  assert.equal(retried.chunks.length, 3)
  for (let index = 0; index < 3; index++) assert.deepEqual(readFileSync(join(run, `chunkRetried-chunks-${index}.bin`)), readFileSync(join(run, `native-chunk-${index}.bin`)))
  // 另一份自有 take 只含真實原生檔頭，專門確認「有 bytes」不會被當成可解碼原片。
  const headerOnly = await p.evaluate(async ({ active, content, type }) => {
    const storage = await import('/storage.js'), saved = await storage.readLibrary(), takeId = crypto.randomUUID(), assetId = crypto.randomUUID()
    const sourceRecipe = saved.data.recipes.find(row => row.takeId === active.id)
    saved.data.takes.push({ ...active, id: takeId, cameraAssetId: assetId })
    saved.data.assets.push({ ...saved.data.assets.find(row => row.id === active.cameraAssetId), id: assetId })
    saved.data.recipes.push({ ...sourceRecipe, id: crypto.randomUUID(), takeId })
    await storage.writeLibrary(saved.data, saved.revision)
    await storage.withTakeLock(takeId, () => storage.saveChunk(assetId, 0, new Blob([new Uint8Array(content)], { type })))
    return { takeId, assetId }
  }, { active, content: Array.from(readFileSync(join(run, 'native-chunk-0.bin'))), type: native[0].type })
  // 前置資料由儲存模組新建，必須真正重載 UI 狀態；不能拿舊列表當成新 take 已被產品讀到。
  await p.reload(); await ready(p)
  await p.locator('#library').selectOption(videoId); await p.locator('#open-library').click(); await idle(p)
  const open = async id => { const index = await p.evaluate(async id => (await (await import('/storage.js')).readLibrary()).data.takes.findIndex(take => take.id === id), id); await p.locator('#takes li').nth(index).getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle(p) }
  await p.evaluate(() => { window.confirm = () => true })
  await open(baseline.library.data.takes[0].id)
  const previousSource = await p.locator('#self').getAttribute('src')
  await open(headerOnly.takeId)
  const rejected = await snapshot(p, 'chunkHeaderRejected'); retainOld(rejected)
  assert.equal(rejected.library.data.takes.find(take => take.id === headerOnly.takeId).state, 'interrupted')
  assert(!rejected.media.some(row => row.key === headerOnly.assetId), '不可解碼的原生檔頭被保存 ready')
  assert.equal(await p.locator('#self').getAttribute('src'), previousSource, '壞片取代舊播放器')
  assert.equal(rejected.chunks.find(row => row.key[0] === headerOnly.assetId).sha256, native[0].sha256)
  evidence.headerOnly = headerOnly
  await open(active.id)
  assert((await p.locator('#status').textContent()).includes('仍標示中斷'), `恢復未維持 interrupted：${await p.locator('#status').textContent()}`)
  await download(p, 'retried-part-download', Buffer.concat([committed, pending]))
  const recovered = await snapshot(p, 'chunkRecovered'); retainOld(recovered)
  assert.equal(recovered.chunks.length, 1, '應只保留不可解碼的檔頭，成功原片清理自己的 chunks')
  assert.equal(recovered.chunks[0].key[0], headerOnly.assetId)
  for (const id of [active.id, headerOnly.takeId]) assert.equal(recovered.library.data.takes.find(take => take.id === id).state, 'interrupted')
  const row = recovered.media.find(row => row.key === active.cameraAssetId); assert.equal(row.bytes, committed.length + pending.length); assert.equal(row.sha256, hash(Buffer.concat([committed, pending])))
  await stop('SIGTERM')
  const third = await launch('chunk-recovered-restart'); await third.page.goto(origin); await ready(third.page)
  const reopened = await snapshot(third.page, 'chunkReopened'); assert.deepEqual(reopened, recovered)
  for (let i = 0; i < reopened.media.length; i++) assert.deepEqual(readFileSync(join(run, `chunkReopened-media-${i}.bin`)), readFileSync(join(run, `chunkRecovered-media-${i}.bin`)))
  assert.deepEqual(readFileSync(join(run, 'chunkReopened-chunks-0.bin')), readFileSync(join(run, 'native-chunk-0.bin')))
  for (const id of [active.id, headerOnly.takeId]) assert(await third.page.evaluate(async id => (await import('/storage.js')).withTakeLock(id, async () => true), id))
  event('chunk-recovery-restart-verified')
}
