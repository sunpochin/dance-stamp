/* 檔案用途：核對耗時分布、同輸入比較與數字報告的資料界線。所在層：純診斷邏輯回歸。主要關聯：web/follow-metrics.js。 */
import { expect, test } from 'bun:test'
import { distribution, followMeasurements } from '../../web/follow-metrics.js'
import { runInNewContext } from 'node:vm'
import { sourceForVm, vmCoverageContext } from '../app-coverage/instrument'
const config = { side: 'reference', source: 'blob:synthetic-private-source', start: .4, end: 3.4, box: { x: .1234567, y: .05, width: .6, height: .9 }, sampleHz: 8, plannedFrames: 25, preparation: { loadMs: 12, firstSeekMs: 3 } }

test('平均與 nearest-rank P50/P95 只在收尾計算，缺值不冒充零成本', () => {
  expect(distribution(Array.from({ length: 20 }, (_, i) => i + 1))).toEqual({ count: 20, totalMs: 210, meanMs: 10.5, p50Ms: 10, p95Ms: 19 })
  expect(distribution([NaN, -1, Infinity])).toEqual({ count: 0, totalMs: 0, meanMs: null, p50Ms: null, p95Ms: null })
  expect(distribution([0])).toEqual({ count: 1, totalMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0 })
})
test('跨 Worker 時基還原與階段統計不帶出來源、選框或絕對時間', () => {
  let now = 0; const history = followMeasurements({ now: () => now, timeOrigin: 1000 }), run = history.start(config)
  run.workerCreatedNow = 2; run.workerCreatedAt = 1002; run.workerConstructorMs = .5; now = 20
  run.recordWorker({ enteredAt: 1008, scriptImportMs: 2, modelInitMs: 8, detectMs: 3 })
  run.samples.seek.push(1, 3); run.samples.bitmap.push(2, 4); run.samples.roundTrip.push(15, 5); run.processedFrames = 2; now = 40
  const report = run.finish('complete', 2)!
  expect(report).toMatchObject({ totalAnalysisMs: 40, processedFrames: 2, plannedFrames: 25, framesPerSecond: 50, realtimeFactor: 75, sampleHz: 8, sameInputRun: 1, comparison: null })
  expect(report.worker).toMatchObject({ constructionMs: .5, startupMs: 6, scriptImportMs: 2, modelInitMs: 8, firstRoundTripMs: 15 })
  expect(report.stages.seek).toMatchObject({ meanMs: 2, p50Ms: 1, p95Ms: 3 })
  const text = JSON.stringify(report)
  for (const value of [config.source, '1234567', 'enteredAt', 'workerCreatedAt', 'box']) expect(text).not.toContain(value)
  expect(run.finish('complete', 2)).toBeNull(); expect(history.reports).toHaveLength(1)
})
test('只比較成功且完全相同的輸入；取消、失敗與其他側都不是暖輪', () => {
  let now = 0; const history = followMeasurements({ now: () => now, timeOrigin: 0 })
  const finish = (outcome: 'complete'|'cancelled'|'failed' = 'complete', value = config) => { const run = history.start(value); now += 20; return run.finish(outcome, 0)! }
  expect(finish().sameInputRun).toBe(1)
  expect(finish('cancelled')).toMatchObject({ sameInputRun: null, comparison: null, outcome: 'cancelled' })
  expect(finish('failed')).toMatchObject({ sameInputRun: null, comparison: null })
  expect(finish()).toMatchObject({ sameInputRun: 2, comparison: { previousSequence: 1, differenceMs: 0, previousTotalMs: 20 } })
  for (const value of [{ ...config, side: 'self' }, { ...config, source: 'blob:other' }, { ...config, start: 1, end: 4 }, { ...config, box: { ...config.box, x: .2 } }]) expect(finish('complete', value).sameInputRun).toBe(1)
  for (let i = 0; i < 15; i++) finish('complete', { ...config, source: `blob:${i}` })
  expect(history.reports).toHaveLength(10); expect(finish().sameInputRun).toBe(1)
})
test('睡眠／時鐘差或缺少回覆時留空，不把估計成本寫成實測', () => {
  const history = followMeasurements({ now: () => 10, timeOrigin: 1000 }), run = history.start(config)
  run.workerCreatedAt = 1000; run.workerCreatedNow = 0
  run.recordWorker({ enteredAt: 999, detectMs: -1 }); run.recordWorker({ enteredAt: 5000, modelInitMs: NaN }); run.recordWorker(null)
  const report = run.finish('cancelled', 0)!
  expect(report.worker).toMatchObject({ startupMs: null, modelInitMs: null, firstRoundTripMs: null })
  expect(report.stages.detect.count).toBe(0)
})
test('Worker 計時不改偵測結果、CPU 選項與關閉影格；關閉計時保留原訊息格式', async () => {
  let now = 0, creates = 0, fail = false; const messages: any[] = [], frames: any[] = []
  const scope: any = { ...vmCoverageContext(), performance: { timeOrigin: 1000, now: () => ++now }, importScripts() {}, postMessage(value: any) { messages.push(JSON.parse(JSON.stringify(value))) }, Vision: { ObjectDetector: { async createFromOptions(_paths: any, options: any) {
    creates++; expect(options.baseOptions.delegate).toBe('CPU'); expect(options.scoreThreshold).toBe(.35)
    return { detect() { if (fail) throw new Error('synthetic'); return { detections: [{ boundingBox: { originX: 16, originY: 32, width: 80, height: 128 } }] } } }
  } } } }
  runInNewContext(sourceForVm('web/person-worker.js'), scope)
  for (const measure of [true, false, true]) {
    const bitmap = { width: 160, height: 320, closed: false, close() { this.closed = true } }; frames.push(bitmap)
    await scope.onmessage({ data: { bitmap, measure } }); if (!measure) fail = true
  }
  const boxes = [{ x: .1, y: .1, width: .5, height: .4 }]
  expect(messages[0].boxes).toEqual(boxes); expect(messages[0].timing).toMatchObject({ enteredAt: 1001, scriptImportMs: 1, modelInitMs: 1, detectMs: 1 })
  expect(messages[1]).toEqual({ boxes }); expect(messages[2].error).toContain('分析失敗'); expect(messages[2].timing.detectMs).toBe(1)
  expect(creates).toBe(1); expect(frames.every(frame => frame.closed)).toBe(true)
})
