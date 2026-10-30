/* 檔案用途：驗證合併防護的解析與目的地判斷，所有命令皆只當資料。所在層：安全工具回歸。主要關聯：scripts/mergeGuard.ts、shellWords.ts。 */
import { expect, test } from 'bun:test'
import { guardCommand, mutationFields, scanShell, type GuardContext } from '../../scripts/mergeGuard'

// 注入合成 Git 查詢；危險字串只能送純函式，絕不可交 shell 執行。
const context = (values: Record<string, string> = {}): GuardContext => ({ cwd: '/synthetic', git: (_cwd, args) => values[args.join(' ')] ?? ({ 'rev-parse --abbrev-ref HEAD': 'topic', 'rev-parse --symbolic-full-name @{push}': 'refs/remotes/origin/topic', remote: 'origin' }[args.join(' ')] || '') })
const allowed = (command: string, ctx = context()) => guardCommand(command, ctx).allowed
const blocked = [
  'gh pr merge 7', 'gh -R example/project pr merge 7 --auto', 'gh pr merge 7 --disable-auto --squash',
  'gh custom-alias 7', 'gh "$SUB" 7', 'gh pr "$SUB" 7', 'gh alias set shortcut "pr merge"', 'gh alias import aliases.yml', 'gh repo sync',
  'gh pr edit 7 --add-label codex-review-waived', 'gh issue create -lcodex-review-waived', 'gh pr create --label=codex-review-waived',
  'gh label delete Codex-Review-Waived', 'gh label edit "$LABEL"',
  'gh api repos/example/project/pulls/7/merge', 'gh api --method=PUT repos/example/project/issues/7',
  'gh api -XPOST repos/example/project/statuses/abc -f state=success', 'gh api -X POST repos/example/project/check-runs -F name=test',
  'gh api repos/example/project/contents/file -f content=synthetic', 'gh api repos/example/project/git/refs/heads/main -X DELETE',
  'gh api repos/example/project/rulesets -F name=test', 'gh api repos/example/project/issues/7 -f labels[]=codex-review-waived',
  'gh api repos/example/project/labels/codex-review-waived -XDELETE', 'gh api repos/example/project/labels --input=labels.json',
  'gh api "$URL" -X DELETE', 'gh api repos/example/project/comments/$ID/replies -f labels=unknown', 'gh api repos/example/project/comments/$ID/replies --input=file.json',
  'gh api graphql --input query.json', 'gh api graphql -f query=@query.txt', 'gh api graphql -f query="$QUERY"', 'gh api graphql -f "$FIELD=value"',
  "gh api graphql -f 'query=mutation { mergePullRequest(input: {}) { id } }'", "gh api graphql -f 'query=mutation { unknown(input: {}) { id } }'",
  "gh api graphql -f 'query=fragment bypass on Mutation { addComment(input: {}) { id } }'",
  'curl -XPUT https://example.com/data', 'curl -K config.txt', 'curl --config=config.txt',
  'curl https://api.github.com/repos/example/project/pulls/7/merge', 'curl -d body https://api.github.com/graphql',
  'curl --json={} https://api.github.com/repos/example/project/statuses/abc', 'curl --data={} https://api.github.com/repos/example/project/contents/file',
  'curl --request=POST https://api.github.com/repos/example/project/issues/7 --data-raw={}', 'curl -d{} -H "Authorization: synthetic" "$URL"',
  'curl -X "$METHOD" https://api.github.com/endpoint', 'curl --data=codex-review-waived https://api.github.com/labels',
  'git push origin HEAD:main', 'git push origin :staging', 'git push --all origin', 'git push origin --mirror',
  "git push origin 'refs/heads/topic/*:refs/heads/*'", 'git push --receive-pack command origin topic', 'git push origin "$BRANCH"',
  'git -c alias.p=push p origin main', 'git -calias.p=push p origin main', 'git --config-env=alias.p=VALUE p origin main',
  'git config remote.origin.push HEAD:main', 'git config push.default matching', 'git config "$KEY" value',
  'GIT_CONFIG_KEY_0=remote.origin.push git push origin topic', 'GIT_CONFIG_PARAMETERS="alias.p=push" git p',
  'git send-pack origin HEAD:main', 'git http-push origin HEAD:main', 'git "$SUB" origin topic', 'git custom-alias origin main',
  'cd /synthetic && git push', '(git push)', 'git push &', 'env git push', 'git -C /synthetic push', 'git push origin HEAD --unknown=value',
  'HOME=/synthetic git push origin topic', 'git push origin HEAD topic extra',
  '$G pr merge 7', '$G push origin HEAD', '$G push', '$G pr edit 7 --add-label codex-review-waived',
  'echo pr merge 7 | xargs gh', 'echo 7 | xargs gh pr edit', 'xargs -I X gh pr X 7', 'parallel gh pr edit {}',
  "bash -c 'gh pr merge 7'", "eval 'gh pr merge 7'", "trap 'gh pr merge 7' EXIT", "alias unsafe='gh pr merge 7'",
  "env -S 'gh pr merge 7'", "env --split-string='gh pr merge 7'", "watch -n 2 'gh pr merge 7'",
  "tmux new-session 'gh pr merge 7'", "tmux send-keys 'gh pr me' rge Space 7 Enter", "flock -c 'gh pr merge 7' lock",
  "script --command='gh pr merge 7'", "su -c'gh pr merge 7'", "echo 'gh pr merge 7' | sh", "bash <<< 'gh pr merge 7'",
  "bash <<'SCRIPT'\ngh pr merge 7\nSCRIPT", "source /dev/stdin <<'SCRIPT'\ngh pr merge 7\nSCRIPT",
  "bash < <(echo 'gh pr merge 7')", "bash <(echo 'gh pr merge 7')", "source <(echo 'gh pr merge 7')",
  'bash -c "gh pr merge $ID"', 'echo "unterminated gh pr merge',
]
for (const command of blocked) test(`防護拒絕：${command}`, () => {
  const result = guardCommand(command, context())
  expect(result.allowed).toBe(false)
  if (!result.allowed) expect(result.reason.length).toBeGreaterThan(10)
})
const safe = [
  'bun run pr:merge 7', 'bun scripts/pr-merge.ts 7', 'A=1 bun pr:merge 7', 'gh', 'gh pr view 7',
  'gh pr merge 7 --disable-auto', 'gh pr merge --disable-auto 7 -R example/project', 'gh pr edit 7 --add-label follow-up', 'gh issue edit 7 --remove-label=done',
  'gh api repos/example/project/git/refs/heads/main', 'gh api repos/example/project/statuses/abc',
  'gh api --method GET --header accept:json --jq . --cache 1h repos/example/project/issues/7', 'gh api --silent',
  'gh api repos/example/project/comments/$ID/replies -f body="$BODY"', 'gh api -X PATCH repos/example/project/$ID/comments -f body="$BODY"',
  "gh api graphql --raw-field='query=query { viewer { login } }'", "gh api graphql -f 'query=mutation { reply: addComment(input: {}) { id } }' -F id=synthetic",
  'curl --url https://api.github.com/repos/example/project -H accept:json -o /synthetic/file',
  'curl -dsynthetic https://example.com/data', 'http GET https://api.github.com/repos/example/project', 'wget --post-data=synthetic https://example.com/data',
  'git push origin topic:topic', 'git push -u origin topic', 'git push', 'git push origin HEAD', 'git push origin +topic:topic',
  'git push --receive-pack command origin topic:topic', 'git stash push -m synthetic', 'git status', 'git --version',
  'git config --get remote.origin.push', 'git config --list', 'git config user.name Synthetic',
  'git -c color.ui=never status', 'git -C /synthetic status', 'git --git-dir=/synthetic status',
  'cd /synthetic && git push origin topic:topic', 'cd /synthetic && git push origin topic', '$CURL -sS https://example.com/data',
  'xargs -I{} gh pr view {}', 'xargs -J X gh issue view X', 'xargs --replace=X gh api repos/example/project/comments/X/reactions', 'parallel gh api repos/example/project/comments/{}/reactions',
  "bash -s <<'SCRIPT'\ngit status\nSCRIPT", "env -u SYNTHETIC -S 'git status'", "env -iS'git status'", "watch --interval 1 git status", "tmux send-keys 'git status' Enter",
]
for (const command of safe) test(`防護允許：${command}`, () => expect(allowed(command)).toBe(true))

test('省略目的地只相信可解析的實際 Git 設定，不能把其他 remote 的前綴猜成目前目標', () => {
  for (const values of [
    { 'rev-parse --abbrev-ref HEAD': 'main' }, { 'rev-parse --abbrev-ref HEAD': '' },
    { 'rev-parse --symbolic-full-name @{push}': 'refs/remotes/origin/main' }, { 'rev-parse --symbolic-full-name @{push}': '' },
    { 'config --get push.default': 'matching' }, { 'config --get-regexp ^remote\\..*\\.push$': 'remote.origin.push topic:main' },
  ]) expect(allowed('git push', context(values))).toBe(false)
  expect(allowed('git push origin topic', context({ 'config --get-regexp ^remote\\..*\\.push$': 'remote.origin.push topic:main' }))).toBe(false)
  expect(allowed('git push', context({ remote: 'origin origin/nested', 'rev-parse --symbolic-full-name @{push}': 'refs/remotes/origin/nested/topic' }))).toBe(false)
  expect(allowed('git push', context({ remote: 'origin/nested', 'rev-parse --symbolic-full-name @{push}': 'refs/remotes/origin/nested/topic' }))).toBe(true)
})
test('GraphQL 忽略字串與註解、識別 alias 與多 mutation，未閉合輸入一律無法判定', () => {
  expect(mutationFields('query { viewer { login } }')).toEqual([])
  expect(mutationFields('mutation M($i: Input = {body:"ignore { mutation"}) @skip(if:false) { alias: addComment(input:$i) { id } }\nmutation { addReaction(input:{}) { id } }')).toEqual(['addComment', 'addReaction'])
  expect(mutationFields('mutation # { ignored\n { addComment(input:{body:"escaped \\\" text"}) { id } }')).toEqual(['addComment'])
  expect(mutationFields('mutation { addComment(input:{body:"""block { mutation"""}) { id } }')).toEqual(['addComment'])
  for (const text of ['mutation', 'mutation { addComment { id }', 'mutation { x(body:"unfinished)', 'mutation { x(body:"line\nbreak") }', 'mutation { x(body:"""unfinished)']) expect(mutationFields(text)).toBeNull()
})
test('shell 過深時拒絕解析，未知 Git 查詢錯誤往上傳遞而非誤判允許', () => {
  let nested = 'git status'
  for (let i = 0; i < 10; i++) nested = `eval ${JSON.stringify(nested)}`
  expect(scanShell(nested)).toBeNull(); expect(allowed(nested)).toBe(false)
  expect(scanShell('git status')?.commands).toHaveLength(1)
  expect(() => allowed('git push', { cwd: '/synthetic', git() { throw new Error('synthetic query failure') } })).toThrow('query failure')
})
