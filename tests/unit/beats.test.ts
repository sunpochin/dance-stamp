/* 檔案用途：來源拍點、慢速倒數及 v1 備份相容回歸。所在層：純資料測試。主要關聯：beats.js、library.js。 */
import { expect, test } from 'bun:test'
import { validateBeatGrid, beatPosition, countInPlan } from '../../web/beats.js'
import { newLibrary, validateBackup, parseBackup, planBackupImport } from '../../web/library.js'
import { positions } from '../../web/timeline.js'
const grid = { bpm: 120, firstBeatMs: 1250, countInBeats: 8 }
test('八拍只跟來源時間走；三速度對應相同第一拍及八拍邊界', () => {
  expect(beatPosition(undefined, 2000)).toBeNull()
  expect(beatPosition(grid, 1249.999)).toBeNull()
  for (const rate of [0.5, 0.75, 1]) {
    const recipe = { startMs: 1250, endMs: 16250, rate, offsetMs: 200, selfDurationMs: 60000 }
    for (let i = 0; i <= 24; i++) {
      const sourceMs = positions(recipe, i * 500 / rate).referenceMs
      expect(beatPosition(grid, sourceMs)).toEqual({ eight: Math.floor(i / 8) + 1, beat: i % 8 + 1 })
      if (i) expect(beatPosition(grid, sourceMs - 0.01)?.beat).toBe((i + 7) % 8 + 1)
    }
    expect(countInPlan(grid, rate)).toEqual({ beats: 8, intervalMs: 500 / rate, durationMs: 4000 / rate })
  }
  const fractional = { ...grid, bpm: 137.5 }
  expect(beatPosition(fractional, 1250 + 8 * 60000 / 137.5)).toEqual({ eight: 2, beat: 1 })
  expect(countInPlan({ ...grid, bpm: 20 }, 0.5).durationMs).toBe(48000)
})
test('邊界共用嚴格驗證，不把空值、文字或極端值猜成拍點', () => {
  for (const bpm of [NaN, Infinity, -1, 0, 19.99, 300.01, '120', null]) expect(() => validateBeatGrid({ ...grid, bpm }, 20000)).toThrow()
  for (const firstBeatMs of [-1, 20000, Number.MAX_SAFE_INTEGER, Infinity, 1.5, null]) expect(() => validateBeatGrid({ ...grid, firstBeatMs }, 20000)).toThrow()
  for (const countInBeats of [-1, 1, 16, '4', null]) expect(() => validateBeatGrid({ ...grid, countInBeats }, 20000)).toThrow()
  expect(() => validateBeatGrid(null, 20000)).toThrow()
  expect(validateBeatGrid({ bpm: 300, firstBeatMs: 0, countInBeats: 0 }, 1).bpm).toBe(300)
  expect(() => countInPlan({ ...grid, countInBeats: 0 }, 1)).toThrow()
  expect(() => countInPlan(grid, 2)).toThrow()
})
test('舊 v1 沒拍點仍能重讀；新 metadata 備份、重匯與衝突副本保留關聯', async () => {
  const data = newLibrary(), videoId = crypto.randomUUID(), assetId = crypto.randomUUID(), takeId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成拍點', durationMs: 20000, revision: 1 })
  expect(parseBackup(JSON.stringify(data)).videos[0]).not.toHaveProperty('beatGrid')
  data.videos[0].beatGrid = grid
  data.assets.push({ id: assetId, kind: 'take', byteLength: 100, mimeType: 'video/mp4' })
  data.takes.push({ id: takeId, referenceVideoId: videoId, cameraAssetId: assetId, referenceStartMs: 1250, referenceEndMs: 16250, rate: 1, state: 'ready', createdAt: new Date().toISOString(), beatGrid: { ...grid } })
  Object.assign(data.videos[0].beatGrid, { arbitraryPath: 'synthetic-only' })
  const restored = parseBackup(JSON.stringify(data))
  expect(restored.videos[0].beatGrid).toEqual({ bpm: 120, firstBeatMs: 1250, countInBeats: 8 })
  expect(restored.takes[0].beatGrid).toEqual(restored.videos[0].beatGrid)
  expect((await planBackupImport(restored, restored)).added).toBe(0)
  const incoming = structuredClone(restored); incoming.videos[0].beatGrid!.bpm = 100
  const plan = await planBackupImport(restored, incoming)
  expect(plan.data.videos.find(v => v.id === videoId)?.beatGrid?.bpm).toBe(120)
  const copy = plan.data.videos.find(v => v.id !== videoId)!
  expect(copy.beatGrid?.bpm).toBe(100)
  expect(plan.data.takes.some(t => t.referenceVideoId === copy.id && t.beatGrid?.bpm === 120)).toBe(true)
  expect((await planBackupImport(plan.data, incoming)).added).toBe(0)
  const before = JSON.stringify(restored)
  incoming.takes[0].beatGrid!.firstBeatMs = 20001
  expect(() => validateBackup(incoming)).toThrow('拍點')
  expect(JSON.stringify(restored)).toBe(before)
})
