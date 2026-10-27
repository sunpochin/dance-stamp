/*
檔案用途：破壞性指令閘門的 hook 入口（#1214）——從 stdin 讀 Claude Code／Codex 的 PreToolUse JSON，交給 scripts/destructiveGuard.ts 判斷，
再依 Agent 輸出各自支援的格式：
- deny：exit 2，原因寫到 stderr（兩邊都支援）。
- ask：Claude 輸出 hookSpecificOutput.permissionDecision = "ask"（exit 0），叫出權限提示；
  Codex 的 PreToolUse 不支援 ask（官方文件：會把 hook 標成失敗、照樣執行 tool call），所以退成 deny。
所在層：scripts；只由 .claude/hooks、.codex/hooks 的 destructive-guard.sh 呼叫（--agent claude|codex），不直接給人用。
主要關聯：scripts/destructiveGuard.ts、tests/unit/destructiveGuard.test.ts、docs/agents/local-tools.md「破壞性指令閘門」、issue #1214。
*/
import { destructiveDecision } from './destructiveGuard'

const agentIndex = process.argv.indexOf('--agent')
const agent = agentIndex >= 0 ? process.argv[agentIndex + 1] : undefined
if (agent !== 'claude' && agent !== 'codex') {
  console.error('BLOCKED: the destructive-command guard was called without --agent claude|codex.')
  process.exit(2)
}

let input: { tool_input?: { command?: unknown } }
try {
  input = JSON.parse(await Bun.stdin.text())
} catch (error) {
  console.error(`BLOCKED: the destructive-command guard could not parse the hook input: ${error instanceof Error ? error.message : error}`)
  process.exit(2)
}
const command = input?.tool_input?.command
if (typeof command !== 'string') process.exit(0)

const verdict = destructiveDecision(command)
if (verdict.decision === 'allow') process.exit(0)
if (verdict.decision === 'ask' && agent === 'claude') {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `Destructive-command guard (#1214): ${verdict.reason}. Approve only if you meant this.`,
    },
  }))
  process.exit(0)
}
if (verdict.decision === 'ask') {
  console.error(`BLOCKED: ${verdict.reason}. This needs the user's explicit consent, and Codex hooks cannot show a permission prompt: ask the user, and let them run it themselves.`)
} else {
  console.error(`BLOCKED: ${verdict.reason}`)
}
process.exit(2)
