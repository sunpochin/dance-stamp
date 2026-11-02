/* 用途：固定原產品與合成旁聽器，封存每份收據且只釋自己的鎖；層：本機QA；關聯：vs-observer.js、serve-capture.ts。 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { bounded } from './capture-lifecycle.js'
export function createVsHost(folder: string, port = 62279, lock = '/private/tmp/dance-stamp-p0-media-test.lock', buildFolder = 'dist/web') {
if (Bun.version !== '1.4.4') throw Error('Bun1.4.4 required')
mkdirSync(folder, { recursive: true })
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const assets = new Map<string, { bytes: Buffer; mime: string }>()
for (const file of readdirSync(buildFolder)) if (file !== '_headers') assets.set(file === 'index.html' ? '/' : '/' + file, { bytes: readFileSync(resolve(buildFolder, file)), mime: file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream' })
for (const file of ['vs-observer.js', 'vs-content.js']) assets.set('/' + file, { bytes: readFileSync(resolve(import.meta.dir, file)), mime: 'text/javascript' })
const original = assets.get('/')!.bytes
assets.get('/')!.bytes = Buffer.from(original.toString().replace('<script type="module" src="/main.js"></script>', '<script src="/qa-config.js"></script><script type="module" src="/vs-observer.js"></script><script type="module" src="/main.js"></script>'))
if (original.equals(assets.get('/')!.bytes)) throw Error('injection anchor missing')
const nonce = randomUUID()
const config = { nonce, sourceHead: Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim(), productReference: '7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca', originalHtmlSha256: hash(original), fingerprints: Object.fromEntries([...assets].map(([url, a]) => [url, { bytes: a.bytes.length, sha256: hash(a.bytes) }])), plan: JSON.parse(readFileSync(resolve(folder, '../plan.local.json'), 'utf8')) }
writeFileSync(lock, JSON.stringify({ pid: process.pid, cwd: process.cwd(), nonce, task: 'issue11-vs-native-diagnostic' }), { flag: 'wx' })
let server: ReturnType<typeof Bun.serve>, timer: ReturnType<typeof setTimeout>, stopped = false, sequence = 0
const requests: unknown[] = [], active = new Set<AbortController>()
function stop(reason: string, firstError: unknown = null) {
  if (stopped) return; stopped = true; clearTimeout(timer)
  const errors: string[] = []; let released = false, serverStopped = false
  try { active.forEach(c => c.abort()); server?.stop(true); serverStopped = true } catch (e) { errors.push(String(e)) }
  try { if (!serverStopped || JSON.parse(readFileSync(lock, 'utf8')).nonce !== nonce) throw Error('retain lock: stop/nonce unconfirmed'); unlinkSync(lock); released = true } catch (e) { errors.push(String(e)) }
  try { writeFileSync(resolve(folder, 'host-cleanup.local.json'), JSON.stringify({ reason, firstError: firstError === null ? null : String(firstError), serverStopped, released, nonce, errors, requests }, null, 2), { flag: 'wx' }) } catch (e) { console.error({ firstError, errors, receiptError: String(e) }) }
}
try {
  server = Bun.serve({ hostname: '127.0.0.1', port, async fetch(request) {
    const url = new URL(request.url), asset = assets.get(url.pathname), headers = { 'Cache-Control': 'no-store', 'Permissions-Policy': 'camera=(), microphone=(), display-capture=()', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; media-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'" }
    if (stopped) return new Response('ended', { status: 410 })
    if (request.method === 'GET' && url.pathname === '/qa-config.js') return new Response('globalThis.__vsQAConfig=' + JSON.stringify(config), { headers: { ...headers, 'Content-Type': 'text/javascript' } })
    if (request.method === 'GET' && url.pathname === '/qa/config') return Response.json(config, { headers })
    if (request.method === 'GET' && asset) { requests.push({ url: url.pathname, sha256: hash(asset.bytes), at: Date.now() }); return new Response(asset.bytes, { headers: { ...headers, 'Content-Type': asset.mime } }) }
    if (request.method !== 'POST' || request.headers.get('origin') !== url.origin) return new Response('refused', { status: 403 })
    if (url.pathname === '/qa/finish/' + nonce) { setTimeout(() => stop('explicit finish'), 50); return new Response('finishing') }
    if (url.pathname !== '/qa/receipt' && !/^\/qa\/media\/[a-f0-9]{64}$/.test(url.pathname)) return new Response('missing', { status: 404 })
    const controller = new AbortController(); active.add(controller); const reader = request.body?.getReader()
    try {
      const bytes = await bounded(async () => { if (!reader) throw Error('body missing'); const chunks: Uint8Array[] = []; let size = 0; while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 100_000_000) throw Error('QA receipt limit'); chunks.push(item.value) } return Buffer.concat(chunks) }, 5000, 'QA body', controller.signal)
      if (stopped) throw Error('host ended')
      if (url.pathname === '/qa/receipt') {
        if (JSON.parse(bytes.toString()).config.nonce !== nonce) throw Error('nonce mismatch')
        writeFileSync(resolve(folder, `receipt-${String(++sequence).padStart(3, '0')}.local.json`), bytes, { flag: 'wx' })
      } else {
        const name = url.pathname.split('/').at(-1)!; if (hash(bytes) !== name) throw Error('media hash mismatch')
        try { writeFileSync(resolve(folder, name + '.media'), bytes, { flag: 'wx' }) } catch (e: any) { if (e.code !== 'EEXIST' || !readFileSync(resolve(folder, name + '.media')).equals(bytes)) throw e }
      }
      return new Response('saved', { headers })
    } catch (e) { return new Response(String(e), { status: 400, headers }) } finally { controller.abort(); active.delete(controller); void reader?.cancel().catch(() => {}) }
  } })
  timer = setTimeout(() => stop('host lifetime'), 1_200_000)
  writeFileSync(resolve(folder, 'host.local.json'), JSON.stringify({ ...config, pid: process.pid, origin: 'http://127.0.0.1:' + server.port }, null, 2), { flag: 'wx' })
  process.once('SIGTERM', () => stop('SIGTERM')); process.once('SIGINT', () => stop('SIGINT'))
  return { stop, config, origin: 'http://127.0.0.1:' + server.port }
} catch (e) { stop('startup failure', e); throw e }

}
if (import.meta.main) {
 const folder = resolve(process.argv[2] || ''); if (!folder.includes('/output/')) throw Error('new ignored output required');
 const host = createVsHost(folder, Number(process.argv[3] || 62279)); console.log(JSON.stringify({pid:process.pid,origin:host.origin,nonce:host.config.nonce}));
}
