/* 檔案用途：驗證離線通知遺失、原生讀取失敗、未知媒體救援及真正離頁草稿保護。所在層：#103 隔離合成瀏覽器回歸。主要關聯：main.js、offline.js、storage.js、run-app.ts。 */
async (page, { mode }) => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const snapshot = () => page.evaluate(async () => {
    const store = await import('/storage.js'), library = await store.readLibrary(), media = [];
    for (const id of (await store.readMediaKeys()).sort()) {
      const blob = await store.readMedia(id), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
      media.push({ id, bytes: blob.size, type: blob.type, hash });
    }
    return { library, media };
  });
  const openCourse = async () => {
    if (!await page.locator('#search-videos').isVisible()) await page.getByText('分類搜尋與動作庫', { exact: true }).click();
    await page.locator('#search-videos').getByRole('button', { name: '開啟課程', exact: true }).click(); await idle();
  };
  const downloads = [];
  const download = async (control, label, expected, suffix) => {
    const waiting = page.waitForEvent('download'); await control.click(); const file = await waiting;
    const path = `output/export-failure/recovery-${mode}-${label}-${file.suggestedFilename()}`; await file.saveAs(path);
    const bytes = await (await import('node:fs/promises')).readFile(path), { createHash } = await import('node:crypto');
    assert(bytes.length === expected.bytes && createHash('sha256').update(bytes).digest('hex') === expected.hash, '真正下載不等於整份原始 bytes：' + label);
    if (suffix) assert(file.suggestedFilename().endsWith(suffix), '未知檔案被冒充成可播放容器');
    downloads.push({ label, path, bytes: bytes.length, hash: expected.hash, name: file.suggestedFilename() });
  };
  await page.addInitScript(() => {
    window.recoveryEvidence = { sentinel: crypto.randomUUID(), captureCalls: 0, readErrors: [], aborts: [], offlineDrops: [], unloads: [], abortRead: false, dropOffline: false };
    for (const key of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices?.[key]) navigator.mediaDevices[key] = async () => { window.recoveryEvidence.captureCalls++; throw new Error('恢復案例只允許合成檔案'); };
    const keys = IDBObjectStore.prototype.getAllKeys, post = ServiceWorker.prototype.postMessage;
    IDBObjectStore.prototype.getAllKeys = function(...args) {
      const request = keys.apply(this, args);
      if (this.name === 'media' && window.recoveryEvidence.abortRead) {
        window.recoveryEvidence.abortRead = false;
        // 中止真正 readonly 交易，讓引擎發 trusted AbortError；不偽造 request error 或移除產品 guard。
        request.addEventListener('error', event => window.recoveryEvidence.readErrors.push({ trusted: event.isTrusted, name: request.error.name }));
        this.transaction.addEventListener('abort', event => window.recoveryEvidence.aborts.push({ trusted: event.isTrusted, mode: this.transaction.mode }));
        this.transaction.abort();
      }
      return request;
    };
    ServiceWorker.prototype.postMessage = function(message, ...args) {
      if (message?.type === 'CHECK_OFFLINE' && window.recoveryEvidence.dropOffline) {
        // 明示丟失檢查請求；產品必須等原本五秒期限，不縮時或假造 worker 成功回覆。
        window.recoveryEvidence.offlineDrops.push(performance.now()); return;
      }
      return post.call(this, message, ...args);
    };
    document.addEventListener('DOMContentLoaded', () => {
      window.addEventListener('beforeunload', event => window.recoveryEvidence.unloads.push({ trusted: event.isTrusted, prevented: event.defaultPrevented }));
    });
  });
  try {
    await page.goto(origin); await idle();
    await page.locator('#reference-file').setInputFiles('output/export-failure/reference.mp4'); await idle();
    await page.locator('#self-file').setInputFiles('output/export-failure/self.mp4'); await idle();
    for (const id of ['copy-reference', 'copy-self']) { await page.locator('#' + id).click(); await idle(); }
    await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成恢復基準'); await page.locator('#marker-note').fill('失敗或取消仍保留原片與筆記');
    await page.locator('#marker-form button[type=submit]').click(); await idle();
    await page.locator('#end').fill('3'); await page.locator('#end').press('Tab'); await idle();
    await page.locator('#export').click(); await idle();
    await page.waitForFunction(() => document.getElementById('media-summary').textContent.includes('本機副本 3'));
    const before = await snapshot(), artifact = before.library.data.exports.at(-1), expectedVs = before.media.find(row => row.id === artifact?.assetId);
    const take = before.library.data.takes.find(row => row.id === before.library.data.recipes.find(recipe => recipe.id === artifact.recipeId)?.takeId);
    assert(expectedVs && take && before.media.length === 3, '沒有真正保存三份媒體與 VS 基準');
    let result = {};
    if (mode === 'offline-timeout') {
      await page.locator('#offline-panel').getByText('離線、容量與更新', { exact: true }).click();
      await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('已檢查應用資源完整'));
      const cacheKeys = await page.evaluate(() => caches.keys());
      await page.evaluate(() => { window.recoveryEvidence.dropOffline = true; });
      const began = Date.now(); await page.locator('#check-offline').click();
      await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('暫時無法確認離線資源'), null, { timeout: 10_000 });
      const elapsedMs = Date.now() - began, drops = await page.evaluate(() => window.recoveryEvidence.offlineDrops.length);
      assert(drops === 1 && elapsedMs >= 4900, '未經產品原五秒期限或有重複檢查');
      assert(same(await snapshot(), before) && same(await page.evaluate(() => caches.keys()), cacheKeys), '離線檢查逾時改動資料或快取');
      await page.evaluate(() => { window.recoveryEvidence.dropOffline = false; }); await page.locator('#check-offline').click();
      await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('已檢查應用資源完整'));
      assert(same(await snapshot(), before), '恢復真正 worker 檢查後資料改變');
      result = { elapsedMs, requestsDropped: drops, realWorkerRetry: true, cacheKeysPreserved: true };
    } else if (mode === 'inventory-read') {
      await page.evaluate(() => { window.recoveryEvidence.abortRead = true; });
      await openCourse();
      await page.waitForFunction(() => document.getElementById('media-summary').textContent === '暫時無法檢查媒體，原資料保留；仍可下載 JSON。');
      const native = await page.evaluate(() => ({ errors: window.recoveryEvidence.readErrors, aborts: window.recoveryEvidence.aborts }));
      assert(native.errors.length === 1 && native.errors[0].trusted && native.errors[0].name === 'AbortError' && native.aborts.length === 1 && native.aborts[0].trusted && native.aborts[0].mode === 'readonly', '不是原生讀取交易的真正 AbortError');
      assert(same(await snapshot(), before), '只讀失敗改動完整筆記或影片');
      if (!await page.locator('#refresh-media').isVisible()) await page.getByText('影片副本與重新連結', { exact: true }).click();
      await page.locator('#refresh-media').click(); await idle();
      await page.waitForFunction(() => document.getElementById('media-summary').textContent.includes('本機副本 3'));
      assert(await page.locator('#media-items li').count() === 3 && same(await snapshot(), before), '重新檢查沒有恢復原清單與三份 bytes');
      result = { native, originalRowsRecovered: true, publicCourseEntry: true };
    } else if (mode === 'unknown-media') {
      const original = before.media.find(row => row.id === take.cameraAssetId), originalBytes = await (await import('node:fs/promises')).readFile('output/export-failure/self.mp4');
      const { createHash } = await import('node:crypto');
      assert(createHash('sha256').update(originalBytes).digest('hex') === original.hash, 'QA 還原來源不是原本保存的同一份自拍');
      const faultBytes = [0, 255, 17, 31, 47, 63, 79, 95, 111, 127, 143, 159, 175, 191, 207, 223], type = 'application/octet-stream';
      const put = async (bytes, mime) => page.evaluate(async ({ id, bytes, mime }) => {
        const request = indexedDB.open('dance-stamp', 1), db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        try { const tx = db.transaction('media', 'readwrite'); tx.objectStore('media').put(new Blob([new Uint8Array(bytes)], { type: mime }), id); await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; }); }
        finally { db.close(); }
      }, { id: take.cameraAssetId, bytes, mime });
      // 明示替換隔離庫中一份已存媒體；重載清除 session File，確保救援真的讀原生庫裡的未知 bytes。
      await put(faultBytes, type); await page.reload(); await idle();
      const faulty = await snapshot(), expected = faulty.media.find(row => row.id === take.cameraAssetId);
      assert(expected.hash === createHash('sha256').update(new Uint8Array(faultBytes)).digest('hex'), '首次讀回不等於預置的完整未知 bytes');
      assert(same(faulty.library, before.library) && faulty.media.every(row => row.id === take.cameraAssetId || same(row, before.media.find(old => old.id === row.id))), '故障注入碰到其他筆記或影片');
      await page.getByText('影片副本與重新連結', { exact: true }).click();
      await download(page.locator(`[data-asset-id="${take.cameraAssetId}"]`).getByRole('button', { name: '另存影片檔', exact: true }), 'unknown-original', expected, '.bin'); await idle();
      assert(expected.bytes === faultBytes.length && expected.type === type && same(await snapshot(), faulty), '救援改寫未知容器或資料');
      await put(Array.from(originalBytes), original.type); await page.reload(); await idle();
      assert(same(await snapshot(), before), '撤除已知 QA 故障後未精確恢復原始 bytes');
      await openCourse();
      await page.locator(`[data-focus-key="take:${take.id}:open"]`).click(); await idle();
      assert(await page.locator('#self').evaluate(video => video.readyState >= 2 && !video.error), '同一份已恢復原片不能由公開入口重新開啟');
      await page.locator(`[data-focus-key="export:${artifact.id}:download"]`).click(); await idle();
      result = { fault: 'explicit isolated native media replacement', originalRawBytesRescuedAsBin: true, restoredSameAssetAndTake: true, publicCourseEntry: true };
    } else if (mode === 'draft-navigation') {
      await openCourse();
      const navigationAttempts = [];
      const rejectNavigation = async label => {
        const sentinel = await page.evaluate(() => window.recoveryEvidence.sentinel), pending = page.waitForEvent('dialog');
        // 取消後沒有新頁載入；原生 reload 只等提醒回復，避免控制器再等不存在的導覽完成。
        const reload = page.evaluate(() => { location.reload(); return 'requested'; }).then(value => ({ value }), error => ({ error: String(error) }));
        const dialog = await pending; assert(dialog.type() === 'beforeunload', '不是瀏覽器真正的離頁提醒'); await dialog.dismiss();
        const outcome = await reload, event = await page.evaluate(() => window.recoveryEvidence.unloads.at(-1));
        assert(await page.evaluate(value => window.recoveryEvidence.sentinel === value, sentinel) && event.trusted && event.prevented && same(await snapshot(), before), '取消原生離頁沒有保留草稿或完整資料');
        navigationAttempts.push({ label, event, outcome, sameDocument: true, cancelled: true });
      };
      await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成離頁標記草稿'); await page.locator('#marker-note').fill('留在頁面仍完整');
      await rejectNavigation('marker'); assert(await page.locator('#marker-note').inputValue() === '留在頁面仍完整', '取消離頁吃掉標記草稿'); await page.locator('#cancel-marker').click();
      await page.getByText('手動 BPM 與八拍', { exact: true }).click(); await page.locator('#beat-bpm').fill('121'); await page.locator('#beat-first').fill('0.25');
      await rejectNavigation('beats'); assert(await page.locator('#beat-bpm').inputValue() === '121' && await page.locator('#beat-first').inputValue() === '0.25', '取消離頁吃掉拍點草稿'); await page.locator('#beat-cancel').click();
      await page.locator('#move-name').fill('合成離頁動作草稿'); await page.locator('#move-style').fill('Salsa');
      await rejectNavigation('move'); assert(await page.locator('#move-name').inputValue() === '合成離頁動作草稿', '取消離頁吃掉動作草稿'); await page.locator('#cancel-move').click();
      result = { nativeBeforeUnloadDialogs: navigationAttempts, allDraftsRetained: true, explicitCancelAllowsCleanReload: true, publicCourseEntry: true };
    } else throw new Error('未知恢復情境');
    assert(same(await snapshot(), before), '恢復流程改掉完整 metadata／revision 或媒體');
    await download(page.locator('#output-download'), 'preserved-vs', expectedVs);
    const evidence = await page.evaluate(() => ({ captureCalls: window.recoveryEvidence.captureCalls, storageUnknown: !document.getElementById('storage-recovery').hidden, busy: document.getElementById('controls').disabled }));
    assert(evidence.captureCalls === 0 && !evidence.storageUnknown && !evidence.busy, '留下忙碌、未確認保存或擷取請求');
    await page.reload(); await idle(); assert(same(await snapshot(), before), '正常重開後原資料與媒體不符');
    return { mode, ...result, ...evidence, allMetadataRevisionAndMediaHashesPreserved: true, samePageRetry: true, reloadPreserved: true, downloads };
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({ status: document.getElementById('status')?.textContent, media: document.getElementById('media-summary')?.textContent, offline: document.getElementById('offline-status')?.textContent, trace: window.recoveryEvidence })).catch(() => null);
    throw new Error(String(error) + ' ' + JSON.stringify(diagnostic));
  }
}
