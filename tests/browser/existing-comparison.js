/* 檔案用途：驗證正式兩片入口、確認與 session-only 配方。所在層：桌面 Web 合成驗收。主要關聯：make-comparison-fixtures.ts、main.js。 */
async (page, { absentCamera = false } = {}) => {
  const assert = (ok, text) => { if (!ok) throw new Error(text); };
  const origin = new URL(page.url()).origin, checks = {};
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const outsideRequests = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && (new URL(request.url()).origin !== origin || request.method() !== 'GET')) outsideRequests.push({ url: request.url(), method: request.method() }); });
  await page.addInitScript(({ absentCamera }) => {
    window.captureCalls = 0;
    if (absentCamera) { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); return; }
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { window.captureCalls++; throw new DOMException('synthetic denied', 'NotAllowedError'); };
  }, { absentCamera });
  await page.goto(origin);
  await page.locator('#compare-existing').click(); await idle();
  assert(await page.locator('#pair-dialog').isVisible() && await page.locator('#pair-rate').inputValue() === '1', '正式入口缺少或繼承慢速');
  await page.locator('#pair-reference-file').setInputFiles('output/comparison-fixtures/teacher.mp4'); await idle();
  await page.locator('#pair-self-file').setInputFiles('output/comparison-fixtures/own-1.mp4'); await idle();
  assert((await library()).takes.length === 0 && await page.locator('#pair-confirm').isDisabled(), '未確認就建立錄影或配對');
  await page.locator('#pair-a').fill('12'); await page.locator('#pair-b').fill('32'); await page.locator('#pair-c').fill('4');
  await page.locator('#pair-reference-ok').check(); await page.locator('#pair-self-ok').check();
  await page.locator('#pair-confirm').click(); await idle();
  const first = (await library()).takes.at(-1);
  assert(first.state === 'ready' && !first.captureTiming && first.rate === 1 && first.referenceStartMs === 12000, '外部配對狀態或時間錯誤');
  const before = await page.evaluate(async () => {
    const store = await import('/storage.js'), { data } = await store.readLibrary();
    const blobs = await Promise.all(data.assets.map(a => store.readMedia(a.id)));
    return { metadata: JSON.stringify(data), blobCount: blobs.filter(Boolean).length, reference: document.getElementById('reference').src, self: document.getElementById('self').src };
  });
  assert(before.blobCount === 0 && await page.evaluate(() => window.captureCalls === 0), '外部影片被暗中複製或要求相機');
  checks.confirmedSessionOnlyAndNoCamera = true;
  await page.locator('#scrub').evaluate(input => { input.value = '5'; input.dispatchEvent(new Event('change')); }); await idle();
  const position = await page.evaluate(() => ({ reference: document.getElementById('reference').currentTime, self: document.getElementById('self').currentTime }));
  assert(Math.abs(position.reference - 17) < 0.05 && Math.abs(position.self - 9) < 0.05, '共同定位沒有依 A+r*t／C+t');
  checks.twelveAndFourSeek = position;
  for (const step of ['10', '50', '-10', '-50']) { await page.locator(`[data-offset-step="${step}"]`).click(); await idle(); }
  assert((await library()).recipes.find(r => r.takeId === first.id).offsetMs === 4000, '整數毫秒微調沒有回到原偏移');
  const savedBeforeCandidates = JSON.stringify(await library());
  await page.locator('#edit-pair').click(); await idle();
  for (const side of ['reference', 'self']) {
    for (const file of ['output/media-probe/player/corrupt.mp4', 'output/comparison-fixtures/empty.mp4', 'output/comparison-fixtures/unsupported.mkv']) {
      await page.locator(`#pair-${side}-file`).setInputFiles(file); await idle();
      assert(await page.locator(`#pair-${side}`).evaluate(v => v.readyState >= 2), '壞檔／空檔／不支援候選破壞舊候選預覽');
      assert(JSON.stringify(await library()) === savedBeforeCandidates, '失敗候選更動既有配方');
    }
    await page.locator(`#pair-${side}-file`).setInputFiles([]); await idle();
  }
  await page.locator('#pair-cancel').click(); await idle();
  assert(await page.locator('#reference').getAttribute('src') === before.reference && await page.locator('#self').getAttribute('src') === before.self && (await library()).takes.length === 1, '候選取消或壞檔變更舊配對');
  checks.badCandidateAndCancelKeepPair = true;
  await page.locator('#edit-pair').click(); await idle();
  await page.locator('#pair-b').fill('42'); await page.locator('#pair-rate').selectOption('0.5');
  await page.locator('#pair-reference-ok').check(); await page.locator('#pair-self-ok').check(); await page.locator('#pair-confirm').click(); await idle();
  const after = await library();
  assert(after.takes.length === 2 && JSON.stringify(after.takes[0]) === JSON.stringify(first) && after.takes[1].rate === 0.5 && after.assets.length === 2, '改區間／r 未建立獨立配方或改掉原片');
  checks.newRangeCreatesNewTake = true;
  await page.locator('#compare-existing').click(); await idle();
  assert(await page.locator('#pair-rate').inputValue() === '1', '新配對繼承上一個慢速');
  await page.locator('#pair-cancel').click();
  await page.reload(); await idle();
  await page.locator('#library').selectOption(first.referenceVideoId); await page.locator('#open-library').click(); await idle();
  await page.locator('#takes li').first().getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
  assert(await page.locator('#pair-dialog').isVisible() && await page.locator('#pair-a').inputValue() === '12' && await page.locator('#pair-c').inputValue() === '4', '缺兩片沒有保留配方並逐側重連');
  await page.locator('#pair-reference-file').setInputFiles('output/comparison-fixtures/teacher-short.mp4'); await idle();
  await page.locator('#pair-self-file').setInputFiles('output/comparison-fixtures/own-1.mp4'); await idle();
  await page.locator('#pair-reference-ok').check(); await page.locator('#pair-self-ok').check();
  assert(await page.locator('#pair-confirm').isDisabled() && (await page.locator('#pair-summary').textContent()).includes('超過'), '截短老師原片被自動當成正確配對');
  await page.locator('#pair-reference-file').setInputFiles('output/comparison-fixtures/teacher.mp4'); await idle();
  await page.locator('#pair-reference-ok').check(); await page.locator('#pair-self-ok').check(); await page.locator('#pair-confirm').click(); await idle();
  assert((await library()).takes.length === 2 && await page.locator('#offset').inputValue() === '4', '重連新增假工作或遺失配方');
  await page.locator('#copy-self').click(); await idle();
  const stored = await page.evaluate(async id => (await (await import('/storage.js')).readMedia(id))?.size, first.cameraAssetId);
  assert(stored > 0 && await page.evaluate(() => window.captureCalls === 0), '明確保存副本失敗或曾請求相機');
  checks.manualRelinkAndExplicitCopy = true;
  assert(outsideRequests.length === 0, `發現媒體外送或寫入請求：${JSON.stringify(outsideRequests)}`);
  checks.noUploadRequests = true; checks.absentCamera = absentCamera;
  return checks;
}
