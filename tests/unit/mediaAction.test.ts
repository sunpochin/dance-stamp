/* 檔案用途：防止失敗、取消留下媒體監聽與逾時。所在層：純生命週期回歸。主要關聯：web/recorder.js、main.js。 */
import { expect, test } from 'bun:test'
import { mediaAction } from '../../web/recorder.js'
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
