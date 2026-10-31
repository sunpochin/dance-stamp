/* 檔案用途：將成功的完整 App 收據轉為首頁 badge 與可追溯報告。所在層：CI 工具。主要關聯：tests/app-coverage/instrument.ts、harness-ci.yml、README.md。 */
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { appFiles, emptyCoverage, mergeReceipt, sourceHashes } from '../tests/app-coverage/instrument'

export function createCoverageBadges(directory: string, destination: string, sourceHead: string, workflowRun: string) {
  const read = (name: string) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'))
  const run = read('run.json'), report = read('app.json')
  // 局部、失敗、髒來源或其他提交的高分都不能冒充 main 的完整成功量測。
  assert.match(sourceHead, /^[a-f0-9]{40}$/)
  assert.match(workflowRun, /^https:\/\/github\.com\/sunpochin\/dance-stamp\/actions\/runs\/\d+$/)
  assert.equal(run.sourceHead, sourceHead, '提交不同')
  assert.equal(run.status, 'passed', '量測未通過')
  assert.equal(run.matrix, 'full', '不可使用局部量測')
  assert.equal(run.trackedChanges, false, '來源不是乾淨提交')
  assert.deepEqual(run.appFiles, appFiles, '產品分母不同')
  assert.deepEqual(run.sourceHashes, sourceHashes, '產品來源不同')
  assert.deepEqual(run.errors, [])
  assert(run.scenarios.length > 0 && run.scenarios.every((scenario: any) => scenario.status === 'passed'))
  assert.deepEqual(run.cleanup, { browserClosed: true, serverStopped: true, lockRetained: false })
  const map = emptyCoverage()
  const counters = read('app-coverage.json')
  assert.deepEqual(Object.keys(counters.coverage).sort(), appFiles, '缺少產品模組')
  mergeReceipt(map, counters)
  // 從原始計數重算，防止摘要被手改；沿用 Istanbul 的百分比，不把 99.99 四捨五入成 100。
  assert.deepEqual(report.total, map.getCoverageSummary().toJSON(), '摘要與原始計數不同')
  assert.deepEqual(Object.keys(report.files).sort(), appFiles, '摘要缺少產品模組')
  for (const path of appFiles) {
    const summary = map.fileCoverageFor(path).toSummary().toJSON()
    for (const key of Object.keys(summary)) assert.deepEqual(report.files[path][key], (summary as any)[key])
  }
  assert.deepEqual(run.final, report, '結束收據與報表不同')
  mkdirSync(destination, { recursive: true })
  const write = (name: string, value: unknown) => writeFileSync(resolve(destination, name), JSON.stringify(value, null, 2) + '\n')
  const metrics = ['lines', 'functions', 'branches'] as const
  for (const key of metrics) write(`${key}.json`, { schemaVersion: 1, label: `App ${key}`, message: `${report.total[key].pct}%`, color: 'blue' })
  write('summary.json', { sourceHead, workflowRun, generatedAt: new Date().toISOString(), scope: 'All web/*.js; unit + VM + isolated Chromium; synthetic checks', sourceHashes, scenarios: run.scenarios.length, ...report })
  copyFileSync(resolve(directory, 'report.html'), resolve(destination, 'report.html'))
  writeFileSync(resolve(destination, 'README.md'), `# 全 App coverage\n\n這是最近一次 main 成功完整量測；新測試失敗時保留上次成功數字，最新狀態請看首頁 CI。\n\n來源：[${sourceHead}](https://github.com/sunpochin/dance-stamp/commit/${sourceHead}) · [CI 執行與可下載報告](${workflowRun})\n\n${appFiles.length} 個 web/*.js 全列入分母；${run.scenarios.length} 個瀏覽器流程通過。單元、VM 與隔離 Chromium 的插樁合成測試不代表真機或影音品質驗收。\n\n| 指標 | 已覆蓋 / 總數 | 比例 |\n| --- | --- | --- |\n${metrics.map(key => `| ${key} | ${report.total[key].covered} / ${report.total[key].total} | ${report.total[key].pct}% |`).join('\n')}\n\n逐檔數字及來源指紋見 [summary.json](summary.json)；CI artifact 包含可離線開啟的 report.html。\n`)
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  assert.equal(args.length, 2, '需要單一量測目錄與輸出目錄')
  createCoverageBadges(args[0], args[1], process.env.SOURCE_SHA!, `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`)
}
