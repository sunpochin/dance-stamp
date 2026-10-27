/* 檔案用途：驗證備份邊界、關聯與不覆寫策略。所在層：資料回歸。主要關聯：web/library.js、DATA_FORMAT.md。 */
import { expect, test } from 'bun:test'
import { newLibrary, validateBackup, parseBackup, mergeBackup } from '../../web/library.js'
function sample() {
  const data = newLibrary(), videoId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成練習', durationMs: 60_000, revision: 1 })
  data.markers.push({ id: crypto.randomUUID(), videoId, startMs: 2000, title: '腳步', note: '<img src=x onerror=alert(1)>', revision: 1 })
  return data
}
test('備份 round trip 保留純文字筆記，排除裝置欄位', () => {
  const data = sample()
  Object.assign(data.videos[0], { objectURL: 'blob:synthetic-only', deviceId: 'synthetic-only' })
  const result = parseBackup(JSON.stringify(data))
  expect(result.markers[0].note).toBe(data.markers[0].note)
  expect(result.videos[0]).not.toHaveProperty('objectURL')
  expect(result.videos[0]).not.toHaveProperty('deviceId')
})
test('重匯冪等；衝突拒絕且保留本機', () => {
  const data = sample(), normalized = validateBackup(data)
  expect(mergeBackup(data, normalized).markers).toEqual(data.markers)
  const incoming = structuredClone(normalized); incoming.markers[0].note = '另一個版本'
  expect(() => mergeBackup(data, incoming)).toThrow('不同內容')
  expect(data.markers[0].note).toContain('<img')
})
test('未來版本、孤兒、重複 ID、危險鍵與非法區間不寫入', () => {
  for (const change of [
    d => { d.schemaVersion = 2 },
    d => { d.markers[0].videoId = crypto.randomUUID() },
    d => { d.markers.push(d.markers[0]) },
    d => { d.markers[0].endMs = 1000 },
    d => { d.markers[0].startMs = 60_001 },
    d => { d.markers[0].note = 'x'.repeat(20_001) },
    d => { d.markers[0].revision = 0 },
  ]) { const data = sample(); change(data); expect(() => validateBackup(data)).toThrow() }
  expect(() => parseBackup('{"__proto__":{"x":1}}')).toThrow()
  expect(() => parseBackup('{')).toThrow()
  expect(() => parseBackup(' '.repeat(10 * 1024 * 1024 + 1))).toThrow('10 MiB')
})
test('錄影與輸出必須指向正確種類的媒體與配方', () => {
  const data = sample(), assetId = crypto.randomUUID(), takeId = crypto.randomUUID()
  data.assets.push({ id: assetId, kind: 'take', byteLength: 1, mimeType: 'video/mp4' })
  data.takes.push({ id: takeId, referenceVideoId: data.videos[0].id, cameraAssetId: assetId, referenceStartMs: 0, referenceEndMs: 15_000, rate: 1, state: 'recording', createdAt: new Date().toISOString() })
  expect(validateBackup(data).takes[0].state).toBe('interrupted')
  data.assets[0].kind = 'reference'
  expect(() => validateBackup(data)).toThrow()
})
