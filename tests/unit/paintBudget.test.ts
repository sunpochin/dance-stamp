/* 檔案用途：執行產品 paint 閉包，攔截多來源回呼重複花掉同一格預算。所在層：時間行為回歸。主要關聯：web/main.js、web/timeline.js、RECORD_COMPARE.md。 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import * as timeline from '../../web/timeline.js'

const interval = 1000 / 30
const source = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8')
const begin = source.indexOf('    const paint = now => {')
const end = source.indexOf('    const watchVideo = video => {', begin)
if (begin < 0 || end <= begin) throw new Error('找不到產品 paint 閉包，須更新行為測試接縫。')
const paint = source.slice(begin, end)
// 直接跑產品閉包及真正的預算 helper，只以計數器替代昂貴像素／媒體 API；不是比對實作字串。
function run(times: number[], code = paint) {
  return new Function('times', 'advanceCaptureBudget', `
    let lastCaptureAt = -1000 / 30, current, renders = 0;
    const captures = [], budgets = [];
    const render = () => { renders++; };
    const captureFrame = () => captures.push(current);
    ${code}
    for (current of times) {
      const count = captures.length;
      paint(current);
      if (captures.length !== count) budgets.push(lastCaptureAt);
    }
    return { captures, budgets, renders, lastCaptureAt };
  `)(times, timeline.advanceCaptureBudget)
}
function check(times: number[], captures: number[]) {
  const result = run(times)
  expect(result.captures).toEqual(captures)
  expect(result.renders).toBe(captures.length)
  expect(result.budgets.every((anchor: number, i: number) => anchor - (i ? result.budgets[i - 1] : -interval) >= interval - 1e-8)).toBe(true)
  return result
}

test('同一時間的 rAF 與兩側 rVFC 只能擷取一次', () => {
  check([0, 0, 0, 33, 33, 33, 34], [0, 33])
})
test('剛進原 1ms 容差區仍消耗一格，容差外不能提早畫', () => {
  check([0, interval - 1.01, 32.5, 33, 33.4], [0, 32.5])
  check([0, interval - 1, interval - 1, 33.4], [0, interval - 1])
})
test('浮點整格邊界不會把已接受的預算留在前一格', () => {
  const result = check([0, 100, 100, 100.1], [0, 100])
  expect(result.lastCaptureAt).toBeCloseTo(100, 10)
})
test('正常序列與一分鐘三來源回呼保持 30fps 預算', () => {
  check([0, 33, 66, 100], [0, 33, 66, 100])
  const times = Array.from({ length: 1801 }, (_, i) => Math.round(i * interval))
  check(times.flatMap(time => [time, time, time]), times)
})
test('長 gap 只畫當下的一格，不補畫追趕，並保留原相位', () => {
  const result = check([0, 120, 120, 121], [0, 120])
  expect(result.lastCaptureAt).toBeCloseTo(100, 10)
  check([0, 120, 120, 121, 132, 133, 10000, 10000, 10001], [0, 120, 133, 10000])
})
test('保留 main 7dede9f 的執行式反例：容差與浮點讓同一預算重用', () => {
  // 原片段 SHA-256 36c2fa9b548c6fbe02026810334dce00479e16b3a14d881672c538782a43f511；只保存原缺陷閉包。
  const legacy = `const paint = now => {
    if (now - lastCaptureAt >= 1000 / 30 - 1) {
      render(); captureFrame();
      lastCaptureAt = now - ((now - lastCaptureAt) % (1000 / 30));
    }
  };`
  for (const times of [[0, 33, 33, 34], [0, 32.5, 33, 33.4], [0, 100, 100, 100.1]]) {
    expect(run(times, legacy).captures).toEqual(times)
    expect(run(times).captures).toEqual(times.slice(0, 2))
  }
})
