/* 檔案用途：驗證衝突副本、跨來源隔離與完整關聯。所在層：備份純資料驗收。主要關聯：web/library.js、DATA_FORMAT.md。 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { normalizedVideo, extension } from '../../web/recorder.js'
import { newLibrary, planBackupImport, validateBackup, parseBackup, mediaInventory, videoLabels, tables } from '../../web/library.js'
function graph() {
  const data = newLibrary(), videoId = crypto.randomUUID(), referenceId = crypto.randomUUID(), selfId = crypto.randomUUID(), vsId = crypto.randomUUID(), takeId = crypto.randomUUID(), recipeId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成課程', durationMs: 90000, revision: 1 })
  data.assets.push({ id: referenceId, videoId, kind: 'reference', byteLength: 100, mimeType: 'video/mp4', durationMs: 90000, state: 'ready', storageKind: 'indexeddb' }, { id: selfId, kind: 'take', byteLength: 200, mimeType: 'video/mp4', durationMs: 70000 }, { id: vsId, kind: 'vs', byteLength: 300, mimeType: 'video/mp4', durationMs: 20000 })
  data.markers.push({ id: crypto.randomUUID(), videoId, startMs: 12000, title: '合成八拍', note: '<img src=x onerror=alert(1)>', revision: 1 })
  data.takes.push({ id: takeId, referenceVideoId: videoId, cameraAssetId: selfId, referenceStartMs: 12000, referenceEndMs: 32000, rate: 1, state: 'ready', createdAt: '2026-10-28T00:00:00Z' })
  data.recipes.push({ id: recipeId, takeId, offsetMs: 4000, referenceMirror: true, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
  data.exports.push({ id: crypto.randomUUID(), recipeId, recipeRevision: 1, assetId: vsId, mimeType: 'video/mp4', state: 'ready', createdAt: '2026-10-28T00:00:01Z' })
  return data
}
test('同片多個示範描述與共用輸出的排序不受輸入順序影響，且重匯不重複', async () => {
  const local = graph(), incoming = structuredClone(local)
  incoming.sourceLibraryId = crypto.randomUUID()
  incoming.assets.push({ ...incoming.assets[0], id: crypto.randomUUID(), byteLength: 123 })
  incoming.exports.push({ ...incoming.exports[0], id: crypto.randomUUID(), createdAt: '2026-10-29T00:00:00Z' })
  const original = structuredClone(incoming), first = await planBackupImport(local, incoming)
  incoming.assets.reverse(); incoming.exports.reverse()
  const reordered = await planBackupImport(local, incoming)
  for (const table of tables) expect(new Map(first.data[table].map(row => [row.id, row]))).toEqual(new Map(reordered.data[table].map(row => [row.id, row])))
  expect((await planBackupImport(first.data, original)).added).toBe(0)
  expect(local.assets).toHaveLength(3); expect(local.exports).toHaveLength(1)
})
test('恰好容量上限的 UTF-8 正常／救援備份仍可還原，保留全部 v2 關聯且不修改本機', async () => {
  const data = graph(), moveId = crypto.randomUUID(), limit = 10 * 1024 * 1024
  // 各產品 asset owner 與匯入白名單都會設定此欄，不能以漏欄的人工 state 冒稱可達邊界。
  for (const asset of data.assets) asset.mediaIncluded = false
  data.moves.push({ id: moveId, name: '合成腳步', danceStyle: 'Salsa', status: 'practicing', revision: 1 })
  data.videos[0].beatGrid = { bpm: 120, firstBeatMs: 350, countInBeats: 4 }
  data.takes[0].beatGrid = { bpm: 124, firstBeatMs: 450, countInBeats: 8 }
  data.markers = Array.from({ length: 530 }, () => ({ ...data.markers[0], id: crypto.randomUUID(), moveId, note: '' }))
  // 不預留容量；漢字與代理對共 7 bytes／3 個 JS 字元，避免字數測試掩蓋 UTF-8 邊界。
  let remaining = limit - new Blob([JSON.stringify(data)]).size
  for (const marker of data.markers) {
    const count = Math.min(Math.floor(remaining / 7), 6666)
    marker.note = '舞💃'.repeat(count); remaining -= count * 7
    const ascii = Math.min(remaining, 20_000 - marker.note.length)
    marker.note += 'x'.repeat(ascii); remaining -= ascii
  }
  expect(remaining).toBe(0)
  expect(new Blob([JSON.stringify(data)]).size).toBe(limit)
  const before = structuredClone(data), canonical = validateBackup(data)
  const source = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8').match(/function downloadBackup\([^]*?\n}/)![0]
  for (const unconfirmed of [false, true]) {
    let exported: Blob | undefined, downloaded = false, message = ''
    // 直接執行產品下載函式，只替換 DOM／URL 出口；此處不宣稱瀏覽器下載或原生交易驗收。
    const downloadBackup = runInNewContext(source + '\n;downloadBackup', {
      state: { revision: 7, data }, validateBackup, Blob, Date,
      $: () => ({ open: false }), urlFor: (_key: string, blob: Blob) => { exported = blob; return 'blob:synthetic-backup' },
      document: { createElement: () => ({ click() { downloaded = true } }) },
      storageUnconfirmed: () => unconfirmed, status: (value: string) => { message = value },
    })
    downloadBackup()
    expect(downloaded).toBe(true)
    expect(exported!.size).toBeLessThanOrEqual(limit)
    const restored = parseBackup(await exported!.text())
    for (const table of tables) expect(restored[table]).toEqual(canonical[table])
    expect(restored.sourceLibraryId).toBe(data.sourceLibraryId)
    expect((await planBackupImport(data, restored)).added).toBe(0)
    expect(data).toEqual(before)
    if (unconfirmed) expect(message).toContain('最後確認的筆記')
  }
})
test('空資料集還原保留來源身分與缺片狀態；原庫及重匯均不覆寫', async () => {
  const data = graph(), incoming = validateBackup(data), initial = await planBackupImport(newLibrary(), incoming)
  expect(initial.data.sourceLibraryId).toBe(data.sourceLibraryId)
  expect(initial.data.takes).toEqual(data.takes)
  expect(initial.data.assets.every(a => a.state === 'missing')).toBe(true)
  const repeated = await planBackupImport(data, incoming)
  expect(repeated.added).toBe(0)
  expect(repeated.data.assets[0].state).toBe('ready')
  expect(repeated.data.recipes).toEqual(data.recipes)
})
test('完整 v1 備份升 v2 並可重匯；舊備份衝突仍保留本機分類、動作、拍點及媒體狀態', async () => {
  // 明確固定舊格式，避免 newLibrary 升版後讓相容測試其實只測到新版。
  const legacy = graph(); legacy.schemaVersion = 1
  const legacyBefore = structuredClone(legacy), normalized = validateBackup(legacy)
  const restored = await planBackupImport(newLibrary(), legacy)
  expect(restored.data.schemaVersion).toBe(2)
  expect(restored.data.sourceLibraryId).toBe(legacy.sourceLibraryId)
  for (const table of tables.filter(t => t !== 'assets')) expect(restored.data[table]).toEqual(normalized[table])
  expect(validateBackup(restored.data).assets).toEqual(normalized.assets)
  expect(restored.data.assets.every(a => a.state === 'missing')).toBe(true)
  expect((await planBackupImport(restored.data, legacy)).added).toBe(0)

  const local = structuredClone(legacy); local.schemaVersion = 2
  const moveId = crypto.randomUUID(), grid = { bpm: 120, firstBeatMs: 350, countInBeats: 4 }
  Object.assign(local.videos[0], { teacher: '合成老師', danceStyle: 'Salsa', recordedDate: '2026-10-29', beatGrid: grid })
  local.takes[0].beatGrid = { ...grid, bpm: 124 }
  local.moves.push({ id: moveId, name: '合成腳步', danceStyle: 'Salsa', status: 'practicing', revision: 1 })
  local.markers[0].moveId = moveId
  const before = structuredClone(local), plan = await planBackupImport(local, legacy)
  for (const table of tables) expect(plan.data[table].slice(0, local[table].length)).toEqual(before[table])
  expect(plan.data.markers[1]).not.toHaveProperty('moveId')
  expect(plan.data.takes[1].referenceVideoId).toBe(plan.data.videos[1].id)
  expect(plan.data.recipes[1].takeId).toBe(plan.data.takes[1].id)
  expect(plan.data.assets.find(a => a.id === plan.data.exports[1].assetId)?.state).toBe('missing')
  expect((await planBackupImport(plan.data, legacy)).added).toBe(0)
  expect((await planBackupImport(plan.data, normalized)).added).toBe(0)
  expect(local).toEqual(before)
  expect(legacy).toEqual(legacyBefore)
})
test('影片衝突重寫完整下游；新 VS 不擅自沿用本機舊輸出', async () => {
  const local = graph(), before = structuredClone(local), incoming = validateBackup(local)
  incoming.videos[0].title = '備份另一版本'
  const plan = await planBackupImport(local, incoming), copiedVideo = plan.data.videos[1], copiedTake = plan.data.takes[1], copiedRecipe = plan.data.recipes[1], copiedExport = plan.data.exports[1]
  expect(plan.conflicts).toHaveLength(1)
  expect(copiedVideo.id).not.toBe(local.videos[0].id)
  expect(copiedVideo.id[14]).toBe('8')
  expect(copiedTake.referenceVideoId).toBe(copiedVideo.id)
  expect(copiedTake.cameraAssetId).toBe(local.takes[0].cameraAssetId)
  expect(copiedRecipe.takeId).toBe(copiedTake.id)
  expect(copiedExport.recipeId).toBe(copiedRecipe.id)
  expect(copiedExport.assetId).not.toBe(local.exports[0].assetId)
  expect(plan.data.markers[1].videoId).toBe(copiedVideo.id)
  expect(plan.data.assets.find(a => a.id === copiedExport.assetId)?.state).toBe('missing')
  expect(local).toEqual(before)
  expect(plan.data.videos[0]).toEqual(before.videos[0])
  expect(plan.data.takes[0]).toEqual(before.takes[0])
  incoming.exportedAt = '2026-10-28T10:00:00Z'; incoming.assets.reverse()
  expect((await planBackupImport(plan.data, incoming)).added).toBe(0)
})
test('衝突配方有獨立 take 可開啟；其他新增筆記不讓舊副本重複', async () => {
  const local = graph(), incoming = validateBackup(local)
  incoming.recipes[0].offsetMs = 4050; incoming.recipes[0].revision++
  const first = await planBackupImport(local, incoming)
  expect(first.additions.videos).toBe(0)
  expect(first.additions.takes).toBe(1)
  expect(first.additions.recipes).toBe(1)
  expect(first.additions.exports).toBe(1)
  expect(first.additions.assets).toBe(1)
  expect(first.data.recipes[1].offsetMs).toBe(4050)
  expect(first.data.recipes.find(r => r.takeId === first.data.takes[1].id)?.offsetMs).toBe(4050)
  expect(first.data.recipes.find(r => r.takeId === local.takes[0].id)?.offsetMs).toBe(4000)
  incoming.videos.push({ id: crypto.randomUUID(), title: '另一合成課程', durationMs: 1000, revision: 1 })
  const next = await planBackupImport(first.data, incoming)
  expect(next.added).toBe(1)
  expect(next.additions.recipes).toBe(0)
})
test('同一 take 的不同備份校正各有可開啟的副本；重匯仍冪等', async () => {
  const local = graph(), first = validateBackup(local), second = validateBackup(local)
  first.recipes[0].offsetMs = 4050; first.recipes[0].revision++
  second.recipes[0].offsetMs = 4100; second.recipes[0].revision++
  const one = await planBackupImport(local, first), two = await planBackupImport(one.data, second)
  expect(two.data.takes).toHaveLength(3)
  expect(two.data.takes.map(t => two.data.recipes.find(r => r.takeId === t.id)?.offsetMs)).toEqual([4000, 4050, 4100])
  expect((await planBackupImport(two.data, first)).added).toBe(0)
  expect((await planBackupImport(two.data, second)).added).toBe(0)
})
test('已編輯的配方副本保留在原 take；再次匯入不增加不可選的第二配方', async () => {
  const local = graph(), incoming = validateBackup(local)
  incoming.recipes[0].offsetMs = 4050; incoming.recipes[0].revision++
  const first = await planBackupImport(local, incoming), edited = first.data.recipes[1]
  edited.offsetMs = 4075; edited.revision++
  const second = await planBackupImport(first.data, incoming)
  expect(second.data.takes).toHaveLength(3)
  expect(second.data.takes.map(t => second.data.recipes.filter(r => r.takeId === t.id).length)).toEqual([1, 1, 1])
  expect(second.data.takes.map(t => second.data.recipes.find(r => r.takeId === t.id)?.offsetMs)).toEqual([4000, 4075, 4050])
  expect((await planBackupImport(second.data, incoming)).added).toBe(0)
})
test('示範檔衝突分開影片；後續來源版本不錯連舊副本或 VS', async () => {
  const local = graph(), incoming = validateBackup(local)
  incoming.assets[0].byteLength++
  const first = await planBackupImport(local, incoming), firstVideo = first.data.videos[1].id
  incoming.assets[0].byteLength++
  const second = await planBackupImport(first.data, incoming), secondVideo = second.data.videos[2].id
  expect(firstVideo).not.toBe(secondVideo)
  for (const videoId of [firstVideo, secondVideo]) expect(second.data.assets.filter(a => a.kind === 'reference' && a.videoId === videoId)).toHaveLength(1)
  expect(second.data.exports[1].assetId).not.toBe(second.data.exports[2].assetId)
  expect((await planBackupImport(second.data, incoming)).added).toBe(0)
})
test('不同來源建立隔離 ID；經另一個空環境還原後仍重匯冪等', async () => {
  const local = graph(), incoming = validateBackup(local); incoming.sourceLibraryId = crypto.randomUUID()
  const foreign = await planBackupImport(local, incoming)
  expect(foreign.differentSource).toBe(true)
  expect(foreign.conflicts).toHaveLength(0)
  expect(foreign.data.takes[1].referenceVideoId).toBe(foreign.data.videos[1].id)
  expect(foreign.data.takes[1].cameraAssetId).not.toBe(local.takes[0].cameraAssetId)
  expect((await planBackupImport(foreign.data, incoming)).added).toBe(0)
  const restored = await planBackupImport(newLibrary(), validateBackup(foreign.data))
  expect((await planBackupImport(restored.data, incoming)).added).toBe(0)
})
test('已編輯的副本也保留；再匯原備份新增穩定副本而非覆寫', async () => {
  const local = graph(), incoming = validateBackup(local); incoming.markers[0].note = '備份版本'
  const first = await planBackupImport(local, incoming), edited = first.data.markers[1]
  edited.note = '副本後續編輯'; edited.revision++
  const next = await planBackupImport(first.data, incoming)
  expect(next.data.markers.find(m => m.id === edited.id)?.note).toBe('副本後續編輯')
  expect(next.data.markers).toHaveLength(3)
  expect((await planBackupImport(next.data, incoming)).added).toBe(0)
})
test('typed 關聯分開相同 UUID；未知欄位不影響副本身分', async () => {
  const local = graph(), incoming = validateBackup(local); incoming.sourceLibraryId = crypto.randomUUID()
  const self = incoming.assets.find(a => a.kind === 'take')!; self.id = incoming.videos[0].id; incoming.takes[0].cameraAssetId = self.id
  const first = await planBackupImport(local, incoming)
  expect(first.data.takes[1].cameraAssetId).not.toBe(first.data.takes[1].referenceVideoId)
  Object.assign(incoming.assets[0], { objectURL: 'blob:synthetic-only', deviceId: 'synthetic-only' })
  expect((await planBackupImport(first.data, incoming)).added).toBe(0)
})
test('未來版本、孤兒、超限與取消都不改本機；不接管他頁錄影', async () => {
  const local = graph(), incoming = validateBackup(local), before = structuredClone(local)
  for (const change of [d => { d.schemaVersion = 99 }, d => { d.recipes[0].takeId = crypto.randomUUID() }, d => { d.markers[0].note = 'x'.repeat(20001) }]) {
    const bad = structuredClone(incoming); change(bad); await expect(planBackupImport(local, bad)).rejects.toThrow()
  }
  const controller = new AbortController(); incoming.sourceLibraryId = crypto.randomUUID()
  const pending = planBackupImport(local, incoming, controller.signal); controller.abort(); await expect(pending).rejects.toThrow()
  expect(local).toEqual(before)
  local.takes[0].state = 'recording'
  expect((await planBackupImport(local, validateBackup(local))).data.takes[0].state).toBe('recording')
})

test('媒體清單只認實際 key／確認 File，同名筆記可分辨但不改原文', () => {
  const data = graph(), another = { ...data.videos[0], id: crypto.randomUUID() }; data.videos.push(another)
  const labels = videoLabels(data.videos)
  expect(labels.get(data.videos[0].id)).toBe('合成課程（第1份）')
  expect(labels.get(another.id)).toBe('合成課程（第2份）')
  expect(data.videos.every(v => v.title === '合成課程')).toBe(true)
  data.takes[0].state = 'interrupted'
  const rows = mediaInventory(data, new Set([data.assets[2].id]), new Set([data.assets[1].id]))
  expect(rows.map(r => r.availability)).toEqual(['missing', 'session', 'stored'])
  expect(rows[1].interrupted).toBe(true)
  expect(rows[2].owner).toBe('合成課程（第1份）')
})

test('改名原片有界補正容器，原始 bytes 不變，空檔仍拒絕', async () => {
  const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0])
  const normalized = await normalizedVideo(new File([bytes], 'synthetic.data', { type: 'application/octet-stream' }))
  expect(normalized.type).toBe('video/mp4')
  expect(extension(normalized.type)).toBe('mp4')
  expect(new Uint8Array(await normalized.arrayBuffer())).toEqual(bytes)
  bytes.set([113, 116, 32, 32], 8)
  const mov = await normalizedVideo(new Blob([bytes]))
  expect(extension(mov.type)).toBe('mov')
  await expect(normalizedVideo(new Blob())).rejects.toThrow('空檔')
})
