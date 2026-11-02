/* 檔案用途：逐筆保存瀏覽器回應並在關閉來源前有界收尾。所在層：QA 工具，不進產品。主要關聯：responseReceipts.test.ts、#15 託管證據。 */
import { createHash } from 'node:crypto'
import type { Response } from 'playwright-core'

type ReadableResponse = Pick<Response, 'url' | 'status' | 'fromServiceWorker' | 'body' | 'allHeaders'>
export type Receipt = {
  id: number, url: string, status: number, fromServiceWorker: boolean, source: string,
  state: 'reading' | 'complete' | 'metadata-only' | 'failed' | 'timed-out',
  headers?: Record<string, string>, bytes?: number, sha256?: string, errors: string[]
}

export class ResponseReceipts {
  readonly records: Receipt[] = []
  private readonly pending = new Map<Receipt, Promise<void>>()
  constructor(private readonly saveBody: (receipt: Receipt, body: Buffer) => void) {}

  add(response: ReadableResponse, source: string, readBody = true) {
    const receipt: Receipt = { id: this.records.length + 1, url: response.url(), status: response.status(), fromServiceWorker: response.fromServiceWorker(), source, state: 'reading', errors: [] }
    this.records.push(receipt)
    // 先登記再開始 await；重複 URL 及讀取失敗也各有自己的收據，不覆蓋上一筆。
    const task = Promise.resolve().then(async () => {
      const [headers, body] = await Promise.allSettled([Promise.resolve().then(() => response.allHeaders()), readBody ? Promise.resolve().then(() => response.body()) : Promise.resolve(null)])
      // drain 逾時已形成失敗收據；遲到的回覆不能改寫已交付證據或補寫 body。
      if (receipt.state === 'timed-out') return
      if (headers.status === 'fulfilled') receipt.headers = headers.value
      else receipt.errors.push(`headers: ${String(headers.reason)}`)
      if (body.status === 'rejected') receipt.errors.push(`body: ${String(body.reason)}`)
      else if (body.value !== null) {
        receipt.bytes = body.value.length
        receipt.sha256 = createHash('sha256').update(body.value).digest('hex')
        try { this.saveBody(receipt, body.value) } catch (error) { receipt.errors.push(`save: ${String(error)}`) }
      }
      receipt.state = receipt.errors.length ? 'failed' : readBody ? 'complete' : 'metadata-only'
    }).finally(() => this.pending.delete(receipt))
    this.pending.set(receipt, task)
    return receipt
  }

  async drain(timeoutMs = 10_000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('回應收尾期限必須為正數。')
    const deadline = performance.now() + timeoutMs
    while (this.pending.size) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        // 讀取期間新到的回應也要收尾；單次 Promise.all 快照會漏掉後加入的工作。
        await Promise.race([Promise.all([...this.pending.values()]), new Promise<void>(resolve => { timer = setTimeout(resolve, Math.max(0, deadline - performance.now())) })])
      } finally { clearTimeout(timer) }
      if (this.pending.size && performance.now() >= deadline) {
        for (const receipt of this.pending.keys()) { receipt.state = 'timed-out'; receipt.errors.push('drain: response body/header deadline exceeded') }
        this.pending.clear()
        break
      }
    }
    const failed = this.records.filter(receipt => receipt.errors.length)
    if (failed.length) throw new AggregateError(failed.map(receipt => new Error(`response ${receipt.id}: ${receipt.errors.join('; ')}`)), '回應收據含失敗，不能列為整輪通過。')
    return this.records
  }
}
