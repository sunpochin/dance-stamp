/* 用途：以產品操作驗證 #3 長錄影與成檔。所在層：瀏覽器驗收。關聯：run-media-feasibility.py、analyze-media.py。 */
async (page, options) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const { phase, baseUrl, seconds, rate, name } = options;
  if (phase === 'start') {
    await page.goto(baseUrl);
    await page.evaluate(() => {
      if (window.__danceSyntheticCameraOnly !== true) throw new Error('禁止實測工具啟用真人相機。');
      window.feasibility = { tracks: [], requests: [] };
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
    const storage = await page.evaluate(async () => {
      const { readLibrary, readMedia } = await import('/storage.js');
      const state = await readLibrary();
      const missing = [];
      for (const asset of state.data.assets.filter(asset => asset.kind !== 'reference' && asset.state === 'ready')) {
        if (!(await readMedia(asset.id))?.size) missing.push(asset.id);
      }
      return { takes: state.data.takes.length, exports: state.data.exports.length, missing: missing.length };
    });
    assert(storage.missing === 0, '已保存的媒體遺失');
    return { diagnostics, outputPath, storage, cameraReleased: true, noMicrophone: true, userAgent: await page.evaluate(() => navigator.userAgent) };
  }
  throw new Error('未知媒體驗證階段');
}
