/* 檔案用途：驗證下載包拒絕夾帶、損壞、缺檔與連結，不靠檔名副檔名猜安全。所在層：發布邊界回歸。主要關聯：package-web.ts。 */
import { expect, test } from 'bun:test'
import { linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { packageInputs, readAllowed, sealPackage, verifyPackage } from '../../scripts/package-web'

test('隨包指南、證據與授權來源文件的相對連結都必須有目標', () => {
  let references = 0
  const packaged = [...packageInputs, 'release.json', 'SHA256SUMS']
  // 不只證據檔；完整來源庫的文件／程式不在裸包內，不能讓相對連結冒充可離線閱讀。
  // check 在 build 前執行，須讀來源文件；dist 的純文字 notice 副本由同一根文件產生。
  const guides = packageInputs.filter(name => name.endsWith('.md') && !name.startsWith('dist/'))
  for (const guide of guides) {
    const source = readFileSync(resolve(import.meta.dir, '../..', guide), 'utf8')
    for (const match of source.matchAll(/\]\(([^\s)]+)\)/g)) {
      const link = match[1].split('#')[0]
      if (!link || /^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('//')) continue
      const target = posix.normalize(posix.join(posix.dirname(guide), link))
      references++; expect(packaged, `${guide} → ${link}`).toContain(target)
    }
  }
  expect(references).toBeGreaterThan(0)
})

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

test('真正打包 CLI 在寫入前拒絕 archive 與 checksum 的連結／目錄，保留兩端及既有包', () => {
  const root = mkdtempSync(join(tmpdir(), 'dance-package-output-'))
  const run = () => Bun.spawnSync([process.execPath, '--no-env-file', join(root, 'scripts/package-web.ts')], { cwd: root })
  try {
    for (const name of packageInputs) {
      const path = join(root, name)
      mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'synthetic public')
    }
    for (const file of ['package-web.ts', 'web-assets.ts', 'publicSafety.ts', 'stagedSafety.ts']) {
      writeFileSync(join(root, 'scripts', file), readFileSync(resolve(import.meta.dir, '../../scripts', file)))
    }
    writeFileSync(join(root, 'dist/web/sw.js'), `const version = '${'a'.repeat(16)}'`)
    expect(Bun.spawnSync(['git', 'init', '--quiet', root]).exitCode).toBe(0)
    expect(Bun.spawnSync(['git', '-C', root, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.com', 'commit', '--allow-empty', '--no-gpg-sign', '-m', 'synthetic']).exitCode).toBe(0)
    const archive = join(root, 'dist/dance-stamp-web.tar.gz'), checksum = archive + '.sha256'
    const sentinel = join(root, 'sentinel.txt')
    // 用完整 CLI 保證兩個輸出都先查完；不能寫壞 archive 後才發現 checksum 是連結。
    for (const output of [archive, checksum]) for (const kind of ['symlink', 'dangling', 'hardlink', 'directory']) {
      writeFileSync(archive, 'previous archive'); writeFileSync(checksum, 'previous checksum')
      writeFileSync(sentinel, 'synthetic sentinel'); rmSync(output)
      if (kind === 'symlink') symlinkSync(sentinel, output)
      if (kind === 'dangling') symlinkSync(join(root, 'missing.txt'), output)
      if (kind === 'hardlink') linkSync(sentinel, output)
      if (kind === 'directory') mkdirSync(output)
      const result = run()
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain('下載包輸出')
      expect(readFileSync(sentinel, 'utf8')).toBe('synthetic sentinel')
      expect(readFileSync(output === archive ? checksum : archive, 'utf8')).toBe(output === archive ? 'previous checksum' : 'previous archive')
      rmSync(output, { recursive: true })
    }
    writeFileSync(checksum, 'previous checksum')
    expect(run().exitCode).toBe(0)
    expect(verifyPackage(readAllowed(join(root, 'dist/package'), [...packageInputs, 'release.json', 'SHA256SUMS'])).trackedChanges).toBe(false)
  } finally { rmSync(root, { recursive: true }) }
})
