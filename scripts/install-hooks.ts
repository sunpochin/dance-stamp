/* 檔案用途：只替目前 clone 安裝 Git 防護。所在層：開發工具。主要關聯：.githooks、docs/ai/HARNESS.md。 */
const current = Bun.spawnSync(['git', 'config', '--get', 'core.hooksPath'], { stdout: 'pipe', stderr: 'pipe' })
if (![0, 1].includes(current.exitCode)) throw new Error('無法讀取既有 hooksPath，未修改設定')
const path = current.stdout.toString().trim()
// 既有 hooks 可能來自使用者全域設定；不能默默覆蓋它，讓原本的保護消失。
if (path && path !== '.githooks') throw new Error(`已有 hooksPath：${path}。請先整合既有 hooks。`)
const result = Bun.spawnSync(['git', 'config', '--local', 'core.hooksPath', '.githooks'], { stdout: 'inherit', stderr: 'inherit' })
process.exitCode = result.exitCode
if (!result.exitCode) console.log('已啟用此 clone 的 pre-commit／pre-push；沒有改動全域設定。')
