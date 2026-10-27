/*
檔案用途：合併前 hook 的判斷——Agent 唯一能合併 PR 的方式是 `bun run pr:merge <N>`；其他合併寫法（gh pr merge、auto-merge、
REST／GraphQL／curl 合併）、直接 push 到 staging／main、偽造 codex-review/current、碰 codex-review-waived label 一律擋下。
所在層：scripts；純函式（git 查詢由呼叫端注入），由 scripts/merge-guard.ts（hook 的 CLI 入口）與 tests/unit/mergeGuard.test.ts 共用；
scripts/destructiveGuard.ts（#1214）透過 scanShell 等匯出共用同一套 shell 解析。
主要關聯：scripts/shellWords.ts（把指令切成字詞）、scripts/pr-merge.ts（唯一合法的合併路徑）、scripts/codexReviewGate.ts（常數）、
.claude/hooks／.codex/hooks 的 require-codex-review-before-merge.sh、docs/agents/review-governance.md「Codex 重審閘門」、issue #1067。

為什麼從「解析合併指令再查狀態」改成「只放行 pr:merge」：舊 hook 要辨認 gh pr merge 的每一種寫法、再自己查 status，
#1018 為此被 Codex 審了 13 輪以上，仍一直有新的繞法；而且它把引號全拿掉再比對字串，commit 訊息、issue 草稿、python heredoc
「提到」merge 也被擋（#1067）。現在狀態檢查全部搬進 pr:merge（讀 pr:status），hook 只要分辨「這是不是一個合併動作」：
- 照 shell 規則切字詞：引號裡的文字是一個字詞、heredoc 給 cat／gh／python 的內容是資料，都不會被當成指令。
- 真的會被 shell 執行的地方照樣往下看：bash -c、eval、heredoc／管線餵給 sh、$(…)／`…`、trap、alias、watch。
- 看不到內容時（指令名稱是變數、把變數 eval 掉、管線餵進 shell）退回整串比對，寧可多擋。
- python／node 等其他語言的程式與腳本檔不解析，跟「寫進檔案再執行」一樣攔不住；這個 hook 防的是 Agent 順手直接合併，
  刻意繞過要靠 GitHub required check（見 review-governance.md「已知限制」）。
*/
import { STATUS_CONTEXT, WAIVER_LABEL } from './codexReviewGate'
import { type Command, type Word, parseShell } from './shellWords'

export type GitRunner = (cwd: string, args: string[]) => string
export type GuardContext = { cwd: string; git: GitRunner }
export type Verdict = { allowed: true } | { allowed: false; reason: string }

const MERGE_MSG = 'merge PRs only with `bun run pr:merge <number>`: it checks codex-review/current, review threads, CI, mergeability and the base, then merges the reviewed head. gh pr merge, auto-merge and REST/GraphQL/curl merges are not allowed for agents.'
const WAIVER_MSG = `only the owner may apply or remove the ${WAIVER_LABEL} label, in the GitHub UI. Ask the user if a waiver is needed.`
const STATUS_MSG = `agents may not write commit statuses or check runs (that could forge ${STATUS_CONTEXT}).`
const PUSH_MSG = 'pushing directly to staging/main bypasses PR review; open a PR against staging instead.'
const EXPLICIT_PUSH = 'git push origin <branch>:<branch>'

class Blocked extends Error {}
function block(reason: string): never {
  throw new Blocked(reason)
}

export const basename = (value: string) => value.replace(/^.*\//, '')

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish', 'csh', 'tcsh'])
const HTTP_CLIENTS = new Set(['curl', 'wget', 'http', 'https', 'xh', 'xhs'])
const DIR_CHANGERS = new Set(['cd', 'pushd', 'popd', 'chdir'])
const RESERVED = new Set(['!', '{', '}', 'if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'for', 'case', 'esac', 'time', 'function', 'select', 'coproc', '[[', ']]'])
// 會把後面的字詞當成另一個指令來執行的包裝指令；用來判斷 sh／bash 是不是在「指令位置」。
const WRAPPERS = new Set(['builtin', 'command', 'exec', 'nohup', 'noglob', 'sudo', 'doas', 'env', 'time', 'timeout', 'nice', 'xargs', 'stdbuf', 'caffeinate', 'flock', 'setsid', 'unbuffer', 'arch', 'script', 'parallel'])
// gh 的內建指令；指令位置上出現其他名稱，是 alias 或 extension，看不出它會不會合併（gh alias set m 'pr merge'）。
const KNOWN_GH = new Set(['a11y', 'accessibility', 'actions', 'agent-task', 'alias', 'api', 'attestation', 'auth', 'browse', 'cache', 'co', 'codespace', 'completion', 'config', 'copilot', 'environment', 'extension', 'extensions', 'ext', 'gist', 'gpg-key', 'help', 'issue', 'label', 'licenses', 'org', 'pr', 'preview', 'project', 'reference', 'release', 'repo', 'ruleset', 'run', 'search', 'secret', 'ssh-key', 'status', 'variable', 'version', 'workflow'])
// GraphQL mutation 改成白名單：#1018 的黑名單一再漏（createCommitOnBranch 可直接把檔案寫進 staging）。
// 這幾個是 review 流程用得到的（回覆、結案、留言、reaction）；其他 mutation 交給使用者。
const SAFE_MUTATIONS = new Set(['resolveReviewThread', 'unresolveReviewThread', 'addPullRequestReviewThreadReply', 'addPullRequestReviewComment', 'addPullRequestReview', 'submitPullRequestReview', 'addComment', 'updateIssueComment', 'minimizeComment', 'unminimizeComment', 'addReaction', 'removeReaction', 'markPullRequestReadyForReview', 'requestReviews'])
// 看不到程式語意時（curl 的資料、整串比對）出現就擋的 mutation 名稱。
const BRANCH_WRITE = /\b(mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest|mergeBranch|updateRefs?|createRef|createCommitOnBranch)\b/
// 不論方法一律擋（沿用舊 hook）：PR 合併、直接合併分支、改 ref、fork 同步。
// git/refs 只在寫入時擋（REST_WRITE 的 git/）：讀別的 repo 的 tag ref 是正常查詢（重播歷史指令時發現的誤擋）。
const REST_ALWAYS = /(^|\/)pulls\/[^/\s]+\/merge\b|(^|\/)merges\b|(^|\/)merge-upstream\b/
// 非 GET 時擋：commit status／check（可偽造 codex-review/current）、檔案內容（等於 commit 進分支）、git 物件、branch protection／ruleset。
const REST_WRITE = /(^|\/)statuses\/|(^|\/)check-(runs|suites)\b|(^|\/)contents\/|(^|\/)git\/|\/protection\b|(^|\/)rulesets\b/
// 不吃值的 push 選項。-d／--delete 刪的是寫在後面的 refspec，staging／main 仍由目的地檢查擋（清掉自己的遠端分支是常見操作）。
const SIMPLE_PUSH_FLAGS = new Set(['-u', '--set-upstream', '-q', '--quiet', '-v', '--verbose', '--force-with-lease', '--no-verify', '--porcelain', '-n', '--dry-run', '-d', '--delete', '--atomic', '--follow-tags', '--progress', '--no-progress'])

// GitHub 的 label 名稱不分大小寫：Codex-Review-Waived 貼上去就是同一個豁免 label（#1090 暫代審查）。
const hasWaiver = (text: string) => text.toLowerCase().includes(WAIVER_LABEL)
// git 會把 heads/staging 補成 refs/heads/staging（#1090 暫代審查實際推到了 staging）。
const isProtectedRef = (ref: string) => /^(refs\/)?(heads\/)?(staging|main)$/.test(ref)
// 這些路徑讀到的都是 stdin：bash /dev/fd/0 <<EOF 跟 bash <<EOF 一樣（#1090 暫代審查）。
// /proc/thread-self/fd/N 與 /proc/<pid>/fd/N 也是同一批 fd（#1090 Codex 第 2 輪）。
const isStdinPath = (path: string) => /^(-|\/dev\/stdin|\/dev\/fd\/\d+|\/proc\/(self|thread-self|\d+)\/fd\/\d+)$/.test(path)
// 這些指令有自己的 -c／--command 選項，值交給 shell 執行（script -c、flock -c、su -c、runuser -c，#1090 Codex 第 2 輪）。
const COMMAND_OPTION_RUNNERS = new Set(['script', 'flock', 'su', 'runuser'])
// 會把參數字串交給 shell 執行的 tmux 子指令。
const TMUX_COMMANDS = new Set(['new', 'new-session', 'new-window', 'neww', 'split-window', 'splitw', 'run-shell', 'run', 'send-keys', 'send', 'respawn-pane', 'respawnp', 'respawn-window', 'respawnw', 'if-shell', 'if', 'display-popup', 'popup'])

// configRedirect：整串指令裡改了 git 讀設定的位置（HOME、XDG_CONFIG_HOME、GIT_CONFIG*、GIT_DIR），沒寫冒號的 push 就不能信任 cwd 的設定。
// topLevel：最外層那串指令本身的簡單指令（不含 $(…)、bash -c、heredoc 餵給 shell 等巢狀程式碼），給 destructiveGuard 判斷賦值的有效範圍。
export type Found = { commands: Command[]; topLevel: Command[]; codeTexts: string[]; changesDir: boolean; dynamicCommand: boolean; configRedirect: boolean; top: string }

export const isAssignment = (word: Word) => /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(word.raw)
export function argvStart(words: Word[]): number {
  let a = 0
  while (a < words.length && (RESERVED.has(words[a].value) || isAssignment(words[a]))) a += 1
  return a
}
// 指令位置：簡單指令的第一個字、前面有包裝指令（timeout 5 bash -c …、env gh …），或緊接在 find 的 -exec 之後。
// find 本身不算包裝指令：find . -name gh -type f 的 gh 只是參數。
const EXEC_FLAGS = new Set(['-exec', '-execdir', '-ok', '-okdir'])
export function inCommandPosition(words: Word[], k: number): boolean {
  const a = argvStart(words)
  return k === a || EXEC_FLAGS.has(words[k - 1]?.value ?? '') || words.slice(a, k).some(word => WRAPPERS.has(basename(word.value)))
}

function collect(src: string, depth: number, found: Found) {
  if (depth > 8) block('this command nests shells too deeply for the merge guard to read; run it in simpler steps.')
  const parsed = parseShell(src)
  // 引號或括號沒收尾：看不出後面是資料還是指令，整段交給比對。
  if (parsed.unterminated !== null) found.codeTexts.push(parsed.unterminated)
  // zsh 的 ${(e)x}、glob qualifier (e:…:)、以變數做算式：shell 會在執行時把字串當程式再算一次，內容在別處（#1090 暫代審查）。
  if (parsed.evalExpansion) found.codeTexts.push(found.top)
  if (parsed.subshell || parsed.background) found.changesDir = true
  for (const sub of parsed.substitutions) collect(sub, depth + 1, found)
  for (const command of parsed.commands) {
    found.commands.push(command)
    if (depth === 0) found.topLevel.push(command)
    if (command.words.some(word => !word.dynamic && DIR_CHANGERS.has(word.value))) found.changesDir = true
    sinks(command, depth, found, parsed.processSubstitutions)
  }
}

// 把「會被當成 shell 程式執行的字串」交回 collect；字串裡有展開時看不到最終內容，整串指令再交給比對。
function codeArg(word: Word, depth: number, found: Found) {
  collect(word.value, depth + 1, found)
  if (word.dynamic) found.codeTexts.push(found.top)
}

function stdinIsCode(command: Command, depth: number, found: Found) {
  for (const doc of command.heredocs) {
    collect(doc.body, depth + 1, found)
    if (!doc.quoted && /[$`]/.test(doc.body)) found.codeTexts.push(found.top)
  }
  for (const word of command.herestrings) codeArg(word, depth, found)
  // echo 'gh pr merge 1' | sh：送進 shell 的是前面指令的輸出，看不到，整串比對。
  if (command.upstream.length) found.codeTexts.push(found.top)
  // bash < <(echo 'gh pr merge 1')：process substitution 的輸出就是腳本（#1090 Codex）；來源是變數時看不到，整串比對。
  // 一般檔案（bash < script.sh）跟執行腳本檔一樣不解析。
  for (const word of command.inputs) {
    if (word.raw.startsWith('<(')) found.codeTexts.push(word.raw)
    else if (word.dynamic) found.codeTexts.push(found.top)
  }
}

function sinks(command: Command, depth: number, found: Found, processSubs: string[]) {
  const words = command.words
  const a = argvStart(words)
  // 改 git 讀設定位置的變數（寫在指令前面、export 或單獨賦值都算）；GIT_CONFIG_GLOBAL=/dev/null 與 GIT_CONFIG_NOSYSTEM 是 Agent 常用的隔離寫法，不算。
  if (words.some(word => /^(HOME|XDG_CONFIG_HOME|GIT_CONFIG\w*|GIT_DIR|GIT_COMMON_DIR)=/.test(word.value) && !/^(GIT_CONFIG_GLOBAL=\/dev\/null|GIT_CONFIG_NOSYSTEM=)/.test(word.value))) {
    found.configRedirect = true
  }
  // bash 的算式情境會把變數的值再當算式算一次，值裡的 a[$(cmd)] 會執行 cmd：let、declare／typeset／local -i、[[ x -eq y ]]
  // （$(( )) 與 (( )) 由 shellWords 標記）。內容在別處，整串比對（#1109 自行 review 用 echo 驗證過）。
  const name0 = words[a]?.value ?? ''
  if (name0 === 'let' || (['declare', 'typeset', 'local', 'readonly', 'export'].includes(name0) && words.some(word => /^-\w*i/.test(word.value))) ||
      // [[ 在 RESERVED 裡會被 argvStart 跳過，所以直接看有沒有這個字。
      (words.some(word => word.value === '[[') && words.some(word => /^-(eq|ne|lt|le|gt|ge)$/.test(word.value)))) {
    found.codeTexts.push(found.top)
  }
  // 指令名稱是變數（G=gh; $G pr merge、m='gh pr merge'; $m 1），包括包裝指令後面的那個（env $G pr merge）：
  // 看不到真正執行什麼，整串比對，並記下來讓 guardCommand 對整串指令裡的 pr … merge 一律擋（f(){ "$@"; }; f $G pr merge）。
  if (words.some((word, k) => word.dynamic && !isAssignment(word) && inCommandPosition(words, k))) {
    found.dynamicCommand = true
    found.codeTexts.push(found.top)
  }
  for (let k = 0; k < words.length; k += 1) {
    const word = words[k]
    if (word.dynamic) continue
    const name = basename(word.value)
    if (SHELLS.has(name)) {
      const after = words.slice(k + 1)
      // 有 -c 時，哪個字是程式碼要看前面每個選項吃不吃值（bash --rcfile x -c '…'，#1090 Codex），各 shell 的選項列不完。
      // 所以 -c 之後不去數位置：每個不是選項的字都當成程式碼檢查，寧可多看幾個無害的字。
      if (after.some(item => /^-[A-Za-z]*c[A-Za-z]*$/.test(item.value))) {
        for (const item of after) if (!/^[-+]/.test(item.value)) codeArg(item, depth, found)
        continue
      }
      let j = 0
      let readsStdin = false
      while (j < after.length) {
        const option = after[j].value
        if (option === '--') { j += 1; break }
        if (['-o', '+o', '-O', '+O', '--rcfile', '--init-file'].includes(option)) { j += 2; continue }
        if (/^[-+][A-Za-z]+$/.test(option)) {
          if (option[0] === '-' && option.includes('s')) readsStdin = true
          j += 1
          continue
        }
        if (option.startsWith('--')) { j += 1; continue }
        break
      }
      const positional = after[j]
      if (positional?.raw.startsWith('<(')) {
        // bash <(echo 'gh pr merge 1')：process substitution 的輸出就是腳本。
        found.codeTexts.push(positional.raw, ...processSubs)
      } else if (inCommandPosition(words, k) && (readsStdin || !positional || isStdinPath(positional.value))) {
        stdinIsCode(command, depth, found)
      }
      continue
    }
    if (name === 'env') {
      // env -S 把字串切成指令執行；-S 'x'、-S'x'、-iS 'x'、--split-string='x' 都要認得（#1090 Codex）。
      for (let j = k + 1; j < words.length; j += 1) {
        const value = words[j].value
        if (value === '-S' || value === '--split-string' || /^-[A-Za-z]*S$/.test(value)) {
          if (words[j + 1]) codeArg(words[j + 1], depth, found)
          break
        }
        const glued = /^--split-string=([\s\S]*)$/.exec(value) ?? /^-[A-Za-z]*S([\s\S]+)$/.exec(value)
        if (glued) { codeArg({ ...words[j], value: glued[1] }, depth, found); break }
        if (['-u', '--unset', '-C', '--chdir'].includes(value)) { j += 1; continue }
        if (!value.startsWith('-') && !value.includes('=')) break
      }
    }
    if (!(k === a || (k > 0 && WRAPPERS.has(basename(words[k - 1].value))))) continue
    const rest = words.slice(k + 1)
    if (name === 'eval' && rest.length) {
      collect(rest.map(item => item.value).join(' '), depth + 1, found)
      if (rest.some(item => item.dynamic)) found.codeTexts.push(found.top)
    } else if ((name === 'source' || name === '.') && rest[0]) {
      if (rest[0].raw.startsWith('<(')) found.codeTexts.push(rest[0].raw, ...processSubs)
      else if (isStdinPath(rest[0].value)) stdinIsCode(command, depth, found)
    } else if (name === 'trap') {
      const handler = rest.find(item => !item.value.startsWith('-'))
      if (handler) codeArg(handler, depth, found)
    } else if (name === 'alias') {
      for (const item of rest) if (item.value.includes('=')) codeArg({ ...item, value: item.value.slice(item.value.indexOf('=') + 1) }, depth, found)
    } else if (name === 'watch') {
      const body = rest.filter((item, index) => !item.value.startsWith('-') && !['-n', '--interval'].includes(rest[index - 1]?.value ?? ''))
      if (body.length) codeArg({ value: body.map(item => item.value).join(' '), raw: body.map(item => item.raw).join(' '), dynamic: body.some(item => item.dynamic) }, depth, found)
    } else if (name === 'tmux') {
      // tmux new -d 'gh pr merge 1'、send-keys '…' Enter：字串交給 tmux 裡的 shell 執行（#1090 暫代審查）。
      // 哪個參數是指令要看子指令與選項，所以子指令之後的每個字都當成程式碼檢查。
      const sub = rest.findIndex(item => TMUX_COMMANDS.has(item.value))
      if (sub >= 0) {
        const args = rest.slice(sub + 1)
        const keys = args.filter((item, index) => !item.value.startsWith('-') && !['-t', '-N', '-c', '-T'].includes(args[index - 1]?.value ?? ''))
        for (const item of keys) codeArg(item, depth, found)
        // send-keys 把每個參數依序打進終端機，指令可以拆在好幾個參數裡（'gh pr ' merge Enter、'gh pr me' rge Enter，#1090 Codex 第 2 輪）。
        // 照 tmux 的方式重組：文字直接相接，Enter／C-m／C-j 是換行、Space 是空白，其他按鍵名稱不算文字。
        const KEY_TEXT: Record<string, string> = { Enter: '\n', 'C-m': '\n', 'C-j': '\n', KPEnter: '\n', Space: ' ', Tab: '\t' }
        const isKeyName = (value: string) => value in KEY_TEXT || /^([CMS]-.|F\d+|Up|Down|Left|Right|Home|End|BSpace|Escape|DC|IC|NPage|PPage|BTab)$/.test(value)
        const stream = keys.map(item => (isKeyName(item.value) ? KEY_TEXT[item.value] ?? '' : item.value)).join('')
        codeArg({ value: stream, raw: keys.map(item => item.raw).join(' '), dynamic: keys.some(item => item.dynamic) }, depth, found)
      }
    }
    if (COMMAND_OPTION_RUNNERS.has(name) && inCommandPosition(words, k)) {
      for (let j = k + 1; j < words.length; j += 1) {
        const value = words[j].value
        if (value === '-c' || value === '--command') { if (words[j + 1]) codeArg(words[j + 1], depth, found) }
        else {
          const glued = /^(?:--command=|-c)([\s\S]+)$/.exec(value)
          if (glued) codeArg({ ...words[j], value: glued[1] }, depth, found)
        }
      }
    }
  }
}

// 只放行唯一的合併路徑；它在 scripts/pr-merge.ts 裡讀 pr:status，全部通過才合併。
function isPrMerge(argv: Word[]): boolean {
  if (basename(argv[0]?.value ?? '') !== 'bun') return false
  const target = argv[1]?.value === 'run' ? argv[2]?.value : argv[1]?.value
  return target === 'pr:merge' || /(^|\/)scripts\/pr-merge\.ts$/.test(target ?? '')
}

// gh 的位置參數（跳過旗標；-R／--repo 會吃掉下一個字）。
function ghPositionals(words: Word[]): number[] {
  const indexes: number[] = []
  for (let index = 0; index < words.length; index += 1) {
    const value = words[index].value
    if (['-R', '--repo', '--hostname'].includes(value)) { index += 1; continue }
    if (value.startsWith('-')) continue
    indexes.push(index)
  }
  return indexes
}

function checkLabelFlags(args: Word[]) {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index].value
    let label: Word | undefined
    if (['--add-label', '--remove-label', '--label', '-l'].includes(value)) label = args[index + 1]
    else {
      const glued = /^(--add-label=|--remove-label=|--label=|-l)(.+)$/.exec(value)
      if (glued) label = { ...args[index], value: glued[2] }
    }
    if (label && (label.dynamic || hasWaiver(label.value))) block(WAIVER_MSG)
  }
}

function checkGh(rest: Word[], atCommand: boolean) {
  const positions = ghPositionals(rest)
  const top = rest[positions[0]]
  if (!top) return
  if (top.dynamic) block('gh subcommands must be literal (no $VAR, backticks, globs or braces), so the merge guard can tell what runs.')
  if (atCommand && !KNOWN_GH.has(top.value)) block(`"gh ${top.value}" is a gh alias or extension; the merge guard cannot tell whether it merges. Use the built-in gh command instead.`)
  const sub = rest[positions[1]]
  // gh api 的第二個位置參數是 endpoint，不是子指令；它在 checkApi 裡另有規則（reply helper 常寫 …/comments/$1/replies）。
  if (sub?.dynamic && top.value !== 'api') block('gh subcommands must be literal (no $VAR, backticks, globs or braces), so the merge guard can tell what runs.')
  const after = sub ? rest.slice(positions[1] + 1) : []
  switch (top.value) {
    case 'pr':
      if (sub?.value === 'merge') {
        // 取消 auto-merge 只會讓合併「不發生」，新 head 還沒審時正需要它（#1018 Codex finding）；只接受最單純的寫法。
        const repoValue = (index: number) => ['-R', '--repo'].includes(after[index - 1]?.value ?? '')
        const cancelOnly = after.some(word => word.value === '--disable-auto') &&
          after.every((word, index) => !word.dynamic && (word.value === '--disable-auto' || /^\d+$/.test(word.value) || ['-R', '--repo'].includes(word.value) || repoValue(index) || /^(-R|--repo=)./.test(word.value)))
        if (!cancelOnly) block(MERGE_MSG)
      }
      if (sub?.value === 'edit' || sub?.value === 'create') checkLabelFlags(after)
      return
    case 'issue':
      if (sub?.value === 'edit' || sub?.value === 'create') checkLabelFlags(after)
      return
    case 'label':
      if (rest.some(word => hasWaiver(word.value)) || rest.some(word => word.dynamic)) block(WAIVER_MSG)
      return
    case 'alias':
      if (sub?.value === 'set' || sub?.value === 'import') block('agents may not define gh aliases: an alias can hide a merge from the merge guard.')
      return
    case 'repo':
      if (sub?.value === 'sync') block('gh repo sync can rewrite remote branches such as staging; ask the user.')
      return
    case 'api':
      checkApi(rest.slice(positions[0] + 1))
  }
}

const apiPath = (endpoint: string) => endpoint.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '').replace(/[?#].*$/, '')

// GraphQL 文件裡每個 mutation 的最上層欄位；讀不懂時回傳 null（當成不安全）。
export function mutationFields(query: string): string[] | null {
  const clean = stripGraphql(query)
  if (clean === null) return null
  const fields: string[] = []
  for (const match of clean.matchAll(/\bmutation\b/g)) {
    // selection set 是括號外的第一個 {：變數預設值 ($i: In = {…}) 與 directive 參數在括號裡，不能誤當成本體。
    let open = -1
    let parens = 0
    for (let j = match.index + match[0].length; j < clean.length; j += 1) {
      if (clean[j] === '(') parens += 1
      else if (clean[j] === ')') parens -= 1
      else if (clean[j] === '{' && parens === 0) { open = j; break }
    }
    if (open < 0) return null
    let depth = 0
    let closed = false
    for (let j = open; j < clean.length; j += 1) {
      const c = clean[j]
      if (c === '(') parens += 1
      else if (c === ')') parens -= 1
      else if (c === '{') depth += 1
      else if (c === '}') { depth -= 1; if (depth === 0) { closed = true; break } }
      else if (depth === 1 && parens === 0 && /[A-Za-z_]/.test(c)) {
        const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(clean.slice(j))![0]
        j += name.length - 1
        // alias: real 的 alias 後面接冒號，真正的欄位是下一個名稱。
        if (!clean.slice(j + 1).trimStart().startsWith(':')) fields.push(name)
      }
    }
    // 括號沒收尾就是沒讀完，當成不安全（#1090 Codex）。
    if (!closed) return null
  }
  return fields
}

// 拿掉字串與 # 註解再解析：註解裡的 { 曾讓解析器把真正的 mutation 本體跳過、回傳空清單而放行（#1090 Codex）。
// 字串換成 ""，裡面的大括號與 mutation 字樣不算；字串沒收尾回傳 null。
function stripGraphql(query: string): string | null {
  let out = ''
  for (let j = 0; j < query.length; j += 1) {
    if (query.startsWith('"""', j)) {
      const end = query.indexOf('"""', j + 3)
      if (end < 0) return null
      out += '""'
      j = end + 2
      continue
    }
    const c = query[j]
    if (c === '"') {
      j += 1
      while (j < query.length && query[j] !== '"' && query[j] !== '\n') j += query[j] === '\\' ? 2 : 1
      if (query[j] !== '"') return null
      out += '""'
      continue
    }
    if (c === '#') {
      while (j + 1 < query.length && query[j + 1] !== '\n') j += 1
      out += ' '
      continue
    }
    out += c
  }
  return out
}

function checkGraphqlQuery(query: string) {
  const fields = mutationFields(query)
  if (BRANCH_WRITE.test(query) || /\bon\s+Mutation\b/.test(stripGraphql(query) ?? 'on Mutation') || fields === null || fields.some(field => !SAFE_MUTATIONS.has(field))) {
    block(`this GraphQL mutation is not on the merge guard's allow list (${[...SAFE_MUTATIONS].slice(0, 4).join(', ')}, …). Merges go through \`bun run pr:merge <number>\`; ask the user for anything else.`)
  }
}

function checkApi(args: Word[]) {
  let method: Word | null = null
  let endpoint: Word | null = null
  let input: Word | null = null
  const fields: Word[] = []
  const take = (word: Word | undefined, value?: string) => (word ? { ...word, value: value ?? word.value } : null)
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]
    const value = word.value
    if (value === '-X' || value === '--method') method = take(args[++index])
    else if (value.startsWith('--method=')) method = take(word, value.slice(9))
    else if (/^-X./.test(value)) method = take(word, value.slice(2))
    else if (['-f', '-F', '--field', '--raw-field'].includes(value)) { const field = take(args[++index]); if (field) fields.push(field) }
    else if (/^--(raw-)?field=/.test(value)) fields.push({ ...word, value: value.slice(value.indexOf('=') + 1) })
    else if (/^-[fF]./.test(value)) fields.push({ ...word, value: value.slice(2) })
    else if (value === '--input') input = take(args[++index]) ?? word
    else if (value.startsWith('--input=')) input = word
    else if (['-H', '--header', '-q', '--jq', '-t', '--template', '--cache', '--hostname', '-p', '--preview'].includes(value)) index += 1
    else if (value.startsWith('-')) continue
    else endpoint ??= word
  }
  // gh api 沒寫 -X 時，有 -f／-F／--input 就是 POST。
  const verb = method ? method.value.toUpperCase() : fields.length || input ? 'POST' : 'GET'
  if (method?.dynamic) block('gh api --method must be literal, so the merge guard can tell whether this writes.')
  if (verb === 'PUT') block('gh api with method PUT is not allowed for agents (REST merges and file writes use PUT); merges go through `bun run pr:merge <number>`.')
  if (!endpoint) return
  const path = apiPath(endpoint.value)
  if (/(^|\/)graphql$/.test(path)) {
    // query 從檔案讀、或用變數／指令替換組出來時，hook 看不到真正的內容（#1018 Codex finding）。
    // 其他欄位是 GraphQL 變數（-f id="$tid"），只能填進字面 query 的參數，改不了要執行哪個 mutation，可以是變數
    // （重播歷史指令：reply helper 幾乎都這樣寫）。欄位名稱本身是變數時可能就是 query，照樣擋。
    const key = (field: Word) => field.value.split('=')[0]
    if (input || fields.some(field => /[$`]/.test(key(field)) || (key(field) === 'query' && (field.dynamic || /^query=@/.test(field.value))))) {
      block('gh api graphql must use an inline literal query (no --input, @file, $VAR or $(…) in the query), so the merge guard can read it.')
    }
    // 每個 query 欄位都要檢查：重複的欄位以哪個為準不是 hook 該猜的。
    for (const query of fields.filter(field => key(field) === 'query')) checkGraphqlQuery(query.value.slice(6))
    return
  }
  if (REST_ALWAYS.test(path)) block(MERGE_MSG)
  if (verb === 'GET') return
  if (endpoint.dynamic) {
    // 回覆 review 的 helper 常寫成 gh api …/comments/$1/replies -f body="$2"。結尾固定是留言類資源、而且只送留言欄位時，
    // 變數只決定回覆哪則留言：就算變數被塞成 merges?x= 之類，也湊不出合併、status、label 或 ref 需要的欄位（重播歷史指令時發現的誤擋）。
    // 只限 POST／PATCH 且至少一個欄位：DELETE 不需要欄位，變數塞成 …/labels/<豁免>? 或 git/refs/heads/staging? 就能刪掉（#1109 自行 review）。
    const commentOnly = /\/(comments|replies|reactions)$/.test(path) && !input && ['POST', 'PATCH'].includes(verb) && fields.length > 0 &&
      fields.every(field => ['body', 'in_reply_to', 'content'].includes(field.value.split('=')[0]))
    if (!commentOnly) block('gh api endpoints must be literal for anything but GET (except comment replies that only send body/in_reply_to/content), so the merge guard can tell what is written.')
  }
  if (/(^|\/)(statuses|check-runs|check-suites)\b/.test(path) || fields.some(field => field.value.includes(STATUS_CONTEXT))) block(STATUS_MSG)
  if (REST_WRITE.test(path)) block(`gh api ${verb} ${path} can change branches or protections directly; ask the user.`)
  if (hasWaiver(path)) block(WAIVER_MSG)
  for (const field of fields) {
    const key = field.value.split('=')[0]
    const labelKey = /^(labels?(\[\])?|name|new_name)$/.test(key)
    if ((labelKey && (field.dynamic || hasWaiver(field.value))) || (/(^|\/)labels\b/.test(path) && hasWaiver(field.value))) block(WAIVER_MSG)
  }
  if (input && /(^|\/)labels\b|(^|\/)(issues|pulls)\/[^/]+$/.test(path)) block(`gh api ${verb} ${path} --input hides which labels it sets; use gh pr edit / gh issue edit instead.`)
}

function checkHttp(args: Word[]) {
  let method: Word | null = null
  let hasData = false
  const data: Word[] = []
  const urls: Word[] = []
  const valueFlags = new Set(['-H', '--header', '-o', '--output', '-u', '--user', '-A', '--user-agent', '-e', '--referer', '-w', '--write-out', '-b', '--cookie', '-c', '--cookie-jar', '-m', '--max-time', '--connect-timeout', '-x', '--proxy', '-O', '--output-document'])
  const dataFlags = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--data-ascii', '-F', '--form', '--form-string', '--json', '-T', '--upload-file', '--post-data', '--post-file', '--body-data', '--body-file'])
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]
    const value = word.value
    if (['-X', '--request', '--method'].includes(value)) method = args[++index] ?? null
    else if (/^-X./.test(value)) method = { ...word, value: value.slice(2) }
    else if (/^--(request|method)=/.test(value)) method = { ...word, value: value.slice(value.indexOf('=') + 1) }
    else if (dataFlags.has(value)) { hasData = true; if (args[index + 1]) data.push(args[++index]) }
    else if (/^--(data[\w-]*|json|form|post-data|post-file|body-data|body-file|upload-file)=/.test(value)) { hasData = true; data.push({ ...word, value: value.slice(value.indexOf('=') + 1) }) }
    else if (/^-d./.test(value)) { hasData = true; data.push({ ...word, value: value.slice(2) }) }
    else if (value === '--url') { if (args[index + 1]) urls.push(args[++index]) }
    // -K／--config 從檔案或 stdin 讀網址、方法與資料，hook 看不到（#1090 暫代審查）。
    else if (/^(-K|--config)(=|$)|^-K./.test(value)) block('curl -K/--config hides the URL and method from the merge guard; pass them on the command line.')
    else if (valueFlags.has(value)) index += 1
    else if (value.startsWith('-')) continue
    else if (/^[A-Z]+$/.test(value) && !method && !urls.length) method = word
    else urls.push(word)
  }
  // 原始寫法與 shell 還原後的值都要看，並解開 JSON 的 \u 跳脫：api.git""hub.com、"waived" 只看其中一種就認不出（#1090 Codex 第 2 輪）。
  const decode = (text: string) => text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
  const all = decode([...args.map(word => word.raw), ...args.map(word => word.value)].join(' '))
  const verb = method ? method.value.toUpperCase() : hasData ? 'POST' : 'GET'
  if (verb === 'PUT') block('curl/wget with method PUT is not allowed for agents (REST merges and file writes use PUT).')
  if (REST_ALWAYS.test(all) || BRANCH_WRITE.test(all)) block(MERGE_MSG)
  // 帶 Authorization header 的呼叫也當成可能打 GitHub：網址藏在變數裡時，看得到的只剩憑證。
  if (!/github\.com|api\.github|GH_TOKEN|GITHUB_TOKEN|gh\s+auth\s+token|authorization:/i.test(all)) return
  if (method?.dynamic) block('the HTTP method of a GitHub API call must be literal.')
  if (hasWaiver(all)) block(WAIVER_MSG)
  // JSON 字串可以用 \u 跳脫把 mutation 名稱拆開，比對不到；GitHub GraphQL 一律只走 gh api graphql（#1090 暫代審查）。
  if (urls.some(url => /graphql/.test(url.value)) && (hasData || verb !== 'GET')) {
    block('GraphQL mutations against GitHub through curl are not allowed for agents; use gh api graphql with an inline query.')
  }
  if (verb === 'GET') return
  if (urls.some(url => url.dynamic)) block('GitHub API URLs must be literal for anything but GET, so the merge guard can tell what is written.')
  if (all.includes(STATUS_CONTEXT) || urls.some(url => /(^|\/)(statuses|check-runs|check-suites)\b/.test(apiPath(url.value)))) block(STATUS_MSG)
  if (urls.some(url => REST_WRITE.test(apiPath(url.value)))) block('this GitHub API call can change branches or protections directly; ask the user.')
  // label、issue、PR 的寫入只走 gh pr edit／gh issue edit／gh api：curl 的 body 有太多跳脫方式能藏住豁免 label（#1090 Codex 第 2 輪）。
  if (urls.some(url => /(^|\/)labels\b|(^|\/)(issues|pulls)\/[^/]+$/.test(apiPath(url.value)))) {
    block('write labels, issues and PRs with gh pr edit / gh issue edit / gh api, not curl (the merge guard cannot read every way a curl body can spell a label).')
  }
}

// git push 的檢查沿用 #1018／#1029／#1032 的規則，只是改成看真正的字詞（引號裡的文字不會再被當成 push 的參數）。
function checkPush(words: Word[], gitIndex: number, pushIndex: number, found: Found, ctx: GuardContext) {
  const gitOptions = words.slice(gitIndex + 1, pushIndex)
  const args = words.slice(pushIndex + 1)
  if (args.some(word => word.dynamic)) block('git push arguments must be literal (no $VAR, backticks, globs or braces) so the destination can be checked.')
  // --all／--mirror／--branches 會連本地的 staging／main 一起推（#1032 Codex finding 的同類）。
  if (args.some(word => ['--all', '--mirror', '--branches'].includes(word.value))) block('git push --all/--mirror/--branches can update staging/main; push a single feature branch explicitly.')
  const positional = args.filter(word => !word.value.startsWith('-')).map(word => word.value)
  // 不認得、又不是 --x=y 寫法的選項可能吃掉下一個字（--receive-pack <x>），位置參數就數不準：只接受寫明 src:dst（#1032）。
  if (args.some(word => word.value.startsWith('-') && !SIMPLE_PUSH_FLAGS.has(word.value) && !word.value.includes('=')) && !positional.some(value => value.includes(':'))) {
    block(`this git push has options that may take a value, so its destination can't be read; write an explicit refspec, e.g. ${EXPLICIT_PUSH}.`)
  }
  // 加了引號的萬用字元 refspec（'refs/heads/feature/*:refs/heads/*'）由 git 展開，feature/staging 會推到 staging（#1090 Codex 第 2 輪）。
  if (positional.some(value => value.includes('*'))) block(`wildcard refspecs can update staging/main; push a single branch with ${EXPLICIT_PUSH}.`)
  for (const value of positional) {
    if (isProtectedRef(value.split(':').pop()!.replace(/^\+/, ''))) block(PUSH_MSG)
  }
  const refspecs = positional.slice(1)
  if (refspecs.length && refspecs.every(value => value.includes(':'))) return
  if (refspecs.length && !refspecs.some(value => ['HEAD', '@'].includes(value.replace(/^\+/, '')))) {
    // 寫了分支名但沒寫冒號（git push origin claude/x）：remote.*.push 有設定時，git 會照設定改寫目的地（#1090 暫代審查）。
    // 能在指令裡設定它的路（-c、git config、GIT_CONFIG_* 環境變數）都另外擋了，剩下的只有 repo 原本就有的設定：
    // 最單純的寫法順便用 cwd 查一次；cd 之後再 push 這種常見寫法照舊放行（重播歷史指令：62 條這樣的 push 曾被誤擋）。
    // 指令裡改了 git 讀設定的位置（GIT_CONFIG_GLOBAL=<檔案>、HOME=…）時，那個設定檔也能寫 remote.*.push（#1109 自行 review 驗證過）。
    if (found.configRedirect) block(`this command changes where git reads its config (HOME, XDG_CONFIG_HOME, GIT_CONFIG*, GIT_DIR), which can rewrite a push destination; use ${EXPLICIT_PUSH}.`)
    if (!found.changesDir && gitIndex === 0 && !gitOptions.length && ctx.git(ctx.cwd, ['config', '--get-regexp', '^remote\\..*\\.push$'])) {
      block(`remote.*.push is configured here, so git may rewrite this push's destination; use ${EXPLICIT_PUSH}.`)
    }
    return
  }
  // 沒寫目的地（或目的地是 HEAD／@）：要由 git 依設定決定。不模擬 shell 的目錄與設定變化（#1032 三輪 Codex 證明補不完），
  // 只在最單純的寫法用 hook input 的 cwd 判斷——Agent 平常在 worktree 的功能分支上直接 push 就是這種（#1029）。
  if (found.changesDir || gitIndex !== 0 || gitOptions.length) {
    block(`a git push without an explicit refspec is only checked in its plain form (no cd/pushd/popd, subshell, background &, git options or env prefix); use ${EXPLICIT_PUSH}.`)
  }
  if (positional.length > 2 || args.some(word => word.value.startsWith('-') && !SIMPLE_PUSH_FLAGS.has(word.value))) {
    block(`a git push without an explicit refspec may only use ${[...SIMPLE_PUSH_FLAGS].sort().join('/')}; use ${EXPLICIT_PUSH}.`)
  }
  const git = (...gitArgs: string[]) => ctx.git(ctx.cwd, gitArgs)
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  // @{push} 是 git 依 remote.*.push／push.default／upstream 算出的目的地；remote 名稱可含 /，用實際存在的 remote 比對前綴（#1032）。
  const pushRef = git('rev-parse', '--symbolic-full-name', '@{push}')
  const prefixes = git('remote').split(/\s+/).filter(Boolean).map(name => `refs/remotes/${name}/`).filter(prefix => pushRef.startsWith(prefix))
  const destination = prefixes.length === 1 ? pushRef.slice(prefixes[0].length) : ''
  // @{push} 只報目前分支；push.default=matching 或 remote.*.push 會一次推多個分支（含本地的 staging）。
  const multiTarget = git('config', '--get', 'push.default') === 'matching' || Boolean(git('config', '--get-regexp', '^remote\\..*\\.push$'))
  if (multiTarget || ['staging', 'main', ''].includes(branch) || ['staging', 'main'].includes(destination) || (positional.length < 2 && !destination)) {
    block(`git push without an explicit refspec from ${branch || 'an unknown branch'} (push target: ${pushRef || 'unknown'}) could update staging/main; use ${EXPLICIT_PUSH}.`)
  }
}

// 指令名稱是執行時才組出來的（"$G$H" pr merge、"$(printf g)h" pr merge，#1090 Codex）：原文裡不一定拼得出 gh，
// 只靠整串比對擋不住。把它當成可能是 gh 來檢查剩下的字詞；字面上的 merge 或 push 到 staging／main 直接擋。
// 代價是 `$GIT merge origin/staging` 這種寫法也會被擋，改寫成 git merge 即可。
function checkConstructedCommand(rest: Word[]) {
  if (rest.some(word => !word.dynamic && word.value === 'merge')) {
    block(`this command's name is built at run time and it has a literal "merge" argument, so it may be gh pr merge. ${MERGE_MSG}`)
  }
  const top = rest[ghPositionals(rest)[0]]
  // 只有第一個參數像 gh 子指令時才照 gh 檢查：$CURL -sS --max-time 20 "$url" 不該被當成 gh（重播歷史指令時發現的誤擋）。
  if (top && !top.dynamic && KNOWN_GH.has(top.value)) checkGh(rest, false)
  const push = rest.findIndex(word => !word.dynamic && word.value === 'push')
  if (push >= 0) {
    const args = rest.slice(push + 1)
    // 沒寫目的地時要靠 git 設定判斷，但連指令是不是 git 都不知道，只能要求寫明 refspec。
    const explicit = args.filter(word => !word.value.startsWith('-')).length >= 2
    for (const word of explicit ? args : [{ value: 'staging', raw: '', dynamic: true }]) {
      const target = word.value.split(':').pop()!.replace(/^\+/, '')
      if (word.dynamic || isProtectedRef(target) || ['HEAD', '@'].includes(target)) {
        block(`this command's name is built at run time and it pushes to a destination the merge guard cannot clear; use git push origin <branch>:<branch>.`)
      }
    }
  }
}

function checkCommand(command: Command, found: Found, ctx: GuardContext) {
  const words = command.words
  const a = argvStart(words)
  if (a >= words.length || isPrMerge(words.slice(a))) return
  for (let k = 0; k < words.length; k += 1) {
    const word = words[k]
    // 名稱是執行時組出來的指令，包括包裝指令後面那個（env $G pr merge、command $(which gh) pr merge，#1090 暫代審查）。
    if (word.dynamic && !isAssignment(word) && inCommandPosition(words, k)) checkConstructedCommand(words.slice(k + 1))
    const name = basename(word.value)
    if (name === 'gh') {
      // gh 不限指令位置：xargs gh pr merge、timeout 60 gh pr merge 這類包裝指令列不完，寧可多擋 `echo gh pr merge` 這種沒加引號的文字。
      // alias／extension 的檢查則看包裝指令（env gh m、timeout 10 gh m 一樣會執行 alias，#1090 Codex）。
      checkGh(words.slice(k + 1), inCommandPosition(words, k))
      checkXargsGh(words, k)
    } else if (HTTP_CLIENTS.has(name)) checkHttp(words.slice(k + 1))
    else if (name === 'git') {
      checkGitConfig(words.slice(k + 1))
      // send-pack／http-push 是 push 的底層版本，同樣能直接更新遠端的 staging（#1090 Codex 第 2 輪）；Agent 用不到，一律擋。
      if (words.slice(k + 1).some(item => !item.dynamic && ['send-pack', 'http-push'].includes(item.value))) {
        block(`git send-pack/http-push update remote refs directly; use ${EXPLICIT_PUSH}.`)
      }
      const sub = gitSubcommand(words, k)
      // 子指令是變數（S=push; git $S origin HEAD:staging）時看不出是不是 push，一律擋（自行 review 發現；舊 hook 也漏）。
      if (sub >= 0 && words[sub].dynamic) block('git subcommands must be literal (no $VAR or $(…)), so the merge guard can tell whether this is a push.')
      // 只有 git 的子指令是 push 才算 push：git stash push -m … 曾被當成 push 擋下（舊 hook 也是）。
      // 子指令讀不出來或不是認得的 git 指令（可能是使用者自訂的 alias）時，後面出現 push 字樣就照 push 檢查，寧可多擋。
      const unknown = sub < 0 || !KNOWN_GIT.has(words[sub].value)
      const pushAt = sub >= 0 && words[sub].value === 'push' ? sub
        : unknown ? words.findIndex((item, index) => index > k && !item.dynamic && item.value === 'push') : -1
      if (pushAt > 0) checkPush(words, k, pushAt, found, ctx)
      // 使用者設定裡既有的 alias（git p = push）看不到定義：不認得的子指令帶著 staging／main 當目的地就擋，寧可多擋。
      else if (unknown && sub >= 0 && words.slice(sub + 1).some(item => isProtectedRef(item.value.split(':').pop()!.replace(/^\+/, '')))) {
        block(`"git ${words[sub].value}" is not a built-in git command (maybe an alias for push) and names staging/main; use ${EXPLICIT_PUSH} for pushes.`)
      }
    }
    // GIT_CONFIG_KEY_n／GIT_CONFIG_PARAMETERS 可以從環境變數塞進 alias 或 remote.*.push（等同 git -c），不論寫在 git 前面還是 export。
    if (/^GIT_CONFIG_(PARAMETERS|KEY_\d+)=/.test(word.value) && (word.dynamic || /alias\.|\.push\b|push\.default|include(if)?\./i.test(word.value))) {
      block('agents may not set git aliases or push mappings through GIT_CONFIG_* environment variables.')
    }
  }
}

// git 的子指令位置（跳過 -C dir、-c k=v、--git-dir dir 這類會吃掉下一個字的全域選項）；找不到回傳 -1。
const GIT_VALUE_OPTIONS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--attr-source'])
const KNOWN_GIT = new Set(['add', 'am', 'apply', 'archive', 'bisect', 'blame', 'branch', 'bundle', 'cat-file', 'check-ignore', 'checkout', 'cherry', 'cherry-pick', 'clean', 'clone', 'commit', 'config', 'count-objects', 'describe', 'diff', 'diff-tree', 'fetch', 'for-each-ref', 'format-patch', 'fsck', 'gc', 'grep', 'hash-object', 'help', 'init', 'log', 'ls-files', 'ls-remote', 'ls-tree', 'merge', 'merge-base', 'mv', 'name-rev', 'notes', 'pull', 'push', 'range-diff', 'rebase', 'reflog', 'remote', 'reset', 'restore', 'rev-list', 'rev-parse', 'revert', 'rm', 'shortlog', 'show', 'show-ref', 'sparse-checkout', 'stash', 'status', 'submodule', 'switch', 'symbolic-ref', 'tag', 'update-index', 'update-ref', 'read-tree', 'write-tree', 'commit-tree', 'show-branch', 'mergetool', 'difftool', 'rerere', 'maintenance', 'prune', 'repack', 'verify-commit', 'check-ref-format', 'interpret-trailers', 'var', 'version', 'whatchanged', 'worktree'])
export function gitSubcommand(words: Word[], gitIndex: number): number {
  for (let index = gitIndex + 1; index < words.length; index += 1) {
    const value = words[index].value
    if (GIT_VALUE_OPTIONS.has(value)) { index += 1; continue }
    if (value.startsWith('-')) continue
    return index
  }
  return -1
}

// xargs／parallel 會把 stdin 的內容補成 gh 的參數：補在子指令（echo pr merge 1 | xargs gh、xargs -I{} gh pr {} 1，#1090 暫代審查），
// 或補在最後（echo "1 --add-label <豁免>" | xargs gh pr edit）。hook 看不到 stdin，所以這裡只放行唯讀的子指令，
// 且子指令本身不能是取代字串；常見的 `… | xargs -I{} gh pr view {}` 照樣能用。
const XARGS_READ_ONLY: Record<string, ReadonlySet<string>> = {
  pr: new Set(['view', 'list', 'checks', 'diff', 'status']),
  issue: new Set(['view', 'list', 'status']),
  run: new Set(['view', 'list', 'watch']),
  workflow: new Set(['view', 'list']),
}
function checkXargsGh(words: Word[], ghIndex: number) {
  const before = words.slice(argvStart(words), ghIndex)
  if (!before.some(word => ['xargs', 'parallel'].includes(basename(word.value)))) return
  const rest = words.slice(ghIndex + 1)
  const positions = ghPositionals(rest)
  const top = rest[positions[0]]
  const sub = rest[positions[1]]
  // 取代字串：xargs -I X／-IX／-J X／--replace=X（-i、--replace 預設 {}），parallel 用 {} 系列。
  const tokens = ['{']
  before.forEach((item, index) => {
    if (['-I', '-J'].includes(item.value) && before[index + 1]) tokens.push(before[index + 1].value)
    const glued = /^(?:-I|-J|--replace=)(.+)$/.exec(item.value)
    if (glued) tokens.push(glued[1])
  })
  const placeholder = (word: Word | undefined) => !word || word.dynamic || tokens.some(token => word.value.includes(token))
  // 取代模式（xargs -I／-J／--replace，或 parallel 用了 {}）不會在結尾追加參數，只把取代字串換掉。
  // gh api 的取代字串只出現在 endpoint、又沒有任何寫入用的選項時，就只是一次 GET（重播歷史指令：…/comments/{}/reactions）。
  const replaceMode = before.some(item => /^(-I|-J|--replace|-i$)/.test(item.value)) ||
    (before.some(item => basename(item.value) === 'parallel') && rest.some(item => item.value.includes('{')))
  if (replaceMode && top?.value === 'api' && !top.dynamic && sub) {
    const writes = rest.some(item => /^(-X|--method|-f|-F|--field|--raw-field|--input)/.test(item.value))
    if (!writes && !rest.some(item => item !== sub && placeholder(item))) return
  }
  if (placeholder(top) || placeholder(sub) || !XARGS_READ_ONLY[top!.value]?.has(sub!.value)) {
    block(`under xargs/parallel only read-only gh commands (${Object.entries(XARGS_READ_ONLY).map(([name, subs]) => `${name} ${[...subs].join('/')}`).join('; ')}) may run, written out on the command line, because the rest of the arguments come from stdin.`)
  }
}

// git 的 alias 可以是任意 shell 指令（git -c 'alias.m=!gh pr merge 1' m），remote.*.push 會改寫 push 的目的地，
// 用 -c 或 git config 設定這兩種東西都擋（#1090 暫代審查）。讀設定（--get、--list）不受影響。
function checkGitConfig(args: Word[]) {
  // include.path／includeIf 會載入另一個設定檔，裡面可以有 remote.*.push（#1109 自行 review 用暫存 repo 驗證過）。
  const risky = (key: string) => /^(alias\.|remote\..+\.push$|push\.default$|include(if)?\.)/i.test(key)
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index].value
    const option = value === '-c' ? args[index + 1]?.value ?? '' : /^-c./.test(value) ? value.slice(2) : value.startsWith('--config-env=') ? value.slice(13) : null
    if (option !== null && (risky(option.split('=')[0]) || /[$`]/.test(option.split('=')[0]))) {
      block('agents may not set git aliases or push mappings with -c (an alias can run any shell command, a push mapping can retarget staging).')
    }
    if (value === 'config') {
      const rest = args.slice(index + 1)
      const reads = rest.some(word => /^(--get(-all|-regexp|-urlmatch)?|--list|-l|--show-origin|--name-only)$/.test(word.value))
      const key = rest.find(word => !word.value.startsWith('-'))
      if (!reads && key && (key.dynamic || risky(key.value))) block('agents may not set git aliases or push mappings with git config; ask the user.')
      return
    }
    if (!value.startsWith('-') && option === null && args[index - 1]?.value !== '-c' && args[index - 1]?.value !== '-C') return
  }
}

const CODE_SIGNATURES: Array<[RegExp, string]> = [
  [/\bgh\b[^\n]*\bpr\b[^\n]*\bmerge\b/, MERGE_MSG],
  [BRANCH_WRITE, MERGE_MSG],
  [/pulls\/[^/\s'"]+\/merge\b|\/merges\b|git\/refs\b|merge-upstream\b/, MERGE_MSG],
  [/\bgit\b[^\n]*\bpush\b[^\n]*[\s:/+](staging|main)\b/, PUSH_MSG],
]

// 看不到最終內容的那段 shell 程式：只要文字裡有合併、push 到 staging／main、碰豁免 label 或寫 status 的痕跡就擋。
function scanCode(text: string) {
  for (const [pattern, message] of CODE_SIGNATURES) {
    if (pattern.test(text)) block(`${message} (found in shell code whose final text the merge guard cannot see: a variable command name, eval, a pipe or heredoc into a shell, or an unclosed quote)`)
  }
  if (hasWaiver(text) && /label/i.test(text)) block(WAIVER_MSG)
  if (text.includes(STATUS_CONTEXT) && /statuses|check-runs/.test(text)) block(STATUS_MSG)
}

// scripts/destructiveGuard.ts（#1214）共用同一套「哪些字串會被 shell 執行」的判斷：bash -c、eval、heredoc 餵給 shell、$(…)
// 都會往下看，看不到內容的部分放在 codeTexts。巢狀太深時回傳 null，由呼叫端決定怎麼處理。
export function scanShell(command: string): Found | null {
  const found: Found = { commands: [], topLevel: [], codeTexts: [], changesDir: false, dynamicCommand: false, configRedirect: false, top: command }
  try {
    collect(command, 0, found)
  } catch (error) {
    if (error instanceof Blocked) return null
    throw error
  }
  return found
}

export function guardCommand(command: string, ctx: GuardContext): Verdict {
  const found: Found = { commands: [], topLevel: [], codeTexts: [], changesDir: false, dynamicCommand: false, configRedirect: false, top: command }
  try {
    collect(command, 0, found)
    for (const item of found.commands) checkCommand(item, found, ctx)
    for (const text of found.codeTexts) scanCode(text)
    // 只要有名稱在執行時才決定的指令，同一串裡任何「pr … merge」都可能被轉交給 gh 執行
    // （f(){ "$@"; }; f $G pr merge 1，名稱與參數分在不同行，#1090 暫代審查），一律擋。
    if (found.dynamicCommand) {
      for (const item of found.commands) {
        const values = item.words.map(word => (word.dynamic ? '' : word.value))
        const pr = values.indexOf('pr')
        if (pr >= 0 && values.indexOf('merge', pr + 1) > pr) block(`a command whose name is decided at run time could receive these "pr … merge" arguments. ${MERGE_MSG}`)
      }
    }
  } catch (error) {
    if (error instanceof Blocked) return { allowed: false, reason: error.message }
    throw error
  }
  return { allowed: true }
}
