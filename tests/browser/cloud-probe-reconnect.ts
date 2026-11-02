/* 檔案用途：驗證公開合成probe、斷開與同位置重連仍保留資料及舊成品。所在層：合成瀏覽器回歸。主要關聯：verify-cloud.ts、cloud-pending-recovery.ts、cloud-ui.js、#235。 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cloudWorkspace } from './cloud-pending-recovery'

export async function cloudProbeReconnect({ page, connect, idle, fixture, out }) {
  const { first, record, download, snapshot, beforeDownload } = await cloudWorkspace({ page, idle, out })
  const before = await snapshot(first)
  assert.equal(before.library.data.takes.length, 1); assert.equal(before.library.data.recipes.length, 1); assert.equal(before.library.data.exports.length, 1)
  assert(before.sources.every(source => !source.revoked && source.bytes > 0)); assert(beforeDownload.bytes > 0)
  const vs = before.library.data.exports[0].assetId
  assert.deepEqual(before.media.find(row => row.id === vs), { id: vs, bytes: beforeDownload.bytes, sha256: beforeDownload.sha256 })
  for (const [index, name] of ['reference.webm', 'self.webm'].entries()) assert.equal(before.sources[index].sha256, createHash('sha256').update(readFileSync(resolve(out, name))).digest('hex'))
  record('before-probe', before)
  const remote = async () => ({
    files: JSON.parse(JSON.stringify([...fixture.files.values()])).sort((a, b) => a.id.localeCompare(b.id)),
    bytes: await Promise.all([...fixture.bytes].sort(([a], [b]) => a.localeCompare(b)).map(async ([id, blob]) => ({ id, bytes: blob.size, sha256: createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex') }))),
    grants: [...fixture.grants],
  })
  const uploadWrites = () => fixture.calls.filter(call => call.init.method === 'POST' && call.url.pathname.startsWith('/upload')).length
  await connect(first); await first.locator('#cloud-create-root').click(); await idle(first)
  const root = await first.locator('#cloud-root').inputValue(); assert(root)
  await first.locator('summary').filter({ hasText: '合成小檔連線檢查' }).click()
  await first.locator('#cloud-probe').click(); await idle(first)
  assert.match(await first.locator('#cloud-status').innerText(), /合成小檔已上傳，並完整讀回核對/)
  const job = await first.evaluate(() => JSON.parse(localStorage.getItem('dance-stamp-cloud-probe-v1')!))
  assert.equal(job.root, root); assert.equal(job.kind, 'probe-v1'); assert.equal(job.account, 'owner-a')
  const probes = [...fixture.files.values()].filter(file => file.appProperties.dsKind === 'probe-v1')
  assert.equal(probes.length, 1); assert.equal(probes[0].id, job.id); assert.equal(probes[0].appProperties.dsOperation, job.operation)
  const expected = `Dance Stamp synthetic transfer v1\n${job.operation}\n`
  assert.equal(await fixture.bytes.get(job.id).text(), expected)
  assert.deepEqual(job.hashes, [createHash('sha256').update(expected).digest('hex')])
  assert.equal(uploadWrites(), 1)
  await first.locator('#cloud-read-probe').click(); await idle(first)
  assert.match(await first.locator('#cloud-status').innerText(), /已讀回並核對 1 份合成小檔/)
  const accepted = await remote(), writes = uploadWrites()
  assert.deepEqual(await snapshot(first), before)
  await first.locator('#cloud-disconnect').click(); await idle(first)
  assert.match(await first.locator('#cloud-status').innerText(), /清除本次憑證。檔案與既有公開連結保留/)
  assert.match(await first.locator('#cloud-account').innerText(), /尚未連接或授權已結束/)
  assert.equal(await first.locator('#cloud-root option').count(), 0)
  for (const id of ['cloud-probe', 'cloud-read-probe', 'cloud-roots', 'cloud-create-root', 'cloud-disconnect']) assert.equal(await first.locator('#' + id).isDisabled(), true)
  assert.equal(await first.locator('#cloud-connect').isEnabled(), true)
  assert.deepEqual(await remote(), accepted); assert.deepEqual(await snapshot(first), before)
  record('after-disconnect', { local: await snapshot(first), remote: accepted, job })
  // 再連線後仍要求使用者重讀並明選原位置，不能靠殘留select值假裝已恢復授權。
  await connect(first, true)
  assert.equal(await first.locator('#cloud-root option').count(), 0)
  await first.locator('#cloud-roots').click(); await idle(first); await first.locator('#cloud-root').selectOption(root)
  await first.locator('#cloud-read-probe').click(); await idle(first)
  assert.match(await first.locator('#cloud-status').innerText(), /已讀回並核對 1 份合成小檔/)
  await first.locator('#cloud-probe').click(); await idle(first)
  assert.match(await first.locator('#cloud-status').innerText(), /合成小檔已上傳，並完整讀回核對/)
  assert.deepEqual(await first.evaluate(() => JSON.parse(localStorage.getItem('dance-stamp-cloud-probe-v1')!)), job)
  assert.equal(uploadWrites(), writes); assert.deepEqual(await remote(), accepted); assert.deepEqual(await snapshot(first), before)
  await first.locator('#cloud-close').click()
  const afterDownload = await download(first, 'after-reconnect-vs.bin')
  assert.equal(afterDownload.bytes, beforeDownload.bytes); assert.equal(afterDownload.sha256, beforeDownload.sha256)
  record('after-reconnect', { local: await snapshot(first), remote: await remote(), job })
  return { probeUploadedAndReadBack: true, disconnectClearsPublicSession: true, explicitSameRootReconnect: true, sameProbeWithoutNewUpload: true, localDataAndOriginalsPreserved: true, remoteFilesAndPermissionsPreserved: true, downloads: [beforeDownload, afterDownload] }
}
