/* 檔案用途：驗證瀏覽器原生相機權限拒絕與恢復時保留資料。所在層：合成瀏覽器回歸。主要關聯：main.js、capture.js、issue #103。 */
async controller => {
  const origin = new URL(controller.url()).origin;
  // SW 可能沿用快取的舊回應標頭；此案例只隔離權限政策，不把快取行為混進拒絕／重試。
  const context = await controller.context().browser().newContext({ serviceWorkers: 'block' }), page = await context.newPage();
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const snapshot = () => page.evaluate(async () => {
    const storage = await import('/storage.js'), saved = await storage.readLibrary(), media = [];
    for (const key of (await storage.readMediaKeys()).sort()) {
      const blob = await storage.readMedia(key);
      media.push({ key, bytes: blob.size, hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('') });
    }
    return { saved, media };
  });
  try {
    await context.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.cameraPolicy = { requests: [], errors: [], tracks: [], clicks: [] };
      // 呼叫真正 API 並保留原生錯誤；相機裝置由既有 runner 固定為合成測片。
      navigator.mediaDevices.getUserMedia = async constraints => {
        if (!window.__danceSyntheticCameraOnly || constraints.audio !== false) throw new Error('只允許合成相機且禁止麥克風');
        window.cameraPolicy.requests.push(constraints);
        try { const stream = await original(constraints); window.cameraPolicy.tracks.push(...stream.getTracks()); return stream; }
        catch (error) { window.cameraPolicy.errors.push({ name: error.name, native: error instanceof DOMException }); throw error; }
      };
      document.addEventListener('click', event => { if (event.target.closest('#camera')) window.cameraPolicy.clicks.push(event.isTrusted); }, true);
    });
    await page.route(origin + '/', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'permissions-policy': 'camera=(), microphone=(), display-capture=()' } });
    });
    await page.goto(origin);
    assert(await page.evaluate(() => !(document.permissionsPolicy || document.featurePolicy).allowsFeature('camera')), '原生政策沒有禁止相機');
    await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
    await page.locator('#copy-reference').click(); await idle();
    const videoId = await page.locator('#library').inputValue();
    await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
    await page.locator('#copy-self').click(); await idle();
    const before = await snapshot(), urls = await page.evaluate(() => ['reference', 'self', 'take-download'].map(id => document.getElementById(id).getAttribute(id === 'take-download' ? 'href' : 'src')));
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.locator('#camera-tools').evaluate(details => { details.open = true; });
      await page.locator('#camera').click(); await idle();
      assert((await page.locator('#status').textContent()).includes('允許相機'), '權限拒絕缺少重試說明');
      assert(await page.evaluate(() => !document.getElementById('preview').srcObject && document.getElementById('capture').disabled), '拒絕後留下預覽或錄影入口');
      assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '權限拒絕改動已保存資料或影片 bytes');
      assert(JSON.stringify(await page.evaluate(() => ['reference', 'self', 'take-download'].map(id => document.getElementById(id).getAttribute(id === 'take-download' ? 'href' : 'src')))) === JSON.stringify(urls), '權限拒絕換掉原片連結');
    }
    const denied = await page.evaluate(() => ({ requests: window.cameraPolicy.requests, errors: window.cameraPolicy.errors, clicks: window.cameraPolicy.clicks, tracks: window.cameraPolicy.tracks.length }));
    assert(denied.requests.length === 2 && denied.errors.length === 2 && denied.errors.every(error => error.name === 'NotAllowedError' && error.native) && denied.clicks.every(Boolean) && denied.tracks === 0, '沒有取得兩次原生拒絕或偷偷開啟串流');
    await page.unroute(origin + '/'); await page.reload(); await idle();
    assert(await page.evaluate(() => (document.permissionsPolicy || document.featurePolicy).allowsFeature('camera')), '解除測試政策後仍禁止相機');
    assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '拒絕後重開遺失資料');
    await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
    await page.locator('#camera-tools').evaluate(details => { details.open = true; }); await page.locator('#camera').click(); await idle();
    const retry = await page.evaluate(() => ({ preview: document.getElementById('preview').videoWidth > 0 && !!document.getElementById('preview').srcObject, audio: document.getElementById('preview').srcObject?.getAudioTracks().length, errors: window.cameraPolicy.errors, tracks: window.cameraPolicy.tracks.length, trusted: window.cameraPolicy.clicks.every(Boolean) }));
    assert(retry.preview && retry.audio === 0 && retry.errors.length === 0 && retry.tracks > 0 && retry.trusted, '解除政策後未能重試原生合成相機');
    await page.locator('#stop').click(); await idle();
    assert(await page.evaluate(() => window.cameraPolicy.tracks.every(track => track.readyState === 'ended') && !document.getElementById('preview').srcObject), '停止沒有釋放重試的串流');
    assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '相機重試或停止改動原有資料');
    return { denied, retry, metadataAndFullMediaHashesPreserved: true, reloadPreserved: true, retryTracksEnded: true };
  } finally { await context.close(); }
}
