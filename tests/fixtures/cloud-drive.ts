/* 檔案用途：合成 Drive REST 回應，供失敗與瀏覽器流程測試共用。所在層：測試資料。主要關聯：googleDrive.test.ts、cloudSnapshot.test.ts；不連接 Google。 */
import { GoogleDrive, driveScope, chunkHashes } from '../../web/google-drive.js'
export const cloudToken = (id = 'owner-a') => ({ access_token: id, expires_in: 3600, scope: driveScope })
export function cloudDriveFixture() {
  const calls: { url: URL, init: any }[] = [], files = new Map<string, any>(), bytes = new Map<string, Blob>(), grants = new Map<string, any[]>()
  let next = 0, accepted = 0, pending: any, failChunk = false, permissionExtra: any[] = [], corrupt = false, denyUpload = '', loseGrant = false, loseRevoke = false
  const json = (data: unknown, status = 200) => Response.json(data, { status })
  const fetcher = async (value: string, init: any) => {
    const url = new URL(value); calls.push({ url, init })
    const account = init.headers.Authorization.slice(7), id = url.pathname.split('/').at(-1)!
    if (url.pathname.endsWith('/about')) return json({ user: { permissionId: account, emailAddress: 'synthetic@example.com' } })
    if (url.pathname.endsWith('/generateIds')) return json({ ids: [`file-${++next}`] })
    if (url.pathname.includes('/permissions')) {
      const fileId = url.pathname.split('/')[4], permissions = grants.get(fileId) || []
      if (init.method === 'POST') { const permission = { id: 'public-reader', ...JSON.parse(init.body) }; grants.set(fileId, [...permissions, permission]); if (loseGrant) { loseGrant = false; throw new Error('synthetic lost grant reply') } return json(permission) }
      if (init.method === 'DELETE') { grants.set(fileId, permissions.filter(p => p.id !== id)); if (loseRevoke) { loseRevoke = false; throw new Error('synthetic lost revoke reply') } return new Response(null, { status: 204 }) }
      return json({ permissions: [{ id: account, type: 'user', role: 'owner' }, ...permissionExtra, ...permissions] })
    }
    if (url.pathname === '/upload/drive/v3/files' && init.method === 'POST') {
      pending = JSON.parse(init.body); if (pending.appProperties.dsKind === denyUpload) return json({}, 403)
      accepted = 0; return new Response(null, { headers: { Location: 'https://www.googleapis.com/upload/drive/v3/session' } })
    }
    if (url.pathname.endsWith('/session')) {
      const range = init.headers['Content-Range']
      if (range.startsWith('bytes */')) return new Response(null, { status: 308, headers: accepted ? { Range: `bytes=0-${accepted - 1}` } : {} })
      const match = range.match(/bytes (\d+)-(\d+)\/(\d+)/), start = Number(match[1]), end = Number(match[2]), total = Number(match[3])
      if (start !== accepted) throw new Error('synthetic invalid offset')
      bytes.set(pending.id, new Blob([...(start ? [bytes.get(pending.id)!] : []), init.body])); accepted = end + 1
      if (accepted === total) {
        const sha256Checksum = Buffer.from(await crypto.subtle.digest('SHA-256', await bytes.get(pending.id)!.arrayBuffer())).toString('hex')
        files.set(pending.id, { ...pending, parents: pending.parents || ['my-drive'], size: String(total), ownedByMe: true, owners: [{ permissionId: account }], sha256Checksum, webViewLink: `https://drive.google.com/file/d/${pending.id}/view` })
      }
      if (failChunk) { failChunk = false; throw new Error('synthetic lost reply') }
      return accepted === total ? json({ id: pending.id }) : new Response(null, { status: 308, headers: { Range: `bytes=0-${end}` } })
    }
    if (url.searchParams.get('alt') === 'media') {
      const range = init.headers.Range
      if (!bytes.has(id)) return json({}, 404)
      const [start, end] = range ? range.slice(6).split('-').map(Number) : [0, bytes.get(id)!.size - 1]
      return new Response(corrupt ? new Blob(['corrupt']) : bytes.get(id)!.slice(start, end + 1), { status: range ? 206 : 200 })
    }
    if (url.pathname.endsWith('/files') && init.method === 'POST') {
      const row = { ...JSON.parse(init.body), id: `root-${++next}`, ownedByMe: true, owners: [{ permissionId: account }] }; files.set(row.id, row); return json(row)
    }
    if (url.pathname.endsWith('/files')) {
      const q = url.searchParams.get('q') || '', kind = q.match(/key='dsKind' and value='([^']+)'/)?.[1], parent = q.match(/'([^']+)' in parents/)?.[1]
      return json({ files: [...files.values()].filter(f => (!kind || f.appProperties.dsKind === kind) && (!parent || f.parents?.includes(parent))) })
    }
    if (files.has(id) && init.method === 'PATCH') { const patch = JSON.parse(init.body); Object.assign(files.get(id).appProperties, patch.appProperties); return json(files.get(id)) }
    return files.has(id) ? json(files.get(id)) : json({}, 404)
  }
  const drive = new GoogleDrive({ fetcher })
  const job = async (blob: Blob) => {
    await drive.authorize(cloudToken()); const root = await drive.createRoot()
    return { account: drive.binding(), root: root.id, id: await drive.newId(), operation: crypto.randomUUID(), kind: 'probe-v1', name: 'synthetic.bin', hashes: await chunkHashes(blob) }
  }
  return { drive, job, files, bytes, calls, grants, fetcher, fail: () => { failChunk = true }, loseGrant: () => { loseGrant = true }, loseRevoke: () => { loseRevoke = true }, deny: (kind: string) => { denyUpload = kind }, shareRoot: () => { permissionExtra = [{ type: 'anyone', role: 'reader' }] }, corrupt: () => { corrupt = true } }
}
