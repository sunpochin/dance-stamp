/* 檔案用途：建立可解碼且大小精確的合成保存測片。所在層：本機 QA；不隨產品分發。主要關聯：storage-size.js、MEDIA_PROBE.md。 */
import { createHash } from 'node:crypto'
import { closeSync, createReadStream, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..'), source = readFileSync(resolve(root, 'output/media-probe/reference.mp4'))
mkdirSync(resolve(root, 'output'), { recursive: true })
const directory = mkdtempSync(resolve(root, 'output/storage-size-'))
const cases = []
for (const bytes of [20, 100, 200].map(n => n * 1048576).concat(200 * 1048576 + 1)) {
  const padding = bytes - source.length
  if (padding < 8 || padding > 0xffffffff) throw new Error('合成來源大小不適合此矩陣；請先依 MEDIA_PROBE.md 建立標準測片。')
  const label = bytes > 200 * 1048576 ? '200-mib-plus-one' : `${bytes / 1048576}-mib`
  const path = resolve(directory, `${label}.mp4`), header = Buffer.alloc(8)
  header.writeUInt32BE(padding); header.write('free', 4, 'ascii')
  const fd = openSync(path, 'wx')
  try {
    // free atom 不改原影片的 sample 或時間表，只補儲存大小；不能拿它宣稱高碼率／長片解碼能力。
    writeFileSync(fd, source); writeFileSync(fd, header); ftruncateSync(fd, bytes)
  } finally { closeSync(fd) }
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  cases.push({ label, path, bytes, sha256: hash.digest('hex') })
}
const fixtures = { kind: 'synthetic-mp4-free-atom', sourceSha256: createHash('sha256').update(source).digest('hex'), directory, cases }
writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify(fixtures, null, 2))
const verify = readFileSync(resolve(root, 'tests/browser/storage-size.js'), 'utf8')
for (const phase of ['prepare', 'verify']) {
  // 本輪路徑以 JS 字串編碼傳入；不經 shell，不讀取或覆寫使用者影片。
  writeFileSync(resolve(directory, `${phase}.js`), `async page => { const verify = ${verify}; return verify(page, ${JSON.stringify(fixtures)}, ${JSON.stringify(phase)}); }\n`)
}
writeFileSync(resolve(directory, 'browser.json'), JSON.stringify({ browser: { browserName: 'chromium', launchOptions: { channel: 'chrome', headless: true }, contextOptions: { acceptDownloads: true } } }))
console.log(`已建立本輪合成矩陣與 prepare.js／verify.js：${directory}`)
