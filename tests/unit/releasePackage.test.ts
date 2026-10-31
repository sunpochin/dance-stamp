/* 檔案用途：驗證下載包拒絕夾帶、損壞、缺檔與連結，不靠檔名副檔名猜安全。所在層：發布邊界回歸。主要關聯：package-web.ts。 */
import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { packageInputs, readAllowed, sealPackage, verifyPackage } from '../../scripts/package-web'
import { webNotice, binaryAssetHashes, visionAssets } from '../../scripts/web-assets'

function publicPayload() {
  // 封裝邊界必須走真正的固定二進位，不能用任意文字假裝模型或 WASM。
  return new Map(packageInputs.map(name => [name, binaryAssetHashes[name.slice('dist/web/'.length)] && name.startsWith('dist/web/') ? readFileSync(resolve(import.meta.dir, '../..', visionAssets[name.slice('dist/web/'.length)])) : new TextEncoder().encode('synthetic-public-text')]))
}

function fixtureGitEnv(environment = process.env) {
  // hook 匯出的 GIT_DIR／index 會蓋過 -C；只清 Git 定義的本機變數，避免測試改到外層倉庫。
  const local = Bun.spawnSync(['git', 'rev-parse', '--local-env-vars'])
  expect(local.exitCode).toBe(0)
  const names = new Set(local.stdout.toString().trim().split('\n'))
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !names.has(name)))
}

test('封裝檢查須拒絕產物中的授權副本斷鏈，不能只核對來源 Markdown', () => {
  const payload = publicPayload()
  // 這是實際建置副本的原內容；根目錄可用的連結搬到 dist/web 後五處都失去目標。
  payload.set('dist/web/THIRD_PARTY_NOTICES.md', readFileSync(new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url)))
  expect(() => { sealPackage(payload, { version: 'a'.repeat(16), sourceRevision: 'b'.repeat(40), trackedChanges: false }) }).toThrow('文件連結')
})

test('真正建置的授權副本與離線 manifest 使用相同 bytes', () => {
  const root = resolve(import.meta.dir, '../..'), notice = 'THIRD_PARTY_NOTICES.md'
  const source = readFileSync(join(root, notice), 'utf8')
  // 直接跑原建置入口，才會抓到寫入已轉換副本、manifest 卻仍 hash 根文件的漂移。
  const result = Bun.spawnSync([process.execPath, '--no-env-file', join(root, 'scripts/build-web.ts')], { cwd: root })
  expect(result.exitCode).toBe(0)
  const built = readFileSync(join(root, 'dist/web', notice))
  expect(built.toString()).toBe(webNotice(notice, source))
  expect(built.toString()).toContain('](../../vendor/')
  const manifest = JSON.parse(readFileSync(join(root, 'dist/web/sw.js'), 'utf8').match(/const manifest = (\{[^\n]+\});/)![1])
  expect(manifest['/' + notice]).toBe(createHash('sha256').update(built).digest('hex'))
  expect(readFileSync(join(root, notice), 'utf8')).toBe(source)
})

test('隨包指南、證據與授權副本的實際封裝內容，所有相對連結都必須有目標', async () => {
  let references = 0
  const packaged = [...packageInputs, 'release.json', 'SHA256SUMS']
  const payload = publicPayload()
  const guides = packageInputs.filter(name => name.endsWith('.md'))
  for (const guide of guides) {
    const source = guide.startsWith('dist/web/') ? webNotice(posix.basename(guide), readFileSync(resolve(import.meta.dir, '../..', posix.basename(guide)), 'utf8')) : readFileSync(resolve(import.meta.dir, '../..', guide), 'utf8')
    payload.set(guide, new TextEncoder().encode(source))
    for (const match of source.matchAll(/\]\(([^\s)]+)\)/g)) {
      const link = match[1].split('#')[0]
      if (!link || /^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('//')) continue
      const target = posix.normalize(posix.join(posix.dirname(guide), link))
      references++; expect(packaged, `${guide} → ${link}`).toContain(target)
    }
  }
  expect(references).toBeGreaterThan(0)
  // 透過真正 archive 往返再走 checker，確保它檢查產物 bytes，不會偷偷讀回 repo 內的正常文件。
  const files = sealPackage(payload, { version: 'a'.repeat(16), sourceRevision: 'b'.repeat(40), trackedChanges: false })
  const archive = await new Bun.Archive(Object.fromEntries(files), { compress: 'gzip' }).bytes()
  const restored = new Map(await Promise.all([...await new Bun.Archive(archive).files()].map(async ([name, file]) => [name, await file.bytes()] as const)))
  expect(verifyPackage(restored).sourceRevision).toBe('b'.repeat(40))
})

test('完整公開包可 roundtrip；夾帶、缺片、竄改和失真 metadata 均拒絕', async () => {
  const payload = publicPayload()
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
  const badModel = publicPayload(); badModel.set('dist/web/person-model.tflite', new Uint8Array([0, 255, 1]))
  expect(() => sealPackage(badModel, { version: 'a'.repeat(16), sourceRevision: 'b'.repeat(40), trackedChanges: false })).toThrow('二進位來源指紋')
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
  const fixture = mkdtempSync(join(tmpdir(), 'dance-package-output-')), root = join(fixture, 'candidate'), outer = join(fixture, 'caller')
  mkdirSync(root); mkdirSync(outer)
  const clean = fixtureGitEnv()
  expect(Bun.spawnSync(['git', 'init', '--quiet', outer], { env: clean }).exitCode).toBe(0)
  writeFileSync(join(outer, 'sentinel.txt'), 'synthetic staged work')
  expect(Bun.spawnSync(['git', '-C', outer, 'add', 'sentinel.txt'], { env: clean }).exitCode).toBe(0)
  const gitdir = join(outer, '.git'), config = readFileSync(join(gitdir, 'config')), index = readFileSync(join(gitdir, 'index'))
  // 用自己的外層 config／暫存檔重現 hook，不把開發者的真正 Git 資料當負向測試材料。
  const env = fixtureGitEnv({ ...clean, GIT_DIR: gitdir, GIT_COMMON_DIR: gitdir, GIT_WORK_TREE: outer, GIT_INDEX_FILE: join(gitdir, 'index'), GIT_PREFIX: 'synthetic/' })
  const run = () => Bun.spawnSync([process.execPath, '--no-env-file', join(root, 'scripts/package-web.ts')], { cwd: root, env })
  try {
    for (const [name, bytes] of publicPayload()) {
      const path = join(root, name)
      mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes)
    }
    for (const file of ['package-web.ts', 'web-assets.ts', 'publicSafety.ts', 'stagedSafety.ts']) {
      writeFileSync(join(root, 'scripts', file), readFileSync(resolve(import.meta.dir, '../../scripts', file)))
    }
    writeFileSync(join(root, 'dist/web/sw.js'), `const version = '${'a'.repeat(16)}'`)
    expect(Bun.spawnSync(['git', 'init', '--quiet', root], { env }).exitCode).toBe(0)
    expect(Bun.spawnSync(['git', '-C', root, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.com', 'commit', '--allow-empty', '--no-gpg-sign', '-m', 'synthetic'], { env }).exitCode).toBe(0)
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
    expect(readFileSync(join(gitdir, 'config'))).toEqual(config)
    expect(readFileSync(join(gitdir, 'index'))).toEqual(index)
  } finally { rmSync(fixture, { recursive: true }) }
})
