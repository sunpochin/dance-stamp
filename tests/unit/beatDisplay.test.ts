/* 檔案用途：驗證拍號與顯示秒數共用同一毫秒快照。所在層：畫面純邏輯回歸。主要關聯：main.js、beats.js、#19。 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { beatPosition } from '../../web/beats.js'

const main = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8')
const source = ['beatLabel', 'renderBeatPosition'].map(name => main.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))![0]).join('\n')
const render = (seconds: number) => {
  const label = { textContent: '' }, grid = { bpm: 120, firstBeatMs: 350, countInBeats: 4 }
  let reads = 0
  runInNewContext(source + '\nrenderBeatPosition()', {
    state: {}, currentVideo: () => ({ beatGrid: grid }), referenceDurationMs: 10000, beatPosition,
    $: () => label, reference: { get currentTime() { reads++; return seconds } },
  })
  return { text: label.textContent, reads }
}

test('拍點邊界的顯示毫秒與拍號一致，原生時間只取一次', () => {
  // 原生小數會四捨五入到下一毫秒，不能秒數已顯示下一拍、拍號卻仍用未取整的時間。
  expect(render(.349999)).toEqual({ text: '原片 0.350 秒 · 第 1 組八拍 · 第 1 拍', reads: 1 })
  expect(render(.849999)).toEqual({ text: '原片 0.850 秒 · 第 1 組八拍 · 第 2 拍', reads: 1 })
  expect(render(4.349999)).toEqual({ text: '原片 4.350 秒 · 第 2 組八拍 · 第 1 拍', reads: 1 })
  expect(render(.34)).toEqual({ text: '原片 0.340 秒 · 第一拍之前', reads: 1 })
})
