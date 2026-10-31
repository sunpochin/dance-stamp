/* 檔案用途：在同輪主機停止後獨立驗證升版案例的真下載與可攜備份。所在層：本機／CI成檔證據入口。主要關聯：run-app.ts、storage-version-change.js、download-playback.js。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { validateBackup } from '../../web/library.js'
const root = resolve(import.meta.dir, '../..'), sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
assert.equal(Bun.version, readFileSync(resolve(root, '.bun-version'), 'utf8').trim())
const currentHead = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }); assert.equal(currentHead.exitCode, 0)
// CI只接受同一乾淨head的唯一完整輪；本機可明確指定選定輪，不能自行挑綠燈或混加計數。
const candidates = process.argv[2] ? [resolve(root, process.argv[2])] : readdirSync(resolve(root, 'coverage')).filter(name => name.startsWith('app-')).map(name => resolve(root, 'coverage', name, 'run.json')).filter(path => existsSync(path)).filter(path => { const run = JSON.parse(readFileSync(path, 'utf8')); return run.sourceHead === currentHead.stdout.toString().trim() && !run.trackedChanges && run.matrix === 'full' && run.status === 'passed' })
assert.equal(candidates.length, 1, '請提供唯一且來源相符的本輪App收據')
const path = candidates[0]; assert(realpathSync(path).startsWith(resolve(root, 'coverage') + '/'))
const evidencePath = resolve(path, '..', 'storage-version-playback.json'); assert(!existsSync(evidencePath), '保留原重播收據，不覆寫或重跑追掉格')
const raw = readFileSync(path), run = JSON.parse(raw.toString())
assert.equal(run.status, 'passed'); assert.equal(run.errors.length, 0)
assert.equal(run.cleanup.browserClosed, true); assert.equal(run.cleanup.serverStopped, true); assert.equal(run.cleanup.lockRetained, false)
assert.equal(run.runnerSha256, sha(readFileSync(resolve(root, 'tests/app-coverage/run-app.ts'))))
assert.deepEqual(Object.keys(run.sourceHashes).sort(), readdirSync(resolve(root, 'web')).filter(name => name.endsWith('.js')).map(name => 'web/' + name).sort())
for (const [file, hash] of Object.entries(run.sourceHashes)) assert.equal(sha(readFileSync(resolve(root, file))), hash)
const scenario = run.scenarios.find(row => row.name === 'storage-version-change'); assert.equal(scenario.status, 'passed')
const result = scenario.result; assert.equal(result.scenarioSha256, sha(readFileSync(resolve(root, 'tests/browser/storage-version-change.js'))))
assert.equal(result.nativeVersionChange.closes, 1); assert.equal(result.nativeVersionChange.events.length, 1); assert.equal(result.nativeVersionChange.events[0].trusted, true)
for (const key of ['unsavedDraftRetainedBeforeReload', 'backupMatchesLastSavedData', 'sameProfileReopenPreservesFutureDatabase']) assert.equal(result[key], true)
assert.equal(result.hardwareCalls, 0); assert.equal(result.downloads.length, 3)
for (const item of result.downloads) {
  assert(realpathSync(item.path).startsWith(resolve(path, '..') + '/media/')); const bytes = readFileSync(item.path)
  assert.equal(bytes.length, item.expected.bytes); assert.equal(sha(bytes), item.expected.sha256)
  if (item.label === 'backup') {
    const rows = result.original.rows.find(row => row.name === 'metadata'), saved = rows.values[rows.keys.indexOf('library')].data, backup = JSON.parse(bytes.toString()), expected = validateBackup(saved)
    backup.exportedAt = expected.exportedAt; assert.deepEqual(backup, expected)
    for (const key of ['videos', 'markers', 'takes', 'recipes', 'exports', 'moves']) assert.deepEqual(backup[key], saved[key])
    assert(backup.assets.every(asset => asset.mediaIncluded === false && !('state' in asset) && !('storageKind' in asset)))
  }
}
const files = result.downloads.filter(item => item.label !== 'backup'); assert.equal(files.length, 2)
const lock = resolve(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'dance-stamp-p0-media-test.lock'), nonce = randomUUID()
writeFileSync(lock, JSON.stringify({ owner: 'storage-version-playback', nonce, pid: process.pid }), { flag: 'wx' })
const evidence: any = { source: path, sourceHead: run.sourceHead, trackedChanges: run.trackedChanges, receiptSha256: sha(raw), helperSha256: sha(readFileSync(import.meta.path)), environment: { bun: Bun.version, platform: process.platform, ffmpeg: Bun.spawnSync(['ffmpeg', '-version']).stdout.toString().split('\n')[0] }, scope: 'Actual synthetic imported practice original (with audio), VS and JSON after native versionchange; not Safari, arbitrary migrations, device or human hearing acceptance.', results: [], backupFileMatchedSavedData: true }
let browser, attempted = false, closed = false
try {
  const executablePath = process.env.DANCE_STAMP_CHROMIUM || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : Bun.which('google-chrome')); assert(executablePath && existsSync(executablePath), '沿用已安裝Chromium，不自動下載')
  attempted = true; browser = await chromium.launch({ executablePath, headless: true, args: ['--mute-audio'] }); evidence.browserVersion = browser.version()
  const page = await (await browser.newContext()).newPage(), verify = (0, eval)('(' + readFileSync(resolve(root, 'tests/browser/download-playback.js'), 'utf8') + ')')
  for (const item of files) {
    const probe = Bun.spawnSync(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', item.path]); assert.equal(probe.exitCode, 0)
    const streams = JSON.parse(probe.stdout.toString()).streams; assert.equal(streams.filter(row => row.codec_type === 'video').length, 1); assert.equal(streams.filter(row => row.codec_type === 'audio').length, 1)
    const playback = await verify(page, pathToFileURL(item.path).href); assert(playback.audioBytes > 0)
    // 解完所有原軌並保留時間戳；null輸出不重採樣，避免解碼核對自己製造時間戳警告。
    const decode = Bun.spawnSync(['ffmpeg', '-v', 'error', '-i', item.path, '-map', '0', '-enc_time_base', '1:90000', '-fps_mode', 'passthrough', '-f', 'null', '-']); assert.equal(decode.exitCode, 0); assert.equal(decode.stderr.toString(), '')
    assert.equal(sha(readFileSync(item.path)), item.expected.sha256); evidence.results.push({ ...item, audioTracks: 1, playback, fullDecode: true })
  }
} catch (error) { evidence.failure = String(error); throw error }
finally {
  try {
    if (browser) {
      const cdp = await browser.newBrowserCDPSession(); evidence.knownProcessIds = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(row => row.id); await browser.close()
      for (let i = 0; i < 40; i++) { const state = Bun.spawnSync(['/bin/ps', '-p', evidence.knownProcessIds.join(','), '-o', 'pid=,stat=,comm=']); assert([0, 1].includes(state.exitCode) && !state.stderr.length); evidence.remainingKnownProcesses = state.stdout.toString().trim(); if (!evidence.remainingKnownProcesses) break; await Bun.sleep(100) }
      assert.equal(evidence.remainingKnownProcesses, ''); closed = true
    }
  } finally {
    // 未確認自有播放器退出就保留鎖；只釋放本輪nonce，不碰其他聊天的QA。
    if (!attempted || closed) { assert.equal(JSON.parse(readFileSync(lock, 'utf8')).nonce, nonce); unlinkSync(lock); evidence.lockReleased = true }
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), { flag: 'wx' })
    console.log('storage-version independent downloads:', JSON.stringify(evidence))
  }
}
console.log(JSON.stringify({ played: evidence.results.length, backupFileMatchedSavedData: true, lockReleased: evidence.lockReleased }))
