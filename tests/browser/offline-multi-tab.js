/* 檔案用途：以兩個真正舊產品頁驗證 SW 等待、關頁與資料保留。所在層：無媒體瀏覽器驗收。主要關聯：serve-update.ts、offline-update.js、issue-13-update-audit.md。 */
async (entry) => {
  const origin = new URL(entry.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  assert(new URL(origin).hostname === '127.0.0.1', '只能在自己的 loopback 更新主機執行');
  assert((await entry.request.get(origin + '/__test__/version?mode=current')).ok(), '不是明確啟用的更新測試主機');
  // 每輪獨立 context；測試不能把日常瀏覽器的筆記、worker 或 cache 清掉。
  const context = await entry.context().browser().newContext({ viewport: { width: 1280, height: 960 } });
  await context.addInitScript(() => {
    window.__twoTabMediaCalls = 0;
    for (const method of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices?.[method]) {
      navigator.mediaDevices[method] = async () => { window.__twoTabMediaCalls++; throw new Error('此無媒體測試禁止擷取'); };
    }
  });
  const idle = page => page.waitForFunction(() => !document.getElementById('controls').disabled, null, { timeout: 15000 });
  const complete = page => page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('已檢查應用資源完整'), null, { timeout: 15000 });
  const library = page => page.evaluate(async () => await (await import('/storage.js')).readLibrary());
  const info = page => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const query = worker => new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('worker 版本回覆逾時')); }, 5000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      worker.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]);
    });
    return { active: await query(registration.active), waiting: registration.waiting ? await query(registration.waiting) : null,
      unchanged: navigator.serviceWorker.controller === window.__twoTabController,
      controllerChanges: window.__twoTabControllerChanges, mediaCalls: window.__twoTabMediaCalls,
      sentinel: window.__twoTabSentinel };
  });
  try {
    const first = await context.newPage();
    await first.goto(origin); await complete(first); await first.reload(); await idle(first); await complete(first);
    await first.getByText('分類搜尋與動作庫', { exact: true }).click();
    await first.locator('#move-name').fill('合成更新保留'); await first.locator('#move-style').fill('Salsa');
    await first.locator('#move-status').selectOption('practicing'); await first.locator('#move-form button[type=submit]').click(); await idle(first);
    const initial = await library(first); assert(initial.data.moves.length === 1, '基線筆記未保存');
    await first.evaluate(async () => { await (await caches.open('synthetic-twin-unrelated')).put('/synthetic-twin-sentinel', new Response('kept')); });
    // 第二個頁面必須在更新前就受舊 worker 控制；事後重開頁不能代替這個條件。
    const second = await context.newPage(); await second.goto(origin); await idle(second); await complete(second);
    for (const page of [first, second]) await page.evaluate(() => {
      if (!navigator.serviceWorker.controller) throw new Error('舊頁尚未受控制');
      window.__twoTabController = navigator.serviceWorker.controller; window.__twoTabControllerChanges = 0;
      window.__twoTabSentinel = crypto.randomUUID();
      navigator.serviceWorker.addEventListener('controllerchange', () => window.__twoTabControllerChanges++);
    });
    const before = await info(second); assert(before.active.complete && !before.waiting, '基線版本不完整或已有候選');
    await first.evaluate(async () => { await fetch('/__test__/version?mode=next'); await (await navigator.serviceWorker.getRegistration()).update(); });
    // 等產品收到真正 waiting 訊號，再讀原生 registration；送出 update 不代表安裝已完成。
    await second.waitForFunction(() => document.getElementById('update-status').textContent.includes('新版已備妥'), null, { timeout: 15000 });
    const bothOpen = await info(second), firstInfo = await info(first);
    assert(firstInfo.mediaCalls === 0 && firstInfo.unchanged && firstInfo.controllerChanges === 0, '第一個舊頁要求擷取或被重載／接管');
    assert(bothOpen.active.version === before.active.version && bothOpen.waiting?.version === before.active.version + '-next', '兩個舊頁開著時版本不符：' + JSON.stringify({ before, bothOpen, firstInfo }));
    assert(bothOpen.unchanged && bothOpen.controllerChanges === 0, '兩個舊頁開著時被接管');
    await first.close();
    // 用真正保存與新導航跨過事件循環，不靠固定睡眠猜測 waiting 是否還在。
    await second.getByText('分類搜尋與動作庫', { exact: true }).click();
    await second.getByRole('button', { name: '編輯動作／狀態', exact: true }).click();
    await second.locator('#move-name').fill('合成更新保留完成'); await second.locator('#move-form button[type=submit]').click(); await idle(second);
    const saved = await library(second);
    assert(saved.data.moves.length === 1 && saved.data.moves[0].id === initial.data.moves[0].id && saved.data.moves[0].name === '合成更新保留完成', '第一頁關閉後第二頁不能保存原筆記');
    const survivor = await info(second);
    assert(survivor.unchanged && survivor.controllerChanges === 0 && survivor.sentinel === before.sentinel && survivor.waiting?.version === before.active.version + '-next', '第二個舊頁仍在時候選已接管或重載');
    const third = await context.newPage(); await third.goto(origin); await idle(third); await complete(third);
    const thirdInfo = await info(third);
    assert(thirdInfo.active.version === before.active.version && thirdInfo.waiting?.version === before.active.version + '-next', '第二舊頁仍在時新導航已換版');
    assert(survivor.mediaCalls === 0 && thirdInfo.mediaCalls === 0, '無媒體演練卻要求擷取');
    await second.close(); await third.close();
    const reopened = await context.newPage(); await reopened.goto(origin); await idle(reopened);
    await reopened.waitForFunction(() => document.getElementById('offline-status').textContent.includes('-next'), null, { timeout: 15000 });
    const after = await info(reopened);
    assert(after.active.version === before.active.version + '-next' && !after.waiting, '全部舊頁關閉後候選未啟用');
    assert(JSON.stringify(await library(reopened)) === JSON.stringify(saved), '新版本改動了已保存資料');
    assert(await reopened.evaluate(async () => (await (await caches.open('synthetic-twin-unrelated')).match('/synthetic-twin-sentinel'))?.text()) === 'kept', '更新清除了無關 cache');
    assert(after.mediaCalls === 0, '重開頁要求擷取');
    return { twoOldControlledPagesBeforeUpdate: true, candidateWaitsWithBothOpen: true, firstPageClosedSecondPageStillControlled: true,
      survivorSavesSameMove: true, survivorNotReloadedOrTakenOver: true, thirdNavigationUsesOldActiveWorker: true,
      activatesAfterRemainingOldPagesClose: true, exactSavedLibraryPreserved: true, unrelatedCachePreserved: true,
      cameraMicrophoneAndScreenCaptureCalls: 0, beforeVersion: before.active.version, afterVersion: after.active.version };
  } finally { await context.close(); }
}
