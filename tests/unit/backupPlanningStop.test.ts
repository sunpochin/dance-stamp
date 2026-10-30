/* 檔案用途：在真正 hash 已進行但尚未回傳規劃時取消，保留完整舊圖並同檔重試。所在層：純資料回歸。主要關聯：library.js、backup-planning-stop.ts。 */
import { expect, test } from 'bun:test'
import { planningLibrary, planningSource } from '../fixtures/backup-planning.js'
import { parseBackup, planBackupImport, tables, validateBackup } from '../../web/library.js'

for (const kind of ['foreign', 'share', 'conflict']) test(`${kind} 大檔在 ID／副本 hash 途中取消，不回傳半份規劃且原檔可重試`, async () => {
  const local = planningLibrary(), file = JSON.stringify(planningSource(local, kind)), source = parseBackup(file)
  expect(new Blob([file]).size).toBeLessThan(10 * 1024 * 1024)
  expect(new Blob([file]).size).toBeGreaterThan(3 * 1024 * 1024)
  const localBefore = structuredClone(local), sourceBefore = structuredClone(source), controller = new AbortController()
  const originalDigest = crypto.subtle.digest, nativeDigest = originalDigest.bind(crypto.subtle), descriptors: unknown[][] = [], stopAt = kind === 'conflict' ? 4 : 2
  let completed = 0, held = false, settled = false, reached!: () => void, release!: () => void
  const barrier = new Promise<void>(resolve => { reached = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  // 先完成真 hash，再暫扣結果；衝突案先配置一份副本，不能用預先取消冒稱規劃途中。
  crypto.subtle.digest = async (algorithm, bytes) => {
    const descriptor = JSON.parse(new TextDecoder().decode(bytes as ArrayBuffer)); descriptors.push(descriptor)
    const value = await nativeDigest(algorithm, bytes); completed++
    if (completed === stopAt) { held = true; reached(); await gate }
    return value
  }
  const pending = planBackupImport(local, source, controller.signal)
  pending.then(() => { settled = true }, () => { settled = true })
  // 規劃若提前回傳或拒絕，直接失敗；避免缺少關卡時一直等待。
  try {
    await Promise.race([barrier, pending.then(() => { throw new Error('未到 hash 關卡便回傳') })])
    expect(completed).toBe(stopAt); expect(held).toBe(true); expect(settled).toBe(false); expect(controller.signal.aborted).toBe(false)
    expect(descriptors[0][0]).toBe(kind === 'conflict' ? 'dance-stamp-origin-v1' : kind === 'share' ? 'dance-stamp-share-v1' : 'dance-stamp-import-v1')
    if (kind === 'conflict') expect(descriptors.map(d => d[0])).toEqual(['dance-stamp-origin-v1', 'dance-stamp-copy-v1', 'dance-stamp-origin-v1', 'dance-stamp-copy-v1'])
    controller.abort(); release()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(completed).toBe(stopAt)
  } finally { release(); await pending.catch(() => {}); crypto.subtle.digest = originalDigest }
  expect(local).toEqual(localBefore); expect(source).toEqual(sourceBefore)
  expect(JSON.stringify(source)).toBe(file)
  const retry = await planBackupImport(local, parseBackup(file))
  expect(retry.added).toBeGreaterThan(0)
  for (const table of tables) expect(retry.data[table].slice(0, local[table].length)).toEqual(localBefore[table])
  // Validator 重新核對全部外鍵；逐表舊前綴比對同時保護筆記、動作、take、配方、輸出及媒體描述。
  expect(() => validateBackup(retry.data)).not.toThrow()
  for (const take of retry.data.takes.slice(local.takes.length)) {
    expect(retry.data.recipes.filter(recipe => recipe.takeId === take.id)).toHaveLength(1)
    const recipe = retry.data.recipes.find(recipe => recipe.takeId === take.id)!
    expect(retry.data.exports.some(output => output.recipeId === recipe.id)).toBe(true)
  }
  const repeated = await planBackupImport(retry.data, parseBackup(file))
  expect(repeated.added).toBe(0); expect(repeated.data).toEqual(retry.data)
  expect(local).toEqual(localBefore); expect(source).toEqual(sourceBefore)
}, 30_000)
