/* 檔案用途：驗證成品副本、公開確認後的精確授權與撤銷恢復。所在層：合成邏輯測試。主要關聯：cloud-sharing.js；不代表匿名實播驗收。 */
import { expect, test } from 'bun:test'
import { prepareVideoShare, publishVideoShare, videoShareState, stopVideoShare, listVideoShares, driveViewLink } from '../../web/cloud-sharing.js'
import { cloudDriveFixture, cloudToken } from '../fixtures/cloud-drive'
const video = () => new Blob(['synthetic finished video'], { type: 'video/webm' })
test('獨立成品先核對 bytes 才公開；私人位置與筆記不改權限', async () => {
  const f = cloudDriveFixture(), records: any[] = []
  try {
    await f.drive.authorize(cloudToken()); const root = await f.drive.createRoot(), blob = video(), job = await prepareVideoShare(f.drive, blob, 'dance-video.webm')
    await publishVideoShare(f.drive, job, blob, value => records.push(structuredClone(value)))
    expect(job.root).toBeNull(); expect(f.files.get(job.id).parents).not.toContain(root.id)
    expect(f.grants.get(root.id)).toBeUndefined(); expect(f.grants.get(job.id)).toEqual([{ id: 'public-reader', type: 'anyone', role: 'reader', allowFileDiscovery: false }])
    const state = await videoShareState(f.drive, job); expect(state.link).toBe(`https://drive.google.com/file/d/${job.id}/view`); expect(state.otherAccess).toBe(false)
    expect(records.some(r => r.intent === true && !r.permissionId)).toBe(true)
    expect(f.files.get(job.id).appProperties.dsPermission).toBe('public-reader')
    const apiCalls = f.calls.map(c => `${c.init.method || 'GET'} ${c.url.pathname}`)
    expect(apiCalls.findIndex(c => c.includes('POST') && c.endsWith('/permissions'))).toBeGreaterThan(apiCalls.findIndex(c => c.startsWith('GET') && c.endsWith('/' + job.id)))
    const remote = (await listVideoShares(f.drive))[0]; expect((await videoShareState(f.drive, remote)).grant.id).toBe('public-reader')
    await stopVideoShare(f.drive, remote, () => {}); expect(f.files.has(job.id)).toBe(true); expect(f.grants.get(job.id)).toEqual([])
  } finally { f.drive.disconnect() }
})
test('建立／撤銷回應遺失先待確認，重試同一副本不重複公開或刪檔', async () => {
  const f = cloudDriveFixture()
  try {
    await f.drive.authorize(cloudToken()); const blob = video(), job = await prepareVideoShare(f.drive, blob, 'dance-video.webm')
    f.loseGrant(); await expect(publishVideoShare(f.drive, job, blob, () => {})).rejects.toThrow('待確認')
    expect(job.intent).toBe(true); expect((await videoShareState(f.drive, job)).grant).toBeUndefined()
    const state = await publishVideoShare(f.drive, job, blob, () => {}); expect(state.grant.id).toBe('public-reader')
    expect(f.calls.filter(c => c.init.method === 'POST' && c.url.pathname.endsWith('/permissions'))).toHaveLength(1)
    f.loseRevoke(); await expect(stopVideoShare(f.drive, job, () => {})).rejects.toThrow('待確認')
    expect((await stopVideoShare(f.drive, job, () => {})).grant).toBeUndefined()
    expect(f.calls.filter(c => c.init.method === 'DELETE')).toHaveLength(1); expect(f.files.has(job.id)).toBe(true)
  } finally { f.drive.disconnect() }
})
test('只撤銷自己的單一權限，保留其他讀者並回報仍有授權', async () => {
  const f = cloudDriveFixture()
  try {
    await f.drive.authorize(cloudToken()); const blob = video(), job = await prepareVideoShare(f.drive, blob, 'dance-video.webm')
    await publishVideoShare(f.drive, job, blob, () => {})
    f.grants.get(job.id)!.push({ id: 'other-reader', type: 'user', role: 'reader' })
    const state = await stopVideoShare(f.drive, job, () => {})
    expect(state.otherAccess).toBe(true); expect(f.grants.get(job.id)).toEqual([{ id: 'other-reader', type: 'user', role: 'reader' }])
    expect(f.calls.filter(c => c.init.method === 'DELETE')[0].url.pathname).toEndWith('/permissions/public-reader')
  } finally { f.drive.disconnect() }
})
test('外部變更／繼承、帳號切換與其他檔案不擴權也不自動撤銷', async () => {
  const f = cloudDriveFixture()
  try {
    await f.drive.authorize(cloudToken()); const blob = video(), job = await prepareVideoShare(f.drive, blob, 'dance-video.webm')
    await publishVideoShare(f.drive, job, blob, () => {})
    f.grants.get(job.id)![0].permissionDetails = [{ inherited: true }]
    await expect(stopVideoShare(f.drive, job, () => {})).rejects.toThrow('外部修改或繼承')
    expect(f.calls.filter(c => c.init.method === 'DELETE')).toHaveLength(0)
    f.files.get(job.id).appProperties.dsKind = 'snapshot-media-v1'
    await expect(videoShareState(f.drive, job)).rejects.toThrow('獨立成品')
    await f.drive.authorize(cloudToken('owner-b')); const before = f.calls.length
    await expect(stopVideoShare(f.drive, job, () => {})).rejects.toThrow('帳號'); expect(f.calls).toHaveLength(before)
  } finally { f.drive.disconnect() }
})
test('檔名、觀看頁與來源有界，不把任意 URL 或 API token 帶到連結', async () => {
  const f = cloudDriveFixture()
  try {
    await f.drive.authorize(cloudToken())
    await expect(prepareVideoShare(f.drive, new Blob(['notes'], { type: 'text/plain' }), 'notes.txt')).rejects.toThrow('已完成的影片')
    await expect(prepareVideoShare(f.drive, video(), '../private.webm')).rejects.toThrow('檔名')
    expect(() => driveViewLink({ id: 'file-1', webViewLink: 'https://example.com/file/d/file-1/view' })).toThrow()
    expect(driveViewLink({ id: 'file-1', webViewLink: 'https://drive.google.com/file/d/file-1/view?access_token=synthetic&resourcekey=synthetic' })).toBe('https://drive.google.com/file/d/file-1/view?resourcekey=synthetic')
  } finally { f.drive.disconnect() }
})

test('遠端收據 PATCH 失敗後重試必須補存，另一裝置才能讀取及停止分享', async () => {
  const f = cloudDriveFixture()
  try {
    await f.drive.authorize(cloudToken()); const blob = video(), job = await prepareVideoShare(f.drive, blob, 'dance-video.webm')
    const json = f.drive.json.bind(f.drive); let fail = true
    // 故障發生在 Drive 收到 PATCH 前；本機已有 permissionId 不能代替遠端收據。
    f.drive.json = async (path, init = {}, signal) => {
      if (init.method === 'PATCH' && fail) { fail = false; throw Error('synthetic receipt not delivered') }
      return json(path, init, signal)
    }
    await expect(publishVideoShare(f.drive, job, blob, () => {})).rejects.toThrow('not delivered')
    expect(job.permissionId).toBe('public-reader'); expect(f.files.get(job.id).appProperties.dsPermission).toBeUndefined()
    await publishVideoShare(f.drive, job, blob, () => {})
    const remote = (await listVideoShares(f.drive))[0]
    expect((await videoShareState(f.drive, remote)).grant?.id).toBe('public-reader')
    await stopVideoShare(f.drive, remote, () => {})
    expect(f.grants.get(job.id)).toEqual([])
    expect(f.calls.filter(c => c.init.method === 'POST' && c.url.pathname.endsWith('/permissions'))).toHaveLength(1)
  } finally { f.drive.disconnect() }
})
