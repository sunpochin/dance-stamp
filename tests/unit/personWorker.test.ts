/* 檔案用途：驗證人物模型輸入不扭曲比例、補邊座標還原與影格釋放。所在層：Worker 邊界回歸。主要關聯：web/person-worker.js、follow.test.ts。 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

function worker() {
  const inputs: any[] = [], draws: any[] = [], messages: any[] = [], options: any[] = []
  let detections: any[] = [], failure = false
  const scope: any = {
    importScripts() {}, postMessage(value: any) { messages.push(JSON.parse(JSON.stringify(value))) },
    Vision: { ObjectDetector: { async createFromOptions(_paths: any, value: any) {
      options.push(value)
      return { detect(input: any) { inputs.push(input); if (failure) throw new Error('synthetic detector failure'); return { detections } } }
    } } },
    OffscreenCanvas: class {
      constructor(public width: number, public height: number) {}
      getContext() { return { fillRect() {}, drawImage(...args: any[]) { draws.push(args) } } }
      transferToImageBitmap() { return { width: this.width, height: this.height, closed: false, close() { this.closed = true } } }
    },
  }
  runInNewContext(readFileSync(new URL('../../web/person-worker.js', import.meta.url), 'utf8'), scope)
  return { inputs, draws, messages, options, async detect(width: number, height: number, boxes: any[], fail = false) {
    detections = boxes.map(boundingBox => ({ boundingBox })); failure = fail
    const bitmap = { width, height, closed: false, close() { this.closed = true } }
    await scope.onmessage({ data: { bitmap } }); return bitmap
  } }
}

test('狹長選框等比補邊，偵測框扣掉補邊後回到原選框', async () => {
  const run = worker(), bitmap = await run.detect(160, 640, [{ originX: 260, originY: 64, width: 120, height: 512 }])
  expect(run.inputs[0]).toMatchObject({ width: 640, height: 640, closed: true })
  // 沒有傳目標寬高，才能證明人體沒有被拉成方形；只平移到補邊中央。
  expect(run.draws[0]).toEqual([bitmap, 240, 0])
  expect(run.messages[0]).toEqual({ boxes: [{ x: .125, y: .1, width: .75, height: .8 }] })
  expect(bitmap.closed).toBe(true)
  expect(run.options[0]).toMatchObject({ scoreThreshold: .35, categoryAllowlist: ['person'] })
})

test('橫框與方框也還原正確；補邊外的框丟棄，交界只保留實際像素', async () => {
  const run = worker()
  await run.detect(640, 160, [
    { originX: 64, originY: 260, width: 512, height: 120 },
    { originX: 0, originY: 0, width: 40, height: 40 },
    { originX: -10, originY: 220, width: 90, height: 100 },
  ])
  expect(run.draws[0].slice(1)).toEqual([0, 240])
  expect(run.messages[0]).toEqual({ boxes: [{ x: .1, y: .125, width: .8, height: .75 }, { x: 0, y: 0, width: .125, height: .5 }] })
  await run.detect(480, 480, [{ originX: 48, originY: 96, width: 240, height: 240 }])
  expect(run.inputs[1]).toMatchObject({ width: 480, height: 480, closed: true })
  expect(run.draws[1].slice(1)).toEqual([0, 0])
  expect(run.messages[1]).toEqual({ boxes: [{ x: .1, y: .2, width: .5, height: .5 }] })
  expect(run.options).toHaveLength(1)
})

test('推論失敗仍釋放原影格與補邊影格，不交付不完整框', async () => {
  const run = worker(), bitmap = await run.detect(160, 640, [], true)
  expect(bitmap.closed).toBe(true); expect(run.inputs[0].closed).toBe(true)
  expect(run.messages[0].error).toContain('分析失敗'); expect(run.messages[0].boxes).toBeUndefined()
})
