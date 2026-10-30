/* 檔案用途：故障時不得把未確認退出的瀏覽器鎖交給下一輪。所在層：QA 工具收尾回歸。主要關聯：forced-install-restart.ts、verify-native-quota.ts。 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, test } from 'bun:test'

const transpiler = new Bun.Transpiler({ loader: 'ts' })
const forced = readFileSync(new URL('../browser/forced-install-restart.ts', import.meta.url), 'utf8')
const quota = readFileSync(new URL('../../scripts/verify-native-quota.ts', import.meta.url), 'utf8')
const cleanup = (source: string) => source.slice(source.lastIndexOf('} finally {') + '} finally {'.length).replace(/}\s*$/, '')
test('自有 DevTools 端點先出現空檔時，等有效 port 才連線', async () => {
  const state = harness(), urls: string[] = [], child = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null, stderr: new EventEmitter() })
  Object.assign(state, { evidence: {}, executable: '/synthetic/browser', mkdirSync() {}, appendFileSync() {}, existsSync: () => false, spawn: () => child, reads: 0 })
  state.waitFor = async check => {
    state.existsSync = () => true
    // 執行真正 launch 的前置條件；只讓 OS 檔案分兩次可見，不啟動瀏覽器。
    expect(await check()).toBe(false)
    expect(await check()).toBe(true)
  }
  state.readFileSync = () => state.reads++ === 0 ? '' : '43123\n/devtools/browser/synthetic'
  state.chromium = { connectOverCDP: async url => { urls.push(url); throw new Error('synthetic stop after verified endpoint') } }
  const launch = forced.slice(forced.indexOf('async function launch('), forced.indexOf('\nconst ready ='))
  await expect(runInNewContext(transpiler.transformSync(`(async () => { ${launch}\nawait launch('prepare') })()`), state)).rejects.toThrow('synthetic stop after verified endpoint')
  expect(urls).toEqual(['http://127.0.0.1:43123'])
})
function harness() {
  const removed: string[] = [], signals: unknown[] = [], events: unknown[] = []
  const state: any = {
    assert, ok: assert.ok, Buffer, setTimeout, clearTimeout, queueMicrotask,
    removed, signals, events, nonce: 'synthetic-owner', ownerFile: '/synthetic/owner.json', lock: '/synthetic/lock', lockPath: '/synthetic/lock',
    readFileSync: () => JSON.stringify({ nonce: 'synthetic-owner' }),
    unlinkSync: (path: string) => removed.push(path), rmdirSync: (path: string) => removed.push(path), existsSync: () => removed.length === 0,
    console: { log() {} }, save() {}, event: (...args: unknown[]) => events.push(args),
    join: (...parts: string[]) => parts.join('/'), resolve: (...parts: string[]) => parts.join('/'),
    run: '/synthetic/run', profile: '/synthetic/profile', oldVersion: 'synthetic-old', candidateVersion: 'synthetic-next',
    process: { exitCode: 0, kill: (...args: unknown[]) => signals.push(args) },
    pending: [], server: undefined, context: undefined, cdp: undefined, origin: undefined,
    // 映像案例仍執行真正 finally；舊配額案例預設沒有掛載，避免只因缺狀態而提早拋錯。
    lowSpace: false, attached: false, attachUnconfirmed: false, ownsFiller: false, launchUnconfirmed: false, volume: '/synthetic/volume', image: '/synthetic/volume.dmg',
    waitFor: async (check: () => boolean, message: string) => assert(check(), message),
  }
  return state
}

for (const mode of ['audit-error', 'exited-with-survivor', 'exited-empty', 'running-clean', 'nonce-changed', 'owner-read-error']) test(`強制中斷工具收尾 ${mode} 必須先確認整個自有程序群組`, async () => {
  const alreadyExited = mode.startsWith('exited') || ['nonce-changed', 'owner-read-error'].includes(mode)
  const state = harness(), child = Object.assign(new EventEmitter(), { pid: 123, exitCode: alreadyExited ? 0 : null, signalCode: null })
  Object.assign(state, { child, ownsLock: true, evidence: { status: 'passed' }, probes: 0 })
  state.server = { stop: () => { state.serverStopped = true } }
  if (mode === 'nonce-changed') state.readFileSync = () => JSON.stringify({ nonce: 'another-owner' })
  if (mode === 'owner-read-error') state.readFileSync = () => { throw new Error('synthetic owner read denied') }
  let signalled = false
  state.members = () => {
    state.probes++
    if (mode === 'audit-error') throw new Error('synthetic ps denied')
    return alreadyExited && mode !== 'exited-with-survivor' || signalled ? [] : ['123 1 123 synthetic --user-data-dir=/synthetic/profile']
  }
  state.process.kill = (...args: unknown[]) => {
    state.signals.push(args); signalled = true
    queueMicrotask(() => { child.exitCode = 0; child.emit('exit', 0, 'SIGTERM') })
  }
  // 執行真正工具的 stop 與 finally；只有 OS／檔案操作用替身，不啟動或終止任何瀏覽器。
  const stop = forced.slice(forced.indexOf('async function stop('), forced.indexOf('\nasync function launch('))
  await runInNewContext(transpiler.transformSync(`(async () => { ${stop}\n${cleanup(forced)} })()`), state)
  const verified = ['exited-empty', 'running-clean'].includes(mode)
  expect(state.probes).toBeGreaterThan(0)
  expect(state.evidence.lockReleased === true).toBe(verified)
  expect(state.removed.length > 0).toBe(verified)
  if (!verified) { expect(state.evidence.status).toBe('failed'); expect(state.process.exitCode).toBe(1) }
  expect(state.signals).toHaveLength(mode === 'running-clean' ? 1 : 0)
  expect(state.serverStopped).toBe(true)
})

for (const mode of ['audit-error', 'ps-error', 'ps-denied', 'clean']) test(`原生 quota 工具收尾 ${mode} 不能以 context.close 冒充程序已退出`, async () => {
  const state = harness()
  Object.assign(state, { locked: true, report: { passed: true }, closed: 0 })
  state.context = {
    browser: () => ({ newBrowserCDPSession: async () => ({ send: async () => {
      if (mode === 'audit-error') throw new Error('synthetic CDP unavailable')
      return { processInfo: [{ id: 123 }] }
    } }) }),
    close: async () => { state.closed++ },
  }
  state.Bun = { spawnSync: () => ({ exitCode: mode === 'ps-error' ? 2 : 1, stdout: Buffer.from(''), stderr: Buffer.from(mode === 'ps-denied' ? 'ps: operation not permitted' : '') }), sleep: async () => {} }
  const close = quota.slice(quota.indexOf('const closeOwnedBrowser = async'), quota.indexOf('\ntry {', quota.indexOf('const closeOwnedBrowser = async')))
  const release = quota.slice(quota.indexOf('const releaseVolume = () => {'), quota.indexOf('\nconst closeOwnedBrowser = async'))
  // 重現主流程已 close context、後續核對失敗才進 finally，不能只測 finally 自己呼叫 close 的分支。
  await runInNewContext(transpiler.transformSync(`(async () => { ${release}\n${close}\ntry { await closeOwnedBrowser() } catch (error) { report.error = { message: String(error) }; process.exitCode = 1 }\n${cleanup(quota)} })()`), state)
  expect(state.closed).toBe(1)
  expect(state.report.lockReleased === true).toBe(mode === 'clean')
  expect(state.removed.length > 0).toBe(mode === 'clean')
  expect(state.report.passed).toBe(mode === 'clean')
  if (mode !== 'clean') expect(state.report.browserCloseError).toBeTruthy()
})

for (const mode of ['create-error', 'create-partial', 'attach-error', 'attach-partial', 'clean']) test(`低空間映像建立 ${mode} 不得把掛載失敗當作沒有裝置`, async () => {
  const state = harness(), calls: unknown[][] = []
  Object.assign(state, { lowSpace: true, locked: true, report: {}, mkdirSync() {}, statfsSync: () => ({ bavail: 2 ** 20, bsize: 4096 }), diskSpace: () => ({ device: 42 }) })
  state.execFileSync = (...args: any[]) => {
    calls.push(args)
    const operation = args[1][0]
    // attach 可以已建立裝置才失敗；回傳錯誤本身不能證明沒有留下掛載。
    if (operation === 'create' && mode === 'create-partial') state.imageExists = true
    if (operation === 'attach' && mode === 'attach-partial') state.deviceExists = true
    if (operation === 'create' && mode.startsWith('create-') || operation === 'attach' && mode.startsWith('attach-')) throw new Error(`synthetic ${mode}`)
  }
  const mount = quota.slice(quota.indexOf('  if (lowSpace) {'), quota.indexOf('\n  report.source ='))
  const release = quota.slice(quota.indexOf('const releaseVolume = () => {'), quota.indexOf('\nconst closeOwnedBrowser = async'))
  await runInNewContext(transpiler.transformSync(`(async () => { ${release}\ntry { ${mount}\nthrow new Error('synthetic downstream failure') } catch (error) { report.error = String(error); process.exitCode = 1 }\n${cleanup(quota)} })()`), state)
  expect(state.report.passed).toBe(false)
  expect(state.report.volumeAttachUnconfirmed).toBe(mode.startsWith('attach-'))
  expect(state.report.lockReleased === true).toBe(mode.startsWith('create-') || mode === 'clean')
  expect(calls.filter(call => call[1][0] === 'detach')).toEqual(mode === 'clean' ? [['hdiutil', ['detach', state.volume]]] : [])
  if (mode.startsWith('attach-')) expect(state.report.lockReleaseError).toBeTruthy()
  if (mode.startsWith('create-')) expect(calls.some(call => call[1][0] === 'attach')).toBe(false)
  if (mode === 'create-partial') expect(state.imageExists).toBe(true)
  if (mode === 'attach-partial') expect(state.deviceExists).toBe(true)
})

for (const mode of ['clean', 'detach-error', 'launch-unknown', 'audit-error']) test(`低空間工具收尾 ${mode} 只卸載自有映像，未確認時留鎖`, async () => {
  const state = harness(), calls: unknown[] = []
  Object.assign(state, { locked: true, attached: true, context: undefined, report: { passed: true }, launchUnconfirmed: mode === 'launch-unknown' })
  if (mode === 'audit-error') state.report.browserCloseError = 'synthetic browser cleanup unverified'
  state.execFileSync = (...args: unknown[]) => { calls.push(args); if (mode === 'detach-error') throw new Error('synthetic volume busy') }
  const release = quota.slice(quota.indexOf('const releaseVolume = () => {'), quota.indexOf('\nconst closeOwnedBrowser = async'))
  // 只替換 OS 卸載邊界；不能把不確定的瀏覽器或忙碌磁碟假定為已清理。
  await runInNewContext(transpiler.transformSync(`(async () => { ${release}\n${cleanup(quota)} })()`), state)
  expect(calls).toEqual(['clean', 'detach-error'].includes(mode) ? [['hdiutil', ['detach', state.volume]]] : [])
  expect(state.report.volumeDetached === true).toBe(mode === 'clean')
  expect(state.report.lockReleased === true).toBe(mode === 'clean')
  expect(state.removed.length > 0).toBe(mode === 'clean')
  if (mode !== 'clean') expect(state.report.lockReleaseError).toBeTruthy()
  if (mode === 'detach-error') expect(state.process.exitCode).toBe(1)
})

for (const mode of ['enospc', 'fsync-error', 'write-error', 'close-error', 'open-error', 'foreign-device', 'oversized-volume', 'unlink-error']) test(`低空間填充 ${mode} 只處理本輪建立的檔案`, async () => {
  const state = harness(), opened: unknown[] = [], closed: number[] = [], unlinked: string[] = []
  const filler = state.volume + '/owned-filler'
  Object.assign(state, { attached: true, lowSpace: true, locked: true, filler, report: { passed: true }, writes: 0 })
  state.statfsSync = () => ({ blocks: (mode === 'oversized-volume' ? 512 : 256) * 256, bsize: 4096, bavail: state.writes ? 0 : 1024 })
  state.statSync = (path: string) => ({ dev: path === state.run || mode === 'foreign-device' ? 1 : 2 })
  state.openSync = (...args: unknown[]) => { opened.push(args); if (mode === 'open-error') throw Object.assign(new Error('synthetic existing filler'), { code: 'EEXIST' }); return 7 }
  state.writeSync = () => {
    state.writes++
    if (mode === 'write-error' || state.writes > 1) throw Object.assign(new Error('synthetic write failure'), { code: mode === 'write-error' ? 'EIO' : 'ENOSPC' })
    return 65536
  }
  state.fsyncSync = () => { if (mode === 'fsync-error') throw Object.assign(new Error('synthetic fsync failure'), { code: 'ENOSPC' }) }
  state.closeSync = (fd: number) => { closed.push(fd); if (mode === 'close-error') throw new Error('synthetic close failure') }
  state.unlinkSync = (path: string) => {
    if (path === filler) { unlinked.push(path); if (mode === 'unlink-error') throw new Error('synthetic filler release denied') }
    else state.removed.push(path)
  }
  state.execFileSync = () => {}
  const volumeHelpers = quota.slice(quota.indexOf('const diskSpace ='), quota.indexOf('\nconst closeOwnedBrowser = async'))
  // 執行原工具的填充、釋放與 finally；只替換 OS 邊界，避免建立實際檔案或填滿磁碟。
  await runInNewContext(transpiler.transformSync(`(async () => { ${volumeHelpers}\ntry { fillVolume() } catch (error) { report.error = String(error); process.exitCode = 1 }\n${cleanup(quota)} })()`), state)
  const ownsFile = !['open-error', 'foreign-device', 'oversized-volume'].includes(mode)
  expect(opened).toHaveLength(['foreign-device', 'oversized-volume'].includes(mode) ? 0 : 1)
  if (opened.length) expect(opened[0]).toEqual([filler, 'wx'])
  expect(closed).toEqual(ownsFile ? [7] : [])
  expect(unlinked).toEqual(ownsFile ? [filler] : [])
  expect(state.report.passed).toBe(mode === 'enospc')
  expect(state.report.volumeDetached).toBe(true)
  expect(state.report.lockReleased).toBe(true)
  if (mode === 'enospc') expect(state.report.diskFills[0].diskFull).toBe(true)
  if (mode === 'unlink-error') expect(state.report.diskReleaseError).toBeTruthy()
})

for (const mode of ['no-handle', 'setup-error', 'close-error', 'clean']) test(`低空間瀏覽器啟動 ${mode} 按真正 handle 與退出證據收尾`, async () => {
  const state = harness(), diskCalls: unknown[] = []
  Object.assign(state, { attached: true, lowSpace: true, locked: true, report: { passed: true }, origin: 'http://synthetic.test', executablePath: '/synthetic/chromium', closed: 0 })
  const page = { goto: async () => {} }, session = { send: async () => ({ processInfo: [{ id: 123 }] }) }
  state.chromium = { launchPersistentContext: async () => {
    if (mode === 'no-handle') throw new Error('synthetic launch failed after spawn')
    return {
      route: async () => { if (mode === 'setup-error') throw new Error('synthetic route setup failed') }, addInitScript: async () => {}, pages: () => [page], newCDPSession: async () => session,
      browser: () => ({ newBrowserCDPSession: async () => session }),
      close: async () => { state.closed++; if (mode === 'close-error') throw new Error('synthetic context close failed') },
    }
  } }
  state.Bun = { spawnSync: () => ({ exitCode: 1, stdout: Buffer.from(''), stderr: Buffer.from('') }), sleep: async () => {} }
  state.execFileSync = (...args: unknown[]) => diskCalls.push(args)
  const launch = quota.slice(quota.indexOf('  const launch = async () => {'), quota.indexOf('\n  let page = await launch()'))
  const owners = quota.slice(quota.indexOf('const releaseVolume = () => {'), quota.indexOf('\ntry {', quota.indexOf('const closeOwnedBrowser = async')))
  await runInNewContext(transpiler.transformSync(`(async () => { ${owners}\n${launch}\ntry { await launch() } catch (error) { report.error = String(error); process.exitCode = 1 }\n${cleanup(quota)} })()`), state)
  const verified = ['setup-error', 'clean'].includes(mode)
  expect(state.closed).toBe(mode === 'no-handle' ? 0 : 1)
  expect(state.report.passed).toBe(mode === 'clean')
  expect(state.report.lockReleased === true).toBe(verified)
  expect(diskCalls).toEqual(verified ? [['hdiutil', ['detach', state.volume]]] : [])
  if (!verified) expect(state.report.lockReleaseError).toBeTruthy()
})

for (const mode of ['no-pid', 'pid-unverified', 'no-pid-unverified']) test(`瀏覽器 spawn 被拒絕 ${mode}，只釋放確定沒有程序的自有鎖`, async () => {
  const state = harness(), native = Object.assign(new EventEmitter(), { pid: mode.startsWith('no-pid') ? undefined : 123, exitCode: null as number | null, signalCode: null, stderr: new EventEmitter() })
  Object.assign(state, { ownsLock: true, evidence: { status: 'running' }, child: undefined, executable: '/synthetic/not-executable', probes: 0, mkdirSync() {}, appendFileSync() {} })
  state.server = { stop: () => { state.serverStopped = true } }
  state.existsSync = () => false
  state.members = () => { state.probes++; return ['123 1 123 synthetic survivor'] }
  state.spawn = () => {
    // error 是未成功啟動的直接證據；有 PID 的錯誤仍不能推論整個群組已退出。
    if (mode !== 'no-pid-unverified') queueMicrotask(() => { native.exitCode = -13; native.emit('error', new Error('synthetic spawn EACCES')) })
    return native
  }
  state.waitFor = async (check: () => boolean) => { await Promise.resolve(); assert(check(), 'synthetic startup timeout') }
  const stop = forced.slice(forced.indexOf('async function stop('), forced.indexOf('\nasync function launch('))
  const launch = forced.slice(forced.indexOf('async function launch('), forced.indexOf('\nconst ready ='))
  await runInNewContext(transpiler.transformSync(`(async () => { ${stop}\n${launch}\ntry { await launch('prepare') } catch (error) { evidence.status = 'failed'; evidence.error = String(error); process.exitCode = 1 }\n${cleanup(forced)} })()`), state)
  expect(state.evidence.status).toBe('failed')
  expect(state.evidence.lockReleased === true).toBe(mode === 'no-pid')
  expect(state.removed.length > 0).toBe(mode === 'no-pid')
  expect(state.probes).toBe(mode === 'pid-unverified' ? 1 : 0)
  expect(state.signals).toHaveLength(0)
  expect(state.serverStopped).toBe(true)
  expect(state.events.some(([name]: string[]) => name === 'spawn-error')).toBe(mode !== 'no-pid-unverified')
})
