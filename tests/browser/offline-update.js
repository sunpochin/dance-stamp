/* 檔案用途：驗證不完整新版拒絕、錄影／匯出中等待、關閉全部分頁後啟用。所在層：真正 SW 生命週期驗收。主要關聯：serve-update.ts、sw.js、capture-comparison.js。 */
async (entry) => {
  const origin = new URL(entry.url()).origin;
  if (!await entry.evaluate(() => window.__danceSyntheticCameraOnly === true)) throw new Error('必須以合成相機設定執行');
  await entry.request.get(origin+'/__test__/version?mode=current');
  // 先切回主機基線再建立全新隔離 context，避免上輪 waiting worker 汙染本輪起點。
  const context=await entry.context().browser().newContext({acceptDownloads:true,viewport:{width:1280,height:960}}), page=await context.newPage();
  try {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = current => current.waitForFunction(() => !document.getElementById('controls').disabled, null, { timeout: 95000 });
  await page.addInitScript(() => { window.confirm = () => true; });
  await page.goto(origin);
  await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('已檢查應用資源完整'));
  await page.reload(); await idle(page);
  assert(!(await page.locator('#offline-status').textContent()).includes('-later'), '更新測試起點不是基線');
  const original = await page.evaluate(async () => { await (await caches.open('synthetic-unrelated-cache')).put('/unrelated-synthetic', new Response('kept')); window.updateSentinel = crypto.randomUUID(); window.originalController = navigator.serviceWorker.controller; return window.updateSentinel; });
  const failed = await page.evaluate(async () => {
    await fetch('/__test__/version?mode=bad'); const registration = await navigator.serviceWorker.getRegistration(); await registration.update();
    const installing = registration.installing;
    if (installing && installing.state !== 'redundant') await new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(new Error('bad update timeout')),10000); installing.addEventListener('statechange',()=> { if (installing.state==='redundant') { clearTimeout(timer); resolve(); } }); });
    return !registration.waiting && navigator.serviceWorker.controller === window.originalController && !(await caches.keys()).some(k=>k.endsWith('-bad'));
  });
  assert(failed, '損壞新版取代了舊版或留下不完整 cache');
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle(page);
  await page.locator('#copy-reference').click(); await idle(page); await page.locator('#camera').click(); await idle(page);
  await page.locator('#capture').click(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('錄影中'));
  await page.evaluate(async () => { await fetch('/__test__/version?mode=next'); const r=await navigator.serviceWorker.getRegistration(); await r.update(); });
  await page.waitForFunction(() => document.getElementById('update-status').textContent.includes('新版已備妥'));
  assert(await page.evaluate(original => window.updateSentinel===original && navigator.serviceWorker.controller===window.originalController && document.getElementById('controls').disabled, original), '錄影中新版重載／接管');
  await idle(page);
  const captured = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  assert(captured.takes.at(-1).state==='ready', '等待新版使錄影中斷');
  await page.locator('#export').click(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('合成中'));
  await page.evaluate(async () => { await fetch('/__test__/version?mode=later'); const r=await navigator.serviceWorker.getRegistration(); await r.update(); });
  await page.waitForFunction(() => document.getElementById('update-status').textContent.includes('新版已備妥'));
  assert(await page.evaluate(original => window.updateSentinel===original && navigator.serviceWorker.controller===window.originalController && document.getElementById('controls').disabled, original), '匯出中新版重載／接管');
  await idle(page); assert((await page.locator('#status').textContent()).includes('已成檔'), '等待新版沒有完成 VS');
  const download = page.waitForEvent('download'); await page.locator('#output-download').click(); await (await download).saveAs('output/media-probe/update-waiting-vs.mp4');
  const saved = await page.evaluate(async () => await (await import('/storage.js')).readLibrary());
  assert(await page.evaluate(async () => { const r=await navigator.serviceWorker.getRegistration(); return !!r.waiting && navigator.serviceWorker.controller===window.originalController; }), '完成工作後自行換版');
  await page.close();
  const reopened = await context.newPage();
  try {
    await reopened.goto(origin); await idle(reopened);
    await reopened.waitForFunction(() => document.getElementById('offline-status').textContent.includes('-later'));
    assert(JSON.stringify(await reopened.evaluate(async () => await (await import('/storage.js')).readLibrary()))===JSON.stringify(saved), '新版本啟用改了舊資料');
    await reopened.locator('#library').selectOption(saved.data.videos[0].id); await reopened.locator('#open-library').click(); await idle(reopened);
    await reopened.getByRole('button',{ name:'開啟自拍／恢復', exact:true }).click(); await idle(reopened);
    assert(await reopened.locator('#self').evaluate(v=>v.readyState>=2), '換版後錄影無法重開');
    const oldCaches = await reopened.evaluate(async () => (await caches.keys()).filter(k=>k.startsWith('dance-stamp-web-')&&!k.endsWith('-later')));
    assert(oldCaches.length===0, '舊版啟用後未清理自己的舊公開 cache');
    assert(await reopened.evaluate(async () => (await (await caches.open('synthetic-unrelated-cache')).match('/unrelated-synthetic'))?.text())==='kept', '更新清理了其他 cache');
  } finally { await reopened.close(); }
  return { corruptCandidateRejected: true, recordingAndExportReceiveRealWaitingWorkers: true, noReloadOrControllerTakeover: true, outputCompleted: true, activatesOnlyAfterAllOldTabsClose: true, existingDataAndRecordedPairPreserved: true, onlyOwnOldPublicCachesCleaned: true };
  } finally { await context.close(); }
}
