/* 檔案用途：驗證時間標記的共用毫秒邊界。所在層：純邏輯回歸。主要關聯：timeline.js、library.js。 */
import { expect, test } from 'bun:test'
import { validateMarkerRange } from '../../web/timeline.js'

test('點標記允許片頭與片尾，區間保留原起訖', () => {
  expect(() => validateMarkerRange(0, undefined, 60_000)).not.toThrow()
  expect(() => validateMarkerRange(60_000, undefined, 60_000)).not.toThrow()
  expect(() => validateMarkerRange(1234, 60_000, 60_000)).not.toThrow()
})
test('逆序、等長、超界與非整數毫秒一律拒絕', () => {
  for (const [start, end, duration] of [
    [2000, 1000, 60_000], [1000, 1000, 60_000], [0, 60_001, 60_000],
    [-1, undefined, 60_000], [60_001, undefined, 60_000], [0.1, undefined, 60_000],
    [0, 1000.1, 60_000], [NaN, undefined, 60_000], [0, Infinity, 60_000],
    [0, undefined, 0], [0, undefined, 60_000.1], [Number.MAX_SAFE_INTEGER + 1, undefined, 60_000],
  ] as const) expect(() => validateMarkerRange(start, end, duration)).toThrow()
})
