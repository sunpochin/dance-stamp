/* 檔案用途：從公開入口驗證保存中斷後的新頁待傳工作與同檔重試。所在層：合成瀏覽器回歸。主要關聯：verify-cloud.ts、cloud-practice-ui.js、storage.js、#232。 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 同一份真雙片與舊成品基準供恢復／斷開情境使用，避免各案抄一套保全核對。
export async function cloudWorkspace({ page, idle, out }) {
  const first = await page(true)
  const record = (name, value) => writeFileSync(resolve(out, name + '.json'), JSON.stringify(value, null, 2))
  for (const [id, file] of [['reference-file', 'reference.webm'], ['self-file', 'self.webm']]) {
    await first.locator('#' + id).setInputFiles(resolve(out, file)); await idle(first)
  }
  await first.locator('#export').click(); await idle(first)
  async function download(p, name) {
    const waiting = p.waitForEvent('download'); await p.locator('#output-download').click()
    const file = await waiting, path = resolve(out, name); await file.saveAs(path)
    const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  }
  async function snapshot(p, includeSources = true) {
    return p.evaluate(async includeSources => {
      const storage = await import('/storage.js'), library = await storage.readLibrary(), media = []
      const hash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('')
      for (const id of (await storage.readMediaKeys()).sort()) { const blob = await storage.readMedia(id); media.push({ id, bytes: blob.size, sha256: await hash(blob) }) }
      const sources = []
      if (includeSources) for (const id of ['reference', 'self']) {
        const video = document.querySelector<HTMLVideoElement>('#' + id)!, observed = (window as any).__cloudRecoverySources, blob = observed.blobs.get(video.src)
        if (!(blob instanceof Blob)) throw new Error('沒有取得實際原片Blob，拒絕推定保全')
        sources.push({ id, src: video.src, revoked: observed.revoked.has(video.src), time: video.currentTime, paused: video.paused, rate: video.playbackRate, bytes: blob.size, sha256: await hash(blob) })
      }
      return { library, media, sources, output: document.getElementById('output-download')?.getAttribute('href') }
    }, includeSources)
  }
  // 讀底層唯讀交易作獨立核對，避免測試自己呼叫待驗證的 readCloudWork 而灌入覆蓋率。
  async function storedWork(p, id) {
    return p.evaluate(async id => {
      const db = await (await import('/storage.js')).openStore()
      return new Promise((resolve, reject) => {
        const request = db.transaction('metadata', 'readonly').objectStore('metadata').get(`cloud-work:${id}`)
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
      })
    }, id)
  }
  const beforeDownload = await download(first, 'before-interruption-vs.bin')
  return { first, record, download, snapshot, storedWork, beforeDownload }
}

export async function cloudPendingRecovery({ page, connect, idle, fixture, out, failManifest, errors }) {
  const { first, record, download, snapshot, storedWork, beforeDownload } = await cloudWorkspace({ page, idle, out }), origin = first.url()
  await connect(first); await first.locator('#cloud-create-root').click(); await idle(first)
  const rootId = await first.locator('#cloud-root').inputValue(); assert(rootId)
  await first.locator('#cloud-preview-practice').click(); await idle(first)
  for (const role of ['老師原片', '自己原片']) await first.locator('#cloud-local-assets label').filter({ hasText: role }).getByRole('checkbox').check()
  await first.locator('#cloud-save-confirm').check()
  const before = await snapshot(first)
  assert.equal(before.library.data.takes.length, 1); assert.equal(before.library.data.recipes.length, 1); assert.equal(before.library.data.exports.length, 1)
  const vs = before.library.data.exports[0].assetId
  assert.deepEqual(before.media.find(row => row.id === vs), { id: vs, bytes: beforeDownload.bytes, sha256: beforeDownload.sha256 })
  assert(before.sources.every(row => !row.revoked))
  for (const [index, file] of ['reference.webm', 'self.webm'].entries()) assert.equal(before.sources[index].sha256, createHash('sha256').update(readFileSync(resolve(out, file))).digest('hex'))
  record('before-interruption', before)
  failManifest()
  await first.locator('#cloud-save-practice').click(); await idle(first)
  const failureStatus = await first.locator('#cloud-status').innerText(), afterFailure = await snapshot(first)
  record('after-interruption', { failureStatus, snapshot: afterFailure, remoteIds: [...fixture.files.keys()] })
  assert.match(failureStatus, /雲端操作未完成，原工作可重試。/)
  assert.deepEqual(afterFailure, before, '保存中斷改掉本機資料、原片或舊VS')
  const interrupted = await first.evaluate(async () => {
    const prefix = 'dance-stamp-cloud-job:', keys = Object.keys(localStorage).filter(key => key.startsWith(prefix))
    if (keys.length !== 1) throw new Error('沒有唯一待傳工作')
    const key = keys[0], id = key.slice(key.lastIndexOf(':') + 1)
    return { key, id, summary: JSON.parse(localStorage.getItem(key)!) }
  })
  interrupted.work = await storedWork(first, interrupted.id)
  record('interrupted-work', interrupted)
  assert.equal(interrupted.summary.state, 'pending'); assert.equal(interrupted.id, interrupted.work.operation)
  const work = interrupted.work, remoteMedia = work.jobs.map(job => job.id).sort()
  assert.equal(remoteMedia.length, 2)
  assert.deepEqual([...fixture.files.values()].filter(file => file.appProperties.dsKind === 'snapshot-media-v1').map(file => file.id).sort(), remoteMedia)
  assert.equal(fixture.files.has(work.manifest.id), false, '中斷前不應交付完整快照')
  await first.locator('#cloud-close').click()
  const afterDownload = await download(first, 'after-interruption-vs.bin')
  assert.equal(afterDownload.bytes, beforeDownload.bytes); assert.equal(afterDownload.sha256, beforeDownload.sha256)
  const context = first.context(); await first.close()
  const fresh = await context.newPage(); fresh.setDefaultTimeout(15000); fresh.on('pageerror', error => errors.push(error.message))
  await fresh.goto(origin); await fresh.waitForFunction(() => !document.getElementById('select-video')?.matches(':disabled'))
  const saved = await snapshot(fresh, false)
  record('new-page-baseline', saved)
  assert.deepEqual(saved.library, before.library); assert.deepEqual(saved.media, before.media)
  assert.equal(await fresh.locator('#reference').getAttribute('src'), null, '新頁不應沿用舊session來源')
  assert.equal(await fresh.locator('#self').getAttribute('src'), null)
  await connect(fresh); await fresh.locator('#cloud-roots').click(); await idle(fresh)
  await fresh.locator('#cloud-root').selectOption(rootId)
  await fresh.locator('summary').filter({ hasText: '中斷工作的恢復' }).click()
  await fresh.locator('#cloud-list-jobs').click()
  assert.equal(await fresh.locator('#cloud-jobs option').count(), 1)
  await fresh.locator('#cloud-jobs').selectOption(interrupted.id)
  assert.match(await fresh.locator('#cloud-jobs').innerText(), /待傳/)
  const beforeWrong = [...fixture.files.keys()].sort(), wrongWrites = fixture.calls.filter(call => call.init.method === 'POST' && call.url.pathname.startsWith('/upload')).length
  // 兩側都提供且維持同名／大小／MIME，只改一 byte，排除缺片或格式不同也會拒絕的混淆。
  const changed = Buffer.from(readFileSync(resolve(out, 'reference.webm'))); changed[changed.length - 1] ^= 1
  await fresh.locator('#cloud-retry-files').setInputFiles([
    { name: 'reference.webm', mimeType: 'video/webm', buffer: changed },
    { name: 'self.webm', mimeType: 'video/webm', buffer: readFileSync(resolve(out, 'self.webm')) },
  ])
  await fresh.locator('#cloud-retry-job').click(); await idle(fresh)
  assert.match(await fresh.locator('#cloud-status').innerText(), /來源已失效|相同原片/)
  assert.deepEqual([...fixture.files.keys()].sort(), beforeWrong)
  assert.equal(fixture.calls.filter(call => call.init.method === 'POST' && call.url.pathname.startsWith('/upload')).length, wrongWrites)
  assert.deepEqual(await snapshot(fresh, false), saved)
  await fresh.locator('#cloud-retry-files').setInputFiles([resolve(out, 'reference.webm'), resolve(out, 'self.webm')])
  await fresh.locator('#cloud-retry-job').click(); await idle(fresh)
  assert.match(await fresh.locator('#cloud-status').innerText(), /沒有建立重複快照/)
  const expectedIds = [...remoteMedia, work.manifest.id].sort()
  assert.deepEqual([...fixture.files.values()].filter(file => file.appProperties.dsKind !== 'private-root-v1').map(file => file.id).sort(), expectedIds)
  const envelope = JSON.parse(await fixture.bytes.get(work.manifest.id).text())
  assert.equal(envelope.dataset, work.envelope.dataset); assert.equal(envelope.snapshot, work.envelope.snapshot)
  assert.deepEqual(envelope.media.map(media => media.fileId), work.envelope.media.map(media => media.fileId))
  const retried = await fresh.evaluate(async ({ key, id }) => ({ summary: JSON.parse(localStorage.getItem(key)!) }), interrupted)
  retried.work = await storedWork(fresh, interrupted.id)
  record('completed-work', { retried, envelope, remoteIds: [...fixture.files.keys()] })
  assert.equal(retried.summary.state, 'saved'); assert.deepEqual(retried.work, work)
  const accepted = [...fixture.files.keys()].sort(), writes = fixture.calls.filter(call => call.init.method === 'POST' && call.url.pathname.startsWith('/upload')).length
  await fresh.locator('#cloud-retry-job').click(); await idle(fresh)
  assert.match(await fresh.locator('#cloud-status').innerText(), /沒有建立重複快照/)
  assert.deepEqual([...fixture.files.keys()].sort(), accepted)
  assert.equal(fixture.calls.filter(call => call.init.method === 'POST' && call.url.pathname.startsWith('/upload')).length, writes)
  assert.deepEqual((await snapshot(fresh, false)).library, saved.library); assert.deepEqual((await snapshot(fresh, false)).media, saved.media)
  return { sameWorkAfterNewPage: true, wrongFileRejected: true, sameDatasetAndRemoteIds: true, idempotentRetryWithoutNewUpload: true, localDataAndOriginalsPreserved: true, completedRemoteMedia: remoteMedia.length, snapshots: 1, downloads: [beforeDownload, afterDownload] }
}
