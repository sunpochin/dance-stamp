/* 檔案用途：驗證逐筆收據不漏新增回應、不吞錯誤且逾時後不改證據。所在層：QA 工具單元測試。主要關聯：scripts/response-receipts.ts。 */
import { expect, test } from 'bun:test'
import { ResponseReceipts } from '../../scripts/response-receipts'

const response = (body: () => Promise<Buffer>) => ({ url: () => 'https://example.test/model', status: () => 200, fromServiceWorker: () => false, allHeaders: async () => ({ 'content-type': 'application/octet-stream' }), body })

test('同步編號，drain 也收下讀取期間新來的同 URL 回應', async () => {
  const saved: number[] = [], collector = new ResponseReceipts(receipt => { saved.push(receipt.id) })
  let release!: (body: Buffer) => void, releaseSecond!: (body: Buffer) => void, finished = false
  collector.add(response(() => new Promise(resolve => { release = resolve })), 'worker-1')
  expect(collector.records[0].state).toBe('reading')
  const drain = collector.drain().then(records => { finished = true; return records })
  await Promise.resolve(); await Promise.resolve()
  collector.add(response(() => new Promise(resolve => { releaseSecond = resolve })), 'worker-2')
  release(Buffer.from('first'))
  await Bun.sleep(0)
  expect(finished).toBe(false)
  releaseSecond(Buffer.from('second'))
  const records = await drain
  expect(records.map(row => [row.id, row.source, row.state])).toEqual([[1, 'worker-1', 'complete'], [2, 'worker-2', 'complete']])
  expect(saved.sort()).toEqual([1, 2])
  expect(records[0].sha256).not.toBe(records[1].sha256)
})

test('各筆讀取與寫檔錯誤保留，整輪 drain 明確拒絕', async () => {
  const collector = new ResponseReceipts(() => { throw new Error('disk full') })
  collector.add(response(async () => { throw new Error('worker closed') }), 'cancelled-worker')
  collector.add(response(async () => Buffer.from('ok')), 'live-worker')
  await expect(collector.drain()).rejects.toBeInstanceOf(AggregateError)
  expect(collector.records.map(row => row.errors)).toEqual([['body: Error: worker closed'], ['save: Error: disk full']])
  expect(collector.records.every(row => row.state === 'failed')).toBe(true)
  expect(collector.records[0].headers?.['content-type']).toBe('application/octet-stream')
})

test('收尾有界，遲到 body 不覆寫逾時收據或寫入檔案', async () => {
  let release!: (body: Buffer) => void, saved = 0
  const collector = new ResponseReceipts(() => { saved++ })
  collector.add(response(() => new Promise(resolve => { release = resolve })), 'worker')
  await expect(collector.drain(10)).rejects.toBeInstanceOf(AggregateError)
  const before = JSON.stringify(collector.records)
  release(Buffer.from('late'))
  await Bun.sleep(0)
  expect(JSON.stringify(collector.records)).toBe(before)
  expect(saved).toBe(0)
  expect(collector.records[0].state).toBe('timed-out')
})
