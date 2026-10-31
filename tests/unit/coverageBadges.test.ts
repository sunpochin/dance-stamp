/* 檔案用途：確保首頁 coverage 來自成功完整收據，拒絕假分數與不完整來源。所在層：CI 契約測試。主要關聯：scripts/coverage-badges.ts。 */
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCoverageBadges } from '../../scripts/coverage-badges'
import { appFiles, emptyCoverage, receipt, sourceHashes } from '../app-coverage/instrument'

const sha = 'a'.repeat(40), url = 'https://github.com/sunpochin/dance-stamp/actions/runs/123'
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'dance-badge-')), output = join(directory, 'badges')
  const map = emptyCoverage(), main = map.fileCoverageFor('web/main.js')
  main.s[Object.keys(main.s)[0]] = 1
  const report = { total: map.getCoverageSummary().toJSON(), files: Object.fromEntries(appFiles.map(path => [path, map.fileCoverageFor(path).toSummary().toJSON()])) }
  const run = { sourceHead: sha, status: 'passed', matrix: 'full', trackedChanges: false, appFiles, sourceHashes, errors: [], scenarios: [{ status: 'passed' }], cleanup: { browserClosed: true, serverStopped: true, lockRetained: false }, final: report }
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value))
  write('run.json', run); write('app.json', report); write('app-coverage.json', receipt(map.toJSON()))
  writeFileSync(join(directory, 'report.html'), '<!doctype html><title>Synthetic report</title>')
  return { directory, output, run, report, write, generate: () => createCoverageBadges(directory, output, sha, url) }
}

test('badge 沿用原始計數與百分比，保留來源及所有產品模組', () => {
  const f = fixture(); f.generate()
  for (const metric of ['lines', 'functions', 'branches'] as const) {
    const badge = JSON.parse(readFileSync(join(f.output, `${metric}.json`), 'utf8'))
    expect(badge.message).toBe(`${f.report.total[metric].pct}%`)
    expect(badge.label).toBe(`App ${metric}`)
  }
  const summary = JSON.parse(readFileSync(join(f.output, 'summary.json'), 'utf8'))
  expect(summary.sourceHead).toBe(sha); expect(summary.workflowRun).toBe(url)
  expect(Object.keys(summary.files)).toEqual(appFiles)
})

test('失敗、局部、髒來源、缺檔、錯誤提交與偽造摘要皆拒絕', () => {
  const f = fixture(), original = structuredClone(f.run)
  for (const patch of [{ status: 'failed' }, { matrix: 'selected' }, { trackedChanges: true }, { sourceHead: 'b'.repeat(40) }, { appFiles: appFiles.slice(1) }, { errors: ['failure'] }, { scenarios: [] }, { scenarios: [{ status: 'failed' }] }, { cleanup: { browserClosed: false, serverStopped: true, lockRetained: true } }]) {
    f.write('run.json', { ...original, ...patch }); expect(f.generate).toThrow()
  }
  f.write('run.json', original)
  const forged = structuredClone(f.report); forged.total.lines.pct = 100
  f.write('app.json', forged); expect(f.generate).toThrow('原始計數')
  f.write('app.json', f.report)
  const counters = receipt(emptyCoverage().toJSON()); delete counters.coverage[appFiles[0]]
  f.write('app-coverage.json', counters); expect(f.generate).toThrow('產品模組')
})

test('只有 main 成功後的獨立工作可寫入 badge 分支', () => {
  const workflow = Bun.YAML.parse(readFileSync('.github/workflows/harness-ci.yml', 'utf8')) as any
  expect(workflow.permissions).toEqual({ contents: 'read' })
  const writers = Object.entries(workflow.jobs).filter(([, job]: any) => job.permissions?.contents === 'write')
  expect(writers.map(([name]) => name)).toEqual(['coverage-badges'])
  const job = workflow.jobs['coverage-badges']
  expect(job.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'")
  expect(job.needs).toEqual(['harness', 'app-coverage', 'linux-install-restart'])
  expect(job.steps.at(-1).run).toContain('git push origin HEAD:refs/heads/codex/coverage-badges')
})
