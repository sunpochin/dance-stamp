/* 檔案用途：驗證非 video 影格的裁切／鏡像圖層契約與原生讀值界線。所在層：純合成回歸。主要關聯：comparison-renderer.js、follow.js、comparison-appearance.js。 */
import { expect, test } from 'bun:test'
import { videoFrame, drawSideBySide, drawLayer, drawOverlay, drawAdjustedSide, type Frame } from '../../web/comparison-renderer.js'
import { frameCrop, sourceCrop } from '../../web/follow.js'

const value = { startMs: 0, endMs: 3000, rate: 1, offsetMs: 0, selfDurationMs: 3000, referenceMirror: true, selfMirror: false }
const identity = { scale: 1, x: 0, y: 0 }
function surface() {
  const calls: unknown[][] = [], stack: number[] = []
  const context = {
    globalAlpha: 1, fillStyle: '', font: '',
    save() { stack.push(this.globalAlpha); calls.push(['save']) },
    restore() { this.globalAlpha = stack.pop()!; calls.push(['restore']) },
    translate(...args: number[]) { calls.push(['translate', ...args]) },
    scale(...args: number[]) { calls.push(['scale', ...args]) },
    fillRect(...args: number[]) { calls.push(['fillRect', ...args]) },
    fillText(...args: unknown[]) { calls.push(['label', ...args]) },
    drawImage(...args: unknown[]) { calls.push(['drawImage', ...args]) },
    beginPath() {}, rect(...args: number[]) { calls.push(['clipRect', ...args]) }, clip() {},
  }
  return { context: context as unknown as CanvasRenderingContext2D, calls }
}
test('原生 adapter 在無跟隨時不增加 currentTime 讀取，文字不跟著媒體鏡像', () => {
  let reads = 0
  const video = { readyState: 2, videoWidth: 320, videoHeight: 240, get currentTime() { reads++; return 13 } } as HTMLVideoElement
  const frame = videoFrame(video), { context, calls } = surface()
  drawSideBySide(context, { reference: { frame, track: null }, self: { frame, track: null } }, value)
  expect(reads).toBe(0)
  expect(calls.filter(row => row[0] === 'drawImage').every(row => row[1] === video)).toBe(true)
  expect(calls.filter(row => row[0] === 'scale')).toEqual([['scale', -1, 1], ['scale', 1, 1]])
  expect(calls.filter(row => row[0] === 'label')).toEqual([['label', '示範', 22, 33], ['label', '我', 662, 33]])
  expect(videoFrame({ readyState: 1 } as HTMLVideoElement)).toBeNull()
})
test('明確影格不需要 DOM video，跟隨時間／來源裁切與舊 adapter 相同', () => {
  const { context } = surface(), drawn: unknown[][] = []
  const track = { start: 12, end: 14, held: 0, samples: [
    { time: 12, x: .05, y: .05, width: .3, height: .85 }, { time: 14, x: .45, y: .05, width: .3, height: .85 },
  ] }
  const frame: Frame = { width: 320, height: 240, time: 13, draw(ctx, ...area) { drawn.push([ctx.globalAlpha, ...area]) } }
  drawOverlay(context, 1280, 720, { reference: { frame, track }, self: { frame, track: null } }, value,
    { layout: 'overlay', opacity: .35, reference: identity, self: identity })
  expect(drawn.map(row => row.slice(0, 5))).toEqual([[1, 0, 0, 320, 240], [.35, 80, 12, 96, 204]])
  expect(frameCrop(320, 240, 13, track)).toEqual(sourceCrop({ currentTime: 13, videoWidth: 320, videoHeight: 240 } as HTMLVideoElement, track))
})
test('繪圖失敗仍還原圖層狀態；未調整側只複用原像素，調整側保留半框裁切', () => {
  const { context, calls } = surface()
  const frame: Frame = { width: 320, height: 240, time: 0, draw() { throw new Error('synthetic draw failure') } }
  const sources = { reference: { frame, track: null }, self: { frame, track: null } }
  expect(() => drawLayer(context, sources.reference, 640, 672, true, identity, .25)).toThrow('synthetic draw failure')
  expect(context.globalAlpha).toBe(1)
  expect(calls.at(-1)).toEqual(['restore'])
  const original = {} as HTMLCanvasElement
  drawAdjustedSide(context, original, sources, value, [1, 0, 0, 1, 0, 0])
  expect(calls.at(-1)).toEqual(['drawImage', original, 0, 0])
  expect(() => drawAdjustedSide(context, original, sources, value, [1, 0, 0, 2, 0, 0])).toThrow('synthetic draw failure')
  expect(calls.filter(row => row[0] === 'clipRect')).toEqual([['clipRect', 640, 48, 640, 672]])
  expect(calls.slice(-2)).toEqual([['restore'], ['restore']])
})
