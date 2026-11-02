/* 用途：重現診斷工具遮錯、首格互等與晚到事件；層：QA回歸；關聯：scripts/qa/capture-lifecycle.js。 */
import { expect, test } from 'bun:test'
import { bounded, runCapture, frameScheduler } from '../../scripts/qa/capture-lifecycle.js'

const timing = { play: 30, observe: 60, stop: 10, cleanup: 10, duration: 8 }
function fixture(options: { failPlay?: boolean; failPause?: boolean; failTrack?: boolean; noFrame?: boolean; noStop?: boolean; late?: boolean; failSource?: boolean; hangClose?: boolean; failPublish?: boolean } = {}) {
  const calls: string[] = [], chunks: Blob[] = [], receipts: any[] = []
  let tick = 0, started = false, callback: any, lateData: any, stoppedSource = 0, removed = false, sourceStart = false
  const tracks = [0, 1].map(index => ({ kind: index ? 'audio' : 'video', readyState: 'live', requestFrame() { calls.push('frame'); if (!options.noFrame) resolvePlay(); }, stop() { calls.push('track' + index); if (index === 0 && options.failTrack) throw Error('track cleanup'); this.readyState = 'ended'; } }))
  let resolvePlay: () => void = () => {}
  const play = new Promise<void>(resolve => { resolvePlay = resolve })
  const video: any = { srcObject: null, play() { calls.push('play'); return options.failPlay ? Promise.reject(Error('first play failure')) : play }, pause() { calls.push('pause'); if (options.failPause) throw Error('pause cleanup') }, requestVideoFrameCallback(fn: any) { callback = fn; return 1 }, cancelVideoFrameCallback() { calls.push('rvfc cancel') } }
  const clock = { state: 'suspended', currentTime: 0, async resume() { clock.state = 'running' }, async close() { calls.push('close'); if (options.hangClose) return new Promise<void>(() => {}); clock.state = 'closed' } }
  const recorder: any = { stream: null, state: 'inactive', start() { this.state = 'recording'; started = true; calls.push('record') }, stop() { this.state = 'inactive'; lateData = this.ondataavailable; if (!options.noStop) setTimeout(() => { this.ondataavailable?.({ data: new Blob(['synthetic']), timecode: 0 }); this.onstop?.() }, 0) } }
  const env: any = {
    video, delay: 0, now: () => tick, visible: () => 'visible',
    makeStream: () => ({ getVideoTracks: () => [tracks[0]], getTracks: () => tracks }),
    makeAudio: () => ({ clock, tracks, prepare() {}, start() { if (options.failSource) throw Error('source start'); sourceStart = true }, stop() { stoppedSource++; if (!sourceStart) throw Error('InvalidStateError: stop before start') } }),
    makeRecorder(stream: any) { recorder.stream = stream; return recorder },
    raf(fn: any) { return setTimeout(() => { tick += 4; fn() }, 0) }, caf: clearTimeout,
    onInterrupt: () => () => { removed = true },
    paint(result: any) { result.paintLog.push({ id: result.paintLog.length, begin: tick, end: tick }) },
    snapshot: (metadata: any) => metadata, readPixels: () => ({ id: 1 }), chunk: (value: Blob) => chunks.push(value),
    async saveMedia() { return { bytes: chunks.reduce((n, chunk) => n + chunk.size, 0) } },
    async publish(value: any) { receipts.push(structuredClone(value)); if (options.failPublish) throw Error('publish refused') }
  }
  return { env, calls, receipts, tracks, clock, recorder, chunks, get started() { return started }, get stoppedSource() { return stoppedSource }, get removed() { return removed }, late() { callback(999, { captureTime: 999 }); lateData?.({ data: new Blob(['late']), timecode: 999 }); resolvePlay(); } }
}
test('啟動前失敗加收尾丟錯，第一錯誤與完整收據仍保存；未start音源不可stop', async () => {
  const f = fixture({ failPlay: true, failPause: true, failTrack: true })
  const { receipt, publication } = await runCapture(f.env, timing)
  expect(receipt.firstError.message).toBe('first play failure')
  expect(receipt.cleanupErrors.map((x: any) => x.name)).toEqual(['video pause', 'track 0'])
  expect(f.stoppedSource).toBe(0); expect(f.started).toBe(false)
  expect(f.calls).toContain('track1'); expect(f.clock.state).toBe('closed'); expect(f.removed).toBe(true)
  expect(f.receipts).toEqual([receipt]); expect(publication.ok).toBe(true)
})
test('play真正等待requestFrame，生產者必須在await完成前提供首格，正常錄影可收尾', async () => {
  const f = fixture(); const { receipt } = await runCapture(f.env, timing)
  expect(receipt.firstError).toBeNull(); expect(f.calls.indexOf('frame')).toBeLessThan(f.calls.indexOf('record'))
  expect(receipt.stopObserved).toBe(true); expect(receipt.media.bytes).toBeGreaterThan(0)
  expect(f.tracks.every(t => t.readyState === 'ended')).toBe(true); expect(f.stoppedSource).toBe(1)
})
test('舊順序確實互等到期限；不是只檢查實作字串', async () => {
  const f = fixture()
  await expect(bounded(() => f.env.video.play(), 5, 'legacy play')).rejects.toThrow('legacy play timeout')
  expect(f.calls).not.toContain('frame')
})
test('play逾時與晚到callback不能更動已送出的收據', async () => {
  const f = fixture({ noFrame: true }); const output = await runCapture(f.env, timing)
  const frozen = JSON.stringify(output.receipt); f.late(); await Bun.sleep(3)
  expect(output.receipt.firstError.message).toBe('direct video play timeout')
  expect(JSON.stringify(output.receipt)).toBe(frozen); expect(f.receipts).toEqual([output.receipt]); expect(f.started).toBe(false)
})
test('stop沒通知及close懸掛都要有界結束，仍釋放軌並發收據', async () => {
  const f = fixture({ noStop: true, hangClose: true }); const { receipt } = await runCapture(f.env, timing)
  expect(receipt.firstError.message).toBe('recorder stop timeout')
  expect(receipt.cleanupErrors.map((x: any) => x.name)).toEqual(['recorder drain', 'audio close'])
  expect(f.tracks.every(t => t.readyState === 'ended')).toBe(true); expect(f.receipts).toHaveLength(1)
})
test('recorder已start但音源start丟錯仍stop/drain，音源不誤stop，POST失敗另記', async () => {
  const f = fixture({ failSource: true, failPublish: true }); const { receipt, publication } = await runCapture(f.env, timing)
  expect(receipt.firstError.message).toBe('source start'); expect(f.recorder.state).toBe('inactive')
  expect(receipt.cleanupErrors).toEqual([]); expect(f.stoppedSource).toBe(0); expect(publication.ok).toBe(false); expect(f.clock.state).toBe('closed')
})
test('原finally模式會遮蔽第一錯誤並跳過track；回歸保留這個反例', () => {
  let trackStopped = false
  const unstarted = { stop() { throw Error('InvalidStateError: stop before start') } }
  const legacy = () => { try { throw Error('first play failure') } finally { unstarted.stop(); trackStopped = true } }
  expect(legacy).toThrow('InvalidStateError: stop before start'); expect(trackStopped).toBe(false)
})

test('Safari式Window receiver限制：未綁定會首錯＋收尾錯，薄包裝保留receiver後正常完成', async () => {
  const f = fixture(), schedule = f.env.raf, cancel = f.env.caf
  const nativeWindow = {
    requestAnimationFrame(callback: any) { if (this !== nativeWindow) throw TypeError('Window request receiver'); return schedule(callback) },
    cancelAnimationFrame(id: any) { if (this !== nativeWindow) throw TypeError('Window cancel receiver'); cancel(id) }
  }
  f.env.raf = nativeWindow.requestAnimationFrame; f.env.caf = nativeWindow.cancelAnimationFrame
  const bad = await runCapture(f.env, timing)
  expect(bad.receipt.firstError.message).toBe('Window request receiver')
  expect(bad.receipt.cleanupErrors[0].error.message).toBe('Window cancel receiver')
  expect(f.tracks.every(t => t.readyState === 'ended')).toBe(true)
  const good = fixture()
  const goodSchedule = good.env.raf, goodCancel = good.env.caf
  const goodWindow = {
    requestAnimationFrame(callback: any) { if (this !== goodWindow) throw TypeError('Window request receiver'); return goodSchedule(callback) },
    cancelAnimationFrame(id: any) { if (this !== goodWindow) throw TypeError('Window cancel receiver'); goodCancel(id) }
  }
  Object.assign(good.env, frameScheduler(goodWindow))
  const result = await runCapture(good.env, timing)
  expect(result.receipt.firstError).toBeNull(); expect(result.receipt.cleanupErrors).toEqual([])
})
