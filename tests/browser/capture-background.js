/* 檔案用途：驗證真正切分頁時相機停止及中斷原片保留。所在層：桌面合成媒體 gate。主要關聯：launch-native-browser.ts、issue-9-capture-recovery.md。 */
async (page, downloadDirectory) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  assert(typeof downloadDirectory === 'string' && downloadDirectory.startsWith('/'), '請透過專用 launcher 建立本輪下載目錄');
  const origin = new URL(page.url()).origin;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  await page.addInitScript(() => {
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices), Recorder = window.MediaRecorder;
    window.captureBackground = { requests: [], tracks: [], recorders: [], stops: 0, playing: 0, visibility: [], phase: '' };
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (window.__danceSyntheticCameraOnly !== true || constraints.audio !== false) throw new Error('只允許隔離合成相機，禁止麥克風');
      window.captureBackground.requests.push(constraints);
      const stream = await getMedia(constraints); window.captureBackground.tracks.push(...stream.getTracks()); return stream;
    };
    // 包住原生物件只記錄狀態，不觸發 stop、不改播放或可見性。
    window.MediaRecorder = class extends Recorder { constructor(...args) { super(...args); window.captureBackground.recorders.push(this); this.addEventListener('stop', () => { window.captureBackground.stops++; }); } };
    document.addEventListener('playing', event => { if (event.target.id === 'reference') window.captureBackground.playing++; }, true);
    window.confirm = () => true;
  });
  await page.goto(origin); await page.bringToFront();
  await page.waitForFunction(() => !document.hidden, null, { polling: 50, timeout: 10_000 });
  // 在產品 listener 之後觀察，才能證明停止與釋放是產品同步完成的。
  await page.evaluate(() => document.addEventListener('visibilitychange', event => {
    const e = window.captureBackground;
    e.visibility.push({ phase: e.phase, hidden: document.hidden, trusted: event.isTrusted, released: e.tracks.every(t => t.readyState === 'ended'), previewClosed: !document.getElementById('preview').srcObject, paused: document.getElementById('reference').paused, time: document.getElementById('reference').currentTime });
  }));
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#copy-reference').click(); await idle();
  const videoId = await page.locator('#library').inputValue();
  await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#copy-self').click(); await idle();
  const original = (await library()).takes.at(-1);
  const snapshot = id => page.evaluate(async id => {
    const store = await import('/storage.js'), { data } = await store.readLibrary(), take = data.takes.find(t => t.id === id);
    const asset = data.assets.find(a => a.id === take.cameraAssetId), blob = await store.readMedia(asset.id);
    const sha256 = blob && Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('');
    return { take, asset, recipe: data.recipes.find(r => r.takeId === id), bytes: blob?.size || 0, sha256 };
  }, id);
  const baseline = await snapshot(original.id);
  assert(baseline.bytes > 0 && baseline.sha256, '缺少已保存舊片基準');
  const prepare = async () => {
    await page.locator('#new-take').click(); await idle();
    await page.locator('#start').fill('0'); await page.locator('#end').fill('15');
    await page.locator('#rate').selectOption('1'); await page.locator('#countdown').selectOption('3');
    await page.locator('#camera').click(); await idle();
    assert(await page.locator('#preview').evaluate(v => !!v.srcObject && v.srcObject.getTracks().every(t => t.readyState === 'live') && v.srcObject.getAudioTracks().length === 0), '合成相機沒有真正開始預覽');
  };
  const background = async phase => {
    await page.evaluate(phase => { window.captureBackground.phase = phase; }, phase);
    const sibling = await page.context().newPage();
    try {
      await sibling.goto('about:blank'); await sibling.bringToFront();
      await page.waitForFunction(phase => document.hidden && window.captureBackground.visibility.some(e => e.phase === phase && e.hidden && e.trusted), phase, { polling: 50, timeout: 10_000 });
      const hidden = await page.evaluate(phase => window.captureBackground.visibility.find(e => e.phase === phase && e.hidden), phase);
      assert(hidden.released && hidden.previewClosed && hidden.paused, `${phase} 背景事件未同步停止相機／示範`);
      await page.waitForFunction(() => window.captureBackground.recorders.every(r => r.state === 'inactive') && window.captureBackground.stops === window.captureBackground.recorders.length, null, { polling: 50, timeout: 10_000 });
      const before = await page.evaluate(() => ({ calls: window.captureBackground.requests.length, recorders: window.captureBackground.recorders.length, playing: window.captureBackground.playing }));
      await page.bringToFront();
      await page.waitForFunction(() => !document.hidden, null, { polling: 50, timeout: 10_000 });
      // 解碼可能要等前景影格；先等待產品收尾，再觀察是否偷偷重啟。
      await idle(); await page.waitForTimeout(500);
      const resumed = await page.evaluate(({ before, phase }) => {
        const e = window.captureBackground;
        return e.requests.length === before.calls && e.recorders.length === before.recorders && e.playing === before.playing && e.tracks.every(t => t.readyState === 'ended') && !document.getElementById('preview').srcObject && document.getElementById('reference').paused && e.visibility.some(v => v.phase === phase && !v.hidden && v.trusted);
      }, { before, phase });
      assert(resumed, `${phase} 回前景自行重啟或沒有可信任事件`);
      return { ...hidden, noAutomaticRestart: true };
    } finally { await page.bringToFront(); await sibling.close(); }
  };
  const newTake = async known => {
    const added = (await library()).takes.filter(t => !known.includes(t.id));
    assert(added.length === 1, '一次操作未建立恰好一個新的 take'); return added[0];
  };
  const open = async id => {
    const takes = (await library()).takes.filter(t => t.referenceVideoId === videoId), index = takes.findIndex(t => t.id === id);
    assert(index >= 0, '保存的 take 已遺失');
    await page.locator('#takes li').nth(index).getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
    assert(await page.locator('#self').evaluate(v => v.readyState >= 2 && v.videoWidth > 0), '重開原片未解碼');
  };
  await prepare(); const preview = await background('preview');
  assert((await library()).takes.length === 1, '僅關閉預覽就改變 take');
  await prepare(); await page.locator('#capture').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('秒後開始'));
  const countdown = await background('countdown'), canceled = await newTake([original.id]);
  const canceledSnapshot = await snapshot(canceled.id);
  assert(canceled.state === 'failed' && canceledSnapshot.asset.state !== 'ready' && canceledSnapshot.bytes === 0 && await page.evaluate(() => window.captureBackground.recorders.length === 0), '倒數中斷被誤認已錄成或留下自動錄影');
  await prepare(); await page.locator('#capture').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
  const active = await newTake([original.id, canceled.id]);
  // 實際 await 已提交的 chunks；非同步 predicate 的 Promise 不能當成落盤證據。
  let committed = 0;
  const deadline = Date.now() + 10_000;
  while (committed < 2 && Date.now() < deadline) {
    committed = await page.evaluate(async assetId => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('dance-stamp', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try { return await new Promise((resolve, reject) => { const r = db.transaction('chunks').objectStore('chunks').count(IDBKeyRange.bound([assetId, 0], [assetId, Number.MAX_SAFE_INTEGER])); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
      finally { db.close(); }
    }, active.cameraAssetId);
    if (committed < 2) await page.waitForTimeout(100);
  }
  assert(committed >= 2, '錄影中斷前尚無兩塊已提交的原生片段');
  const recording = await background('recording'), partial = await snapshot(active.id);
  assert(recording.time > 0 && recording.time < 15 && partial.take.state === 'interrupted' && partial.asset.state === 'ready' && partial.bytes > 0 && partial.asset.durationMs < 15_000, '錄影背景中斷沒有保留可播放片段或誤標完整成功');
  await open(active.id);
  assert((await snapshot(active.id)).take.state === 'interrupted', '重開中斷片後被標成完整成功');
  await page.locator('#self').evaluate(v => { v.currentTime = 0; return v.play(); });
  await page.waitForFunction(() => document.getElementById('self').currentTime > 0.1);
  await page.locator('#self').evaluate(v => v.pause());
  // noDefaults 不設定下載攔截；只為自己 default context 配置原生下載，不碰使用者瀏覽器。
  const cdp = await page.context().browser().newBrowserCDPSession(), downloads = new Map();
  cdp.on('Browser.downloadWillBegin', e => downloads.set(e.guid, { guid: e.guid, suggestedFilename: e.suggestedFilename }));
  cdp.on('Browser.downloadProgress', e => { const item = downloads.get(e.guid); if (item) Object.assign(item, { state: e.state, totalBytes: e.totalBytes }); });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloadDirectory, eventsEnabled: true });
  const download = async (selector, assetId) => {
    // 產品 CSP 不允許 fetch(blob:)；直接讀已保存副本作為比對基準，不放寬產品政策。
    const blob = await page.evaluate(async assetId => {
      const blob = await (await import('/storage.js')).readMedia(assetId);
      if (!blob) throw new Error('下載前缺少可比對的已保存副本');
      return { bytes: blob.size, mime: blob.type, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('') };
    }, assetId);
    const known = [...downloads.keys()]; await page.locator(selector).click();
    const deadline = Date.now() + 15_000;
    let item;
    while (Date.now() < deadline) {
      item = [...downloads.values()].find(d => !known.includes(d.guid));
      if (item?.state === 'completed' || item?.state === 'canceled') break;
      await page.waitForTimeout(100);
    }
    assert(item?.state === 'completed' && item.totalBytes === blob.bytes && blob.bytes > 0, '真正下載未完成或大小不符');
    return { ...item, ...blob };
  };
  try {
    const raw = await download('#take-download', active.cameraAssetId);
    assert(raw.sha256 === partial.sha256, '下載連結不是已保存的中斷片');
    await page.locator('#export').click(); await idle();
    assert(await page.locator('#output-download').isVisible(), '中斷片未產生 VS 下載');
    const data = await library(), recipeId = data.recipes.find(r => r.takeId === active.id).id;
    const exports = data.exports.filter(e => e.recipeId === recipeId);
    assert(exports.length === 1 && exports[0].state === 'ready', '中斷片 VS 未完整保存');
    const vs = await download('#output-download', exports[0].assetId);
    await prepare(); await page.locator('#capture').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
    await idle();
    const retry = await newTake([original.id, canceled.id, active.id]), ready = await snapshot(retry.id);
    assert(ready.take.state === 'ready' && ready.asset.state === 'ready' && ready.bytes > 0 && ready.asset.durationMs >= 14_900 && await page.locator('#reference').evaluate(v => v.paused && v.currentTime >= 15), '明確重錄未到 B 自停並保存');
    assert(await page.evaluate(() => window.captureBackground.tracks.every(t => t.readyState === 'ended') && !document.getElementById('preview').srcObject), '完整錄影未釋放相機');
    const retryRaw = await download('#take-download', retry.cameraAssetId);
    assert(retryRaw.sha256 === ready.sha256, '重錄下載連結不是新片');
    const visibility = await page.evaluate(() => window.captureBackground.visibility);
    await page.reload(); await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
    for (const saved of [baseline, partial, ready]) {
      await open(saved.take.id);
      assert(JSON.stringify(await snapshot(saved.take.id)) === JSON.stringify(saved), '重新載入／重錄改動或遺失既有原片、狀態或配方');
    }
    assert(await page.evaluate(() => window.captureBackground.requests.length === 0 && !document.getElementById('preview').srcObject), '重開保存資料自動開啟相機');
    return { preview, countdown, recording, visibility, committedChunks: committed, canceledState: canceled.state, partialState: partial.take.state, partialDurationMs: partial.asset.durationMs, retryState: ready.take.state, retryDurationMs: ready.asset.durationMs, retainedAfterReload: 3, originalAndPartialUnchanged: true, noMicrophone: true, downloads: { raw, vs, retryRaw } };
  } finally { await cdp.detach(); await page.locator('#stop').click(); }
}
