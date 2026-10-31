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
  return { ...result, notificationSuppression: 'explicit controlled loadeddata interception', originalMetadataAndFullMediaHashesPreserved: true, samePageRetry: true, actualVsDownload: path, expectedVs: expected };
}
