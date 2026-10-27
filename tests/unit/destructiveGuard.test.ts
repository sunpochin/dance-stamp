/*
檔案用途：鎖住破壞性指令閘門（#1214）的判斷：每一條 deny／ask 規則至少一個正例、一個不該擋的反例，
並確認 .claude／.codex 兩份 hook 一字不差、兩邊的設定檔都有登記、ask 在 Claude 輸出權限提示而在 Codex 退成擋下、guard 不在時退回保守比對。
所在層：tests/unit；大部分直接呼叫純函式；最後幾個測試用 bash 執行兩份 hook。
主要關聯：scripts/destructiveGuard.ts、scripts/destructive-guard.ts、.claude/hooks／.codex/hooks 的 destructive-guard.sh、
.claude/settings.json、.codex/hooks.json、issue #1214。
*/
import { describe, expect, test } from 'bun:test'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { destructiveDecision } from '../../scripts/destructiveGuard'

const HOOKS = ['.claude/hooks/destructive-guard.sh', '.codex/hooks/destructive-guard.sh']
const SCRATCH = '/private/tmp/claude-501/x/scratchpad'
const REMOTE_DB = 'postgresql://postgres:pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres'

// [來源, 指令]。來源寫出規則或是重播歷史指令時看到的哪一種寫法，之後有人想放寬時看得到為什麼不行。
const DENY: Array<[string, string]> = [
  // 遠端 Supabase：重播歷史指令時 Agent 真的跑過其中大部分。
  ['db push defaults to the linked project', 'supabase db push'],
  ['history: codex db push --yes', 'supabase db push --yes'],
  ['db push --linked', 'supabase db push --linked --yes'],
  ['bunx with a pinned version', 'bunx supabase@2.109.1 db push'],
  ['remote --db-url', `npx supabase db push --db-url ${REMOTE_DB}`],
  ['db-url in a variable', 'supabase db push --db-url "$DATABASE_URL"'],
  ['db reset --linked', 'supabase db reset --linked'],
  ['link', 'supabase link --project-ref abcdefghijklmnopqrst'],
  ['db dump defaults to the linked project', 'supabase db dump -f out.sql'],
  ['history: data-only dump of production', 'supabase db dump --linked --data-only -f /tmp/x.sql'],
  ['db pull', 'supabase db pull'],
  ['history: db query --linked reading vault secrets', `supabase db query --linked --output-format json "select name from vault.decrypted_secrets"`],
  ['history: db query --linked from stdin', `printf 'select 1;' | supabase db query --linked --file /dev/stdin`],
  ['history: secrets set on a hosted project', 'supabase secrets set ADMIN_EMAIL=a@example.com --project-ref abcdefghijklmnopqrst'],
  ['history: functions deploy', 'supabase functions deploy calendar-notifier --project-ref abcdefghijklmnopqrst'],
  ['migration repair rewrites remote history', 'supabase migration repair --status applied 20261001000000'],
  ['migration up --linked', 'supabase migration up --linked'],
  ['config push', 'supabase config push'],
  ['storage rm on the hosted bucket', 'supabase storage rm ss:///bucket/x'],
  ['branches delete', 'supabase branches delete abc'],
  // psql／pg_dump 連到非本機主機。
  ['psql connection string to a hosted db', `psql "${REMOTE_DB}" -c "select 1"`],
  ['psql -h pooler', 'psql -h aws-0-ap-northeast-1.pooler.supabase.com -U postgres'],
  ['psql --host=', 'psql --host=db.abcdefghijklmnopqrst.supabase.co -c "select 1"'],
  ['psql via a literal variable', `DB="${REMOTE_DB}"; psql "$DB" -c "select 1"`],
  ['PGHOST prefix', 'PGHOST=db.abcdefghijklmnopqrst.supabase.co psql -U postgres'],
  ['pg_dump of a hosted db', 'pg_dump -h db.abcdefghijklmnopqrst.supabase.co -U postgres -f out.sql'],
  // Vercel production。
  ['vercel deploy --prod', 'vercel deploy --prod'],
  ['vercel --prod', 'vercel --prod'],
  ['npx vercel --prod', 'npx vercel --prod --yes'],
  ['--target=production', 'vercel deploy --target=production'],
  ['--target production', 'vercel deploy --target production'],
  ['promote', 'vercel promote https://x.vercel.app'],
  ['rollback', 'vercel rollback'],
  ['env rm', 'vercel env rm SECRET production'],
  ['alias set', 'vercel alias set x.vercel.app example.com'],
  // force push：feature 分支也擋，--force-with-lease 放行（見反例）。
  ['--force', 'git push --force origin claude/x:claude/x'],
  ['-f', 'git push -f origin claude/x'],
  ['-f in a flag cluster', 'git push -uf origin claude/x:claude/x'],
  ['+refspec', 'git push origin +claude/x:claude/x'],
  ['git -C before push', 'git -C ../wt push --force origin x:x'],
  // shell 會執行的地方照樣往下看。
  ['bash -c', `bash -c 'supabase db push'`],
  ['history: backticks inside a double-quoted PR body run', 'gh pr create --title x --body "Run `supabase db push` after merge"'],
  ['$(…)', 'echo "$(vercel --prod)"'],
  ['constructed command name', 'X=supabase; $X db push'],
  ['constructed git', 'G=git; $G push -f origin x:x'],
  ['piped into a shell', `echo 'vercel deploy --prod' | bash`],
  ['eval of a variable', 'C="supabase link --project-ref x"; eval "$C"'],
  // #1220 Codex review。
  ['branches get -o env prints the service-role key', 'supabase branches get preview -o env'],
  ['rolling-release moves production traffic', 'vercel rolling-release complete --dpl abc'],
  ['rolling-release abort', 'vercel rolling-release abort --dpl abc'],
  ['vc is the same CLI', 'vc --prod'],
  ['npx vc', 'npx vc deploy --target production'],
  ['a later "help" is a deploy path, not help', 'vercel deploy --prod help'],
  ['PGHOST exported earlier', 'export PGHOST=db.abcdefghijklmnopqrst.supabase.co; psql -c "select 1"'],
  // #1220 Codex review 第 2 輪。
  ['--dbname= with a hosted URI', `psql --dbname=${REMOTE_DB} -c "select 1"`],
  ['pg_dump --dbname=', `pg_dump --dbname=${REMOTE_DB} -f out.sql`],
  ['attached -d URI', `psql -d${REMOTE_DB}`],
  ['redirects promote', 'vercel redirects promote ver_abc'],
  ['dropdb on a hosted host', 'dropdb -h db.example.com patient_data'],
  // 自行 review（第 3 輪前）：選項的其他寫法。
  ['--prod=true', 'vercel deploy --prod=true'],
  // 暫代審查（無脈絡子 agent，第 3 輪前）。
  ['test db against a hosted db-url', `supabase test db --db-url postgresql://postgres:pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres`],
  ['test db --linked', 'supabase test db --linked'],
  ['seed buckets --linked', 'supabase seed buckets --linked'],
  ['inspect --linked reads query stats', 'supabase inspect db outliers --linked'],
  ['--linked=true', 'supabase db query --linked=true "select 1"'],
  ['npx -p package then the command', 'npx -p supabase supabase db push'],
  ['env PGHOST', 'env PGHOST=db.abcdefghijklmnopqrst.supabase.co psql -c "select 1"'],
  ['sudo PGHOST', 'sudo PGHOST=db.abcdefghijklmnopqrst.supabase.co pg_dump -U postgres -f out.sql'],
  ['PGHOSTADDR', 'PGHOSTADDR=52.68.3.1 psql -U postgres'],
  ['libpq hostaddr=', 'psql "hostaddr=52.68.3.1 port=5432 user=postgres dbname=postgres"'],
  ['libpq host with spaces', 'psql "dbname=postgres user=postgres host = db.abcdefghijklmnopqrst.supabase.co"'],
  ['URI with host in the query', 'psql "postgresql:///postgres?host=db.abcdefghijklmnopqrst.supabase.co&user=postgres"'],
  ['multi-host URI', 'psql "postgresql://postgres@127.0.0.1,db.abcdefghijklmnopqrst.supabase.co/postgres"'],
  // #1220 Codex review 第 3 輪。
  ['PGDATABASE as a connection string', 'PGDATABASE=postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co/postgres psql -c "select 1"'],
  ['exported PGDATABASE', 'export PGDATABASE=postgresql://postgres@db.abcdefghijklmnopqrst.supabase.co/postgres; psql -c "select 1"'],
  ['vercel name in a variable', 'V=vercel; "$V" env rm SECRET production'],
  ['supabase name in a variable', 'S=supabase; "$S" branches delete preview'],
  ['unresolved name with a managed group', '"$SB" branches delete preview'],
  ['bootstrap creates a hosted project', 'supabase bootstrap nextjs --yes'],
  // #1220 Codex review 第 4 輪（停損後，只修影響類）。
  ['vercel firewall attack mode', 'vercel firewall attack-mode enable'],
  ['vercel firewall rules add', 'vercel firewall rules add --name x'],
  ['--project before env rm', 'vercel --project care-ops env rm SECRET production'],
  ['--project before promote', 'vercel --project care-ops promote dpl_123'],
  ['psql over ssh', 'ssh prod.example.com psql -h localhost -c "select * from patients"'],
  ['psql in kubectl exec', 'kubectl exec prod-db -- psql -h localhost -c "select 1"'],
]

const ASK: Array<[string, string]> = [
  ['rm -rf in the repo', 'rm -rf src'],
  ['rm -r without -f behaves the same non-interactively', 'rm -r docs'],
  ['-fr', 'rm -fr ./supabase'],
  ['-Rf outside the repo', 'rm -Rf ~/.claude/skills/x'],
  ['long options', 'rm --recursive --force build-output'],
  ['targets from stdin', 'find . -name x | xargs rm -rf'],
  ['find -exec', 'find . -type d -name x -exec rm -rf {} +'],
  ['an unknown variable', 'rm -rf "$DIR"'],
  ['the temp root itself', 'rm -rf "$TMPDIR"'],
  ['.. out of the temp dir', 'rm -rf $TMPDIR/../x'],
  ['cd somewhere else first', 'cd src && rm -rf lib'],
  ['cd into temp, then back out', 'cd "$TMPDIR" && cd - && rm -rf lib'],
  ['rm of .env', 'rm .env'],
  ['rm -f of .env.local', 'rm -f .env.local'],
  ['git reset --hard', 'git reset --hard'],
  ['history: reset to staging', 'git fetch origin staging -q; git reset -q --hard origin/staging'],
  ['git -C reset', 'git -C ../x reset --hard'],
  ['git clean -fd', 'git clean -fd'],
  ['git clean -fdx', 'git clean -fdx'],
  ['git clean -xdf', 'git clean -xdf'],
  ['psql drop table', 'psql -h 127.0.0.1 -p 54322 -U postgres -c "drop table public.x"'],
  ['psql truncate', 'psql -c "TRUNCATE public.blood_pressure_records"'],
  ['psql heredoc', "psql <<'SQL'\ndrop schema public cascade;\nSQL"],
  ['SQL piped into psql', 'echo "drop table x;" | psql'],
  ['psql inside docker', 'docker exec -i supabase_db psql -U postgres -c "truncate table x"'],
  ['local supabase db query', 'supabase db query "drop table x"'],
  ['db reset of the shared local db', 'supabase db reset'],
  ['db reset --local in the repo', 'supabase db reset --local'],
  ['db reset on the default port', 'supabase db reset --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres'],
  ['redirect over .env', 'echo X=1 > .env'],
  ['heredoc into .env.local', "cat > .env.local <<'EOF'\nX=1\nEOF"],
  ['append to .env', 'echo X=1 >> .env'],
  ['cp over .env', 'cp .env.example .env'],
  ['restoring a backup over .env', 'mv /tmp/bak/.env .'],
  ['history: moving .env out of the repo', 'mv .env .env.local $TMPDIR/envbak/'],
  ['history: copying .env between worktrees', 'cp ../a/.env ../b/.env'],
  ['tee', 'printf x | tee .env'],
  ['sed -i', `sed -i '' 's/a/b/' .env`],
  ['vercel env pull', 'vercel env pull'],
  ['vercel env pull to a file', 'vercel env pull .env.local'],
  ['piped into a shell', `echo 'rm -rf src' | bash`],
  ['bash -c', `bash -c 'git reset --hard'`],
  // #1220 Codex review。
  ['psql to an unresolved connection string', 'psql "$DATABASE_URL" -c "select * from patients"'],
  ['cd may fail before ;', 'cd /tmp/does-not-exist; rm -rf src'],
  ['rm runs only when cd failed', 'cd /tmp/does-not-exist || rm -rf src'],
  ['the && chain broke before rm', 'cd "$TMPDIR" && mkdir x; rm -rf src'],
  ['TMPDIR reassigned to the repo', 'TMPDIR=.; rm -rf "$TMPDIR/src"'],
  ['TMPDIR reassigned to an absolute path', 'TMPDIR=/workspace/jia-jian-log; rm -rf "$TMPDIR/src"'],
  ['a later assignment does not justify an earlier rm', 'rm -rf "$D"; D=/tmp/x'],
  ['a prefix assignment is not used for expansion', 'D=/tmp/x rm -rf "$D"'],
  ['a conditional assignment may not have run', 'test -d x && D=/tmp/x; rm -rf "$D"'],
  ['sed --in-place=SUFFIX', "sed --in-place=.bak 's/x/y/' .env"],
  ['SQL in a resolved variable', 'SQL="drop table public.x"; psql -h localhost -c "$SQL"'],
  ['SQL in an unresolved variable', 'supabase db query --local "$SQL"'],
  ['mv -t', 'mv -t /tmp .env'],
  ['mv --target-directory=', 'mv --target-directory=backup .env'],
  ['cp -t', 'cp -t backup .env'],
  ['redirect into a variable naming .env', 'F=.env; echo SECRET=x > "$F"'],
  ['cp into a variable naming .env.local', 'F=.env.local; cp .env.example "$F"'],
  ['rm of a variable naming .env', 'F=.env; rm "$F"'],
  // #1220 Codex review 第 2 輪。
  ['assignment inside an if that never runs', 'if false; then D=/tmp/x; fi; rm -rf "$D"'],
  ['assignment inside a subshell', '(D=/tmp/x); rm -rf "$D"'],
  ['assignment inside a command substitution', 'echo "$(D=/tmp/x)"; rm -rf "$D"'],
  ['assignment inside a loop', 'for x in a; do D=/tmp/x; done; rm -rf "$D"'],
  ['assignment in a pipeline', 'D=/tmp/x | cat; rm -rf "$D"'],
  ['rebuildable name after cd elsewhere', 'cd /srv/important && rm -rf dist'],
  ['node_modules in another repo', 'cd ../another-repo && rm -rf node_modules'],
  ['pushd elsewhere', 'pushd /backup && rm -rf coverage'],
  ['local dropdb', 'dropdb patient_data'],
  ['unlink .env', 'unlink .env'],
  ['pg_restore --clean', 'pg_restore --clean -h localhost -d app backup.dump'],
  ['pg_restore -c', 'pg_restore -c -d app backup.dump'],
  ['--dbname with an unresolved variable', 'psql --dbname="$DATABASE_URL" -c "select 1"'],
  ['block comment between keywords', 'psql -h localhost -c "drop/**/table public.x"'],
  ['comment with text', 'psql -h localhost -c "drop /* cleanup */ table public.x"'],
  ['truncate with a comment', 'psql -h localhost -c "truncate/*cleanup*/public.x"'],
  // 自行 review（第 3 輪前）：git 接受的長選項縮寫與設定覆寫、共用 /tmp 的萬用字元、rsync 覆寫 .env。
  ['git reset --har', 'git reset --har HEAD'],
  ['git clean --forc', 'git clean --forc -d'],
  ['git clean without -f when requireForce is off', 'git -c clean.requireForce=false clean -d'],
  ['wildcard over the shared /tmp', 'rm -rf /tmp/*'],
  ['wildcard over /var/folders', 'rm -rf /var/folders/*'],
  ['rsync over .env', 'rsync -a backup/.env .env'],
  // 暫代審查（無脈絡子 agent，第 3 輪前）。
  ['$TMPDIR is shared between sessions', 'rm -rf "$TMPDIR"/*'],
  ['unset variable as the first temp segment', 'rm -rf "/tmp/$REPLAY_DIR"'],
  ['unset variable under /private/tmp', 'rm -rf "/private/tmp/$D"'],
  ['unset variable under TMPDIR', 'rm -rf "$TMPDIR/$REPLAY_DIR"'],
  ['env glob copy into a worktree', 'cp ../../../.env* .'],
  ['env glob delete', 'rm -f .env*'],
  ['env brace rename', 'mv .env{,.bak}'],
  ['SQL piped into a shell is still read', `echo 'rm -rf src' | bash; N=$((N+1))`],
  // #1220 Codex review 第 3 輪：路徑中間的變數也要展開。
  ['variable naming .env in the middle of a path', 'F=.env; echo X > "./$F"'],
  ['.. hidden in a variable under /tmp', 'D=../..; rm -rf "/tmp/work/$D/workspace/jia-jian-log/src"'],
  ['unresolved variable deeper under /tmp', 'rm -rf "/tmp/work/$D/src"'],
  // #1220 Codex review 第 4 輪。
  ['libpq service connection', 'psql "service=production" -c "select 1"'],
  ['--dbname=service', 'psql --dbname="service=production" -c "select 1"'],
  ['dd over .env', 'dd if=.env.example of=.env'],
  ['dd over .env.production', 'dd if=x of=.env.production'],
]

const ALLOW: Array<[string, string]> = [
  // 暫存目錄與可重建的目錄。
  ['$TMPDIR subdir', 'rm -rf $TMPDIR/x'],
  ['quoted $TMPDIR subdir', 'rm -rf "$TMPDIR/replay-1"'],
  ['${TMPDIR} and /tmp paths', 'rm -rf ${TMPDIR}/a /tmp/b /private/tmp/c /var/folders/9b/x/T/db-replay-x'],
  ['mktemp dir', 'D=$(mktemp -d); rm -rf "$D"'],
  ['history: variables built from variables', `S=${SCRATCH}; R=$S/replay; rm -rf "$R"; mkdir -p $R`],
  ['history: cd into temp first', 'cd $TMPDIR && rm -rf linux-cap && mkdir linux-cap'],
  ['cd into a temp variable', `S=${SCRATCH}; cd "$S" && rm -rf supabase/.temp supabase/.branches`],
  ['rebuildable folders', 'rm -rf node_modules dist coverage ./test-results'],
  ['history: Xcode build output', 'rm -rf ios/App/build ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm'],
  ['non-recursive rm of a tracked file', 'rm -f tests/unit/zzdbg.test.ts'],
  ['history: .env inside a scratch copy', `S=${SCRATCH}; rm -f $S/base-staging/.env $S/base-staging/.env.local`],
  // git。
  ['git clean dry run', 'git clean -n'],
  ['git clean -nd', 'git clean -nd'],
  ['-n inside a force cluster is still a dry run', 'git clean -fdn'],
  ['git clean --dry-run with -fd', 'git clean --dry-run -fd'],
  ['git clean without force is a no-op', 'git clean -d'],
  ['git reset --soft', 'git reset --soft HEAD~1'],
  ['git reset a path', 'git reset HEAD src/x.ts'],
  ['git stash push is not git push', 'git stash push -m "rm -rf"'],
  ['explicit refspec push', 'git push origin claude/x:claude/x'],
  ['history: --force-with-lease', 'git push --force-with-lease origin claude/x:claude/x'],
  ['upstream push', 'git push -u origin claude/x'],
  ['deleting an own remote branch', 'git push origin --delete claude/old'],
  // 本機 Supabase 與 db-replay。
  ['db start', 'supabase db start'],
  ['start', 'supabase start'],
  ['stop a replay workdir', 'supabase stop --no-backup --workdir /var/folders/9b/x/T/db-replay-x'],
  ['history: local push with seed', 'bunx supabase@2.109.1 db push --local --include-seed'],
  ['history: push to an isolated replay port', 'supabase db push --db-url postgresql://postgres:postgres@127.0.0.1:57322/postgres'],
  ['local dump', 'supabase db dump --local -f x.sql'],
  ['db reset of a scratch copy', 'supabase db reset --workdir "$TMPDIR/replay"'],
  ['db reset on an isolated port', 'supabase db reset --db-url postgresql://postgres:postgres@127.0.0.1:58322/postgres'],
  ['history: --help never connects', 'supabase db push --help'],
  ['secrets set --help', 'supabase secrets set --help'],
  ['link --help', 'supabase link --help'],
  ['migration list', 'supabase migration list'],
  ['migration new', 'supabase migration new add_x'],
  ['migration up locally', 'supabase migration up'],
  ['local types', 'supabase gen types typescript --local'],
  ['package script: staging types (read-only)', 'bunx supabase@2.109.1 gen types typescript --project-id "$STAGING_SUPABASE_PROJECT_ID" --schema public > src/lib/database.types.ts.tmp'],
  ['functions serve', 'supabase functions serve'],
  ['secrets list', 'supabase secrets list --project-ref abcdefghijklmnopqrst'],
  ['history: functions logs', 'supabase functions logs x --project-ref abcdefghijklmnopqrst'],
  ['local db query', 'supabase db query --local "select 1"'],
  ['test db', 'supabase test db'],
  ['db:replay', 'bun run db:replay'],
  ['db:replay with tests', 'bun run db:replay --tests supabase/tests/rls-authorization.sql > $TMPDIR/r.log 2>&1'],
  // psql 連本機。
  ['history: psql to an isolated port', 'psql "postgresql://postgres:postgres@127.0.0.1:57322/postgres" -v ON_ERROR_STOP=1 -c "select 1"'],
  ['history: GRANT TRUNCATE is a privilege, not a truncate', 'DB="postgresql://postgres:postgres@127.0.0.1:59722/postgres"; psql "$DB" -q -c "GRANT TRUNCATE ON public.x TO authenticated"'],
  ['history: psql over a socket in the scratchpad', `P=${SCRATCH}; psql -h "$P/pg" -p 55439 -U postgres -c "select 1"`],
  ['psql in docker with a test file', 'docker exec -i ctr psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/tests/rls-authorization.sql'],
  ['which psql', 'which psql docker'],
  // Vercel 非 production。
  ['preview deploy', 'vercel'],
  ['vercel deploy', 'vercel deploy'],
  ['vercel ls', 'vercel ls'],
  ['vercel env ls', 'vercel env ls'],
  ['vercel --help', 'vercel --help'],
  // 只是提到這些指令的資料。
  ['commit message', 'git commit -m "docs: never run rm -rf, supabase db push, vercel --prod or git push --force"'],
  ['commit heredoc', "git commit -F - <<'EOF'\nfix: git push --force and rm -rf / are blocked; supabase db push too\nEOF"],
  ['grep for the rules', `grep -n "rm -rf\\|supabase db push\\|git reset --hard" AGENTS.md`],
  ['rg in docs', "rg -n 'vercel --prod|drop table' docs"],
  ['writing an issue draft', `cat > $TMPDIR/body.md <<'EOF'\nsupabase db push --linked and psql -c "drop table x"\nEOF`],
  // .env 的讀取、備份與範本。
  ['backup into temp', 'cp .env $TMPDIR/envbak/'],
  ['append inside temp', 'echo X=1 >> $TMPDIR/.env'],
  ['read .env.example', 'cat .env.example'],
  ['write the example', 'echo X= > .env.example'],
  ['redirect to another file', 'bun run build > $TMPDIR/build.log 2>&1'],
  ['package script that writes types', 'bun run types:generate'],
  // #1220 Codex review 修正後仍要放行的寫法。
  ['SQL variable without destructive statements', 'SQL="select 1"; psql -h localhost -c "$SQL"'],
  ['rolling-release fetch is a read', 'vercel rolling-release fetch'],
  ['backup with -t into temp', 'cp -t "$TMPDIR/bak" .env'],
  ['branches list', 'supabase branches list'],
  ['cd chain kept with &&', 'cd "$TMPDIR" && mkdir x && rm -rf x'],
  // #1220 Codex review 第 2 輪修正後仍要放行的寫法。
  ['top-level assignment before a chain', 'S=/tmp/x && mkdir -p "$S" && rm -rf "$S/out"'],
  ['pg_restore custom format is not --clean', 'pg_restore -Fc -h localhost -d app backup.dump'],
  ['which dropdb only mentions it', 'which dropdb psql'],
  ['redirects list-versions', 'vercel redirects list-versions'],
  ['git clean --dry-run abbreviated', 'git clean --dry -fd'],
  ['wildcard below a named /tmp dir', 'rm -rf /tmp/jjl-replay/*'],
  ['rsync a backup into temp', 'rsync -a .env $TMPDIR/bak/'],
  // 暫代審查：算式／[[ ]] 讓整串指令被拿去比對時，引號與 heredoc 裡的文字是資料。
  ['arithmetic next to a commit message', 'N=$((N+1)); git commit -m "docs: explain why supabase db push is denied"'],
  ['[[ -gt ]] next to rg patterns', '[[ $(git rev-list --count HEAD) -gt 0 ]] && rg -n "git push --force|vercel --prod" docs'],
  ['arithmetic loop next to grep', 'for i in 1 2 3; do echo $((i*2)); done; grep -n "rm -rf" AGENTS.md'],
  ['[[ -eq ]] next to a commit message', 'bun test --isolate; [[ $? -eq 0 ]] && git commit -m "chore: rm -rf stale fixtures"'],
  ['psql -p with an unresolved port', 'psql -p "$PGPORT" -h 127.0.0.1 -U postgres -c "select 1"'],
  ['psql -U with an unresolved user', 'psql -U "$PGUSER" -h 127.0.0.1 -p 54322 -c "select 1"'],
  ['psql -v with a variable', 'psql -v "pid=$PID" -h 127.0.0.1 -p 54322 -U postgres -f supabase/tests/x.sql'],
  ['grep for psql', 'grep -rn psql "$REPO/docs"'],
  ['rg for dropdb', 'rg -n dropdb "$(git rev-parse --show-toplevel)/docs"'],
  ['echo mentioning psql -h', 'echo psql -h db.x.supabase.co is how prod is reached'],
  ['TMPDIR with a default value', 'rm -rf "${TMPDIR:-/tmp}/replay"'],
  ['TMPDIR with the trailing slash stripped', 'rm -rf "${TMPDIR%/}/replay"'],
  ['cd into a fresh mktemp dir', 'cd "$(mktemp -d)" && rm -rf x'],
  ['pushd into TMPDIR', 'pushd "$TMPDIR" && rm -rf x'],
  ['--local=true', 'supabase db push --local=true'],
  ['local multi-host URI', 'psql "postgresql://postgres@127.0.0.1:54322/postgres" -c "select 1"'],
  // #1220 Codex review 第 3 輪：只是印出指令範例。
  ['echo npx supabase db push', 'echo npx supabase db push'],
  ["printf npx vercel --prod", "printf '%s\\n' npx vercel --prod"],
  ['resolved variable deeper under /tmp', 'D=run1; rm -rf "/tmp/work/$D/src"'],
  ['pnpm dlx still runs', 'pnpm dlx vercel ls'],
  ['$GIT rm is not vercel rm', 'GIT=$(command -v git); "$GIT" rm --cached x'],
  // #1220 Codex review 第 4 輪修正後仍要放行的寫法。
  ['grep mentioning ssh and psql', 'grep -n ssh psql notes.txt'],
  ['psql in a local docker container', 'docker exec -i supabase_db psql -U postgres -c "select 1"'],
  ['dd into temp', 'dd if=/dev/zero of=$TMPDIR/blob bs=1k count=1'],
  ['vercel --project ls', 'vercel --project care-ops ls'],
  ['psql --set is an option, not a comment', 'psql -h 127.0.0.1 --set ON_ERROR_STOP=1 -c "select 1"'],
  ['constructed curl is not a supabase command', 'CURL=$(command -v curl); $CURL -sS --max-time 20 https://example.com/db/push'],
]

describe('destructiveGuard denies remote and production commands', () => {
  for (const [source, command] of DENY) {
    test(`${source}: ${JSON.stringify(command).slice(0, 90)}`, () => {
      expect(destructiveDecision(command).decision).toBe('deny')
    })
  }
})

describe('destructiveGuard asks before AGENTS.md § 3.1 local destructive commands', () => {
  for (const [source, command] of ASK) {
    test(`${source}: ${JSON.stringify(command).slice(0, 90)}`, () => {
      expect(destructiveDecision(command).decision).toBe('ask')
    })
  }
})

describe('destructiveGuard allows everyday commands', () => {
  for (const [source, command] of ALLOW) {
    test(`${source}: ${JSON.stringify(command).slice(0, 90)}`, () => {
      expect(destructiveDecision(command)).toEqual({ decision: 'allow' })
    })
  }
})

describe('messages tell the agent what to do instead', () => {
  test('a remote command says to let the user run it', () => {
    const verdict = destructiveDecision('supabase db push')
    expect(verdict.decision === 'deny' && verdict.reason).toContain('let them run it themselves')
  })
  test('a force push points at --force-with-lease', () => {
    const verdict = destructiveDecision('git push -f origin x:x')
    expect(verdict.decision === 'deny' && verdict.reason).toContain('--force-with-lease')
  })
  test('an ask names the paths it would delete', () => {
    const verdict = destructiveDecision('rm -rf src lib')
    expect(verdict.decision === 'ask' && verdict.reason).toContain('src lib')
  })
})

const runHook = (hook: string, command: string) =>
  Bun.spawnSync(['bash', hook], { stdin: new Blob([JSON.stringify({ cwd: process.cwd(), tool_input: { command } })]), stdout: 'pipe', stderr: 'pipe' })

const askJson = (stdout: string) => JSON.parse(stdout).hookSpecificOutput as { hookEventName: string; permissionDecision: string; permissionDecisionReason: string }

describe('hook wiring', () => {
  test('both wrappers are byte-identical', () => {
    expect(readFileSync(HOOKS[0], 'utf8')).toBe(readFileSync(HOOKS[1], 'utf8'))
  })

  // Dance Stamp 沒有啟用上游 bot 合併流程；仍須各自註冊安全 hook，且不可悄悄啟用來源合併工具。
  test('Claude and Codex register only the enabled destructive guard', () => {
    const commands = (hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> }) =>
      hooks.PreToolUse.filter(entry => entry.matcher === 'Bash').flatMap(entry => entry.hooks.map(hook => hook.command))
    const claude = commands(JSON.parse(readFileSync('.claude/settings.json', 'utf8')).hooks)
    const codex = commands(JSON.parse(readFileSync('.codex/hooks.json', 'utf8')).hooks)
    for (const [list, dir] of [[claude, '.claude'], [codex, '.codex']] as const) {
      const guard = list.findIndex(command => command.includes(`${dir}/hooks/destructive-guard.sh`))
      const merge = list.findIndex(command => command.includes(`${dir}/hooks/require-codex-review-before-merge.sh`))
      expect(guard).toBe(0)
      expect(merge).toBe(-1)
      expect(list).toHaveLength(1)
    }
  })

  test('Claude: deny exits 2, ask prints a permission prompt, allow is silent', () => {
    const deny = runHook(HOOKS[0], 'vercel --prod')
    expect(deny.exitCode).toBe(2)
    expect(deny.stderr.toString()).toContain('BLOCKED:')
    const ask = runHook(HOOKS[0], 'git reset --hard')
    expect(ask.exitCode).toBe(0)
    expect(askJson(ask.stdout.toString())).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'ask' })
    expect(askJson(ask.stdout.toString()).permissionDecisionReason).toContain('git reset --hard')
    const allow = runHook(HOOKS[0], 'bun run db:replay')
    expect(allow.exitCode).toBe(0)
    expect(allow.stdout.toString()).toBe('')
  })

  // Codex 的 PreToolUse 不支援 ask：會把 hook 標成失敗、照樣執行 tool call，所以 ask 要退成擋下。
  test('Codex: ask falls back to a block because Codex hooks cannot ask', () => {
    const ask = runHook(HOOKS[1], 'git reset --hard')
    expect(ask.exitCode).toBe(2)
    expect(ask.stdout.toString()).toBe('')
    expect(ask.stderr.toString()).toContain('Codex hooks cannot show a permission prompt')
    expect(runHook(HOOKS[1], 'supabase db push').exitCode).toBe(2)
    expect(runHook(HOOKS[1], 'bun run db:replay').exitCode).toBe(0)
  })

  test('the CLI refuses to run without --agent', () => {
    const result = Bun.spawnSync(['bun', 'scripts/destructive-guard.ts'], { stdin: new Blob([JSON.stringify({ tool_input: { command: 'ls' } })]), stdout: 'pipe', stderr: 'pipe' })
    expect(result.exitCode).toBe(2)
  })

  test('without the guard file the wrappers still block remote commands and ask (or block) local destructive ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'destructive-hook-no-guard-'))
    try {
      for (const hook of HOOKS) {
        mkdirSync(join(dir, hook, '..'), { recursive: true })
        copyFileSync(hook, join(dir, hook))
      }
      const [claude, codex] = HOOKS.map(hook => join(dir, hook))
      for (const copy of [claude, codex]) {
        expect(runHook(copy, 'supabase db push').exitCode).toBe(2)
        expect(runHook(copy, 'git push --force origin x:x').exitCode).toBe(2)
        expect(runHook(copy, 'vc --prod').exitCode).toBe(2)
        // 退化時也要涵蓋每個 deny 群組（#1220 Codex review 第 2 輪）。
        expect(runHook(copy, 'supabase branches delete preview').exitCode).toBe(2)
        expect(runHook(copy, 'supabase branches get preview -o env').exitCode).toBe(2)
        expect(runHook(copy, 'vercel rolling-release complete --dpl abc').exitCode).toBe(2)
        expect(runHook(copy, 'vercel redirects promote ver_abc').exitCode).toBe(2)
        expect(runHook(copy, 'ls -la').exitCode).toBe(0)
        expect(runHook(copy, 'ls -la').stdout.toString()).toBe('')
      }
      const ask = runHook(claude, 'rm -rf src')
      expect(ask.exitCode).toBe(0)
      expect(askJson(ask.stdout.toString()).permissionDecision).toBe('ask')
      expect(runHook(codex, 'rm -rf src').exitCode).toBe(2)
      // GNU 長選項也要認得（#1220 Codex review）。
      expect(runHook(codex, 'rm --recursive --force src').exitCode).toBe(2)
      expect(runHook(codex, 'rm -f --recursive src').exitCode).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
