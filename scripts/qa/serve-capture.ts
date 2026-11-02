/* 用途：固定合成QA來源與本機收據，持有自己的有界nonce；層：開發工具；關聯：capture-content.html、captureHost.test.ts。 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { bounded } from './capture-lifecycle.js'

export function createCaptureHost(folder: string, lock = '/private/tmp/dance-stamp-p0-media-test.lock', lifetimeMs = 600_000) {
  if (Bun.version !== '1.4.4') throw Error('Use Bun 1.4.4')
  mkdirSync(folder, { recursive: true })
  const nonce = randomUUID(), sourceHead = Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim()
  const assets = new Map([['/', 'capture-content.html'], ['/capture-lifecycle.js', 'capture-lifecycle.js']].map(([url, file]) => [url, { file, bytes: readFileSync(resolve(import.meta.dir, file)) }]))
  const fingerprints = [...assets.values()].map(({ file, bytes }) => ({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }))
  const fixture = { width: 640, height: 240, magic: 'A55A', complement: '16bit', crc: 'CRC16-CCITT-FFFF-1021-low-byte-first', audio: '48000Hz mono 660Hz 40ms at .6/1.4/2.2s', durationMs: 3000, delay: 0 }
  const config = { nonce, sourceHead, fingerprints, fixture, fixtureSha256: createHash('sha256').update(JSON.stringify(fixture)).digest('hex') }
  // wx 保留忙碌現場；不搶鎖、不刪舊鎖，也不把鎖等待當產品失敗。
  writeFileSync(lock, JSON.stringify({ owner: 'issue11-capture-lifecycle', pid: process.pid, cwd: process.cwd(), nonce }), { flag: 'wx' })
  let server: ReturnType<typeof Bun.serve>, timer: ReturnType<typeof setTimeout>, ended = false, resultSaved = false, mediaSaved = false
  const active = new Set<AbortController>()
  function stop(reason: string, firstError: unknown = null) {
    if (ended) return
    ended = true; clearTimeout(timer)
    const errors: string[] = []; let serverStopped = false
    // 主機與鎖的收尾各自嘗試；nonce不符時只記錄，不能動到新持有人。
    try { for (const controller of active) controller.abort(); server?.stop(true); serverStopped = true } catch (error) { errors.push(String(error)) }
    let lockReleased = false
    try { if (!serverStopped) throw Error('server stop unconfirmed; retain own lock'); if (JSON.parse(readFileSync(lock, 'utf8')).nonce !== nonce) throw Error('lock nonce changed'); unlinkSync(lock); lockReleased = true } catch (error) { errors.push(String(error)) }
    const receipt = { reason, nonce, serverStopped, lockReleased, firstError: firstError === null ? null : String(firstError), errors }
    // 收據本身寫入失敗也不能覆寫舊檔、蓋掉啟動首錯；保留可擷取的stderr後備收據。
    try { writeFileSync(resolve(folder, 'host-cleanup.local.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' }) }
    catch (error) { errors.push('cleanup receipt: ' + String(error)); console.error(JSON.stringify(receipt)) }
  }
  try {
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
      const url = new URL(request.url)
      const headers = { 'Cache-Control': 'no-store', 'Permissions-Policy': 'camera=(), microphone=(), display-capture=(), geolocation=()', 'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; media-src blob:; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'none'" }
      if (ended) return new Response('ended', { status: 410, headers })
      if (request.method === 'GET' && url.pathname === '/config') return Response.json(config, { headers })
      if (request.method === 'GET' && assets.has(url.pathname)) { const asset = assets.get(url.pathname)!; return new Response(asset.bytes, { headers: { ...headers, 'Content-Type': asset.file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' } }) }
      if (request.method !== 'POST' || request.headers.get('origin') !== url.origin) return new Response('refused', { status: 403, headers })
      if (url.pathname === '/finish/' + nonce) { setTimeout(() => stop('explicit finish'), 50); return new Response('finishing', { headers }) }
      const kind = url.pathname === '/result/' + nonce ? 'result' : url.pathname === '/media/' + nonce ? 'media' : null
      if (!kind) return new Response('not found', { status: 404, headers })
      if (kind === 'result' ? resultSaved : mediaSaved || resultSaved) return new Response('already sealed', { status: 409, headers })
      const controller = new AbortController(); active.add(controller)
      const reader = request.body?.getReader()
      try {
        const bytes = await bounded(async () => {
          if (!reader) throw Error('body missing')
          const chunks: Uint8Array[] = []; let size = 0
          while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 15_000_000) throw Error('receipt too large'); chunks.push(item.value) }
          return Buffer.concat(chunks)
        }, 2000, 'request body', controller.signal)
        if (ended || (kind === 'result' ? resultSaved : mediaSaved || resultSaved)) throw Error('receipt ended')
        if (kind === 'result') { const value = JSON.parse(bytes.toString()); if (value.config.nonce !== nonce) throw Error('receipt nonce mismatch') }
        writeFileSync(resolve(folder, kind === 'result' ? 'content.local.json' : 'content.receipt.webm'), bytes, { flag: 'wx' })
        if (kind === 'result') resultSaved = true; else mediaSaved = true
        return new Response('saved', { headers })
      } catch (error) { return new Response(String(error), { status: 400, headers }) }
      finally { controller.abort(); active.delete(controller); void reader?.cancel().catch(() => {}) }
    } })
    timer = setTimeout(() => stop('host lifetime timeout'), lifetimeMs)
    const record = { ...config, pid: process.pid, origin: 'http://127.0.0.1:' + server.port, lifetimeMs }
    writeFileSync(resolve(folder, 'host.local.json'), JSON.stringify(record, null, 2), { flag: 'wx' })
    return { record, stop }
  } catch (error) { stop('startup failure', error); throw error }
}
if (import.meta.main) {
  const folder = process.argv[2]
  if (!folder || !resolve(folder).includes('/output/')) throw Error('Provide a new ignored output folder')
  const host = createCaptureHost(resolve(folder))
  process.once('SIGTERM', () => host.stop('SIGTERM')); process.once('SIGINT', () => host.stop('SIGINT'))
  console.log(JSON.stringify(host.record))
}
