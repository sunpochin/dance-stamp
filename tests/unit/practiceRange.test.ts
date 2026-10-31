/* 檔案用途：攔截完整片長秒數往返的浮點誤拒。所在層：練習控制器純邏輯回歸。主要關聯：main.js 的 practiceRange。 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8').match(/function practiceRange\(\) \{[^]*?\n\}/)![0]
const range = (start: string, end: string, durationMs = 65001) => runInNewContext(source + '\npracticeRange()', {
  $: (id: string) => ({ value: id === 'start' ? start : end }), referenceDurationMs: durationMs,
})

test('完整片長新載入或重開後，毫秒邊界不受秒數浮點往返影響', () => {
  // 直接執行產品函式；65001ms 換成秒再乘回會略大於原值，不能靠手動少選一毫秒。
  expect(range('0', String(65001 / 1000))).toEqual({ a: 0, b: 65.001 })
  expect(range('1.001', String(65001 / 1000))).toEqual({ a: 1.001, b: 65.001 })
  for (const [start, end] of [['0', '65.002'], ['2', '1'], ['-0.001', '1'], ['', '1'], ['0', ''], ['0', 'Infinity']]) {
    expect(() => range(start!, end!)).toThrow('合法')
  }
})
