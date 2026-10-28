/* 檔案用途：驗證動作分類、歷史、v1 升版與 v2 備份關聯。所在層：純資料回歸。主要關聯：library.js、DATA_FORMAT.md。 */
import { expect, test } from 'bun:test'
import { newLibrary, validateBackup, parseBackup, migrateLibrary, planBackupImport, planDeletion, searchLibrary, practiceHistory } from '../../web/library.js'
function sample() {
  const data = newLibrary(), moveId = crypto.randomUUID(), shared = crypto.randomUUID()
  data.moves.push({ id: moveId, name: '合成 Suzy Q', danceStyle: 'Salsa', status: 'wanted', revision: 1 })
  data.assets.push({ id: shared, kind: 'take', byteLength: 100, mimeType: 'video/mp4' })
  for (const [index, teacher] of ['老師甲', '老師乙'].entries()) {
    const videoId = crypto.randomUUID(), takeId = crypto.randomUUID()
    data.videos.push({ id: videoId, title: `合成課 ${index}`, teacher, danceStyle: 'Salsa', recordedDate: `2026-10-${20 + index}`, durationMs: 60000, revision: 1 })
    data.markers.push({ id: crypto.randomUUID(), videoId, moveId, startMs: 2000, endMs: 4000, title: '腳步片段', note: '重心先移 <img src=x>', revision: 1 })
    data.takes.push({ id: takeId, referenceVideoId: videoId, cameraAssetId: shared, referenceStartMs: 1000, referenceEndMs: 5000, rate: 1, state: 'ready', createdAt: `2026-10-${20 + index}T08:00:00Z` })
    data.recipes.push({ id: crypto.randomUUID(), takeId, offsetMs: index * 100, referenceMirror: false, selfMirror: true, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
  }
  return data
}
test('v1 在記憶體升版，不改原件、ID、狀態或時間；v2 保留分類與動作', () => {
  const legacy = newLibrary(); legacy.schemaVersion = 1
  legacy.videos.push({ id: crypto.randomUUID(), title: '舊筆記', durationMs: 15000, revision: 1 })
  const before = JSON.stringify(legacy), migrated = migrateLibrary(legacy)
  expect(migrated.schemaVersion).toBe(2)
  expect(JSON.stringify(legacy)).toBe(before)
  expect(migrated.videos).toEqual(legacy.videos)
  const data = sample(), restored = parseBackup(JSON.stringify(data))
  expect(restored).toEqual(validateBackup(data))
  expect(restored.moves).toEqual(data.moves)
  expect(restored.markers).toEqual(data.markers)
  expect(restored.videos).toEqual(data.videos)
})
test('拒絕未知狀態、孤兒 move、非法日期、重複與超長資料，白名單排除裝置欄位', () => {
  for (const change of [
    d => { d.moves[0].status = 'automatic' }, d => { d.moves[0].revision = 0 },
    d => { d.moves[0].name = ' ' }, d => { d.moves[0].danceStyle = 'x'.repeat(201) },
    d => { d.moves.push(d.moves[0]) }, d => { d.markers[0].moveId = crypto.randomUUID() },
    d => { d.videos[0].recordedDate = '2026-02-30' }, d => { d.videos[0].teacher = 2 },
    d => { d.schemaVersion = 1 }, d => { d.schemaVersion = 3 },
  ]) { const data = sample(); change(data); const before = JSON.stringify(data); expect(() => migrateLibrary(data)).toThrow(); expect(JSON.stringify(data)).toBe(before) }
  const data = sample(); Object.assign(data.moves[0], { path: '/synthetic', deviceId: 'synthetic' })
  expect(validateBackup(data).moves[0]).not.toHaveProperty('path')
})
test('離線純資料搜尋結合舞風、老師、日期、關鍵字與狀態，不串錯另一動作', () => {
  const data = sample()
  const result = searchLibrary(data, { keyword: 'ＳＵＺＹ 重心', danceStyle: 'salsa', teacher: '老師乙', from: '2026-10-21', to: '2026-10-21', status: 'wanted' })
  expect(result.videos.map(v => v.id)).toEqual([data.videos[1].id])
  expect(result.moves[0].markers.map(m => m.id)).toEqual([data.markers[1].id])
  expect(searchLibrary(data, { status: 'learned' }).moves).toHaveLength(0)
  expect(searchLibrary(data, { from: '2026-10-22' }).videos).toHaveLength(0)
  expect(searchLibrary(data, { keyword: '不存在' }).moves).toHaveLength(0)
  data.moves.push({ id: crypto.randomUUID(), name: '另一動作', danceStyle: 'Salsa', status: 'wanted', revision: 1 })
  data.markers.push({ ...data.markers[0], id: crypto.randomUUID(), moveId: data.moves[1].id, note: '不同筆記' })
  expect(searchLibrary(data, { keyword: 'Suzy' }).moves.map(x => x.move.id)).toEqual([data.moves[0].id])
  expect(searchLibrary(data, { keyword: '另一動作' }).moves[0].move.id).toBe(data.moves[1].id)
})
test('歷史按 take 時間排序、區間邊界不誤算、同 take 只列一次；刪動作保留共用媒體與原始資料', () => {
  const data = sample(), markers = [...data.markers, { ...data.markers[0], id: crypto.randomUUID() }]
  expect(practiceHistory(data, markers).map(t => t.id)).toEqual(data.takes.toReversed().map(t => t.id))
  expect(practiceHistory(data, [{ ...markers[0], startMs: 5000, endMs: undefined }])).toHaveLength(0)
  expect(practiceHistory(data, [{ ...markers[0], startMs: 0, endMs: 1000 }])).toHaveLength(0)
  const removed = planDeletion(data, 'move', data.moves[0].id)
  expect(removed.data.markers.every(m => m.moveId === undefined && m.revision === 2)).toBe(true)
  for (const table of ['videos', 'takes', 'recipes', 'assets']) expect(removed.data[table]).toEqual(data[table])
  expect(removed.mediaIds).toEqual([]); expect(removed.chunkIds).toEqual([])
  expect(data.markers[0].moveId).toBe(data.moves[0].id)
  expect(planDeletion(data, 'take', data.takes[0].id).data.assets).toEqual(data.assets)
})
test('動作衝突／外來來源重建多 marker 關聯，保留舊狀態、配方且重匯冪等', async () => {
  const local = sample(), incoming = structuredClone(local)
  incoming.moves[0].status = 'practicing'; incoming.moves[0].revision++
  const plan = await planBackupImport(local, incoming)
  expect(plan.data.moves).toHaveLength(2)
  expect(plan.data.moves[0].status).toBe('wanted')
  const copy = plan.data.moves.find(m => m.status === 'practicing')!
  expect(plan.data.markers.filter(m => m.moveId === copy.id)).toHaveLength(2)
  expect(plan.data.takes).toEqual(local.takes)
  expect((await planBackupImport(plan.data, incoming)).added).toBe(0)
  const foreign = newLibrary(); foreign.videos.push({ id: crypto.randomUUID(), title: '本機', durationMs: 15000, revision: 1 })
  const imported = await planBackupImport(foreign, incoming)
  expect(imported.data.moves[0].id).not.toBe(incoming.moves[0].id)
  expect(imported.data.markers.every(m => m.moveId === imported.data.moves[0].id)).toBe(true)
  expect((await planBackupImport(imported.data, incoming)).added).toBe(0)
  const fresh = await planBackupImport(newLibrary(), incoming)
  expect(fresh.data.moves).toEqual(incoming.moves)
})
