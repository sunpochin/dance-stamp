/* 檔案用途：關站後驗 SIMD／相容／回退模式的真下載。所在層：合成成檔證據。主要關聯：follow-runtime.js、download-playback.js、harness-ci.yml。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
const root = resolve(import.meta.dir, '../..'), sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
assert.equal(Bun.version, readFileSync(resolve(root, '.bun-version'), 'utf8').trim())
const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }); assert.equal(revision.exitCode, 0)
const head = revision.stdout.toString().trim()
const candidates = process.argv[2] ? [resolve(process.argv[2])] : readdirSync(resolve(root, 'coverage')).filter(name => name.startsWith('app-')).map(name => resolve(root, 'coverage', name, 'run.json')).filter(existsSync).filter(path => { const run = JSON.parse(readFileSync(path, 'utf8')); return run.sourceHead === head && !run.trackedChanges && run.matrix === 'full' && run.status === 'passed' })
assert.equal(candidates.length, 1, '請指定唯一且來源相符的本輪 App 收據')
const path = candidates[0], raw = readFileSync(path), run = JSON.parse(raw.toString())
assert(realpathSync(path).startsWith(resolve(root, 'coverage') + '/')); assert.equal(run.sourceHead, head)
assert.equal(run.status, 'passed'); assert.equal(run.errors.length, 0)
assert.equal(run.cleanup.browserClosed, true); assert.equal(run.cleanup.serverStopped, true); assert.equal(run.cleanup.lockRetained, false)
assert.equal(run.runnerSha256, sha(readFileSync(resolve(root, 'tests/app-coverage/run-app.ts'))))
assert.deepEqual(Object.keys(run.sourceHashes).sort(), readdirSync(resolve(root, 'web')).filter(name => name.endsWith('.js')).map(name => 'web/' + name).sort())
for (const [file, hash] of Object.entries(run.sourceHashes)) assert.equal(sha(readFileSync(resolve(root, file))), hash)
const scenario = run.scenarios.find(item => item.name === 'follow-runtime'); assert.equal(scenario.status, 'passed')
const files = scenario.result.downloads; assert.deepEqual(files.map(item => item.mode).sort(), ['simd', 'unsupported', 'wasm-failure'])
for (const file of files) assert(realpathSync(file.path).startsWith(resolve(path, '..', 'media') + '/'))
const lock = resolve(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'dance-stamp-p0-media-test.lock'), nonce = randomUUID()
writeFileSync(lock, JSON.stringify({ owner: 'follow-runtime-playback', nonce, pid: process.pid }), { flag: 'wx' })
const evidence: any = { sourceHead: head, sourceReceiptSha256: sha(raw), helperSha256: sha(readFileSync(import.meta.path)), scope: 'Synthetic runtime downloads only; not device, Safari, human hearing or arbitrary dance acceptance.', results: [], status: 'running' }
let browser, attempted = false, exited = false, failure
try {
  const executablePath = process.env.DANCE_STAMP_CHROMIUM || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : Bun.which('google-chrome'))
  assert(executablePath && existsSync(executablePath)); attempted = true
  browser = await chromium.launch({ executablePath, headless: true, args: ['--mute-audio'] }); evidence.browser = browser.version()
  const page = await (await browser.newContext()).newPage(), verify = new Function('return (' + readFileSync(resolve(root, 'tests/browser/download-playback.js'), 'utf8') + ')')()
  for (const file of files) {
    const hash = sha(readFileSync(file.path)), probe = Bun.spawnSync(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', file.path]); assert.equal(probe.exitCode, 0)
    const streams = JSON.parse(probe.stdout.toString()).streams
    assert.equal(streams.filter(stream => stream.codec_type === 'video').length, 1); assert.equal(streams.filter(stream => stream.codec_type === 'audio').length, 1)
    const playback = await verify(page, pathToFileURL(file.path).href); assert(playback.audioBytes > 0)
    const decode = Bun.spawnSync(['ffmpeg', '-v', 'error', '-i', file.path, '-map', '0', '-enc_time_base', '1:90000', '-fps_mode', 'passthrough', '-f', 'null', '-'])
    assert.equal(decode.exitCode, 0); assert.equal(decode.stderr.toString(), ''); assert.equal(sha(readFileSync(file.path)), hash)
    evidence.results.push({ mode: file.mode, sha256: hash, playback, audioTracks: 1, fullDecode: true })
  }
} catch (error) { failure = error; evidence.failure = String(error) }
finally {
  try {
    if (browser) {
      let auditError
      try { const cdp = await browser.newBrowserCDPSession(); evidence.pids = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(item => item.id); assert(evidence.pids.length && evidence.pids.every(id => Number.isSafeInteger(id) && id > 0)) }
      catch (error) { auditError = error }
      // 稽核失敗也先關已知 handle；沒有完整 PID 證據仍保留鎖，不能用 close 冒充退出。
      await browser.close(); if (auditError) throw auditError
      for (let i = 0; i < 40; i++) { const state = Bun.spawnSync(['ps', '-p', evidence.pids.join(','), '-o', 'pid=,stat=,comm=']); assert([0, 1].includes(state.exitCode) && !state.stderr.length); evidence.remainingProcesses = state.stdout.toString().trim(); if (!evidence.remainingProcesses) break; await Bun.sleep(100) }
      assert.equal(evidence.remainingProcesses, ''); exited = true
    }
    assert(!attempted || exited); assert.equal(JSON.parse(readFileSync(lock, 'utf8')).nonce, nonce); unlinkSync(lock); evidence.lockReleased = true
  } catch (error) { failure ||= error; evidence.cleanupFailure = String(error) }
  evidence.status = failure ? 'failed' : 'passed'; if (failure) process.exitCode = 1
  const target = resolve(path, '..', 'follow-runtime-playback-' + Date.now() + '.json'); writeFileSync(target, JSON.stringify(evidence, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ target, ...evidence }))
}
