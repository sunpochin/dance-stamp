/* 檔案用途：用固定合成長 GOP 影片量測人物分析；只由自有原子鎖保護本機執行。所在層：開發效能工具。主要關聯：follow-performance.js、MEDIA_PROBE.md。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { webPaths, webHeaders } from './web-assets'
const root = resolve(import.meta.dir, '..'), directory = resolve(root, 'output', 'follow-benchmark-' + Date.now()), nonce = randomUUID()
const [sourceFixture, mode] = process.argv.slice(2)
assert(!mode || mode === 'compare', '第二參數只接受 compare；第一參數為既有合成片')
assert.equal(Bun.version, readFileSync(resolve(root, '.bun-version'), 'utf8').trim())
const lock = resolve(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'dance-stamp-p0-media-test.lock')
// flag wx 原子取得；既有測試不論多久都不搶鎖，也不先開主機或瀏覽器。
writeFileSync(lock, JSON.stringify({ owner: 'follow-performance-benchmark', pid: process.pid, nonce }), { flag: 'wx' })
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const command = (cmd: string[]) => { const result = Bun.spawnSync(cmd, { cwd: root }); assert.equal(result.exitCode, 0, result.stderr.toString()); return result.stdout.toString().trim() }
const evidence: any = { scope: 'Synthetic local benchmark only; not physical device, real dance, arbitrary codec or optimization acceptance.', started: new Date().toISOString(), results: [], errors: [] }
let server, browser, attempted = false, closed = false
const save = () => writeFileSync(resolve(directory, 'run.json'), JSON.stringify(evidence, null, 2))
try {
  mkdirSync(directory, { recursive: true }); mkdirSync(resolve(root, 'output/playwright'), { recursive: true })
  evidence.sourceHead = command(['git', 'rev-parse', 'HEAD']); evidence.trackedChanges = !!command(['git', 'status', '--porcelain', '--untracked-files=no'])
  evidence.staticBuild = readFileSync(resolve(root, 'dist/web/sw.js'), 'utf8').match(/const version = '([^']+)'/)?.[1]
  const fixture = resolve(directory, 'synthetic-long-gop.mp4'), image = resolve(root, 'tests/fixtures/follow-person.jpg')
  // 同一支 60 秒影片供所有區間、兩側及重跑；不讀私人來源、不覆寫舊輪。
  // 前後比較複製同一份 bytes，不用重新編碼後看起來相似的影片冒充同檔。
  if (sourceFixture) copyFileSync(resolve(sourceFixture), fixture, constants.COPYFILE_EXCL)
  else command(['ffmpeg', '-v', 'error', '-n', '-f', 'lavfi', '-i', 'color=c=0xcccccc:s=960x540:r=30:d=60', '-loop', '1', '-i', image, '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=60', '-filter_complex', "[1:v]scale=320:480[person];[0:v][person]overlay=x='240+180*sin(t/2)':y=30:shortest=1[v]", '-map', '[v]', '-map', '2:a', '-t', '60', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-g', '300', '-keyint_min', '300', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', fixture])
  const probe = JSON.parse(command(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', fixture]))
  assert.equal(probe.streams[0].width, 960); assert.equal(probe.streams[0].height, 540); assert.equal(probe.streams[0].r_frame_rate, '30/1'); assert(Math.abs(Number(probe.format.duration) - 60) < .01)
  evidence.fixture = { sha256: sha(readFileSync(fixture)), imageSha256: sha(readFileSync(image)), dimensions: '960x540', fps: 30, durationSeconds: 60, keyframeIntervalFrames: 300 }
  const keyframes = JSON.parse(command(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', fixture])).frames.map(frame => Number(frame.best_effort_timestamp_time))
  assert.deepEqual(keyframes, [0, 10, 20, 30, 40, 50]); evidence.fixture.keyframesSeconds = keyframes
  evidence.sources = Object.fromEntries(['web/follow-ui.js', 'web/person-worker.js', 'web/follow-metrics.js'].map(file => [file, sha(readFileSync(resolve(root, file)))]))
  evidence.harnessSources = Object.fromEntries(['scripts/benchmark-follow.ts', 'tests/browser/follow-performance.js', 'web/follow.js'].map(file => [file, sha(readFileSync(resolve(root, file)))]))
  evidence.environment = { bun: Bun.version, platform: process.platform, cpu: process.platform === 'darwin' ? command(['sysctl', '-n', 'machdep.cpu.brand_string']) : command(['uname', '-m']), os: process.platform === 'darwin' ? command(['sw_vers', '-productVersion']) : command(['uname', '-sr']), ffmpeg: command(['ffmpeg', '-version']).split('\n')[0] }
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    const file = webPaths.get(new URL(request.url).pathname)
    if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : Bun.file(resolve(root, 'dist/web', file)), { headers: { ...webHeaders, 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.css') ? 'text/css' : file.endsWith('.tflite') ? 'application/octet-stream' : 'text/html' } })
  } })
  const executablePath = process.env.DANCE_STAMP_CHROMIUM || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : Bun.which('google-chrome'))
  assert(executablePath && existsSync(executablePath), '沿用已安裝 Chrome，不下載')
  attempted = true; browser = await chromium.launch({ executablePath, headless: true, args: ['--mute-audio'] }); evidence.environment.browser = browser.version(); evidence.origin = String(server.url)
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 960 } }), page = await context.newPage()
  context.on('page', page => page.on('pageerror', error => evidence.errors.push(error.message)))
  page.on('pageerror', error => evidence.errors.push(error.message)); page.setDefaultTimeout(180000)
  const began = performance.now(); await page.goto(String(server.url))
  const scenario = new Function('return (' + readFileSync(resolve(root, 'tests/browser/follow-performance.js'), 'utf8') + ')')()
  const result = await scenario(page, { benchmark: true, cacheReady: true, source: fixture, durations: [10, 30, 60], sides: ['reference', 'self'], repeats: 2, controls: mode !== 'compare', runtimes: mode === 'compare' ? ['nosimd', 'simd'] : undefined, geometry: mode === 'compare', progress(trial) {
    evidence.results.push(trial); save(); console.log(JSON.stringify({ side: trial.side, seconds: trial.duration, runtime: trial.report?.worker.runtime, run: trial.report?.sameInputRun, enabled: trial.enabled, wallMs: trial.wallMs, analysisMs: trial.report?.totalAnalysisMs, frames: trial.frames }))
  } })
  evidence.elapsedMs = performance.now() - began; evidence.status = 'passed'; evidence.checks = { ...result, trials: undefined }; assert.equal(evidence.errors.length, 0)
  await context.close()
} catch (error) { evidence.status = 'failed'; evidence.failure = String(error); process.exitCode = 1; console.error(error) }
finally {
  let failure
  try {
    if (browser) {
      let auditError
      try {
        const cdp = await browser.newBrowserCDPSession(), info = await cdp.send('SystemInfo.getProcessInfo')
        assert(info.processInfo.length && info.processInfo.every(row => Number.isSafeInteger(row.id) && row.id > 0), '缺少自有 PID 證據')
        evidence.knownProcessIds = info.processInfo.map(row => row.id)
      } catch (error) { auditError = error; evidence.processAuditError = String(error) }
      // 稽核失敗仍關閉已知 handle；close 成功也不能取代已知 PID 全退出的證據。
      await browser.close()
      assert(!auditError, '程序稽核未確認，保留鎖')
      for (let attempt = 0; attempt < 40; attempt++) { const state = Bun.spawnSync(['ps', '-p', evidence.knownProcessIds.join(','), '-o', 'pid=,stat=,comm=']); assert([0, 1].includes(state.exitCode) && !state.stderr.length); evidence.remainingProcesses = state.stdout.toString().trim(); if (!evidence.remainingProcesses) break; await Bun.sleep(100) }
      assert.equal(evidence.remainingProcesses, '', '未確認自有瀏覽器全退出，保留鎖'); closed = true
    }
    assert(!attempted || closed, '啟動結果未知，保留鎖')
  } catch (error) { failure = error; evidence.browserCleanupFailure = String(error) }
  // 各資源獨立收尾；瀏覽器、程序或 nonce 失敗不能跳過停止自己的主機與保存原失敗。
  try {
    if (server) { const url = server.url; await server.stop(true); assert.equal(await fetch(url).then(() => true, () => false), false, '自有主機仍可連線') }
    evidence.serverStopped = true
  } catch (error) { failure ||= error; evidence.serverCleanupFailure = String(error) }
  try {
    assert(!failure && evidence.serverStopped, '自有資源未確認，保留鎖')
    if (!attempted || closed) { assert.equal(JSON.parse(readFileSync(lock, 'utf8')).nonce, nonce); unlinkSync(lock); evidence.lockReleased = true }
  } catch (error) { failure ||= error; evidence.lockCleanupFailure = String(error) }
  if (failure) { evidence.cleanupFailure = String(failure); evidence.status = 'failed'; process.exitCode = 1 }
  evidence.finished = new Date().toISOString(); save(); console.log(JSON.stringify({ directory, status: evidence.status, lockReleased: evidence.lockReleased }))
}
