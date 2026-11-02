/* 檔案用途：鎖住數拍估算與點拍的靜音、誤觸及速度邊界。所在層：純邏輯測試。主要關聯：web/tempo.js。 */
import { expect, test } from 'bun:test'
import { estimateTempo, tapTempo } from '../../web/tempo.js'
function counting(bpm: number) {
  // 合成每個數字的音量輪廓，含輕微音節和不等音量；不含真人聲音。
  return Array.from({ length: 2000 }, (_, i) => {
    const phase = (i / 100 * bpm / 60) % 1
    return 0.001 + (Math.exp(-(((phase - 0.15) / 0.09) ** 2)) + 0.25 * Math.exp(-(((phase - 0.3) / 0.06) ** 2))) * (0.3 + 0.1 * Math.sin(i / 51))
  })
}
test('穩定數拍及半拍歧義保留可校正的速度', () => {
  for (const bpm of [20, 40, 80, 120, 137.5, 180, 240, 300]) {
    const result = estimateTempo(counting(bpm))
    expect(result).not.toBeNull()
    const error = Math.min(...[0.5, 1, 2].map(factor => Math.abs(result!.bpm * factor - bpm)))
    expect(error).toBeLessThan(2)
  }
})
test('靜音、過短、固定底噪及無規律音量不冒充穩定拍點', () => {
  for (const values of [[], counting(120).slice(0, 500), Array(2000).fill(0), Array(2000).fill(0.2), Array(2000).fill(NaN)]) expect(estimateTempo(values)).toBeNull()
  let seed = 17
  const noise = Array.from({ length: 2000 }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 })
  expect(estimateTempo(noise)).toBeNull()
})
test('點拍需要三次，排除一次誤觸並保留小數速度', () => {
  expect(tapTempo([0, 500])).toBeNull()
  expect(tapTempo([0, 500, 1000, 1500, 1600])).toBe(120)
  expect(tapTempo([0, 60000 / 137.5, 120000 / 137.5])).toBe(137.5)
  expect(tapTempo([0, 0, 0])).toBeNull()
  expect(tapTempo([0, 100, 200])).toBeNull()
})
