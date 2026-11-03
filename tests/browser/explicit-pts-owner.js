/* 檔案用途：真 PTS Worker 準備取消、原生背景與真結果延後交付的保全。所在層：合成瀏覽器回歸，非原生 Safari。主要關聯：export-pts.js、pts-audit.js、run-app.ts。 */
async (page, options) => {
  // CI只驗可重現的owner邊界；真正背景須由獨立原生defaultContext入口明選，不能以刪斷言冒充通過。
  const nativeBackgroundRequested = options.nativeBackground === true;
  const setupModes = nativeBackgroundRequested ? ['setup-stop', 'setup-background'] : ['setup-stop'];
  const assert = (ok, message) => { if (!ok) throw Error(message); }, origin = new URL(page.url()).origin;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout: 15000, polling: 50 });
  let stage = 'bootstrap', failureObservation, finalObservation;
  const checkpoints = [], observationErrors = [];
  const observe = async () => {
    try { return await page.evaluate(() => ({ workers: window.__ptsAudit?.workerReceipt?.() ?? null,
      busy: document.getElementById('compare')?.getAttribute('aria-busy'), status: document.getElementById('status')?.textContent,
      diagnostics: document.getElementById('diagnostics')?.textContent, hidden: document.hidden, visibility: window.__ptsVisibility ?? null,
      source: 'memory/DOM only; no DB read or Blob hashing' })); }
    catch (error) { observationErrors.push({ stage, name: error.name, message: error.message }); return null; }
  };
  const checkpoint = async label => { stage = label; checkpoints.push({ stage, observation: await observe() }); };
  let firstFailure, report, release, heldTab, activeRoute;
  const phases = [], routeCleanup = [], cleanupErrors = [], workerURL = origin + '/export-pts-worker.js';
  const preserved = async (before, label) => {
    const after = await page.evaluate(() => window.__ptsAudit.snapshot());
    assert(JSON.stringify(after.data) === JSON.stringify(before.data) && JSON.stringify(after.urls) === JSON.stringify(before.urls) && after.output === before.output && JSON.stringify(after.bytes) === JSON.stringify(before.bytes) && JSON.stringify(after.savedExports) === JSON.stringify(before.savedExports), label + ' 改動原片完整 bytes／非空筆記／舊 VS');
    assert(after.sourcePaused && ![...before.urls, before.output].some(url => after.revoked.includes(url)), label + ' 來源未停止或舊下載被撤銷');
    return after;
  };
  try {
    await checkpoint('bootstrap');
    assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), '僅本機合成環境');
    assert(await page.evaluate(async () => (await import('/local-audio.js')).safariAudio()), '必須明選 Safari PTS 分支');
    await page.evaluate(options.installAudit);
    await checkpoint('select-sources');
    await page.locator('#existing-mode').click();
    for (const [id, path] of [['reference-file', 'output/export-failure/reference.mp4'], ['self-file', 'output/export-failure/self.mp4']]) { await page.locator('#' + id).setInputFiles(path); await idle(); }
    await page.locator('#end').fill('1.5'); await page.locator('#end').dispatchEvent('change'); await idle();
    await page.locator('#mark').click(); await page.locator('#marker-title').fill('PTS owner 合成筆記'); await page.locator('#marker-note').fill('取消與背景不動舊成品');
    await page.locator('#marker-form button[type="submit"]').click(); await idle();
    await checkpoint('baseline-export');
    await page.locator('#export').click(); await idle();
    const baseline = await page.evaluate(() => window.__ptsAudit.snapshot());
    assert(baseline.data.markers.length && baseline.data.exports.length && baseline.bytes[2].mime.startsWith('video/mp4'), '沒有非空筆記／真 MP4 基準');
    await checkpoint('baseline-confirmed');
    for (const mode of setupModes) {
      await checkpoint(mode + '-start');
      let entered, timeout;
      const reached = new Promise(resolve => { entered = resolve; }), waiting = new Promise(resolve => { release = resolve; });
      activeRoute = async route => {
        const response = await route.fetch(); entered(); await waiting;
        try { await route.fulfill({ response }); } catch (error) { routeCleanup.push({ mode, name: error.name, message: error.message }); }
      };
      await page.context().route(workerURL, activeRoute);
      await page.evaluate(mode => { window.__ptsAudit.mode = mode; }, mode);
      const beforeCount = await page.evaluate(() => window.__ptsAudit.workers.length);
      let phaseFailure;
      try {
        await page.locator('#export').click();
        try { await Promise.race([reached, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('未到原 Worker module 請求邊界')), 15000); })]); }
        finally { clearTimeout(timeout); }
        await checkpoint(mode + '-module-request-held');
        assert(await page.locator('#compare').getAttribute('aria-busy') === 'true', '準備工作已提前終態，不能當取消／背景證據');
        if (mode === 'setup-stop') await page.locator('#stop').click();
        else {
          await page.evaluate(() => { window.__ptsVisibility = []; document.addEventListener('visibilitychange', window.__ptsVisibilityListener = event => window.__ptsVisibility.push({ hidden: document.hidden, trusted: event.isTrusted })); });
          heldTab = await page.context().newPage(); await heldTab.bringToFront();
          // 隱藏後rAF可停止；沿原生gate interval只讀真hidden／trusted，不改getter、不派假事件。
          await page.waitForFunction(() => document.hidden && window.__ptsVisibility.some(row => row.hidden && row.trusted), null, { timeout: 15000, polling: 50 });
        }
        await idle();
        await checkpoint(mode + '-first-result');
        const workers = await page.evaluate(() => window.__ptsAudit.workerReceipt()), current = workers.slice(beforeCount);
        assert(current.length === 1 && current[0].terminateCalls === 1 && current[0].terminateReturns === 1 && !current[0].terminateErrors.length, mode + ' 未終止自己的真 Worker');
        if (heldTab) { await heldTab.close(); heldTab = null; await page.bringToFront(); await page.waitForFunction(() => !document.hidden, null, { timeout: 15000, polling: 50 }); }
        release(); release = null;
        await page.context().unroute(workerURL, activeRoute); activeRoute = null;
        const after = await preserved(baseline, mode);
        phases.push({ mode, workers: current, preserved: after, visibility: mode === 'setup-background' ? await page.evaluate(() => window.__ptsVisibility) : null });
      } catch (error) { phaseFailure = error; throw error; }
      finally {
        let firstCleanup;
        const actions = [
          async () => { release?.(); release = null; },
          async () => { if (activeRoute) { await page.context().unroute(workerURL, activeRoute); activeRoute = null; } },
          async () => { if (heldTab) { await heldTab.close(); heldTab = null; await page.bringToFront(); } },
          async () => { await page.evaluate(() => { if (window.__ptsVisibilityListener) document.removeEventListener('visibilitychange', window.__ptsVisibilityListener); }); },
        ];
        for (const action of actions) try { await action(); } catch (error) { cleanupErrors.push({ name: error.name, message: error.message }); firstCleanup ??= error; }
        if (!phaseFailure && firstCleanup) throw firstCleanup;
      }
    }
    // 真 codec 完成但 owner 尚未收到：保存原生 event／原 handler，Stop 後才交付同一事件，不 dispatch 假完成。
    await checkpoint('hold-native-result-start');
    await page.evaluate(() => { window.__ptsAudit.mode = 'hold-result'; });
    const beforeCount = await page.evaluate(() => window.__ptsAudit.workers.length);
    await page.locator('#export').click();
    await page.waitForFunction(() => window.__ptsAudit.workers.at(-1)?.held, null, { timeout: 15000 });
    const held = await page.evaluate(() => {
      const row = window.__ptsAudit.workers.at(-1), h = row.held;
      return { nativeBlob: h.nativeBlob, bytes: h.bytes, trusted: h.trusted, targetIsOwn: h.event.target?.__ptsRow === row, idMatches: h.event.data.id === row.requestId, hasHandler: typeof h.handler === 'function' };
    });
    await checkpoint('native-result-held-before-stop');
    assert(held.nativeBlob && held.bytes > 0 && held.trusted && held.targetIsOwn && held.idMatches && held.hasHandler, '沒有可轉交的真正結果事件');
    await page.locator('#stop').click(); await idle();
    await checkpoint('native-result-stopped-before-late-delivery');
    await preserved(baseline, 'held-result stop');
    const createdBefore = await page.evaluate(() => window.__ptsAudit.created.length);
    await page.evaluate(async () => {
      const row = window.__ptsAudit.workers.at(-1), h = row.held;
      if (!row.terminateReturns || h.delivered) throw Error('晚交付前提失敗');
      h.delivered = true; h.handler.call(h.event.target, h.event);
      // flush JS promise continuations；錯誤接受結果會先建立獨立驗檔 URL，無需以 sleep 假定保存已完成。
      await Promise.resolve(); await Promise.resolve();
    });
    await checkpoint('native-result-delivered-after-stop');
    assert(await page.evaluate(() => window.__ptsAudit.created.length) === createdBefore, '晚 Blob 復活並建立新的驗片 URL');
    const afterLate = await preserved(baseline, 'native result delayed delivery'), lateWorker = await page.evaluate(count => window.__ptsAudit.workerReceipt().slice(count), beforeCount);
    assert(lateWorker.length === 1 && lateWorker[0].terminateCalls === 1 && lateWorker[0].terminateReturns === 1 && lateWorker[0].held.delivered, '晚交付重建／漏收 Worker');
    phases.push({ mode: 'held-native-result-after-stop', held, workers: lateWorker, preserved: afterLate, lateNativeEncoderCompletionClaim: false });
    await checkpoint('retry-after-owner-controls');
    await page.evaluate(() => { window.__ptsAudit.mode = 'pass'; });
    await page.locator('#export').click(); await idle();
    const retry = await page.evaluate(() => window.__ptsAudit.snapshot());
    assert(retry.data.exports.length === baseline.data.exports.length + 1 && retry.output !== baseline.output && retry.bytes[2].mime.startsWith('video/mp4'), '取消／背景後不能在同頁完成真正新匯出');
    assert(JSON.stringify(retry.urls) === JSON.stringify(baseline.urls) && JSON.stringify(retry.bytes.slice(0, 2)) === JSON.stringify(baseline.bytes.slice(0, 2)) && JSON.stringify(retry.data.markers) === JSON.stringify(baseline.data.markers), '成功重試破壞原來源／筆記');
    for (const [table, rows] of Object.entries(baseline.data)) if (Array.isArray(rows)) for (const row of rows) assert(JSON.stringify(retry.data[table].find(value => value.id === row.id)) === JSON.stringify(row), '成功重試改寫既有 ' + table + ' row');
    for (const row of baseline.savedExports) assert(JSON.stringify(retry.savedExports.find(value => value.id === row.id)) === JSON.stringify(row), '成功重試破壞既有 VS 完整 bytes');
    report = { engine: 'Chromium', selectedWebKitBranch: true, backend: 'explicit-pts', nativeBackgroundRequested, nativeBackgroundVerified: phases.some(phase => phase.mode === 'setup-background'), phases, retry, routeCleanup, workers: await page.evaluate(() => window.__ptsAudit.workerReceipt()), auditSourceSha256: options.auditSourceSha256, safariDeviceAcceptance: false, physicalWorkerExitIndependentlyVerified: false };
  } catch (error) { firstFailure = error; failureObservation = await observe(); }
  finally {
    const cleanups = [
      async () => { release?.(); if (activeRoute) await page.context().unroute(workerURL, activeRoute); },
      async () => { if (heldTab) await heldTab.close(); },
      async () => { if (await page.locator('#compare').getAttribute('aria-busy') === 'true') { await page.locator('#stop').click(); await idle(); } },
      async () => { finalObservation = await observe(); },
      async () => { await page.evaluate(() => window.__ptsAudit?.restore()); },
    ];
    for (const cleanup of cleanups) try { await cleanup(); } catch (error) { cleanupErrors.push({ name: error.name, message: error.message }); if (!firstFailure) stage = 'cleanup'; firstFailure ??= error; }
  }
  const caseEvidence = { case: 'explicit-pts-owner', nativeBackgroundRequested, nativeBackgroundVerified: phases.some(phase => phase.mode === 'setup-background'), firstFailedStage: firstFailure ? stage : null, checkpoints, failureObservation, finalObservation, observationErrors, phases, routeCleanup, cleanupErrors };
  if (firstFailure) { const error = firstFailure instanceof Error ? firstFailure : new Error(String(firstFailure), { cause: firstFailure }); error.ptsOwnerEvidence = caseEvidence; throw error; }
  return { ...report, cleanupErrors, caseEvidence };
}
