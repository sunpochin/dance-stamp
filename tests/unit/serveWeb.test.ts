/* 檔案用途：以獨立合成包驗證本機 HTTP 入口不沿連結讀取包外資料。所在層：發布邊界回歸。主要關聯：serve-web.ts、web-assets.ts、releasePackage.test.ts。 */
import { expect, test } from 'bun:test'
import { linkSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { notices, webFiles, webHeaders, webPaths } from '../../scripts/web-assets'

test('獨立包的 HTTP 白名單保留正常回應；啟動後的檔案／父目錄連結也不能洩漏資料', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'dance-serve-boundary-')), root = join(fixture, 'candidate')
  mkdirSync(join(root, 'scripts'), { recursive: true }); mkdirSync(join(root, 'dist/web'), { recursive: true })
  for (const name of ['serve-web.ts', 'web-assets.ts']) writeFileSync(join(root, 'scripts', name), readFileSync(resolve(import.meta.dir, '../../scripts', name)))
  for (const name of [...webFiles, ...notices]) writeFileSync(join(root, 'dist/web', name), `synthetic public ${name}`)
  const sentinel = join(fixture, 'sentinel.txt'), privateBytes = 'synthetic outside candidate'
  writeFileSync(sentinel, privateBytes)
  // 由作業系統分配本輪專用 port，不碰其他聊天的主機或媒體鎖。
  const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('reserved') })
  const port = reservation.port; reservation.stop(true)
  const child = Bun.spawn([process.execPath, '--no-env-file', join(root, 'scripts/serve-web.ts'), String(port)], {
    cwd: fixture, env: { PATH: process.env.PATH, DANCE_STAMP_HOST: '127.0.0.1' }, stdout: 'ignore', stderr: 'pipe',
  })
  const url = `http://127.0.0.1:${port}`
  try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await fetch(url); ready = true; break } catch { await Bun.sleep(10) }
    }
    expect(ready).toBe(true)
    for (const [path, file] of webPaths) {
      const response = await fetch(url + path)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(`synthetic public ${file}`)
      for (const [header, value] of Object.entries(webHeaders)) expect(response.headers.get(header)).toBe(value)
    }
    const head = await fetch(url + '/main.js', { method: 'HEAD' })
    expect(head.status).toBe(200); expect(await head.text()).toBe('')
    // 正常主機與下載包不能意外提供本機開發控制。
    for (const path of ['/sentinel.txt', '/.git/config', '/release.json', '/_headers', '/test-reference.mp4', '/__dev/revision', '/__dev/reload.js']) expect((await fetch(url + path)).status).toBe(404)
    for (const method of ['POST', 'PUT', 'DELETE']) expect((await fetch(url, { method })).status).toBe(404)
    const file = join(root, 'dist/web/main.js')
    // 啟動後才換連結，防止只在啟動時驗一次而留下後續讀檔缺口。
    for (const kind of ['symlink', 'dangling', 'hardlink', 'directory']) {
      rmSync(file)
      if (kind === 'symlink') symlinkSync(sentinel, file)
      if (kind === 'dangling') symlinkSync(join(fixture, 'missing.txt'), file)
      if (kind === 'hardlink') linkSync(sentinel, file)
      if (kind === 'directory') mkdirSync(file)
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(url + '/main.js', { method })
        expect(await response.text()).not.toContain(privateBytes)
        expect(response.status).toBe(404)
      }
      expect(readFileSync(sentinel, 'utf8')).toBe(privateBytes)
      rmSync(file, { recursive: true }); writeFileSync(file, 'synthetic restored')
      expect(await (await fetch(url + '/main.js')).text()).toBe('synthetic restored')
    }
    // 合法檔名不代表父目錄安全；包根目錄、dist 與 web 都必須核對。
    for (const directory of ['dist/web', 'dist', '']) {
      const path = join(root, directory), saved = join(fixture, 'saved')
      renameSync(path, saved); symlinkSync(saved, path)
      expect((await fetch(url + '/main.js')).status).toBe(404)
      rmSync(path); renameSync(saved, path)
    }
  } finally {
    child.kill(); await child.exited
    rmSync(fixture, { recursive: true })
  }
})
