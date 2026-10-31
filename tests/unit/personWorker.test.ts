/* 檔案用途：驗證人物背景分析的回覆、重試與影格釋放。所在層：單元回歸。主要關聯：web/person-worker.js、app-coverage/instrument.ts、#103。 */
import { expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { sourceForVm, vmCoverageContext } from '../app-coverage/instrument'

function worker(failure = '') {
  const calls = { imports: [] as string[], options: [] as any[], replies: [] as any[], inputs: [] as any[] }
  const fail = (phase: string) => {
    if (failure !== phase) return
    failure = ''
    throw new Error('synthetic engine failure')
  }
  const detector = { detect() { fail('detect'); return { detections: [{ boundingBox: { originX: 40, originY: 20, width: 80, height: 120 } }, {}] } } }
  const scope: any = {
    ...vmCoverageContext(),
    importScripts(path: string) { calls.imports.push(path); fail('import') },
    Vision: { ObjectDetector: { async createFromOptions(files: unknown, options: unknown) {
      calls.options.push(structuredClone({ files, options })); fail('load'); return detector
    } } },
    postMessage(value: unknown) { fail('post'); calls.replies.push(structuredClone(value)) },
    OffscreenCanvas: class {
      constructor(public width: number, public height: number) {}
      getContext() { return { fillRect() {}, drawImage() {} } }
      transferToImageBitmap() {
        const input = { width: this.width, height: this.height, closed: 0, close() { this.closed++ } }
        calls.inputs.push(input); return input
      }
    },
  }
  // 跑產品原 handler 並沿用來源綁定計數器；只替換模型依賴，不另寫一套背景分析流程。
  runInNewContext(sourceForVm('web/person-worker.js'), scope)
  const bitmap = (width = 400, height = 200) => ({ width, height, closed: 0, close() { this.closed++ } })
  return { calls, bitmap, send: (value: ReturnType<typeof bitmap>) => scope.onmessage({ data: { bitmap: value } }) }
}

test('模型只載入一次，逐張依尺寸正規化、略過缺框結果並釋放影格', async () => {
  const current = worker(), first = current.bitmap(), second = current.bitmap(200, 400)
  await current.send(first); await current.send(second)
  // 兩張尺寸不同；新增補邊後扣回原選框並裁邊，不能把模型重用當成座標也重用。
  expect(current.calls.replies).toEqual([
    { boxes: [{ x: .1, y: 0, width: .2, height: .2 }] },
    { boxes: [{ x: 0, y: .05, width: .1, height: .3 }] },
  ])
  expect([first.closed, second.closed]).toEqual([1, 1])
  expect(current.calls.inputs.map(input => input.closed)).toEqual([1, 1])
  expect(current.calls.imports).toEqual(['/vision-bundle.js'])
  expect(current.calls.options).toHaveLength(1)
  const { files, options } = current.calls.options[0]
  expect(files).toEqual({ wasmLoaderPath: '/vision-wasm.js', wasmBinaryPath: '/vision-wasm.wasm' })
  expect(options.baseOptions).toEqual({ modelAssetPath: '/person-model.tflite', delegate: 'CPU' })
  expect(options.runningMode).toBe('IMAGE')
  expect(options.categoryAllowlist).toEqual(['person'])
})

test.each(['import', 'load', 'detect', 'post'])('%s 失敗也釋放影格，只回通用錯誤並能處理下一張', async phase => {
  const current = worker(phase), failed = current.bitmap()
  await current.send(failed)
  expect(failed.closed).toBe(1)
  expect(current.calls.replies).toHaveLength(1)
  expect(Object.keys(current.calls.replies[0])).toEqual(['error'])
  expect(current.calls.replies[0].error).toContain('本機人物偵測')
  expect(current.calls.replies[0].error).not.toContain('synthetic engine failure')
  const retry = current.bitmap()
  await current.send(retry)
  expect(retry.closed).toBe(1)
  expect(current.calls.replies).toHaveLength(2)
  expect(current.calls.replies[1]).toEqual({ boxes: [{ x: .1, y: 0, width: .2, height: .2 }] })
  expect(current.calls.inputs.every(input => input.closed === 1)).toBe(true)
})

// 補邊比例與失敗收尾跑同一份產品來源，兩份獨立 review 的回歸都必須留下。
function geometryWorker() {
  const inputs: any[] = [], draws: any[] = [], messages: any[] = [], options: any[] = []
  let detections: any[] = [], failure = false
  const scope: any = {
    ...vmCoverageContext(),
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
  runInNewContext(sourceForVm('web/person-worker.js'), scope)
  return { inputs, draws, messages, options, async detect(width: number, height: number, boxes: any[], fail = false) {
    detections = boxes.map(boundingBox => ({ boundingBox })); failure = fail
    const bitmap = { width, height, closed: false, close() { this.closed = true } }
    await scope.onmessage({ data: { bitmap } }); return bitmap
  } }
}

test('狹長選框等比補邊，偵測框扣掉補邊後回到原選框', async () => {
  const run = geometryWorker(), bitmap = await run.detect(160, 640, [{ originX: 260, originY: 64, width: 120, height: 512 }])
  expect(run.inputs[0]).toMatchObject({ width: 640, height: 640, closed: true })
  // 沒有傳目標寬高，才能證明人體沒有被拉成方形；只平移到補邊中央。
  expect(run.draws[0]).toEqual([bitmap, 240, 0])
  expect(run.messages[0]).toEqual({ boxes: [{ x: .125, y: .1, width: .75, height: .8 }] })
  expect(bitmap.closed).toBe(true)
  expect(run.options[0]).toMatchObject({ scoreThreshold: .35, categoryAllowlist: ['person'] })
})

test('橫框與方框也還原正確；補邊外的框丟棄，交界只保留實際像素', async () => {
  const run = geometryWorker()
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
  const run = geometryWorker(), bitmap = await run.detect(160, 640, [], true)
  expect(bitmap.closed).toBe(true); expect(run.inputs[0].closed).toBe(true)
  expect(run.messages[0].error).toContain('分析失敗'); expect(run.messages[0].boxes).toBeUndefined()
})
