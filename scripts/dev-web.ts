/* 檔案用途：監看本機前端並通知已完成的建置。所在層：開發工具，不隨下載包發布。主要關聯：serve-web.ts、dev-reload.js。 */
import { watch } from 'node:fs'
import { resolve } from 'node:path'

export async function watchWeb(base: string) {
  let version = '', building = false, queued = false, failed = false
  let timer: ReturnType<typeof setTimeout> | undefined, child: ReturnType<typeof Bun.spawn> | undefined
  async function rebuild() {
    queued = true
    if (building) return
    building = true
    try {
      // 編輯器可連續存多檔；依序建置，成功後才換版本，避免頁面讀到半套產物。
      while (queued) {
        queued = false
        try {
          child = Bun.spawn([process.execPath, '--no-env-file', resolve(base, 'scripts/build-web.ts')], { cwd: base, stdout: 'inherit', stderr: 'inherit' })
          failed = await child.exited !== 0
          if (!failed) version = crypto.randomUUID()
        } catch (error) { failed = true; console.error('本機自動建置失敗：', error) }
      }
    } finally { building = false; child = undefined }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void rebuild() }, 100) }
  const watchers = [
    watch(resolve(base, 'web'), schedule),
    watch(resolve(base, 'scripts'), (_event, file) => { if (file && ['build-web.ts', 'web-assets.ts', 'dev-reload.js'].includes(String(file))) schedule() }),
  ]
  const close = () => { clearTimeout(timer); watchers.forEach(watcher => watcher.close()); if (child?.exitCode === null) child.kill() }
  process.once('exit', close)
  await rebuild()
  if (!version) { close(); throw new Error('首次建置失敗，請修正後重新啟動本機預覽。') }
  return {
    state: () => ({ version, building, failed }),
    html: (source: string) => source.replace('<html ', `<html data-dev-reload="true" data-dev-version="${version}" `).replace('</head>', '<script type="module" src="/__dev/reload.js"></script></head>'),
    // 讓既有 SW 等舊分頁結束後自行退出，不強制接管，也不清除快取或 IndexedDB。
    serviceWorker: "self.addEventListener('activate', event => event.waitUntil(self.registration.unregister()));\n",
  }
}
