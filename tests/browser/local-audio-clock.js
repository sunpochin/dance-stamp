/* 檔案用途：拒絕獨立音訊時鐘下的延遲啟播與短暫視訊停滯。所在層：合成瀏覽器回歸。主要關聯：main.js、local-audio.js、RECORD_COMPARE.md。 */
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(new URL(page.url()).origin), '只可使用隔離本機合成環境');
  assert(await page.evaluate(async () => window.__danceSyntheticCameraOnly === true && (await import('/local-audio.js')).safariAudio()), '必須明確選取工程用相容音訊分支');
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout: 20000 });
  const exports = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data.exports.length);
  await page.evaluate(() => {
    window.confirm = () => true;
    const create = AudioContext.prototype.createBufferSource, destination = AudioContext.prototype.createMediaStreamDestination;
    window.clockAudit = { sources: [], tracks: [] };
    AudioContext.prototype.createBufferSource = function() { const source = create.call(this); window.clockAudit.sources.push(source); return source; };
    AudioContext.prototype.createMediaStreamDestination = function() { const node = destination.call(this); window.clockAudit.tracks.push(...node.stream.getTracks()); return node; };
  });
  await page.locator('#existing-mode').click();
  await page.locator('#reference-file').setInputFiles('output/media-feasibility/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/media-feasibility/self-silent.mp4'); await idle();
  await page.locator('#end').fill('3'); await page.locator('#end').dispatchEvent('change'); await idle();
  await page.locator('#export').click(); await idle();
  const previous = await page.locator('#output-download').getAttribute('href'), count = await exports();
  assert(previous?.startsWith('blob:') && count === 1, '基準相容輸出未成功');
  const outcomes = [];
  for (const mode of ['delayed-play', 'brief-stall']) {
    await page.evaluate(mode => {
      const video = document.getElementById('reference'), play = video.play;
      window.clockFault = { play, calls: 0, injected: false, timer: null };
      // 第一輪是原生暖機；只延遲正式啟播，或在仍非 paused 時短暫減速，不改音訊與編碼器。
      video.play = async function() {
        if (++window.clockFault.calls !== 2) return play.call(this);
        if (mode === 'delayed-play') {
          window.clockFault.injected = true; await new Promise(resolve => setTimeout(resolve, 180));
        } else {
          window.clockFault.timer = setTimeout(() => {
            this.playbackRate = 0.0625; window.clockFault.injected = this.playbackRate === 0.0625;
            window.clockFault.timer = setTimeout(() => { this.playbackRate = 1; }, 180);
          }, 600);
        }
        return play.call(this);
      };
    }, mode);
    try {
      await page.locator('#export').click(); await idle();
      assert(await page.evaluate(() => window.clockFault.injected), '故障未真正執行');
      assert(await page.locator('#output-download').getAttribute('href') === previous && await exports() === count, mode + ' 把音訊領先的影片保存為成功');
      assert((await page.locator('#status').textContent()).includes('音訊與畫面偏移超過 100ms'), '未清楚指出獨立音訊偏移');
      assert(await page.evaluate(() => window.clockAudit.sources.every(s => s.buffer === null) && window.clockAudit.tracks.every(t => t.readyState === 'ended') && document.getElementById('reference').paused && document.getElementById('self').paused), '失敗後音訊或串流未釋放');
      outcomes.push({ mode, rejected: true, priorOutputRetained: true, resourcesReleased: true });
    } finally {
      await page.evaluate(() => { const video = document.getElementById('reference'); clearTimeout(window.clockFault.timer); video.play = window.clockFault.play; video.playbackRate = 1; });
    }
  }
  await page.locator('#export').click(); await idle();
  assert(await exports() === count + 1 && await page.locator('#output-download').getAttribute('href') !== previous, '拒絕後不能重試');
  return { outcomes, retry: true, nativeSafariEvidence: false };
}
