/* 檔案用途：驗證衝突副本、跨來源隔離與完整關聯。所在層：備份純資料驗收。主要關聯：web/library.js、DATA_FORMAT.md。 */
import { expect, test } from 'bun:test'
import { normalizedVideo, extension } from '../../web/recorder.js'
import { newLibrary, planBackupImport, validateBackup, mediaInventory, videoLabels } from '../../web/library.js'
function graph() {
  const data = newLibrary(), videoId = crypto.randomUUID(), referenceId = crypto.randomUUID(), selfId = crypto.randomUUID(), vsId = crypto.randomUUID(), takeId = crypto.randomUUID(), recipeId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成課程', durationMs: 90000, revision: 1 })
  data.assets.push({ id: referenceId, videoId, kind: 'reference', byteLength: 100, mimeType: 'video/mp4', durationMs: 90000, state: 'ready', storageKind: 'indexeddb' }, { id: selfId, kind: 'take', byteLength: 200, mimeType: 'video/mp4', durationMs: 70000 }, { id: vsId, kind: 'vs', byteLength: 300, mimeType: 'video/mp4', durationMs: 20000 })
  data.markers.push({ id: crypto.randomUUID(), videoId, startMs: 12000, title: '合成八拍', note: '<img src=x onerror=alert(1)>', revision: 1 })
  data.takes.push({ id: takeId, referenceVideoId: videoId, cameraAssetId: selfId, referenceStartMs: 12000, referenceEndMs: 32000, rate: 1, state: 'ready', createdAt: '2026-10-28T00:00:00Z' })
  data.recipes.push({ id: recipeId, takeId, offsetMs: 4000, referenceMirror: true, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
  data.exports.push({ id: crypto.randomUUID(), recipeId, recipeRevision: 1, assetId: vsId, mimeType: 'video/mp4', state: 'ready', createdAt: '2026-10-28T00:00:01Z' })
  return data
}
test('空資料集還原保留 v1 身分與缺片狀態；原庫及重匯均不覆寫', async () => {
  const data = graph(), incoming = validateBackup(data), initial = await planBackupImport(newLibrary(), incoming)
  expect(initial.data.sourceLibraryId).toBe(data.sourceLibraryId)
  expect(initial.data.takes).toEqual(data.takes)
  expect(initial.data.assets.every(a => a.state === 'missing')).toBe(true)
  const repeated = await planBackupImport(data, incoming)
  expect(repeated.added).toBe(0)
  expect(repeated.data.assets[0].state).toBe('ready')
  expect(repeated.data.recipes).toEqual(data.recipes)
})
test('影片衝突重寫完整下游；新 VS 不擅自沿用本機舊輸出', async () => {
  const local = graph(), before = structuredClone(local), incoming = validateBackup(local)
  incoming.videos[0].title = '備份另一版本'
  const plan = await planBackupImport(local, incoming), copiedVideo = plan.data.videos[1], copiedTake = plan.data.takes[1], copiedRecipe = plan.data.recipes[1], copiedExport = plan.data.exports[1]
  expect(plan.conflicts).toHaveLength(1)
  expect(copiedVideo.id).not.toBe(local.videos[0].id)
  expect(copiedVideo.id[14]).toBe('8')
  expect(copiedTake.referenceVideoId).toBe(copiedVideo.id)
  expect(copiedTake.cameraAssetId).toBe(local.takes[0].cameraAssetId)
  expect(copiedRecipe.takeId).toBe(copiedTake.id)
  expect(copiedExport.recipeId).toBe(copiedRecipe.id)
  expect(copiedExport.assetId).not.toBe(local.exports[0].assetId)
  expect(plan.data.markers[1].videoId).toBe(copiedVideo.id)
  expect(plan.data.assets.find(a => a.id === copiedExport.assetId)?.state).toBe('missing')
  expect(local).toEqual(before)
  expect(plan.data.videos[0]).toEqual(before.videos[0])
  expect(plan.data.takes[0]).toEqual(before.takes[0])
  incoming.exportedAt = '2026-10-28T10:00:00Z'; incoming.assets.reverse()
  expect((await planBackupImport(plan.data, incoming)).added).toBe(0)
})
test('衝突配方有獨立 take 可開啟；其他新增筆記不讓舊副本重複', async () => {
  const local = graph(), incoming = validateBackup(local)
  incoming.recipes[0].offsetMs = 4050; incoming.recipes[0].revision++
  const first = await planBackupImport(local, incoming)
  expect(first.additions.videos).toBe(0)
  expect(first.additions.takes).toBe(1)
  expect(first.additions.recipes).toBe(1)
  expect(first.additions.exports).toBe(1)
  expect(first.additions.assets).toBe(1)
  expect(first.data.recipes[1].offsetMs).toBe(4050)
  expect(first.data.recipes.find(r => r.takeId === first.data.takes[1].id)?.offsetMs).toBe(4050)
  expect(first.data.recipes.find(r => r.takeId === local.takes[0].id)?.offsetMs).toBe(4000)
  incoming.videos.push({ id: crypto.randomUUID(), title: '另一合成課程', durationMs: 1000, revision: 1 })
  const next = await planBackupImport(first.data, incoming)
  expect(next.added).toBe(1)
  expect(next.additions.recipes).toBe(0)
})
test('同一 take 的不同備份校正各有可開啟的副本；重匯仍冪等', async () => {
  const local = graph(), first = validateBackup(local), second = validateBackup(local)
  first.recipes[0].offsetMs = 4050; first.recipes[0].revision++
  second.recipes[0].offsetMs = 4100; second.recipes[0].revision++
  const one = await planBackupImport(local, first), two = await planBackupImport(one.data, second)
  expect(two.data.takes).toHaveLength(3)
  expect(two.data.takes.map(t => two.data.recipes.find(r => r.takeId === t.id)?.offsetMs)).toEqual([4000, 4050, 4100])
  expect((await planBackupImport(two.data, first)).added).toBe(0)
  expect((await planBackupImport(two.data, second)).added).toBe(0)
})
test('已編輯的配方副本保留在原 take；再次匯入不增加不可選的第二配方', async () => {
  const local = graph(), incoming = validateBackup(local)
  incoming.recipes[0].offsetMs = 4050; incoming.recipes[0].revision++
  const first = await planBackupImport(local, incoming), edited = first.data.recipes[1]
  edited.offsetMs = 4075; edited.revision++
  const second = await planBackupImport(first.data, incoming)
  expect(second.data.takes).toHaveLength(3)
  expect(second.data.takes.map(t => second.data.recipes.filter(r => r.takeId === t.id).length)).toEqual([1, 1, 1])
  expect(second.data.takes.map(t => second.data.recipes.find(r => r.takeId === t.id)?.offsetMs)).toEqual([4000, 4075, 4050])
  expect((await planBackupImport(second.data, incoming)).added).toBe(0)
})
test('示範檔衝突分開影片；後續來源版本不錯連舊副本或 VS', async () => {
  const local = graph(), incoming = validateBackup(local)
  incoming.assets[0].byteLength++
  const first = await planBackupImport(local, incoming), firstVideo = first.data.videos[1].id
  incoming.assets[0].byteLength++
  const second = await planBackupImport(first.data, incoming), secondVideo = second.data.videos[2].id
  expect(firstVideo).not.toBe(secondVideo)
  for (const videoId of [firstVideo, secondVideo]) expect(second.data.assets.filter(a => a.kind === 'reference' && a.videoId === videoId)).toHaveLength(1)
  expect(second.data.exports[1].assetId).not.toBe(second.data.exports[2].assetId)
  expect((await planBackupImport(second.data, incoming)).added).toBe(0)
})
test('不同來源建立隔離 ID；經另一個空環境還原後仍重匯冪等', async () => {
  const local = graph(), incoming = validateBackup(local); incoming.sourceLibraryId = crypto.randomUUID()
  const foreign = await planBackupImport(local, incoming)
  expect(foreign.differentSource).toBe(true)
  expect(foreign.conflicts).toHaveLength(0)
  expect(foreign.data.takes[1].referenceVideoId).toBe(foreign.data.videos[1].id)
  expect(foreign.data.takes[1].cameraAssetId).not.toBe(local.takes[0].cameraAssetId)
  expect((await planBackupImport(foreign.data, incoming)).added).toBe(0)
  const restored = await planBackupImport(newLibrary(), validateBackup(foreign.data))
  expect((await planBackupImport(restored.data, incoming)).added).toBe(0)
})
test('已編輯的副本也保留；再匯原備份新增穩定副本而非覆寫', async () => {
  const local = graph(), incoming = validateBackup(local); incoming.markers[0].note = '備份版本'
  const first = await planBackupImport(local, incoming), edited = first.data.markers[1]
  edited.note = '副本後續編輯'; edited.revision++
  const next = await planBackupImport(first.data, incoming)
  expect(next.data.markers.find(m => m.id === edited.id)?.note).toBe('副本後續編輯')
  expect(next.data.markers).toHaveLength(3)
  expect((await planBackupImport(next.data, incoming)).added).toBe(0)
})
test('typed 關聯分開相同 UUID；未知欄位不影響副本身分', async () => {
  const local = graph(), incoming = validateBackup(local); incoming.sourceLibraryId = crypto.randomUUID()
  const self = incoming.assets.find(a => a.kind === 'take')!; self.id = incoming.videos[0].id; incoming.takes[0].cameraAssetId = self.id
  const first = await planBackupImport(local, incoming)
  expect(first.data.takes[1].cameraAssetId).not.toBe(first.data.takes[1].referenceVideoId)
  Object.assign(incoming.assets[0], { objectURL: 'blob:synthetic-only', deviceId: 'synthetic-only' })
  expect((await planBackupImport(first.data, incoming)).added).toBe(0)
})
test('未來版本、孤兒、超限與取消都不改本機；不接管他頁錄影', async () => {
  const local = graph(), incoming = validateBackup(local), before = structuredClone(local)
  for (const change of [d => { d.schemaVersion = 99 }, d => { d.recipes[0].takeId = crypto.randomUUID() }, d => { d.markers[0].note = 'x'.repeat(20001) }]) {
    const bad = structuredClone(incoming); change(bad); await expect(planBackupImport(local, bad)).rejects.toThrow()
  }
  const controller = new AbortController(); incoming.sourceLibraryId = crypto.randomUUID()
  const pending = planBackupImport(local, incoming, controller.signal); controller.abort(); await expect(pending).rejects.toThrow()
  expect(local).toEqual(before)
  local.takes[0].state = 'recording'
  expect((await planBackupImport(local, validateBackup(local))).data.takes[0].state).toBe('recording')
})

test('媒體清單只認實際 key／確認 File，同名筆記可分辨但不改原文', () => {
  const data = graph(), another = { ...data.videos[0], id: crypto.randomUUID() }; data.videos.push(another)
  const labels = videoLabels(data.videos)
  expect(labels.get(data.videos[0].id)).toBe('合成課程（第1份）')
  expect(labels.get(another.id)).toBe('合成課程（第2份）')
  expect(data.videos.every(v => v.title === '合成課程')).toBe(true)
  data.takes[0].state = 'interrupted'
  const rows = mediaInventory(data, new Set([data.assets[2].id]), new Set([data.assets[1].id]))
  expect(rows.map(r => r.availability)).toEqual(['missing', 'session', 'stored'])
  expect(rows[1].interrupted).toBe(true)
  expect(rows[2].owner).toBe('合成課程（第1份）')
})

test('改名原片有界補正容器，原始 bytes 不變，空檔仍拒絕', async () => {
  const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0])
  const normalized = await normalizedVideo(new File([bytes], 'synthetic.data', { type: 'application/octet-stream' }))
  expect(normalized.type).toBe('video/mp4')
  expect(extension(normalized.type)).toBe('mp4')
  expect(new Uint8Array(await normalized.arrayBuffer())).toEqual(bytes)
  bytes.set([113, 116, 32, 32], 8)
  const mov = await normalizedVideo(new Blob([bytes]))
  expect(extension(mov.type)).toBe('mov')
  await expect(normalizedVideo(new Blob())).rejects.toThrow('空檔')
})
