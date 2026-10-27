/* 檔案用途：驗證刪除關聯、共用媒體保留與容量誠實呈現。所在層：本機資料回歸。主要關聯：library.js、storage.js、offline.js。 */
import { expect, test } from 'bun:test'
import { newLibrary, planDeletion, validateBackup } from '../../web/library.js'
import { storageEstimateText } from '../../web/offline.js'
function graph() {
  const data = newLibrary(), videoId = crypto.randomUUID(), assetId = crypto.randomUUID(), takeId = crypto.randomUUID(), recipeId = crypto.randomUUID(), vsId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成刪除測試', durationMs: 20000, revision: 1 })
  data.assets.push({ id: crypto.randomUUID(), kind: 'reference', videoId, byteLength: 100, mimeType: 'video/mp4', state: 'ready' }, { id: assetId, kind: 'take', byteLength: 200, mimeType: 'video/mp4' }, { id: vsId, kind: 'vs', byteLength: 300, mimeType: 'video/mp4' })
  data.markers.push({ id: crypto.randomUUID(), videoId, startMs: 1000, title: '八拍', note: '合成文字', revision: 1 })
  data.takes.push({ id: takeId, referenceVideoId: videoId, cameraAssetId: assetId, referenceStartMs: 0, referenceEndMs: 15000, rate: 1, state: 'interrupted', createdAt: '2026-10-28T00:00:00Z' })
  data.recipes.push({ id: recipeId, takeId, offsetMs: 0, referenceMirror: false, selfMirror: true, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
  data.exports.push({ id: crypto.randomUUID(), recipeId, recipeRevision: 1, assetId: vsId, mimeType: 'video/mp4', state: 'ready', createdAt: '2026-10-28T00:00:01Z' })
  return data
}
test('移除副本只改本機狀態，不改可攜描述、關聯與中斷狀態；來源 take 要鎖定', () => {
  const data = graph(), before = structuredClone(data), plan = planDeletion(data, 'copy', data.assets[0].id)
  expect(validateBackup(plan.data)).toEqual(validateBackup(data))
  expect(plan.data.assets[0].state).toBe('missing')
  expect(plan.mediaIds).toEqual([data.assets[0].id])
  expect(plan.takeIds).toEqual([])
  expect(plan.locks).toEqual([data.takes[0].id])
  expect(data).toEqual(before)
})
test('take 刪除包含下游與未共用的自己／VS，保留示範、標記及原輸入', () => {
  const data = graph(), before = structuredClone(data), plan = planDeletion(data, 'take', data.takes[0].id)
  expect(plan.data.takes).toEqual([]); expect(plan.data.recipes).toEqual([]); expect(plan.data.exports).toEqual([])
  expect(plan.data.markers).toEqual(data.markers); expect(plan.data.videos).toEqual(data.videos)
  expect(plan.data.assets).toEqual([data.assets[0]])
  expect(plan.mediaIds).toEqual(data.assets.slice(1).map(a => a.id)); expect(plan.takeIds).toEqual([data.takes[0].id])
  expect(plan.chunkIds).toEqual([data.takes[0].cameraAssetId]); expect(plan.chunkIds).not.toEqual(plan.takeIds)
  expect(data).toEqual(before)
})
test('多 take 共用原片、不同輸出共用 VS 都不得刪除仍被使用的 asset', () => {
  const data = graph(), second = { ...data.takes[0], id: crypto.randomUUID() }, recipe = { ...data.recipes[0], id: crypto.randomUUID(), takeId: second.id }
  data.takes.push(second); data.recipes.push(recipe)
  const artifact = { ...data.exports[0], id: crypto.randomUUID(), recipeId: recipe.id }; data.exports.push(artifact)
  const plan = planDeletion(data, 'take', data.takes[0].id)
  expect(plan.mediaIds).toEqual([]); expect(plan.data.assets).toEqual(data.assets)
  expect(plan.chunkIds).toEqual([])
  expect(plan.data.takes).toEqual([second]); expect(plan.data.exports).toEqual([artifact]); expect(plan.data.recipes).toEqual([recipe])
  const output = planDeletion(data, 'export', data.exports[0].id)
  expect(output.data.takes).toEqual(data.takes); expect(output.data.recipes).toEqual(data.recipes); expect(output.mediaIds).toEqual([])
})
test('只刪單一 VS 不改原片、take 或配方，最後一份輸出才刪媒體', () => {
  const data = graph(), plan = planDeletion(data, 'export', data.exports[0].id)
  expect(plan.data.exports).toEqual([]); expect(plan.data.takes).toEqual(data.takes); expect(plan.data.recipes).toEqual(data.recipes)
  expect(plan.mediaIds).toEqual([data.assets[2].id]); expect(plan.takeIds).toEqual([])
})
test('刪整份筆記保留另一份筆記及共用自己原片；回報完整計數', () => {
  const data = graph(), second = graph(), assetId = data.takes[0].cameraAssetId
  second.takes[0].cameraAssetId = assetId; second.assets = second.assets.filter(a => a.kind !== 'take')
  for (const table of ['videos', 'assets', 'markers', 'takes', 'recipes', 'exports'] as const) (data[table] as unknown[]).push(...second[table])
  const plan = planDeletion(data, 'video', data.videos[0].id)
  expect(plan.data.videos).toEqual(second.videos); expect(plan.data.takes).toEqual(second.takes)
  expect(plan.data.assets.some(a => a.id === assetId)).toBe(true)
  expect(plan.mediaIds).toEqual([data.assets[0].id, data.assets[2].id])
  expect(plan.counts).toEqual({ videos: 1, markers: 1, takes: 1, recipes: 1, exports: 1 })
})
test('未知 ID／種類與無效庫原子拒絕，無刪庫捷徑', () => {
  const data = graph(), before = structuredClone(data)
  expect(() => planDeletion(data, 'take', crypto.randomUUID())).toThrow()
  expect(() => planDeletion(data, 'unknown' as 'take', data.takes[0].id)).toThrow()
  expect(() => planDeletion({ ...data, schemaVersion: 99 }, 'video', data.videos[0].id)).toThrow()
  expect(data).toEqual(before)
})
test('容量缺失／非數值不冒充零；負剩餘截零且明示不保證寫入', () => {
  for (const value of [undefined, {}, { usage: 0 }, { usage: NaN, quota: 100 }, { usage: -1, quota: 100 }, { usage: 0, quota: 0 }]) expect(storageEstimateText(value)).toContain('未提供')
  expect(storageEstimateText({ usage: 1048576, quota: 2097152 })).toContain('已用 1.0 MiB／額度 2.0 MiB')
  expect(storageEstimateText({ usage: 3000000, quota: 1000000 })).toContain('可用 0.0 MiB')
  expect(storageEstimateText({ usage: 0, quota: 10 })).toContain('不是裝置剩餘空間或寫入保證')
})
