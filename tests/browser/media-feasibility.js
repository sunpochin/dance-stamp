/* 用途：以產品操作驗證 #3 長錄影與成檔。所在層：瀏覽器驗收。關聯：run-media-feasibility.py、analyze-media.py。 */
async (page, options) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const { phase, baseUrl, seconds, rate, name } = options;
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
      window.feasibility = { tracks: [], requests: [], frames: { pending: new Set(), requested: 0, delivered: 0, cancelled: 0, maximum: 0 } };
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
    return { takePath };
  }
  if (phase === 'export-status') return page.evaluate(() => ({ ready: !document.getElementById('compare').disabled,
    status: document.getElementById('status').textContent, diagnostics: JSON.parse(document.getElementById('diagnostics').textContent) }));
  if (phase === 'recovery') {
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
      missingBlobDetectedAndRestored: true, storageNegative, filesPreserved: true, frames };
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
    // 檢查真正的持久化媒體，不只確認下載連結存在；十次連續試驗沿用同一資料庫。
    const storage = await storageCheck();
    assert(storage.missing === 0, '已保存的媒體遺失');
    const frames = await page.evaluate(() => { const {pending,...counts}=window.feasibility.frames; return {...counts,pending:pending.size}; });
    assert(frames.pending === 0 && frames.maximum <= 2 && frames.delivered > 0, '影格訂閱未正常執行或未釋放');
    return { diagnostics, outputPath, storage, frames, cameraReleased: true, noMicrophone: true, userAgent: await page.evaluate(() => navigator.userAgent) };
  }
  throw new Error('未知媒體驗證階段');
}
