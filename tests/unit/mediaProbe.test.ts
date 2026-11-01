/* 檔案用途：攔截錯誤時間裁切、容器與等比 fit。所在層：M0 邏輯回歸。主要關聯：prototypes/media/、RECORD_COMPARE.md。 */
import { describe, expect, test } from 'bun:test'
import { comparison, positions, contain } from '../../web/timeline.js'
import { extension } from '../../web/recorder.js'

const slow = { startMs: 10_000, endMs: 25_000, rate: 0.5, offsetMs: 200, selfDurationMs: 30_000 }
describe('M0 共同比較區間', () => {
  test('正偏移裁掉自拍開頭，慢速保持來源映射', () => {
    expect(comparison(slow)).toEqual({ lowerMs: 0, upperMs: 29_800, durationMs: 29_800 })
    expect(positions(slow, 10_000)).toEqual({ referenceMs: 15_000, selfMs: 10_200 })
  })
  test('負偏移同步裁掉來源畫面與音訊，尾端只保留交集', () => {
    const value = { ...slow, offsetMs: -500, selfDurationMs: 20_000 }
    expect(comparison(value)).toEqual({ lowerMs: 500, upperMs: 20_500, durationMs: 20_000 })
    expect(positions(value, 0)).toEqual({ referenceMs: 10_250, selfMs: 0 })
    expect(positions(value, 20_000)).toEqual({ referenceMs: 20_250, selfMs: 20_000 })
  })
  test('0.75 倍速及正負邊界', () => {
    expect(comparison({ ...slow, rate: 0.75, offsetMs: 0 }).durationMs).toBe(20_000)
    for (const offsetMs of [-30_000, 30_000]) expect(() => comparison({ ...slow, offsetMs })).toThrow('共同區間')
    expect(() => positions(slow, -1)).toThrow()
    expect(() => positions(slow, 29_801)).toThrow()
  })
  test('既有影片各自選起點，長原片只取選定片段', () => {
    const value = { startMs: 12000, endMs: 32000, rate: 1, offsetMs: 4000, selfDurationMs: 80000 }
    expect(comparison(value).durationMs).toBe(20000)
    expect(positions(value, 0)).toEqual({ referenceMs: 12000, selfMs: 4000 })
    expect(positions(value, 20000)).toEqual({ referenceMs: 32000, selfMs: 24000 })
    expect(comparison({ ...value, selfDurationMs: 9000 }).durationMs).toBe(5000)
  })
  test('拒絕空值、非整數、超長與不允許速度', () => {
    for (const patch of [{ startMs: -1 }, { endMs: 0 }, { rate: 0 }, { rate: 2 }, { offsetMs: NaN }, { offsetMs: 0.5 }, { selfDurationMs: Infinity }, { endMs: 160_001 }]) {
      expect(() => comparison({ ...slow, ...patch })).toThrow()
    }
  })
  test('五分鐘以放慢後時長計算，三速度首中尾映射與超界拒絕共用原規則', () => {
    for (const rate of [0.5, 0.75, 1]) {
      const value = { startMs: 12_000, endMs: 12_000 + 300_000 * rate, rate, offsetMs: 0, selfDurationMs: 300_000 }
      expect(comparison(value).durationMs).toBe(300_000)
      for (const elapsed of [0, 150_000, 300_000]) expect(positions(value, elapsed)).toEqual({ referenceMs: 12_000 + rate * elapsed, selfMs: elapsed })
      expect(() => comparison({ ...value, endMs: value.endMs + 1 })).toThrow('最多 5 分鐘')
      // 短右片可縮短合法交集，卻不能拿來繞過左片規劃上限。
      expect(comparison({ ...value, selfDurationMs: 80_000 }).durationMs).toBe(80_000)
      expect(() => comparison({ ...value, endMs: value.endMs + 1, selfDurationMs: 80_000 })).toThrow('最多 5 分鐘')
    }
  })
})
test('全身等比 fit，不裁腳；容器不靠改名偽裝', () => {
  expect(contain(720, 1280, 640, 672)).toEqual({ width: 378, height: 672, x: 131, y: 0 })
  expect(() => contain(0, 0, 640, 672)).toThrow()
  expect(extension('video/mp4;codecs=avc1')).toBe('mp4')
  expect(extension('video/webm')).toBe('webm')
  expect(() => extension('video/unknown')).toThrow()
})
