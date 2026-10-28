/* 檔案用途：驗證快取故障時仍可讀取正確在線資源，且不冒稱離線完整。所在層：SW 回歸。主要關聯：sw.js、offline-cache-failure.js。 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'

function worker(mode = '', network = 'synthetic module', paths = ['/timeline.js'], failurePath = paths[0]) {
  const content = 'synthetic module', path = paths[0], version = 'synthetic-version'
  const hash = createHash('sha256').update(content).digest('hex')
  const handlers: Record<string, (event: any) => void> = {}, entries = new Map([[path, 'corrupt']])
  const retained = new Map([['dance-stamp-web-previous', 'synthetic old bytes'], ['synthetic-unrelated-cache', 'synthetic unrelated bytes']])
  const calls = { fetch: 0, put: 0, deleted: [] as string[] }
  const fail = () => { throw new DOMException('synthetic cache failure', 'QuotaExceededError') }
  const cache = {
    async match(key: string) { if (mode === 'match') fail(); return entries.has(key) ? new Response(entries.get(key)) : undefined },
    async put(key: string, response: Response) { calls.put++; if (mode === 'put' && key === failurePath) fail(); entries.set(key, await response.text()) },
  }
  const source = readFileSync(new URL('../../web/sw.js', import.meta.url), 'utf8')
    .replace('__BUILD__', version).replace('/* __MANIFEST__ */ {}', JSON.stringify(Object.fromEntries(paths.map(key => [key, hash]))))
  runInNewContext(source, {
    self: { location: { origin: 'https://synthetic.invalid' }, addEventListener(type: string, handler: (event: any) => void) { handlers[type] = handler } },
    caches: {
      async open() { if (mode === 'open') fail(); return cache },
      async keys() { return [`dance-stamp-web-${version}`, ...retained.keys()] },
      async delete(name: string) { calls.deleted.push(name); if (name === `dance-stamp-web-${version}`) entries.clear(); return retained.delete(name) },
    },
    crypto, Response, URL,
    // worker 以自身來源解析相對 URL；測試若少這層，install 會先因 URL 無效而假失敗。
    Request: class extends Request { constructor(path: string, options?: RequestInit) { super(new URL(path, 'https://synthetic.invalid'), options) } },
    async fetch(request: Request) {
      calls.fetch++
      const failing = new URL(request.url).pathname === failurePath
      if (mode === 'offline' && failing) throw new TypeError('synthetic offline')
      return new Response(mode === 'hash' && failing ? 'different version' : network, { status: mode === 'http' && failing ? 503 : 200 })
    },
  })
  const read = () => new Promise<Response>(resolve => handlers.fetch({ request: new Request(`https://synthetic.invalid${path}`), respondWith: resolve }))
  const status = async () => {
    let result: any, done: Promise<void> | undefined
    handlers.message({ data: { type: 'CHECK_OFFLINE' }, ports: [{ postMessage(value: any) { result = value } }], waitUntil(value: Promise<void>) { done = value } })
    await done; return result
  }
  const lifecycle = (type: string) => {
    let done: Promise<void> | undefined
    handlers[type]({ waitUntil(value: Promise<void>) { done = value } })
    return done!
  }
  return { read, status, entries, retained, calls, content, path, lifecycle }
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
  await expect(current.lifecycle('install')).rejects.toThrow('synthetic cache failure')
  expect(current.calls.deleted).toEqual(['dance-stamp-web-synthetic-version'])
})

for (const mode of ['offline', 'http', 'hash', 'put']) test(`部分資源已保存後 ${mode} 失敗，拒絕安裝且只移除候選`, async () => {
  // 故障放在第二份，才能證明已寫入的半批候選也會回滾；第一份就失敗測不到這條路。
  const current = worker(mode, 'synthetic module', ['/timeline.js', '/style.css'], '/style.css')
  current.entries.clear()
  const before = new Map(current.retained)
  await expect(current.lifecycle('install')).rejects.toThrow()
  expect(current.calls.fetch).toBe(2)
  expect(current.calls.put).toBe(mode === 'put' ? 2 : 1)
  expect(current.entries.size).toBe(0)
  expect(current.calls.deleted).toEqual(['dance-stamp-web-synthetic-version'])
  expect(current.retained).toEqual(before)
  expect((await current.status()).complete).toBe(false)
})

test('完整安裝不清舊 cache；只有 activate 才清本工具舊版，保留其他 cache', async () => {
  const current = worker('', 'synthetic module', ['/timeline.js', '/style.css'])
  current.entries.clear()
  const before = new Map(current.retained)
  await current.lifecycle('install')
  expect((await current.status()).complete).toBe(true)
  expect(current.entries.size).toBe(2)
  expect(current.calls.deleted).toEqual([])
  expect(current.retained).toEqual(before)
  // 這裡只驗 activate handler 的刪除邊界；真正何時 activate 仍須瀏覽器生命週期證據。
  await current.lifecycle('activate')
  expect(current.calls.deleted).toEqual(['dance-stamp-web-previous'])
  expect(current.retained.get('synthetic-unrelated-cache')).toBe(before.get('synthetic-unrelated-cache'))
  expect((await current.status()).complete).toBe(true)
})
