/* 用途：以純數值／合成索引核對產品引擎邊界，不啟 Worker 或 codec。所在層：隔離單元。關聯：pts-plan.js、pts-audio.js、pts-input.js。 */
import { expect, test } from 'bun:test'
import { exportPlan, outputFrames, validateFrame, validateSourceRange, validateTrack } from '../../web/pts-plan.js'
import { comparison, positions } from '../../web/timeline.js'
import { pcmCursor, copyPcm } from '../../web/pts-audio.js'
import { auditEdits } from '../../web/pts-input.js'
import { exportExplicitPts } from '../../web/export-pts.js'
import { useSamples, runProducer, closeSource } from '../../web/pts-lifecycle.js'

const base = { startMs: 0, endMs: 3000, rate: 1, offsetMs: 0, selfDurationMs: 3000, referenceMirror: false, selfMirror: false }
test('三速度、非零 A 與正負 offset 完全沿既有 positions，不把兩片一起慢播', () => {
  for (const rate of [.5, .75, 1]) for (const offsetMs of [-500, 0, 4000]) {
    const recipe = { ...base, startMs: 12000, endMs: 30000, selfDurationMs: 26000, rate, offsetMs }
    const plan = exportPlan(recipe), frames = [...outputFrames(recipe)]
    expect(plan.durationMs).toBe(comparison(recipe).durationMs)
    for (const f of [frames[0], frames[Math.floor(frames.length / 2)], frames.at(-1)!]) {
      const p = positions(recipe, f.timestamp * 1000)
      expect(f.reference).toBe(p.referenceMs / 1000); expect(f.self).toBe(p.selfMs / 1000)
    }
  }
})
test('五分鐘仍可達，最後短格不丟 B、不多造末格', () => {
  const long = { ...base, startMs: 10000, endMs: 160000, selfDurationMs: 300000, rate: .5 }
  expect(exportPlan(long).frames).toBe(9000); expect(exportPlan(long).durationMs).toBe(300000)
  expect(() => exportPlan({ ...long, endMs: 160001 })).toThrow('5 分鐘')
  for (const recipe of [base, { ...base, endMs: 1051, rate: .75 }, { ...base, endMs: 1 }]) {
    const frames = [...outputFrames(recipe)], duration = exportPlan(recipe).duration
    expect(frames.every(f => f.duration > 0 && f.timestamp < duration)).toBe(true)
    expect(frames.reduce((sum, f) => sum + f.duration, 0)).toBeCloseTo(duration, 10)
    expect(frames.at(-1)!.timestamp + frames.at(-1)!.duration).toBeCloseTo(duration, 12)
  }
})
test('60→30fps、短尾格與長 VFR interval 合法；取樣點缺格仍拒絕，不把 frame age 當時鐘漂移', () => {
  for (const recipe of [base, { ...base, endMs: 2991 }, { ...base, endMs: 1051, rate: .75 }]) {
    const last = [...outputFrames(recipe)].at(-1)!, stamp = Math.floor((last.reference + 1e-9) * 60) / 60
    expect(validateFrame({ timestamp: stamp, duration: 1 / 60 }, last.reference, recipe.rate)).toBeGreaterThanOrEqual(0)
  }
  expect(validateFrame({ timestamp: 0, duration: 1 }, .2, 1)).toBe(200)
  expect(validateFrame({ timestamp: 0, duration: 1.5 }, .75, .5)).toBe(1500)
  expect(() => validateFrame(null, 0, 1)).toThrow('覆蓋')
  expect(() => validateFrame({ timestamp: 0, duration: .1 }, .2, 1)).toThrow('覆蓋')
  expect(() => validateFrame({ timestamp: .3, duration: .1 }, .2, 1)).toThrow('覆蓋')
  expect(() => validateSourceRange(0, 3, 0, 3)).not.toThrow()
  expect(() => validateSourceRange(0, 2 + 59 / 60, 0, 3)).toThrow('完整共同區間')
  expect(() => validateSourceRange(.02, 3, 0, 3)).toThrow('完整共同區間')
})
test('跨 PCM 包裁邊保持數目／時間；小數取樣率不任意四捨五入成另一速度', () => {
  const cursor = pcmCursor({ start: 1.125, end: 2.375, declaredStart: 0, declaredEnd: 4, sampleRate: 48000, channels: 2, rate: .75 })
  const one = cursor.accept({ timestamp: 1, numberOfFrames: 48000, sampleRate: 48000, numberOfChannels: 2 })!
  const two = cursor.accept({ timestamp: 2, numberOfFrames: 48000, sampleRate: 48000, numberOfChannels: 2 })!
  expect([one.frameOffset, one.frameCount, two.frameCount]).toEqual([6000, 42000, 18000])
  expect(one.timestamp).toBe(0); expect(two.timestamp).toBeCloseTo((2 - 1.125) / .75)
  expect(cursor.finish().coveredFrames).toBe(60000)
  const fractional = pcmCursor({ start: 0, end: 1, declaredStart: 0, declaredEnd: 1, sampleRate: 22050, channels: 1, rate: .75 })
  expect(fractional.packet(0, 100).sampleRate).toBe(16537.5)
})
test('合法 empty-edit 首尾靜音與未知解碼 gap／重疊分開', () => {
  const options = { start: 0, end: 3, declaredStart: 1, declaredEnd: 2, sampleRate: 8, channels: 1, rate: 1 }
  const cursor = pcmCursor(options)
  cursor.accept({ timestamp: 1, numberOfFrames: 8, sampleRate: 8, numberOfChannels: 1 })
  expect(cursor.finish()).toMatchObject({ coveredFrames: 8, leadingSilentFrames: 8, trailingSilentFrames: 8 })
  for (const badTime of [1.5, 2]) {
    const broken = pcmCursor({ ...options, declaredStart: 0, declaredEnd: 3 })
    broken.accept({ timestamp: 0, numberOfFrames: 8, sampleRate: 8, numberOfChannels: 1 })
    expect(() => broken.accept({ timestamp: badTime, numberOfFrames: 8, sampleRate: 8, numberOfChannels: 1 })).toThrow('缺口')
    expect(() => broken.finish()).toThrow('未覆蓋')
  }
  const overlap = pcmCursor({ ...options, declaredStart: 0, declaredEnd: 3 })
  overlap.accept({ timestamp: 0, numberOfFrames: 8, sampleRate: 8, numberOfChannels: 1 })
  expect(() => overlap.accept({ timestamp: .5, numberOfFrames: 8, sampleRate: 8, numberOfChannels: 1 })).toThrow('重疊')
})
test('格線跟隨真正 PCM 相位，3ms movie edit 不強拉到絕對零', () => {
  const cursor = pcmCursor({ start: .003, end: 1.003, declaredStart: .003, declaredEnd: 1.003, gridOrigin: .003, sampleRate: 44100, channels: 1, rate: .75 })
  const part = cursor.accept({ timestamp: .003, numberOfFrames: 44100, sampleRate: 44100, numberOfChannels: 1 })!
  expect(part.timestamp).toBe(0); expect(part.frameCount).toBe(44100); expect(cursor.finish().coveredFrames).toBe(44100)
  const sample = { numberOfChannels: 2, copyTo(plane: Float32Array, options: { planeIndex: number, frameOffset: number }) { plane.set([options.planeIndex + 1, options.frameOffset]) } }
  expect([...copyPcm(sample, { frameOffset: 4, frameCount: 2 })]).toEqual([1, 4, 2, 4])
  expect(() => copyPcm({ numberOfChannels: 1, copyTo(out: Float32Array) { out.fill(NaN) } }, { frameOffset: 0, frameCount: 2 })).toThrow('非有限')
})
test('三速度五分鐘逐包 PCM 完整覆蓋；全段合法靜音與無效 track 不混為缺聲', () => {
  for (const rate of [.5, .75, 1]) {
    const seconds = 300 * rate, cursor = pcmCursor({ start: 12, end: 12 + seconds, declaredStart: 0, declaredEnd: 400, sampleRate: 48000, channels: 2, rate })
    for (let second = 12; second < 12 + seconds; second++) cursor.accept({ timestamp: second, numberOfFrames: 48000, sampleRate: 48000, numberOfChannels: 2 })
    expect(cursor.finish().coveredFrames).toBe(seconds * 48000)
    const tail = cursor.packet(cursor.last, 0); expect(tail.timestamp).toBe(300)
  }
  const before = pcmCursor({ start: 0, end: 3, declaredStart: 4, declaredEnd: 5, sampleRate: 48000, channels: 1, rate: 1 })
  expect(before.finish()).toMatchObject({ coveredFrames: 0, leadingSilentFrames: 144000, trailingSilentFrames: 0 })
  const after = pcmCursor({ start: 4, end: 7, declaredStart: 0, declaredEnd: 3, sampleRate: 48000, channels: 1, rate: 1 })
  expect(after.finish()).toMatchObject({ coveredFrames: 0, leadingSilentFrames: 0, trailingSilentFrames: 144000 })
  expect(() => validateTrack({ start: NaN, end: 3, samples: [{ time: 0, x: 0, y: 0, width: 1, height: 1 }] }, 0, 3)).toThrow('未覆蓋')
})
function box(name: string, ...parts: Uint8Array[]) {
  const out = new Uint8Array(8 + parts.reduce((n, p) => n + p.length, 0)), v = new DataView(out.buffer)
  v.setUint32(0, out.length); out.set(new TextEncoder().encode(name), 4)
  let cursor = 8; for (const p of parts) { out.set(p, cursor); cursor += p.length }
  return out
}
function movie(entries: Array<[number, number, number?]>) {
  const mvhd = new Uint8Array(16); new DataView(mvhd.buffer).setUint32(12, 1000)
  const tkhd = new Uint8Array(16); new DataView(tkhd.buffer).setUint32(12, 7)
  const elst = new Uint8Array(8 + entries.length * 12), v = new DataView(elst.buffer); v.setUint32(4, entries.length)
  entries.forEach(([duration, time, rate = 1], i) => { const p = 8 + i * 12; v.setUint32(p, duration); v.setInt32(p + 4, time); v.setInt16(p + 8, rate) })
  return new Blob([box('ftyp'), box('moov', box('mvhd', mvhd), box('trak', box('tkhd', tkhd), box('edts', box('elst', elst))))])
}
test('edit 審核只取宣告界線，拒絕庫會略過的多段與變速，不呼叫 codec', async () => {
  const signal = new AbortController().signal
  const info = await auditEdits(movie([[500, -1], [2500, 0]]), signal, true)
  expect(info.trackBounds[7]).toEqual({ start: .5, end: 3 })
  await expect(auditEdits(movie([[1000, 0], [1000, 10]]), signal, true)).rejects.toThrow('多段')
  await expect(auditEdits(movie([[1000, 0, 2]]), signal, true)).rejects.toThrow('變速')
  await expect(auditEdits(movie([[1000, -1]]), signal, true)).rejects.toThrow('純空白')
  expect(await auditEdits(new Blob(['synthetic not a movie']), signal, false)).toEqual({ container: 'non-bmff', editsChecked: 0 })
})
test('錯層 mvhd／重複 header 不得偷改 canonical scale 或 track 邊界', async () => {
  const signal = new AbortController().signal
  const mvhd = new Uint8Array(16); new DataView(mvhd.buffer).setUint32(12, 1000)
  const tkhd = new Uint8Array(16); new DataView(tkhd.buffer).setUint32(12, 7)
  const wrong = new Uint8Array(mvhd); new DataView(wrong.buffer).setUint32(12, 1000000)
  const elst = new Uint8Array(20), v = new DataView(elst.buffer); v.setUint32(4, 1); v.setUint32(8, 3000); v.setInt16(16, 1)
  const edits = box('edts', box('elst', elst)), track = box('trak', box('tkhd', tkhd), edits)
  expect((await auditEdits(new Blob([box('moov', box('mvhd', mvhd), track)]), signal, true)).trackBounds[7].end).toBe(3)
  await expect(auditEdits(new Blob([box('moov', box('mvhd', mvhd), box('trak', box('tkhd', tkhd), edits, box('mvhd', wrong)))]), signal, true)).rejects.toThrow('層級')
  await expect(auditEdits(new Blob([box('moov', box('mvhd', mvhd), box('mvhd', wrong), track)]), signal, true)).rejects.toThrow('重複')
  await expect(auditEdits(new Blob([box('moov', box('mvhd', mvhd), box('trak', box('tkhd', tkhd), box('tkhd', tkhd), edits))]), signal, true)).rejects.toThrow('重複')
  await expect(auditEdits(new Blob([box('moov', box('mvhd', mvhd), track, track)]), signal, true)).rejects.toThrow('唯一')
  await expect(auditEdits(new Blob([box('mvhd', wrong), box('moov', box('mvhd', mvhd), track)]), signal, true)).rejects.toThrow('層級')
})

test('真共用 sample 排程：add／draw 首錯不被 finally 的雙 close 錯誤覆蓋', async () => {
  for (const action of ['audio.add', 'video.add', 'draw']) {
    let first: unknown, failed = false, stopped = 0, releases = 0
    const errors: unknown[] = [], primary = new Error(action), secondary = new Error('sample.close')
    const remember = (error: unknown) => { errors.push(error); if (!failed) { failed = true; first = error } }
    const task = runProducer(() => useSamples([1, 2], async () => {
      if (action === 'draw') throw primary
      await Promise.reject(primary)
    }, remember, () => { releases++; throw secondary }), remember, () => { stopped++ })
    await expect(task).rejects.toBe(primary)
    expect(first).toBe(primary); expect(errors.slice(0, 3)).toEqual([primary, secondary, secondary])
    expect(releases).toBe(2); expect(stopped).toBe(1)
  }
})
test('source close 的非同步首錯即進 producer，立即停止 peer；不等全部格完成才 finalize', async () => {
  let first: unknown, stopped = false, writes = 0, called = 0
  const primary = new Error('AAC flush failed'), remember = (error: unknown) => { first ??= error }
  const source = { _closingPromise: null as Promise<void> | null, close() { called++; this._closingPromise = Promise.reject(primary) } }
  const firstTask = runProducer(() => closeSource(source), remember, () => { stopped = true })
  const peer = runProducer(async () => { for (; writes < 1000 && !stopped; writes++) await Promise.resolve() }, remember, () => { stopped = true })
  const result = await Promise.allSettled([firstTask, peer])
  expect(result[0]).toMatchObject({ status: 'rejected', reason: primary }); expect(first).toBe(primary)
  expect(called).toBe(1); expect(writes).toBeLessThan(1000)
  await expect(closeSource({ close() {} })).rejects.toThrow('介面不相符')
})

// 此處的 fake 只驗 owner 決策／晚訊息，絕非 Worker、codec 或實體資源驗收。
async function fakeOwner(run: (instances: any[]) => Promise<void>, terminateThrows = false) {
  const saved = { Worker: globalThis.Worker, document: globalThis.document, window: globalThis.window }
  const instances: any[] = []
  class OwnWorker {
    onmessage: any; onerror: any; onmessageerror: any; sent: any; terminated = 0
    constructor() { instances.push(this) }
    postMessage(value: any) { this.sent = value }
    terminate() { this.terminated++; if (terminateThrows) throw new Error('synthetic termination failure') }
  }
  const document = Object.assign(new EventTarget(), { hidden: false })
  Object.assign(globalThis, { Worker: OwnWorker, document, window: new EventTarget() })
  try { await run(instances) } finally { Object.assign(globalThis, saved) }
}
test('先取消保留 TimeoutError／只終止自己的 handle，晚 Blob 不被接受', async () => fakeOwner(async instances => {
  const controller = new AbortController(), promise = exportExplicitPts({ recipe: base, signal: controller.signal })
  const worker = instances[0], late = worker.onmessage
  controller.abort(new DOMException('synthetic deadline', 'TimeoutError'))
  late({ isTrusted: true, target: worker, data: { id: worker.sent.id, kind: 'result', blob: new Blob(['late']) } })
  await expect(promise).rejects.toMatchObject({ name: 'TimeoutError' })
  expect(worker.terminated).toBe(1)
}))
test('成檔訊息也須終止呼叫成功，不能把 cleanup error 當成功', async () => fakeOwner(async instances => {
  const promise = exportExplicitPts({ recipe: base }), worker = instances[0], blob = new Blob(['synthetic'], { type: 'video/mp4' })
  worker.onmessage({ isTrusted: true, target: worker, data: { id: worker.sent.id, kind: 'result', blob, diagnostics: {
    backend: 'explicit-pts', output: { bytes: blob.size }, plannedDurationMs: 3000, submittedFrames: 90, cleanupCallsCompleted: true, cleanupErrors: [],
  } } })
  await expect(promise).rejects.toThrow('synthetic termination failure'); expect(worker.terminated).toBe(1)
}, true))
test('背景先到即拒絕晚結果，Worker 首載入錯誤原文保留', async () => {
  await fakeOwner(async instances => {
    const promise = exportExplicitPts({ recipe: base }), worker = instances[0]
    Object.assign(globalThis.document, { hidden: true }); globalThis.document.dispatchEvent(new Event('visibilitychange'))
    await expect(promise).rejects.toThrow('離開前景'); expect(worker.terminated).toBe(1)
  })
  await fakeOwner(async instances => {
    const promise = exportExplicitPts({ recipe: base }), worker = instances[0]
    worker.onerror({ isTrusted: true, target: worker, message: 'synthetic module load failed', preventDefault() {} })
    await expect(promise).rejects.toMatchObject({ name: 'WorkerError', message: 'synthetic module load failed' }); expect(worker.terminated).toBe(1)
  })
})
test('含 setup 的 60 秒工作在 75 秒仍有進展時不被舊 D+10 phase 誤停；G7 90 秒目標獨立回報', async () => {
  const saved = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, performance: globalThis.performance }
  let now = 0, counter = 0
  const timers = new Map<number, { at: number, callback: () => void }>()
  const advance = (ms: number) => {
    const goal = now + ms
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= goal).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      now = next[1].at; timers.delete(next[0]); next[1].callback()
    }
    now = goal
  }
  Object.assign(globalThis, { performance: { now: () => now }, setTimeout: (callback: () => void, ms: number) => { const id = ++counter; timers.set(id, { callback, at: now + ms }); return id }, clearTimeout: (id: number) => { timers.delete(id) } })
  try {
    for (const elapsed of [75000, 95000]) await fakeOwner(async instances => {
      const promise = exportExplicitPts({ recipe: { ...base, endMs: 60000, selfDurationMs: 60000 } }), worker = instances[0]
      for (let spent = 0; spent < elapsed; spent += 5000) {
        advance(5000)
        worker.onmessage({ isTrusted: true, target: worker, data: { kind: 'progress', id: worker.sent.id, stage: 'encoding', fraction: spent / elapsed } })
      }
      expect(worker.terminated).toBe(0)
      const blob = new Blob(['synthetic'], { type: 'video/mp4' })
      worker.onmessage({ isTrusted: true, target: worker, data: { id: worker.sent.id, kind: 'result', blob, diagnostics: { backend: 'explicit-pts', output: { bytes: blob.size }, plannedDurationMs: 60000, submittedFrames: 1800, cleanupCallsCompleted: true, cleanupErrors: [] } } })
      const result = await promise
      expect(result.diagnostics).toMatchObject({ ownerElapsedMs: elapsed, g7SixtySecondTargetMs: 90000, g7SixtySecondOwnerIntervalExceeded: elapsed > 90000 })
      expect(timers.size).toBe(0)
    })
  } finally { Object.assign(globalThis, saved) }
})


test('取消／錯誤不得標 G7 通過，僅記 owner interval 與界線', async () => {
  for (const mode of ['abort', 'error']) await fakeOwner(async instances => {
    const controller = new AbortController(), promise = exportExplicitPts({ recipe: { ...base, endMs: 60000, selfDurationMs: 60000 }, signal: controller.signal })
    const worker = instances[0]
    if (mode === 'abort') controller.abort(new DOMException('synthetic cancel', 'AbortError'))
    else worker.onmessage({ isTrusted: true, target: worker, data: { kind: 'error', id: worker.sent.id, error: { name: 'EncodingError', message: 'synthetic encoder failure' } } })
    const error = await promise.catch(error => error)
    expect(error.metadata).not.toHaveProperty('g7SixtySecondTargetMet')
    expect(error.metadata).toMatchObject({ g7SixtySecondTargetMs: 90000, g7SixtySecondOwnerIntervalExceeded: false })
    expect(error.metadata.ownerElapsedMs).toBeGreaterThanOrEqual(0)
  })
})


test('Worker plain error record 保留 EncodingError 與原診斷，空白／非字串名稱才回 Error', async () => {
  for (const name of ['EncodingError', '  ', 17]) await fakeOwner(async instances => {
    const promise = exportExplicitPts({ recipe: base }), worker = instances[0]
    const diagnostics = { firstError: { name: 'EncodingError', phase: 'audio.flush' }, cleanupErrors: [{ name: 'output.cancel', error: 'EncodingError' }], selectedPresentationLagMs: { reference: 21, self: 12 } }
    worker.onmessage({ isTrusted: true, target: worker, data: { kind: 'error', id: worker.sent.id, error: { name, message: 'synthetic encoder first error' }, diagnostics } })
    const error = await promise.catch(error => error)
    expect(error.name).toBe(name === 'EncodingError' ? name : 'Error')
    expect(error.message).toBe('synthetic encoder first error')
    for (const key of Object.keys(diagnostics)) expect(error.metadata[key]).toEqual(diagnostics[key as keyof typeof diagnostics])
    expect(worker.terminated).toBe(1)
  })
})
