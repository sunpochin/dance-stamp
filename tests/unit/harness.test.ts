/* 檔案用途：驗證新移植的 Git 安全邊界。所在層：工具測試。主要關聯：stagedSafety.ts、.githooks/pre-push。 */
import { describe, expect, test } from 'bun:test'
import { containsSecret, protectedPath } from '../../scripts/stagedSafety'
import { readFileSync } from 'node:fs'
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
