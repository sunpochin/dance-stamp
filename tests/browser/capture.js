/* 檔案用途：驗證相機失敗、取消、原片保護與暫存恢復。所在層：隔離合成媒體回歸。主要關聯：capture-matrix.js、storage.js、main.js。 */
// 相機設定已收在選用區；先展開，再沿用原本的錄影與資料保護斷言。
async (page) => {
  const origin = new URL(page.url()).origin, checks = {};
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const stage = value => page.evaluate(value => { window.capture9Stage = value; }, value);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices), NativeRecorder = window.MediaRecorder;
    window.captureTracks = []; window.captureRequests = []; window.captureRecorders = [];
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!window.__danceSyntheticCameraOnly) throw new Error('必須使用合成相機');
      window.captureRequests.push(constraints);
      if (window.captureFailNext) { const name = window.captureFailNext; window.captureFailNext = null; throw new DOMException('synthetic device error', name); }
      const stream = await original(constraints); window.captureTracks.push(...stream.getTracks()); return stream;
    };
    window.MediaRecorder = class extends NativeRecorder { constructor(...args) { super(...args); window.captureRecorders.push(this); } };
    // 只對此隔離頁的合成資料確認保留／重錄，不操作真人素材。
    window.confirm = () => true;
  });
  await page.goto(origin);
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#copy-reference').click(); await idle();
  const videoId = await page.locator('#library').inputValue();
  await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  // 本案例要保護已保存的舊片；外部選片不自動落盤，先由明確操作保存基準副本。
  await page.locator('#copy-self').click(); await idle();
  const originalTake = (await library()).takes.at(-1);
  for (const button of ['capture', 'new-take']) {
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
    await page.evaluate(() => { window.confirm = () => false; });
    await page.locator(`#${button}`).click(); await idle();
    assert((await library()).takes.length === 1 && await page.evaluate(() => window.captureTracks.every(t => t.readyState === 'ended') && !document.getElementById('preview').srcObject), '確認框取消後仍開相機或變更舊 take');
    await page.evaluate(() => { window.confirm = () => true; });
  }
  checks.decliningCaptureOrNextTakeClosesPreview = true;
  for (const [name, message] of [['NotAllowedError', '允許相機'], ['NotReadableError', '其他程式']]) {
    await page.evaluate(name => { window.captureFailNext = name; }, name); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
    assert((await page.locator('#status').textContent()).includes(message) && await page.locator('#preview').evaluate(v => !v.srcObject), '相機失敗沒有中文重試說明或仍留串流');
  }
  const calls = await page.evaluate(() => window.captureRequests.length);
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera-facing').selectOption('environment');
  assert(await page.evaluate(() => window.captureRequests.length) === calls, '切鏡頭選項就自動取用相機');
  await page.evaluate(() => { window.captureFailNext = 'OverconstrainedError'; }); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('後鏡頭') && await page.evaluate(() => window.captureRequests.at(-1).video.facingMode.exact === 'environment'), '後鏡頭缺少被靜默換成前鏡頭');
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera-facing').selectOption('user'); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
  assert(await page.locator('.body-guide').isVisible() && await page.locator('#preview').evaluate(v => v.muted && v.srcObject.getAudioTracks().length === 0), '缺少全身取景框或開啟麥克風');
  await page.locator('#capture').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('秒後開始'));
  await page.locator('#stop').click(); await idle();
  await page.locator('#offset').fill('0.1'); await page.locator('#offset').dispatchEvent('change'); await idle();
  let data = await library();
  assert(data.takes.at(-1).state === 'failed' && data.recipes.find(r => r.takeId === originalTake.id).offsetMs === 100 && data.recipes.find(r => r.takeId === data.takes.at(-1).id).offsetMs === 0, '倒數取消後仍錯綁舊自拍');
  checks.permissionBusyRearRetryAndCountdownCancel = true;
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#new-take').click(); await idle();
  assert(await page.locator('#start').isEnabled() && (await library()).takes.some(t => t.id === originalTake.id), '準備新段刪掉舊 take 或沒有解鎖');
  await page.locator('#end').fill('14'); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
  const countBeforeInvalid = (await library()).takes.length;
  await page.locator('#capture').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('15 到 60 秒') && (await library()).takes.length === countBeforeInvalid, '短錄影未拒絕或產生假工作');
  await page.locator('#end').fill('15'); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
  await page.locator('#capture').click(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.captureTracks.at(-1).dispatchEvent(new Event('mute'))); await idle();
  data = await library(); const partial = data.takes.at(-1);
  assert(partial.state === 'interrupted' && await page.evaluate(() => window.captureTracks.every(t => t.readyState === 'ended')), '相機 mute 沒有停止／標示中斷／釋放');
  await page.locator('#takes li').last().getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
  assert((await library()).takes.find(t => t.id === partial.id).state === 'interrupted' && (await page.locator('#status').textContent()).includes('仍標示中斷'), '開啟中斷原片後被當成完整成功');
  checks.partialStaysInterruptedOnReopen = true;
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#new-take').click(); await idle(); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
  await page.locator('#capture').click(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
  await page.waitForTimeout(1200); await page.evaluate(() => window.captureRecorders.at(-1).dispatchEvent(new Event('error'))); await idle();
  assert((await library()).takes.at(-1).state === 'interrupted' && await page.evaluate(() => window.captureTracks.every(t => t.readyState === 'ended')), '編碼 error 被標成成功或相機未關');
  checks.encoderFailureKeepsRecoverableState = true;
  const interruptedCases = [];
  for (const cause of ['ended', 'rotation', 'freeze', 'visibility', 'resize']) {
    await stage(cause);
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#new-take').click(); await idle(); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
    await page.locator('#capture').click(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
    await page.waitForTimeout(1100);
    await page.evaluate(cause => {
      if (cause === 'ended') window.captureTracks.at(-1).dispatchEvent(new Event('ended'));
      if (cause === 'rotation') window.dispatchEvent(new Event('orientationchange'));
      if (cause === 'freeze') document.dispatchEvent(new Event('freeze'));
      if (cause === 'visibility') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        try { document.dispatchEvent(new Event('visibilitychange')); } finally { delete document.hidden; }
      }
      if (cause === 'resize') {
        const video = document.getElementById('preview'); Object.defineProperty(video, 'videoWidth', { configurable: true, value: video.videoWidth + 1 });
        try { video.dispatchEvent(new Event('resize')); } finally { delete video.videoWidth; }
      }
    }, cause);
    await idle();
    const take = (await library()).takes.at(-1);
    assert(take.state === 'interrupted' && await page.evaluate(() => window.captureTracks.every(t => t.readyState === 'ended')), `合成 ${cause} 中斷沒有停止並保留狀態`);
    interruptedCases.push({ cause, state: take.state });
  }
  checks.simulatedInterruptions = interruptedCases;
  for (const target of ['chunks', 'media']) {
    await stage(`quota:${target}`);
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#new-take').click(); await idle(); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
    await page.evaluate(target => {
      const method = target === 'chunks' ? 'add' : 'put', original = IDBObjectStore.prototype[method];
      window.restoreCaptureQuota = () => { IDBObjectStore.prototype[method] = original; };
      IDBObjectStore.prototype[method] = function(...args) { if (this.name === target) throw new DOMException('synthetic quota', 'QuotaExceededError'); return original.apply(this, args); };
    }, target);
    try {
      await page.locator('#capture').click();
      if (target === 'media') {
        await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中')); await page.waitForTimeout(1100); await page.locator('#stop').click();
      }
      await idle();
      const take = (await library()).takes.at(-1);
      assert(take.state === 'interrupted' && await page.locator('#take-download').isVisible(), `${target} quota 錯誤未保留原片或被當成成功`);
    } finally { await page.evaluate(() => window.restoreCaptureQuota()); }
  }
  checks.chunkAndMediaQuotaKeepRawDownload = true;
  await stage('chunk-recovery');
  const cases = await page.evaluate(async originalId => {
    const store = await import('/storage.js'), saved = await store.readLibrary(), original = saved.data.takes.find(t => t.id === originalId), originalBlob = await store.readMedia(original.cameraAssetId);
    const results = [];
    for (const kind of ['valid', 'gap', 'corrupt']) {
      const assetId = crypto.randomUUID(), takeId = crypto.randomUUID();
      saved.data.assets.push({ id: assetId, kind: 'take', byteLength: 0, mimeType: 'video/mp4' });
      saved.data.takes.push({ ...original, id: takeId, cameraAssetId: assetId, state: 'recording', captureTiming: undefined });
      saved.data.recipes.push({ id: crypto.randomUUID(), takeId, offsetMs: 0, referenceMirror: false, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 });
      const blob = kind === 'corrupt' ? new Blob(['synthetic undecodable'], { type: 'video/mp4' }) : originalBlob, middle = Math.floor(blob.size / 2);
      await store.saveChunk(assetId, 0, blob.slice(0, middle, blob.type)); await store.saveChunk(assetId, kind === 'gap' ? 2 : 1, blob.slice(middle, blob.size, blob.type));
      let duplicateRejected = false;
      try { await store.saveChunk(assetId, 0, new Blob(['overwrite'], { type: blob.type })); } catch { duplicateRejected = true; }
      if (!duplicateRejected) throw new Error('重複 index 覆寫原 chunk');
      results.push({ kind, assetId, takeId, index: saved.data.takes.length - 1 });
    }
    await store.writeLibrary(saved.data, saved.revision); return results;
  }, originalTake.id);
  await page.reload(); await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
  const valid = cases.find(c => c.kind === 'valid');
  await page.locator('#takes li').nth(valid.index).getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
  assert((await library()).takes.find(t => t.id === valid.takeId).state === 'interrupted' && await page.locator('#self').evaluate(v => v.readyState >= 2), '連續 chunks 恢復沒有讀回或誤稱完整錄影');
  const corrupt = cases.find(c => c.kind === 'corrupt'), beforeSource = await page.locator('#self').getAttribute('src');
  await page.locator('#takes li').nth(corrupt.index).getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
  assert((await library()).takes.find(t => t.id === corrupt.takeId).state === 'interrupted' && await page.locator('#self').getAttribute('src') === beforeSource, '壞暫存被標成成功或破壞原播放器');
  const gap = cases.find(c => c.kind === 'gap');
  await page.locator('#takes li').nth(gap.index).getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
  const recovery = await page.evaluate(async cases => {
    const store = await import('/storage.js'), saved = await store.readLibrary(), db = await new Promise(resolve => { const req = indexedDB.open('dance-stamp', 1); req.onsuccess = () => resolve(req.result); });
    try {
      const counts = await Promise.all(cases.map(c => new Promise(resolve => { const req = db.transaction('chunks').objectStore('chunks').count(IDBKeyRange.bound([c.assetId, 0], [c.assetId, Number.MAX_SAFE_INTEGER])); req.onsuccess = () => resolve({ kind: c.kind, chunks: req.result }); })));
      return { counts, ready: cases.map(c => ({ kind: c.kind, state: saved.data.takes.find(t => t.id === c.takeId).state, present: saved.data.assets.find(a => a.id === c.assetId).state })) };
    } finally { db.close(); }
  }, cases);
  assert(recovery.counts.find(c => c.kind === 'valid').chunks === 0 && recovery.counts.filter(c => c.kind !== 'valid').every(c => c.chunks === 2) && recovery.ready.every(c => c.state !== 'ready'), `恢復刪掉壞資料或誤標成功：${JSON.stringify(recovery)}`);
  checks.chunkSequenceDuplicateDecodeAndRecovery = recovery;
  assert(await page.evaluate(() => window.captureRequests.every(c => c.audio === false) && window.captureTracks.every(t => t.readyState === 'ended')), '測試結束仍有相機或曾請求麥克風');
  return checks;
}
