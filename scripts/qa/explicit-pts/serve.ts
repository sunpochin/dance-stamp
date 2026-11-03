/* 用途：固定合成 QA 工具並保留首份收據；所在層：scripts/qa/explicit-pts；關聯：README.md、probe.js、spike.js、共用媒體鎖。 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
if (Bun.version !== '1.4.4') throw Error('Bun1.4.4 required');
const folder = import.meta.dir, repoRoot = realpathSync(resolve(folder, '../../..'));
const lock = '/private/tmp/dance-stamp-p0-media-test.lock', nonce = randomUUID();
const args = Bun.argv.slice(2), options = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  const key = args[index], value = args[index + 1];
  if (!['--output', '--fixture', '--variant'].includes(key) || !value || options.has(key)) throw Error('usage: --output output/<freshfolder> [--fixture output/<synthetic.mp4>] [--variant window|worker]');
  options.set(key, value);
}
const outputArgument = options.get('--output'), variant = options.get('--variant') ?? 'window';
if (!['window', 'worker'].includes(variant)) throw Error('--variant must be window or worker');
const workerVariant = variant === 'worker', assetFolder = workerVariant ? resolve(folder, 'worker') : folder;
// 首份現場不能被舊目錄或符號連結導向覆寫；只接受 repo output 的全新直屬資料夾。
if (!outputArgument || !/^output\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(outputArgument)) throw Error('--output must name a fresh output/<folder>');
const outputRoot = resolve(repoRoot, 'output');
mkdirSync(outputRoot, { recursive: true });
if (realpathSync(outputRoot) !== outputRoot) throw Error('output root must not be a symlink');
const receiptFolder = resolve(repoRoot, outputArgument);
const source = realpathSync(resolve(repoRoot, options.get('--fixture') ?? 'output/media-feasibility/reference.mp4'));
const fixtureRelative = relative(outputRoot, source);
if (!fixtureRelative || isAbsolute(fixtureRelative) || fixtureRelative === '..' || fixtureRelative.startsWith(`..${sep}`)) throw Error('fixture must be inside repo output');
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'node_modules/mediabunny/package.json'), 'utf8'));
if (packageJson.version !== '1.65.0') throw Error('fixed library version required');
const fixture = readFileSync(source);
if (fixture.length !== 1789027 || hash(fixture) !== '3fb42ffb14678b8c944d605cab684a1919801de7908c1f540f7fbfc29ea26548') throw Error('synthetic fixture mismatch');
const assets = new Map<string, { bytes: Buffer; mime: string }>();
// 只切換QA資產位置；URL保持凍結Worker版原路徑，預設window不換入口或協定。
const codeAssets: [string, string, string][] = workerVariant ? [
  ['/', 'index.html', 'text/html; charset=utf-8'], ['/probe.js', 'probe.js', 'text/javascript'],
  ['/worker.js', 'entry.js', 'text/javascript'], ['/worker-core.js', 'core.js', 'text/javascript'],
] : [
  ['/', 'index.html', 'text/html; charset=utf-8'], ['/probe.js', 'probe.js', 'text/javascript'], ['/spike.js', 'spike.js', 'text/javascript'],
];
for (const [url, path, mime] of [...codeAssets,
  ['/mediabunny.mjs', 'node_modules/mediabunny/dist/bundles/mediabunny.mjs', 'text/javascript'],
] as const) assets.set(url, { bytes: readFileSync(resolve(path.startsWith('node_modules/') ? repoRoot : assetFolder, path)), mime });
// Worker控制沿用受測bundle的拒絕界線；原window只記指紋，不藉搬入改它的支援範圍。
if (workerVariant && hash(assets.get('/mediabunny.mjs')!.bytes) !== '65a111aadcb9a8b45e585f128d11daf3c972289bf6c58b2e795ba6073ee13363') throw Error('fixed worker bundle fingerprint mismatch');
for (const side of ['reference', 'self']) assets.set(`/fixtures/${side}.mp4`, { bytes: fixture, mime: 'video/mp4' });
const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: repoRoot });
if (head.exitCode !== 0) throw Error('source commit unavailable');
// 新主機不能沿用暫存Chrome版的來源標籤；保存本次Git來源與實際主機bytes。
const config = { nonce, variant, workerVariant, baseEngineCommit: workerVariant ? '3ed5fee7d2917d1aa4ff6561a1689a913e267da6' : undefined, sourceHead: head.stdout.toString().trim(), trackedChanges: Bun.spawnSync(['git', 'status', '--porcelain'], { cwd: repoRoot }).stdout.toString().trim() !== '', hostSha256: hash(readFileSync(resolve(folder, 'serve.ts'))), library: { name: 'mediabunny', version: packageJson.version, license: 'MPL-2.0', bundleSha256: hash(assets.get('/mediabunny.mjs')!.bytes) }, assets: Object.fromEntries([...assets].map(([path, item]) => [path, { bytes: item.bytes.length, sha256: hash(item.bytes) }])), syntheticOnly: true, prototypeOnly: true };
// mkdir 與每份 wx 收據都拒絕舊現場；只有自己的 browser 已確認停止才釋放自己的 nonce。
mkdirSync(receiptFolder);
writeFileSync(lock, JSON.stringify({ owner: workerVariant ? 'issue11-explicit-pts-worker-spike' : 'issue11-explicit-pts-spike', pid: process.pid, cwd: folder, nonce }), { flag: 'wx' });
let server: ReturnType<typeof Bun.serve> | undefined, ended = false, timer: ReturnType<typeof setTimeout>;
const saved = new Set<string>();
async function stop(reason: string, browserStopped: boolean) {
  if (ended) return; ended = true; clearTimeout(timer);
  const errors: string[] = []; let serverStopped = false, lockReleased = false;
  try { await server?.stop(true); serverStopped = true; } catch (error) { errors.push(String(error)); }
  try {
    if (!serverStopped || !browserStopped) throw Error('retain lock for browser cleanup audit');
    const owner = JSON.parse(readFileSync(lock, 'utf8'));
    if (owner.nonce !== nonce || owner.pid !== process.pid || owner.cwd !== folder) throw Error('lock ownership changed');
    unlinkSync(lock); lockReleased = true;
  } catch (error) { errors.push(String(error)); }
  const receipt = { reason, nonce, pid: process.pid, serverStopped, browserStopped, lockReleased, errors };
  try { writeFileSync(resolve(receiptFolder, 'host-cleanup.local.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' }); } catch (error) { console.error(String(error)); }
  console.log(JSON.stringify(receipt)); process.stdin.pause(); process.exitCode = errors.length ? 1 : 0;
  // stdin的listener可能仍保有TTY；已完成同步收據與主機收尾後明確結束自己的程序。
  setTimeout(() => process.exit(errors.length ? 1 : 0), 10);
}
async function body(request: Request, maximum: number) {
  const reader = request.body?.getReader(); if (!reader) throw Error('body missing');
  let timeout = false, size = 0; const chunks: Uint8Array[] = [];
  const deadline = setTimeout(() => { timeout = true; void reader.cancel().catch(() => {}); }, 5000);
  try {
    while (true) { const item = await reader.read(); if (timeout) throw Error('body timeout'); if (item.done) break; size += item.value.length; if (size > maximum) throw Error('body too large'); chunks.push(item.value); }
    return Buffer.concat(chunks);
  } finally { clearTimeout(deadline); void reader.cancel().catch(() => {}); }
}
try {
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const url = new URL(request.url);
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Permissions-Policy': 'camera=(), microphone=(), display-capture=(), geolocation=()', 'Content-Security-Policy': `default-src 'none'; script-src 'self';${workerVariant ? " worker-src 'self';" : ''} connect-src 'self'; media-src blob:; img-src 'self' data: blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` };
    if (ended) return new Response('ended', { status: 410, headers });
    if (request.method === 'GET' && url.pathname === '/config') return Response.json(config, { headers });
    if (request.method === 'GET' && assets.has(url.pathname)) { const item = assets.get(url.pathname)!; return new Response(item.bytes, { headers: { ...headers, 'Content-Type': item.mime } }); }
    if (request.method !== 'POST' || request.headers.get('origin') !== url.origin) return new Response('refused', { status: 403, headers });
    const kind = ['capability', 'artifact', 'result'].find(name => url.pathname === `/${name}/${nonce}`);
    if (!kind || saved.has(kind)) return new Response('not found or already sealed', { status: 409, headers });
    // 先保留路徑，讀取失敗也不可重送挑一份成功收據；不覆寫第一份本機輸出。
    saved.add(kind);
    try {
      const data = await body(request, kind === 'artifact' ? 16_000_000 : 2_000_000);
      if (ended) throw Error('host ended');
      if (kind !== 'artifact') JSON.parse(data.toString());
      const name = kind === 'artifact' ? 'first-output.mp4' : `${kind}.local.json`;
      writeFileSync(resolve(receiptFolder, name), data, { flag: 'wx' });
      return new Response('saved', { headers });
    } catch (error) { return new Response(String(error), { status: 400, headers }); }
  } });
  timer = setTimeout(() => { void stop('lifetime timeout', false); }, 600_000);
  process.stdin.setEncoding('utf8'); process.stdin.on('data', data => { if (data.toString().trim() === 'finish-safe') void stop('explicit browser-closed finish', true); }); process.stdin.resume();
  process.once('SIGINT', () => { void stop('SIGINT before browser audit', false); });
  process.once('SIGTERM', () => { void stop('SIGTERM before browser audit', false); });
  const record = { ...config, origin: `http://127.0.0.1:${server.port}`, pid: process.pid };
  writeFileSync(resolve(receiptFolder, 'host.local.json'), JSON.stringify(record, null, 2), { flag: 'wx' }); console.log(JSON.stringify(record));
} catch (error) { console.error(error); await stop('startup failure before browser', true); throw error; }
