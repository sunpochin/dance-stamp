/* 檔案用途：核對同影片同裝置的整合版／SIMD 對照與逐格幾何。所在層：本機效能證據。主要關聯：benchmark-follow.ts、follow-performance.js。 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const [baselinePath, pairedPath] = process.argv.slice(2)
assert(baselinePath && pairedPath, '請給整合版基準及交錯對照 run.json')
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const baseline = read(baselinePath), paired = read(pairedPath)
for (const run of [baseline, paired]) {
  assert.equal(run.status, 'passed'); assert.equal(run.errors.length, 0); assert.equal(run.lockReleased, true); assert.equal(run.remainingProcesses, '')
}
assert.equal(baseline.fixture.sha256, paired.fixture.sha256)
assert.deepEqual(baseline.environment, paired.environment, '裝置／瀏覽器／工具版本不同，不當作同裝置比較')
assert.deepEqual(baseline.fixture.keyframesSeconds, paired.fixture.keyframesSeconds)
assert.equal(baseline.trackedChanges, false, '原整合版基準必須是乾淨來源')
assert(/^[a-f0-9]{40}$/.test(baseline.sourceHead))
for (const file of ['web/follow-ui.js', 'web/person-worker.js', 'web/follow-metrics.js']) {
  const original = Bun.spawnSync(['git', 'show', `${baseline.sourceHead}:${file}`]); assert.equal(original.exitCode, 0)
  assert.equal(createHash('sha256').update(original.stdout).digest('hex'), baseline.sources[file], '基準來源不符')
  assert.equal(createHash('sha256').update(readFileSync(resolve(import.meta.dir, '..', file))).digest('hex'), paired.sources[file], '候選來源已變，不能移記結果')
}
const before = baseline.results.filter(row => row.enabled), controls = paired.results.filter(row => row.runtime === 'nosimd'), simd = paired.results.filter(row => row.runtime === 'simd')
assert.equal(before.length, 12); assert.equal(controls.length, 12); assert.equal(simd.length, 12)
const key = row => `${row.side}/${row.duration}/${row.report.sameInputRun}`
const total = (rows, field) => rows.reduce((sum, row) => sum + row.report[field], 0)
const coordinateError = (a, b) => Math.max(...['x', 'y', 'width', 'height'].map(name => Math.abs(a[name] - b[name]) * (name === 'x' || name === 'width' ? 960 : 540)))
let maximumBoxPixels = 0, maximumCropPixels = 0, frames = 0
const rows: any[] = []
for (const accelerated of simd) {
  const control = controls.find(row => key(row) === key(accelerated)), original = before.find(row => key(row) === key(accelerated))
  assert(control && original, '缺少同側／片段／輪次')
  for (const trial of [control, accelerated, original]) {
    const report = trial.report, count = trial.duration * 8 + 1
    assert.equal(report.outcome, 'complete'); assert.equal(report.sampleHz, 8)
    for (const name of ['processedFrames', 'trackedFrames', 'plannedFrames']) assert.equal(report[name], count)
  }
  const a = control.geometry, b = accelerated.geometry
  assert.equal(a.track.held, b.track.held); assert.equal(a.frames.length, b.frames.length); assert.equal(a.track.samples.length, b.track.samples.length)
  for (let index = 0; index < a.frames.length; index++) {
    frames++; const left = a.frames[index], right = b.frames[index]
    assert.equal(left.sourceTime, right.sourceTime); assert.equal(left.width, right.width); assert.equal(left.height, right.height)
    const full = frame => frame.boxes.map(box => ({ x: frame.search.x + box.x * frame.search.width, y: frame.search.y + box.y * frame.search.height, width: box.width * frame.search.width, height: box.height * frame.search.height }))
    const expected = full(left), remaining = full(right); assert.equal(expected.length, remaining.length)
    // 偵測排列可能因數值細差互換；比較一對一位置與最終路徑，不把排序誤當身分變更。
    for (const box of expected) {
      const distances = remaining.map(other => coordinateError(box, other)), nearest = Math.min(...distances)
      assert(nearest <= 1, `偵測框差異超過一個來源像素：${key(accelerated)} 格${index} ${nearest}`)
      maximumBoxPixels = Math.max(maximumBoxPixels, nearest); remaining.splice(distances.indexOf(nearest), 1)
    }
    const difference = coordinateError(a.track.samples[index], b.track.samples[index])
    assert(difference <= 1, `裁切路徑差異超過一個來源像素：${key(accelerated)} 格${index} ${difference}`)
    maximumCropPixels = Math.max(maximumCropPixels, difference)
  }
  assert(accelerated.report.totalAnalysisMs < control.report.totalAnalysisMs, '有對照輪沒有縮短分析')
  rows.push({ side: accelerated.side, seconds: accelerated.duration, repeat: accelerated.report.sameInputRun, originalAnalysisMs: original.report.totalAnalysisMs, controlAnalysisMs: control.report.totalAnalysisMs, simdAnalysisMs: accelerated.report.totalAnalysisMs, controlFlowMs: control.report.totalFlowMs, simdFlowMs: accelerated.report.totalFlowMs })
}
assert.equal(frames, 3212)
const controlMs = total(controls, 'totalAnalysisMs'), simdMs = total(simd, 'totalAnalysisMs')
assert(simdMs < controlMs * .9, '改善未達10%，不足以排除小幅排程波動')
const summary = {
  scope: 'Synthetic cached M4 Pro comparison only; not real dance, cold network, Safari or phone acceptance.',
  baselineReceipt: createHash('sha256').update(readFileSync(baselinePath)).digest('hex'), pairedReceipt: createHash('sha256').update(readFileSync(pairedPath)).digest('hex'),
  fixtureSha256: paired.fixture.sha256, environment: paired.environment, comparedFrames: frames,
  maximumBoxPixels, maximumCropPixels, originalAnalysisMs: total(before, 'totalAnalysisMs'), controlAnalysisMs: controlMs, simdAnalysisMs: simdMs,
  analysisReductionPercent: (1 - simdMs / controlMs) * 100, controlFlowMs: total(controls, 'totalFlowMs'), simdFlowMs: total(simd, 'totalFlowMs'), rows,
}
writeFileSync(resolve(pairedPath, '..', 'comparison.json'), JSON.stringify(summary, null, 2), { flag: 'wx' })
console.log(JSON.stringify(summary, null, 2))
