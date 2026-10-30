/* 檔案用途：驗證已成檔 VS 的分享後備、取消、拒絕與重試保全。所在層：合成瀏覽器回歸。主要關聯：main.js 的 share 控制、run-app.ts、issue #103。 */
async page => {
  const origin = new URL(page.url()).origin, errors = [], outside = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if ((!request.url().startsWith(origin + '/') && !request.url().startsWith('blob:')) || !['GET', 'HEAD'].includes(request.method())) outside.push(request.method() + ' ' + request.url()); });
  await page.addInitScript(() => {
    window.__vsShareMode = 'unavailable'; window.__vsShareCalls = []; window.__vsShareMediaCalls = 0;
    for (const method of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices?.[method]) navigator.mediaDevices[method] = async () => { window.__vsShareMediaCalls++; throw new Error('VS 分享回歸禁止擷取'); };
    // 只替換 OS 分享邊界，不開真實寄件介面；檔案仍由產品真正合成，再核對完整指紋。
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }) => {
      window.__vsShareCandidate = files[0]; return window.__vsShareMode !== 'unavailable';
    } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => {
      const file = files[0], activated = navigator.userActivation.isActive, sameCandidate = file === window.__vsShareCandidate;
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('');
      window.__vsShareCalls.push({ name: file.name, type: file.type, size: file.size, hash, activated, sameCandidate });
      if (window.__vsShareMode === 'abort') throw new DOMException('synthetic cancellation', 'AbortError');
      if (window.__vsShareMode === 'denied') throw new DOMException('synthetic permission denial', 'NotAllowedError');
    } });
  });
  await page.goto(origin); await idle();
  assert(!await page.locator('#share').isEnabled(), '沒有成檔影片仍可分享');
  await page.locator('#reference-file').setInputFiles('output/export-failure/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/export-failure/self.mp4'); await idle();
  await page.locator('#end').fill('3'); await page.locator('#end').dispatchEvent('change'); await idle();
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔') && await page.locator('#share').isEnabled(), '基準 VS 沒有真正成檔');
  const baseline = await page.evaluate(async () => ({ library: JSON.stringify(await (await import('/storage.js')).readLibrary()), urls: ['reference', 'self', 'output'].map(id => document.getElementById(id).getAttribute('src')), href: document.getElementById('output-download').href }));
  const downloadVs = async () => {
    const waiting = page.waitForEvent('download'); await page.locator('#output-download').click(); const download = await waiting;
    const stream = await download.createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    return { download, name: download.suggestedFilename(), size: bytes.length, hash };
  };
  // 原政策不開放任意 Blob fetch；走真正下載取得基準，不能為了 QA 放寬 CSP。
  const first = await downloadVs(); Object.assign(baseline, { name: first.name, size: first.size, hash: first.hash });
  const mime = { mp4: 'video/mp4', webm: 'video/webm' }[first.name.split('.').pop()]; assert(mime, 'VS 下載容器未知');
  const cases = [
    ['unavailable', '此瀏覽器無法分享影片檔，請改用下載。'],
    ['accepted', '已交給系統分享；請到目的端核對保存結果。'],
    ['abort', '已取消分享，影片仍保留。'],
    ['denied', '分享失敗，影片仍可下載或重試。'],
    ['accepted', '已交給系統分享；請到目的端核對保存結果。'],
  ];
  let count = 0;
  for (const [mode, message] of cases) {
    await page.evaluate(mode => { window.__vsShareMode = mode; }, mode);
    await page.locator('#share').click();
    await page.waitForFunction(message => document.getElementById('status').textContent === message, message);
    const current = await page.evaluate(async () => ({ library: JSON.stringify(await (await import('/storage.js')).readLibrary()), urls: ['reference', 'self', 'output'].map(id => document.getElementById(id).getAttribute('src')), href: document.getElementById('output-download').href, calls: window.__vsShareCalls, mediaCalls: window.__vsShareMediaCalls }));
    assert(current.library === baseline.library && JSON.stringify(current.urls) === JSON.stringify(baseline.urls) && current.href === baseline.href, mode + ' 改掉原片、VS 或筆記');
    if (mode !== 'unavailable') count++;
    assert(current.calls.length === count && current.mediaCalls === 0, '不支援時仍呼叫分享，或分享誤觸擷取');
    for (const file of current.calls) assert(file.activated && file.sameCandidate && file.type.split(';')[0] === mime && ['name', 'size', 'hash'].every(key => file[key] === baseline[key]), '傳給系統的檔案不是已驗證的同一份 VS，或失去點按資格');
    assert(await page.locator('#share').isEnabled(), '分享完成或失敗後無法重試');
  }
  // 不只相信畫面宣稱保留：失敗與重試後真正下載，再核對整份檔案的 SHA-256、大小與名稱。
  const last = await downloadVs(); assert(['name', 'size', 'hash'].every(key => last[key] === baseline[key]), '分享後下載的 VS bytes 或容器名稱不同');
  const path = 'output/playwright/vs-share-preserved.' + baseline.name.split('.').pop(); await last.download.saveAs(path);
  assert(errors.length === 0 && outside.length === 0, '頁面錯誤或對外傳送：' + JSON.stringify({ errors, outside }));
  await page.locator('#save-result').screenshot({ path: 'output/playwright/vs-share.png' });
  return { realVsBeforeSharing: true, mockedSystemShareOnly: true, unavailableDownloadsInstead: true, acceptedPayloadMatchesVs: true, userActivationPreserved: true, cancellationAndDenialPreserveAllData: true, retryAfterFailure: true, downloadedBytesMatch: true, shareCalls: count, cameraMicrophoneAndScreenCaptureCalls: 0, pageErrors: errors, outsideRequests: outside, download: path };
}
