/* 檔案用途：用合成 OAuth／Drive 回應走真正首頁的雲端保存與接續。所在層：瀏覽器回歸入口。主要關聯：cloud-drive.ts、CLOUD_SYNC_SHARING.md；不是實際 Google／雙實體裝置驗收。 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { chromium, type BrowserContext } from 'playwright-core'
import { cloudDriveFixture } from '../tests/fixtures/cloud-drive'
import { webHeaders, webPaths } from './web-assets'
const root = resolve(import.meta.dir, '..'), out = resolve(root, 'output/playwright/cloud')
mkdirSync(out, { recursive: true })
for (const [name, color] of [['reference', 'blue'], ['self', 'red']]) {
  const result = Bun.spawnSync(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=160x120:r=30:d=2`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libvpx', '-c:a', 'libopus', '-shortest', resolve(out, `${name}.webm`)], { stdout: 'pipe', stderr: 'pipe' })
  assert.equal(result.exitCode, 0, result.stderr.toString())
}
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: request => {
  const file = webPaths.get(new URL(request.url).pathname)
  return file ? new Response(Bun.file(resolve(root, 'dist/web', file)), { headers: webHeaders }) : new Response('missing', { status: 404 })
} })
const fixture = cloudDriveFixture(), errors: string[] = [], contexts: BrowserContext[] = []
let failShareReceipt = false
const browser = await chromium.launch({ executablePath: process.env.DANCE_STAMP_CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
async function page() {
  const context = await browser.newContext({ serviceWorkers: 'block' }); contexts.push(context)
  await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: `window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:config=>({requestAccessToken:()=>{window.syntheticOAuthReturn=()=>config.callback({access_token:'owner-a',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'});if(!window.syntheticHoldOAuth)queueMicrotask(window.syntheticOAuthReturn)}})}}};` }))
  await context.route('https://www.googleapis.com/**', async route => {
    const request = route.request(), headers = await request.allHeaders(), raw = request.postDataBuffer()
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,content-range,range,x-upload-content-type,x-upload-content-length', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' } }); return }
    const init = { method: request.method(), headers: { ...headers, Authorization: headers.authorization, Range: headers.range, 'Content-Range': headers['content-range'] }, body: raw && (request.method() === 'PUT' ? new Blob([raw]) : raw.toString()) }
    // 模擬請求未送達，而不是假裝遠端已保存；重試必須補齊另一裝置可讀的收據。
    if (failShareReceipt && request.method() === 'PATCH') { failShareReceipt = false; await route.abort('failed'); return }
    try {
      const response = await fixture.fetcher(request.url(), init)
      await route.fulfill({ status: response.status, headers: { ...Object.fromEntries(response.headers), 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Location,Range,Content-Length' }, body: Buffer.from(await response.arrayBuffer()) })
    } catch (error) { console.log('synthetic route failure', error instanceof Error ? error.message : 'unknown'); await route.abort('failed') }
  })
  const result = await context.newPage(); result.setDefaultTimeout(15000); result.on('pageerror', error => errors.push(error.message))
  await result.goto(`http://127.0.0.1:${server.port}/`); await result.waitForFunction(() => !document.getElementById('select-video')?.matches(':disabled'))
  return result
}
async function idle(p) { await p.waitForFunction(() => document.getElementById('controls')?.getAttribute('aria-busy') !== 'true') }
async function connect(p) {
  await p.locator('#open-cloud').click(); await p.locator('#cloud-dialog summary').first().click()
  await p.locator('#cloud-client').fill('123-synthetic.apps.googleusercontent.com')
  await p.locator('#cloud-load').click(); await idle(p)
  await p.evaluate(() => { (window as any).syntheticHoldOAuth = true }); await p.locator('#cloud-connect').click();
  await p.evaluate(() => {
    // 只模擬供應商視窗的生命週期；這不是手機實測，也不產生真的授權。
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); (window as any).syntheticOAuthReturn();
  });
  try { await p.waitForFunction(() => document.getElementById('cloud-account')?.textContent?.includes('synthetic@example.com')) }
  catch (error) { console.log(JSON.stringify({ cloudStatus: await p.locator('#cloud-status').textContent(), errors })); throw error }
  await idle(p)
}
const evidence: any = {
  simulatedProvider: true, realOAuth: '未驗證', physicalDevices: '未驗證', anonymousPlayback: '未驗證', authSurvivesSimulatedProviderBackground: true,
  sourceBase: Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim(),
  buildVersion: readFileSync(resolve(root, 'dist/web/sw.js'), 'utf8').match(/const version = '([^']+)'/)?.[1],
};
try {
  const first = await page()
  const unsolicited = await first.evaluate(() => performance.getEntriesByType('resource').filter(r => !r.name.startsWith(location.origin)).length); assert.equal(unsolicited, 0)
  await first.locator('#reference-file').setInputFiles(resolve(out, 'reference.webm')); await idle(first)
  await first.locator('#self-file').setInputFiles(resolve(out, 'self.webm')); await idle(first)
  await connect(first); await first.locator('#cloud-create-root').click(); await idle(first)
  const rootId = await first.locator('#cloud-root').inputValue(); assert.ok(rootId)
  await first.locator('#cloud-preview-practice').click(); await idle(first)
  assert.equal(await first.locator('#cloud-local-assets input').count(), 2)
  await first.locator('#cloud-local-assets input').nth(0).check(); await first.locator('#cloud-local-assets input').nth(1).check(); await first.locator('#cloud-save-confirm').check()
  await first.locator('#cloud-save-practice').click(); await idle(first)
  assert.match(await first.locator('#cloud-status').innerText(), /完整快照/)
  const complete = [...fixture.files.values()].filter(f => f.appProperties.dsKind === 'snapshot-v1'); assert.equal(complete.length, 1)
  // 兩支原片目前只在 session；接續同一份快照也必須真正保存，不能因畫面可播就略過落盤。
  await first.locator('#cloud-list-snapshots').click(); await idle(first)
  const firstSnapshot = await first.locator('#cloud-snapshots option').nth(1).getAttribute('value'); assert.ok(firstSnapshot)
  await first.locator('#cloud-snapshots').selectOption(firstSnapshot); await first.locator('#cloud-preview-snapshot').click(); await idle(first)
  for (const input of await first.locator('#cloud-remote-assets input').all()) await input.check()
  await first.locator('#cloud-download-media').click(); await idle(first); await first.locator('#cloud-restore-confirm').check()
  await first.locator('#cloud-apply-snapshot').click(); await idle(first)
  const fresh = await first.context().newPage(); await fresh.goto(first.url()); await idle(fresh)
  const savedHashes = await fresh.evaluate(async () => {
    const storage = await import('/storage.js'), hashes = []
    for (const id of await storage.readMediaKeys()) { const bytes = await (await storage.readMedia(id)).arrayBuffer(); hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')) }
    return hashes.sort()
  })
  assert.deepEqual(savedHashes, ['reference', 'self'].map(name => createHash('sha256').update(readFileSync(resolve(out, name + '.webm'))).digest('hex')).sort())
  await fresh.close(); evidence.sessionOnlyRestorePersistsAfterNewPage = true
  await first.locator('#cloud-close').click(); await first.locator('#export').click(); await idle(first)
  assert.equal(await first.locator('#output-download').isVisible(), true)
  await first.locator('#open-cloud').click(); await first.locator('#cloud-share-refresh').click()
  assert.equal(await first.locator('#cloud-share-source').inputValue(), '')
  await first.locator('#cloud-share-source').selectOption('vs')
  const beforeShare = fixture.files.size
  await first.locator('#cloud-share-publish').click(); await idle(first); assert.equal(fixture.files.size, beforeShare)
  failShareReceipt = true
  await first.locator('#cloud-public-confirm').check(); await first.locator('#cloud-share-publish').click(); await idle(first)
  assert.equal(await first.locator('#cloud-watch').isVisible(), false)
  const pendingShare = [...fixture.files.values()].find(f => f.appProperties.dsKind === 'shared-video-v1'); assert.ok(pendingShare)
  assert.equal(pendingShare.appProperties.dsPermission, undefined)
  await first.locator('#cloud-share-publish').click(); await idle(first)
  assert.equal(pendingShare.appProperties.dsPermission, 'public-reader'); evidence.shareReceiptRetryPersistsRemotely = true
  assert.equal(await first.locator('#cloud-watch').isVisible(), true)
  const shared = [...fixture.files.values()].find(f => f.appProperties.dsKind === 'shared-video-v1'); assert.ok(shared)
  assert.equal(shared.parents.includes(rootId), false); assert.equal(fixture.grants.has(rootId), false)
  await first.locator('#cloud-list-shares').click(); await idle(first); await first.locator('#cloud-shares').selectOption(shared.id)
  await first.locator('#cloud-share-state').click(); await idle(first); assert.equal(await first.locator('#cloud-watch').isVisible(), true)
  await first.locator('#cloud-share-stop').click(); await idle(first)
  assert.match(await first.locator('#cloud-status').innerText(), /權限移除/); assert.equal(fixture.grants.get(shared.id)?.length, 0); assert.equal(fixture.files.has(shared.id), true)
  assert.equal(await first.locator('#cloud-watch').isVisible(), false)
  Object.assign(evidence, { realLocalVSExport: true, shareRequiresConsent: true, separateFinishedCopy: true, simulatedPublicPermissionAndRevocation: true, privateRootUnchanged: true })
  const second = await page(); await connect(second)
  await second.locator('#cloud-roots').click(); await idle(second); await second.locator('#cloud-root').selectOption(rootId)
  await second.locator('#cloud-list-snapshots').click(); await idle(second)
  const snapshot = await second.locator('#cloud-snapshots option').nth(1).getAttribute('value'); assert.ok(snapshot)
  await second.locator('#cloud-snapshots').selectOption(snapshot); await second.locator('#cloud-preview-snapshot').click(); await idle(second)
  assert.equal(await second.locator('#cloud-remote-assets input').count(), 2)
  await second.locator('#cloud-remote-assets input').nth(0).check(); await second.locator('#cloud-remote-assets input').nth(1).check()
  await second.locator('#cloud-download-media').click(); await idle(second)
  assert.equal(await second.locator('#cloud-media-preview video').count(), 2)
  await second.locator('#cloud-restore-confirm').check(); await second.locator('#cloud-apply-snapshot').click(); await idle(second)
  assert.match(await second.locator('#cloud-status').innerText(), /原子保存/)
  await second.locator('#cloud-open-restored').click(); await idle(second)
  if (await second.locator('#cloud-dialog').evaluate(el => (el as HTMLDialogElement).open)) console.log('open-restored-status', await second.locator('#cloud-status').innerText())
  assert.equal(await second.locator('#cloud-dialog').evaluate(el => (el as HTMLDialogElement).open), false)
  const restored = await second.evaluate(async () => { const storage = await import('/storage.js'); const { data } = await storage.readLibrary(); return { takes: data.takes.length, media: (await storage.readMediaKeys()).length, recipes: data.recipes.length } })
  assert.deepEqual(restored, { takes: 1, media: 2, recipes: 1 })
  await second.locator('#open-cloud').click(); await second.locator('#cloud-preview-practice').click(); await idle(second)
  assert.equal(await second.locator('#cloud-local-assets input:checked').count(), 0)
  await second.locator('#cloud-save-confirm').check(); await second.locator('#cloud-save-practice').click(); await idle(second)
  await second.locator('#cloud-list-snapshots').click(); await idle(second)
  const newest = [...fixture.files.values()].filter(f => f.appProperties.dsKind === 'snapshot-v1').at(-1)!
  const envelope = JSON.parse(await fixture.bytes.get(newest.id)!.text())
  assert.equal(envelope.parent, snapshot); assert.equal(envelope.media.every(m => m.fileId === null), true)
  // 確認 A 後改選 B，舊預覽及確認須失效，不能顯示 B 卻套用 A。
  await second.locator('#cloud-snapshots').selectOption(snapshot); await second.locator('#cloud-preview-snapshot').click(); await idle(second)
  await second.locator('#cloud-restore-confirm').check(); await second.locator('#cloud-snapshots').selectOption(envelope.snapshot)
  assert.equal(await second.locator('#cloud-restore-confirm').isChecked(), false)
  assert.equal(await second.locator('#cloud-remote-assets input').count(), 0)
  assert.equal(await second.locator('#cloud-remote-preview').innerText(), ''); evidence.snapshotChangeInvalidatesPreview = true
  await second.locator('#cloud-preview-snapshot').click(); await idle(second)
  assert.equal(await second.locator('#cloud-remote-assets input:disabled').count(), 2)
  await second.locator('#cloud-close').click()
  Object.assign(evidence, { nextVersionKeepsParent: true, mediaSelectionDefaultsEmpty: true, missingMediaStaysDisabled: true })
  await second.setViewportSize({ width: 390, height: 844 }); await second.locator('#open-cloud').click()
  assert.equal(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await second.screenshot({ path: resolve(out, 'narrow.png') }); await second.keyboard.press('Escape')
  assert.equal(await second.evaluate(() => document.activeElement?.id), 'open-cloud')
  Object.assign(evidence, { browser: browser.version(), noUnsolicitedRemote: true, realUIUploadAndReadback: true, separateBrowserContextImport: restored, narrowNoOverflow: true, escapeFocusReturn: true, errors })
  assert.deepEqual(errors, [])
  evidence.sourceHashes = Object.fromEntries(['web/main.js', 'web/storage.js', 'web/library.js', 'web/cloud-ui.js', 'web/cloud-practice-ui.js', 'web/cloud-snapshot.js', 'web/cloud-share-ui.js', 'web/cloud-sharing.js', 'web/google-drive.js', 'web/cloud-auth.js', 'web/follow-ui.js'].map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]))
  writeFileSync(resolve(out, 'result.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence))
} finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); fixture.drive.disconnect(); server.stop(true) }
