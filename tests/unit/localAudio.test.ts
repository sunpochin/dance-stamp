/* 檔案用途：驗證 Safari 有界音訊的格式、時間與釋放護欄。所在層：媒體單元回歸。主要關聯：web/local-audio.js、RECORD_COMPARE.md。 */
import { afterEach, expect, test } from 'bun:test'
import { audioBudget, audioReady, decodeLocalAudio, readAudioTrack, safariAudio } from '../../web/local-audio.js'

const be = (...values: number[]) => Buffer.concat(values.map(n => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b }))
const box = (name: string, ...data: Uint8Array[]) => { const body = Buffer.concat(data); return Buffer.concat([be(body.length + 8), Buffer.from(name), body]) }
function fixture(options: {silent?: boolean, samples?: number, packet?: number, edit?: number, delay?: number, codec?: number, offset?: number, fragment?: boolean} = {}) {
  const n = options.samples ?? 12, packet = options.packet ?? 4, edit = options.edit ?? 1024
  const mdat = box('mdat', Buffer.alloc(n * Math.min(packet, 4))), hdlr = box('hdlr', be(0, 0), Buffer.from(options.silent ? 'vide' : 'soun'))
  const asc = Buffer.from([options.codec ?? 0x11, 0x90]), esds = box('esds', be(0), Buffer.from([3, 22, 0, 1, 0, 4, 17, 0x40, 0x15]), Buffer.alloc(11), Buffer.from([5, 2]), asc)
  const entry = Buffer.alloc(28); entry.writeUInt16BE(1, 6)
  const stbl = box('stbl', box('stsd', be(0, 1), box('mp4a', entry, esds)), box('stts', be(0, 1, n, 1024)), box('stsc', be(0, 1, 1, n, 1)), box('stsz', be(0, packet, n)), box('stco', be(0, 1, options.offset ?? 8)))
  const minf = box('minf', box('dinf', box('dref', be(0, 1), box('url ', be(1)))), stbl)
  const edits = options.delay ? be(0, 2, options.delay, -1, 0x10000, n * 1024 - edit, edit, 0x10000) : be(0, 1, n * 1024 - edit, edit, 0x10000)
  const trak = box('trak', box('edts', box('elst', edits)), box('mdia', box('mdhd', be(0, 0, 0, 48000, n * 1024, 0)), hdlr, minf))
  const moov = box('moov', box('mvhd', be(0, 0, 0, 48000, n * 1024, 0)), trak, ...(options.fragment ? [box('mvex')] : []))
  return new Blob([mdat, moov])
}
const signal = () => new AbortController().signal
test('只針對 WebKit 選相容聲路，Chrome 與 Android 不縮減原能力', () => {
  expect(safariAudio('AppleWebKit Safari')).toBe(true)
  expect(safariAudio('AppleWebKit CriOS Mobile Safari')).toBe(true)
  expect(safariAudio('AppleWebKit Chrome Safari')).toBe(false)
  expect(safariAudio('Android AppleWebKit Safari')).toBe(false)
})
test('AAC edit list 保留來源零點，僅跳讀封包與有界 moov', async () => {
  const file = fixture(), reads: number[] = [], slice = file.slice.bind(file)
  file.slice = (start, end, type) => { reads.push((end ?? file.size) - (start ?? 0)); return slice(start, end, type) }
  const track = (await readAudioTrack(file, signal()))!
  expect(track.times[0]).toBeCloseTo(-1024 / 48000)
  expect(track.times[1]).toBe(0); expect(track.config.numberOfChannels).toBe(2)
  expect(track.offsets[11]).toBe(52); expect(Math.max(...reads)).toBeLessThan(file.size)
  expect(await readAudioTrack(fixture({ silent: true }), signal())).toBeNull()
  // extended-size atom 不是另一種 codec；有效 64-bit 長度可略過，超出安全整數則必須拒絕。
  const wide = Buffer.alloc(16); wide.writeUInt32BE(1); wide.write('free', 4); wide.writeBigUInt64BE(16n, 8)
  expect((await readAudioTrack(new Blob([wide, fixture({ offset: 24 })]), signal()))!.offsets[0]).toBe(24)
  wide.writeBigUInt64BE(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 8)
  await expect(readAudioTrack(new Blob([wide]), signal())).rejects.toThrow('Safari')
})
test('超額 metadata、封包、sample 數、offset、fragment、不支援 codec 與壞結構安全拒絕', async () => {
  const inputs = [new Blob([be(audioBudget.metadata + 1), Buffer.from('moov'), Buffer.alloc(8)]), fixture({ packet: audioBudget.packet + 1 }), fixture({ samples: 250001 }), fixture({ offset: 1 }), fixture({ fragment: true }), fixture({ codec: 0x29 }), new Blob([be(7), Buffer.from('mdat')])]
  for (const input of inputs) await expect(readAudioTrack(input, signal())).rejects.toThrow('Safari')
  const truncated = fixture(); await expect(readAudioTrack(truncated.slice(0, truncated.size - 1), signal())).rejects.toThrow()
  let largestRead = 0
  const oversized = { size: audioBudget.metadata + 1, slice: (start: number, end: number) => { largestRead = Math.max(largestRead, end - start); return new Blob([be(audioBudget.metadata + 1), Buffer.from('moov'), be(0, 0)]) } } as Blob
  await expect(readAudioTrack(oversized, signal())).rejects.toThrow('Safari'); expect(largestRead).toBe(16)
})

const original = { decoder: globalThis.AudioDecoder, chunk: globalThis.EncodedAudioChunk }
afterEach(() => { globalThis.AudioDecoder = original.decoder; globalThis.EncodedAudioChunk = original.chunk })
function environment(options: {fail?: boolean, onFlush?: () => void, rate?: number, copyFail?: boolean, decoderError?: boolean} = {}) {
  const audit = { submitted: 0, live: 0, max: 0, closed: 0, framesClosed: 0, allocations: [] as number[] }
  class Decoder {
    static async isConfigSupported() { return { supported: true } }
    state = 'configured'; callbacks: any; queue: any[] = []
    constructor(callbacks: any) { this.callbacks = callbacks }
    configure() {}
    decode(chunk: any) { audit.submitted++; this.queue.push(chunk); audit.max = Math.max(audit.max, ++audit.live) }
    async flush() {
      options.onFlush?.()
      for (const chunk of this.queue) {
        this.callbacks.output({ timestamp: chunk.timestamp, sampleRate: options.rate ?? 48000, numberOfChannels: 2, numberOfFrames: 1024, copyTo: (pcm: Float32Array) => { if (options.copyFail) throw new Error('synthetic PCM copy failure'); pcm.fill(chunk.timestamp >= 0 ? 0.25 : -0.25) }, close: () => { audit.framesClosed++ } })
        audit.live--
      }
      this.queue = []
      if (options.decoderError) this.callbacks.error(new Error('synthetic native decoder error'))
      if (options.fail) throw new Error('synthetic decoder failure')
    }
    close() { this.state = 'closed'; this.queue = []; audit.live = 0; audit.closed++ }
  }
  globalThis.AudioDecoder = Decoder as any
  globalThis.EncodedAudioChunk = class { constructor(data: object) { Object.assign(this, data) } } as any
  const context = { createBuffer: (channels: number, frames: number) => { audit.allocations.push(channels * frames * 4); const data = Array.from({ length: channels }, () => new Float32Array(frames)); return { getChannelData: (i: number) => data[i] } } } as any
  return { context, audit }
}
test('固定片段 PCM、每批最多八包、依來源 edit 時戳裁入；重試換片不沿用舊音訊', async () => {
  const { context, audit } = environment(), file = fixture()
  const buffer = await decodeLocalAudio(file, context, 0, 0.1, signal())
  expect(buffer!.getChannelData(0)[0]).toBe(0.25)
  expect(audit.allocations).toEqual([2 * 4800 * 4]); expect(audit.max).toBeLessThanOrEqual(8)
  expect(audit.framesClosed).toBe(audit.submitted); expect(audit.closed).toBe(1)
  await decodeLocalAudio(fixture({ edit: 0 }), context, 0.02, 0.1, signal())
  expect(audit.closed).toBe(2); expect(audit.allocations.length).toBe(2)
})
test('前置空 edit 的靜音不能混入已被正常 edit 丟棄的 AAC，片段從空白中途開始亦同', async () => {
  const { context, audit } = environment(), file = fixture({ samples: 120, edit: 48000, delay: 96000 })
  // 來源前一秒雖須送解碼器恢復狀態，呈現時間兩秒前仍必須完全無聲。
  for (const start of [0, 1.5]) {
    const buffer = await decodeLocalAudio(file, context, start, 2.5 - start, signal())
    for (const channel of [0, 1]) {
      const pcm = buffer!.getChannelData(channel), boundary = (2 - start) * 48000
      expect(pcm.subarray(0, boundary).every(x => x === 0)).toBe(true)
      expect(pcm[boundary]).toBe(0.25)
      expect(pcm[boundary + 1024]).toBe(0.25)
    }
  }
  expect(audit.closed).toBe(2); expect(audit.framesClosed).toBe(audit.submitted)
})
test('預先取消、解碼取消、原生錯誤與輸出規格不符都 close，壞輸出不冒充靜音', async () => {
  const aborted = new AbortController(); aborted.abort()
  const first = environment(); await expect(decodeLocalAudio(fixture(), first.context, 0, .1, aborted.signal)).rejects.toThrow(); expect(first.audit.allocations).toEqual([])
  // 原生 PCM 複製也可能丟例外；必須拒絕壞輸出並關閉 frame，不能當靜音成功。
  for (const mode of ['abort', 'fail', 'rate', 'copy', 'callback']) {
    const controller = new AbortController(), { context, audit } = environment({ onFlush: mode === 'abort' ? () => controller.abort() : undefined, fail: mode === 'fail', rate: mode === 'rate' ? 96000 : 48000, copyFail: mode === 'copy', decoderError: mode === 'callback' })
    await expect(decodeLocalAudio(fixture(), context, 0, .1, controller.signal)).rejects.toThrow()
    expect(audit.closed).toBe(1); expect(audit.live).toBe(0)
    expect(audit.framesClosed).toBe(mode === 'abort' ? 0 : audit.submitted)
  }
})
test('合法無音軌不配置 PCM；超過60秒在解析前拒絕；等待 recorder 可取消且移除監聽', async () => {
  const { context, audit } = environment()
  expect(await decodeLocalAudio(fixture({ silent: true }), context, 0, 1, signal())).toBeNull()
  await expect(decodeLocalAudio(fixture(), context, 0, 60.001, signal())).rejects.toThrow('Safari'); expect(audit.allocations).toEqual([])
  const controller = new AbortController(), pending = audioReady(new Promise(() => {}), controller.signal)
  controller.abort(); await expect(pending).rejects.toThrow()
})
test('原生音訊承諾永不完成時以逾時結束等待並撤除取消監聽', async () => {
  const timer = globalThis.setTimeout, controller = new AbortController()
  // 只壓縮本案例的十秒等待，不更改產品期限或解碼結果。
  globalThis.setTimeout = ((callback: any, delay: number, ...args: any[]) => timer(callback, delay === 10000 ? 1 : delay, ...args)) as typeof setTimeout
  try { await expect(audioReady(new Promise(() => {}), controller.signal)).rejects.toThrow('音訊準備逾時'); controller.abort() }
  finally { globalThis.setTimeout = timer }
})
