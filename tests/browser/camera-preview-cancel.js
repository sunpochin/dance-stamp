/* 檔案用途：驗證相機預覽未就緒時取消、重試及舊資料保全。所在層：隔離合成相機回歸。主要關聯：main.js、recorder.js、issue #103。 */
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const snapshot = () => page.evaluate(async () => {
    const storage = await import('/storage.js'), saved = await storage.readLibrary(), media = [];
    for (const id of (await storage.readMediaKeys()).sort()) {
      const blob = await storage.readMedia(id);
      media.push({ id, bytes: blob.size, hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('') });
    }
    return { saved, media, urls: ['reference', 'self', 'output', 'take-download', 'output-download'].map(id => document.getElementById(id).getAttribute(id.endsWith('download') ? 'href' : 'src')) };
  });
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.previewCancellation = { streams: [], requests: [], heldEvents: [], suppressReady: true, clicks: [] };
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!window.__danceSyntheticCameraOnly || constraints.audio !== false) throw new Error('只允許合成相機，不開麥克風');
      window.previewCancellation.requests.push(constraints);
      const stream = await original(constraints); window.previewCancellation.streams.push(stream); return stream;
    };
    document.addEventListener('click', event => { if (['camera', 'stop'].includes(event.target.id)) window.previewCancellation.clicks.push({ id: event.target.id, trusted: event.isTrusted }); }, true);
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('preview').addEventListener('loadeddata', event => {
        if (!window.previewCancellation.suppressReady) return;
        // 明示遮住已發生的原生就緒通知，保留可取消的等待窗口；不假造事件、時鐘或播放承諾。
        window.previewCancellation.heldEvents.push({ trusted: event.isTrusted, width: event.target.videoWidth, height: event.target.videoHeight });
        event.stopImmediatePropagation();
      }, true);
    });
  });
  await page.goto(origin);
  await page.locator('#reference-file').setInputFiles('output/export-failure/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/export-failure/self.mp4'); await idle();
  for (const id of ['copy-reference', 'copy-self']) { await page.locator('#' + id).click(); await idle(); }
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成預覽取消保留'); await page.locator('#marker-form button[type="submit"]').click(); await idle();
  await page.locator('#end').fill('3'); await page.locator('#end').dispatchEvent('change'); await idle();
  await page.locator('#export').click(); await idle();
  assert(await page.locator('#output-download').isVisible(), '基準 VS 沒有真正成檔');
  const before = await snapshot();
  await page.locator('#camera-tools').evaluate(details => { details.open = true; }); await page.locator('#camera').click();
  await page.waitForFunction(() => window.previewCancellation.heldEvents.length > 0);
  assert(await page.evaluate(() => document.getElementById('controls').disabled && !!document.getElementById('preview').srcObject && window.previewCancellation.streams.length === 1 && window.previewCancellation.streams[0].getVideoTracks()[0].readyState === 'live'), '沒有在真正串流已到、產品仍等就緒通知時取消');
  await page.locator('#stop').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已停止'), '預覽取消沒有停止提示');
  assert(await page.evaluate(() => window.previewCancellation.streams[0].getTracks().every(track => track.readyState === 'ended') && !document.getElementById('preview').srcObject && document.getElementById('capture').disabled), '取消留下串流、預覽或錄影入口');
  assert(await page.locator('#self').isVisible() && await page.locator('#self').evaluate(video => video.readyState >= 2 && !video.error), '取消沒有恢復舊自拍畫面');
  assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '預覽取消改動舊筆記、原片、VS 或連結');
  await page.evaluate(() => { window.previewCancellation.suppressReady = false; });
  await page.locator('#camera-tools').evaluate(details => { details.open = true; }); await page.locator('#camera').click(); await idle();
  assert(await page.evaluate(() => window.previewCancellation.streams.length === 2 && document.getElementById('preview').srcObject === window.previewCancellation.streams[1] && window.previewCancellation.streams[1].getVideoTracks()[0].readyState === 'live' && !document.getElementById('capture').disabled), '取消後無法用原生合成相機重試');
  await page.locator('#stop').click(); await idle();
  assert(await page.evaluate(() => window.previewCancellation.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')) && !document.getElementById('preview').srcObject), '重試停止沒有釋放所有串流');
  assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '重試或停止改動原有資料');
  // 真正下載再比整份指紋；網址字串相同仍可能已被撤銷，不能只核對 href。
  const artifact = before.saved.data.exports.at(-1), expected = before.media.find(row => row.id === artifact.assetId), pending = page.waitForEvent('download');
  await page.locator('#output-download').click(); const download = await pending;
  const path = `output/export-failure/preview-cancel-${artifact.id}-${download.suggestedFilename()}`; await download.saveAs(path);
  const bytes = await (await import('node:fs/promises')).readFile(path), { createHash } = await import('node:crypto');
  assert(bytes.length === expected.bytes && createHash('sha256').update(bytes).digest('hex') === expected.hash, '取消與重試後的真正 VS 下載已改變');
  const result = await page.evaluate(() => ({ heldEvents: window.previewCancellation.heldEvents, requests: window.previewCancellation.requests, clicks: window.previewCancellation.clicks, tracksEnded: window.previewCancellation.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')) }));
  assert(result.heldEvents.every(event => event.trusted && event.width > 0 && event.height > 0) && result.clicks.length === 4 && result.clicks.every(event => event.trusted) && result.requests.every(request => request.audio === false), '不是原生就緒通知或真實按鈕操作');
  // 前段受控取消全部保留；有限長度的合成影片另驗真正來源耗盡，不能派送 ended／mute 冒充。
  await page.evaluate(() => {
    const input = document.createElement('input'); input.type = 'file'; input.id = 'synthetic-camera-source'; input.hidden = true; document.body.append(input);
    const a = window.nativeCameraEnd = { mode: 'preview', sources: [], recorders: [], requests: [], hardwareCalls: 0 };
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!window.__danceSyntheticCameraOnly || constraints.audio !== false || !constraints.video) throw new Error('只允許合成影片，不取用硬體或麥克風');
      a.requests.push(constraints);
      const source = document.createElement('video'); source.muted = true; source.playsInline = true; source.hidden = true; document.body.append(source);
      const row = { mode: a.mode, source, events: [] }; a.sources.push(row);
      source.src = URL.createObjectURL(input.files[0]); await source.play();
      // 只把既有8秒合成檔的影像交給App；檔案的聲音不是麥克風，也不能混入相機原片。
      const captured = source.captureStream(); captured.getAudioTracks().forEach(track => { track.stop(); });
      const stream = new MediaStream(captured.getVideoTracks()); row.stream = stream; row.tracks = stream.getTracks();
      if (stream.getVideoTracks().length !== 1 || stream.getAudioTracks().length) throw new Error('合成來源必須只有一條影像');
      // 只旁聽原生通知；不改軌道、編碼器、時鐘或停止順序。產品可先處理 mute 再清掉 ended 監聽。
      for (const [target, who, names] of [[source, 'source', ['ended', 'error']], [stream.getVideoTracks()[0], 'track', ['mute', 'ended']]]) for (const name of names) target.addEventListener(name, event => row.events.push({ who, name, trusted: event.isTrusted, time: source.currentTime, duration: source.duration, trackState: stream.getVideoTracks()[0]?.readyState || 'removed' }));
      return stream;
    };
    navigator.mediaDevices.getDisplayMedia = () => { a.hardwareCalls++; throw new Error('合成回歸禁止擷取螢幕'); };
    const Native = MediaRecorder;
    window.MediaRecorder = class extends Native {
      constructor(...args) { super(...args); const row = { mode: a.mode, events: [] }; a.recorders.push(row); for (const name of ['start', 'dataavailable', 'stop', 'error']) this.addEventListener(name, event => row.events.push({ name, trusted: event.isTrusted, bytes: event.data?.size })); }
    };
    window.confirm = () => true;
  });
  await page.locator('#synthetic-camera-source').setInputFiles('output/export-failure/self.mp4');
  const nativeBaseline = await snapshot();
  await page.locator('#camera-tools').evaluate(details => { details.open = true; }); await page.locator('#camera').click(); await idle();
  assert(await page.evaluate(() => !document.getElementById('capture').disabled && document.getElementById('preview').srcObject === window.nativeCameraEnd.sources[0].stream), '自然結束前沒有真正相機預覽');
  await page.waitForFunction(() => window.nativeCameraEnd.sources[0].source.ended); await idle();
  assert(await page.locator('#status').textContent().then(text => text.includes('相機畫面已中斷')), '自然結束沒有中斷提示');
  assert(JSON.stringify(await snapshot()) === JSON.stringify(nativeBaseline), '預覽來源自然結束改動舊資料或連結');
  assert(await page.evaluate(() => !document.getElementById('preview').srcObject && document.getElementById('capture').disabled), '預覽來源結束仍留下相機入口');

  // 原8秒示範以半速取7.5秒，仍遵守15秒錄影契約；合成相機自行播完，不縮短倒數或原生時間。
  // 開過相機後舊take的範圍會鎖住；沿公開「準備下一段」解鎖，不能直接改disabled或內部狀態。
  await page.locator('#new-take').click(); await idle();
  await page.locator('#end').fill('7.5'); await page.locator('#end').dispatchEvent('change'); await idle();
  await page.locator('#rate').selectOption('0.5'); await idle();
  await page.evaluate(() => { window.nativeCameraEnd.mode = 'recording'; });
  await page.locator('#camera-tools').evaluate(details => { details.open = true; }); await page.locator('#camera').click(); await idle();
  await page.locator('#capture').click(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
  await page.waitForFunction(() => window.nativeCameraEnd.sources[1].source.ended); await idle();
  const stopped = await snapshot(), take = stopped.saved.data.takes.at(-1), asset = stopped.saved.data.assets.find(row => row.id === take.cameraAssetId), original = stopped.media.find(row => row.id === take.cameraAssetId);
  assert(take.state === 'interrupted' && asset.state === 'ready' && asset.durationMs > 1000 && asset.durationMs < 15000 && original.bytes > 0, '自然中斷沒有保存可播放原片，或誤稱完整錄影');
  const preserveOld = current => {
    for (const [key, rows] of Object.entries(nativeBaseline.saved.data)) if (Array.isArray(rows)) assert(JSON.stringify(current.saved.data[key].filter(row => rows.some(old => old.id === row.id))) === JSON.stringify(rows), '自然中斷改動既有 ' + key);
    assert(JSON.stringify(current.media.filter(row => nativeBaseline.media.some(old => old.id === row.id))) === JSON.stringify(nativeBaseline.media), '自然中斷改動舊媒體完整指紋');
  };
  preserveOld(stopped);
  assert(stopped.saved.revision === nativeBaseline.saved.revision + 2 && stopped.saved.data.takes.length === nativeBaseline.saved.data.takes.length + 1, '自然中斷沒有只建立及完成新段');
  const native = await page.evaluate(() => {
    const a = window.nativeCameraEnd;
    return { sources: a.sources.map(row => ({ mode: row.mode, events: row.events, ended: row.source.ended, duration: row.source.duration, tracksEnded: row.tracks.length === 1 && row.tracks.every(track => track.readyState === 'ended') })), recorders: a.recorders, requests: a.requests, hardwareCalls: a.hardwareCalls, previewReleased: !document.getElementById('preview').srcObject };
  });
  assert(native.sources.length === 2 && native.sources.every(row => row.ended && row.tracksEnded && row.events.some(event => event.who === 'source' && event.name === 'ended' && event.trusted) && row.events.some(event => event.who === 'track' && ['mute', 'ended'].includes(event.name) && event.trusted)), '缺真正來源播完及原生track中斷通知');
  assert(native.recorders.length === 1 && native.recorders[0].events.every(event => event.trusted) && native.recorders[0].events.some(event => event.name === 'dataavailable' && event.bytes > 0) && native.recorders[0].events.some(event => event.name === 'stop') && !native.recorders[0].events.some(event => event.name === 'error'), '沒有真正編碼，或編碼器發生錯誤');
  assert(native.previewReleased && native.hardwareCalls === 0 && native.requests.length === 2 && native.requests.every(row => row.audio === false), '自然中斷未釋放相機或越過無硬體邊界');
  const downloads = [];
  const saveDownload = async (label, id, fingerprint) => {
    const waiting = page.waitForEvent('download'); await page.locator('#' + id).click(); const file = await waiting;
    assert(await file.failure() === null, '真正下載失敗：' + label);
    const target = `output/export-failure/native-camera-${take.id}-${label}-${file.suggestedFilename()}`; await file.saveAs(target);
    const bytes = await (await import('node:fs/promises')).readFile(target);
    assert(bytes.length === fingerprint.bytes && createHash('sha256').update(bytes).digest('hex') === fingerprint.hash, '下載內容不等於已保存原片：' + label);
    downloads.push({ label, path: target, expected: fingerprint });
  };
  await saveDownload('interrupted', 'take-download', original);
  await saveDownload('old-vs', 'output-download', expected);
  await page.reload(); await idle();
  const reopened = await snapshot(); preserveOld(reopened);
  assert(JSON.stringify(reopened.saved) === JSON.stringify(stopped.saved) && JSON.stringify(reopened.media) === JSON.stringify(stopped.media), '同profile重開改動原片、筆記或中斷狀態');
  await page.locator('#library').selectOption(take.referenceVideoId); await page.locator('#open-library').click(); await idle();
  await page.locator('#takes li').nth(stopped.saved.data.takes.findIndex(row => row.id === take.id)).getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
  await saveDownload('reopened', 'take-download', original);
  assert(JSON.stringify((await snapshot()).saved) === JSON.stringify(stopped.saved), '公開開啟中斷原片不應重寫已存資料');
  return { ...result, notificationSuppression: 'explicit controlled loadeddata interception', originalMetadataAndFullMediaHashesPreserved: true, samePageRetry: true, actualVsDownload: path, expectedVs: expected, nativeSourceEnd: { ...native, take, asset, original, downloads, sameProfileReopenPreserved: true, oldDataAndMediaPreserved: true } };
}
