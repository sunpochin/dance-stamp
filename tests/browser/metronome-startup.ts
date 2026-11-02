/* 檔案用途：驗證節拍分析準備期間的原生取消與合法初始化。所在層：合成瀏覽器回歸。主要關聯：web/metronome.js、scripts/verify-metronome.ts、#227。 */
import assert from 'node:assert/strict'
import { type Browser } from 'playwright-core'

export async function verifyMetronomeStartup(browser: Browser, origin: string, wav: Buffer) {
  const results: { boundary: string, action: string, passed: boolean, nativeSettlement?: string }[] = []
  for (const boundary of ['module', 'resume']) for (const action of ['pause', 'seek', 'rate']) {
    const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage()
    page.setDefaultTimeout(5000)
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(boundary => {
      const target = boundary === 'module' ? Worklet.prototype : AudioContext.prototype
      const method = boundary === 'module' ? 'addModule' : 'resume', original = target[method]
      let release: () => void
      const gate = new Promise<void>(resolve => { release = resolve })
      ;(window as any).__releaseStartup = () => release()
      // 只延後真正的原生呼叫；解除後仍傳原參數／回傳原結果，不偽造準備成功。
      target[method] = function (...args) {
        (window as any).__startupHeld = true
        return gate.then(() => original.apply(this, args)).then(
          value => { (window as any).__startupSettlement = 'fulfilled'; return value },
          error => { (window as any).__startupSettlement = 'rejected'; throw error },
        )
      }
    }, boundary)
    try {
      await page.goto(new URL('/metronome.html', origin).href)
      await page.locator('#source-file').setInputFiles({ name: 'synthetic-count.wav', mimeType: 'audio/wav', buffer: wav })
      await page.waitForFunction(() => document.querySelector<HTMLVideoElement>('#source')!.readyState >= 1)
      await page.locator('#tap').click()
      await page.locator('#source').evaluate(async (video: HTMLVideoElement) => video.play())
      await page.locator('#analyze').click()
      await page.waitForFunction(() => (window as any).__startupHeld === true)
      // 這些 setter 會產生真正媒體事件，不派送合成 pause／seeking／ratechange。
      await page.locator('#source').evaluate((video: HTMLVideoElement, action) => {
        if (action === 'pause') video.pause()
        if (action === 'seek') video.currentTime = 1.25
        if (action === 'rate') video.playbackRate = 0.75
      }, action)
      await page.waitForFunction(() => document.querySelector<HTMLElement>('#cancel-analysis')!.hidden)
      assert.equal(await page.locator('#source').evaluate((video: HTMLVideoElement) => video.paused), true)
      await page.evaluate(() => (window as any).__releaseStartup())
      // 確認原生等待真的結束才檢查遲到工作，不能只等固定毫秒就宣稱它不會重播。
      await page.waitForFunction(() => !!(window as any).__startupSettlement)
      assert.equal(await page.locator('#source').evaluate((video: HTMLVideoElement) => video.paused), true, `${boundary}/${action}: 舊準備重新播放`)
      assert.equal(await page.locator('#result').isVisible(), false)
      assert.match(await page.locator('#analysis-status').innerText(), /已暫停|已改變|已取消/)
      assert.equal(await page.locator('#analyze').isEnabled(), true)
      assert.deepEqual(errors, []); results.push({ boundary, action, passed: true, nativeSettlement: await page.evaluate(() => (window as any).__startupSettlement) })
    } finally {
      await page.evaluate(() => (window as any).__releaseStartup?.()).catch(() => {})
      await context.close()
    }
  }
  // 初始化自己的 rewind／回原速會產生相同事件，必須保留這兩個合法重試入口。
  for (const action of ['ended', 'non-unit-rate']) {
    const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage()
    page.setDefaultTimeout(5000)
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(new URL('/metronome.html', origin).href)
      await page.locator('#source-file').setInputFiles({ name: 'synthetic-count.wav', mimeType: 'audio/wav', buffer: wav })
      await page.waitForFunction(() => document.querySelector<HTMLVideoElement>('#source')!.readyState >= 1)
      await page.locator('#tap').click()
      if (action === 'ended') {
        await page.locator('#source').evaluate(async (video: HTMLVideoElement) => { video.currentTime = video.duration - 0.05; await video.play() })
        await page.waitForFunction(() => document.querySelector<HTMLVideoElement>('#source')!.ended)
      } else await page.locator('#source').evaluate((video: HTMLVideoElement) => { video.playbackRate = 0.75 })
      await page.locator('#analyze').click()
      await page.waitForFunction(() => document.querySelector('#analysis-status')!.textContent!.includes('正在聽目前片段'))
      assert.equal(await page.locator('#source').evaluate((video: HTMLVideoElement) => video.paused), false)
      assert.equal(await page.locator('#source').evaluate((video: HTMLVideoElement) => video.playbackRate), 1)
      assert(await page.locator('#source').evaluate((video: HTMLVideoElement) => video.currentTime < video.duration - 1))
      await page.locator('#cancel-analysis').click()
      assert.equal(await page.locator('#source').evaluate((video: HTMLVideoElement) => video.paused), true)
      assert.deepEqual(errors, []); results.push({ boundary: 'normal', action, passed: true })
    } finally { await context.close() }
  }
  return results
}
