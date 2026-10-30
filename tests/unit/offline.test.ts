/* 檔案用途：驗證離線狀態、容量與更新失敗不誤導使用者。所在層：能力介面單元測試。主要關聯：web/offline.js。 */
import { afterEach, expect, test } from 'bun:test'
import { startOffline } from '../../web/offline.js'

const originals = new Map(['navigator', 'document', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
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
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker, storage: options.noStorage ? undefined : storage } })
  // 真正瀏覽器一定有頁面與來源；保留這兩個最小邊界，才能測正式離線與本機即時更新各自的入口。
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { dataset: { devReload: String(options.devReload ?? false) } } } })
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: options.hostname ?? 'synthetic.invalid' } })
  return { ui, worker, registration, serviceWorker, storage, counts: () => ({ persists, updates, registrations }), start: () => startOffline(ui as any) }
}
test('即時更新只在明確標記的本機來源停用 SW，其他來源仍可註冊離線資源', async () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    const current = setup({ devReload: true, hostname }); await current.start()
    expect(current.counts().registrations).toBe(0); expect(current.ui.checkUpdate.disabled).toBe(true)
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
})
test('註冊失敗、不完整或無 active worker 不得宣稱可離線重開', async () => {
  for (const options of [{ registerError: true }, { complete: false }, { noWorker: true, controlled: false }, { statusError: true }]) {
    const current = setup(options); await current.start()
    expect(current.ui.offline.textContent).not.toContain('可離線重開')
    expect(current.ui.offline.textContent).toContain(options.statusError ? '無法確認' : options.complete === false ? '不完整' : '未備妥')
  }
})
test('等待更新只顯示保存提醒；更新、controller 及手動重查皆重新核對狀態', async () => {
  const current = setup(); await current.start()
  current.registration.waiting = {}; current.ui.checkUpdate.dispatchEvent(new Event('click')); await waitFor(() => current.ui.updates.textContent.includes('先保存'))
  expect(current.counts().updates).toBe(1); expect(current.ui.updates.textContent).toContain('先保存')
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
