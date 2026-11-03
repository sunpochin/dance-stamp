/* 檔案用途：確保首頁 coverage 來自成功完整收據，拒絕假分數與不完整來源。所在層：CI 契約測試。主要關聯：scripts/coverage-badges.ts。 */
import { expect, test } from 'bun:test'
import { fullCatalog, linuxCatalog, macPtsCatalog, assertCompleteRun, appPlan, assertDownloadRunPlan } from '../app-coverage/platform-plan'
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
  const run = { sourceHead: sha, status: 'passed', matrix: 'full', trackedChanges: false, appFiles, sourceHashes, errors: [], environment: { platform: 'linux' }, scenarios: fullCatalog.map(name => ({ name, status: 'passed' })), cleanup: { browserClosed: true, serverStopped: true, lockRetained: false }, final: report }
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
  expect(job.needs).toEqual(['harness', 'app-coverage', 'app-pts-macos', 'app-platform-gate', 'linux-install-restart'])
  expect(job.steps.at(-1).run).toContain('git push origin HEAD:refs/heads/codex/coverage-badges')
})

// 平台拆分不能用少一案／重複一案的every(pass)冒充完整，也不混合兩台counter。
test('Linux82／Mac3精確catalog，保留原81案順序及真正拒絕案', () => {
  expect(fullCatalog).toHaveLength(84); expect(new Set(fullCatalog).size).toBe(84)
  expect(macPtsCatalog).toEqual(['webkit-audio-branch', 'explicit-pts-owner', 'webkit-capture-branch'])
  expect(linuxCatalog).toEqual([...fullCatalog.filter(name => !macPtsCatalog.includes(name)), 'native-aac-refusal'])
  expect(linuxCatalog).toHaveLength(82)
  for (const [matrix, catalog, platform] of [['linux-full', linuxCatalog, 'linux'], ['mac-pts-selected', macPtsCatalog, 'darwin']] as const) {
    const run = { status: 'passed', matrix, environment: { platform }, scenarios: catalog.map(name => ({ name, status: 'passed' })) }
    expect(() => assertCompleteRun(run)).not.toThrow()
    for (const scenarios of [run.scenarios.slice(1), [...run.scenarios, run.scenarios[0]], [...run.scenarios].reverse(), run.scenarios.map((row, i) => i ? row : { ...row, status: 'failed' })]) expect(() => assertCompleteRun({ ...run, scenarios })).toThrow()
    expect(() => assertCompleteRun({ ...run, environment: { platform: 'wrong-platform' } })).toThrow()
  }
})
test('Linux完整平台badge明示範圍，Macselected不得拿來出全球badge', () => {
  const f = fixture()
  f.write('run.json', { ...f.run, matrix: 'linux-full', scenarios: linuxCatalog.map(name => ({ name, status: 'passed' })) }); f.generate()
  const summary = JSON.parse(readFileSync(join(f.output, 'summary.json'), 'utf8'))
  expect(summary.scope).toContain('Linux complete platform catalog (82 cases)')
  expect(summary.scope).toContain('counters are not combined')
  expect(JSON.parse(readFileSync(join(f.output, 'lines.json'), 'utf8')).label).toBe('Linux App lines')
  f.write('run.json', { ...f.run, matrix: 'mac-pts-selected', environment: { platform: 'darwin' }, scenarios: macPtsCatalog.map(name => ({ name, status: 'passed' })) })
  expect(f.generate).toThrow()
})
test('Mac不可略過，always硬gate與badge都依賴兩平台成功，首失敗原收據會上傳', () => {
  const workflow = Bun.YAML.parse(readFileSync('.github/workflows/harness-ci.yml', 'utf8')) as any
  const gate = workflow.jobs['app-platform-gate'], mac = workflow.jobs['app-pts-macos']
  expect(gate.if).toBe('always()'); expect(gate.needs).toEqual(['app-coverage', 'app-pts-macos'])
  expect(gate.steps[0].run).toContain("needs.app-coverage.result"); expect(gate.steps[0].run).toContain("needs.app-pts-macos.result")
  expect(mac['continue-on-error']).toBeUndefined()
  expect(mac.steps.find((step: any) => step.name === 'Run all three native AAC PTS scenarios').run).toContain('--mac-pts-platform')
  expect(workflow.jobs['app-coverage'].steps.some((step: any) => step.if === 'failure()' && step.with?.path?.includes('run.json'))).toBe(true)
})

test('Linux預設完整82、Mac預設84、明選局部保留，平台flag不偽裝環境', () => {
  expect(appPlan([], 'linux')).toEqual({ matrix: 'linux-full', catalog: [...linuxCatalog] })
  expect(appPlan(['--linux-platform'], 'linux')).toEqual(appPlan([], 'linux'))
  expect(appPlan([], 'darwin')).toEqual({ matrix: 'full', catalog: [...fullCatalog] })
  expect(appPlan(['--mac-pts-platform'], 'darwin')).toEqual({ matrix: 'mac-pts-selected', catalog: [...macPtsCatalog] })
  expect(appPlan(['webkit-audio-branch'], 'linux')).toEqual({ matrix: 'selected', catalog: ['webkit-audio-branch'] })
  expect(() => appPlan(['--linux-platform'], 'darwin')).toThrow()
  expect(() => appPlan(['--mac-pts-platform'], 'linux')).toThrow()
  expect(() => appPlan(['--linux-platform', 'moves'], 'linux')).toThrow()
})
test('兩下載verifier保留顯式selected契約，自動搜尋及badge仍拒絕局部', () => {
  const selected = { status: 'passed', matrix: 'selected', scenarios: [{ name: 'follow-runtime', status: 'passed' }] }
  expect(() => assertDownloadRunPlan(selected, true)).not.toThrow()
  expect(() => assertDownloadRunPlan(selected, false)).toThrow()
  expect(() => assertCompleteRun(selected, ['full', 'linux-full'])).toThrow()
  for (const matrix of ['full', 'linux-full']) expect(() => assertDownloadRunPlan({ ...selected, matrix }, true)).toThrow()
})
