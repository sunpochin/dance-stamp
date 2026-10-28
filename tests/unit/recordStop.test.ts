/* 檔案用途：驗證編碼錯誤後仍等最後 dataavailable／stop，避免遺失尾塊。所在層：媒體事件回歸。主要關聯：recorder.js、capture.test.ts。 */
import { expect, test } from 'bun:test'
import { record } from '../../web/recorder.js'

test('stop 等到尾塊才完成；error 先拒絕 done，但不提早移除落盤監聽', async () => {
  const original = globalThis.MediaRecorder, instances: FakeRecorder[] = []
  class FakeRecorder extends EventTarget {
    static isTypeSupported() { return true }
    state = 'inactive'; mimeType = 'video/mp4'; stopCalls = 0
    constructor() { super(); instances.push(this) }
    start() { this.state = 'recording'; queueMicrotask(() => this.dispatchEvent(new Event('start'))) }
    stop() {
      this.stopCalls++; this.state = 'inactive'
      setTimeout(() => { const data = new Event('dataavailable'); Object.assign(data, { data: new Blob(['tail'], { type: this.mimeType }) }); this.dispatchEvent(data); this.dispatchEvent(new Event('stop')) }, 10)
    }
  }
  globalThis.MediaRecorder = FakeRecorder as unknown as typeof MediaRecorder
  try {
    const pieces: string[] = [], starts: number[] = []
    const good = record({} as MediaStream, blob => { pieces.push(String(blob.size)) }, time => starts.push(time))
    expect(starts).toHaveLength(0)
    const ending = good.stop(); expect(pieces).toHaveLength(0)
    expect(await (await ending).text()).toBe('tail'); expect(starts).toHaveLength(1)
    await good.stop(); expect(instances[0].stopCalls).toBe(1)
    const badPieces: Blob[] = [], bad = record({} as MediaStream, blob => badPieces.push(blob))
    instances[1].dispatchEvent(new Event('error'))
    await expect(bad.done).rejects.toThrow('編碼失敗')
    const failedStop = bad.stop(); expect(badPieces).toHaveLength(0)
    await expect(failedStop).rejects.toThrow('編碼失敗')
    expect(await badPieces[0].text()).toBe('tail')
  } finally { globalThis.MediaRecorder = original }
})
