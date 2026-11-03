/* 檔案用途：驗證錄影供聲的取消、原期限與原生聲音中斷後保全／重試。所在層：Chromium 條件分支回歸，非原生 Safari 驗收。主要關聯：run-app.ts、webkit-audio-branch.js、main.js。 */
async (page, options) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = (timeout = 15_000) => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout });
  const downloads = [], phases = [];
  assert(await page.evaluate(() => window.__danceSyntheticCameraOnly === true), '只能使用入口已指定的合成檔案相機');
  // 基線由原案例建立；保存原片副本與筆記，才有真正需要保護的既有資料。
  for (const id of ['copy-reference', 'copy-self']) { await page.locator('#' + id).click(); await idle(); }
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成錄影保全');
  await page.locator('#marker-note').fill('停止與聲音中斷仍保留'); await page.locator('#marker-form button[type="submit"]').click(); await idle();
  // 錄影契約至少15秒；原8秒素材取7.5秒以半速錄製，不改素材或產品時長護欄。
  await page.locator('#end').fill('7.5'); await page.locator('#end').dispatchEvent('change'); await idle();
  await page.locator('#rate').selectOption('0.5'); await idle();
  await page.evaluate(async () => {
    const a = window.webkitCapture = { mode: '', streams: [], recorders: [], nodes: [], gains: [], contexts: [], held: [], requests: [], cancelled: [], timers: [], revoked: [], blobs: new Map(), restore: [] };
    const wrap = (target, key, make) => { const original = target[key]; target[key] = make(original); a.restore.push(() => { target[key] = original; }); };
    // 只留固定小批次API動作；滿額照記drop，不從缺列推沒有呼叫／沒有影響。
    a.audioStateLedger = { limit: 32, calls: 0, dropped: 0, observationErrors: 0, rows: [] };
    a.recorderOwners = new Map(); a.audioInterruptControl = null;
    const errorName = error => { try { return typeof error?.name === 'string' ? error.name : 'Error'; } catch { return 'Error'; } };
    const stateEvent = (kind, owner, method, id, callMode, error = null) => {
      try {
        const ledger = a.audioStateLedger;
        if (ledger.rows.length >= ledger.limit) { ledger.dropped++; return; }
        let nativeState = null, stateReadError = null;
        try { nativeState = owner.context.state; } catch (caught) { stateReadError = errorName(caught); }
        ledger.rows.push({ kind, contextId: owner.id, method, id, mode: a.mode, callMode, at: performance.now(), nativeState, stateReadError, errorName: error === null ? null : errorName(error) });
      } catch { a.audioStateLedger.observationErrors++; }
    };
    a.sha = async blob => ({ bytes: blob.size, mime: blob.type, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('') });
    const store = await import('/storage.js'), before = await store.readLibrary();
    a.ids = Object.fromEntries(Object.entries(before.data).filter(([, rows]) => Array.isArray(rows)).map(([key, rows]) => [key, rows.map(row => row.id)]));
    a.assets = before.data.assets.map(row => row.id);
    a.urls = () => ['reference', 'self', 'take-download', 'output-download'].map(id => document.getElementById(id)[id.endsWith('download') ? 'href' : 'src']);
    a.fingerprint = async () => {
      const { data } = await store.readLibrary(), media = [];
      for (const id of a.assets) { const blob = await store.readMedia(id); media.push({ id, fingerprint: blob ? await a.sha(blob) : null }); }
      return { rows: Object.fromEntries(Object.entries(a.ids).map(([key, ids]) => [key, data[key].filter(row => ids.includes(row.id))])), media };
    };
    a.before = await a.fingerprint(); a.oldUrls = a.urls(); a.muted = document.getElementById('reference').muted;
    // CSP不允許fetch(blob:)；旁聽原Blob與原生URL對應，不放寬產品政策或替換下載bytes。
    a.blobs.set(document.getElementById('output-download').href, await store.readMedia(before.data.exports.at(-1).assetId));
    wrap(window, 'confirm', () => () => true);
    wrap(URL, 'createObjectURL', original => function (blob) { const url = original.call(this, blob); a.blobs.set(url, blob); return url; });
    wrap(URL, 'revokeObjectURL', original => function (url) { a.revoked.push(url); a.blobs.delete(url); return original.call(this, url); });
    wrap(navigator.mediaDevices, 'getUserMedia', original => async function (constraints) {
      if (!window.__danceSyntheticCameraOnly || constraints.audio !== false) throw new Error('拒絕真實相機／麥克風');
      const stream = await original.call(this, constraints); a.streams.push(stream); return stream;
    });
    wrap(window, 'MediaRecorder', Native => class extends Native {
      constructor(stream, config) {
        super(stream, config);
        const row = { mode: a.mode, camera: stream.getAudioTracks().length === 0, events: [] }; a.recorders.push(row);
        // 真instance只留本頁私有對照；state直接讀原生getter，不把handle塞進可攜JSON。
        a.recorderOwners.set(row, this);
        for (const name of ['start', 'stop', 'error', 'dataavailable']) this.addEventListener(name, event => row.events.push({ name, trusted: event.isTrusted, bytes: event.data?.size }));
      }
    });
    // PTS 基準不再提前建 live AudioContext；照真冷啟動辨識共用 monitor，不能把它當每輪 captureGain。
    wrap(window, 'AudioContext', Native => class extends Native {
      constructor(...args) {
        super(...args); a.contexts.push({ context: this, id: a.contexts.length + 1, mode: a.mode, gainCount: 0 });
      }
    });
    for (const method of ['suspend', 'resume']) wrap(AudioContext.prototype, method, original => function (...args) {
      const owner = a.contexts.find(row => row.context === this);
      if (!owner) return original.apply(this, args);
      const id = ++a.audioStateLedger.calls, callMode = a.mode;
      stateEvent('call', owner, method, id, callMode);
      let promise;
      try { promise = original.apply(this, args); }
      catch (error) { stateEvent('throw', owner, method, id, callMode, error); throw error; }
      // 旁聽不能變成新的await／重試：回傳原Promise本身，原拒絕與receiver/args原樣轉交。
      try { promise.then(() => stateEvent('resolved', owner, method, id, callMode), error => stateEvent('rejected', owner, method, id, callMode, error)); }
      catch { a.audioStateLedger.observationErrors++; }
      return promise;
    });
    wrap(AudioContext.prototype, 'createBufferSource', original => function (...args) {
      const node = original.apply(this, args), row = { node, context: this, mode: a.mode, starts: [], stopped: 0, disconnected: 0 }; a.nodes.push(row);
      const start = node.start, stop = node.stop, disconnect = node.disconnect;
      node.start = function (...args) { row.starts.push(args); return start.apply(this, args); };
      node.stop = function (...args) { row.stopped++; return stop.apply(this, args); };
      node.disconnect = function (...args) { row.disconnected++; return disconnect.apply(this, args); };
      return node;
    });
    wrap(AudioContext.prototype, 'createGain', original => function (...args) {
      const node = original.apply(this, args), owner = a.contexts.find(row => row.context === this);
      // 此固定 prepareAudio 在新 context 的第一個 gain 是全頁 monitor；其餘／不明 context gain 仍照本輪資源驗。
      const role = owner && owner.gainCount++ === 0 ? 'shared-monitor' : 'capture-gain';
      const row = { mode: a.mode, contextId: owner?.id ?? null, role, connectCalls: 0, connectReturns: 0, disconnected: 0 }; a.gains.push(row);
      const connect = node.connect, disconnect = node.disconnect;
      node.connect = function (...args) { row.connectCalls++; const value = connect.apply(this, args); row.connectReturns++; return value; };
      node.disconnect = function (...args) { row.disconnected++; return disconnect.apply(this, args); }; return node;
    });
    // 只延後同一次原生通知；取消後仍送回原 now／metadata，檢查舊通知不能復活錄影。
    wrap(HTMLVideoElement.prototype, 'requestVideoFrameCallback', original => function (callback) {
      const mode = a.mode, holding = this.id === 'reference' && this.playbackRate === 2 && mode.startsWith('warmup-');
      const id = original.call(this, (now, metadata) => {
        if (holding) a.held.push({ mode, id, callback, now, metadata, released: false }); else callback(now, metadata);
      });
      if (holding) a.requests.push({ mode, id }); return id;
    });
    wrap(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', original => function (id) { if (this.id === 'reference') a.cancelled.push(id); return original.call(this, id); });
    // 保留原生2000ms與真實時鐘；只旁聽排程／觸發／清理，不能縮短期限換取覆蓋。
    wrap(window, 'setTimeout', original => function (callback, ms, ...args) {
      if (ms !== 2000 || !a.mode.startsWith('warmup-')) return original.call(this, callback, ms, ...args);
      const row = { mode: a.mode, scheduled: performance.now(), ms, fired: null, cleared: false }; a.timers.push(row);
      row.id = original.call(this, function (...values) { row.fired = performance.now(); return callback.apply(this, values); }, ms, ...args); return row.id;
    });
    wrap(window, 'clearTimeout', original => function (id) { for (const row of a.timers) if (row.id === id) row.cleared = true; return original.call(this, id); });
  });
  const download = async (id, label) => {
    const expected = await page.evaluate(async id => window.webkitCapture.sha(window.webkitCapture.blobs.get(document.getElementById(id).href)), id);
    const pending = page.waitForEvent('download'); await page.locator('#' + id).click(); const file = await pending;
    const path = `${options.directory}/webkit-capture-${label}.${file.suggestedFilename().split('.').pop()}`; await file.saveAs(path);
    downloads.push({ label, path, expected });
  };
  const verify = async (mode, state, oldUrls = true) => page.evaluate(async ({ mode, state, oldUrls }) => {
    const a = window.webkitCapture, store = await import('/storage.js'), { data } = await store.readLibrary(), take = data.takes.at(-1);
    if (JSON.stringify(await a.fingerprint()) !== JSON.stringify(a.before)) throw new Error(mode + ' 改變既有資料／媒體完整bytes');
    if (oldUrls && (JSON.stringify(a.urls()) !== JSON.stringify(a.oldUrls) || a.oldUrls.some(url => a.revoked.includes(url)))) throw new Error(mode + ' 撤銷舊播放器／下載');
    if (!oldUrls && [0, 3].some(index => a.urls()[index] !== a.oldUrls[index] || a.revoked.includes(a.oldUrls[index]))) throw new Error('新自拍完成時仍須保留原示範與前次VS連結');
    if (a.ids.takes.includes(take.id) || take.state !== state) throw new Error(mode + ' 新take狀態錯誤：' + take.state);
    if (!a.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))) throw new Error(mode + ' 相機未釋放');
    const reference = document.getElementById('reference');
    if (!reference.paused || reference.muted !== a.muted) throw new Error(mode + ' 示範未停止／靜音未還原');
    const nodes = a.nodes.filter(row => row.mode === mode), recordings = a.recorders.filter(row => row.mode === mode && row.camera);
    const sharedMonitors = a.gains.filter(row => row.role === 'shared-monitor'), captureGains = a.gains.filter(row => row.mode === mode && row.role !== 'shared-monitor');
    if (a.contexts.length !== 1 || sharedMonitors.length !== 1 || sharedMonitors.some(row => row.connectCalls || row.connectReturns)) throw new Error('冷 context 共用 monitor 未被正確辨識，或 Safari monitor 意外接入聲路');
    // 共用 monitor 只驗從未連接，不冒稱每輪釋放；真正 capture source/gain 的原 start／stop／buffer／disconnect 斷言不變。
    if (nodes.some(row => row.starts.length !== 1 || !row.stopped || !row.disconnected || row.node.buffer !== null) || captureGains.some(row => !row.disconnected)) throw new Error(mode + ' 本輪聲音資源未清理');
    const media = await store.readMedia(take.cameraAssetId), db = await store.openStore();
    const count = await new Promise((resolve, reject) => { const request = db.transaction('chunks').objectStore('chunks').count(IDBKeyRange.bound([take.cameraAssetId, 0], [take.cameraAssetId, Number.MAX_SAFE_INTEGER])); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    if (state !== 'ready' && media) throw new Error(mode + ' 失敗錄影被finalize');
    if (mode.startsWith('warmup-')) {
      if (recordings.length || nodes.length || count) throw new Error(mode + ' 準備失敗仍開錄／保存chunks');
      const timer = a.timers.find(row => row.mode === mode);
      // 核對原生排程與觸發收據；實測延遲另列，不額外發明計時精度的效能門檻。
      if (!timer?.cleared || timer.ms !== 2000 || (mode === 'warmup-stop' ? timer.fired !== null : timer.fired === null)) throw new Error(mode + ' 未沿原2000ms取消／逾時');
      if (a.requests.filter(row => row.mode === mode).some(row => !a.cancelled.includes(row.id))) throw new Error(mode + ' 未撤銷原生影格訂閱');
    } else {
      if (nodes.length !== 1 || recordings.length !== 1 || !recordings[0].events.some(e => e.name === 'stop' && e.trusted) || !recordings[0].events.some(e => e.name === 'dataavailable' && e.trusted && e.bytes > 0)) throw new Error(mode + ' 缺真正原生錄影／供聲收據');
      if (state === 'interrupted') {
        const chunks = await store.recoverChunks(take.cameraAssetId), partial = a.blobs.get(document.getElementById('partial-download').href);
        if (!partial.size || JSON.stringify(await a.sha(partial)) !== JSON.stringify(await a.sha(chunks))) throw new Error('中斷原片／可恢復chunks不一致');
      } else {
        const raw = a.blobs.get(document.getElementById('take-download').href);
        if (!media?.size || count || JSON.stringify(await a.sha(media)) !== JSON.stringify(await a.sha(raw))) throw new Error('重試未保存相同原片／清理chunks');
        const info = JSON.parse(document.getElementById('diagnostics').textContent).capture;
        if (info.interrupted || info.rate !== 0.5 || info.durationMs <= 14500) throw new Error('重試未沿原15秒時長護欄真正完成');
      }
    }
    const diagnosticsCapture = JSON.parse(document.getElementById('diagnostics').textContent).capture ?? null;
    return { mode, capture: diagnosticsCapture, captureReceiptScope: 'after idle / operation finally report', audioInterruptControl: mode === 'native-audio-interrupt' ? a.audioInterruptControl : null, takeId: take.id, takeState: take.state, oldDataAndMediaPreserved: true, oldUrlsPreserved: oldUrls, nativeRecorderEvents: recordings.map(row => row.events), gains: a.gains.map(row => ({ ...row })), contexts: a.contexts.map(row => ({ id: row.id, mode: row.mode, gainCount: row.gainCount, state: row.context.state })), sharedMonitorPerRoundReleasedClaim: false, nodesReleased: nodes.length, cameraTracksEnded: true, frameRequests: a.requests.filter(row => row.mode === mode), timers: a.timers.filter(row => row.mode === mode) };
  }, { mode, state, oldUrls });
  const start = async mode => {
    await page.evaluate(mode => { window.webkitCapture.mode = mode; }, mode);
    await page.locator('#camera-tools').evaluate(element => { element.open = true; });
    await page.locator('#camera').click(); await idle(); await page.locator('#capture').click();
  };
  let reportedFailure;
  try {
    await download('output-download', 'baseline-vs');
    for (const mode of ['warmup-stop', 'warmup-timeout']) {
      await start(mode); await page.waitForFunction(mode => window.webkitCapture.held.some(row => row.mode === mode), mode);
      if (mode === 'warmup-stop') await page.locator('#stop').click();
      await idle();
      if (mode === 'warmup-timeout') assert((await page.locator('#status').textContent()).includes('示範畫面準備逾時'), '未回報原暖機逾時');
      const before = await verify(mode, 'failed');
      await page.evaluate(mode => { for (const row of window.webkitCapture.held.filter(row => row.mode === mode)) { row.released = true; row.callback(row.now, row.metadata); } }, mode);
      assert(JSON.stringify(await verify(mode, 'failed')) === JSON.stringify(before), '遲到原生影格復活已取消工作'); phases.push(before);
    }
    await start('native-audio-interrupt');
    await page.waitForFunction(() => {
      const a = window.webkitCapture;
      return a.nodes.some(row => row.mode === a.mode && row.starts.length) && a.recorders.some(row => row.mode === a.mode && row.events.some(e => e.name === 'dataavailable' && e.trusted && e.bytes > 0));
    });
    // 真正暫停原生音訊時鐘；不拋假錯誤，也不派發假的聲音／錄影事件。
    await page.evaluate(async () => {
      const a = window.webkitCapture, row = a.nodes.find(row => row.mode === 'native-audio-interrupt');
      const recording = a.recorders.find(row => row.mode === 'native-audio-interrupt' && row.camera), recorder = a.recorderOwners.get(recording);
      let captureReported = null, diagnosticsReadError = null;
      try { captureReported = JSON.parse(document.getElementById('diagnostics').textContent).capture ?? null; }
      catch (error) { diagnosticsReadError = error.name; }
      // stop造成的dataavailable不能充當可中斷前提；讀真state，同一JS turn保存、檢查後才suspend。
      const control = a.audioInterruptControl = { at: performance.now(), busy: document.getElementById('compare').getAttribute('aria-busy') === 'true', contextState: row?.context.state ?? null, recorderState: recorder?.state ?? null, status: document.getElementById('status').textContent, captureReported, diagnosticsReadError, captureReceiptScope: 'last-reported DOM; null is not live no-guard proof' };
      if (!control.busy || control.contextState !== 'running' || control.recorderState !== 'recording') throw new Error('QA中斷前提未成立，未執行suspend：' + JSON.stringify(control));
      await row.context.suspend(); if (row.context.state !== 'suspended') throw new Error('音訊未真正暫停');
    });
    await idle(); assert((await page.locator('#status').textContent()).includes('示範聲音中斷或不同步'), '聲音中斷仍標成功');
    phases.push(await verify('native-audio-interrupt', 'interrupted')); await download('partial-download', 'interrupted-raw');
    await page.evaluate(async () => { await window.webkitCapture.nodes.find(row => row.mode === 'native-audio-interrupt').context.resume(); });
    // 3秒倒數加15秒錄影超過一般UI等待；沿既有capture-integrity的30秒操作期限。
    await start('retry'); await idle(30_000);
    assert((await page.locator('#status').textContent()).includes('自拍已錄好'), '同頁同輸入重試未完成');
    phases.push(await verify('retry', 'ready', false)); await download('take-download', 'retry-raw');
    await page.locator('#export').click(); await idle(30_000); assert((await page.locator('#status').textContent()).includes('已成檔'), '重試後無法真正VS成檔');
    assert(await page.evaluate(async () => JSON.stringify(await window.webkitCapture.fingerprint()) === JSON.stringify(window.webkitCapture.before)), '重試匯出改變既有筆記／媒體');
    await download('output-download', 'retry-vs');
    const originalSnapshot = await page.evaluate(() => window.webkitCapture.before);
    return { engine: 'Chromium', selectedWebKitBranch: true, safariDeviceAcceptance: false, originalSnapshot, phases, downloads, audioInterruptControl: await page.evaluate(() => window.webkitCapture.audioInterruptControl), audioStateLedger: await page.evaluate(() => window.webkitCapture.audioStateLedger) };
  } catch (error) {
    let observed;
    try { observed = await page.evaluate(() => {
      const a = window.webkitCapture, reference = document.getElementById('reference');
      let capture = null, diagnosticsReadError = null;
      // 原產品首guard packet已存於capture；只在失敗後帶走，不增加正式期媒體時鐘讀取。
      try { capture = JSON.parse(document.getElementById('diagnostics').textContent).capture ?? null; }
      catch (caught) { diagnosticsReadError = caught.name; }
      return { mode: a.mode, status: document.getElementById('status').textContent, capture, diagnosticsReadError, captureReceiptScope: 'last-reported DOM after failure', audioInterruptControl: a.audioInterruptControl, audioStateLedger: a.audioStateLedger, held: a.held.map(row => ({ mode: row.mode, now: row.now, mediaTime: row.metadata.mediaTime, released: row.released })), timers: a.timers, recorders: a.recorders, gains: a.gains.map(row => ({ ...row })), contexts: a.contexts.map(row => ({ id: row.id, mode: row.mode, gainCount: row.gainCount, state: row.context.state })), nodes: a.nodes.map(row => ({ mode: row.mode, starts: row.starts, stopped: row.stopped, disconnected: row.disconnected, contextState: row.context.state })), reference: { time: reference.currentTime, rate: reference.playbackRate, paused: reference.paused, muted: reference.muted }, completed: document.getElementById('controls').disabled === false };
    }); } catch (observationError) { observed = { observationError: { name: observationError.name, message: observationError.message } }; }
    reportedFailure = new Error(String(error) + '\n錄影分支原生紀錄：' + JSON.stringify(observed), { cause: error });
    throw reportedFailure;
  } finally {
    const cleanupErrors = []; let cleanupFirst;
    // 停止失敗仍嘗試還原自有旁聽；清理問題只能附加，不能蓋掉先前的產品／斷言首錯。
    for (const cleanup of [async () => {
      await page.locator('#stop').click(); await idle();
      if (reportedFailure) {
        let receipt;
        // 原前提fail時產品仍可能收尾；只在既有idle後補讀report，不能回填catch或認定QA Stop前的自然狀態。
        try { receipt = await page.evaluate(() => ({ scope: 'test cleanup after idle / may follow QA Stop', captureReported: JSON.parse(document.getElementById('diagnostics').textContent).capture ?? null })); }
        catch (error) { receipt = { scope: 'test cleanup after idle / may follow QA Stop', observationError: { name: error.name, message: error.message } }; }
        const detail = '\n錄影測試收尾後診斷：' + JSON.stringify(receipt);
        reportedFailure.message += detail; reportedFailure.stack = (reportedFailure.stack || '') + detail;
      }
    }, async () => { await page.evaluate(() => { for (const restore of window.webkitCapture.restore.reverse()) restore(); }); }]) {
      try { await cleanup(); } catch (error) { cleanupFirst ??= error; cleanupErrors.push({ name: error.name, message: error.message }); }
    }
    if (cleanupErrors.length) {
      const detail = '\n錄影測試清理限制：' + JSON.stringify(cleanupErrors);
      if (reportedFailure) { reportedFailure.message += detail; reportedFailure.stack = (reportedFailure.stack || '') + detail; }
      else throw new Error(detail, { cause: cleanupFirst });
    }
  }
}
