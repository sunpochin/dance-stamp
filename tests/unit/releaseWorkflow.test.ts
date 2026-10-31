/* 檔案用途：防止版本整理流程意外自動公開發布或取得額外權限。所在層：發布設定回歸。主要關聯：release-please.yml、release-please-config.json。 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

test('版本準備限 main 手動操作，PR 與 Release 草稿分階段且不公開發布', () => {
  const workflow = Bun.YAML.parse(read('.github/workflows/release-please.yml')) as any
  const config = JSON.parse(read('release-please-config.json'))
  const job = workflow.jobs['release-please']
  // 不只看草稿字樣；事件、階段與實際 action 參數共同決定是否會提前發布。
  expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
  expect(workflow.on.workflow_dispatch.inputs.phase.default).toBe('prepare')
  expect(workflow.on.workflow_dispatch.inputs.phase.options).toEqual(['prepare', 'draft'])
  expect(job.if).toBe("github.repository == 'sunpochin/dance-stamp' && github.ref == 'refs/heads/main'")
  expect(workflow.permissions).toEqual({})
  expect(job.permissions).toEqual({ contents: 'write', 'pull-requests': 'write', issues: 'write' })
  expect(job.steps).toHaveLength(1)
  expect(job.steps[0].uses).toMatch(/^googleapis\/release-please-action@[a-f0-9]{40}$/)
  expect(job.steps[0].with).toEqual({
    token: '${{ secrets.GITHUB_TOKEN }}',
    'target-branch': 'main',
    'config-file': 'release-please-config.json',
    'manifest-file': '.release-please-manifest.json',
    'skip-github-release': "${{ inputs.phase != 'draft' }}",
    'skip-github-pull-request': "${{ inputs.phase == 'draft' }}",
  })
  expect(config.draft).toBe(true)
  expect(config['force-tag-creation'] ?? false).toBe(false)
  for (const options of Object.values(config.packages) as any[]) {
    expect(options.draft).toBeUndefined()
    expect(options['force-tag-creation']).toBeUndefined()
  }
  // bot 建 PR 不觸發一般 PR CI，必須保留同一套唯讀檢查的手動入口。
  const ci = Bun.YAML.parse(read('.github/workflows/harness-ci.yml')) as any
  expect(Object.hasOwn(ci.on, 'workflow_dispatch')).toBe(true)
  expect(ci.permissions).toEqual({ contents: 'read' })
})
