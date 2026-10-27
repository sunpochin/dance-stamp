/* 檔案用途：驗證新錄影時長、錯誤提示與暫存片段完整性。所在層：媒體純邏輯測試。主要關聯：timeline.js、recorder.js、storage.js。 */
import { expect, test } from 'bun:test'
import { captureDuration } from '../../web/timeline.js'
import { assembleChunks, cameraError } from '../../web/recorder.js'
import { newLibrary, validateBackup } from '../../web/library.js'

test('以實際錄製時間限制 15–60 秒，三種速度共用同一邊界', () => {
  for (const rate of [0.5, 0.75, 1]) for (const duration of [15_000, 30_000, 60_000]) {
    expect(captureDuration({ startMs: 2000, endMs: 2000 + duration * rate, rate })).toBe(duration)
  }
  for (const rate of [0.5, 0.75, 1]) for (const duration of [14_000, 61_000]) {
    expect(() => captureDuration({ startMs: 0, endMs: duration * rate, rate })).toThrow()
  }
  expect(() => captureDuration({ startMs: 0, endMs: 30_000, rate: 2 })).toThrow()
})
test('只組合從零連續且容器一致的非空 chunks，拒絕後不改原件', async () => {
  const first = new Blob(['first'], { type: 'video/mp4' }), last = new Blob(['last'], { type: 'video/mp4;codecs=avc1' })
  expect(await assembleChunks([{ index: 0, blob: first }, { index: 1, blob: last }]).text()).toBe('firstlast')
  for (const rows of [[], [{ index: 1, blob: first }], [{ index: 0, blob: first }, { index: 2, blob: last }], [{ index: 0, blob: first }, { index: 0, blob: last }], [{ index: 0, blob: new Blob([]) }], [{ index: 0, blob: first }, { index: 1, blob: new Blob(['x'], { type: 'video/webm' }) }]]) expect(() => assembleChunks(rows)).toThrow()
  expect(await first.text()).toBe('first')
})
test('相機拒絕、占用、缺少後鏡頭與未知錯誤都有可重試的中文說明', () => {
  expect(cameraError({ name: 'NotAllowedError', message: 'synthetic private camera label' }, 'user').message).toContain('允許相機')
  expect(cameraError({ name: 'NotReadableError' }, 'user').message).toContain('其他程式')
  expect(cameraError({ name: 'OverconstrainedError' }, 'environment').message).toContain('後鏡頭')
  expect(cameraError({ name: 'NotFoundError' }, 'user').message).toContain('找不到')
  expect(cameraError({ name: 'unknown' }, 'user').message).toContain('重試')
})
test('錄影觀測值可往返、只接受整數毫秒並排除裝置欄位，不假定非同步事件順序', () => {
  const data = newLibrary(), videoId = crypto.randomUUID(), assetId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成時間對照', durationMs: 60_000, revision: 1 })
  data.assets.push({ id: assetId, kind: 'take', byteLength: 1, mimeType: 'video/mp4' })
  const captureTiming = { recorderRequestedMs: 100, recorderStartedMs: 107, referencePlayResolvedMs: 105, referenceAtPlayMs: 250 }
  data.takes.push({ id: crypto.randomUUID(), referenceVideoId: videoId, cameraAssetId: assetId, referenceStartMs: 0, referenceEndMs: 15_000, rate: 1, state: 'interrupted', createdAt: new Date().toISOString(), captureTiming })
  Object.assign(captureTiming, { deviceId: 'synthetic-only' })
  expect(validateBackup(data).takes[0].captureTiming).toEqual({ recorderRequestedMs: 100, recorderStartedMs: 107, referencePlayResolvedMs: 105, referenceAtPlayMs: 250 })
  for (const change of [{ recorderRequestedMs: -1 }, { recorderStartedMs: 1.5 }, { referencePlayResolvedMs: NaN }, { referenceAtPlayMs: 60_001 }]) {
    const bad = structuredClone(data); Object.assign(bad.takes[0].captureTiming, change); expect(() => validateBackup(bad)).toThrow()
  }
})
