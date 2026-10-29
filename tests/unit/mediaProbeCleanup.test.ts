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
    pending: [], server: undefined, cdp: undefined, origin: undefined,
    // 映像案例仍執行真正 finally；舊配額案例預設沒有掛載，避免只因缺狀態而提早拋錯。
    lowSpace: false, attached: false, ownsFiller: false, launchUnconfirmed: false, volume: '/synthetic/volume',
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

for (const mode of ['audit-error', 'ps-error', 'clean']) test(`原生 quota 工具收尾 ${mode} 不能以 context.close 冒充程序已退出`, async () => {
  const state = harness()
  Object.assign(state, { locked: true, report: { passed: true }, closed: 0 })
  state.context = {
    browser: () => ({ newBrowserCDPSession: async () => ({ send: async () => {
      if (mode === 'audit-error') throw new Error('synthetic CDP unavailable')
      return { processInfo: [{ id: 123 }] }
    } }) }),
    close: async () => { state.closed++ },
  }
  state.Bun = { spawnSync: () => ({ exitCode: mode === 'ps-error' ? 2 : 1, stdout: Buffer.from('') }), sleep: async () => {} }
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
