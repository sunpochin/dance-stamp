/* 檔案用途：驗證操作外原生媒體錯誤、音訊恢復拒絕及自然播完重啟失敗的保全與重試。所在層：隔離合成瀏覽器回歸。主要關聯：main.js、run-app.ts、issue #103。 */
async (page, { mode }) => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  try {
    const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
    const snapshot = () => page.evaluate(async () => {
      const store = await import('/storage.js'), library = await store.readLibrary(), media = [];
      for (const id of (await store.readMediaKeys()).sort()) {
        const blob = await store.readMedia(id), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
        media.push({ id, bytes: blob.size, type: blob.type, hash });
      }
      return { library, media, hrefs: ['reference-download', 'take-download', 'output-download'].map(id => document.getElementById(id).getAttribute('href')) };
    });
    await page.addInitScript(() => {
      const request = HTMLVideoElement.prototype.requestVideoFrameCallback, cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
      const NativeAudio = AudioContext, resume = NativeAudio.prototype.resume, play = HTMLMediaElement.prototype.play, revoke = URL.revokeObjectURL;
      window.practiceErrors = { frames: new Set(), maximum: 0, events: [], resumes: [], contexts: [], revoked: [], captureCalls: 0, audioFail: false, failAfterEnd: false, rejectPlay: false, playRejections: 0 };
      // 觀察真正 owner 的訂閱，不能額外訂閱影格而改變循環尾端時序。
      HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
        if (this.id !== 'reference') return request.call(this, callback);
        const state = window.practiceErrors, id = request.call(this, (...args) => { state.frames.delete(id); callback(...args); });
        state.frames.add(id); state.maximum = Math.max(state.maximum, state.frames.size); return id;
      };
      HTMLVideoElement.prototype.cancelVideoFrameCallback = function(id) { if (this.id === 'reference') window.practiceErrors.frames.delete(id); return cancel.call(this, id); };
      window.AudioContext = class extends NativeAudio { constructor(...args) { super(...args); window.practiceErrors.contexts.push(this); } };
      NativeAudio.prototype.resume = function() {
        const state = window.practiceErrors, injected = state.audioFail;
        state.resumes.push({ injected, before: this.state });
        // 只拒絕本輪恢復邊界；仍用原生 context／節點，解除後必須真的 running 才算重試。
        if (injected) { state.audioFail = false; return Promise.reject(new DOMException('合成音訊恢復拒絕', 'NotAllowedError')); }
        return resume.call(this);
      };
      HTMLMediaElement.prototype.play = function() {
        if (this.id === 'reference' && window.practiceErrors.rejectPlay) {
          window.practiceErrors.rejectPlay = false; window.practiceErrors.playRejections++;
          return Promise.reject(new DOMException('合成尾端重啟拒絕', 'NotAllowedError'));
        }
        return play.call(this);
      };
      URL.revokeObjectURL = function(url) { window.practiceErrors.revoked.push(url); return revoke.call(this, url); };
      for (const key of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices?.[key]) navigator.mediaDevices[key] = async () => { window.practiceErrors.captureCalls++; throw new Error('練習錯誤回歸只使用合成檔案'); };
      document.addEventListener('DOMContentLoaded', () => {
        for (const id of ['reference', 'self', 'output']) for (const type of ['error', 'play', 'playing', 'pause', 'ended', 'seeked']) document.getElementById(id).addEventListener(type, event => {
          const video = event.target, state = window.practiceErrors;
          state.events.push({ id, type, trusted: event.isTrusted, at: video.currentTime, ended: video.ended, code: video.error?.code, time: performance.now() });
          // 必須先收到真正 ended 才拒絕下一次 play，不手動呼叫 handler 或派送假事件。
          if (id === 'reference' && type === 'ended' && state.failAfterEnd) { state.failAfterEnd = false; state.rejectPlay = true; }
        }, true);
      });
    });
    await page.goto(origin); await idle();
    await page.locator('#reference-file').setInputFiles('output/export-failure/reference.mp4'); await idle();
    await page.locator('#self-file').setInputFiles('output/export-failure/self.mp4'); await idle();
    for (const id of ['copy-reference', 'copy-self']) { await page.locator('#' + id).click(); await idle(); }
    await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成練習錯誤保全'); await page.locator('#marker-note').fill('停止與重試必須保留完整舊資料');
    await page.locator('#marker-form button[type=submit]').click(); await idle();
    await page.locator('#end').fill('3'); await page.locator('#end').dispatchEvent('change'); await idle();
    await page.locator('#export').click(); await idle();
    // 配對後的 A/B 會保存並重新定位；先等這些真正交易完成，才固定錯誤前基準，避免把設定變更誤當資料遺失。
    const duration = await page.locator('#reference').evaluate(video => video.duration);
    for (const [id, value] of [['start', '0.4'], ['end', String(duration)]]) {
      await page.locator('#' + id).fill(value); await page.locator('#' + id).press('Tab'); await idle();
    }
    await page.locator('#practice-rate').selectOption('2'); await idle();
    const before = await snapshot(), artifact = before.library.data.exports.at(-1), expected = before.media.find(row => row.id === artifact?.assetId);
    assert(expected && before.media.length === 3 && before.library.data.markers.length > 0 && await page.locator('#output-download').isVisible(), '沒有真正保存原片、非空筆記與 VS 基準');
    const sources = await page.evaluate(() => ['reference', 'self', 'output'].map(id => document.getElementById(id).getAttribute('src')));
    await page.waitForFunction(() => window.practiceErrors.frames.size === 0 && window.practiceErrors.contexts.length === 1 && window.practiceErrors.contexts[0].state === 'suspended');
    await page.evaluate(() => { window.practiceErrors.events = []; window.practiceErrors.resumes = []; window.practiceErrors.maximum = 0; });
    const stopped = async () => {
      await page.waitForFunction(() => ['reference', 'self'].every(id => document.getElementById(id).paused) && window.practiceErrors.frames.size === 0 && document.getElementById('loop').textContent === '開始 A–B 循環');
      const at = await page.locator('#reference').evaluate(video => video.currentTime);
      // 等過一整輪，才能抓到拒絕後晚到的 seek／play 又自行開始。
      await page.waitForTimeout(4500);
      assert(await page.evaluate(at => document.getElementById('reference').paused && document.getElementById('reference').currentTime === at && window.practiceErrors.frames.size === 0, at), '錯誤停止後又被晚到工作重新播放');
      assert(await page.evaluate(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true' && document.getElementById('storage-recovery').hidden && window.practiceErrors.contexts.every(context => context.state === 'suspended')), '停止後仍忙碌、保存未知或繼續音訊運算');
      assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '錯誤停止改掉完整筆記、revision、媒體 bytes 或下載連結');
    };
    const retryLoop = async () => {
      const count = await page.evaluate(() => window.practiceErrors.events.filter(event => event.id === 'reference' && event.type === 'playing').length);
      await page.locator('#loop').click();
      await page.waitForFunction(count => window.practiceErrors.events.filter(event => event.id === 'reference' && event.type === 'playing').length > count && document.getElementById('reference').currentTime > 0.5 && !document.getElementById('reference').paused, count);
      assert(await page.evaluate(() => window.practiceErrors.contexts[0].state === 'running'), '重試沒有恢復原生音訊');
      await page.locator('#stop').click(); await stopped();
    };
    if (mode === 'decode') {
      for (const [index, id] of ['reference', 'self', 'output'].entries()) {
        await page.locator('#loop').click();
        await page.waitForFunction(() => !document.getElementById('reference').paused && window.practiceErrors.frames.size === 1);
        await page.locator('#' + id).evaluate(video => {
          // 明示替換這個播放器的輸入，讓原生解碼器自行送 trusted error；不碰保存 Blob 或產品內部 state。
          window.practiceErrors.badUrl = URL.createObjectURL(new Blob(['synthetic invalid video bytes'], { type: 'video/mp4' }));
          video.src = window.practiceErrors.badUrl; video.load();
        });
        await page.waitForFunction(() => document.getElementById('status').textContent.includes('播放中斷'));
        assert(await page.evaluate(id => window.practiceErrors.events.some(event => event.id === id && event.type === 'error' && event.trusted && event.code > 0), id), '沒有真正的原生影片錯誤');
        await stopped();
        assert(await page.evaluate(sources => sources.every(url => !window.practiceErrors.revoked.includes(url)), sources), '錯誤撤銷了原本仍可用的影片 URL');
        // 撤除測試故障後仍是同一份 URL／bytes；真正重試由公開循環按鈕發起。
        await page.locator('#' + id).evaluate(async (video, src) => {
          const loaded = new Promise((resolve, reject) => { video.addEventListener('loadeddata', resolve, { once: true }); video.addEventListener('error', reject, { once: true }); });
          video.src = src; video.load(); await loaded; URL.revokeObjectURL(window.practiceErrors.badUrl);
        }, sources[index]);
        await retryLoop();
      }
    } else if (mode === 'audio') {
      await page.evaluate(() => { window.practiceErrors.audioFail = true; });
      // 原生播放器的 Space 由可信鍵盤操作發起，不能直接呼叫產品的 play listener。
      await page.locator('#reference').focus(); await page.locator('#reference').press('Space');
      await page.waitForFunction(() => document.getElementById('status').textContent === '合成音訊恢復拒絕');
      assert(await page.evaluate(() => window.practiceErrors.resumes.filter(row => row.injected && row.before === 'suspended').length === 1 && window.practiceErrors.events.some(event => event.type === 'play' && event.trusted)), '沒有從原生播放進入音訊恢復拒絕');
      await stopped();
      const retryAt = await page.locator('#reference').evaluate(video => video.currentTime);
      await page.locator('#reference').focus(); await page.locator('#reference').press('Space');
      await page.waitForFunction(at => !document.getElementById('reference').paused && document.getElementById('reference').currentTime > at + 0.1 && window.practiceErrors.contexts[0].state === 'running' && window.practiceErrors.frames.size === 1, retryAt);
      await page.locator('#stop').click(); await stopped();
    } else if (mode === 'ended') {
      await page.evaluate(() => { window.practiceErrors.failAfterEnd = true; }); await page.locator('#loop').click();
      await page.waitForFunction(() => window.practiceErrors.playRejections === 1);
      assert(await page.evaluate(duration => window.practiceErrors.events.some(event => event.id === 'reference' && event.type === 'ended' && event.trusted && event.ended && event.at === duration), duration), '沒有從真正自然播完進入重啟失敗');
      await stopped(); await retryLoop();
    } else throw new Error('未知錯誤情境');
    assert(await page.evaluate(sources => ['reference', 'self', 'output'].every((id, index) => document.getElementById(id).getAttribute('src') === sources[index]) && window.practiceErrors.maximum <= 1 && window.practiceErrors.captureCalls === 0, sources), '重試改掉來源、重複訂閱或誤觸擷取');
    // 真正下載才能證明保留的舊 VS 仍可用，不能只比較相同 href 字串。
    const pending = page.waitForEvent('download'); await page.locator('#output-download').click(); const download = await pending;
    const path = `output/export-failure/practice-${mode}-${artifact.id}-${download.suggestedFilename()}`; await download.saveAs(path);
    const bytes = await (await import('node:fs/promises')).readFile(path), { createHash } = await import('node:crypto');
    assert(bytes.length === expected.bytes && createHash('sha256').update(bytes).digest('hex') === expected.hash, '錯誤與重試後舊 VS 真正下載 bytes 不同');
    const result = await page.evaluate(() => ({ events: window.practiceErrors.events, resumes: window.practiceErrors.resumes, playRejections: window.practiceErrors.playRejections, maximumFrames: window.practiceErrors.maximum, pendingFrames: window.practiceErrors.frames.size, audioStates: window.practiceErrors.contexts.map(context => context.state), captureCalls: window.practiceErrors.captureCalls }));
    await page.reload(); await idle();
    const reloaded = await snapshot();
    assert(JSON.stringify(reloaded.library) === JSON.stringify(before.library) && JSON.stringify(reloaded.media) === JSON.stringify(before.media), '重開後完整筆記與媒體不同');
    return { mode, ...result, fault: { decode: 'explicit source replacement; native decoder error', audio: 'explicit one-shot AudioContext.resume rejection', ended: 'native trusted ended; explicit one-shot play rejection' }[mode], metadataRevisionAndAllMediaHashesPreserved: true, noLateRestart: true, samePageRetry: true, reloadPreservesAllData: true, actualVsDownload: path, expectedVs: expected };
  } catch (caught) {
    // 失敗時保留純合成的事件／控制狀態，區分準備階段與真正故障，不放寬等待或產品條件。
    const diagnostic = await page.evaluate(() => ({ status: document.getElementById('status')?.textContent, busy: document.getElementById('compare')?.getAttribute('aria-busy'), range: ['start', 'end'].map(id => document.getElementById(id)?.value), loop: document.getElementById('loop')?.textContent, controlsDisabled: document.getElementById('controls')?.disabled, storageUnknown: !document.getElementById('storage-recovery')?.hidden, audioStates: window.practiceErrors?.contexts.map(context => context.state), paused: document.getElementById('reference')?.paused, at: document.getElementById('reference')?.currentTime, frames: window.practiceErrors?.frames.size, events: window.practiceErrors?.events, resumes: window.practiceErrors?.resumes })).catch(() => null);
    throw new Error(String(caught) + ' ' + JSON.stringify(diagnostic));
  }
}
