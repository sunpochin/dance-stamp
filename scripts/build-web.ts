/* 檔案用途：驗證並產出無後端、無外部依賴的靜態 Web 檔案。所在層：建置入口。主要關聯：web/、serve-web.ts。 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dir, '..'), target = resolve(root, 'dist/web')
const files = ['index.html', 'style.css', 'main.js', 'timeline.js', 'recorder.js', 'library.js', 'storage.js', 'sw.js']
const result = await Bun.build({ entrypoints: files.filter(f => f.endsWith('.js') && f !== 'sw.js').map(f => resolve(root, 'web', f)), target: 'browser', write: false })
if (!result.success) { console.error(result.logs); process.exit(1) }
const digest = createHash('sha256')
for (const file of files) digest.update(readFileSync(resolve(root, 'web', file)))
const version = digest.digest('hex').slice(0, 16)
mkdirSync(target, { recursive: true })
for (const file of files) {
  const source = readFileSync(resolve(root, 'web', file), 'utf8')
  writeFileSync(resolve(target, file), file === 'sw.js' ? source.replace('__BUILD__', version) : source)
}
console.log(`靜態 Web 建置完成：dist/web，版本 ${version}；無 runtime 套件依賴。`)
