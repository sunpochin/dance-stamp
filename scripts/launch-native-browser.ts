/* 檔案用途：為嚴格背景驗收建立專用 Chrome 與 CLI 入口。所在層：桌面 QA；不隨產品分發。主要關聯：practice-background.js、MEDIA_PROBE.md。 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const executable = process.argv[2] || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '')
if (!executable || !existsSync(executable)) throw new Error('請指定本機 Chrome 可執行檔；預設只適用 macOS。')
// 新 profile 隔離媒體／筆記及除錯入口，不能接管日常瀏覽器。
const profile = mkdtempSync(join(tmpdir(), 'dance-native-'))
const child = Bun.spawn([executable, `--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking', '--mute-audio', 'about:blank'], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' })
const stop = () => { if (child.exitCode === null) child.kill('SIGTERM') }
process.once('SIGINT', stop); process.once('SIGTERM', stop)
try {
  const address = join(profile, 'DevToolsActivePort'), deadline = Date.now() + 10_000
  while (!existsSync(address)) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error('專用 Chrome 未能啟動，沒有改用其他瀏覽器。')
    await Bun.sleep(100)
  }
  const port = Number(readFileSync(address, 'utf8').split('\n')[0])
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('專用 Chrome 的本機入口無效')
  const endpoint = `http://127.0.0.1:${port}`
  const strict = readFileSync(resolve(root, 'tests/browser/practice-background.js'), 'utf8')
  mkdirSync(resolve(root, 'output'), { recursive: true })
  // 端點只取自己 profile 的啟動紀錄，以 JS 字串編碼嵌入，不經 shell 或讀使用者媒體。
  writeFileSync(resolve(root, 'output/native-background-run.js'), `async controller => {
    const origin = new URL(controller.url());
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port) throw new Error('請先開啟本機測試產品頁');
    const browser = await controller.context().browser().browserType().connectOverCDP(${JSON.stringify(endpoint)}, { noDefaults: true, isLocal: true });
    try {
      const context = browser.contexts()[0];
      if (context.pages().length !== 1 || context.pages()[0].url() !== 'about:blank') throw new Error('專用 Chrome 必須只有啟動時的空白頁，重跑請重新啟動工具');
      const page = context.pages()[0];
      await page.goto(origin.origin);
      const verify = ${strict};
      const result = await verify(page);
      const version = (await (await page.request.get(origin.origin + '/sw.js')).text()).match(/const version = '([a-f0-9]{16})'/)?.[1];
      if (!version) throw new Error('無法辨識受測靜態版本');
      return { ...result, version, chrome: browser.version() };
    } finally { await browser.close(); }
  }\n`)
  // 控制端不佔實體視窗；受測 Chrome 仍有真正視窗，且只在現有 default context 連線時省略焦點覆寫。
  writeFileSync(resolve(root, 'output/native-controller.json'), JSON.stringify({ browser: { browserName: 'chromium', isolated: true, launchOptions: { channel: 'chrome', headless: true } } }))
  writeFileSync(resolve(root, 'output/native-browser.local.json'), JSON.stringify({ endpoint, profile, pid: child.pid }))
  console.log('專用原生 Chrome 已備妥。依 MEDIA_PROBE.md 在另一終端開啟本機產品頁並執行 output/native-background-run.js；每輪重啟本工具，測完 Ctrl+C，只停止本工具啟動的 Chrome。')
  await child.exited
} finally { stop(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop) }
