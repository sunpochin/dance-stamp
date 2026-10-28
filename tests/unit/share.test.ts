/* 檔案用途：驗證分享最小子集、逐欄隱私與匯入身分隔離。所在層：純資料驗收。主要關聯：library.js、DATA_FORMAT.md。 */
import { expect, test } from 'bun:test'
import { newLibrary, createShare, mergeBackup, validateBackup, parseBackup, planBackupImport } from '../../web/library.js'
function sample() {
  const data = newLibrary(), videoId = crypto.randomUUID(), selfId = crypto.randomUUID(), takeId = crypto.randomUUID(), recipeId = crypto.randomUUID(), vsId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成課程', durationMs: 8000, revision: 1, teacher: '合成老師', recordedDate: '2026-10-01', danceStyle: 'Salsa' })
  data.assets.push({ id: crypto.randomUUID(), videoId, kind: 'reference', byteLength: 10, mimeType: 'video/mp4', durationMs: 8000, originalName: 'synthetic-reference.mp4' }, { id: selfId, kind: 'take', byteLength: 20, mimeType: 'video/mp4' }, { id: vsId, kind: 'vs', byteLength: 30, mimeType: 'video/mp4' })
  for (const note of ['合成私密正文', '另一段未選正文']) data.markers.push({ id: crypto.randomUUID(), videoId, startMs: 1000, endMs: 3000, title: note === '合成私密正文' ? '八拍' : '未選片段', note, revision: 1 })
  data.takes.push({ id: takeId, referenceVideoId: videoId, cameraAssetId: selfId, referenceStartMs: 1000, referenceEndMs: 3000, rate: 1, state: 'ready', createdAt: '2026-10-02T00:00:00Z', captureTiming: { recorderRequestedMs: 123 } })
  data.recipes.push({ id: recipeId, takeId, offsetMs: 500, referenceMirror: true, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
  data.exports.push({ id: crypto.randomUUID(), recipeId, recipeRevision: 1, assetId: vsId, mimeType: 'video/mp4', state: 'ready', createdAt: '2026-10-02T00:00:03Z' })
  return data
}
const selection = data => ({ videoIds: [], markerIds: [data.markers[0].id], takeIds: [], exportIds: [], fields: [] })
test('分享逐欄建立最小閉包，預設排除私人欄位與未選內容', () => {
  const local = sample(), before = structuredClone(local)
  for (const table of ['videos', 'assets', 'markers', 'takes', 'recipes', 'exports']) for (const row of local[table]) Object.assign(row, { futurePrivate: 'synthetic-private', deviceHandle: { path: 'synthetic-path' }, bpmPrivate: 123 })
  const result = createShare(local, selection(local)), json = JSON.stringify(result)
  expect(() => mergeBackup(newLibrary(), result)).toThrow('重建 ID'); expect(result.kind).toBe('share'); expect(result.videos).toHaveLength(1); expect(result.markers).toHaveLength(1)
  expect(result.assets).toHaveLength(1); expect(result.assets[0].kind).toBe('reference')
  expect(result.takes).toHaveLength(0); expect(result.recipes).toHaveLength(0); expect(result.exports).toHaveLength(0)
  for (const hidden of ['合成私密正文', '未選正文', '未選片段', '合成老師', '2026-10-01', 'synthetic-reference', 'futurePrivate', 'deviceHandle', 'synthetic-path', 'bpmPrivate', 'captureTiming']) expect(json).not.toContain(hidden)
  expect(result.markers[0].note).toBe(''); expect(result.assets[0].mediaIncluded).toBe(false)
  expect(local.markers[0].note).toBe(before.markers[0].note)
})
test('明確勾選私密欄位才帶出，備份還原不遺失，未知欄位仍排除', () => {
  const local = sample(), selected = selection(local)
  selected.fields = ['note', 'teacher', 'danceStyle', 'recordedDate', 'originalName', 'futurePrivate']
  const result = parseBackup(JSON.stringify(createShare(local, selected)))
  expect(result.markers[0].note).toBe(local.markers[0].note)
  expect(result.videos[0].teacher).toBe('合成老師'); expect(result.videos[0].recordedDate).toBe('2026-10-01')
  expect(result.assets[0].originalName).toBe('synthetic-reference.mp4')
  expect(validateBackup({ ...result, kind: 'backup' }).videos).toEqual(result.videos)
  expect(JSON.stringify(result)).not.toContain('futurePrivate')
})
test('選 VS 只補足該 take、配方與原片描述；不帶錄影觀測或建立日期', () => {
  const local = sample(), selected = selection(local); selected.exportIds = [local.exports[0].id]
  const result = createShare(local, selected)
  expect(result.takes).toHaveLength(1); expect(result.recipes).toHaveLength(1); expect(result.exports).toHaveLength(1); expect(result.assets).toHaveLength(3)
  expect(result.takes[0]).not.toHaveProperty('captureTiming')
  expect(result.takes[0].createdAt).toBe('1970-01-01T00:00:00.000Z')
  expect(result.recipes[0].offsetMs).toBe(500); expect(result.recipes[0].referenceMirror).toBe(true)
  expect(result.recipes[0].takeId).toBe(result.takes[0].id)
  expect(result.takes[0].referenceVideoId).toBe(result.videos[0].id)
  expect(JSON.stringify(result)).not.toContain('2026-10-02')
})
test('分享在空庫、同來源與不同來源均重建 ID，重匯及完整備份恢復後冪等', async () => {
  const local = sample(), selected = selection(local); selected.exportIds = [local.exports[0].id]
  const shared = createShare(local, selected)
  for (const target of [newLibrary(), local, sample()]) {
    const before = structuredClone(target), plan = await planBackupImport(target, shared), video = plan.data.videos.at(-1)!, take = plan.data.takes.at(-1)!, recipe = plan.data.recipes.at(-1)!
    expect(plan.data.sourceLibraryId).toBe(target.sourceLibraryId); expect(plan.data.kind).toBe('backup')
    expect(video.id).not.toBe(local.videos[0].id); expect(take.referenceVideoId).toBe(video.id); expect(recipe.takeId).toBe(take.id)
    expect(target).toEqual(before)
    expect((await planBackupImport(plan.data, shared)).added).toBe(0)
    const restored = await planBackupImport(newLibrary(), validateBackup(plan.data))
    expect((await planBackupImport(restored.data, shared)).added).toBe(0)
    const changed = structuredClone(shared); changed.markers[0].title = '合成新版本'
    const conflict = await planBackupImport(plan.data, changed)
    expect(conflict.conflicts).toHaveLength(1); expect(conflict.data.markers).toHaveLength(plan.data.markers.length + 1)
    expect((await planBackupImport(conflict.data, changed)).added).toBe(0)
  }
})
test('不同選取子集的共同片段仍冪等，錯誤選取／版本／關聯／超限與取消不修改資料', async () => {
  const local = sample(), selected = selection(local), before = structuredClone(local), shared = createShare(local, selected)
  selected.markerIds.push(local.markers[1].id)
  const first = await planBackupImport(newLibrary(), shared), expanded = await planBackupImport(first.data, createShare(local, selected))
  expect(expanded.additions.markers).toBe(1); expect(expanded.additions.videos).toBe(0)
  expect(() => createShare(local, { ...selected, markerIds: [crypto.randomUUID()] })).toThrow()
  expect(() => createShare(local, { ...selection(local), markerIds: [] })).toThrow()
  for (const bad of [{ ...shared, schemaVersion: 99 }, { ...shared, videos: [] }, { ...shared, markers: [{ ...shared.markers[0], note: 'x'.repeat(20001) }] }]) await expect(planBackupImport(local, bad)).rejects.toThrow()
  const controller = new AbortController(); controller.abort(); await expect(planBackupImport(local, shared, controller.signal)).rejects.toThrow()
  expect(local).toEqual(before)
})

test('動作庫的分享仍不帶動作，v1 合法分類升 v2 並保持跨版本重匯冪等', async () => {
  const local = sample(), moveId = crypto.randomUUID()
  local.moves.push({ id: moveId, name: '合成私人動作', danceStyle: 'Salsa', status: 'wanted', revision: 1 })
  local.markers[0].moveId = moveId
  const selected = selection(local); selected.fields = ['teacher', 'danceStyle', 'recordedDate', 'originalName']
  const shared = createShare(local, selected)
  expect(shared.schemaVersion).toBe(2); expect(shared.moves).toEqual([])
  expect(shared.markers[0]).not.toHaveProperty('moveId')
  expect(JSON.stringify(shared)).not.toContain('合成私人動作')
  const legacy = { ...structuredClone(shared), schemaVersion: 1 }, before = JSON.stringify(legacy)
  const normalized = validateBackup(legacy)
  expect(normalized.videos).toEqual(shared.videos); expect(normalized.assets).toEqual(shared.assets)
  expect(normalized.schemaVersion).toBe(2); expect(JSON.stringify(legacy)).toBe(before)
  const target = sample(), targetBefore = structuredClone(target), imported = await planBackupImport(target, legacy)
  expect(imported.data.moves).toEqual(target.moves)
  expect((await planBackupImport(imported.data, shared)).added).toBe(0)
  expect(target).toEqual(targetBefore)
})
