/*
檔案用途：破壞性指令閘門的判斷（#1214）——把 AGENTS.md § 3.1「未經使用者明確同意，絕不執行」的清單，加上指向遠端 Supabase 專案與
Vercel production 的指令，變成機械規則：
- deny（Agent 不得執行，請使用者自己在終端打）：遠端 Supabase 的寫入與資料讀取（db push／pull／dump、db query --linked、link、
  secrets set、functions deploy、migration repair…）、psql／pg_dump 連到非本機主機、Vercel production（--prod、--target production、
  promote、rollback、alias…）、git push --force／-f／+refspec。
- ask（Claude 叫出權限提示由使用者當場決定；Codex 的 hook 沒有 ask，由 CLI 入口退成 deny）：rm -r／-rf（暫存目錄與可重建的產物目錄除外）、
  git reset --hard、git clean -f、psql／supabase db query 內含 drop／truncate、覆寫或刪除 .env*、本機共用資料庫的 supabase db reset。
所在層：scripts；純函式，由 scripts/destructive-guard.ts（hook 的 CLI 入口）與 tests/unit/destructiveGuard.test.ts 共用。
主要關聯：scripts/mergeGuard.ts（scanShell：同一套「哪些字串會被 shell 執行」的解析）、scripts/shellWords.ts、
.claude/hooks／.codex/hooks 的 destructive-guard.sh、AGENTS.md § 3.1、docs/agents/local-tools.md「破壞性指令閘門」、
docs/agents/claude-code-mods.md（為什麼放 settings hook 而不是 mod）。

為什麼 production 類是 deny 不是 ask：migration 由 GitHub Actions 套用、production 發布走 promotion PR（AGENTS.md § 3.2／§ 3.7），
Agent 本來就不該執行這些指令；ask 會把「要不要破例」丟給可能半夜被提示吵醒的使用者。重播歷史指令時看到 Agent 真的跑過
`supabase secrets set --project-ref <兩個環境>`、`supabase db push --yes`，以及用 `supabase db query --linked` 讀 vault.decrypted_secrets
與含真人 email 的資料（2026-10-07 重播 19,472 條指令）。
為什麼 force push 連 feature 分支也擋：PR 分支上可能有 Codex Auto-fix 或其他 session 推上去的 commit，--force 會無聲蓋掉；
--force-with-lease 只在遠端沒有你沒看過的 commit 時才覆寫，重播的歷史裡 Agent 的 force push 全部都用它，所以放行它、擋其他寫法。
合併閘門（mergeGuard.ts）已經擋 staging／main 的任何 push，這裡不重複。

這個 hook 防的是 Agent 順手執行，不是刻意繞過：寫進腳本檔再執行、用 python／node 呼叫、`bun run <script>` 裡藏的指令都看不到。
*/
import { argvStart, basename, gitSubcommand, inCommandPosition, isAssignment, scanShell } from './mergeGuard'
import type { Command, Word } from './shellWords'

export type Decision = { decision: 'allow' } | { decision: 'ask' | 'deny'; reason: string }

type Findings = { deny: string[]; ask: string[] }

const TO_USER = 'Agents may not run this: tell the user what you wanted to run and why, and let them run it themselves (docs/agents/local-tools.md, "破壞性指令閘門").'

// 本機資料庫的主機名稱；Unix socket 路徑（/tmp、/var/run/postgresql）也是本機。
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'host.docker.internal', ''])
// supabase start 的預設資料庫埠：本機共用的開發資料庫，不是 db-replay 的隔離副本。
const SHARED_LOCAL_DB_PORT = '54322'
// 刪掉也能重建的產物目錄（相對於 repo 根目錄的路徑前綴）。ios 這兩個是 Xcode 產生、沒有進版控的目錄（重播歷史指令：清 git status 時常刪）。
const REBUILDABLE = ['node_modules', 'dist', 'coverage', 'test-results', 'playwright-report', '.vite', 'ios/App/build', 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm']
// 會把後面的字當成套件指令執行：npx supabase、bunx supabase@2.109.1、pnpm dlx vercel。
const RUNNERS = new Set(['npx', 'bunx', 'pnpx', 'dlx'])
// TRUNCATE 後面接 ON 是權限名稱（GRANT TRUNCATE ON …，重播歷史指令時的誤問）。
const DESTRUCTIVE_SQL = /\b(drop\s+(table|schema|database|owned)\b|truncate\s+(table\s+)?(only\s+)?(?!on\b)[\w."]+)/i

// 指令名稱：去掉路徑與 bunx 的版本（supabase@2.109.1）。
const commandName = (value: string) => basename(value).replace(/^(.+)@[^@/]*$/, '$1')

function inRunnerPosition(words: Word[], k: number): boolean {
  let j = k - 1
  while (j >= 0 && words[j].value.startsWith('-')) j -= 1
  if (j < 0 || words[j].dynamic) return false
  const before = words[j].value
  // runner 本身也要真的被執行：echo npx supabase db push 只是印出文字（#1220 Codex review 第 3 輪）。
  if (RUNNERS.has(basename(before)) && before !== 'dlx') return inCommandPosition(words, j)
  const parent = basename(words[j - 1]?.value ?? '')
  if ((before === 'x' && parent === 'bun') || (before === 'exec' && ['npm', 'pnpm', 'yarn'].includes(parent)) || (before === 'dlx' && ['pnpm', 'yarn'].includes(parent))) {
    return inCommandPosition(words, j - 1)
  }
  return false
}

// --x=value 或 --x value 的值；沒有這個旗標回傳 null。
function flagValue(args: Word[], names: string[]): Word | null {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index].value
    if (names.includes(value)) return args[index + 1] ?? { value: '', raw: '', dynamic: false }
    const glued = names.find(name => name.startsWith('--') && value.startsWith(`${name}=`))
    if (glued) return { ...args[index], value: value.slice(glued.length + 1) }
  }
  return null
}

// 位置參數（跳過旗標與會吃掉下一個字的旗標的值）。
function positionals(args: Word[], valueFlags: ReadonlySet<string>): Word[] {
  const result: Word[] = []
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index].value
    if (value === '--') return [...result, ...args.slice(index + 1)]
    if (valueFlags.has(value)) { index += 1; continue }
    if (value.startsWith('-')) continue
    result.push(args[index])
  }
  return result
}

// 值裡的變數先用同一串指令裡看得到的賦值展開（F=.env; echo x > "$F"，#1220 Codex review）；展不開就看字面的檔名。
const isEnvFile = (word: Word, vars: Vars) => {
  const value = word.dynamic ? resolvePath(word.value, vars) ?? word.value : word.value
  const name = basename(value.replace(/\/+$/, ''))
  // 沒加引號的萬用字元或大括號會展開成 .env、.env.local（cp ../../../.env* .、mv .env{,.bak}，暫代審查）。
  if (word.dynamic && /^\.env[*?[{.]/.test(name) && /[*?[{]/.test(name)) return true
  return /^\.env(\.[\w-]+)*$/.test(name) && !/\.(example|sample|template|dist)$/.test(name)
}

// ---------- 路徑：哪些 rm -r 目標可以直接刪 ----------

// 賦值照執行順序記錄（S=/tmp/x、R=$S/replay、D=$(mktemp -d)）：rm -rf "$S/out" 常見，看得到值就判斷得出是不是暫存目錄。
// 只採信一定會先執行的單獨賦值（#1220 Codex review）：前綴賦值（D=x rm "$D"）展開時用的還是舊值、也不會留下來；
// 接在 || 後面的賦值可能沒執行，記成不知道；接在 && 後面的賦值只在同一條 && 鏈裡可信（echo x && S=/tmp/y && rm -rf "$S/z"），
// 鏈斷掉（; || 換行）之後就不知道它有沒有執行。之後的賦值不會回頭影響前面的指令。值開頭的 $NAME 留到 resolvePath 再展開。
type Vars = Map<string, string | null>
// cwdTemp：前面一定成功的 cd 是不是進了暫存目錄（cd "$TMPDIR" && rm -rf x 很常見）；previous：上一條指令後面的分隔符號；
// visibleRm：看得到的遞迴 rm 有幾條，給 scanCode 用。
// chained：在 && 鏈裡賦值的名稱，鏈斷掉時改成不知道。
// leftRepo：前面有 cd／pushd 到暫存目錄以外的地方，相對路徑不再是 repo 根目錄底下。
type Context = { vars: Vars; cwdTemp: boolean; leftRepo: boolean; previous: string | null; chained: Set<string>; visibleRm: number }
// 代表「暫存目錄」的標記：$TMPDIR 的實際值看不到，展開後以這個開頭。真實路徑不會以 < 開頭；不含 $，才不會被當成展不開的變數。
const TEMP = '<TMPDIR>'
// unknown：這條指令不保證在目前這個 shell 執行（if／迴圈／case／{ } 裡、括號 subshell、管線），
// 賦值的名稱改成「不知道」，不採信它的值（#1220 Codex review 第 2 輪）。
function recordAssignments(command: Command, ctx: Context, unknown: boolean) {
  const words = command.words
  const a = argvStart(words)
  const declared = ['export', 'local', 'declare', 'typeset', 'readonly'].includes(words[a]?.value ?? '')
  const items = a === words.length ? words : declared ? words.slice(a + 1) : []
  for (const word of items) {
    if (!isAssignment(word)) continue
    const eq = word.value.indexOf('=')
    const name = word.value.slice(0, eq).replace(/\+$/, '')
    const value = word.value.slice(eq + 1)
    // mktemp -d 建的是暫存目錄底下的新目錄，不是暫存目錄本身。
    const resolved = /^\$\(\s*mktemp\b/.test(value) ? `${TEMP}/mktemp` : value
    ctx.vars.set(name, unknown || ctx.previous === '||' || /\+=$/.test(word.value.slice(0, eq + 1)) ? null : resolved)
    if (ctx.previous === '&&') ctx.chained.add(name)
  }
}

// 把值裡每一個 $NAME／${NAME} 換成同一串指令裡看得到的值；有任何一個展不開就回傳 null（不知道）。
// 不只開頭：./$F、/tmp/work/$D/… 中間的變數也可能是 .env 或 ..（#1220 Codex review 第 3 輪）。
// $(mktemp …) 是新的暫存目錄；${TMPDIR:-/tmp}、${TMPDIR%/} 只改預設值或去尾斜線，值仍是 TMPDIR（重播＋暫代審查）。
// 其他展開（$(cmd)、$1、$@）留在結果裡，由呼叫端當成看不到的部分處理。
const PATH_VARIABLE = /\$\(\s*mktemp\b[^)]*\)|\$(?:\{([A-Za-z_]\w*)(?:(?::?[-=])[^}]*|%\/)?\}|([A-Za-z_]\w*))/g
function resolvePath(value: string, vars: Vars, seen: ReadonlySet<string> = new Set()): string | null {
  let unknown = false
  const resolved = value.replace(PATH_VARIABLE, (match: string, braced?: string, plain?: string) => {
    if (match.startsWith('$(')) return `${TEMP}/mktemp`
    const name = (braced ?? plain)!
    // 指令裡自己改了 TMPDIR（TMPDIR=.; rm -rf "$TMPDIR/src"）就照它的值判斷（#1220 Codex review）。
    if (name === 'TMPDIR' && !vars.has('TMPDIR')) return TEMP
    const known = vars.get(name)
    const inner = known === undefined || known === null || seen.has(name) ? null : resolvePath(known, vars, new Set([...seen, name]))
    if (inner === null) { unknown = true; return match }
    return inner
  })
  return unknown ? null : resolved
}

const TEMP_ROOT = /^(<TMPDIR>|\/tmp|\/private\/tmp|\/var\/folders|\/private\/var\/folders)(\/+|$)/

// 在暫存目錄裡（allowRoot：暫存目錄本身也算，給 cd 用）。
function inTemp(value: string, vars: Vars, allowRoot: boolean): boolean {
  const path = resolvePath(value, vars)
  if (path === null || path.split('/').includes('..') || /\$[^$]|`/.test(path.replaceAll('$$', ''))) return false
  const root = TEMP_ROOT.exec(path)
  if (root === null) return false
  const rest = path.slice(root[0].length).replace(/\/+$/, '')
  if (allowRoot) return true
  // 暫存根目錄底下的第一層必須是寫明的名稱：/tmp、/var/folders 是共用的，$TMPDIR 在沙盒裡也是同一個使用者所有 session 共用
  // （/tmp/claude-501），"$TMPDIR"/* 或 /tmp/* 會刪到別的 session 的東西；第一層是沒展開的變數（"/tmp/$X"）時，
  // Claude Code 每次 Bash 呼叫不保留變數，X 是空的就變成刪整個暫存根目錄（暫代審查）。
  const first = rest.split('/')[0] ?? ''
  // $$（PID）不會是空的，不算（S=$TMPDIR/dryrun.$$，重播歷史指令）。
  if (/[*?[{$`]/.test(first.replaceAll('$$', ''))) return false
  return rest !== ''
}

function isDisposable(word: Word, ctx: Context): boolean {
  if (inTemp(word.value, ctx.vars, false)) return true
  const path = word.value
  if (word.dynamic || path.startsWith('/') || path.startsWith('~') || path.split('/').includes('..')) return false
  if (ctx.cwdTemp) return true
  // 可重建目錄是相對於 repo 根目錄的名稱；cd／pushd 到別處之後的 dist、node_modules 不一定能重建（#1220 Codex review 第 2 輪）。
  if (ctx.leftRepo) return false
  const relative = path.replace(/^(\.\/)+/, '').replace(/\/+$/, '')
  return REBUILDABLE.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`))
}

// ---------- 各指令的規則 ----------

function checkRm(args: Word[], ctx: Context, out: Findings) {
  let recursive = false
  let options = true
  const targets: Word[] = []
  for (const word of args) {
    const value = word.value
    if (options && value === '--') { options = false; continue }
    if (options && value.startsWith('--')) { if (value === '--recursive') recursive = true; continue }
    if (options && /^-[A-Za-z]+$/.test(value)) { if (/[rR]/.test(value)) recursive = true; continue }
    targets.push(word)
  }
  // 暫存副本裡的 .env（scratchpad 的 base-staging/.env）不是受保護的那份。
  const env = targets.filter(word => isEnvFile(word, ctx.vars) && !isDisposable(word, ctx))
  if (env.length) out.ask.push(`rm deletes ${env.map(word => word.raw).join(' ')}, a protected .env file (AGENTS.md § 3.1)`)
  if (recursive) ctx.visibleRm += 1
  // 非互動 shell 裡 rm -r 不會逐一詢問，等同 rm -rf，所以只要是遞迴刪除就算。
  // 沒有寫出目標（xargs rm -rf、find … | xargs rm -r）：要刪什麼來自 stdin，看不到。
  const unsafe = recursive ? (targets.length ? targets.filter(word => !env.includes(word) && !isDisposable(word, ctx)) : [{ value: '', raw: '<paths from stdin>', dynamic: true }]) : []
  if (unsafe.length) out.ask.push(`rm -r/-rf on ${unsafe.map(word => word.raw).join(' ')} (only paths under $TMPDIR, /tmp, mktemp dirs and rebuildable folders like node_modules/dist are exempt)`)
}

function checkGit(words: Word[], k: number, out: Findings) {
  const sub = gitSubcommand(words, k)
  if (sub < 0 || words[sub].dynamic) return
  const args = words.slice(sub + 1)
  const shortFlag = (letter: string) => args.some(word => /^-[A-Za-z]+$/.test(word.value) && word.value.includes(letter))
  const name = words[sub].value
  // git 接受不會混淆的長選項縮寫（--har＝--hard、--forc＝--force、--dry＝--dry-run），照縮寫規則比對。
  const longOption = (full: string, min: number) => args.some(word => word.value.startsWith('--') && word.value.length >= 2 + min && full.startsWith(word.value.slice(2)))
  // git -c clean.requireForce=false clean -d 不用 -f 也會刪。
  const noForceNeeded = words.slice(k + 1, sub).some(word => /^(-c)?clean\.requireforce=(false|no|off|0)$/i.test(word.value))
  if (name === 'reset' && longOption('hard', 2)) {
    out.ask.push('git reset --hard discards uncommitted work (AGENTS.md § 3.1)')
  } else if (name === 'clean' && (shortFlag('f') || longOption('force', 1) || noForceNeeded) && !shortFlag('n') && !longOption('dry-run', 1)) {
    out.ask.push('git clean -f deletes untracked files for good; run `git clean -n` first to see the list (AGENTS.md § 3.1)')
  } else if (name === 'push') {
    const forced = args.some(word => word.value === '--force' || (/^-[A-Za-z]+$/.test(word.value) && word.value.includes('f')))
    const plusRefspec = args.some(word => !word.value.startsWith('-') && word.value.startsWith('+'))
    if (forced || plusRefspec) {
      out.deny.push(`git push ${forced ? '--force/-f' : 'with a +refspec'} can silently overwrite commits that someone else (Codex Auto-fix, another session) pushed to the branch. Use \`git push --force-with-lease origin <branch>:<branch>\` instead; if the lease fails, fetch and look before retrying.`)
    }
  }
}

const SUPABASE_VALUE_FLAGS = new Set(['--workdir', '--profile', '-o', '--output', '--output-format', '--dns-resolver', '--network-id', '--db-url', '--project-ref', '--project-id', '-p', '--password', '-s', '--schema', '-f', '--file', '--env-file', '--import-map', '--status', '-x', '--exclude', '--level', '--fail-on', '--name', '--region', '--org-id', '--size'])
// 管理 API 類的指令群組：只放行讀取。
const SUPABASE_MANAGEMENT = new Set(['projects', 'branches', 'backups', 'postgres-config', 'domains', 'vanity-subdomains', 'ssl-enforcement', 'network-restrictions', 'network-bans', 'sso', 'encryption', 'orgs', 'snippets', 'config', 'secrets', 'functions', 'storage'])
const SUPABASE_READS = new Set(['list', 'ls', 'get', 'show', 'serve', 'new', 'download', 'logs', 'check-availability', 'help'])

function isLocalDbUrl(word: Word): boolean {
  if (word.dynamic) return false
  try {
    const url = new URL(word.value)
    return LOCAL_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

function checkSupabase(args: Word[], ctx: Context, out: Findings) {
  const [group, action] = positionals(args, SUPABASE_VALUE_FLAGS).map(word => (word.dynamic ? '$' : word.value))
  // --help 只印說明，不連線（重播歷史指令：查 db push／secrets set 用法的指令佔了 deny 誤擋的大半）。
  if (!group || group === 'help' || args.some(word => word.value === '--help' || word.value === '-h')) return
  const dbUrl = flagValue(args, ['--db-url'])
  // cobra 也接受 --linked=true／--local=1 這類寫法；=false 才算沒開（暫代審查）。
  const has = (flag: string) => args.some(word => ['', '=true', '=1', '=yes'].some(suffix => word.value.toLowerCase() === flag + suffix))
  const local = has('--local') || (dbUrl !== null && isLocalDbUrl(dbUrl))
  const remote = has('--linked') || (dbUrl !== null && !isLocalDbUrl(dbUrl)) || flagValue(args, ['--project-ref']) !== null
  const deny = (what: string) => out.deny.push(`\`supabase ${[group, action].filter(Boolean).join(' ')}\` ${what}. Migrations reach staging/production only through GitHub Actions, and remote reads can expose real health data or secrets. ${TO_USER}`)
  if (group === '$' || (action === '$' && ['db', 'migration', ...SUPABASE_MANAGEMENT].includes(group))) {
    out.ask.push('a supabase subcommand built at run time, so the guard cannot tell whether it targets a remote project')
    return
  }
  if (group === 'link') return deny('points this checkout at a hosted Supabase project')
  // bootstrap 會建 hosted 專案、link、推 migration，並把 SUPABASE_SERVICE_ROLE_KEY 寫進 .env（#1220 Codex review 第 3 輪）。
  if (group === 'bootstrap') return deny('creates a hosted project, pushes migrations and writes its service-role key into .env')
  // 其他群組指向遠端（test db --linked 會在 hosted 資料庫跑 SQL、seed buckets --linked 寫 hosted storage、
  // inspect db --linked 會讀到 pg_stat_statements 裡的查詢內容）：只放行讀 schema 的 gen types（暫代審查）。
  if (remote && !['db', 'migration', 'gen', ...SUPABASE_MANAGEMENT].includes(group)) return deny('runs against a hosted project')
  if (group === 'db') {
    if (['push', 'pull', 'dump'].includes(action ?? '') && !local) return deny('targets the linked hosted project unless --local or a localhost --db-url is given')
    if (['query', 'reset'].includes(action ?? '') && remote) return deny('runs against a hosted project')
    if (action === 'reset') {
      // db-replay 與手寫的隔離重播用 --workdir <暫存副本> 或自己的埠位；只有本機共用的開發資料庫要問。
      const workdir = flagValue(args, ['--workdir'])
      const isolated = (workdir !== null && inTemp(workdir.value, ctx.vars, false)) || (dbUrl !== null && isLocalDbUrl(dbUrl) && new URL(dbUrl.value).port !== SHARED_LOCAL_DB_PORT)
      if (!isolated) out.ask.push('supabase db reset wipes the shared local development database (AGENTS.md § 3.1); isolated replays should use `bun run db:replay`')
    }
    return
  }
  if (group === 'migration') {
    if (['repair', 'squash'].includes(action ?? '') && !local) return deny('rewrites the migration history of the linked hosted project unless --local is given')
    if (['up', 'down'].includes(action ?? '') && remote) return deny('applies migrations to a hosted project')
    if (action === 'down') out.ask.push('supabase migration down resets the local database to an earlier version')
    return
  }
  // branches get -o env 會印出 SERVICE_ROLE_KEY／JWT_SECRET（#1220 Codex review）：分支只放行 list。
  if (group === 'branches' && action && action !== 'list') return deny('prints secrets of or changes a hosted preview branch (`branches get -o env` prints the service-role key)')
  if (SUPABASE_MANAGEMENT.has(group) && action && !SUPABASE_READS.has(action) && !(group === 'storage' && local)) {
    return deny('changes a hosted project (deploys, secrets, config, storage, branches or settings)')
  }
}

// --project 是全域的專案選擇器，可以寫在子指令前面（vercel --project x env rm …，#1220 Codex review 第 4 輪）。
const VERCEL_VALUE_FLAGS = new Set(['--token', '-t', '--scope', '-S', '--cwd', '--project', '--target', '-e', '--env', '-b', '--build-env', '-m', '--meta', '-A', '--local-config', '-Q', '--global-config', '-T', '--team', '--archive', '--regions', '--environment'])
// 只放行讀取子指令的 Vercel 群組。
// firewall 會直接改 production 的防火牆規則、Attack Mode 與系統防護（#1220 Codex review 第 4 輪）。
const VERCEL_MANAGED = ['env', 'alias', 'domains', 'dns', 'certs', 'project', 'projects', 'rolling-release', 'redirects', 'firewall']
const VERCEL_SUB_READS = new Set(['ls', 'list', 'list-versions', 'inspect', 'get', 'help', 'fetch'])

function checkVercel(args: Word[], out: Findings) {
  const deny = (what: string) => out.deny.push(`${what} changes the production site. Production releases go through the staging → main promotion PR (AGENTS.md § 3.7). ${TO_USER}`)
  const [command, sub] = positionals(args, VERCEL_VALUE_FLAGS).map(word => (word.dynamic ? '$' : word.value))
  // 只有開頭的 help 子指令或 -h／--help 旗標才是看說明；後面的 help 可能是部署路徑（vercel deploy --prod help，#1220 Codex review）。
  if (command === 'help' || args.some(word => word.value === '--help' || word.value === '-h')) return
  const target = flagValue(args, ['--target', '--environment'])
  if (args.some(word => /^--prod(uction)?(=|$)/.test(word.value)) || target?.value === 'production' || target?.dynamic) return deny('`vercel --prod` / `--target production`')
  if (!command) return
  if (['promote', 'rollback', 'redeploy', 'remove', 'rm'].includes(command) || command === '$') return deny(`\`vercel ${command}\``)
  if (command === 'env' && sub === 'pull') return void out.ask.push('vercel env pull overwrites a local .env file (AGENTS.md § 3.1)')
  if (command === 'pull') return void out.ask.push('vercel pull writes .env files with secrets under .vercel/ (AGENTS.md § 3.1)')
  if (VERCEL_MANAGED.includes(command) && sub && !VERCEL_SUB_READS.has(sub)) deny(`\`vercel ${command} ${sub}\``)
}

// psql／pg_dump／pg_restore／dropdb 連到哪台主機：-h、--host、連線字串（URI 或 libpq 的 key=value）、PGHOST／PGHOSTADDR。
// 看不出來的回傳 null。值是同一串指令裡賦值過的變數（DB=postgresql://127.0.0.1:59722/postgres; psql "$DB"）時先展開。
// 各工具會吃值的選項不同（psql -t 是開關、pg_dump -t 吃表名），要分開列才數得出哪個字是連線字串（暫代審查：-p "$PGPORT" 被當成連線字串）。
const PG_VALUE_FLAGS: Record<string, ReadonlySet<string>> = {
  psql: new Set(['-c', '--command', '-f', '--file', '-h', '--host', '-p', '--port', '-U', '--username', '-v', '--set', '--variable', '-o', '--output', '-L', '--log-file', '-P', '--pset', '-R', '--record-separator', '-F', '--field-separator', '-T', '--table-attr']),
  pg_dump: new Set(['-f', '--file', '-h', '--host', '-p', '--port', '-U', '--username', '-n', '--schema', '-N', '--exclude-schema', '-t', '--table', '-T', '--exclude-table', '-Z', '--compress', '-j', '--jobs', '-E', '--encoding', '-F', '--format', '--role']),
  pg_dumpall: new Set(['-f', '--file', '-h', '--host', '-p', '--port', '-U', '--username', '-l', '--database', '--role']),
  pg_restore: new Set(['-f', '--file', '-h', '--host', '-p', '--port', '-U', '--username', '-n', '--schema', '-N', '--exclude-schema', '-t', '--table', '-T', '--trigger', '-I', '--index', '-P', '--function', '-L', '--use-list', '-j', '--jobs', '-F', '--format', '-S', '--superuser', '--role']),
  dropdb: new Set(['-h', '--host', '-p', '--port', '-U', '--username', '--maintenance-db']),
}

// 連線字串裡的主機：URI（postgresql://u@h1,h2:5432/db?host=…）或 libpq key=value（host = x、hostaddr=1.2.3.4，可用逗號列多台）。
// 不是連線字串（只是資料庫名稱）回傳 []。
// service=<名稱>（或 URI 的 ?service=）的連線參數在 pg_service.conf 裡，主機看不到，記成 null（#1220 Codex review 第 4 輪）。
function conninfoHosts(text: string): Array<string | null> {
  const hosts: Array<string | null> = []
  const uri = /^postgres(?:ql)?:\/\/(?:[^@/?]*@)?([^/?]*)/i.exec(text)
  if (uri) {
    hosts.push(...uri[1].split(',').map(item => item.replace(/^\[|\](:\d+)?$|:\d+$/g, '')))
    const query = text.split('?')[1] ?? ''
    for (const pair of query.split('&')) {
      const [key, value] = pair.split('=')
      if (['host', 'hostaddr'].includes((key ?? '').toLowerCase())) hosts.push(...decodeURIComponent(value ?? '').split(','))
      if ((key ?? '').toLowerCase() === 'service') hosts.push(null)
    }
    return hosts
  }
  for (const match of text.matchAll(/(?:^|\s)(host|hostaddr)\s*=\s*(?:'([^']*)'|(\S+))/gi)) hosts.push(...(match[2] ?? match[3] ?? '').split(','))
  if (/(?:^|\s)service\s*=/i.test(text)) hosts.push(null)
  return hosts
}

function databaseHosts(words: Word[], index: number, vars: Vars): Array<string | null> {
  const hosts: Array<string | null> = []
  const name = commandName(words[index].value)
  const valueFlags = PG_VALUE_FLAGS[name] ?? new Set<string>()
  const args = words.slice(index + 1)
  const literal = (word: Word) => (word.dynamic ? resolvePath(word.value, vars) : word.value)
  const known = (text: string | null) => (text === null || /[$`]/.test(text) ? null : text)
  // 前面已經 export／賦值過的 PGHOST／PGHOSTADDR 也算；寫在指令前面的也算，包括 env／sudo 後面的（env PGHOST=x psql，暫代審查）。
  for (const key of ['PGHOST', 'PGHOSTADDR']) if (vars.has(key)) hosts.push(known(vars.get(key) ?? null))
  for (const word of words.slice(0, index)) {
    const env = /^(PGHOST|PGHOSTADDR)=/.exec(word.value)
    if (env) hosts.push(known(literal(word))?.slice(env[0].length) ?? null)
    if (/^PGSERVICE=/.test(word.value)) hosts.push(null)
  }
  // 連線字串候選：-d／--dbname 的值，以及第一個位置參數（psql 的 dbname 位置）。
  const candidates: Word[] = []
  let positional = false
  for (let j = 0; j < args.length; j += 1) {
    const word = args[j]
    const value = word.value
    const attached = /^(--dbname=|-d)(.+)$/.exec(value)
    if (attached) { candidates.push({ ...word, value: attached[2] }); continue }
    if (value === '-d' || value === '--dbname') { if (args[j + 1]) candidates.push(args[j + 1]); j += 1; continue }
    if (value === '-h' || value === '--host') { hosts.push(args[j + 1] ? known(literal(args[j + 1])) : null); j += 1; continue }
    if (/^-h./.test(value)) { hosts.push(known(literal({ ...word, value: value.slice(2) }))); continue }
    if (value.startsWith('--host=')) { hosts.push(known(literal({ ...word, value: value.slice(7) }))); continue }
    if (valueFlags.has(value)) { j += 1; continue }
    if (value.startsWith('-')) continue
    if (!positional) { positional = true; candidates.push(word) }
  }
  // 寫明 -h 127.0.0.1 這類本機主機時，展不開的位置參數多半是資料庫名稱或轉傳的參數（ps_() { psql -h 127.0.0.1 … "$@"; }，重播歷史指令）。
  const explicitLocal = hosts.some(host => host !== null && (LOCAL_HOSTS.has(host) || host.startsWith('/') || host.startsWith(TEMP)))
  // PGDATABASE 與 dbname 同義，可以是整個連線字串（PGDATABASE=postgresql://…@remote/db psql，#1220 Codex review 第 3 輪）。
  const fromEnv: Array<string | null> = []
  if (vars.has('PGDATABASE')) fromEnv.push(vars.get('PGDATABASE') ?? null)
  for (const word of words.slice(0, index)) if (/^PGDATABASE=/.test(word.value)) fromEnv.push(literal(word)?.slice(11) ?? null)
  for (const text of fromEnv) {
    const value = known(text === null ? null : resolvePath(text, vars))
    if (value === null) { if (!explicitLocal) hosts.push(null) }
    else hosts.push(...conninfoHosts(value))
  }
  for (const word of candidates) {
    const value = known(literal(word))
    // 展不開的變數（psql "$DATABASE_URL"）可能就是 staging／production 的連線字串。
    if (value === null) { if (!explicitLocal) hosts.push(null) }
    else hosts.push(...conninfoHosts(value))
  }
  return hosts
}

function checkDatabaseClient(command: Command, index: number, ctx: Context, out: Findings) {
  const words = command.words
  const name = commandName(words[index].value)
  const hosts = databaseHosts(words, index, ctx.vars)
  // 以 / 開頭（或展開成暫存目錄）的主機是 Unix socket 目錄，也是本機（psql -h "$P/pg"，重播歷史指令時的誤擋）。
  const remote = hosts.filter((host): host is string => host !== null && !LOCAL_HOSTS.has(host) && !host.startsWith('/') && !host.startsWith(TEMP))
  if (remote.length) {
    out.deny.push(`${name} connects to ${remote.join(', ')}, which is not a local database. Hosted staging/production databases hold real health data and are changed only by GitHub Actions. ${TO_USER}`)
    return
  }
  // 連線目標是展不開的變數（psql "$DATABASE_URL"）：可能就是 staging／production 的連線字串，要使用者確認（#1220 Codex review）。
  // 用 ask 而不是 deny：同一個寫法也常拿來連本機的隔離重播；Codex 那邊 ask 本來就等於擋下。
  if (hosts.includes(null)) out.ask.push(`${name} connects to a database given by a variable the guard cannot resolve, which may be a hosted staging/production database`)
  const args = words.slice(index + 1)
  // dropdb 等於 DROP DATABASE；pg_restore --clean／-c 會先 DROP 要還原的物件（#1220 Codex review 第 2 輪）。本機也要問。
  // 走到這裡的 dropdb 都是真的被執行（判斷在 checkCommand）。
  if (name === 'dropdb') out.ask.push('dropdb drops a whole database (AGENTS.md § 3.1)')
  if (name === 'pg_restore' && args.some(word => word.value === '--clean' || (/^-[acCelOsvxwW1]+$/.test(word.value) && word.value.includes('c')))) {
    out.ask.push('pg_restore --clean drops existing objects before restoring (AGENTS.md § 3.1)')
  }
  if (name !== 'psql') return
  const sqlArgs = args.flatMap((word, j) => (['-c', '--command'].includes(word.value) && args[j + 1] ? [args[j + 1]] : word.value.startsWith('--command=') ? [{ ...word, value: word.value.slice(10) }] : /^-c./.test(word.value) ? [{ ...word, value: word.value.slice(2) }] : []))
  checkSql(command, 'psql', sqlArgs, ctx, out)
}

// sqlArgs：真的會送到資料庫的 SQL 字詞（psql -c 的值、supabase db query 的位置參數）。是變數時先展開同一串指令裡的賦值；
// 展不開就問，因為看不到要執行什麼（SQL="drop table x"; psql -c "$SQL"，#1220 Codex review）。
function checkSql(command: Command, who: string, sqlArgs: Word[], ctx: Context, out: Findings) {
  // 單引號裡的 $$（DO $$ … $$）是 SQL 的 dollar quoting，不是變數：只有含展開的字詞才需要展開。
  const resolved = sqlArgs.map(word => (word.dynamic ? resolvePath(word.value, ctx.vars) : word.value))
  const unresolved = sqlArgs.some((word, index) => word.dynamic && (resolved[index] === null || /\$[A-Za-z_{(]|`/.test(resolved[index]!)))
  // SQL 註解在 PostgreSQL 解析前就換成空白（drop/**/table、truncate/*x*/t，#1220 Codex review 第 2 輪），比對前先拿掉。
  // -- 行註解只在 SQL 本身（-c 的值、heredoc）裡拿掉：指令原文裡的 --set 之類是選項，不能當註解刪掉後面的字。
  const sql = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
  const blockOnly = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const texts = [blockOnly(command.raw), ...resolved.filter((text): text is string => text !== null).map(sql), ...command.heredocs.map(doc => sql(doc.body)), ...command.herestrings.map(word => sql(word.value)), ...command.upstream.map(item => blockOnly(item.raw))]
  const hit = texts.map(text => DESTRUCTIVE_SQL.exec(text)).find(Boolean)
  if (hit) out.ask.push(`${who} runs "${hit[0]}" (AGENTS.md § 3.1)`)
  else if (unresolved) out.ask.push(`${who} runs SQL from a variable the guard cannot resolve`)
}

// cp／mv／install／ln 寫到 .env*，或把 .env* 搬／複製到暫存目錄以外的地方（cp bak/.env . 等於覆寫）。
// 寫進暫存目錄（備份 .env、暫存副本裡的 .env）不算。
// -t／--target-directory 把目的地寫在選項裡，其餘位置參數全是來源（mv -t /tmp .env，#1220 Codex review）。
function checkCopy(name: string, args: Word[], ctx: Context, out: Findings) {
  const paths = positionals(args, new Set(['-t', '--target-directory', '-S', '--suffix', '-m', '--mode', '-o', '--owner', '-g', '--group']))
  const glued = args.find(word => /^-t./.test(word.value) && !word.value.startsWith('--'))
  const target = flagValue(args, ['-t', '--target-directory']) ?? (glued ? { ...glued, value: glued.value.slice(2) } : null)
  // .env* 或 .env{,.bak} 會展開成好幾個參數，數不出哪個是目的地：有就問（暫代審查）。
  const expanding = paths.filter(word => word.dynamic && /[*?[{]/.test(word.value) && isEnvFile(word, ctx.vars) && !isDisposable(word, ctx))
  if (expanding.length) {
    out.ask.push(`${name} ${paths.map(word => word.raw).join(' ')} expands a pattern over protected .env files (AGENTS.md § 3.1)`)
    return
  }
  if (target ? paths.length < 1 : paths.length < 2) return
  const destination = target ?? paths[paths.length - 1]
  const sources = target ? paths : paths.slice(0, -1)
  const protectedSource = sources.some(word => isEnvFile(word, ctx.vars) && !isDisposable(word, ctx))
  if ((isEnvFile(destination, ctx.vars) && !isDisposable(destination, ctx)) || (protectedSource && name === 'mv') || (sources.some(word => isEnvFile(word, ctx.vars)) && !isDisposable(destination, ctx))) {
    out.ask.push(`${name} ${paths.map(word => word.raw).join(' ')} overwrites or moves a protected .env file (AGENTS.md § 3.1)`)
  }
}

// 指令名稱是執行時才決定的（X=supabase; $X db push、$GIT push -f）：參數長得像 supabase／vercel／git push 的危險寫法就照它們判斷。
// 名稱本身看不到，所以只看參數；$CURL -sS …、"$P/bin/pg_ctl" -D … 這類參數不會命中。
function checkConstructed(args: Word[], ctx: Context, out: Findings) {
  const first = positionals(args, SUPABASE_VALUE_FLAGS)[0]?.value
  if (['db', 'link', 'migration', 'bootstrap', 'test', 'seed', 'inspect', ...SUPABASE_MANAGEMENT].includes(first ?? '')) checkSupabase(args, ctx, out)
  if (args.some(word => /^--prod(uction)?(=|$)/.test(word.value)) || ['promote', 'rollback', 'redeploy', ...VERCEL_MANAGED].includes(first ?? '')) checkVercel(args, out)
  const push = args.findIndex(word => !word.dynamic && word.value === 'push')
  if (push >= 0) checkGit([{ value: 'git', raw: 'git', dynamic: false }, ...args], 0, out)
}

function checkCommand(command: Command, ctx: Context, out: Findings) {
  const words = command.words
  const protectedEnv = (items: Word[]) => items.filter(item => isEnvFile(item, ctx.vars) && !isDisposable(item, ctx))
  for (const output of command.outputs) {
    if (protectedEnv([output.target]).length) out.ask.push(`the redirection ${output.op} ${output.target.raw} overwrites a protected .env file (AGENTS.md § 3.1)`)
  }
  for (let k = 0; k < words.length; k += 1) {
    const word = words[k]
    let name: string
    if (word.dynamic) {
      if (isAssignment(word) || !inCommandPosition(words, k)) continue
      // V=vercel; "$V" env rm …：名稱看得到就照真正的指令判斷（#1220 Codex review 第 3 輪）。
      const resolved = resolvePath(word.value, ctx.vars)
      if (resolved === null || /[$`*?[{]/.test(resolved)) { checkConstructed(words.slice(k + 1), ctx, out); continue }
      name = commandName(resolved)
    } else name = commandName(word.value)
    // 資料庫用戶端除了指令位置，也認得 docker exec <容器> psql、kubectl exec … psql、ssh host psql 這種「在別處執行」的寫法；
    // grep -rn psql、echo psql -h … 只是提到名稱，不算（暫代審查：原本在任何位置都算，搜尋文件會被誤問）。
    const runs = inCommandPosition(words, k) || inRunnerPosition(words, k)
    if (['psql', 'pg_dump', 'pg_dumpall', 'pg_restore', 'dropdb'].includes(name)) {
      const before = words.slice(argvStart(words), k).map(item => basename(item.value))
      // ssh、kubectl／oc exec 裡跑的 psql，它的 localhost 是遠端那台機器或 pod，可能就是 production（#1220 Codex review 第 4 輪）。
      // ssh／kubectl 本身要在指令位置（grep -n ssh psql 不算）。
      const executor = (tool: string) => words.some((item, index) => index < k && !item.dynamic && basename(item.value) === tool && inCommandPosition(words, index))
      if (executor('ssh') || ((executor('kubectl') || executor('oc')) && before.includes('exec'))) {
        out.deny.push(`${name} runs on a remote machine or pod through ssh/kubectl exec, so even "localhost" there may be a hosted staging/production database. ${TO_USER}`)
      } else if (runs || before.includes('exec')) checkDatabaseClient(command, k, ctx, out)
      continue
    }
    if (!runs) continue
    // npx -p supabase supabase db push：-p 的值是套件名稱，真正的指令是下一個同名的字。
    const args = words[k + 1] && !words[k + 1].dynamic && commandName(words[k + 1].value) === name ? words.slice(k + 2) : words.slice(k + 1)
    // 只追蹤「cd 進暫存目錄」：之後相對路徑的 rm -rf 刪的是暫存目錄裡的東西。cd 到其他地方（或 cd -、pushd）就不再採信。
    // 只有後面接 && 的 cd 才保證成功後才往下跑；cd /tmp/x; rm -rf src 在 cd 失敗時會刪到 repo（#1220 Codex review）。
    // 這個狀態在下一個不是 && 的分隔符號就清掉（見 destructiveDecision）。
    if (['cd', 'pushd', 'popd', 'chdir'].includes(name)) {
      ctx.cwdTemp = ['cd', 'pushd'].includes(name) && args.length === 1 && command.next === '&&' && inTemp(args[0].value, ctx.vars, true)
      ctx.leftRepo = true
    }
    else if (name === 'rm') checkRm(args, ctx, out)
    else if (name === 'git') checkGit(words, k, out)
    else if (name === 'supabase') {
      checkSupabase(args, ctx, out)
      const [group, action] = positionals(args, SUPABASE_VALUE_FLAGS)
      if (group?.value === 'db' && action?.value === 'query') checkSql(command, 'supabase db query', positionals(args, SUPABASE_VALUE_FLAGS).slice(2), ctx, out)
    } else if (name === 'vercel' || name === 'vc') checkVercel(args, out)
    else if (['cp', 'mv', 'install', 'ln', 'rsync'].includes(name)) checkCopy(name, args, ctx, out)
    else if (name === 'unlink') {
      const env = protectedEnv(args)
      if (env.length) out.ask.push(`unlink deletes ${env.map(item => item.raw).join(' ')}, a protected .env file (AGENTS.md § 3.1)`)
    }
    else if (name === 'dd') {
      // dd of=.env 會覆寫（預設先截斷）目的地（#1220 Codex review 第 4 輪）。
      const env = protectedEnv(args.filter(item => item.value.startsWith('of=')).map(item => ({ ...item, value: item.value.slice(3) })))
      if (env.length) out.ask.push(`dd ${env.map(item => `of=${item.value}`).join(' ')} overwrites a protected .env file (AGENTS.md § 3.1)`)
    } else if (name === 'tee' || name === 'truncate') {
      const env = protectedEnv(args)
      if (env.length) out.ask.push(`${name} writes ${env.map(item => item.raw).join(' ')}, a protected .env file (AGENTS.md § 3.1)`)
    } else if ((name === 'sed' || name === 'perl') && args.some(item => /^-[A-Za-z]*i/.test(item.value) || item.value.startsWith('--in-place'))) {
      const env = protectedEnv(args)
      if (env.length) out.ask.push(`${name} -i edits ${env.map(item => item.raw).join(' ')}, a protected .env file (AGENTS.md § 3.1)`)
    }
  }
}

// 看不到最終內容的 shell 程式（指令名稱是變數、eval 變數、管線餵進 shell、引號沒收尾）：整段文字比對，寧可多問。
const DENY_SIGNATURES: Array<[RegExp, string]> = [
  [/\bsupabase(@[\w.-]+)?\s+(link\b|db\s+(push|pull|dump)\b(?![^\n|;&]*--(local|help))|db\s+query\b[^\n|;&]*--linked|secrets\s+(set|unset)\b|functions\s+(deploy|delete)\b|branches\s+(get|create|delete|update|pause|unpause|disable)\b)/, 'a remote Supabase command'],
  [/\b(vercel|vc)\b[^\n|;&]*(\s--prod\b|--target[= ]production\b|\s(promote|rollback)\b|rolling-release\s+(configure|start|approve|complete|abort)\b|redirects\s+promote\b)/, 'a Vercel production command'],
  [/\bgit\b[^\n|;&]*\bpush\b[^\n|;&]*(\s(-f|--force)(\s|$)|\s\+[^\s+])/, 'a forced git push'],
]
const RM_SIGNATURE = /(^|[\s;&|('"`])rm\s+(-[^\s]*\s+)*(-[A-Za-z]*[rR]|--recursive)/g
const ASK_SIGNATURES: Array<[RegExp, string]> = [
  [/\bgit\b[^\n|;&]*\breset\b[^\n|;&]*--hard\b/, 'git reset --hard'],
  [/\bgit\b[^\n|;&]*\bclean\b[^\n|;&]*\s-[A-Za-z]*f/, 'git clean -f'],
  [/\b(psql|supabase)\b[\s\S]*\b(drop\s+(table|schema|database)\b|truncate\s+(table\s+)?(only\s+)?(?!on\b)[\w."]+)/i, 'destructive SQL'],
  [/>\s*["']?[^\s"'|;&]*\.env(\.[\w-]+)*["']?(\s|$|;)/, 'a write to a .env file'],
]
// 會把字串或 stdin 當成 shell 程式執行的指令（與 mergeGuard 的 sinks 對應）。
const SHELL_SINKS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish', 'csh', 'tcsh', 'eval', 'source', '.', 'tmux', 'watch', 'trap', 'alias', 'script', 'flock', 'su', 'runuser', 'parallel'])

function scanCode(text: string, ctx: Context, out: Findings) {
  const where = 'in shell code whose final text the guard cannot see (a variable command name, eval, a pipe or heredoc into a shell, or an unclosed quote)'
  for (const [pattern, what] of DENY_SIGNATURES) if (pattern.test(text)) out.deny.push(`this looks like ${what} ${where}. ${TO_USER}`)
  for (const [pattern, what] of ASK_SIGNATURES) if (pattern.test(text)) out.ask.push(`this looks like ${what} ${where}`)
  // 整串指令被拿來比對時（例如同一串裡有 "$P/bin/pg_ctl" 這種名稱是變數的指令），裡面看得到的 rm -r 已經逐條判斷過；
  // 文字裡的 rm -r 比看得到的還多，才代表有看不到的那一條（echo 'rm -rf x' | bash）。重播歷史指令時這是 ask 誤問的大宗。
  if ((text.match(RM_SIGNATURE) ?? []).length > ctx.visibleRm) out.ask.push(`this looks like rm -r/-rf ${where}`)
}

const CONTROL_OPEN = new Set(['if', 'while', 'until', 'for', 'case', 'select', '{'])
const CONTROL_CLOSE = new Set(['fi', 'done', 'esac', '}'])

export function destructiveDecision(command: string): Decision {
  const found = scanShell(command)
  if (!found) return { decision: 'ask', reason: 'this command nests shells too deeply for the destructive-command guard to read' }
  const out: Findings = { deny: [], ask: [] }
  const ctx: Context = { vars: new Map(), cwdTemp: false, leftRepo: false, previous: null, chained: new Set(), visibleRm: 0 }
  // 照執行順序走：賦值與 cd 只影響後面的指令。只有最外層、不在條件／迴圈／subshell／管線裡的賦值才採信；
  // $(…)、bash -c、heredoc 餵給 shell 等巢狀程式碼裡的賦值留不到外面，直接忽略。
  const topLevel = new Set(found.topLevel)
  let control = 0
  for (const item of found.commands) {
    checkCommand(item, ctx, out)
    if (topLevel.has(item)) {
      const first = item.words[0]?.value ?? ''
      if (CONTROL_OPEN.has(first)) control += 1
      recordAssignments(item, ctx, control > 0 || item.subshellDepth > 0 || item.next === '|' || item.next === '|&' || ctx.previous === '|' || ctx.previous === '|&')
      if (CONTROL_CLOSE.has(first)) control = Math.max(0, control - 1)
    }
    if (item.next !== '&&') {
      ctx.cwdTemp = false
      for (const name of ctx.chained) ctx.vars.set(name, null)
      ctx.chained.clear()
    }
    ctx.previous = item.next
  }
  // 合併閘門在看不到內容時把整串指令放進 codeTexts，原因有兩種：(1) 真的有程式碼餵給 shell（bash -c、eval、管線進 sh、source…），
  // 內容可能就在引號或 heredoc 裡，整段都要比對；(2) 只是有 $((x))、let、[[ -eq ]] 或名稱是變數的指令——這時看得到的指令都已逐條判斷過，
  // 引號裡與 heredoc 裡只是資料（commit 訊息、grep 的樣式），拿掉再比對（暫代審查：提到 supabase db push 的 commit 訊息被誤擋）。
  const feedsShell = found.commands.some(item => item.words.some((word, k) => !word.dynamic && SHELL_SINKS.has(basename(word.value)) && (inCommandPosition(item.words, k) || inRunnerPosition(item.words, k))))
  const dataStripped = (text: string) => {
    let stripped = text
    for (const item of found.commands) for (const doc of item.heredocs) if (doc.body) stripped = stripped.split(doc.body).join(' ')
    return stripped.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
  }
  for (const text of found.codeTexts) scanCode(text === found.top && !feedsShell ? dataStripped(text) : text, ctx, out)
  if (out.deny.length) return { decision: 'deny', reason: out.deny[0] }
  if (out.ask.length) return { decision: 'ask', reason: [...new Set(out.ask)].join('; ') }
  return { decision: 'allow' }
}
