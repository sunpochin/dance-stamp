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
    window.captureTracks = []; window.captureRequests = []; window.captureRecorders = []; window.captureRecorderEvents = new WeakMap();
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!window.__danceSyntheticCameraOnly) throw new Error('必須使用合成相機');
      window.captureRequests.push(constraints);
      if (window.captureFailNext) { const name = window.captureFailNext; window.captureFailNext = null; throw new DOMException('synthetic device error', name); }
      const stream = await original(constraints); window.captureTracks.push(...stream.getTracks()); return stream;
    };
    window.MediaRecorder = class extends NativeRecorder {
      constructor(...args) {
        super(...args); window.captureRecorders.push(this);
        // 從建立時旁聽，才不漏掉已由 timeslice 送出的非空資料；stop 的最後一包可合法為空。
        // 每個實例分開記錄，格式啟動失敗後的 fallback 不能混進本輪成功編碼器。
        const events = []; window.captureRecorderEvents.set(this, events);
        for (const name of ['start', 'dataavailable', 'stop', 'error']) this.addEventListener(name, event => events.push({ name, trusted: event.isTrusted, bytes: event.data?.size }));
      }
    };
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
      const blob = kind === 'corrupt' ? new Blob(['synthetic undecodable'], { type: 'video/mp4' }) : originalBlob, bytes = await blob.arrayBuffer(), middle = Math.floor(bytes.byteLength / 2);
      // 每塊使用獨立 bytes，貼近 MediaRecorder 輸出，避免 Safari 的持久化 slice 共用母片干擾恢復驗證。
      await store.saveChunk(assetId, 0, new Blob([bytes.slice(0, middle)], { type: blob.type })); await store.saveChunk(assetId, kind === 'gap' ? 2 : 1, new Blob([bytes.slice(middle)], { type: blob.type }));
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
  // 當頁能播放可能仍借用舊 chunks；重新載入後比完整 bytes，才證明清理沒有破壞已存原片。
  await page.reload(); await idle();
  checks.recoveredBytesAfterReload = await page.evaluate(async ids => {
    const store = await import('/storage.js'), source = await store.readMedia(ids[0]), recovered = await store.readMedia(ids[1]);
    if (!source || !recovered) return false;
    const left = new Uint8Array(await source.arrayBuffer()), right = new Uint8Array(await recovered.arrayBuffer());
    return left.length > 0 && left.length === right.length && left.every((byte, index) => byte === right[index]);
  }, [originalTake.cameraAssetId, valid.assetId]);
  assert(checks.recoveredBytesAfterReload, '清 chunks 後重開的恢復原片缺少或 bytes 改變');
  // 原恢復案例全部完成後才追加：狀態更新也可能失敗，不能因第二個錯誤弄丟真正早停的原片。
  const full = () => page.evaluate(async () => {
    const store = await import('/storage.js'), db = await store.openStore();
    const read = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['metadata', 'media', 'chunks']);
    const values = await Promise.all([read(tx.objectStore('metadata').get('library')), read(tx.objectStore('media').getAllKeys()), read(tx.objectStore('media').getAll()), read(tx.objectStore('chunks').getAllKeys()), read(tx.objectStore('chunks').getAll())]);
    const rows = async (keys, blobs) => Promise.all(blobs.map(async (blob, index) => ({ id: keys[index], bytes: blob.size, type: blob.type, hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('') })));
    return { saved: values[0], media: await rows(values[1], values[2]), chunks: await rows(values[3], values[4]) };
  });
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
  await page.locator(`[data-focus-key="take:${originalTake.id}:open"]`).click(); await idle();
  await page.locator('#end').fill('3'); await page.locator('#end').press('Tab'); await idle();
  await page.locator('#export').click(); await idle(); assert(await page.locator('#output-download').isVisible(), '停止狀態失敗基準沒有真正 VS');
  await page.locator('#end').fill('15'); await page.locator('#end').press('Tab'); await idle();
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成狀態失敗保留'); await page.locator('#marker-note').fill('新片狀態保存失敗不能刪掉這份筆記'); await page.locator('#marker-form button[type=submit]').click(); await idle();
  const before = await full(), artifact = before.saved.data.exports.at(-1), expectedVs = before.media.find(row => row.id === artifact?.assetId);
  assert(expectedVs && before.saved.data.markers.some(row => row.note === '新片狀態保存失敗不能刪掉這份筆記') && before.chunks.length > 0, '沒有非空筆記、舊 VS 與其他待恢復 chunks 可驗保全');
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
  await page.locator('#capture').click(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
  const started = await full(), target = started.saved.data.takes.at(-1);
  assert(target.state === 'recording' && !before.saved.data.takes.some(t => t.id === target.id) && started.saved.revision === before.saved.revision + 1, '新錄影沒有單獨建立工作記錄');
  for (const [table, rows] of Object.entries(before.saved.data)) if (Array.isArray(rows)) assert(started.saved.data[table].length === rows.length + (['assets', 'takes', 'recipes'].includes(table) ? 1 : 0) && equal(started.saved.data[table].filter(row => rows.some(old => old.id === row.id)), rows), '建立新錄影改動原資料表：' + table);
  await page.waitForFunction(async id => {
    const db = await (await import('/storage.js')).openStore();
    return await new Promise(resolve => { const req = db.transaction('chunks').objectStore('chunks').count(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])); req.onsuccess = () => resolve(req.result > 0); });
  }, target.cameraAssetId);
  await page.evaluate(id => {
    const put = IDBObjectStore.prototype.put;
    const audit = window.stoppedStateFailure = { puts: 0, errors: [], aborts: [], recorderEvents: [], unhandled: [], restored: false };
    window.addEventListener('unhandledrejection', event => audit.unhandled.push(String(event.reason)));
    IDBObjectStore.prototype.put = function(value, ...args) {
      const request = put.call(this, value, ...args);
      if (this.name === 'metadata' && value?.data?.takes.some(t => t.id === id && t.state === 'interrupted')) {
        // 只中止早停之後的狀態更新；原生 chunks 寫入與所有既有資料不受注入影響。
        audit.puts++; IDBObjectStore.prototype.put = put; audit.restored = true;
        request.addEventListener('error', event => audit.errors.push({ trusted: event.isTrusted, name: request.error.name }));
        this.transaction.addEventListener('abort', event => audit.aborts.push({ trusted: event.isTrusted, mode: this.transaction.mode, stores: [...this.transaction.objectStoreNames] }));
        this.transaction.abort();
      }
      return request;
    };
    // 真正停止原生編碼器造成提前結束，不派送假 error／stop，原完整性護欄仍須拒絕。
    const recorder = window.captureRecorders.at(-1);
    if (recorder.state !== 'recording') throw new Error('原生編碼器已提前結束，不能當成本次早停證據');
    audit.recorderEvents = window.captureRecorderEvents.get(recorder);
    audit.stopRequestedAt = audit.recorderEvents.length;
    recorder.stop();
  }, target.id);
  await idle();
  const failed = await full(), audit = await page.evaluate(() => window.stoppedStateFailure);
  assert(audit.puts === 1 && audit.restored && audit.errors.length === 1 && audit.errors[0].trusted && audit.errors[0].name === 'AbortError' && audit.aborts.length === 1 && audit.aborts[0].trusted && audit.aborts[0].mode === 'readwrite' && audit.unhandled.length === 0, '不是指定狀態寫入的原生中止或留下未處理拒絕');
  const events = audit.recorderEvents, stopAt = events.findIndex(event => event.name === 'stop');
  console.log('停止狀態原生錄影事件：', JSON.stringify({ events, stopRequestedAt: audit.stopRequestedAt }));
  // 完整錄影須有非空資料；另核對 stop 後的原生尾包順序，不把最後一包非空當成引擎保證。
  assert(events[0]?.name === 'start' && events.filter(event => event.name === 'start').length === 1 && events.filter(event => event.name === 'stop').length === 1 && events.some(event => event.name === 'dataavailable' && event.bytes > 0) && events.every(event => event.trusted) && !events.some(event => event.name === 'error') && stopAt > audit.stopRequestedAt && events[stopAt - 1]?.name === 'dataavailable', '沒有完整原生錄影資料與停止順序：' + JSON.stringify(audit));
  assert(equal(failed.saved, started.saved) && equal(failed.media, before.media) && equal(failed.chunks.filter(row => row.id[0] !== target.cameraAssetId), before.chunks), '狀態失敗改掉已確認 metadata、原媒體或其他 chunks');
  assert((await page.locator('#status').textContent()).includes('錄影未完成') && await page.locator('#partial-download').isVisible() && await page.evaluate(() => window.captureRequests.every(c => c.audio === false) && window.captureTracks.every(t => t.readyState === 'ended') && !document.getElementById('preview').srcObject && document.getElementById('storage-recovery').hidden), '早停失敗沒有救援原片、停止相機、禁用麥克風或保留原完整性提示');
  const stoppedBytes = await page.evaluate(async id => {
    const blob = await (await import('/storage.js')).recoverChunks(id);
    return { bytes: blob.size, type: blob.type, hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('') };
  }, target.cameraAssetId);
  const downloads = [];
  const download = async (control, label, expected) => {
    const pending = page.waitForEvent('download'); await control.click(); const file = await pending;
    const path = `output/export-failure/stopped-state-${label}-${file.suggestedFilename()}`; await file.saveAs(path);
    const bytes = await (await import('node:fs/promises')).readFile(path), { createHash } = await import('node:crypto');
    assert(bytes.length === expected.bytes && createHash('sha256').update(bytes).digest('hex') === expected.hash, '真正下載與完整原生 bytes 不符：' + label);
    downloads.push({ path, ...expected });
  };
  await download(page.locator('#partial-download'), 'partial', stoppedBytes);
  await page.reload(); await idle(); assert(equal(await full(), failed), '同 profile 重開改寫狀態或遺失原片／chunks');
  await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
  await page.locator(`[data-focus-key="take:${target.id}:open"]`).click(); await idle();
  const recovered = await full(), recoveredMedia = recovered.media.find(row => row.id === target.cameraAssetId);
  // recording 先明確記為 interrupted，再保存完整原片；兩個原交易各增加一次 revision，不能省略其中一個。
  assert(recovered.saved.revision === failed.saved.revision + 2 && recovered.saved.data.takes.find(t => t.id === target.id).state === 'interrupted' && recoveredMedia && recoveredMedia.bytes === stoppedBytes.bytes && recoveredMedia.hash === stoppedBytes.hash, '公開恢復沒有保留同一份原片、原兩筆交易或誤標完整成功');
  assert(equal(recovered.media.filter(row => row.id !== target.cameraAssetId), before.media) && equal(recovered.chunks, before.chunks), '公開恢復清掉其他媒體或其他待恢復 chunks');
  for (const [table, rows] of Object.entries(before.saved.data)) if (Array.isArray(rows)) assert(equal(recovered.saved.data[table].filter(row => rows.some(old => old.id === row.id)), rows), '恢復改動其他資料表：' + table);
  await download(page.locator('#take-download'), 'recovered', stoppedBytes);
  await page.locator(`[data-focus-key="export:${artifact.id}:download"]`).click(); await idle();
  await download(page.locator('#output-download'), 'old-vs', expectedVs);
  await page.reload(); await idle(); assert(equal(await full(), recovered), '恢復後再次重開資料不符');
  checks.stoppedStateWriteFailure = { audit, targetTakeId: target.id, oldMetadataAndMediaAndOtherChunksPreserved: true, failedStatusRemainsRecording: true, actualPartialDownload: true, sameProfileReopenAndPublicRecovery: true, recoveredRemainsInterrupted: true, downloads };
  return checks;
}
