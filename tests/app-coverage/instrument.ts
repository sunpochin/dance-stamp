/* 檔案用途：以同一來源與計數格式統計所有 App 模組。所在層：僅測試使用的覆蓋率工具。主要關聯：unit-preload.ts、run-app.ts。 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInstrumenter } from 'istanbul-lib-instrument'
import { createCoverageMap } from 'istanbul-lib-coverage'

export const root = resolve(import.meta.dir, '../..')
// 從產品目錄列舉，未被測試 import 的 main／storage／SW 也必須以零分留在分母。
export const appFiles = readdirSync(resolve(root, 'web')).filter(name => name.endsWith('.js')).sort().map(name => `web/${name}`)
export const sourceHashes = Object.fromEntries(appFiles.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))
export function instrument(path: string) {
  if (!appFiles.includes(path)) throw new Error(`不是 App 模組：${path}`)
  const tool = createInstrumenter({ esModules: true, compact: false, preserveComments: true, coverageGlobalScope: 'globalThis', coverageGlobalScopeFunc: false })
  const source = readFileSync(resolve(root, path), 'utf8')
  if (createHash('sha256').update(source).digest('hex') !== sourceHashes[path]) throw new Error('量測期間來源已改變，請重新執行')
  const code = tool.instrumentSync(source, path)
  return { code, coverage: tool.lastFileCoverage() }
}
const templates = Object.fromEntries(appFiles.map(path => [path, instrument(path).coverage]))
export function emptyCoverage() { return createCoverageMap(structuredClone(templates)) }
export function receipt(coverage: unknown) { return { sourceHashes, coverage } }
// VM 不經 Bun 的 import loader；顯式共用計數器，原本的故障／收尾斷言才不會從報表消失。
export function sourceForVm(path: string) { return process.env.DANCE_STAMP_COVERAGE_DIR ? instrument(path).code : readFileSync(resolve(root, path), 'utf8') }
export function vmCoverageContext() { return process.env.DANCE_STAMP_COVERAGE_DIR ? { __coverage__: (globalThis as any).__coverage__ ||= {} } : {} }
export function mergeReceipt(map: ReturnType<typeof createCoverageMap>, value: any) {
  if (JSON.stringify(value.sourceHashes) !== JSON.stringify(sourceHashes)) throw new Error('覆蓋率來源不同，不能合併其他版本的證據')
  if (!value.coverage || Object.keys(value.coverage).some(path => !appFiles.includes(path))) throw new Error('覆蓋率包含未知來源')
  // 收據上的 SHA 之外還核對實際位置表；不能將其他版本的計數貼上目前來源的標籤。
  for (const [path, counters] of Object.entries(value.coverage) as [string, any][]) {
    if (counters.path !== path || ['statementMap', 'fnMap', 'branchMap'].some(key => JSON.stringify(counters[key]) !== JSON.stringify((templates[path] as any)[key]))) throw new Error('覆蓋率位置表與來源不同')
    for (const key of ['s', 'f', 'b']) {
      const expected = (templates[path] as any)[key], actual = counters[key]
      if (!actual || JSON.stringify(Object.keys(actual)) !== JSON.stringify(Object.keys(expected)) || Object.keys(expected).some(id => {
        const hits = key === 'b' ? actual[id] : [actual[id]]
        return !Array.isArray(hits) || (key === 'b' && hits.length !== expected[id].length) || hits.some(hit => !Number.isSafeInteger(hit) || hit < 0)
      })) throw new Error('覆蓋率計數無效')
    }
  }
  map.merge(value.coverage)
}
