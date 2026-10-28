/* 檔案用途：驗證快取故障時仍可讀取正確在線資源，且不冒稱離線完整。所在層：SW 回歸。主要關聯：sw.js、offline-cache-failure.js。 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'

function worker(mode = '', network = 'synthetic module') {
  const content = 'synthetic module', path = '/timeline.js', version = 'synthetic-version'
  const hash = createHash('sha256').update(content).digest('hex')
  const handlers: Record<string, (event: any) => void> = {}, entries = new Map([[path, 'corrupt']])
  const calls = { fetch: 0, put: 0, deleted: [] as string[] }
  const fail = () => { throw new DOMException('synthetic cache failure', 'QuotaExceededError') }
  const cache = {
    async match(key: string) { if (mode === 'match') fail(); return entries.has(key) ? new Response(entries.get(key)) : undefined },
    async put(key: string, response: Response) { calls.put++; if (mode === 'put') fail(); entries.set(key, await response.text()) },
  }
  const source = readFileSync(new URL('../../web/sw.js', import.meta.url), 'utf8')
    .replace('__BUILD__', version).replace('/* __MANIFEST__ */ {}', JSON.stringify({ [path]: hash }))
  runInNewContext(source, {
    self: { location: { origin: 'https://synthetic.invalid' }, addEventListener(type: string, handler: (event: any) => void) { handlers[type] = handler } },
    caches: { async open() { if (mode === 'open') fail(); return cache }, async delete(name: string) { calls.deleted.push(name) } },
    crypto, Response, URL,
    // worker 以自身來源解析相對 URL；測試若少這層，install 會先因 URL 無效而假失敗。
    Request: class extends Request { constructor(path: string, options?: RequestInit) { super(new URL(path, 'https://synthetic.invalid'), options) } },
    async fetch() { calls.fetch++; if (mode === 'offline') throw new TypeError('synthetic offline'); return new Response(network) },
  })
  const read = () => new Promise<Response>(resolve => handlers.fetch({ request: new Request(`https://synthetic.invalid${path}`), respondWith: resolve }))
  const status = async () => {
    let result: any, done: Promise<void> | undefined
    handlers.message({ data: { type: 'CHECK_OFFLINE' }, ports: [{ postMessage(value: any) { result = value } }], waitUntil(value: Promise<void>) { done = value } })
    await done; return result
  }
  return { read, status, entries, calls, content, path, handlers }
}

for (const mode of ['put', 'open', 'match']) test(`快取 ${mode} 拒絕時仍提供通過雜湊的在線資源；離線顯示不完整`, async () => {
  const current = worker(mode)
  const response = await current.read()
  expect(response.status).toBe(200); expect(await response.text()).toBe(current.content)
  expect(current.calls.fetch).toBe(1)
  expect((await current.status()).complete).toBe(false)
  expect(current.calls.deleted).toEqual([])
})

test('快取故障不能繞過版本驗證，錯誤候選回 503 且不寫入', async () => {
  const current = worker('put', 'different version')
  expect((await current.read()).status).toBe(503)
  expect(current.calls.put).toBe(0); expect((await current.status()).complete).toBe(false)
})

test('完整副本可離線讀取；損壞副本斷網不得冒充成功，連線修復才變完整', async () => {
  const offline = worker('offline')
  await expect(offline.read()).rejects.toThrow('offline')
  offline.entries.set(offline.path, offline.content)
  expect(await (await offline.read()).text()).toBe(offline.content)
  expect((await offline.status()).complete).toBe(true)
  const online = worker()
  expect(await (await online.read()).text()).toBe(online.content)
  expect((await online.status()).complete).toBe(true)
})

test('安裝時 quota 仍拒絕候選並清理該候選，不把在線降級套到安裝', async () => {
  const current = worker('put')
  let done: Promise<void> | undefined
  current.handlers.install({ waitUntil(value: Promise<void>) { done = value } })
  await expect(done).rejects.toThrow('synthetic cache failure')
  expect(current.calls.deleted).toEqual(['dance-stamp-web-synthetic-version'])
})
