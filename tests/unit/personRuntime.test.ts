/* 檔案用途：驗 SIMD 選擇、冷 Worker 回退協定及影格所有權。所在層：模型邊界回歸。主要關聯：person-worker.js、followMetrics.test.ts。 */
import { expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { sourceForVm, vmCoverageContext } from '../app-coverage/instrument'

function runtime(support: boolean | 'throw', failure = '') {
  let now = 0, checks = 0
  const paths: any[] = [], messages: any[] = [], inputs: any[] = []
  const scope: any = {
    ...vmCoverageContext(), performance: { timeOrigin: 1000, now: () => ++now }, importScripts() {},
    Vision: {
      FilesetResolver: { async isSimdSupported() { checks++; if (support === 'throw') throw new Error('synthetic probe failure'); return support } },
      ObjectDetector: { async createFromOptions(files: any, options: any) {
        paths.push(files); expect(options).toMatchObject({ baseOptions: { delegate: 'CPU' }, runningMode: 'IMAGE', scoreThreshold: .35, maxResults: 12, categoryAllowlist: ['person'] })
        if (failure === 'init' || failure === 'transfer') throw new Error('synthetic partial runtime')
        return { detect() { if (failure === 'detect') throw new Error('synthetic detection error'); return { detections: [{ boundingBox: { originX: 96, originY: 32, width: 80, height: 128 } }] } } }
      } },
    },
    postMessage(message: any, transfer?: any[]) { if (failure === 'transfer' && message.retryCompatibility) throw new Error('synthetic transfer rejection'); messages.push({ message, transfer }) },
    OffscreenCanvas: class {
      constructor(public width: number, public height: number) {}
      getContext() { return { fillRect() {}, drawImage() {} } }
      transferToImageBitmap() { const input = { closed: 0, close() { this.closed++ } }; inputs.push(input); return input }
    },
  }
  // 跑產品 handler；模型邊界可控，不能把 mock 當真實 SIMD 效能或追蹤精度證據。
  runInNewContext(sourceForVm('web/person-worker.js'), scope)
  return { paths, messages, inputs, checks: () => checks, async send(compatibility = false) {
    const bitmap = { width: 160, height: 320, closed: 0, close() { this.closed++ } }
    await scope.onmessage({ data: { bitmap, measure: true, compatibility } }); return bitmap
  } }
}

test.each([true, false, 'throw'] as const)('能力 %s 只選固定同源 runtime，正常釋放補邊及原影格', async support => {
  const run = runtime(support), bitmap = await run.send(), simd = support === true, prefix = simd ? '/vision-simd' : '/vision-wasm'
  expect(run.paths).toEqual([{ wasmLoaderPath: prefix + '.js', wasmBinaryPath: prefix + '.wasm' }])
  expect(run.messages[0].message.timing.runtime).toBe(simd ? 'simd' : 'nosimd')
  expect(run.messages[0].message.boxes).toEqual([{ x: .1, y: .1, width: .5, height: .4 }])
  expect(bitmap.closed).toBe(1); expect(run.inputs[0].closed).toBe(1)
  await run.send(); expect(run.checks()).toBe(1); expect(run.paths).toHaveLength(1)
})
test('SIMD 初始化失敗只交還同一格，不在半初始化全域重建模型', async () => {
  const run = runtime(true, 'init'), bitmap = await run.send(), reply = run.messages[0]
  expect(reply.message.retryCompatibility).toBe(true); expect(reply.message.bitmap).toBe(bitmap); expect(reply.transfer).toEqual([bitmap])
  expect(reply.message.timing).toMatchObject({ runtime: 'simd', modelInitMs: 1 }); expect(reply.message.error).toBeUndefined()
  expect(bitmap.closed).toBe(0); expect(run.inputs).toHaveLength(0); expect(run.paths).toHaveLength(1)
  // 新 Worker 明示相容模式，不能重新探測後又回到 SIMD 造成無限重試。
  const clean = runtime(true); await clean.send(true); expect(clean.checks()).toBe(0)
  expect(clean.paths[0].wasmBinaryPath).toBe('/vision-wasm.wasm'); expect(clean.messages[0].message.timing.runtime).toBe('nosimd')
})
test('相容初始化或已啟動的推論失敗不再回退，錯誤不洩露原原因', async () => {
  for (const [failure, compatibility] of [['init', true], ['detect', false]] as const) {
    const run = runtime(true, failure), bitmap = await run.send(compatibility), reply = run.messages[0].message
    expect(reply.error).toContain('分析失敗'); expect(reply.error).not.toContain('synthetic'); expect(reply.retryCompatibility).toBeUndefined()
    expect(bitmap.closed).toBe(1); expect(run.inputs.every(input => input.closed === 1)).toBe(true)
  }
})
test('交還影格失敗仍關閉原圖，不遺留一份無主影格', async () => {
  const run = runtime(true, 'transfer'), bitmap = await run.send()
  expect(run.messages[0].message.error).toContain('分析失敗'); expect(bitmap.closed).toBe(1)
})
