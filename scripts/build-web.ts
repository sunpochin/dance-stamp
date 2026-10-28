/* 檔案用途：驗證並產出無後端、無外部依賴的靜態 Web 檔案。所在層：建置入口。主要關聯：web/、serve-web.ts。 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dir, '..'), target = resolve(root, 'dist/web')
const files = ['index.html', 'style.css', 'main.js', 'timeline.js', 'beats.js', 'recorder.js', 'library.js', 'storage.js', 'offline.js', 'sw.js']
const result = await Bun.build({ entrypoints: files.filter(f => f.endsWith('.js') && f !== 'sw.js').map(f => resolve(root, 'web', f)), target: 'browser', write: false })
if (!result.success) { console.error(result.logs); process.exit(1) }
const digest = createHash('sha256')
// 授權也是離線資源；只改 notice 時也必須用新 cache，不能改寫仍被舊分頁使用的內容。
for (const file of [...files, 'LICENSE', 'THIRD_PARTY_NOTICES.md']) digest.update(readFileSync(resolve(root, file === 'LICENSE' || file === 'THIRD_PARTY_NOTICES.md' ? file : `web/${file}`)))
const version = digest.digest('hex').slice(0, 16)
// 新舊資源混用可能破壞資料操作；SW 安裝與檢查都核對這次建置的實際 bytes。
const resources = [...files.filter(f => f !== 'sw.js'), 'LICENSE', 'THIRD_PARTY_NOTICES.md']
const manifest = Object.fromEntries(resources.map(file => [file === 'index.html' ? '/' : `/${file}`, createHash('sha256').update(readFileSync(resolve(root, file === 'LICENSE' || file === 'THIRD_PARTY_NOTICES.md' ? file : `web/${file}`))).digest('hex')]))
mkdirSync(target, { recursive: true })
for (const file of files) {
  const source = readFileSync(resolve(root, 'web', file), 'utf8')
  writeFileSync(resolve(target, file), file === 'sw.js' ? source.replace('__BUILD__', version).replace('/* __MANIFEST__ */ {}', JSON.stringify(manifest)) : source)
}
// 產物可獨立分發時也要帶授權，不能只在來源 repo 找得到。
for (const notice of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) writeFileSync(resolve(target, notice), readFileSync(resolve(root, notice)))
console.log(`靜態 Web 建置完成：dist/web，版本 ${version}；無 runtime 套件依賴。`)
