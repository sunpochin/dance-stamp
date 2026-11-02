/* 檔案用途：只打包明列的公開程式與說明，並驗證每個 bytes。所在層：下載包工具。主要關聯：web-assets.ts、START_HERE.md、releasePackage.test.ts。 */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'
import { publicProblems } from './publicSafety'
import { webFiles, notices, binaryAssetHashes } from './web-assets'

export const packageInputs = [
  ...[...webFiles, ...notices, '_headers'].map(file => `dist/web/${file}`),
  'scripts/serve-web.ts', 'scripts/web-assets.ts', 'START_HERE.md', ...notices,
  'docs/DATA_FORMAT.md', 'docs/RECORD_COMPARE.md', 'docs/ACCEPTANCE.md', 'docs/LICENSING_AND_COST.md', 'docs/RELEASE.md',
  'docs/WEB_USABILITY_CHECK.md', 'docs/agents/acceptance-template.md', 'docs/MEDIA_PROBE.md',
  'docs/evidence/existing-comparison.md', 'docs/evidence/issue-12-backup-recovery.md', 'docs/evidence/issue-13-offline-storage.md',
  // 支援限制指向的匿名證據也隨包，離線讀指南時才不會遇到缺檔連結。
  'docs/evidence/issue-3-safari-feasibility.md', 'docs/evidence/issue-3-safari-current.md', 'docs/evidence/issue-3-bounded-audio.md',
  // 隨包驗證說明已連到更新稽核，離線也須讀到單頁／多頁的實測界線。
  'docs/evidence/issue-13-update-audit.md',
  // 操作說明連到強制中斷證據；裸包離線閱讀時也必須保留該文件，避免斷鏈。
  'docs/evidence/issue-13-forced-install.md',
  // 原生容量拒絕也有獨立版本與限制，須隨指南提供，不能只保留操作連結。
  'docs/evidence/issue-13-native-quota.md',
  // 新救援操作與配額重跑各有來源界線；指南離線閱讀也必須帶上明列的匿名文件。
  'docs/evidence/issue-13-unconfirmed-storage.md', 'docs/evidence/issue-13-native-quota-repeat.md',
  // 私人模式使用提醒須在下載包離線可讀；只加入匿名文件，不收本機原始收據或工具。
  'docs/evidence/issue-13-safari-private-storage.md',
  // 媒體指南也連到各項匿名回歸；只明列實際依賴，不遞迴收集 output 或其他檔案。
  'docs/evidence/issue-11-export-failure.md', 'docs/evidence/issue-8-practice-loop.md',
  // 保存尾段指南新增直接證據連結，裸包離線閱讀也須能核對範圍與限制。
  'docs/evidence/issue-11-vs-save-tail.md',
  // 四線整合指南實際連到這兩份匿名證據；只補離線依賴，不把測試 raw 或工具收進包。
  'docs/evidence/issue-12-import-planning-stop.md', 'docs/evidence/issue-14-storage-keyboard.md',
  'docs/evidence/issue-9-capture-recovery.md', 'docs/evidence/issue-9-comparison-integration.md',
  'docs/evidence/issue-13-cache-failure.md', 'docs/evidence/issue-13-media-size.md',
  'docs/evidence/issue-14-web-accessibility.md', 'docs/evidence/issue-3-media-feasibility.md', 'docs/evidence/issue-3-g3-composition.md',
  'docs/evidence/p0-safari-reliability-integration.md',
  // 新納入的兩份固定來源匿名證據也須離線可讀；只明列文件，不收 raw、profiles 或私人 QA 工具。
  'docs/evidence/issue-3-current-protection-audit.md', 'docs/evidence/issue-12-native-capacity-ui.md',
  // 功能指南的相對證據連結需隨包提供，離線閱讀才不會遺漏支援限制。
  'docs/evidence/issue-17-moves.md', 'docs/evidence/issue-18-sharing.md', 'docs/evidence/issue-19-manual-beats.md',
  // 發行指南連到本輪匿名託管證據，離線包也須能開啟；原始回應仍留本機。
  'docs/evidence/issue-15-hosted-preview.md',
  // 授權隨獨立下載包提供，不依賴開發者的其他 checkout。
  'vendor/agent-work-methods/LICENSE', 'vendor/agent-work-methods/NOTICE.md', 'docs/ai/work-methods-lock.json',
  'vendor/harness/LICENSE', 'vendor/reviewlatch/LICENSE', 'vendor/reviewlatch/NOTICE.md', 'vendor/reviewlatch/manifest.json', 'vendor/mediapipe/LICENSE', 'docs/ai/harness-import.json',
].sort()
const packagePaths = [...packageInputs, 'release.json', 'SHA256SUMS'].sort()
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const samePaths = (actual: Iterable<string>, expected: string[]) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())

// 先拒絕未知路徑才讀檔，避免為掃描而讀入夾帶的私人影片或秘密。
export function readAllowed(root: string, allowed: string[], complete = true): Map<string, Uint8Array> {
  const found = new Map<string, Uint8Array>()
  const walk = (relative: string) => {
    const path = resolve(root, relative), stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error('下載包不接受符號連結')
    if (stat.isFile() && stat.nlink !== 1) throw new Error('下載包不接受硬連結')
    if (stat.isDirectory()) {
      if (relative && !allowed.some(name => name.startsWith(relative + '/'))) throw new Error('下載包包含未核准目錄')
      for (const name of readdirSync(path)) walk(relative ? relative + '/' + name : name)
    } else {
      if (!stat.isFile() || !allowed.includes(relative)) throw new Error('下載包包含未核准檔案')
      found.set(relative, readFileSync(path))
    }
  }
  walk('')
  if (complete && !samePaths(found.keys(), allowed)) throw new Error('下載包缺少必要檔案')
  return found
}

export function sealPackage(payload: Map<string, Uint8Array>, metadata: { version: string; sourceRevision: string; trackedChanges: boolean }) {
  if (!samePaths(payload.keys(), packageInputs) || !/^[a-f0-9]{16}$/.test(metadata.version) || !/^[a-f0-9]{40}$/.test(metadata.sourceRevision)) throw new Error('下載包來源或白名單不完整')
  for (const [name, bytes] of payload) {
    const binary = name.startsWith('dist/web/') ? binaryAssetHashes[name.slice('dist/web/'.length)] : undefined
    // 只允許官方固定 bytes；未知檔案依舊逐字掃描，不能用副檔名繞過公開檢查。
    if (binary) { if (hash(bytes) !== binary) throw new Error('下載包二進位來源指紋不符') }
    else if (publicProblems(name, new TextDecoder('utf-8', { fatal: true }).decode(bytes)).length) throw new Error('下載包未通過公開內容掃描')
  }
  // 直接核對將封裝／校驗的 Markdown bytes；不能以來源檔通過代替 dist/web 副本在新位置仍有目標。
  for (const [name, bytes] of payload) if (name.endsWith('.md')) for (const match of new TextDecoder().decode(bytes).matchAll(/\]\(([^\s)]+)\)/g)) {
    const link = match[1].split('#')[0]
    if (!link || /^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('//')) continue
    if (!packagePaths.includes(posix.normalize(posix.join(posix.dirname(name), link)))) throw new Error(`下載包文件連結缺少目標：${name} → ${link}`)
  }
  // 固定字元順序，不依檔案系統列舉或作業系統語系，讓另一台電腦也可校驗。
  const ordered = new Map(packageInputs.map(name => [name, payload.get(name)!]))
  const files = Object.fromEntries([...ordered].map(([name, bytes]) => [name, hash(bytes)]))
  const result = new Map(ordered)
  result.set('release.json', new TextEncoder().encode(JSON.stringify({ formatVersion: 1, ...metadata, files }, null, 2) + '\n'))
  result.set('SHA256SUMS', new TextEncoder().encode([...result].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, bytes]) => `${hash(bytes)}  ${name}\n`).join('')))
  return result
}

export function verifyPackage(files: Map<string, Uint8Array>) {
  if (!samePaths(files.keys(), packagePaths)) throw new Error('下載包白名單不符')
  const release = JSON.parse(new TextDecoder().decode(files.get('release.json')))
  if (release.formatVersion !== 1 || typeof release.trackedChanges !== 'boolean') throw new Error('未知下載包格式')
  const expected = sealPackage(new Map(packageInputs.map(name => [name, files.get(name)!])), { version: release.version, sourceRevision: release.sourceRevision, trackedChanges: release.trackedChanges })
  // manifest 和原生 checksum 都核對；不能讓「清單列了這個檔」冒充內容正確。
  for (const [name, bytes] of expected) if (hash(files.get(name)!) !== hash(bytes)) throw new Error('下載包內容校驗失敗')
  return release
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..')
  if (process.argv[2] === '--check') {
    const release = verifyPackage(readAllowed(resolve(process.argv[3] || 'dist/package'), packagePaths))
    console.log(`下載包校驗通過：${release.version}，${packagePaths.length} 檔；非發布或真機驗收。`)
  } else {
    if (lstatSync(resolve(root, 'dist')).isSymbolicLink()) throw new Error('下載包來源不接受符號連結')
    // Bun.write 會沿連結覆寫另一端；兩個外層輸出都須先查完，才可改動既有下載包。
    for (const name of ['dance-stamp-web.tar.gz', 'dance-stamp-web.tar.gz.sha256']) {
      const stat = lstatSync(resolve(root, 'dist', name), { throwIfNoEntry: false })
      if (stat && (!stat.isFile() || stat.nlink !== 1)) throw new Error('下載包輸出必須是獨立的一般檔案')
    }
    readAllowed(resolve(root, 'dist/web'), [...webFiles, ...notices, '_headers'])
    const payload = new Map<string, Uint8Array>()
    for (const name of packageInputs) {
      // 每層都拒絕連結，避免白名單檔案透過父目錄繞去私人位置。
      let path = root
      for (const part of name.split('/')) { path = resolve(path, part); if (lstatSync(path).isSymbolicLink()) throw new Error('下載包來源不接受符號連結') }
      if (!lstatSync(path).isFile() || lstatSync(path).nlink !== 1) throw new Error('下載包來源必須是獨立的一般檔案')
      payload.set(name, readFileSync(path))
    }
    const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }), status = Bun.spawnSync(['git', 'status', '--porcelain', '--untracked-files=no'], { cwd: root })
    if (revision.exitCode || status.exitCode) throw new Error('無法確認來源版本')
    const version = new TextDecoder().decode(payload.get('dist/web/sw.js')).match(/const version = '([a-f0-9]{16})'/)?.[1] || ''
    const files = sealPackage(payload, { version, sourceRevision: revision.stdout.toString().trim(), trackedChanges: !!status.stdout.toString().trim() })
    const target = resolve(root, 'dist/package')
    if (existsSync(target)) readAllowed(target, packagePaths, false)
    for (const [name, bytes] of files) { const path = resolve(target, name); mkdirSync(dirname(path), { recursive: true }); await Bun.write(path, bytes) }
    verifyPackage(readAllowed(target, packagePaths))
    // 只從已驗證的 bytes 建 archive，不遞迴打包 repo／output 或依賴目錄。
    const archive = await new Bun.Archive(Object.fromEntries(files), { compress: 'gzip' }).bytes()
    const roundtrip = new Map(await Promise.all([...await new Bun.Archive(archive).files()].map(async ([name, file]) => [name, await file.bytes()] as const)))
    verifyPackage(roundtrip)
    await Bun.write(resolve(root, 'dist/dance-stamp-web.tar.gz'), archive)
    await Bun.write(resolve(root, 'dist/dance-stamp-web.tar.gz.sha256'), `${hash(archive)}  dance-stamp-web.tar.gz\n`)
    console.log(`下載包完成：dist/dance-stamp-web.tar.gz，${archive.length} bytes，版本 ${version}；未發布。`)
  }
}
