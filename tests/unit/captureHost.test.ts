/* 用途：有界主機nonce／首份收據封存回歸；層：QA工具測試；關聯：serve-capture.ts。 */
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCaptureHost } from '../../scripts/qa/serve-capture'

test('主機只接受自己的nonce／Origin，首份收據封存後拒絕修改，期限釋鎖', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'capture-host-test-')), lock = join(folder, 'synthetic-test.lock')
  const host = createCaptureHost(folder, lock, 1000), origin = host.record.origin
  const post = (path: string, body = '{}', caller = origin) => fetch(origin + path, { method: 'POST', headers: { origin: caller }, body })
  try {
    expect((await post('/result/wrong')).status).toBe(404)
    expect((await post('/result/' + host.record.nonce, '{}', 'http://example.com')).status).toBe(403)
    const data = JSON.stringify({ config: { nonce: host.record.nonce }, firstError: { message: 'original' } })
    expect((await post('/result/' + host.record.nonce, data)).status).toBe(200)
    expect((await post('/result/' + host.record.nonce, data.replace('original', 'late'))).status).toBe(409)
    expect((await post('/media/' + host.record.nonce)).status).toBe(409)
    expect(readFileSync(join(folder, 'content.local.json'), 'utf8')).toBe(data)
    host.stop('test completed'); expect(existsSync(lock)).toBe(false)
    await expect(fetch(origin)).rejects.toThrow()
  } finally { host.stop('test finally') }
})
test('主機期限自然到時收尾；nonce若換人不釋放別人的鎖', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'capture-host-test-')), lock = join(folder, 'synthetic-test.lock')
  const host = createCaptureHost(folder, lock, 15)
  writeFileSync(lock, JSON.stringify({ nonce: 'another-owner' }))
  await Bun.sleep(30)
  const receipt = JSON.parse(readFileSync(join(folder, 'host-cleanup.local.json'), 'utf8'))
  expect(receipt.reason).toBe('host lifetime timeout'); expect(receipt.lockReleased).toBe(false)
  expect(JSON.parse(readFileSync(lock, 'utf8')).nonce).toBe('another-owner')
  await expect(fetch(host.record.origin)).rejects.toThrow()
})
test('忙碌鎖只回報，不能覆寫或建立替代媒體鎖', () => {
  const folder = mkdtempSync(join(tmpdir(), 'capture-host-test-')), lock = join(folder, 'synthetic-test.lock')
  const original = JSON.stringify({ nonce: 'existing-owner', pid: 123 })
  writeFileSync(lock, original)
  expect(() => createCaptureHost(folder, lock)).toThrow()
  expect(readFileSync(lock, 'utf8')).toBe(original)
})
test('啟動首錯不被收尾收據寫入錯誤遮蔽，舊收據不能覆寫', () => {
  const folder = mkdtempSync(join(tmpdir(), 'capture-host-test-')), lock = join(folder, 'synthetic-test.lock')
  writeFileSync(join(folder, 'host.local.json'), 'original host')
  writeFileSync(join(folder, 'host-cleanup.local.json'), 'original cleanup')
  try { createCaptureHost(folder, lock); throw Error('unexpected success') }
  catch (error) { expect(String(error)).toContain('host.local.json') }
  expect(readFileSync(join(folder, 'host-cleanup.local.json'), 'utf8')).toBe('original cleanup')
  expect(existsSync(lock)).toBe(false)
})
