/*
檔案用途：檢查啟用入口、來源指紋與文件連結，不執行上游參考程式。
所在層：本機與 CI 共用品質入口。
主要關聯：docs/ai/harness-import.json、package.json、tests/unit/harness.test.ts。
*/
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const errors: string[] = []
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const check = (ok: boolean, message: string) => { if (!ok) errors.push(message) }

// --isolate 的語意取決於 runtime；先擋版本差異，避免測試互相污染卻誤判產品壞掉。
check(Bun.version === read('.bun-version').trim(), `請使用 Bun ${read('.bun-version').trim()}，目前 ${Bun.version}`)
// 完整來源索引也只留本機；公開 manifest 只列實際採用的通用工具。
const manifest = JSON.parse(read(process.argv.includes('--include-local-reference')
  ? 'vendor/jia-jian-log-harness/source-manifest.local.json'
  : 'docs/ai/harness-import.json'))
let checked = 0
for (const file of manifest.files) {
  // 公開 clone 不帶舊照護文件；只有明確要求才驗證本機完整副本。
  if (file.distribution === 'local-only' && !process.argv.includes('--include-local-reference')) continue
  checked += 1
  const path = resolve(root, file.destination)
  check(path.startsWith(`${root}/`), `非法匯入路徑：${file.destination}`)
  if (!path.startsWith(`${root}/`)) continue
  if (!existsSync(path)) { errors.push(`缺少匯入檔：${file.destination}`); continue }
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
  check(digest === file.sha256, `來源副本已改變，請記錄適配與指紋：${file.destination}`)
}

for (const path of ['CLAUDE.md', 'CODEX.md', 'GEMINI.md', '.cursor/rules/project.mdc', '.github/copilot-instructions.md']) {
  const content = read(path)
  check(content.includes('AGENTS.md'), `缺少規則入口：${path}`)
  check(content.split('\n').length <= 40, `轉接器過厚：${path}`)
}
for (const skill of readdirSync(resolve(root, 'skills'))) {
  for (const prefix of ['.agents/skills', '.codex/skills']) {
    check(read(`${prefix}/${skill}/SKILL.md`) === read(`skills/${skill}/SKILL.md`), `skill 入口漂移：${prefix}/${skill}`)
  }
}

// 只驗證本產品人工維護的文件；來源副本保留歷史產品連結，不當成目前的操作承諾。
function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name)
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith('.md') ? [path] : []
  })
}
for (const path of [resolve(root, 'AGENTS.md'), resolve(root, 'README.md'), resolve(root, 'TECHNICAL.md'), ...markdownFiles(resolve(root, 'docs')), ...markdownFiles(resolve(root, 'skills'))]) {
  const content = readFileSync(path, 'utf8')
  for (const match of content.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const link = match[1].split('#')[0]
    if (!link || /^[a-z][a-z\d+.-]*:/i.test(link)) continue
    check(existsSync(resolve(dirname(path), decodeURIComponent(link))), `失效文件連結：${path.slice(root.length + 1)} → ${link}`)
  }
}
const workflow = Bun.YAML.parse(read('docs/ai/workflows/harness-ci.yml')) as { permissions: Record<string, string> }
check(workflow.permissions?.contents === 'read' && Object.keys(workflow.permissions).length === 1, 'CI 只能讀取內容')
check(!read('docs/ai/workflows/harness-ci.yml').includes('secrets.'), 'Harness CI 不需要秘密')
for (const path of ['.claude/settings.json', '.codex/hooks.json']) {
  const config = JSON.parse(read(path)) as { hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> } }
  const commands = config.hooks.PreToolUse.flatMap(group => group.hooks.map(hook => hook.command))
  check(commands.length === 1 && commands[0].includes('destructive-guard.sh'), `只啟用已驗證的防護：${path}`)
  check(!JSON.stringify(config).includes('vendor/'), `不可執行來源副本：${path}`)
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else console.log(`Harness 檢查通過：${checked} 個檔案指紋、入口與本地文件連結。產品／真機未驗證。`)
