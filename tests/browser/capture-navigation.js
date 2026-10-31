/* 檔案用途：驗證真正離頁後的自拍片段恢復。所在層：合成媒體瀏覽器驗收。主要關聯：capture.js、storage.js、issue-9-capture-recovery.md。 */
// 相機設定已收在選用區；先展開，再沿用原本的錄影與資料保護斷言。
async (page, phase = 'prepare') => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  if (phase === 'prepare') {
    await page.addInitScript(() => {
      if (!navigator.mediaDevices) return;
      window.navigationTracks = [];
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        if (window.__danceSyntheticCameraOnly !== true) throw new Error('離頁驗收只能使用隔離的合成相機。');
        if (constraints.audio !== false) throw new Error('不允許測試開啟麥克風');
        const stream = await original(constraints);
        window.navigationTracks.push(...stream.getTracks()); return stream;
      };
      window.confirm = () => true;
    });
    await page.goto(origin);
    await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
    // 新選片預設全長；此比較案例明確選 15 秒，保留原本的媒體護欄與測試範圍。
    await page.locator('#end').fill('15');
    await page.locator('#copy-reference').click(); await idle();
    const videoId = await page.locator('#library').inputValue();
    await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
    // 本案例要保護已保存的舊片；外部選片不自動落盤，先由明確操作保存基準副本。
    await page.locator('#copy-self').click(); await idle();
    const previous = await page.evaluate(async () => {
      const store = await import('/storage.js'), { data } = await store.readLibrary(), take = data.takes.at(-1);
      return { take, bytes: (await store.readMedia(take.cameraAssetId)).size };
    });
    await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#new-take').click(); await idle();
    await page.locator('#end').fill('15'); await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle();
    // 在產品的清理 listener 之後觀測，驗證原生 pagehide 同步停止了 tracks。
    await page.evaluate(() => window.addEventListener('pagehide', event => {
      sessionStorage.setItem('synthetic-pagehide', JSON.stringify({ trusted: event.isTrusted, persisted: event.persisted, released: window.navigationTracks.every(track => track.readyState === 'ended'), referenceAtHideMs: Math.round(document.getElementById('reference').currentTime * 1000) }));
    }, { once: true }));
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
    const interrupted = (await library()).takes.at(-1);
    // 非同步 predicate 在此 CLI 可能過早放行；逐次 await 真正的查詢結果，不能把 Promise 當成已落盤。
    let committed = 0;
    const deadline = Date.now() + 12_000;
    while (committed < 2 && Date.now() < deadline) {
      committed = await page.evaluate(async assetId => {
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open('dance-stamp', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        try { return await new Promise((resolve, reject) => { const request = db.transaction('chunks').objectStore('chunks').count(IDBKeyRange.bound([assetId, 0], [assetId, Number.MAX_SAFE_INTEGER])); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
        finally { db.close(); }
      }, interrupted.cameraAssetId);
      if (committed < 2) await page.waitForTimeout(100);
    }
    assert(committed >= 2, '離頁前沒有已落盤片段');
    await page.evaluate(value => sessionStorage.setItem('synthetic-navigation', JSON.stringify(value)), { videoId, interrupted, previous, committed });
    return { prepared: true, takeId: interrupted.id, committed };
  }
  if (phase === 'verify') {
    // 由 CLI 真的換頁並接受原生離頁確認後才檢查，不注入 pagehide。
    const { videoId, interrupted, previous } = await page.evaluate(() => JSON.parse(sessionStorage.getItem('synthetic-navigation')));
    const departure = await page.evaluate(() => JSON.parse(sessionStorage.getItem('synthetic-pagehide')));
    assert(departure?.trusted && departure.released && departure.referenceAtHideMs < interrupted.referenceEndMs, '沒有在錄影途中真正離頁，或未同步釋放相機');
    await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
    const beforeRecovery = (await library()).takes.find(t => t.id === interrupted.id);
    assert(beforeRecovery && beforeRecovery.state !== 'ready', '真正離頁把未完成錄影當成完整成功');
    await page.locator('#takes li').last().getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
    const recovered = await page.evaluate(async ({ id, previous }) => {
      const store = await import('/storage.js'), { data } = await store.readLibrary(), take = data.takes.find(t => t.id === id), asset = data.assets.find(a => a.id === take.cameraAssetId);
      const old = data.takes.find(t => t.id === previous.take.id);
      return { state: take.state, assetState: asset.state, bytes: (await store.readMedia(asset.id))?.size, decoded: document.getElementById('self').readyState >= 2, cameraClosed: !document.getElementById('preview').srcObject, previousUnchanged: JSON.stringify(old) === JSON.stringify(previous.take) && (await store.readMedia(old.cameraAssetId)).size === previous.bytes };
    }, { id: interrupted.id, previous });
    assert(recovered.state === 'interrupted' && recovered.assetState === 'ready' && recovered.bytes > 0 && recovered.decoded && recovered.cameraClosed && recovered.previousUnchanged, `離頁恢復失敗：${JSON.stringify(recovered)}`);
    await page.locator('#self').evaluate(video => video.play());
    await page.waitForFunction(() => document.getElementById('self').currentTime > 0.1);
    await page.locator('#self').evaluate(video => video.pause());
    const download = page.waitForEvent('download'); await page.locator('#take-download').click();
    await (await download).saveAs('output/media-probe/navigation-recovered.mp4');
    return { departure, recovered, originalPlayable: true, downloaded: true };
  }
  throw new Error('未知離頁驗收階段');
}
