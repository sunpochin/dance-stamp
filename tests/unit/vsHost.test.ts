/* 用途：拒絕外來／覆寫收據並維持固定產品來源；層：QA回歸；關聯：serve-vs.ts。 */
import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createVsHost } from '../../scripts/qa/serve-vs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vs-host-')), folder = join(root, 'output'), lock = join(root, 'test-only.lock'), build = join(root, 'static')
  mkdirSync(folder); mkdirSync(build); writeFileSync(join(root, 'plan.local.json'), '{}')
  // 單元測試只驗供應原始bytes的契約，不借其他測試先建好的dist，乾淨CI才能獨立執行。
  for (const file of ['index.html', 'main.js']) writeFileSync(join(build, file), readFileSync('web/' + file))
  return { root, folder, lock, build }
}
test('原產品模組逐bytes供應；收據依nonce／Origin、媒體依完整hash保全，stop核對自己的鎖', async () => {
  const { folder, lock, build } = fixture(), host = createVsHost(folder, 0, lock, build)
  const post = (path: string, body: string, origin = host.origin) => fetch(host.origin + path, { method: 'POST', headers: { origin }, body })
  try {
    const main = await (await fetch(host.origin + '/main.js')).arrayBuffer()
    expect(Buffer.from(main).equals(readFileSync('web/main.js'))).toBe(true)
    const html = await (await fetch(host.origin)).text()
    expect(html.indexOf('/qa-config.js')).toBeLessThan(html.indexOf('/vs-observer.js'))
    expect(html.indexOf('/vs-observer.js')).toBeLessThan(html.indexOf('/main.js'))
    expect((await post('/qa/receipt', '{}', 'http://example.com')).status).toBe(403)
    expect((await post('/qa/receipt', '{"config":{"nonce":"wrong"}}')).status).toBe(400)
    const body = JSON.stringify({ config: { nonce: host.config.nonce }, firstError: 'retained' })
    expect((await post('/qa/receipt', body)).status).toBe(200)
    expect((await post('/qa/receipt', body.replace('retained', 'later'))).status).toBe(200)
    expect(readFileSync(join(folder, 'receipt-001.local.json'), 'utf8')).toBe(body)
    const media = 'synthetic', hash = createHash('sha256').update(media).digest('hex')
    expect((await post('/qa/media/' + hash, 'wrong')).status).toBe(400)
    expect((await post('/qa/media/' + hash, media)).status).toBe(200)
    expect((await post('/qa/media/' + hash, media)).status).toBe(200)
    host.stop('test complete'); expect(existsSync(lock)).toBe(false)
    await expect(fetch(host.origin)).rejects.toThrow()
  } finally { host.stop('finally') }
})
test('忙碌鎖不得覆寫；nonce換人不得釋放', () => {
  const { root, folder, lock, build } = fixture(); writeFileSync(lock, 'busy original')
  expect(() => createVsHost(folder, 0, lock, build)).toThrow(); expect(readFileSync(lock, 'utf8')).toBe('busy original')
  // 此檔是本測試自行建立的隔離假鎖，非共用媒體鎖。
  const ownLock = join(root, 'second-test-only.lock'), host = createVsHost(folder, 0, ownLock, build)
  writeFileSync(ownLock, JSON.stringify({ nonce: 'another owner' })); host.stop('test nonce')
  expect(JSON.parse(readFileSync(ownLock, 'utf8')).nonce).toBe('another owner')
})
