#!/bin/bash
# 檔案用途：破壞性指令閘門（#1214）——AGENTS.md § 3.1 的清單與遠端 Supabase／Vercel production 指令由 hook 機械執行。
#           遠端寫入、production 發布、force push 直接擋（deny）；rm -rf、git reset --hard、git clean -f、drop／truncate、
#           覆寫 .env* 叫出權限提示（ask，Codex 不支援 ask 所以也是擋）。判斷在 scripts/destructiveGuard.ts，這裡只負責呼叫與 fail closed。
# 所在層：.claude/hooks 與 .codex/hooks 各一份、內容一字不差（tests/unit/destructiveGuard.test.ts 會比對），分別登記在
#         .claude/settings.json 與 .codex/hooks.json 的 PreToolUse，攔截 Bash 工具送出的指令；由所在目錄判斷是哪個 Agent。
# 主要關聯：scripts/destructive-guard.ts、scripts/destructiveGuard.ts、AGENTS.md § 3.1、docs/agents/local-tools.md「破壞性指令閘門」。
#
# Hook contract: read the tool call as JSON on stdin; exit 0 to allow (Claude: optional JSON on stdout asks for a permission prompt),
# exit 2 + stderr message to block.

input=$(cat)
hook_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
guard="$(cd "$hook_dir/../.." && pwd)/scripts/destructive-guard.ts"
case "$hook_dir" in
  */.codex/hooks) agent=codex ;;
  *) agent=claude ;;
esac

if command -v bun >/dev/null 2>&1 && [ -f "$guard" ]; then
  printf '%s' "$input" | bun "$guard" --agent "$agent"
  status=$?
  # 0＝放行或已輸出 ask、2＝擋下（原因已寫到 stderr）。其他 exit code 是 guard 自己壞掉，交給下面的保守比對。
  if [ "$status" -eq 0 ] || [ "$status" -eq 2 ]; then
    exit "$status"
  fi
  echo "destructive-command guard exited with $status; falling back to a conservative text check." >&2
fi

# 沒有 bun、guard 檔不在或 guard 崩潰：看不懂就只擋像是遠端／production／force push 的指令，像是 § 3.1 本機破壞性操作的
# 交給使用者決定（Claude 叫出提示、Codex 擋下），其餘放行，不讓整個 Agent 卡死。去掉引號與反斜線，拆字也比得到。
flat=$(printf '%s' "$input" | tr -d "\"'\\\\")
# 遠端類要涵蓋 TypeScript 判斷裡每一個 deny 群組（#1220 Codex review 第 2 輪），退化時寧可多擋。
if printf '%s' "$flat" | grep -qE 'supabase(@[0-9.]+)? +(link|db +(push|pull|dump|query)|secrets +(set|unset)|functions +(deploy|delete)|migration +(repair|squash)|config +push|storage +(cp|mv|rm)|branches +[a-z]|projects +(create|delete|api-keys)|backups|postgres-config|domains|vanity-subdomains|ssl-enforcement|network-(restrictions|bans)|sso|encryption|orgs +create)|(^|[^a-z])(vercel|vc) [^|;&]*(--prod|production|promote|rollback|rolling-release|redirects|redeploy|remove|alias +set|env +(add|rm|remove|update))|(psql|pg_dump|pg_restore|dropdb)[^|;&]*(supabase\.(co|com)|pooler\.)|git[^|;&]*push[^|;&]*( -f| --force( |$)| \+)'; then
  echo "BLOCKED: the destructive-command guard is unavailable, and this looks like a remote Supabase, Vercel production or forced git push command. Ask the user to run it and to fix the guard." >&2
  exit 2
fi
if printf '%s' "$flat" | grep -qiE '(^|[^a-z])rm( +-[^ ]*)* +(-[a-z]*r|--recursive)|git[^|;&]*(reset[^|;&]*--ha|clean[^|;&]* (-[a-z]*f|--f)|requireforce=(false|no|off|0))|drop +(table|schema|database)|truncate +table|> *[^ ]*\.env|(^|[^a-z])(dropdb|unlink [^|;&]*\.env)|pg_restore[^|;&]* (--clean|-c)'; then
  reason="the destructive-command guard is unavailable, and this looks like an AGENTS.md § 3.1 destructive command (rm -r, git reset --hard, git clean -f, drop/truncate, a .env write)"
  if [ "$agent" = claude ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s"}}\n' "$reason"
    exit 0
  fi
  echo "BLOCKED: $reason. Ask the user to run it." >&2
  exit 2
fi
exit 0
