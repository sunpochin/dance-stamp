/* 檔案用途：驗證選定快照、資料保全、內容核對與重匯映射。所在層：合成邏輯回歸。主要關聯：cloud-snapshot.js、library.js。 */
import { expect, test } from 'bun:test'
import { newLibrary, planBackupImport, tables } from '../../web/library.js'
import { selectedPractice, prepareSnapshot, saveSnapshot, listSnapshots, validateSnapshot, snapshotBranches } from '../../web/cloud-snapshot.js'
import { cloudDriveFixture, cloudToken } from '../fixtures/cloud-drive'
function practice() {
  const data = newLibrary(), video = crypto.randomUUID(), take = crypto.randomUUID(), reference = crypto.randomUUID(), self = crypto.randomUUID(), recipe = crypto.randomUUID(), files = new Map<string, Blob>()
  data.videos.push({ id: video, title: '合成練習', durationMs: 1000, revision: 1 }, { id: crypto.randomUUID(), title: '不應傳送的其他練習', durationMs: 1000, revision: 1 })
  for (const [id, kind] of [[reference, 'reference'], [self, 'take']]) { const blob = new Blob([`synthetic ${kind}`], { type: 'video/webm' }); files.set(id, blob); data.assets.push({ id, kind, ...(kind === 'reference' && { videoId: video }), byteLength: blob.size, mimeType: blob.type, durationMs: 1000 }) }
  data.takes.push({ id: take, referenceVideoId: video, cameraAssetId: self, referenceStartMs: 0, referenceEndMs: 1000, rate: 1, state: 'ready', createdAt: '2026-11-02T00:00:00Z' })
  data.recipes.push({ id: recipe, takeId: take, offsetMs: 0, referenceMirror: false, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
  data.markers.push({ id: crypto.randomUUID(), videoId: video, startMs: 0, title: '合成標記', note: '私人正文', revision: 1 })
  return { data, video, take, files }
}
test('只帶選定練習；筆記與影片逐項選擇，缺片不能冒充已保存', async () => {
  const p = practice(), f = cloudDriveFixture()
  try {
    const selected = selectedPractice(p.data, p.video, p.take, false)
    expect(selected.videos).toHaveLength(1); expect(selected.markers).toHaveLength(0); expect(p.data.videos).toHaveLength(2)
    await f.drive.authorize(cloudToken()); const root = await f.drive.createRoot()
    const work = await prepareSnapshot(f.drive, selected, new Set(), p.files, { root: root.id })
    expect(work.jobs).toHaveLength(0); expect(work.envelope.media.every(m => m.fileId === null)).toBe(true)
    await saveSnapshot(f.drive, work, id => p.files.get(id))
    expect((await listSnapshots(f.drive, root.id))).toHaveLength(1)
    const bad = structuredClone(work.envelope); bad.media[0].role = 'vs'
    expect(() => validateSnapshot(JSON.stringify(bad))).toThrow('關聯')
    await expect(prepareSnapshot(f.drive, selected, new Set([...p.files.keys()]), new Map(), { root: root.id })).rejects.toThrow('失效')
  } finally { f.drive.disconnect() }
})
test('媒體全部核對才新增完整 manifest；失敗和重試保留舊完整版本', async () => {
  const p = practice(), f = cloudDriveFixture()
  try {
    await f.drive.authorize(cloudToken()); const root = await f.drive.createRoot(), data = selectedPractice(p.data, p.video, p.take, true)
    const first = await prepareSnapshot(f.drive, data, new Set(p.files.keys()), p.files, { root: root.id })
    await saveSnapshot(f.drive, first, id => p.files.get(id))
    expect((await listSnapshots(f.drive, root.id))[0].data.markers[0].note).toBe('私人正文')
    const second = await prepareSnapshot(f.drive, data, new Set(p.files.keys()), p.files, { root: root.id, dataset: first.envelope.dataset, parent: first.envelope.snapshot })
    f.deny('snapshot-media-v1'); await expect(saveSnapshot(f.drive, second, id => p.files.get(id))).rejects.toThrow('權限')
    expect((await listSnapshots(f.drive, root.id))).toHaveLength(1)
    f.deny(''); await saveSnapshot(f.drive, second, id => p.files.get(id)); await saveSnapshot(f.drive, second, id => p.files.get(id))
    expect((await listSnapshots(f.drive, root.id))).toHaveLength(2)
    expect([...f.files.values()].filter(v => v.appProperties.dsKind === 'snapshot-v1')).toHaveLength(2)
  } finally { f.drive.disconnect() }
})
test('雙裝置的同父快照都保留；不以時鐘選勝負', () => {
  const versions = [{ snapshot: 'a', parent: null }, { snapshot: 'b', parent: 'a' }, { snapshot: 'c', parent: 'a' }]
  expect(snapshotBranches(versions).map(v => v.snapshot)).toEqual(['b', 'c'])
})
test('跨來源與衝突副本回傳完整映射；另一裝置修改後反向沿原資料集保存', async () => {
  const p = practice(), source = selectedPractice(p.data, p.video, p.take, true), receiver = practice().data
  const plan = await planBackupImport(receiver, source), video = plan.mapping.videos[p.video], take = plan.mapping.takes[p.take]
  expect(video).not.toBe(p.video); expect(take).not.toBe(p.take)
  const binding = { sourceLibraryId: source.sourceLibraryId, mapping: plan.mapping }
  const recipe = plan.data.recipes.find(r => r.id === plan.mapping.recipes[source.recipes[0].id])!
  recipe.offsetMs = 10; recipe.revision++
  const returned = selectedPractice(plan.data, video, take, true, binding)
  expect(returned.sourceLibraryId).toBe(source.sourceLibraryId); expect(returned.takes[0].id).toBe(p.take); expect(returned.recipes[0].offsetMs).toBe(10)
  const conflicts = await planBackupImport(p.data, returned)
  expect(conflicts.conflicts.length).toBeGreaterThan(0); expect(conflicts.mapping.takes[p.take]).not.toBe(p.take)
  for (const table of tables) expect(conflicts.data[table].slice(0, p.data[table].length)).toEqual(p.data[table])
  expect((await planBackupImport(conflicts.data, returned)).added).toBe(0)
})
test('帳號切換、取消、損壞快照與未知版本不套用資料', async () => {
  const p = practice(), f = cloudDriveFixture()
  try {
    await f.drive.authorize(cloudToken()); const root = await f.drive.createRoot(), work = await prepareSnapshot(f.drive, selectedPractice(p.data, p.video, p.take, true), new Set(), p.files, { root: root.id })
    const bad = structuredClone(work.envelope); bad.version = 2
    expect(() => validateSnapshot(JSON.stringify(bad))).toThrow('版本')
    const controller = new AbortController(); controller.abort()
    await expect(saveSnapshot(f.drive, work, id => p.files.get(id), controller.signal)).rejects.toThrow()
    expect([...f.files.values()].filter(v => v.appProperties.dsKind === 'snapshot-v1')).toHaveLength(0)
    await saveSnapshot(f.drive, work, id => p.files.get(id)); f.corrupt()
    await expect(listSnapshots(f.drive, root.id)).rejects.toThrow('校驗')
    await f.drive.authorize(cloudToken('owner-b')); await expect(saveSnapshot(f.drive, work, id => p.files.get(id))).rejects.toThrow('帳號')
  } finally { f.drive.disconnect() }
})
