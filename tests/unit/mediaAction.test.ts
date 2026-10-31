/* 檔案用途：防止失敗、取消留下媒體監聽與逾時。所在層：純生命週期回歸。主要關聯：web/recorder.js、main.js。 */
import { expect, test } from 'bun:test'
import { event, mediaAction, seek, presentedFrame, load } from '../../web/recorder.js'
class CountedTarget extends EventTarget {
  listeners = new Set<EventListenerOrEventListenerObject>()
  override addEventListener(name: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    if (callback) this.listeners.add(callback)
    super.addEventListener(name, callback, options)
  }
  override removeEventListener(name: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    if (callback) this.listeners.delete(callback)
    super.removeEventListener(name, callback, options)
  }
}
test('格式不支援、解碼失敗及一般媒體錯誤有可辨識提示並清除監聽', async () => {
  for (const [code, message] of [[4, 'H.264'], [3, '解碼失敗'], [undefined, '媒體無法解碼']] as const) {
    const target = Object.assign(new CountedTarget(), { error: { code } })
    const pending = event(target, 'ready', undefined)
    target.dispatchEvent(new Event('error'))
    await expect(pending).rejects.toThrow(message); expect(target.listeners.size).toBe(0)
  }
})
test('載入先等可解碼資料、再定位回零；未知長度實際 seek 尾端而非猜測', async () => {
  class LoadedVideo extends CountedTarget {
    readyState = 2; videoWidth = 640; videoHeight = 360; src = ''; duration = 2.3456; position = 1; seeks: number[] = []
    get currentTime() { return this.position }
    set currentTime(value: number) {
      this.seeks.push(value); this.position = value
      if (value === 1e9) this.duration = 2.3456
      this.dispatchEvent(new Event('seeked'))
    }
    load() { this.dispatchEvent(new Event('loadeddata')) }
  }
  for (const duration of [2.3456, Infinity]) {
    const video = new LoadedVideo(); video.duration = duration
    expect(await load(video, 'blob:synthetic', undefined)).toBe(2346)
    expect(video.src).toBe('blob:synthetic'); expect(video.currentTime).toBe(0)
    expect(video.seeks).toEqual(Number.isFinite(duration) ? [0] : [1e9, 0])
    expect(video.listeners.size).toBe(0)
  }
  for (const change of [{ videoWidth: 0 }, { videoHeight: 0 }, { duration: 0 }, { duration: -1 }]) {
    const video = Object.assign(new LoadedVideo(), change)
    await expect(load(video, 'blob:synthetic', undefined)).rejects.toThrow()
    expect(video.listeners.size).toBe(0)
  }
})
test('定位拒絕非法時間與未就緒媒體，同位置不多等事件；缺少影格能力可退回播放等待', async () => {
  const video = Object.assign(new CountedTarget(), { currentTime: 0, readyState: 2 })
  for (const value of [-1, NaN, Infinity]) await expect(seek(video, value, undefined)).rejects.toThrow('時間不正確')
  await seek(video, 0, undefined); expect(video.listeners.size).toBe(0)
  await expect(seek(video, 0, undefined, true)).rejects.toThrow('無法確認')
  video.readyState = 0; await expect(seek(video, 0, undefined)).rejects.toThrow('尚未準備')
  const pending = presentedFrame(video as unknown as HTMLVideoElement, new AbortController().signal)
  video.dispatchEvent(new Event('playing')); await pending
  expect(video.listeners.size).toBe(0)
})
test('媒體事件與啟動 Promise 兩者都成功才完成，所有監聽移除', async () => {
  const target = new CountedTarget()
  let release!: () => void, complete = false
  const started = mediaAction(target, 'ready', () => {
    target.dispatchEvent(new Event('ready'))
    return new Promise<void>(resolve => { release = resolve })
  }).then(() => { complete = true })
  await Promise.resolve(); await Promise.resolve()
  expect(complete).toBe(false)
  release(); await started
  expect(complete).toBe(true)
  expect(target.listeners.size).toBe(0)
})
test('同步 setter 例外與非同步 play 拒絕都清掉等待', async () => {
  for (const action of [() => { throw new Error('synthetic setter') }, () => Promise.reject(new Error('synthetic play'))]) {
    const target = new CountedTarget()
    await expect(mediaAction(target, 'ready', action)).rejects.toThrow('synthetic')
    expect(target.listeners.size).toBe(0)
  }
})
test('預先取消不啟動媒體；執行中取消及逾時也移除監聽', async () => {
  const controller = new AbortController(), target = new CountedTarget()
  controller.abort()
  let starts = 0
  await expect(mediaAction(target, 'ready', () => { starts++ }, controller.signal)).rejects.toThrow()
  expect(starts).toBe(0); expect(target.listeners.size).toBe(0)
  const active = new AbortController()
  const pending = mediaAction(target, 'ready', () => {}, active.signal)
  active.abort(); await expect(pending).rejects.toThrow()
  expect(target.listeners.size).toBe(0)
  await expect(mediaAction(target, 'ready', () => {}, undefined, 5)).rejects.toThrow('逾時')
  expect(target.listeners.size).toBe(0)
})

// seeked 可能早於合成器換到目標像素；不能以定位事件當作第一張輸出畫面已正確。
class PresentedVideo extends CountedTarget {
  readyState = 2; seeking = false; position = 0; nextId = 0; autoSeeked = true
  callbacks = new Map<number, VideoFrameRequestCallback>()
  get currentTime() { return this.position }
  set currentTime(value: number) { this.position = value; if (this.autoSeeked) this.dispatchEvent(new Event('seeked')) }
  requestVideoFrameCallback(callback: VideoFrameRequestCallback) { const id = ++this.nextId; this.callbacks.set(id, callback); return id }
  cancelVideoFrameCallback(id: number) { this.callbacks.delete(id) }
  present(mediaTime: number) {
    const pending = [...this.callbacks]; this.callbacks.clear()
    for (const [, callback] of pending) callback(0, { mediaTime } as VideoFrameCallbackMetadata)
  }
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
test('合成定位須同時等 seeked 與呈現通知，通知先到仍不能提早完成', async () => {
  const video = new PresentedVideo(), controller = new AbortController(); video.position = .04; video.autoSeeked = false
  let complete = false
  const pending = seek(video as unknown as HTMLVideoElement, 0, controller.signal, true).then(() => { complete = true })
  try {
    await settle(); expect(complete).toBe(false)
    video.present(.033333); await settle(); expect(complete).toBe(false)
    video.dispatchEvent(new Event('seeked')); await settle(); expect(complete).toBe(true)
    expect(video.callbacks.size).toBe(0); expect(video.listeners.size).toBe(0)
  } finally { controller.abort(); await pending.catch(() => {}) }
})
// 原生 Safari 在 seeked/currentTime=0 後僅送一次 mediaTime=.1；metadata 不能代替 Canvas 像素驗收。
test('Safari 回零後的唯一呈現通知沿用舊 metadata 時不會永久等待', async () => {
  const video = new PresentedVideo(), controller = new AbortController(); video.position = .1
  let complete = false
  const pending = seek(video as unknown as HTMLVideoElement, 0, controller.signal, true).then(() => { complete = true })
  try {
    await settle(); expect(video.currentTime).toBe(0); expect(complete).toBe(false)
    video.present(.1); await settle(); expect(complete).toBe(true)
    expect(video.callbacks.size).toBe(0); expect(video.listeners.size).toBe(0)
  } finally { controller.abort(); await pending.catch(() => {}) }
})
test('暖機要看到真正前進的影格；取消仍移除待呈現訂閱', async () => {
  const video = new PresentedVideo(), controller = new AbortController(); let complete = false
  const pending = presentedFrame(video as unknown as HTMLVideoElement, controller.signal, frame => frame.mediaTime > 0).then(() => { complete = true })
  video.present(0); await settle(); expect(complete).toBe(false)
  video.present(1 / 30); await pending; expect(complete).toBe(true)
  const cancel = new AbortController(), cancelled = seek(video as unknown as HTMLVideoElement, 0, cancel.signal, true)
  await settle(); cancel.abort(); await expect(cancelled).rejects.toThrow()
  expect(video.callbacks.size).toBe(0); expect(video.listeners.size).toBe(0)
})

test('暖機取消後遲到的不合格影格不能重新訂閱', async () => {
  const video = new PresentedVideo(), controller = new AbortController()
  const pending = presentedFrame(video as unknown as HTMLVideoElement, controller.signal, frame => frame.mediaTime > 0)
  // 原生通知已排入送達佇列時，取消訂閱仍可能收到它；零時間影格不能讓已結束的暖機復活。
  const late = [...video.callbacks.values()][0]!
  controller.abort(); await expect(pending).rejects.toThrow()
  late(0, { mediaTime: 0 } as VideoFrameCallbackMetadata)
  expect(video.callbacks.size).toBe(0); expect(video.nextId).toBe(1)
})

test('起點影格等待遇到 seek 或原生訂閱錯誤仍清理', async () => {
  const video = new PresentedVideo()
  Object.defineProperty(video, 'currentTime', { get: () => 1, set: () => { throw new Error('synthetic seek failure') } })
  await expect(seek(video as unknown as HTMLVideoElement, 0, undefined, true)).rejects.toThrow('synthetic seek failure')
  expect(video.callbacks.size).toBe(0); expect(video.listeners.size).toBe(0)
  video.requestVideoFrameCallback = () => { throw new Error('synthetic frame failure') }
  await expect(presentedFrame(video as unknown as HTMLVideoElement, new AbortController().signal)).rejects.toThrow('synthetic frame failure')
  expect(video.listeners.size).toBe(0)
})

test('目標影格比 seeked 先到也保留通知，兩者完成才開始', async () => {
  const video = new PresentedVideo(); video.position = .04; video.autoSeeked = false; video.seeking = true
  let complete = false
  const pending = seek(video as unknown as HTMLVideoElement, 0, undefined, true).then(() => { complete = true })
  await settle(); video.present(0); await settle(); expect(complete).toBe(false)
  video.seeking = false; video.dispatchEvent(new Event('seeked')); await pending
  expect(complete).toBe(true); expect(video.callbacks.size).toBe(0); expect(video.listeners.size).toBe(0)
})
