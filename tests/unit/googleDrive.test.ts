/* 檔案用途：以合成回應驗證雲端權限、分段核對與帳號隔離。所在層：單元測試。主要關聯：google-drive.js、cloud-auth.js；不是實際 Google 驗收。 */
import { expect, test } from 'bun:test'
import { GoogleDrive, driveScope, chunkHashes, cloudChunkSize } from '../../web/google-drive.js'
import { cloudConfig, requestGoogle } from '../../web/cloud-auth.js'
const token = (id = 'owner-a') => ({ access_token: id, expires_in: 3600, scope: driveScope })
const json = (data: unknown, status = 200) => Response.json(data, { status })
function fixture() {
  const calls: { url: URL, init: any }[] = [], files = new Map<string, any>(), bytes = new Map<string, Blob>()
  let next = 0, accepted = 0, pending: any, failChunk = false, permissionExtra: any[] = [], corrupt = false
  const fetcher = async (value: string, init: any) => {
    const url = new URL(value); calls.push({ url, init })
    const account = init.headers.Authorization.slice(7)
    if (url.pathname.endsWith('/about')) return json({ user: { permissionId: account, emailAddress: 'synthetic@example.com' } })
    if (url.pathname.endsWith('/generateIds')) return json({ ids: [`file-${++next}`] })
    if (url.pathname.endsWith('/permissions')) return json({ permissions: [{ id: account, type: 'user', role: 'owner' }, ...permissionExtra] })
    if (url.pathname === '/upload/drive/v3/files' && init.method === 'POST') {
      pending = JSON.parse(init.body); accepted = 0
      return new Response(null, { headers: { Location: 'https://www.googleapis.com/upload/drive/v3/session' } })
    }
    if (url.pathname.endsWith('/session')) {
      const range = init.headers['Content-Range']
      if (range.startsWith('bytes */')) return new Response(null, { status: 308, headers: accepted ? { Range: `bytes=0-${accepted - 1}` } : {} })
      const match = range.match(/bytes (\d+)-(\d+)\/(\d+)/), start = Number(match[1]), end = Number(match[2]), total = Number(match[3])
      expect(start).toBe(accepted)
      bytes.set(pending.id, new Blob([...(start ? [bytes.get(pending.id)!] : []), init.body])); accepted = end + 1
      if (accepted === total) files.set(pending.id, { ...pending, size: String(total), ownedByMe: true, owners: [{ permissionId: account }] })
      if (failChunk) { failChunk = false; throw new Error('synthetic lost reply') }
      return accepted === total ? json({ id: pending.id }) : new Response(null, { status: 308, headers: { Range: `bytes=0-${end}` } })
    }
    const id = url.pathname.split('/').at(-1)!
    if (url.searchParams.get('alt') === 'media') {
      const [start, end] = init.headers.Range.slice(6).split('-').map(Number)
      return new Response(corrupt ? new Blob(['corrupt']) : bytes.get(id)!.slice(start, end + 1), { status: 206 })
    }
    if (url.pathname.endsWith('/files') && init.method === 'POST') {
      const row = { ...JSON.parse(init.body), id: `root-${++next}`, ownedByMe: true, owners: [{ permissionId: account }] }; files.set(row.id, row); return json(row)
    }
    if (url.pathname.endsWith('/files')) return json({ files: [...files.values()] })
    return files.has(id) ? json(files.get(id)) : json({}, 404)
  }
  const drive = new GoogleDrive({ fetcher })
  const job = async (blob: Blob) => {
    await drive.authorize(token()); const root = await drive.createRoot()
    return { account: drive.binding(), root: root.id, id: await drive.newId(), operation: crypto.randomUUID(), kind: 'probe-v1', name: 'synthetic.bin', hashes: await chunkHashes(blob) }
  }
  return { drive, job, files, bytes, calls, fetcher, fail: () => { failChunk = true }, shareRoot: () => { permissionExtra = [{ type: 'anyone', role: 'reader' }] }, corrupt: () => { corrupt = true } }
}
test('設定只接受精確 origin 與公開 client ID', () => {
  const id = '123-synthetic.apps.googleusercontent.com'
  expect(cloudConfig(id, 'http://localhost:4174', 'http://localhost:4174').clientId).toBe(id)
  for (const origin of ['http://localhost:4174/', 'http://localhost:4175', 'http://example.test', 'https://example.test/path']) expect(() => cloudConfig(id, origin, 'http://localhost:4174')).toThrow()
  expect(() => cloudConfig('secret', 'https://example.test', 'https://example.test')).toThrow()
})
test('拒絕 scope、不信任 email；憑證不進 URL 並在記憶體清除', async () => {
  const f = fixture()
  await expect(f.drive.authorize({ ...token(), scope: 'openid' })).rejects.toThrow('逐檔授權')
  expect(f.calls).toHaveLength(0)
  await f.drive.authorize(token()); expect(f.drive.binding()).toBe('owner-a')
  expect(f.calls[0].url.href).not.toContain('owner-a')
  expect(f.calls[0].init).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error' })
  expect(JSON.stringify(f.drive)).not.toContain('token')
  f.drive.disconnect(); expect(() => f.drive.binding()).toThrow('重新連接')
})
test('分段成檔、回應遺失後查進度、重試同一 ID 不增加副本', async () => {
  const f = fixture(), blob = new Blob([new Uint8Array(cloudChunkSize + 31)], { type: 'video/webm' }), job = await f.job(blob)
  try {
    f.fail(); await f.drive.upload(blob, job)
    expect(f.bytes.get(job.id)!.size).toBe(blob.size)
    expect(f.calls.filter(c => c.url.pathname.endsWith('/session') && c.init.headers['Content-Range'].startsWith('bytes */'))).toHaveLength(1)
    await f.drive.upload(blob, job)
    expect(f.calls.filter(c => c.url.pathname === '/upload/drive/v3/files')).toHaveLength(1)
    expect(f.files.size).toBe(2)
    const read = await f.drive.download(job.id, blob.size, job.hashes)
    expect(await chunkHashes(read)).toEqual(job.hashes)
  } finally { f.drive.disconnect() }
})
test('來源更換、公開的私人位置、錯誤 hash 與越界端點在信任邊界拒絕', async () => {
  const f = fixture(), blob = new Blob(['synthetic']), job = await f.job(blob)
  try {
    await expect(f.drive.upload(new Blob(['different']), job)).rejects.toThrow('來源內容已改變')
    f.shareRoot(); await expect(f.drive.upload(blob, job)).rejects.toThrow('私人位置')
    expect(f.calls.some(c => c.url.pathname.startsWith('/upload/'))).toBe(false)
    await expect(f.drive.request('https://example.test/drive/v3/files')).rejects.toThrow('不明雲端端點')
    await expect(f.drive.request('https://www.googleapis.com/other')).rejects.toThrow('不明雲端端點')
    await expect(f.drive.download('file-1', 1, ['bad'])).rejects.toThrow('描述無效')
  } finally { f.drive.disconnect() }
})
test('雲端損壞、取消、帳號切換不標成功也不寫其他帳號', async () => {
  const f = fixture(), blob = new Blob(['synthetic']), job = await f.job(blob)
  try {
    await f.drive.upload(blob, job); f.corrupt()
    await expect(f.drive.upload(blob, job)).rejects.toThrow('校驗不符')
    const controller = new AbortController(); controller.abort()
    const before = f.calls.length
    await expect(f.drive.upload(blob, job, controller.signal)).rejects.toThrow(); expect(f.calls.length).toBe(before)
    await f.drive.authorize(token('owner-b'))
    const after = f.calls.length
    await expect(f.drive.upload(blob, job)).rejects.toThrow('帳號已切換'); expect(f.calls.length).toBe(after)
    expect(f.bytes.get(job.id)!.size).toBe(blob.size)
  } finally { f.drive.disconnect() }
})
test('過期與 401 結束授權，不把伺服器錯誤或 token 寫到訊息', async () => {
  let now = 0
  const drive = new GoogleDrive({ now: () => now, fetcher: async () => json({ user: { permissionId: 'owner-a' } }) })
  await drive.authorize(token()); now = 3600001
  await expect(drive.roots()).rejects.toThrow('重新連接'); drive.disconnect()
  const second = new GoogleDrive({ fetcher: async value => value.includes('about') ? json({ user: { permissionId: 'owner-a' } }) : json({ error: 'synthetic secret' }, 401) })
  await second.authorize(token()); await expect(second.roots()).rejects.toThrow('到期'); expect(second.account).toBeUndefined()
})
test('清單與權限分頁都讀完，同名位置不擅自選第一筆', async () => {
  const drive = new GoogleDrive({ fetcher: async value => {
    const url = new URL(value)
    if (url.pathname.endsWith('/about')) return json({ user: { permissionId: 'owner-a' } })
    const second = url.searchParams.get('pageToken') === 'next'
    return url.pathname.endsWith('/permissions') ? json({ permissions: [{ id: second ? 'other' : 'owner-a', type: 'user', role: second ? 'reader' : 'owner' }], ...(!second && { nextPageToken: 'next' }) }) : json({ files: [{ id: second ? 'root-b' : 'root-a', name: 'same' }], ...(!second && { nextPageToken: 'next' }) })
  } })
  try { await drive.authorize(token()); expect((await drive.roots()).map(r => r.id)).toEqual(['root-a', 'root-b']); expect(await drive.permissions('root-a')).toHaveLength(2) } finally { drive.disconnect() }
})
test('切帳號會拒絕仍在等待的舊回應', async () => {
  let release: (response: Response) => void = () => {}
  const drive = new GoogleDrive({ fetcher: async value => value.includes('about') ? json({ user: { permissionId: 'owner-a' } }) : new Promise<Response>(resolve => { release = resolve }) })
  try {
    await drive.authorize(token()); const pending = drive.roots()
    drive.disconnect(); release(json({ files: [] })); await expect(pending).rejects.toThrow('重新連接')
  } finally { drive.disconnect() }
})
test('OAuth 在點按內啟動；取消後的晚到 callback 不再授權', async () => {
  let callback: any, requested = false
  const controller = new AbortController(), oauth = { initTokenClient: (options: any) => { callback = options.callback; expect(options.scope).toBe(driveScope); return { requestAccessToken: () => { requested = true } } }, hasGrantedAllScopes: () => true }
  const pending = requestGoogle(oauth, 'synthetic', controller.signal); expect(requested).toBe(true)
  controller.abort(); callback(token()); await expect(pending).rejects.toThrow()
})
