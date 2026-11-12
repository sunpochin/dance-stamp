/* 檔案用途：驗證本人選段、準備與回報的保存及信任邊界。所在層：純資料回歸。主要關聯：preparation.js、library.js、DATA_FORMAT.md。 */
import { expect, test } from 'bun:test'
import { newLibrary, validateBackup, migrateLibrary, planBackupImport, planDeletion, createShare } from '../../web/library.js'
import { preparationSteps, nextPreparation } from '../../web/preparation.js'
import { selectedPractice } from '../../web/cloud-snapshot.js'
function sample() {
  const data = newLibrary(), videoId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成示範', durationMs: 20000, revision: 1 })
  data.preparations.push({ id: crypto.randomUUID(), videoId, title: '合成動作', reason: '合成理由', targetStartMs: 2000, targetEndMs: 18000, starterStartMs: 5000, starterEndMs: 7000, rate: 0.75, mirror: false, context: '', place: '合成地點', step: 0, phase: 'planned', revision: 1, createdAt: '2026-11-05T00:00:00Z' })
  return data
}
test('v1/v2 舊備份升 v3，不改原件與媒體；未知版本或省略新版表拒絕', () => {
  for (const schemaVersion of [1, 2]) {
    const legacy = sample(); legacy.schemaVersion = schemaVersion; delete (legacy as any).preparations
    const before = JSON.stringify(legacy), result = migrateLibrary(legacy)
    expect(result.schemaVersion).toBe(3); expect(result.preparations).toEqual([]); expect(result.videos).toEqual(legacy.videos); expect(JSON.stringify(legacy)).toBe(before)
  }
  const bad = sample(); delete (bad as any).preparations; expect(() => validateBackup(bad)).toThrow()
  const downgraded = sample(); downgraded.schemaVersion = 2; expect(() => validateBackup(downgraded)).toThrow()
  for (const value of ['', {}, null]) { const malformed = newLibrary(); malformed.schemaVersion = 2; (malformed as any).preparations = value; expect(() => validateBackup(malformed)).toThrow() }
})
test('兩份選段獨立，8 拍不由秒數推算；非法、超界、孤兒與超長資料全部拒絕', () => {
  const data = sample(), before = structuredClone(data)
  expect(validateBackup(data).preparations).toEqual(data.preparations)
  for (const change of [
    p => { p.targetStartMs = -1 }, p => { p.targetEndMs = 21000 }, p => { p.starterStartMs = 1000 }, p => { p.starterEndMs = 19000 }, p => { p.starterEndMs = p.starterStartMs },
    p => { p.starterEndMs = 6.2 }, p => { p.videoId = crypto.randomUUID() }, p => { p.phase = 'preparing'; p.context = 'home'; p.step = 3 }, p => { p.rate = NaN }, p => { p.context = 'unknown' }, p => { p.step = 9 }, p => { p.place = 'a'.repeat(201) }, p => { p.revision = 0 },
  ]) { const bad = structuredClone(data); change(bad.preparations[0]); expect(() => validateBackup(bad)).toThrow() }
  expect(data).toEqual(before)
})
test('三情境單步可續接；準備與播放不能冒充跟跳，新一次重新準備', () => {
  for (const context of ['home', 'out', 'venue'] as const) {
    const data = sample(), p = data.preparations[0]
    p.context = context; p.step = 1; p.phase = 'preparing'
    expect(validateBackup(data).preparations[0].step).toBe(1)
    p.step = preparationSteps[context].length; p.phase = 'ready'
    expect(validateBackup(data).preparations[0].danced).toBeUndefined()
    const next = nextPreparation(p)
    expect(next.id).not.toBe(p.id); expect(next.phase).toBe('planned'); expect(next.context).toBe(''); expect(next.step).toBe(0)
    expect([next.targetStartMs, next.targetEndMs, next.starterStartMs, next.starterEndMs, next.place]).toEqual([2000, 18000, 5000, 7000, '合成地點'])
  }
})
test('本人確認可略過自評；未變熟仍保留跟跳；純文字與新一次不帶上次回報', () => {
  const data = sample(), p = data.preparations[0]
  Object.assign(p, { context: 'home', step: 3, phase: 'completed', danced: true, rating: '', note: '<img src=x onerror=alert(1)>', mastery: false, completedAt: '2026-11-05T01:00:00Z' })
  expect(validateBackup(data).preparations[0]).toEqual(p)
  p.rating = 'stuck'; expect(validateBackup(data).preparations[0].danced).toBe(true)
  const next = nextPreparation(p); expect(next.danced).toBeUndefined(); expect(next.note).toBeUndefined(); expect(next.mastery).toBeUndefined()
  p.danced = false; expect(() => validateBackup(data)).toThrow()
  p.rating = ''; p.note = ''; expect(validateBackup(data).preparations[0].danced).toBe(false)
  p.mastery = true; expect(() => validateBackup(data)).toThrow()
})
test('完整備份往返、衝突／外來來源重寫影片關聯、重匯冪等與取消保全', async () => {
  const data = sample(), original = structuredClone(data)
  const restored = await planBackupImport(newLibrary(), validateBackup(data))
  expect(restored.data.preparations).toEqual(data.preparations)
  const changed = structuredClone(data); changed.videos[0].title = '另一版本'
  const fork = await planBackupImport(data, changed), copy = fork.data.preparations.find(p => p.id !== data.preparations[0].id)!
  expect(copy.videoId).not.toBe(data.videos[0].id); expect(fork.data.videos.some(v => v.id === copy.videoId && v.title === '另一版本')).toBe(true)
  expect((await planBackupImport(fork.data, changed)).added).toBe(0)
  const other = sample(), foreign = await planBackupImport(other, data)
  const imported = foreign.data.preparations.find(p => p.reason === '合成理由' && p.id !== other.preparations[0].id)!
  expect(imported.id).not.toBe(data.preparations[0].id); expect(foreign.data.videos.some(v => v.id === imported.videoId)).toBe(true)
  await expect(planBackupImport(data, changed, AbortSignal.abort())).rejects.toThrow(); expect(data).toEqual(original)
})
test('筆記分享與選定雲端快照排除私人準備；移除副本保留、刪整份筆記才移除準備', () => {
  const data = sample(), videoId = data.videos[0].id, assetId = crypto.randomUUID(), takeId = crypto.randomUUID(), ref = crypto.randomUUID()
  data.assets.push({ id: assetId, kind: 'take', byteLength: 3, mimeType: 'video/mp4' }, { id: ref, videoId, kind: 'reference', byteLength: 3, mimeType: 'video/mp4' })
  data.takes.push({ id: takeId, referenceVideoId: videoId, cameraAssetId: assetId, referenceStartMs: 0, referenceEndMs: 15000, rate: 1, state: 'ready', createdAt: '2026-11-05T00:00:00Z' })
  data.recipes.push({ id: crypto.randomUUID(), takeId, offsetMs: 0, referenceMirror: false, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
  const share = createShare(data, { videoIds: [videoId], markerIds: [], takeIds: [], exportIds: [], fields: [] })
  expect(share.schemaVersion).toBe(2); expect(share.preparations).toEqual([])
  expect(JSON.stringify(selectedPractice(data, videoId, takeId, true))).not.toContain('合成理由')
  expect(planDeletion(data, 'copy', ref).data.preparations).toEqual(data.preparations)
  expect(planDeletion(data, 'take', takeId).data.preparations).toEqual(data.preparations)
  expect(planDeletion(data, 'video', videoId).data.preparations).toEqual([])
})
