/* 檔案用途：旁聽鍵盤回歸的原生選檔攔截與按鍵時序。所在層：僅完整量測診斷。主要關聯：run-app.ts、comparison-keyboard.js、Playwright1.64.1。 */
import assert from 'node:assert/strict'
import type { Page } from 'playwright-core'

export function observeKeyboardProtocol(page: Page) {
  // 固定版本的同程序driver才有此入口；不另建CDP session或提早啟用攔截，以免改變待查時序。
  const native = (page as any)._connection.toImpl(page), client = native.delegate._mainFrameSession._client
  assert.equal(typeof client.send, 'function', '目前driver不支援原生時序診斷，不能以缺少紀錄冒充已觀測')
  const events: any[] = [], original = client.send
  let sequence = 0, truncated = false
  const add = (event: unknown) => {
    if (events.length >= 96) { truncated = true; return }
    events.push({ at: performance.now(), ...event as any })
  }
  const choosing = (event: any) => add({ kind: 'native-filechooser', mode: event.mode, backendNodeId: event.backendNodeId })
  client.on('Page.fileChooserOpened', choosing)
  const wrapped = function(this: unknown, method: string, params: any, ...args: any[]) {
    const observed = ['Page.setInterceptFileChooserDialog', 'Input.dispatchKeyEvent'].includes(method), id = sequence++
    if (observed) add({ kind: 'send', id, method, enabled: params?.enabled, key: params?.key, type: params?.type })
    const pending = original.call(this, method, params, ...args)
    // 回傳同一個Promise，不插入等待、改回覆或吞掉原錯誤；只記受控按鍵及協定名稱，不記檔案／影片內容。
    if (observed) pending.then(() => add({ kind: 'ack', id, method }), () => add({ kind: 'reject', id, method }))
    return pending
  }
  client.send = wrapped
  return { stop() {
    assert.equal(client.send, wrapped, '原生觀察已換持有人，不能覆蓋其他層')
    client.send = original; client.off('Page.fileChooserOpened', choosing)
    return { clock: 'host-performance-ms', events, truncated }
  } }
}
