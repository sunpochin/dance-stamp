/* 檔案用途：鎖住數拍估算與點拍的靜音、誤觸及速度邊界。所在層：純邏輯測試。主要關聯：web/tempo.js。 */
import { expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { sourceForVm, vmCoverageContext } from '../app-coverage/instrument'
import { estimateTempo, tapTempo } from '../../web/tempo.js'
function counting(bpm: number) {
  // 合成每個數字的音量輪廓，含輕微音節和不等音量；不含真人聲音。
  return Array.from({ length: 2000 }, (_, i) => {
    const phase = (i / 100 * bpm / 60) % 1
    return 0.001 + (Math.exp(-(((phase - 0.15) / 0.09) ** 2)) + 0.25 * Math.exp(-(((phase - 0.3) / 0.06) ** 2))) * (0.3 + 0.1 * Math.sin(i / 51))
  })
}
test('穩定數拍及半拍歧義保留可校正的速度', () => {
  for (const bpm of [20, 40, 80, 120, 137.5, 180, 240, 300]) {
    const result = estimateTempo(counting(bpm))
    expect(result).not.toBeNull()
    const error = Math.min(...[0.5, 1, 2].map(factor => Math.abs(result!.bpm * factor - bpm)))
    expect(error).toBeLessThan(2)
  }
})
test('靜音、過短、固定底噪及無規律音量不冒充穩定拍點', () => {
  for (const values of [[], counting(120).slice(0, 500), Array(2000).fill(0), Array(2000).fill(0.2), Array(2000).fill(NaN)]) expect(estimateTempo(values)).toBeNull()
  let seed = 17
  const noise = Array.from({ length: 2000 }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 })
  expect(estimateTempo(noise)).toBeNull()
})
test('點拍需要三次，排除一次誤觸並保留小數速度', () => {
  expect(tapTempo([0, 500])).toBeNull()
  expect(tapTempo([0, 500, 1000, 1500, 1600])).toBe(120)
  expect(tapTempo([0, 60000 / 137.5, 120000 / 137.5])).toBe(137.5)
  expect(tapTempo([0, 0, 0])).toBeNull()
  expect(tapTempo([0, 100, 200])).toBeNull()
})


function envelopeWorker() {
  const messages: { id: number, values: number[] }[] = []
  let Processor: any
  const scope = {
    ...vmCoverageContext(), sampleRate: 1000,
    AudioWorkletProcessor: class { port = { onmessage: null, postMessage(value: any) { messages.push(structuredClone(value)) } } },
    registerProcessor(name: string, value: any) { expect(name).toBe('tempo-envelope'); Processor = value },
  }
  // Worklet 有自己的全域；直接執行產品類別，不能拿主頁計數冒充它已被測過。
  runInNewContext(sourceForVm('web/tempo-worklet.js'), scope)
  const processor = new Processor()
  return { processor, messages, send: (data: any) => processor.port.onmessage({ data }) }
}

test('音量執行緒原聲直通、缺聲道補第一側／靜音，停止只回覆當次片段一次', () => {
  const { processor, messages, send } = envelopeWorker()
  const left = new Float32Array(20).fill(0.5), right = new Float32Array(20).fill(1)
  const output = [new Float32Array(20), new Float32Array(20), new Float32Array(20)]
  expect(processor.process([[left, right]], [output])).toBe(true)
  expect(output).toEqual([left, right, left]); expect(messages).toEqual([])
  send({ type: 'start', id: 7 }); processor.process([[left, right]], [output]); send('stop'); send('stop')
  expect(messages).toHaveLength(1); expect(messages[0].id).toBe(7); expect(messages[0].values).toHaveLength(2)
  for (const value of messages[0].values) expect(value).toBeCloseTo(Math.sqrt(0.625), 8)
  const silence = new Float32Array(20).fill(1)
  processor.process([[]], [[silence]])
  expect([...silence]).toEqual(Array(20).fill(0)); expect(messages).toHaveLength(1)
})

test('取消不交付半份分析，重新開始不沿用前次樣本與requestId', () => {
  const { processor, messages, send } = envelopeWorker()
  const samples = new Float32Array(15).fill(1), output = new Float32Array(15)
  send({ type: 'start', id: 1 }); processor.process([[samples]], [[output]]); send('cancel'); send('stop')
  expect(messages).toEqual([]); expect(processor.values).toHaveLength(0)
  send({ type: 'start', id: 2 }); processor.process([[samples]], [[output]])
  send({ type: 'start', id: 3 })
  processor.process([[new Float32Array(10).fill(0.25)]], [[new Float32Array(10)]]); send('stop')
  expect(messages).toEqual([{ id: 3, values: [0.25] }]); expect(processor.values).toHaveLength(0)
})

test('音量執行緒到二十秒上限即交付2000份包絡，後續音訊仍通過且不再累積', () => {
  const { processor, messages, send } = envelopeWorker()
  const samples = new Float32Array(128).fill(0.5), output = new Float32Array(128)
  send({ type: 'start', id: 11 })
  for (let i = 0; i < 160; i++) expect(processor.process([[samples]], [[output]])).toBe(true)
  expect(messages).toHaveLength(1); expect(messages[0].id).toBe(11)
  expect(messages[0].values).toHaveLength(2000); expect(new Set(messages[0].values)).toEqual(new Set([0.5]))
  expect(processor.active).toBe(false); expect(processor.values).toHaveLength(0)
  expect(output).toEqual(samples); send('stop'); expect(messages).toHaveLength(1)
})
