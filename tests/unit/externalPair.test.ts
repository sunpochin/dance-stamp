/* 檔案用途：驗證既有兩片配方與 v1 關聯。所在層：純資料回歸。主要關聯：web/library.js、RECORD_COMPARE.md。 */
import { expect, test } from 'bun:test'
import { newLibrary, addExternalPair, parseBackup } from '../../web/library.js'
import { positions, comparison } from '../../web/timeline.js'
import { normalizedVideo, extension } from '../../web/recorder.js'
const sources = () => ({ reference: { file: new Blob(['teacher'], { type: 'video/mp4' }), durationMs: 90_000 }, self: { file: new Blob(['own'], { type: 'video/mp4' }), durationMs: 82_000 } })
const value = () => ({ startMs: 12_000, endMs: 32_000, rate: 1, offsetMs: 4000, selfDurationMs: 82_000, referenceMirror: false, selfMirror: true })
test('長原片只存配對描述；12 秒／4 秒起跳使用唯一時間映射，不產生錄影觀測', () => {
  const data = newLibrary(), ids = addExternalPair(data, sources(), value())
  expect(data.takes[0].state).toBe('ready'); expect(data.takes[0].captureTiming).toBeUndefined()
  expect(data.takes[0].id).toBe(ids.takeId); expect(data.assets.every(a => a.storageKind === 'session')).toBe(true)
  expect(positions(value(), 0)).toEqual({ referenceMs: 12_000, selfMs: 4000 })
  expect(positions(value(), 20_000)).toEqual({ referenceMs: 32_000, selfMs: 24_000 })
  const restored = parseBackup(JSON.stringify(data))
  expect(restored.takes).toEqual(data.takes); expect(restored.recipes[0].offsetMs).toBe(4000)
  expect(JSON.stringify(restored)).not.toContain('teacher'); expect(restored.assets.every(a => a.mediaIncluded === false)).toBe(true)
})
test('改區間／r 建新 take，重用明確已選原片且不改舊配方與輸出', () => {
  const data = newLibrary(), original = sources(), first = addExternalPair(data, original, value()), old = structuredClone(data.takes[0])
  const second = addExternalPair(data, { reference: { ...original.reference, videoId: first.videoId }, self: { ...original.self, assetId: data.takes[0].cameraAssetId } }, { ...value(), endMs: 42_000, rate: 0.5 })
  expect(second.takeId).not.toBe(first.takeId); expect(data.takes[0]).toEqual(old)
  expect(data.assets).toHaveLength(2); expect(data.recipes).toHaveLength(2)
  expect(comparison({ ...value(), endMs: 42_000, rate: 0.5 }).durationMs).toBe(60_000)
})
test('空交集、超長片段與失聯 ID 先拒絕，無半份配對', () => {
  for (const invalid of [{ ...value(), offsetMs: 100_000 }, { ...value(), endMs: 80_000 }, { ...value(), endMs: 95_000 }]) {
    const data = newLibrary(); expect(() => addExternalPair(data, sources(), invalid)).toThrow(); expect(data.takes).toHaveLength(0); expect(data.videos).toHaveLength(0)
  }
  const data = newLibrary(); expect(() => addExternalPair(data, { ...sources(), reference: { ...sources().reference, videoId: crypto.randomUUID() } }, value())).toThrow(); expect(data.assets).toHaveLength(0)
})
test('改名 MP4／MOV 的下載副檔名依檔頭補正，原 bytes 不變且不冒充解碼成功', async () => {
  for (const [brand, mime, suffix] of [['isom', 'video/mp4', 'mp4'], ['qt  ', 'video/quicktime', 'mov']]) {
    const original = new Blob([new Uint8Array([0, 0, 0, 16]), 'ftyp', brand, 'synthetic bytes'], { type: 'application/octet-stream' })
    const corrected = await normalizedVideo(original)
    expect(corrected.type).toBe(mime); expect(extension(corrected.type)).toBe(suffix)
    expect(new Uint8Array(await corrected.arrayBuffer())).toEqual(new Uint8Array(await original.arrayBuffer()))
    expect(original.type).toBe('application/octet-stream')
  }
  await expect(normalizedVideo(new Blob([]))).rejects.toThrow('空檔案')
  await expect(normalizedVideo(new Blob(['unknown']))).rejects.toThrow('容器')
})
