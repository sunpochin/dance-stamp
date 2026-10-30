/* 檔案用途：防止全 App 覆蓋率省略未載入模組或混合不同來源。所在層：量測契約回歸。主要關聯：tests/app-coverage/instrument.ts。 */
import { expect, test } from 'bun:test'
import { appFiles, emptyCoverage, instrument, mergeReceipt, receipt } from '../app-coverage/instrument'

test('主畫面、儲存與 SW 沒執行也以零分保留在完整分母', () => {
  const map = emptyCoverage()
  expect(map.files().sort()).toEqual(appFiles)
  for (const path of ['web/main.js', 'web/storage.js', 'web/sw.js']) {
    const summary = map.fileCoverageFor(path).toSummary()
    expect(summary.lines.total).toBeGreaterThan(0); expect(summary.lines.covered).toBe(0)
    expect(summary.functions.total).toBeGreaterThan(0); expect(summary.functions.covered).toBe(0)
  }
})
test('只合併完整來源指紋相同的計數，不接受其他版本或未知檔案', () => {
  const map = emptyCoverage(), original = map.getCoverageSummary().toJSON()
  expect(() => mergeReceipt(map, { ...receipt({}), sourceHashes: {} })).toThrow('來源不同')
  expect(() => mergeReceipt(map, receipt({ 'web/unknown.js': {} }))).toThrow('未知來源')
  mergeReceipt(map, receipt({}))
  expect(map.getCoverageSummary().toJSON()).toEqual(original)
})
test('後來的新頁面零計數不能清掉前一頁已執行的程式', () => {
  const map = emptyCoverage(), first = instrument('web/main.js').coverage
  const id = Object.keys(first.s).at(-1)!, line = first.statementMap[id].start.line
  first.s[id] = 1
  mergeReceipt(map, receipt({ 'web/main.js': first }))
  expect(map.fileCoverageFor('web/main.js').getLineCoverage()[line]).toBe(1)
  mergeReceipt(map, receipt({ 'web/main.js': instrument('web/main.js').coverage }))
  expect(map.fileCoverageFor('web/main.js').getLineCoverage()[line]).toBe(1)
})
test('正確指紋不能替錯誤的位置表或負數計數背書，也不改掉原報表', () => {
  const map = emptyCoverage(), before = map.toJSON(), wrong = instrument('web/main.js').coverage
  wrong.path = 'web/storage.js'
  expect(() => mergeReceipt(map, receipt({ 'web/storage.js': wrong }))).toThrow('位置表')
  const negative = instrument('web/main.js').coverage
  negative.s[Object.keys(negative.s)[0]] = -1
  expect(() => mergeReceipt(map, receipt({ 'web/main.js': negative }))).toThrow('計數無效')
  expect(map.toJSON()).toEqual(before)
  const fresh = emptyCoverage()
  expect(fresh.getCoverageSummary().lines.covered).toBe(0)
})
