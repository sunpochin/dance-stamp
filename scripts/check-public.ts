/* 檔案用途：檢查即將公開的已追蹤檔案，不讀本機參考與私人媒體。所在層：品質入口。主要關聯：publicSafety.ts、AGENTS.md。 */
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { publicProblems } from './publicSafety'

const root = resolve(import.meta.dir, '..')
const result = Bun.spawnSync(['git', 'ls-files', '-z'], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
if (result.exitCode) throw new Error('無法取得公開檔案清單，拒絕當成通過')
const paths = result.stdout.toString().split('\0').filter(Boolean)
const problems: string[] = []
for (const path of paths) {
  const absolute = resolve(root, path)
  if (lstatSync(absolute).isSymbolicLink()) {
    // 公開 skill 只可連到同一 repo 的 canonical skills，不可偷連到使用者家目錄。
    const target = resolve(dirname(absolute), readlinkSync(absolute))
    if (!target.startsWith(`${root}/skills/`)) problems.push(`${path}: unsafe-symlink`)
    continue
  }
  for (const problem of publicProblems(path, readFileSync(absolute, 'utf8'))) problems.push(`${path}: ${problem}`)
}
if (problems.length) {
  // 不印出命中字串；錯誤訊息本身也不能成為外洩管道。
  console.error(problems.join('\n'))
  process.exitCode = 1
} else console.log(`公開內容檢查通過：${paths.length} 個已追蹤檔案。模式檢查仍需人工審查。`)
