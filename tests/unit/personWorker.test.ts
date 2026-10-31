/* 檔案用途：驗證人物背景分析的回覆、重試與影格釋放。所在層：單元回歸。主要關聯：web/person-worker.js、app-coverage/instrument.ts、#103。 */
import { expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { sourceForVm, vmCoverageContext } from '../app-coverage/instrument'

function worker(failure = '') {
  const calls = { imports: [] as string[], options: [] as any[], replies: [] as any[] }
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
  }
  // 跑產品原 handler 並沿用來源綁定計數器；只替換模型依賴，不另寫一套背景分析流程。
  runInNewContext(sourceForVm('web/person-worker.js'), scope)
  const bitmap = (width = 400, height = 200) => ({ width, height, closed: 0, close() { this.closed++ } })
  return { calls, bitmap, send: (value: ReturnType<typeof bitmap>) => scope.onmessage({ data: { bitmap: value } }) }
}

test('模型只載入一次，逐張依尺寸正規化、略過缺框結果並釋放影格', async () => {
  const current = worker(), first = current.bitmap(), second = current.bitmap(200, 400)
  await current.send(first); await current.send(second)
  // 兩張尺寸不同，不能把模型重用誤寫成座標或前張回覆也重用。
  expect(current.calls.replies).toEqual([
    { boxes: [{ x: .1, y: .1, width: .2, height: .6 }] },
    { boxes: [{ x: .2, y: .05, width: .4, height: .3 }] },
  ])
  expect([first.closed, second.closed]).toEqual([1, 1])
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
  expect(current.calls.replies[1]).toEqual({ boxes: [{ x: .1, y: .1, width: .2, height: .6 }] })
})
