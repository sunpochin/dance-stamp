/* 檔案用途：固定 #203 原始來源，在Linux比較前置與訂閱就緒競爭。所在層：獨立診斷，不進產品或覆蓋率分母。主要關聯：keyboard-protocol.ts、harness-ci.yml、issue-103-keyboard-chooser.md。 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { observeKeyboardProtocol } from '../app-coverage/keyboard-protocol'

const historicalHead = 'f1ac4efa3d0277a9c5b605a2acbe639ef22a7aec'
const controls = ['existing-mode', 'select-video', 'reference-file']
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const plans = {
  cold: { prefix: false, delayMs: 0, ready: false, cancel: false, expected: 'pass' },
  prefix: { prefix: true, delayMs: 0, ready: false, cancel: false, expected: 'pass' },
  delayed: { prefix: false, delayMs: 250, ready: false, cancel: false, expected: 'timeout' },
  ready: { prefix: false, delayMs: 250, ready: true, cancel: false, expected: 'pass' },
  'cancel-input': { prefix: false, delayMs: 250, ready: true, cancel: true, expected: 'timeout' },
} as const

async function preload() {
  const directory = process.env.DANCE_KEYBOARD_EVIDENCE!, source = process.env.DANCE_KEYBOARD_SOURCE!
  const plan = plans[process.env.DANCE_KEYBOARD_ARM as keyof typeof plans]
  const { chromium } = await import(pathToFileURL(resolve(source, 'node_modules/playwright-core/index.mjs')).href)
  const launch = chromium.launch.bind(chromium)
  let pages = 0
  chromium.launch = async (options: any) => {
    const browser = await launch(options), newContext = browser.newContext.bind(browser)
    browser.newContext = async (options: any) => {
      const context = await newContext(options), observers: any[] = []
      await context.addInitScript(({ ids, cancel }) => {
        const trace: any[] = []
        ;(window as any).__keyboardControlTrace = trace
        // 明示負對照只取消真正點按的預設動作；不派送假事件，也不當成自然根因。
        if (cancel) document.addEventListener('click', event => { if ((event.target as Element)?.id === 'reference-file') event.preventDefault() }, true)
        for (const type of ['focusin', 'focusout', 'keydown', 'keyup', 'click']) for (const capture of [true, false]) document.addEventListener(type, (event: any) => {
          if (!ids.includes(event.target?.id)) return
          if (trace.length >= 64) { (window as any).__keyboardControlTruncated = true; return }
          trace.push({ type, phase: event.eventPhase, id: event.target.id, key: ['Enter', 'Tab'].includes(event.key) ? event.key : undefined, trusted: event.isTrusted, prevented: event.defaultPrevented, disabled: event.target.matches(':disabled'), active: ids.includes(document.activeElement?.id) ? document.activeElement?.id : 'other', focused: document.hasFocus(), visibility: document.visibilityState, activation: navigator.userActivation.isActive, time: performance.now() })
        }, capture)
      }, { ids: controls, cancel: plan.cancel })
      context.on('page', (page: any) => {
        const pageNumber = ++pages, wait = page.waitForEvent.bind(page), press = page.keyboard.press.bind(page.keyboard), stages: any[] = [], delays: any[] = []
        let observing: ReturnType<typeof observeKeyboardProtocol> | undefined, choosing: Promise<any> | undefined, client: any, send: any, delayedSend: any
        const start = () => {
          if (observing) return
          // 重用固定版同程序觀察器，只旁聽原RPC；不另開CDP session、不提早訂閱。
          observing = observeKeyboardProtocol(page)
          client = page._connection.toImpl(page).delegate._mainFrameSession._client; send = client.send
          delayedSend = function(this: unknown, method: string, params: any, ...args: any[]) {
            if (plan.delayMs && method === 'Page.setInterceptFileChooserDialog' && params?.enabled) {
              delays.push({ kind: 'delay-requested', at: performance.now(), delayMs: plan.delayMs })
              // 延後真正命令的派送，不造回覆；下層觀察器的send時間仍是真正交給driver的時點。
              return new Promise(resolve => setTimeout(resolve, plan.delayMs)).then(() => {
                delays.push({ kind: 'delay-finished', at: performance.now() }); return send.call(this, method, params, ...args)
              })
            }
            return send.call(this, method, params, ...args)
          }
          client.send = delayedSend
          observers.push(() => {
            assert.equal(client.send, delayedSend, '原生觀察已換持有人，不覆蓋他人')
            client.send = send
            appendFileSync(resolve(directory, 'protocol.jsonl'), JSON.stringify({ page: pageNumber, delays, ...observing!.stop() }) + '\n')
          })
        }
        page.keyboard.press = (key: string, ...args: any[]) => {
          const dispatch = () => { if (key === 'Enter') stages.push({ stage: 'enter-dispatched', time: performance.now() }); return press(key, ...args) }
          if (key !== 'Enter' || !choosing || !plan.ready) return dispatch()
          // 準備與選檔共用原waiter的15秒期限；不能另開更長期限，或接受按鍵前出現的chooser。
          return Promise.race([observing!.interceptionReady(), choosing.then(() => { throw new Error('按鍵前出現非預期選檔事件') })]).then(() => {
            stages.push({ stage: 'subscription-confirmed', time: performance.now() }); return dispatch()
          })
        }
        const save = async (outcome: string, inputId?: string) => {
          // 只在chooser完成或原15秒期限失敗之後讀頁面；不在待查按鍵之前額外evaluate。
          const dom = await page.evaluate(() => ({ events: (window as any).__keyboardControlTrace, truncated: (window as any).__keyboardControlTruncated === true })).catch(() => ({ unavailable: true }))
          appendFileSync(resolve(directory, 'native.jsonl'), JSON.stringify({ page: pageNumber, outcome, inputId: inputId === 'reference-file' ? inputId : inputId ? 'other' : undefined, stages, ...dom }) + '\n')
        }
        page.waitForEvent = (event: string, ...args: any[]) => {
          if (event !== 'filechooser') return wait(event, ...args)
          start(); stages.push({ stage: 'waiter-requested', time: performance.now() })
          choosing = wait(event, ...args).then(async (chooser: any) => {
            stages.push({ stage: 'chooser-resolved', time: performance.now() }); await save('chooser', await chooser.element().getAttribute('id')); choosing = undefined; return chooser
          }, async (error: Error) => {
            stages.push({ stage: 'waiter-rejected', time: performance.now() }); await save(error.message.includes('Timeout 15000ms') ? 'timeout-15000ms' : 'other-error'); choosing = undefined; throw error
          })
          return choosing
        }
      })
      const close = context.close.bind(context)
      context.close = async (...args: any[]) => {
        // 既有runner先收計數；保留直到關頁前的回覆，按相反安裝順序核對及恢復觀察器。
        try { while (observers.length) observers.pop()!() } finally { await close(...args) }
      }
      return context
    }
    return browser
  }
}

async function run(source: string, arm: keyof typeof plans) {
  assert(Object.hasOwn(plans, arm), '只允許預先固定的五種對照')
  assert.equal(Bun.version, '1.4.4')
  const git = (...args: string[]) => { const result = Bun.spawnSync(['git', '-C', source, ...args]); assert.equal(result.exitCode, 0); return result.stdout.toString().trim() }
  assert.equal(git('rev-parse', 'HEAD'), historicalHead, '必須使用 #203 原始來源')
  assert.equal(git('status', '--porcelain'), '', '歷史來源必須乾淨')
  const root = resolve(import.meta.dir, '../..'), directory = resolve(root, 'output/keyboard-linux-controls', arm), plan = plans[arm]
  mkdirSync(directory, { recursive: true }); assert(!readdirSync(directory).length, '不覆寫先前證據；每組只執行一次')
  const runner = readFileSync(resolve(source, 'tests/app-coverage/run-app.ts'), 'utf8')
  const list = JSON.parse('[' + runner.match(/const scenarios = selected.length \? selected : \[([^\]]+)\]/)![1].replaceAll("'", '"') + ']') as string[]
  assert.equal(list.length, 46); assert.equal(list.indexOf('comparison-keyboard'), 37)
  const selected = plan.prefix ? list.slice(0, 38) : ['comparison-keyboard']
  const evidence: any = { arm, plan, source: historicalHead, probeHead: Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root }).stdout.toString().trim(), platform: process.platform, arch: process.arch, bun: Bun.version, scenarioCount: selected.length, scenarios: selected, originalCaseSha256: hash(readFileSync(resolve(source, 'tests/browser/comparison-keyboard.js'))), originalRunnerSha256: hash(runner), observerSha256: hash(readFileSync(resolve(root, 'tests/app-coverage/keyboard-protocol.ts'))), protocol: [], native: [] }
  const save = () => writeFileSync(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2)); save()
  // 素材生成也用同一原子鎖；這段沒有瀏覽器，生成程序退出後才釋放自有nonce。
  const lock = resolve(process.platform === 'darwin' ? '/private/tmp' : tmpdir(), 'dance-stamp-p0-media-test.lock'), nonce = randomUUID(), fd = openSync(lock, 'wx')
  writeFileSync(fd, JSON.stringify({ owner: 'keyboard-controls-fixtures', nonce, pid: process.pid })); closeSync(fd)
  try {
    const fixture = Bun.spawn([process.execPath, '--no-env-file', 'tests/app-coverage/prepare-fixtures.ts'], { cwd: source, stdout: Bun.file(resolve(directory, 'fixtures.private.log')), stderr: 'inherit' }); assert.equal(await fixture.exited, 0)
  } finally { assert.equal(JSON.parse(readFileSync(lock, 'utf8')).nonce, nonce); unlinkSync(lock) }
  const previous = new Set(existsSync(resolve(source, 'coverage')) ? readdirSync(resolve(source, 'coverage')) : [])
  const child = Bun.spawn([process.execPath, '--no-env-file', '--preload', import.meta.path, 'tests/app-coverage/run-app.ts', ...selected], {
    cwd: source, env: { ...process.env, DEBUG: 'pw:browser', DEBUG_COLORS: '0', DANCE_KEYBOARD_PRELOAD: '1', DANCE_KEYBOARD_ARM: arm, DANCE_KEYBOARD_SOURCE: source, DANCE_KEYBOARD_EVIDENCE: directory }, stdout: Bun.file(resolve(directory, 'runner.private.log')), stderr: 'pipe',
  })
  // 完整啟動參數及原始錯誤不公開；只由已知PID確認自己啟動的瀏覽器確實退出。
  const launched = new Set<string>(), exited = new Set<string>(), reader = child.stderr.getReader(), decoder = new TextDecoder(); let pending = ''
  const consume = (line: string) => { const start = line.match(/<launched> pid=(\d+)/), end = line.match(/\[pid=(\d+)\].*<process did exit:/); if (start) launched.add(start[1]); if (end) exited.add(end[1]) }
  for (;;) {
    const part = await reader.read(); if (part.done) break
    pending += decoder.decode(part.value, { stream: true }); let newline: number
    while ((newline = pending.indexOf('\n')) >= 0) { consume(pending.slice(0, newline)); pending = pending.slice(newline + 1) }
  }
  if (pending) consume(pending)
  evidence.exitCode = await child.exited
  evidence.browsers = { launched: launched.size, allExited: launched.size > 0 && [...launched].every(pid => exited.has(pid)) }
  for (const [key, name] of [['native', 'native.jsonl'], ['protocol', 'protocol.jsonl']]) {
    const path = resolve(directory, name); evidence[key] = existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  }
  // 前置也可能選檔；只把真正由existing-mode Enter進入的最後一頁當作待查案例，不混用別頁成功。
  const target = evidence.native.filter((row: any) => row.events?.some((event: any) => event.type === 'keydown' && event.id === 'existing-mode' && event.key === 'Enter')).at(-1)
  evidence.prefixChooserSnapshots = evidence.native.length - (target ? 1 : 0)
  evidence.native = target ? [target] : []
  evidence.protocol = target ? evidence.protocol.filter((row: any) => row.page === target.page) : []
  const driver = evidence.protocol[0]?.events || []
  const keyDown = driver.find((event: any) => event.kind === 'send' && event.method === 'Input.dispatchKeyEvent' && event.type === 'keyDown' && event.key === 'Enter')
  const interception = driver.find((event: any) => event.kind === 'send' && event.method === 'Page.setInterceptFileChooserDialog' && event.enabled)
  const subscription = driver.find((event: any) => event.kind === 'subscription-ack' && event.enabled)
  evidence.ordering = { enterBeforeInterceptionSend: keyDown && interception ? keyDown.at < interception.at : null, subscriptionAckBeforeEnter: keyDown && subscription ? subscription.at < keyDown.at : null, nativeChooserCount: driver.filter((event: any) => event.kind === 'native-filechooser').length }
  const receiptDirectories = readdirSync(resolve(source, 'coverage')).filter(name => name.startsWith('app-') && !previous.has(name)); assert.equal(receiptDirectories.length, 1)
  const receipt = JSON.parse(readFileSync(resolve(source, 'coverage', receiptDirectories[0], 'run.json'), 'utf8'))
  evidence.browser = receipt.environment.chromium; evidence.cleanup = receipt.cleanup; evidence.pageErrorCount = receipt.errors.length
  evidence.historicalSourceStillClean = git('status', '--porcelain') === ''
  evidence.scenarioResults = receipt.scenarios.map((scenario: any) => ({ name: scenario.name, status: scenario.status, durationMs: scenario.durationMs, timeout15000ms: scenario.message?.includes('Timeout 15000ms') || false }))
  const result = receipt.scenarios.find((scenario: any) => scenario.name === 'comparison-keyboard')?.result || {}
  evidence.originalKeyboardFlags = Object.fromEntries(Object.entries(result).filter(([, value]) => typeof value === 'boolean'))
  evidence.controlStatus = 'unexpected'
  try {
    assert(evidence.browsers.allExited, '未確認自有瀏覽器退出'); assert.equal(evidence.pageErrorCount, 0)
    assert(evidence.historicalSourceStillClean && evidence.cleanup.browserClosed && evidence.cleanup.serverStopped && !evidence.cleanup.lockRetained)
    assert(evidence.native.length && evidence.protocol.length, '診斷缺少原生事件或協定，不能冒充已觀察')
    assert(evidence.protocol.every((row: any) => !row.truncated) && evidence.native.every((row: any) => !row.truncated), '診斷資料截斷')
    if (plan.expected === 'timeout') {
      assert.notEqual(evidence.exitCode, 0, '受控失敗必須保留原案例失敗')
      assert(evidence.scenarioResults.length === 1 && evidence.scenarioResults[0].timeout15000ms)
      assert(evidence.native.some((row: any) => row.outcome === 'timeout-15000ms'))
      assert(!evidence.protocol.some((row: any) => row.events.some((event: any) => event.kind === 'native-filechooser')))
      if (plan.cancel) {
        assert(evidence.ordering.subscriptionAckBeforeEnter)
        assert(evidence.native.some((row: any) => row.events.some((event: any) => event.id === 'reference-file' && event.type === 'click' && event.prevented)))
      } else {
        assert(evidence.ordering.enterBeforeInterceptionSend)
        assert(evidence.native.some((row: any) => row.events.some((event: any) => event.id === 'reference-file' && event.type === 'click' && !event.prevented)))
      }
    } else {
      assert.equal(evidence.exitCode, 0, '保留本輪自然失敗證據，不重跑求綠')
      assert(evidence.native.some((row: any) => row.outcome === 'chooser' && row.inputId === 'reference-file'))
      assert(evidence.protocol.some((row: any) => row.events.some((event: any) => event.kind === 'native-filechooser' && event.backendNodeId)))
      if (plan.ready) assert(evidence.ordering.subscriptionAckBeforeEnter)
    }
    evidence.controlStatus = 'matched'
  } finally { save(); console.log(JSON.stringify(evidence)) }
}

if (process.env.DANCE_KEYBOARD_PRELOAD === '1') await preload()
else if (import.meta.main) await run(resolve(process.argv[2]), process.argv[3] as keyof typeof plans)
