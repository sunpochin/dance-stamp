/* 檔案用途：驗證新移植的 Git 安全邊界。所在層：工具測試。主要關聯：stagedSafety.ts、.githooks/pre-push。 */
import { describe, expect, test } from 'bun:test'
import { containsSecret, protectedPath } from '../../scripts/stagedSafety'
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pinnedSkillAlias, publicProblems } from '../../scripts/publicSafety'

test('固定共用 skill 入口只接受對應的 repo 內實體目標', () => {
  for (const prefix of ['skills', '.agents/skills', '.codex/skills', '.claude/skills']) {
    expect(pinnedSkillAlias(`${prefix}/awm-onboarding`, 'vendor/agent-work-methods/skills/awm-onboarding')).toBe(true)
    expect(pinnedSkillAlias(`${prefix}/awm-onboarding`, 'vendor/agent-work-methods/skills/awm-debugging')).toBe(false)
    expect(pinnedSkillAlias(`${prefix}/awm-onboarding`, '../private/awm-onboarding')).toBe(false)
  }
  expect(pinnedSkillAlias('arbitrary/awm-onboarding', 'vendor/agent-work-methods/skills/awm-onboarding')).toBe(false)
})

test('公開檢查拒絕本機副本、個人識別與正式專案，保留合成範例', () => {
  // 以組合文字測試敏感格式，避免把真聯絡方式或實際專案寫進 fixture。
  expect(publicProblems('sample.md', 'person@' + 'mail.test')).toContain('non-example-email')
  expect(publicProblems('sample.md', '/Users/' + 'private-person/file')).toContain('personal-home-path')
  expect(publicProblems('sample.md', '09' + '1'.repeat(8))).toContain('phone-pattern')
  expect(publicProblems('sample.md', 'a'.repeat(20) + '.supabase.co')).toContain('hosted-project-reference')
  expect(publicProblems('vendor/legacy/source/AGENTS.md', '')).toContain('local-reference')
  expect(publicProblems('vendor/legacy/source-manifest.local.json', '')).toContain('local-reference')
  expect(publicProblems('vendor/harness/LICENSE', 'MIT License')).toEqual([])
  expect(publicProblems('sample.md', 'owner@example.com /Users/example/project')).toEqual([])
})

test('unit 入口使用明確路徑，不把 vendor 測試當成本產品測試', () => {
  // Bun 的裸字串是名稱 filter，會連 vendor 裡相同路徑都跑；./ 才表示目錄。
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  expect(pkg.scripts['test:unit']).toBe('bun --no-env-file test --isolate ./tests/unit')
})

describe('提交保護', () => {
  test('拒絕環境檔、私鑰及私人媒體，允許明確合成素材', () => {
    for (const path of ['.env', '.env.local', 'nested/.env.production', 'cert.pem', 'keys/client.p12', 'private/lesson.MOV']) expect(protectedPath(path)).toBe(true)
    for (const path of ['README.md', 'src/player.ts', 'tests/fixtures/synthetic/timecode.mp4']) expect(protectedPath(path)).toBe(false)
  })
  test('偵測密鑰格式但不把文件中提到名稱當憑證', () => {
    // 拼接假的格式而非放真憑證，避免測試本身成為秘密來源。
    expect(containsSecret('AKIA' + 'A'.repeat(16))).toBe(true)
    expect(containsSecret('ghp_' + 'x'.repeat(36))).toBe(true)
    expect(containsSecret('-----BEGIN ' + 'PRIVATE KEY-----')).toBe(true)
    expect(containsSecret('Use GITHUB_TOKEN from your environment.')).toBe(false)
  })
})
describe('push 目的地', () => {
  const push = (ref: string) => Bun.spawnSync(['sh', '.githooks/pre-push'], {
    stdin: new Blob([`refs/heads/topic ${'1'.repeat(40)} ${ref} ${'0'.repeat(40)}\n`]), stdout: 'pipe', stderr: 'pipe',
  }).exitCode
  test('拒絕 main/staging，允許任務分支', () => {
    expect(push('refs/heads/main')).toBe(1)
    expect(push('refs/heads/staging')).toBe(1)
    expect(push('refs/heads/chore/import-ai-harness')).toBe(0)
  })
})

test('真正 harness 區分 AWM 與其他來源漂移，並保留失敗護欄', () => {
  const root = resolve(import.meta.dir, '../..')
  const fixture = mkdtempSync(join(tmpdir(), 'dance-stamp-harness-'))
  // hook 會匯出原 repo 的 GIT_DIR／index；只替 fixture 子程序清除 Git 列出的本機環境，避免改到主 repo。
  const localEnv = Bun.spawnSync(['git', 'rev-parse', '--local-env-vars'], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  const env = { ...process.env }
  for (const name of localEnv.stdout.toString().trim().split('\n')) delete env[name]
  const git = (args: string[]) => Bun.spawnSync(['git', ...args], { cwd: fixture, env, stdout: 'pipe', stderr: 'pipe' })
  const run = () => Bun.spawnSync([process.execPath, '--no-env-file', 'scripts/check-harness.ts'], { cwd: fixture, env, stdout: 'pipe', stderr: 'pipe' })
  try {
    expect(localEnv.exitCode).toBe(0)
    // 複製公開追蹤內容並保留相對入口；只破壞自有合成副本，絕不改產品 vendor 再復原。
    const tracked = Bun.spawnSync(['git', 'ls-files', '-z'], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
    expect(tracked.exitCode).toBe(0)
    for (const path of tracked.stdout.toString().split('\0').filter(Boolean)) {
      const source = join(root, path), target = join(fixture, path)
      mkdirSync(dirname(target), { recursive: true })
      if (lstatSync(source).isSymbolicLink()) symlinkSync(readlinkSync(source), target)
      else copyFileSync(source, target)
    }
    expect(git(['init', '--quiet']).exitCode).toBe(0)
    expect(git(['add', '--all']).exitCode).toBe(0)
    expect(run().exitCode).toBe(0)
    const awm = JSON.parse(readFileSync(join(fixture, 'docs/ai/work-methods-lock.json'), 'utf8')).files[0].destination
    const other = JSON.parse(readFileSync(join(fixture, 'docs/ai/harness-import.json'), 'utf8')).files[0].destination
    for (const path of [awm, other]) {
      const original = readFileSync(join(fixture, path))
      writeFileSync(join(fixture, path), Buffer.concat([original, Buffer.from('\n# synthetic drift\n')]))
      const result = run()
      expect(result.exitCode).toBe(1)
      const message = result.stderr.toString()
      if (path === awm) {
        expect(message).toContain(`AWM 固定副本已改變，請回上游修正，再以升版 PR 採用已審版本（見 docs/agents/work-methods.md）：${path}`)
        expect(message).not.toContain('請記錄適配與指紋')
      } else {
        expect(message).toContain(`來源副本已改變，請記錄適配與指紋：${path}`)
        expect(message).not.toContain('請回上游修正')
      }
      writeFileSync(join(fixture, path), original)
    }
    const original = readFileSync(join(fixture, awm))
    unlinkSync(join(fixture, awm))
    const missing = run()
    expect(missing.stderr.toString()).toContain(`缺少匯入檔：${awm}`)
    expect(missing.exitCode).toBe(1)
    writeFileSync(join(fixture, awm), original)
    const extra = 'vendor/agent-work-methods/synthetic-extra.txt'
    writeFileSync(join(fixture, extra), 'synthetic extra')
    expect(git(['add', extra]).exitCode).toBe(0)
    const unexpected = run()
    expect(unexpected.stderr.toString()).toContain('共用方法副本必須完整且沒有額外追蹤檔')
    expect(unexpected.exitCode).toBe(1)
    expect(git(['rm', '--cached', extra]).exitCode).toBe(0)
    unlinkSync(join(fixture, extra))
    writeFileSync(join(fixture, 'CLAUDE.md'), 'synthetic broken entry')
    const entry = run()
    expect(entry.stderr.toString()).toContain('缺少規則入口：CLAUDE.md')
    expect(entry.exitCode).toBe(1)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
