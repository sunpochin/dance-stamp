/* 用途：以產品操作驗證 #3 長錄影與成檔。所在層：瀏覽器驗收。關聯：run-media-feasibility.py、analyze-media.py。 */
async (page, options) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const { phase, baseUrl, seconds, rate, name } = options;
  const verifySaved = (kind, exportIds) => page.evaluate(async ({ kind, exportIds }) => {
    const { readLibrary, readMedia } = await import('/storage.js'); const { data } = await readLibrary();
    const test = window.feasibility;
    const rows = kind === 'take' ? data.takes.filter(row => !test.before.takeIds.includes(row.id))
      : data.exports.filter(row => !(exportIds || test.before.exportIds).includes(row.id));
    // 保存失敗時下載仍可用；必須證明本輪新增成功關聯，不能只數現存的舊媒體。
    if (rows.length !== 1 || rows[0].state !== 'ready') throw new Error(kind === 'take' ? '本輪 take 未新增並完成保存' : '本輪 VS 未新增並完成保存');
    const row = rows[0], id = kind === 'take' ? row.cameraAssetId : row.assetId;
    if (kind === 'take') test.takeId = row.id;
    else if (data.recipes.find(recipe => recipe.id === row.recipeId)?.takeId !== test.takeId) throw new Error('本輪 VS 關聯錯誤');
    const saved = await readMedia(id), href = document.getElementById(kind === 'take' ? 'take-download' : 'output-download').href;
    const downloaded = test.blobs.get(href);
    if (!downloaded?.size) throw new Error('找不到本輪下載內容');
    const digest = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].join(',');
    if (!saved?.size || saved.size !== downloaded.size || await digest(saved) !== await digest(downloaded)) throw new Error('本輪保存內容與下載不符');
    return true;
  }, { kind, exportIds });
  const storageCheck = () => page.evaluate(async () => {
    const { readLibrary, readMedia } = await import('/storage.js');
    const { data } = await readLibrary();
    // readLibrary 會把遺失 Blob 的 asset 改成 missing，必須從保存關聯找預期檔案，不能篩掉 missing。
    const expected = new Set([...data.takes.filter(take => ['ready', 'interrupted'].includes(take.state)).map(take => take.cameraAssetId),
      ...data.exports.filter(output => output.state === 'ready').map(output => output.assetId)]);
    const missing = [];
    for (const id of expected) if (!(await readMedia(id))?.size) missing.push(id);
    return { takes: data.takes.length, exports: data.exports.length, expected: expected.size, missing: missing.length };
  });
  if (phase === 'start') {
    await page.goto(baseUrl);
    await page.evaluate(() => {
      if (window.__danceSyntheticCameraOnly !== true) throw new Error('禁止實測工具啟用真人相機。');
      window.feasibility = { tracks: [], requests: [], blobs: new Map(), frames: { pending: new Set(), requested: 0, delivered: 0, cancelled: 0, maximum: 0 } };
      const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL;
      // 只觀察下載 URL 的原始 Blob；產品 CSP 不開放 blob fetch，不為測試放寬它。
      URL.createObjectURL = blob => { const url = createUrl.call(URL, blob); window.feasibility.blobs.set(url, blob); return url; };
      URL.revokeObjectURL = url => { window.feasibility.blobs.delete(url); revokeUrl.call(URL, url); };
      const requestFrame = HTMLVideoElement.prototype.requestVideoFrameCallback;
      const cancelFrame = HTMLVideoElement.prototype.cancelVideoFrameCallback;
      if (requestFrame) {
        // 只觀察產品自己的訂閱，測試不能另掛回呼而意外修好離屏停格。
        HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {
          const watched = ['reference', 'self'].includes(this.id), audit = window.feasibility.frames;
          let handle;
          handle = requestFrame.call(this, (...args) => {
            if (watched) { audit.pending.delete(`${this.id}:${handle}`); audit.delivered++; }
            callback(...args);
          });
          if (watched) { audit.pending.add(`${this.id}:${handle}`); audit.requested++; audit.maximum = Math.max(audit.maximum, audit.pending.size); }
          return handle;
        };
        HTMLVideoElement.prototype.cancelVideoFrameCallback = function(handle) {
          if (['reference', 'self'].includes(this.id)) { window.feasibility.frames.pending.delete(`${this.id}:${handle}`); window.feasibility.frames.cancelled++; }
          return cancelFrame.call(this, handle);
        };
      }
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        window.feasibility.requests.push(constraints);
        const stream = await original(constraints);
        if (!/fake|test|camera\.y4m/i.test(stream.getVideoTracks()[0].label)) {
          stream.getTracks().forEach(track => track.stop());
          throw new Error('相機不是合成測片。');
        }
        window.feasibility.tracks.push(...stream.getTracks());
        return stream;
      };
    });
    await page.evaluate(async () => {
      const { data } = await (await import('/storage.js')).readLibrary();
      window.feasibility.before = { takeIds: data.takes.map(row => row.id), exportIds: data.exports.map(row => row.id) };
    });
    if (options.forceWebM) await page.evaluate(() => {
      // 只略過 MP4 候選，仍交由原生編碼器試錄；不能把能力偵測偽造成成功。
      const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder);
      MediaRecorder.isTypeSupported = mime => !mime.startsWith('video/mp4') && supported(mime);
    });
    await page.locator('#reference-file').setInputFiles('output/media-feasibility/reference.mp4');
    await page.waitForFunction(() => !document.getElementById('camera').disabled);
    await page.locator('#start').fill('0');
    await page.locator('#end').fill(String(seconds * rate));
    await page.locator('#rate').selectOption(String(rate));
    await page.locator('#camera').click();
    await page.waitForFunction(() => !document.getElementById('capture').disabled);
    await page.locator('#capture').click();
    return { started: true, seconds, rate };
  }
  if (phase === 'capture-status') return page.evaluate(() => ({ ready: !document.getElementById('compare').disabled,
    status: document.getElementById('status').textContent, diagnostics: JSON.parse(document.getElementById('diagnostics').textContent) }));
  if (phase === 'export') {
    assert(await page.evaluate(() => window.feasibility.tracks.every(track => track.readyState === 'ended')), '相機沒有釋放');
    assert(await page.evaluate(() => window.feasibility.requests.every(request => request.audio === false)), '意外要求麥克風');
    await verifySaved('take');
    const saving = page.waitForEvent('download');
    await page.locator('#take-download').click();
    const take = await saving;
    const takePath = `output/media-feasibility/${name}-take.${take.suggestedFilename().split('.').pop()}`;
    await take.saveAs(takePath);
    if (options.offset !== undefined) {
      await page.locator('#offset').fill(String(options.offset));
      await page.locator('#offset').press('Tab');
      await page.waitForFunction(() => !document.getElementById('controls').disabled);
      for (const [id, checked] of [['reference-mirror', options.referenceMirror], ['self-mirror', options.selfMirror]]) {
        await page.locator(`#${id}`).setChecked(checked);
        await page.waitForFunction(() => !document.getElementById('controls').disabled);
      }
    }
    await page.locator('#export').click();
    return { takePath, currentTakeSaved: true };
  }
  if (phase === 'export-status') return page.evaluate(() => ({ ready: !document.getElementById('compare').disabled,
    status: document.getElementById('status').textContent, diagnostics: JSON.parse(document.getElementById('diagnostics').textContent) }));
  if (phase === 'recovery') {
    const beforeExports = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data.exports.map(row => row.id));
    await page.evaluate(() => {
      window.g3OriginalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === 'media') throw new DOMException('synthetic export quota', 'QuotaExceededError');
        return window.g3OriginalPut.apply(this, args);
      };
    });
    let quotaRejected = false;
    try {
      await page.locator('#export').click();
      await page.waitForFunction(() => !document.getElementById('compare').disabled && document.getElementById('status').textContent.includes('無法保存'));
      assert(await page.evaluate(() => !JSON.parse(document.getElementById('diagnostics').textContent).lastError), '未重現成檔但保存失敗沒有 lastError');
      assert((await storageCheck()).missing === 0, '未重現舊保存檢查誤通過');
      try { await verifySaved('vs', beforeExports); }
      catch (error) { if (!String(error).includes('本輪 VS 未新增並完成保存')) throw error; quotaRejected = true; }
      assert(quotaRejected, '新檢查漏掉本輪未保存的 VS');
      const saving = page.waitForEvent('download'); await page.locator('#output-download').click();
      const download = await saving;
      await download.saveAs(`output/media-feasibility/${name}-quota-unsaved.${download.suggestedFilename().split('.').pop()}`);
    } finally { await page.evaluate(() => { IDBObjectStore.prototype.put = window.g3OriginalPut; }); }
    const originalTake = await page.locator('#take-download').getAttribute('href');
    const originalOutput = await page.locator('#output-download').getAttribute('href');
    for (const [button, message] of [['#export', '合成中'], ['#play', '共同預覽中']]) {
      await page.locator(button).click();
      await page.waitForFunction(message => document.getElementById('status').textContent.includes(message), message);
      await page.waitForFunction(() => window.feasibility.frames.pending.size > 0);
      await page.locator('#stop').click();
      await page.waitForFunction(() => !document.getElementById('compare').disabled);
      assert(await page.evaluate(() => window.feasibility.frames.pending.size === 0), '取消後仍有呈現訂閱');
    }
    await page.evaluate(() => {
      const video = document.getElementById('self'); window.g3OriginalPlay = video.play;
      // 播放尚未全部就緒就拒絕時，也不能殘留訂閱或破壞既有成檔。
      video.play = async () => { throw new Error('synthetic play rejection'); };
    });
    try {
      await page.locator('#export').click();
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('synthetic play rejection'));
      await page.waitForFunction(() => !document.getElementById('compare').disabled);
    } finally { await page.evaluate(() => { document.getElementById('self').play = window.g3OriginalPlay; }); }
    await page.locator('#export').click();
    await page.waitForFunction(() => window.feasibility.frames.pending.size > 0);
    await page.evaluate(() => {
      const context = document.getElementById('canvas').getContext('2d'); window.g3OriginalDraw = context.drawImage;
      // 回呼已啟動後再模擬繪製失敗，才能真正覆蓋排程錯誤時的清理路徑。
      context.drawImage = () => { throw new Error('synthetic frame rejection'); };
    });
    try {
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('synthetic frame rejection'));
      await page.waitForFunction(() => !document.getElementById('compare').disabled);
    } finally { await page.evaluate(() => { document.getElementById('canvas').getContext('2d').drawImage = window.g3OriginalDraw; }); }
    const frames = await page.evaluate(() => { const {pending,...counts}=window.feasibility.frames; return {...counts,pending:pending.size}; });
    assert(frames.pending === 0 && frames.maximum <= 2, '錯誤後呈現訂閱殘留');
    assert(await page.locator('#take-download').getAttribute('href') === originalTake, '取消／錯誤破壞原片');
    assert(await page.locator('#output-download').getAttribute('href') === originalOutput, '取消／錯誤破壞既有輸出');
    let storageNegative;
    try {
      await page.evaluate(async () => {
        if (window.__danceSyntheticCameraOnly !== true) throw new Error('負向自查只允許合成資料庫');
        const { readLibrary, readMedia, openStore } = await import('/storage.js');
        const { data } = await readLibrary(), id = data.takes.find(take => take.state === 'ready').cameraAssetId;
        const blob = await readMedia(id); if (!blob?.size) throw new Error('負向自查前原片已遺失');
        window.g3MissingMedia = { id, blob };
        const tx = (await openStore()).transaction('media', 'readwrite');
        tx.objectStore('media').delete(id);
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
      });
      const correctedMissing = (await storageCheck()).missing;
      const legacyMissing = await page.evaluate(async () => {
        const { readLibrary, readMedia } = await import('/storage.js'); const { data } = await readLibrary();
        let missing = 0;
        for (const asset of data.assets.filter(asset => asset.kind !== 'reference' && asset.state === 'ready')) if (!(await readMedia(asset.id))?.size) missing++;
        return missing;
      });
      assert(legacyMissing === 0 && correctedMissing === 1, '沒有重現舊檢查漏算或修正仍漏掉實際遺失');
      storageNegative = { legacyMissing, correctedMissing };
    } finally {
      // 故障注入只動合成副本；保留同一 Blob 並在 finally 還原，最終指紋再核對未變。
      await page.evaluate(async () => {
        if (!window.g3MissingMedia) return;
        const { openStore } = await import('/storage.js'), { id, blob } = window.g3MissingMedia;
        const tx = (await openStore()).transaction('media', 'readwrite'); tx.objectStore('media').put(blob, id);
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
        delete window.g3MissingMedia;
      });
    }
    storageNegative.restoredMissing = (await storageCheck()).missing;
    assert(storageNegative.restoredMissing === 0, '負向自查後未還原原片');
    return { exportCancellation: true, previewCancellation: true, playRejection: true, frameRejection: true,
      missingBlobDetectedAndRestored: true, quotaUnsavedExportRejected: quotaRejected, storageNegative, filesPreserved: true, frames };
  }
  if (phase === 'save') {
    const diagnostics = JSON.parse(await page.locator('#diagnostics').textContent());
    assert(diagnostics.capture?.interrupted === false, '錄影中斷');
    assert(!diagnostics.lastError, `媒體操作失敗：${diagnostics.lastError}`);
    assert(diagnostics.export?.decodedDurationMs > seconds * 1000 - 500, '輸出長度不足');
    const saving = page.waitForEvent('download');
    await page.locator('#output-download').click();
    const output = await saving;
    const outputPath = `output/media-feasibility/${name}-vs.${output.suggestedFilename().split('.').pop()}`;
    await output.saveAs(outputPath);
    await verifySaved('vs');
    // 檢查真正的持久化媒體，不只確認下載連結存在；十次連續試驗沿用同一資料庫。
    const storage = await storageCheck();
    assert(storage.missing === 0, '已保存的媒體遺失');
    const frames = await page.evaluate(() => { const {pending,...counts}=window.feasibility.frames; return {...counts,pending:pending.size}; });
    assert(frames.pending === 0 && frames.maximum <= 2 && frames.delivered > 0, '影格訂閱未正常執行或未釋放');
    return { diagnostics, outputPath, storage, frames, currentExportSaved: true, cameraReleased: true, noMicrophone: true, userAgent: await page.evaluate(() => navigator.userAgent) };
  }
  throw new Error('未知媒體驗證階段');
}
