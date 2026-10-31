/* 檔案用途：用原生早停與真短片驗證新擷取不假成功，保留舊片／筆記及可恢復 chunks。所在層：瀏覽器媒體回歸。主要關聯：main.js、capture.js。 */
// 相機設定已收在選用區；先展開，再沿用原本的錄影與資料保護斷言。
// 筆記管理收在次要工具，先展開再驗證既有功能；資料斷言維持原樣。
async (page, options) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const fingerprint = () => page.evaluate(async () => {
    const a = window.captureIntegrity, store = await import('/storage.js'), { data } = await store.readLibrary();
    const selected = Object.fromEntries(Object.entries(a.originalIds).map(([key, ids]) => [key, data[key].filter(row => ids.includes(row.id))]));
    const blobs = [a.files.get('reference-file'), a.files.get('self-file'), await store.readMedia(a.oldTakeAsset), await store.readMedia(a.oldVsAsset)];
    const hashes = await Promise.all(blobs.map(async blob => {
      if (!(blob instanceof Blob)) throw new Error('舊媒體已遺失');
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
    }));
    const urls = ['reference', 'self', 'take-download', 'output-download'].map(id => document.getElementById(id)[id.endsWith('download') ? 'href' : 'src']);
    return { selected, hashes, urls, oldUrlsRevoked: a.oldUrls.some(url => a.revoked.includes(url)) };
  });
  if (options.phase === 'prepare') {
    await page.context().addInitScript(() => {
      window.confirm = () => true;
      const a = window.captureIntegrity = { mode: '', files: new Map(), blobs: new Map(), revoked: [], recordings: [], streams: [], errors: [], outcomes: [] };
      // 選片會清空 input；先保留真正 File，再核對完整 bytes，不放寬 CSP 或偽造 duration。
      document.addEventListener('change', event => {
        const input = event.target;
        if (input instanceof HTMLInputElement && input.files?.[0]) a.files.set(input.id, input.files[0]);
      }, true);
      const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
      URL.createObjectURL = blob => { const url = create.call(URL, blob); a.blobs.set(url, blob); return url; };
      URL.revokeObjectURL = url => { a.revoked.push(url); a.blobs.delete(url); return revoke.call(URL, url); };
      window.addEventListener('unhandledrejection', event => a.errors.push(String(event.reason)));
      const Native = MediaRecorder;
      window.MediaRecorder = class extends Native {
        constructor(stream, config) {
          super(stream, config); a.streams.push(stream);
          this.audit = { camera: stream.getAudioTracks().length === 0, mode: a.mode, events: [] }; a.recordings.push(this.audit);
          for (const name of ['start', 'stop', 'error', 'dataavailable']) this.addEventListener(name, event => this.audit.events.push({ name, trusted: event.isTrusted, at: performance.now(), bytes: event.data?.size }));
          if (this.audit.camera && a.mode === 'short') {
            let sent = false;
            // 使用先前原生早停真正成檔的 bytes；只注入資料，不假造播放器片長。
            this.addEventListener('dataavailable', event => {
              a.shortInjected = (a.shortInjected || 0) + 1;
              Object.defineProperty(event, 'data', { value: sent ? new Blob([], { type: this.mimeType }) : a.shortBlob }); sent = true;
            });
          }
        }
        start(...args) {
          const result = super.start(...args);
          // 真正呼叫原生 stop，保留 trusted stop/dataavailable，不能派發假完成事件。
          if (this.audit.camera && this.audit.mode === 'early') setTimeout(() => { if (this.state !== 'inactive') Native.prototype.stop.call(this); }, 1200);
          return result;
        }
      };
    });
    await page.goto(options.origin);
    await page.locator('#existing-mode').click();
    // 完整量測可明確傳入既有合成素材；原獨立媒體入口仍保留原預設，不複製第二套斷言。
    await page.locator('#reference-file').setInputFiles(options.reference ?? 'output/media-feasibility/reference.mp4'); await idle();
    // 新選片預設全長；此比較案例明確選 15 秒，保留原本的媒體護欄與測試範圍。
    await page.locator('#end').fill('15');
    await page.locator('#self-file').setInputFiles(options.self ?? 'output/media-feasibility/self-silent.mp4'); await idle();
    await page.locator('#copy-self').click(); await idle();
    await page.locator('#video-title').fill('合成完整性筆記'); await page.locator('#save-title').click(); await idle();
    await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成保留標記'); await page.locator('#marker-note').fill('合成保留筆記'); await page.locator('#marker-form button[type="submit"]').click(); await idle();
    await page.locator('#end').fill('3'); await page.locator('#end').dispatchEvent('change'); await idle();
    await page.locator('#export').click(); await idle();
    assert(await page.locator('#output-download').isVisible(), '基準 VS 未完成');
    await page.locator('#end').fill('15'); await page.locator('#end').dispatchEvent('change'); await idle();
    await page.evaluate(async () => {
      const a = window.captureIntegrity, { data } = await (await import('/storage.js')).readLibrary();
      a.originalIds = Object.fromEntries(['videos', 'assets', 'markers', 'takes', 'recipes', 'exports', 'moves'].map(key => [key, data[key].map(row => row.id)]));
      a.oldTakeAsset = data.takes.at(-1).cameraAssetId; a.oldVsAsset = data.exports.at(-1).assetId;
      a.oldUrls = ['reference', 'self', 'take-download', 'output-download'].map(id => document.getElementById(id)[id.endsWith('download') ? 'href' : 'src']);
    });
    const before = await fingerprint(); await page.evaluate(before => { window.captureIntegrity.before = before; }, before);
    return { baseline: before, exports: (await library()).exports.length };
  }
  if (options.phase === 'start') {
    await page.evaluate(mode => { window.captureIntegrity.mode = mode; }, options.mode);
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle(); await page.locator('#capture').click();
    return { started: true, mode: options.mode };
  }
  if (options.phase === 'status') return page.evaluate(() => ({ ready: !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', status: document.getElementById('status').textContent, diagnostics: JSON.parse(document.getElementById('diagnostics').textContent) }));
  if (options.phase === 'verify-fault') {
    const before = await page.evaluate(() => window.captureIntegrity.before), after = await fingerprint();
    assert(JSON.stringify(before) === JSON.stringify(after), options.mode + ' 改變舊筆記／take／recipe／VS bytes 或下載／播放器 URL');
    assert((await page.locator('#status').textContent()).includes('錄影未完成'), options.mode + ' 未明確拒絕');
    assert(await page.locator('#partial-download').isVisible(), options.mode + ' 未提供未完成原片另存');
    const outcome = await page.evaluate(async mode => {
      const a = window.captureIntegrity, store = await import('/storage.js'), { data } = await store.readLibrary(), take = data.takes.at(-1);
      if (take.state !== 'interrupted' || a.originalIds.takes.includes(take.id)) throw new Error('新工作誤標 ready 或改了舊 take');
      if (await store.readMedia(take.cameraAssetId)) throw new Error('拒絕前就把新片 finalize');
      const partial = a.blobs.get(document.getElementById('partial-download').href), chunks = await store.recoverChunks(take.cameraAssetId);
      const sha = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
      const partialSha = await sha(partial); if (partial.size !== chunks.size || partialSha !== await sha(chunks)) throw new Error('失敗 bytes／chunks 不一致或已被清除');
      const video = document.createElement('video'), url = URL.createObjectURL(partial); video.muted = true;
      let durationMs;
      try { durationMs = await (await import('/recorder.js')).load(video, url); }
      finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
      if (durationMs >= 14500 || !a.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))) throw new Error('不是真短片或本輪資源未釋放');
      if (!a.recordings.filter(row => row.camera && row.mode === mode).every(row => row.events.some(e => e.name === 'stop' && e.trusted))) throw new Error('未收到真正原生 stop');
      if (mode === 'early') a.shortBlob = partial;
      if (mode === 'short' && !a.shortInjected) throw new Error('未注入真短 bytes');
      const result = { mode, takeId: take.id, takeState: take.state, partialBytes: partial.size, partialSha, decodedDurationMs: durationMs, chunksPreserved: true, oldStateAndUrlsRetained: true, tracksReleased: true }; a.outcomes.push(result); return result;
    }, options.mode);
    const pending = page.waitForEvent('download'); await page.locator('#partial-download').click(); const download = await pending;
    // 同頁會再次早停；每次用 take ID 留獨立下載，不能覆蓋前次實際證據。
    const path = `output/media-feasibility/${options.label}-${options.mode}-${outcome.takeId}-partial.${download.suggestedFilename().split('.').pop()}`; await download.saveAs(path);
    return { ...outcome, actualPartialDownload: path };
  }
  if (options.phase === 'verify-retry') {
    const data = await library(), capture = await page.evaluate(() => JSON.parse(document.getElementById('diagnostics').textContent).capture);
    assert(data.takes.at(-1).state === 'ready' && !capture.interrupted && capture.durationMs > 14500 && (await page.locator('#status').textContent()).includes('已錄好'), '同頁重試未真正錄完整');
    const old = await page.evaluate(() => window.captureIntegrity.before), now = await fingerprint();
    assert(JSON.stringify(old.selected) === JSON.stringify(now.selected) && JSON.stringify(old.hashes) === JSON.stringify(now.hashes), '重試改變舊筆記或保存媒體');
    assert(now.urls[3] === old.urls[3], '重試撤銷舊 VS');
    assert(await page.evaluate(() => !window.captureIntegrity.errors.length && window.captureIntegrity.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))), '有未處理錯誤或相機未釋放');
    const pending = page.waitForEvent('download'); await page.locator('#take-download').click(); const download = await pending;
    const path = `output/media-feasibility/${options.label}-${data.takes.at(-1).id}-retry-take.${download.suggestedFilename().split('.').pop()}`; await download.saveAs(path);
    const expectedDownload = await page.evaluate(async () => {
      const blob = window.captureIntegrity.blobs.get(document.getElementById('take-download').href);
      return { bytes: blob.size, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('') };
    });
    return { samePageRetry: true, capture, expectedDownload, outcomes: await page.evaluate(() => window.captureIntegrity.outcomes), actualRetryDownload: path };
  }
  if (options.phase === 'verify-deletion') {
    const outcomes = await page.evaluate(() => window.captureIntegrity.outcomes), target = outcomes.find(row => row.mode === 'short'), unrelated = outcomes.find(row => row.mode === 'early');
    const partial = await page.locator('#partial-download').getAttribute('href');
    const remove = async (id, confirm) => {
      await page.locator(`[data-focus-key="take:${id}:delete"]`).click(); await page.locator('#delete-dialog').waitFor({ state: 'visible' });
      await page.locator(confirm ? '#delete-confirm' : '#delete-cancel').click(); await idle();
    };
    await remove(target.takeId, false);
    assert(await page.locator('#partial-download').getAttribute('href') === partial && await page.locator('#partial-download').isVisible(), '取消刪除丟掉救援原片');
    await remove(unrelated.takeId, true);
    assert(await page.locator('#partial-download').getAttribute('href') === partial && await page.locator('#partial-download').isVisible(), '刪無關 take 丟掉救援原片');
    await remove(target.takeId, true);
    assert(await page.locator('#partial-download').isHidden() && !await page.locator('#partial-download').getAttribute('href') && await page.evaluate(url => window.captureIntegrity.revoked.includes(url) && !window.captureIntegrity.blobs.has(url), partial), '刪除該 take 後仍可下載已刪原片');
    return { cancelledRetainsPartial: true, unrelatedDeletionRetainsPartial: true, matchingTakeDeletionRevokesPartial: true };
  }
  if (options.phase === 'reset-baseline') {
    await page.evaluate(async () => {
      const a = window.captureIntegrity, { data } = await (await import('/storage.js')).readLibrary();
      a.originalIds = Object.fromEntries(['videos', 'assets', 'markers', 'takes', 'recipes', 'exports', 'moves'].map(key => [key, data[key].map(row => row.id)]));
      a.oldTakeAsset = data.takes.at(-1).cameraAssetId;
      a.oldUrls = ['reference', 'self', 'take-download', 'output-download'].map(id => document.getElementById(id)[id.endsWith('download') ? 'href' : 'src']);
    });
    const before = await fingerprint(); await page.evaluate(before => { window.captureIntegrity.before = before; }, before); return before;
  }
  if (options.phase === 'delete-video') {
    const partial = await page.locator('#partial-download').getAttribute('href');
    assert(await page.locator('#partial-download').isVisible(), '影片刪除控制缺少原片');
    await page.locator('#note-tools').evaluate(d => { d.open = true; });
    await page.locator('#delete-video').click(); await page.locator('#delete-dialog').waitFor({ state: 'visible' }); await page.locator('#delete-confirm').click(); await idle();
    assert(await page.locator('#partial-download').isHidden() && !await page.locator('#partial-download').getAttribute('href') && await page.evaluate(url => window.captureIntegrity.revoked.includes(url) && !window.captureIntegrity.blobs.has(url), partial), '刪整份影片仍留下救援原片');
    return { matchingVideoDeletionRevokesPartial: true, remainingVideos: (await library()).videos.length };
  }
  throw new Error('未知 capture-integrity 階段');
}
