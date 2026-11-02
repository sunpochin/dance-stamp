/* 用途：以實際像素檢查標記區與原來源碼不互蓋；層：QA回歸；關聯：vs-content.js、analyze-vs.py。 */
import { expect, test } from 'bun:test'
import { mark, readComposite, crc16 } from '../../scripts/qa/vs-content.js'
function surface() {
  const data = new Uint8ClampedArray(288 * 132 * 4).fill(0)
  return { data, ctx: { fillStyle: 'black', globalAlpha: 1, save() {}, restore() {}, setTransform() {}, fillRect(x: number, y: number, w: number, h: number) {
    // 同一標記從輸出座標裁入PNG；模擬像素而非比較函式原始碼。
    for (let dy = y - 4; dy < y - 4 + h; dy++) for (let dx = x - 256; dx < x - 256 + w; dx++) data[(dy * 288 + dx) * 4] = this.fillStyle === 'white' ? 255 : 0
  }, getImageData() { return { data } } } }
}
function source(data: Uint8ClampedArray, code: number, row: number) {
  for (let bit = 0; bit < 12; bit++) for (let y = row - 2; y <= row + 2; y++) for (let x = 9 + bit * 24 - 2; x <= 9 + bit * 24 + 2; x++) data[(y * 288 + x) * 4] = code >> bit & 1 ? 255 : 0
}
test('標記邊界碼可讀且原兩側碼保留；中間灰階／錯CRC拒絕', () => {
  for (const id of [0, 1, 32768, 65535]) {
    const { data, ctx } = surface(); source(data, 360, 57); source(data, 361, 107); mark(ctx, id)
    expect(readComposite(ctx)).toEqual({ id, codes: [360, 361] })
    for (let y = 2; y <= 6; y++) for (let x = 6; x <= 10; x++) data[(y * 288 + x) * 4] = 128
    expect(() => readComposite(ctx)).toThrow('ambiguous')
  }
  const { data, ctx } = surface(); mark(ctx, 17)
  for (let y = 2; y <= 6; y++) for (let x = 6; x <= 10; x++) data[((y + 24) * 288 + x) * 4] = (crc16(17) & 1) ? 0 : 255
  expect(() => readComposite(ctx)).toThrow('CRC')
  expect(() => mark(ctx, 65536)).toThrow('overflow')
})

test('獨立分析器以身分配對並拒絕錯配／保留缺碼與多義', () => {
 const r = Bun.spawnSync(['python3', 'scripts/qa/analyze-vs.py', '--selfcheck']); expect(r.exitCode).toBe(0); expect(r.stdout.toString()).toContain('wrong-code rejected');
})

test('file旁聽只接受同資料夾原檔與有界期限；不自行播放且保留undefined型別', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm')
  const code = readFileSync('scripts/qa/play-capture-file.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1]
  const execute = (search: string) => {
    const listeners: Record<string, () => void> = {}, out = { textContent: '' }, save = { href: '', hidden: true }, timeouts: number[] = []
    // 沒有play/pause/seek方法，工具若擅自操作播放就會直接失敗。
    const video = { src: '', duration: 60.038, currentTime: 60.038, ended: true, paused: true, muted: true, addEventListener(type: string, fn: () => void) { listeners[type] = fn }, getVideoPlaybackQuality: () => ({ totalVideoFrames: 2108, droppedVideoFrames: 2, corruptedVideoFrames: 0 }) }
    runInNewContext(code, { URLSearchParams, location: { search, protocol: 'file:' }, navigator: { onLine: true }, performance: { now: () => 1 }, document: { querySelector: (id: string) => id === '#v' ? video : id === '#out' ? out : save }, setTimeout: (_fn: unknown, ms: number) => { timeouts.push(ms); return 1 }, clearTimeout() {} })
    return { video, listeners, out, save, timeouts }
  }
  const env = execute('?file=vs-0.75-60-single.webm&watchdogMs=90000')
  expect(env.video.src).toBe('vs-0.75-60-single.webm'); expect(env.timeouts).toEqual([])
  env.listeners.play(); expect(env.timeouts).toEqual([90000]); env.listeners.ended()
  const receipt = JSON.parse(env.out.textContent)
  expect(receipt.reason).toBe('ended'); expect(receipt.final.audioDecodedBytes).toEqual({ type: 'undefined', value: null }); expect(receipt.final.droppedVideoFrames.value).toBe(2)
  for (const query of ['?file=../outside.webm', '?file=https://example.com/a.webm', '?file=a.webm&watchdogMs=NaN', '?file=a.webm&watchdogMs=999999']) expect(() => execute(query)).toThrow('invalid')
})

test('旁聽讀碼／取消失敗仍照原receiver與參數呼叫產品API，釋放其他旁聽資源', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm')
  const calls: unknown[] = [], listeners: Record<string, Function> = {}, videos: any[] = []
  class Track { requestFrame(...args: unknown[]) { calls.push(['request', this, args]); return 'request-return' } stop(...args: unknown[]) { calls.push(['stop', this, args]); return 'stop-return' } }
  const track = new Track(), stream = { getVideoTracks: () => [track], getTracks: () => [track] }
  class Canvas { id = 'canvas'; getContext() { return {} } captureStream(...args: unknown[]) { calls.push(['capture', this, args]); return stream } }
  class Context { fillRect() {} }
  class Audio { createBufferSource() {} }
  const node = (tag: string): any => {
    if (tag === 'canvas') return { width: 0, height: 0, getContext: () => ({}) }
    const value: any = { style: {}, append() {}, setAttribute() {}, addEventListener() {}, getBoundingClientRect: () => ({}), requestVideoFrameCallback: () => 17, cancelVideoFrameCallback() { calls.push(['cancel', tag]); if (tag === 'video') throw Error('native cancel observer fault') }, play: () => Promise.resolve(), pause() { calls.push(['pause observer']) } }
    if (tag === 'video') videos.push(value)
    return value
  }
  const ref = node('reference'), self = node('self'), global: any = { __vsQAConfig: {}, HTMLCanvasElement: Canvas, CanvasRenderingContext2D: Context, BaseAudioContext: Audio, MediaStreamTrack: Track, navigator: { userAgent: 'synthetic-test', mediaDevices: {} }, performance: { now: () => 1, timeOrigin: 0 }, window: { addEventListener() {} }, document: { visibilityState: 'visible', hasFocus: () => true, createElement: node, body: { append() {} }, addEventListener: (type: string, fn: Function) => { listeners[type] = fn }, getElementById: (id: string) => id === 'reference' ? ref : self }, mark() { throw Error('readback fault') }, composite() {}, readSource() {}, innerHeight: 100, innerWidth: 100 }
  // 執行真正旁聽器，只以注入的合成像素讀取器製造故障，不用字串斷言冒充API行為。
  runInNewContext(readFileSync('scripts/qa/vs-observer.js', 'utf8').replace(/^import .*;$/m, ''), global)
  listeners.click({ target: { closest: () => ({ id: 'export' }) }, isTrusted: true })
  const canvas = new Canvas(); expect(canvas.captureStream(0)).toBe(stream)
  expect(track.requestFrame('same')).toBe('request-return'); expect(track.stop('same-stop')).toBe('stop-return')
  expect(calls[0]).toEqual(['capture', canvas, [0]])
  expect(calls.find((x: any) => x[0] === 'request')).toEqual(['request', track, ['same']])
  expect(calls.find((x: any) => x[0] === 'stop')).toEqual(['stop', track, ['same-stop']])
  expect(calls.some((x: any) => x[0] === 'pause observer')).toBe(true); expect(videos[0].srcObject).toBe(null)
})
