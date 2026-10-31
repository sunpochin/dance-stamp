/* 檔案用途：驗證離線狀態、容量與更新失敗不誤導使用者。所在層：能力介面單元測試。主要關聯：web/offline.js。 */
import { afterEach, expect, test } from 'bun:test'
import { startOffline } from '../../web/offline.js'

const originals = new Map(['navigator', 'document', 'window', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
afterEach(() => { for (const [key, original] of originals) { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key) } })
class Control extends EventTarget { textContent = ''; disabled = false }
// MessageChannel 與 Promise 由執行環境排程；等可觀察結果，避免 CI 忙碌時把固定延遲當成功保證。
const waitFor = async (ready: () => boolean) => {
  const deadline = Date.now() + 1000
  while (!ready()) { if (Date.now() >= deadline) throw new Error('synthetic UI did not settle'); await Bun.sleep(1) }
}
function setup(options: { complete?: boolean; controlled?: boolean; persist?: boolean; storageError?: boolean; registerError?: boolean; statusError?: boolean; updateError?: boolean; noWorker?: boolean; noStorage?: boolean; devReload?: boolean; hostname?: string } = {}) {
  const ui = Object.fromEntries(['offline', 'capacity', 'persistence', 'updates', 'refresh', 'persist', 'checkUpdate'].map(key => [key, new Control()])) as Record<string, Control>
  let persists = 0, updates = 0, registrations = 0
  const worker = Object.assign(new EventTarget(), { postMessage(_message: unknown, ports: MessagePort[]) {
    if (options.statusError) throw new Error('synthetic status failure')
    ports[0].postMessage({ complete: options.complete ?? true, version: 'synthetic' })
  } })
  const registration = Object.assign(new EventTarget(), { active: options.noWorker ? null : worker, installing: worker, waiting: null as unknown,
    async update() { updates++; if (options.updateError) throw new Error('synthetic update failure') } })
  const serviceWorker = Object.assign(new EventTarget(), { controller: options.controlled === false ? null : worker,
    async register(path: string, settings: unknown) { registrations++; expect(path).toBe('/sw.js'); expect(settings).toEqual({ updateViaCache: 'none' }); if (options.registerError) throw new Error('synthetic registration'); return registration } })
  const storage = {
    estimate() { if (options.storageError) throw new Error('synthetic estimate'); return Promise.resolve({ usage: 1048576, quota: 2097152 }) },
    persisted() { if (options.storageError) throw new Error('synthetic persisted'); return Promise.resolve(options.persist ?? false) },
    async persist() { persists++; if (options.storageError) throw new Error('synthetic persist'); return options.persist ?? false },
  }
  const state = { serviceWorker, storage: options.noStorage ? undefined : storage, onLine: true }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: state })
  // 真正瀏覽器一定有頁面與來源；保留這兩個最小邊界，才能測正式離線與本機即時更新各自的入口。
  const document = Object.assign(new EventTarget(), { documentElement: { dataset: { devReload: String(options.devReload ?? false) } }, visibilityState: 'visible' })
  // 攔在頁面計時邊界，才能直接推進十五分鐘並確認沒有留下跨測試的真實計時器。
  const intervals: { callback: () => void; delay: number }[] = []
  const window = Object.assign(new EventTarget(), { setInterval(callback: () => void, delay: number) { intervals.push({ callback, delay }); return intervals.length } })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: options.hostname ?? 'synthetic.invalid' } })
  return { ui, worker, registration, serviceWorker, storage, state, document, window, intervals, counts: () => ({ persists, updates, registrations }), start: () => startOffline(ui as any) }
}
test('即時更新只在明確標記的本機來源停用 SW，其他來源仍可註冊離線資源', async () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    const current = setup({ devReload: true, hostname }); await current.start()
    expect(current.counts().registrations).toBe(0); expect(current.ui.checkUpdate.disabled).toBe(true)
    expect(current.intervals).toHaveLength(0)
    expect(current.ui.offline.textContent).toContain('筆記與影片副本仍保留')
  }
  const remote = setup({ devReload: true }); await remote.start()
  expect(remote.counts().registrations).toBe(1); expect(remote.ui.offline.textContent).toContain('可離線重開')
})
test('首次未受控制須提示重開；容量只是估計、持久保存須由點按請求', async () => {
  const current = setup({ controlled: false, persist: true }); await current.start()
  expect(current.ui.offline.textContent).toContain('首次請先重開')
  expect(current.ui.capacity.textContent).toContain('1.0 MiB／額度 2.0 MiB')
  expect(current.ui.persistence.textContent).toContain('已允許')
  expect(current.counts().persists).toBe(0)
  current.ui.persist.dispatchEvent(new Event('click')); await waitFor(() => current.counts().persists === 1 && !current.ui.persist.disabled)
  expect(current.counts().persists).toBe(1); expect(current.ui.persist.disabled).toBe(false)
  expect(current.ui.persistence.textContent).toContain('手動清除不受保護')
})
test('拒絕／同步能力例外與請求失敗保留資料說明，按鈕可再試', async () => {
  for (const storageError of [false, true]) {
    const current = setup({ storageError }); await current.start()
    expect(current.ui.persistence.textContent).toContain(storageError ? '無法確認' : '未獲持久')
    current.ui.persist.dispatchEvent(new Event('click')); await waitFor(() => current.counts().persists === 1 && !current.ui.persist.disabled)
    expect(current.ui.persistence.textContent).toContain(storageError ? '請求失敗' : '未允許')
    expect(current.ui.persist.disabled).toBe(false)
    expect(current.ui.offline.textContent).toContain('完整')
  }
})
test('瀏覽器缺少儲存或 SW 能力仍可開啟，停用不可用操作', async () => {
  const current = setup({ noStorage: true }); Reflect.deleteProperty(navigator, 'serviceWorker'); await current.start()
  expect(current.ui.persist.disabled).toBe(true); expect(current.ui.checkUpdate.disabled).toBe(true)
  expect(current.ui.capacity.textContent).toContain('未提供'); expect(current.ui.offline.textContent).toContain('不支援')
  expect(current.intervals).toHaveLength(0)
})
test('註冊失敗、不完整或無 active worker 不得宣稱可離線重開', async () => {
  for (const options of [{ registerError: true }, { complete: false }, { noWorker: true, controlled: false }, { statusError: true }]) {
    const current = setup(options); await current.start()
    expect(current.ui.offline.textContent).not.toContain('可離線重開')
    expect(current.ui.offline.textContent).toContain(options.statusError ? '無法確認' : options.complete === false ? '不完整' : '未備妥')
    if (options.registerError) expect(current.intervals).toHaveLength(0)
  }
})
test('較早的離線回覆晚到，不可覆蓋較新手動檢查的結果', async () => {
  for (const [older, newer] of [[true, false], [false, true]]) {
    const current = setup(), ports: MessagePort[] = []
    current.worker.postMessage = (message, sent) => { expect(message).toEqual({ type: 'CHECK_OFFLINE' }); ports.push(sent[0]) }
    const starting = current.start(); await waitFor(() => ports.length === 1)
    current.ui.refresh.dispatchEvent(new Event('click')); await waitFor(() => ports.length === 2)
    // 用真正 MessageChannel 讓後問的先回；舊的「完整」不得蓋掉新版已確認的不完整，反向也一樣。
    ports[1].postMessage({ complete: newer, version: 'newer' })
    await waitFor(() => current.ui.offline.textContent.includes(newer ? '（newer）' : '不完整'))
    const latest = current.ui.offline.textContent
    ports[0].postMessage({ complete: older, version: 'older' }); await starting
    expect(current.ui.offline.textContent).toBe(latest)
  }
})
test('初次檢查的真正逾時，不可覆蓋 controller 事件後的成功', async () => {
  const current = setup(), ports: MessagePort[] = []
  current.worker.postMessage = (_message, sent) => { ports.push(sent[0]) }
  const starting = current.start(); await waitFor(() => ports.length === 1)
  current.serviceWorker.dispatchEvent(new Event('controllerchange')); await waitFor(() => ports.length === 2)
  ports[1].postMessage({ complete: true, version: 'newer' })
  await waitFor(() => current.ui.offline.textContent.includes('（newer）'))
  const latest = current.ui.offline.textContent
  // 第一個真正訊息通道不回覆，等產品原本五秒期限；不縮短計時器或手動呼叫錯誤處理。
  await starting
  expect(current.ui.offline.textContent).toBe(latest)
  expect(current.ui.refresh.disabled).toBe(false)
}, 10_000)
test('等待更新只顯示保存提醒；更新、controller 及手動重查皆重新核對狀態', async () => {
  const current = setup(); await current.start()
  current.registration.waiting = {}; current.ui.checkUpdate.dispatchEvent(new Event('click')); await waitFor(() => current.ui.updates.textContent.includes('先保存'))
  expect(current.counts().updates).toBe(2); expect(current.ui.updates.textContent).toContain('先保存')
  // 變更回報後才送原生事件，避免只證明有註冊 listener 卻沒真的更新畫面。
  current.worker.postMessage = (_message, ports) => ports[0].postMessage({ complete: false })
  for (const [target, event] of [[current.worker, 'statechange'], [current.serviceWorker, 'controllerchange'], [current.ui.refresh, 'click']] as const) {
    current.ui.offline.textContent = ''; target.dispatchEvent(new Event(event)); await waitFor(() => current.ui.offline.textContent.includes('不完整'))
    expect(current.ui.offline.textContent).toContain('不完整')
  }
  current.registration.dispatchEvent(new Event('updatefound'))
  current.ui.offline.textContent = ''; current.worker.dispatchEvent(new Event('statechange')); await waitFor(() => current.ui.offline.textContent.includes('不完整'))
  expect(current.ui.offline.textContent).toContain('不完整')
})
test('檢查更新失敗保留目前版本，之後可再操作', async () => {
  const current = setup({ updateError: true }); await current.start()
  current.ui.checkUpdate.dispatchEvent(new Event('click')); await waitFor(() => current.ui.updates.textContent.includes('現有版本與資料保留'))
  expect(current.ui.updates.textContent).toContain('現有版本與資料保留')
  expect(current.ui.checkUpdate.disabled).toBe(false)
})

test('啟動、前景、pageshow、恢復連線與十五分鐘會自動檢查，背景及離線不查', async () => {
  const current = setup(); await current.start()
  expect(current.counts().updates).toBe(1)
  expect(current.intervals.map(timer => timer.delay)).toEqual([15 * 60 * 1000])
  const triggers = [
    () => current.document.dispatchEvent(new Event('visibilitychange')),
    () => current.window.dispatchEvent(new Event('pageshow')),
    () => current.window.dispatchEvent(new Event('online')),
    () => current.intervals[0].callback(),
  ]
  for (const trigger of triggers) {
    const before = current.counts().updates
    current.document.visibilityState = 'hidden'; trigger()
    expect(current.counts().updates).toBe(before)
    current.document.visibilityState = 'visible'; current.state.onLine = false; trigger()
    expect(current.counts().updates).toBe(before)
    current.state.onLine = true; trigger()
    await waitFor(() => current.counts().updates === before + 1)
  }
})

test('自動檢查不重入，失敗解除後由下一次前景事件重試並顯示 waiting', async () => {
  const current = setup({ updateError: true }); await current.start()
  expect(current.counts().updates).toBe(1)
  expect(current.ui.updates.textContent).toContain('現有版本與資料保留')
  let attempts = 0, release: () => void = () => {}
  current.registration.update = () => { attempts++; return new Promise<void>(resolve => { release = resolve }) }
  current.window.dispatchEvent(new Event('online'))
  current.window.dispatchEvent(new Event('pageshow')); current.intervals[0].callback()
  expect(attempts).toBe(1)
  current.registration.waiting = {}; release()
  await waitFor(() => current.ui.updates.textContent.includes('新版已備妥'))
  current.document.dispatchEvent(new Event('visibilitychange'))
  expect(attempts).toBe(2); release()
  expect(current.ui.updates.textContent).toContain('不會自動重載')
})
