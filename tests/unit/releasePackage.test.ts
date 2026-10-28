/* 檔案用途：驗證下載包拒絕夾帶、損壞、缺檔與連結，不靠檔名副檔名猜安全。所在層：發布邊界回歸。主要關聯：package-web.ts。 */
import { expect, test } from 'bun:test'
import { linkSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { packageInputs, readAllowed, sealPackage, verifyPackage } from '../../scripts/package-web'

test('完整公開包可 roundtrip；夾帶、缺片、竄改和失真 metadata 均拒絕', async () => {
  const payload = new Map(packageInputs.map(name => [name, new TextEncoder().encode('synthetic-public-text')]))
  const files = sealPackage(payload, { version: 'a'.repeat(16), sourceRevision: 'b'.repeat(40), trackedChanges: false })
  const reordered = sealPackage(new Map([...payload].reverse()), { version: 'a'.repeat(16), sourceRevision: 'b'.repeat(40), trackedChanges: false })
  expect(reordered.get('SHA256SUMS')).toEqual(files.get('SHA256SUMS'))
  const archive = new Bun.Archive(Object.fromEntries(files), { compress: 'gzip' })
  const restored = new Map(await Promise.all([...await new Bun.Archive(await archive.bytes()).files()].map(async ([name, file]) => [name, await file.bytes()] as const)))
  expect(verifyPackage(restored).sourceRevision).toBe('b'.repeat(40))
  for (const change of ['extra', 'missing', 'tampered', 'metadata']) {
    const broken = new Map(restored)
    if (change === 'extra') broken.set('synthetic-private.mp4', new Uint8Array([1, 2]))
    if (change === 'missing') broken.delete('LICENSE')
    if (change === 'tampered') broken.set('dist/web/main.js', new TextEncoder().encode('changed'))
    if (change === 'metadata') broken.set('release.json', new TextEncoder().encode('{"formatVersion":2}'))
    expect(() => verifyPackage(broken)).toThrow()
  }
  payload.set('START_HERE.md', new TextEncoder().encode(['synthetic-private', 'invalid.test'].join('@')))
  expect(() => sealPackage(payload, { version: 'a'.repeat(16), sourceRevision: 'b'.repeat(40), trackedChanges: false })).toThrow('公開內容')
})

test('檔案樹先拒絕夾帶檔／目錄與 symlink；缺少必要內容也失敗', () => {
  const root = mkdtempSync(join(tmpdir(), 'dance-package-'))
  try {
    writeFileSync(join(root, 'known.txt'), 'synthetic public')
    expect(readAllowed(root, ['known.txt']).size).toBe(1)
    expect(() => readAllowed(root, ['known.txt', 'missing.txt'])).toThrow('缺少')
    writeFileSync(join(root, 'unexpected.json'), '{}')
    expect(() => readAllowed(root, ['known.txt'])).toThrow('未核准')
    rmSync(join(root, 'unexpected.json'))
    symlinkSync(join(root, 'known.txt'), join(root, 'link.txt'))
    expect(() => readAllowed(root, ['known.txt', 'link.txt'])).toThrow('符號連結')
    rmSync(join(root, 'link.txt'))
    linkSync(join(root, 'known.txt'), join(root, 'hard.txt'))
    expect(() => readAllowed(root, ['known.txt', 'hard.txt'])).toThrow('硬連結')
    rmSync(join(root, 'hard.txt')); mkdirSync(join(root, 'unknown'))
    expect(() => readAllowed(root, ['known.txt'])).toThrow('目錄')
  } finally { rmSync(root, { recursive: true }) }
})
