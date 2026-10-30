/* 檔案用途：驗證錄影失敗仍持鎖等候尾塊落盤。所在層：隔離合成相機回歸。主要關聯：main.js、storage.js、issue-9-capture-recovery.md。 */
// 相機設定已收在選用區；先展開，再沿用原本的錄影與資料保護斷言。
async (page) => {
  const origin = new URL(page.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await page.addInitScript(() => {
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices), Recorder = MediaRecorder, transaction = IDBDatabase.prototype.transaction;
    window.captureDrain = { hold: false, pending: 0, stops: 0, recorders: [], tracks: [] };
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!window.__danceSyntheticCameraOnly || constraints.audio !== false) throw new Error('僅允許合成相機，不開麥克風');
      const stream = await getMedia(constraints); window.captureDrain.tracks.push(...stream.getTracks()); return stream;
    };
    window.MediaRecorder = class extends Recorder {
      constructor(...args) { super(...args); window.captureDrain.recorders.push(this); this.addEventListener('stop', () => { window.captureDrain.stops++; }); }
    };
    IDBDatabase.prototype.transaction = function(names, mode, ...rest) {
      const tx = transaction.call(this, names, mode, ...rest), evidence = window.captureDrain;
      if (mode === 'readwrite' && (names === 'chunks' || Array.isArray(names) && names.length === 1 && names[0] === 'chunks') && evidence.hold) {
        evidence.pending++;
        // 保持真正交易未提交，模擬慢速儲存；不改 Blob、索引、原生 stop 或產品鎖。
        const keepAlive = () => { if (evidence.hold) tx.objectStore('chunks').get(['drain-probe', 0]).onsuccess = keepAlive; };
        keepAlive(); tx.addEventListener('complete', () => { evidence.pending--; }); tx.addEventListener('abort', () => { evidence.pending--; });
      }
      return tx;
    };
    window.confirm = () => true;
  });
  await page.goto(origin);
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#copy-reference').click(); await idle();
  const videoId = await page.locator('#library').inputValue();
  await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#copy-self').click(); await idle();
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const original = (await library()).takes.at(-1);
  const snapshot = id => page.evaluate(async id => {
    const store = await import('/storage.js'), { data } = await store.readLibrary(), take = data.takes.find(t => t.id === id), blob = await store.readMedia(take.cameraAssetId);
    return { take, recipe: data.recipes.find(r => r.takeId === id), bytes: blob.size, hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('') };
  }, id);
  const baseline = await snapshot(original.id), sibling = await page.context().newPage();
  try {
    await sibling.goto(origin);
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#new-take').click(); await idle();
    await page.locator('#start').fill('0'); await page.locator('#end').fill('15'); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#countdown').selectOption('3');
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
    await page.evaluate(() => { window.captureDrain.hold = true; });
    await page.locator('#capture').click();
    await page.waitForFunction(() => window.captureDrain.pending > 0 && document.getElementById('status').textContent.startsWith('錄影中'), null, { polling: 50 });
    const active = (await library()).takes.at(-1);
    await page.evaluate(() => window.captureDrain.recorders.at(-1).dispatchEvent(new Event('error')));
    await page.waitForFunction(() => window.captureDrain.stops === 1 && window.captureDrain.tracks.every(t => t.readyState === 'ended'), null, { polling: 50 });
    const protectedWhilePending = await sibling.evaluate(async id => {
      const store = await import('/storage.js');
      try { await store.withTakeLock(id, async () => {}); return false; } catch (error) { return error.message.includes('另一個分頁'); }
    }, active.id);
    assert(protectedWhilePending, '編碼失敗後尾塊仍未提交，另一分頁卻已可取得恢復鎖');
    assert(await page.evaluate(() => window.captureDrain.pending > 0 && document.getElementById('controls').disabled), '等待尾塊時工作狀態被提早結束');
    await page.evaluate(() => { window.captureDrain.hold = false; }); await idle();
    const failed = (await library()).takes.find(t => t.id === active.id);
    assert(failed.state === 'interrupted', '編碼失敗被標成完整成功');
    const released = await sibling.evaluate(async id => {
      const store = await import('/storage.js'); return store.withTakeLock(id, async () => (await store.recoverChunks((await store.readLibrary()).data.takes.find(t => t.id === id).cameraAssetId)).size);
    }, active.id);
    assert(released > 0, '尾塊提交後仍無法取得鎖或恢復原片');
    await page.locator('#takes li').last().getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
    const recovered = await snapshot(active.id);
    assert(recovered.take.state === 'interrupted' && recovered.bytes === released && await page.locator('#self').evaluate(v => v.readyState >= 2 && v.videoWidth > 0), '收齊尾塊後未解碼保存或被標完整成功');
    assert(JSON.stringify(await snapshot(original.id)) === JSON.stringify(baseline), '失敗恢復改動舊原片或配方');
    const downloaded = page.waitForEvent('download'); await page.locator('#take-download').click();
    await (await downloaded).saveAs('output/media-probe/drain-recovered.mp4');
    await page.reload(); await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
    assert(JSON.stringify(await snapshot(active.id)) === JSON.stringify(recovered) && JSON.stringify(await snapshot(original.id)) === JSON.stringify(baseline), '重開遺失已恢復原片或舊片');
    return { protectedWhilePending, tracksReleasedBeforeCommit: true, workBusyUntilCommit: true, recoveredBytes: recovered.bytes, recoveredState: recovered.take.state, originalAndRecoveryRetainedAfterReload: true };
  } finally {
    await page.evaluate(() => { window.captureDrain.hold = false; }); await page.locator('#stop').click(); await idle(); await sibling.close();
  }
}
