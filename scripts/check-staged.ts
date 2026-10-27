/* 檔案用途：核對真正將提交的內容。所在層：Git pre-commit。主要關聯：stagedSafety.ts、.githooks/pre-commit。 */
import { containsSecret, protectedPath } from './stagedSafety'
function git(args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode) throw new Error(`Git 檢查失敗：${args[0]}`)
  return result.stdout.toString()
}
const branch = git(['branch', '--show-current']).trim()
if (!branch || ['main', 'staging'].includes(branch)) throw new Error('請在任務分支提交，不能提交到 main/staging 或 detached HEAD')
const paths = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean)
for (const path of paths) {
  if (protectedPath(path)) throw new Error(`受保護檔案不可提交：${path}`)
  const blob = git(['show', `:${path}`])
  if (containsSecret(blob)) throw new Error(`疑似憑證不可提交：${path}`)
}
// 品質檢查讀工作檔，Git 提交讀 index；兩者不同會讓未測過的內容通過，所以拒絕部分暫存。
const unstaged = git(['diff', '--name-only', '-z']).split('\0').filter(Boolean)
if (unstaged.length) throw new Error('請完整暫存本任務變更再提交，確保檢查內容等於提交內容')
console.log(`提交內容檢查通過：${paths.length} 個新增／修改檔案。`)
