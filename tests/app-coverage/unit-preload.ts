/* 檔案用途：讓既有單元測試使用與瀏覽器相同的 App 計數器。所在層：選用測試 preload。主要關聯：instrument.ts、run-app.ts。 */
import { afterAll } from 'bun:test'
import { plugin } from 'bun'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { instrument, receipt, root } from './instrument'

plugin({ name: 'app-coverage', setup(build) {
  build.onLoad({ filter: /\/web\/[^/]+\.js$/ }, args => ({ contents: instrument(`web/${args.path.split('/').at(-1)}`).code, loader: 'js' }))
} })
afterAll(() => {
  const directory = process.env.DANCE_STAMP_COVERAGE_DIR
  if (!directory || !resolve(directory).startsWith(resolve(root, 'coverage') + '/')) throw new Error('請使用本次 coverage 子目錄')
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, `unit-${crypto.randomUUID()}.json`), JSON.stringify(receipt((globalThis as any).__coverage__ || {})))
})
