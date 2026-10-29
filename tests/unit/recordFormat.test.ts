/* 檔案用途：驗證 Safari VS 專用格式拒絕及既有錄影格式選擇。所在層：媒體回歸。主要關聯：recorder.js、main.js、recordStop.test.ts。 */
import { expect, test } from 'bun:test'
import { record, extension } from '../../web/recorder.js'

const mp4 = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', webm = 'video/webm;codecs=vp8,opus'

test('WebM VS 明確選 VP8/Opus；一般錄影仍先 MP4，原生建構失敗沿原順序退回', async () => {
  const original = globalThis.MediaRecorder, checks: string[] = [], attempts: string[] = [], slices: number[] = []
  let failMp4 = false
  class FakeRecorder extends EventTarget {
    static isTypeSupported(type: string) { checks.push(type); return true }
    state = 'inactive'; mimeType: string
    constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
      super(); this.mimeType = options?.mimeType || 'video/mp4'; attempts.push(this.mimeType)
      if (failMp4 && this.mimeType.startsWith('video/mp4')) throw new Error('synthetic MP4 constructor failure')
    }
    start(timeslice: number) { slices.push(timeslice); this.state = 'recording'; queueMicrotask(() => this.dispatchEvent(new Event('start'))) }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: new Blob(['encoded'], { type: this.mimeType }) })); this.dispatchEvent(new Event('stop')) }) }
  }
  globalThis.MediaRecorder = FakeRecorder as unknown as typeof MediaRecorder
  try {
    // 相機及 Chrome 呼叫不傳選項；Safari VS 的選項只影響該次輸出，不能污染下次錄影。
    for (const webmOnly of [false, true, false]) {
      checks.length = 0; attempts.length = 0
      const session = webmOnly ? record({} as MediaStream, undefined, undefined, { webmOnly: true }) : record({} as MediaStream)
      const blob = await session.stop()
      expect(checks).toEqual([webmOnly ? webm : mp4]); expect(attempts).toEqual(checks)
      expect(blob.type).toBe((webmOnly ? webm : mp4).toLowerCase()); expect(extension(blob.type)).toBe(webmOnly ? 'webm' : 'mp4')
      expect(await blob.text()).toBe('encoded')
    }
    failMp4 = true; checks.length = 0; attempts.length = 0
    const fallback = record({} as MediaStream), blob = await fallback.stop()
    expect(checks).toEqual([mp4, 'video/mp4', webm]); expect(attempts).toEqual(checks)
    expect(blob.type).toBe(webm); expect(slices).toEqual([1000, 1000, 1000, 1000])
  } finally { globalThis.MediaRecorder = original }
})

test('WebM 不支援、建構或 start 拒絕都不試 MP4；編碼錯誤仍保留前塊與尾塊並可重試', async () => {
  const original = globalThis.MediaRecorder, checks: string[] = [], attempts: string[] = [], instances: FakeRecorder[] = []
  let fault = ''
  class FakeRecorder extends EventTarget {
    static isTypeSupported(type: string) { checks.push(type); return fault !== 'unsupported' || type !== webm }
    state = 'inactive'; mimeType: string; stopCalls = 0
    constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
      super(); this.mimeType = options?.mimeType || 'video/mp4'; attempts.push(this.mimeType)
      if (fault === 'construct' && this.mimeType === webm) throw new Error('synthetic constructor failure')
      instances.push(this)
    }
    start() { if (fault === 'start' && this.mimeType === webm) throw new Error('synthetic start failure'); this.state = 'recording' }
    data(text: string) { this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: new Blob([text], { type: this.mimeType }) })) }
    stop() { this.stopCalls++; this.state = 'inactive'; queueMicrotask(() => { this.data('tail'); this.dispatchEvent(new Event('stop')) }) }
  }
  globalThis.MediaRecorder = FakeRecorder as unknown as typeof MediaRecorder
  try {
    for (fault of ['unsupported', 'construct', 'start']) {
      checks.length = 0; attempts.length = 0
      let error: unknown, unexpected: ReturnType<typeof record> | undefined
      try { unexpected = record({} as MediaStream, undefined, undefined, { webmOnly: true }) } catch (caught) { error = caught }
      if (unexpected) await unexpected.stop()
      expect(error).toBeInstanceOf(Error); expect((error as Error)?.message).toContain('WebM')
      expect((error as Error)?.message).toContain('原片'); expect(checks).toEqual([webm])
      expect(attempts).toEqual(fault === 'unsupported' ? [] : [webm])
    }
    fault = ''
    for (const failed of [true, false]) {
      const chunks: Blob[] = [], session = record({} as MediaStream, blob => chunks.push(blob), undefined, { webmOnly: true }), native = instances.at(-1)!
      native.data('head')
      if (failed) { native.dispatchEvent(new Event('error')); await expect(session.done).rejects.toThrow('編碼失敗') }
      const stopped = session.stop()
      if (failed) await expect(stopped).rejects.toThrow('編碼失敗')
      else { const blob = await stopped; expect(blob.type).toBe(webm); expect(await blob.text()).toBe('headtail') }
      expect(await new Blob(chunks).text()).toBe('headtail'); expect(native.stopCalls).toBe(1)
      native.data('late'); expect(chunks).toHaveLength(2)
    }
  } finally { globalThis.MediaRecorder = original }
})
