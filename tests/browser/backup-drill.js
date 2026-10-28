/* 檔案用途：以三影片、十標記、兩 take 與一 VS 完成清除後恢復及逐檔缺片演練。所在層：隔離瀏覽器驗收。主要關聯：ACCEPTANCE.md、backup-recovery.js。 */
async (page) => {
  const origin = new URL(page.url()).origin, browser = page.context().browser();
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = p => p.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const snapshot = p => p.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const keys = p => p.evaluate(async () => await (await import('/storage.js')).readMediaKeys());
  const row = (p, id) => p.locator('#media-items li[data-asset-id="' + id + '"]');
  const change = async (p, id, value) => { await p.locator('#' + id).fill(value); await p.locator('#' + id).dispatchEvent('change'); await idle(p); };
  const available = (p, id, value) => p.waitForFunction(({ id, value }) => document.querySelector('#media-items li[data-asset-id="' + id + '"]')?.dataset.availability === value, { id, value });
  const guard = context => context.addInitScript(() => {
    window.confirm = () => true;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });
  const save = async (p, action, path) => {
    const waiting = p.waitForEvent('download'); await action(); const download = await waiting;
    await download.saveAs(path); await idle(p);
    // 從真正下載串流比對 bytes，不為測試放寬產品禁止 fetch blob URL 的 CSP。
    const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    return { bytes: bytes.length, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('') };
  };
  // 只清除本函式新建 context 的資料；不得把呼叫者或日常瀏覽器拿來當恢復演練。
  const source = await browser.newContext({ acceptDownloads: true }); await guard(source);
  const current = await source.newPage(), files = new Map(), hashes = new Map(), results = [];
  try {
    await current.goto(origin); await idle(current);
    assert((await snapshot(current)).videos.length === 0 && (await keys(current)).length === 0, '來源不是全新測試資料');
    for (let i = 0; i < 3; i++) {
      await current.locator('#reference-file').setInputFiles('output/backup-drill/reference-' + (i + 1) + '.mp4'); await idle(current);
      for (let j = 0; j < (i === 0 ? 4 : 3); j++) {
        await current.locator('#mark').click();
        await current.locator('#marker-title').fill('合成標記 ' + i + '-' + j);
        await current.locator('#marker-note').fill('純文字 <img src=x onerror=alert(1)> ' + j);
        await current.locator('#marker-start').fill(String(j / 2));
        await current.locator('#marker-form button[type="submit"]').click(); await idle(current);
      }
      if (i < 2) {
        await change(current, 'start', '1'); await change(current, 'end', '3');
        await current.locator('#self-file').setInputFiles('output/backup-drill/reference-3.mp4'); await idle(current);
        await change(current, 'offset', '0.5');
        await current.locator('#reference-mirror').setChecked(i === 0); await idle(current);
        await current.locator('#self-mirror').setChecked(i === 1); await idle(current);
        if (i === 1) {
          await current.locator('#export').click(); await idle(current);
          assert((await current.locator('#status').textContent()).includes('已成檔'), '來源沒有真正合成 VS');
        }
      }
    }
    const data = await snapshot(current);
    assert(data.videos.length === 3 && data.markers.length === 10 && data.takes.length === 2 && data.recipes.length === 2 && data.exports.length === 1 && data.assets.length === 6, '恢復素材數量不符合驗收');
    const backupPath = 'output/backup-drill/notes.dance-stamp.json';
    await save(current, () => current.locator('#backup').click(), backupPath);
    const inventory = current.locator('#media-inventory'); await inventory.evaluate(el => { el.open = true; });
    for (const [index, asset] of data.assets.entries()) {
      const path = 'output/backup-drill/saved-' + index + '.mp4'; files.set(asset.id, path);
      hashes.set(asset.id, await save(current, () => row(current, asset.id).getByRole('button', { name: '另存影片檔', exact: true }).click(), path));
    }
    await current.goto('about:blank');
    const cdp = await source.newCDPSession(current);
    await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'indexeddb,cache_storage,service_workers' }); await cdp.detach();
    await current.goto(origin); await idle(current);
    assert((await snapshot(current)).videos.length === 0 && (await keys(current)).length === 0, '專用資料清除沒有生效');
    const relink = async (p, asset, copy) => {
      await row(p, asset.id).getByRole('button', { name: '選片並預覽重連', exact: true }).click(); await idle(p);
      await p.locator('#relink-file').setInputFiles(files.get(asset.id)); await idle(p);
      assert(await p.locator('#relink-confirm').isDisabled() && !await p.locator('#relink-save').isChecked(), '未確認便可重連或預設複製');
      await p.locator('#relink-checked').check(); await p.locator('#relink-save').setChecked(copy);
      await p.locator('#relink-confirm').click(); await idle(p); await available(p, asset.id, copy ? 'stored' : 'session');
    };
    const unchanged = async p => {
      const after = await snapshot(p);
      const same = await p.evaluate(async ({ before, after }) => {
        const { validateBackup, tables } = await import('/library.js'), a = validateBackup(before), b = validateBackup(after);
        return a.sourceLibraryId === b.sourceLibraryId && tables.every(table => JSON.stringify(a[table]) === JSON.stringify(b[table]));
      }, { before: data, after });
      assert(same, '恢復或缺片改寫筆記、時間映射、鏡像或媒體關聯');
    };
    const openNotes = async (p, missing) => {
      // 缺片尚未補回前也要開啟其他資料，避免把「補齊後可用」誤當隔離成功。
      for (const video of data.videos) {
        await p.locator('#library').selectOption(video.id); await p.locator('#open-library').click(); await idle(p);
        assert(await p.locator('#markers > li').count() === data.markers.filter(m => m.videoId === video.id).length && await p.locator('#markers img').count() === 0, '其他筆記不能正常開啟或被當成 HTML');
        const take = data.takes.find(t => t.referenceVideoId === video.id);
        if (take && missing?.videoId !== video.id && missing?.id !== take.cameraAssetId) {
          await p.getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle(p);
          const recipe = data.recipes.find(r => r.takeId === take.id);
          assert(Number(await p.locator('#start').inputValue()) === 1 && Number(await p.locator('#end').inputValue()) === 3 && Number(await p.locator('#offset').inputValue()) === 0.5 && await p.locator('#reference-mirror').isChecked() === recipe.referenceMirror && await p.locator('#self-mirror').isChecked() === recipe.selfMirror, '開啟配方或獨立鏡像改變');
          await change(p, 'scrub', '1');
          const times = await p.evaluate(() => ['reference', 'self'].map(id => document.getElementById(id).currentTime));
          assert(Math.abs(times[0] - 2) < 0.05 && Math.abs(times[1] - 1.5) < 0.05, '重連後時間映射錯誤');
        }
      }
      await unchanged(p);
    };
    const exercise = async (p, missing) => {
      await p.locator('#restore').setInputFiles(backupPath); await idle(p);
      assert((await snapshot(p)).videos.length === 0, '匯入預覽前已有寫入');
      await p.locator('#import-confirm').click(); await idle(p);
      assert((await keys(p)).length === 0, 'JSON 包含媒體或錯認副本存在'); await unchanged(p);
      for (const asset of data.assets) if (asset.id !== missing?.id) await relink(p, asset, true);
      await p.reload(); await idle(p);
      await p.locator('#media-inventory').evaluate(el => { el.open = true; });
      const stored = await keys(p);
      assert(stored.length === data.assets.length - (missing ? 1 : 0), '缺片數量不正確');
      if (missing) {
        await available(p, missing.id, 'missing');
        await openNotes(p, missing);
        // 未確認候選不能變成已連結影片；取消後缺片及其他已存媒體都不能被替換。
        await row(p, missing.id).getByRole('button', { name: '選片並預覽重連', exact: true }).click(); await idle(p);
        await p.locator('#relink-file').setInputFiles('output/backup-drill/reference-1.mp4'); await idle(p);
        await p.keyboard.press('Escape'); await unchanged(p);
        assert(JSON.stringify(await keys(p)) === JSON.stringify(stored), '取消候選破壞其他副本');
        await relink(p, missing, false);
        assert(!(await keys(p)).includes(missing.id), '本次連結暗中保存影片');
      }
      await openNotes(p);
      const vs = data.assets.find(a => a.kind === 'vs');
      const restoredHash = await save(p, () => row(p, vs.id).getByRole('button', { name: '另存影片檔', exact: true }).click(), 'output/backup-drill/restored-' + (missing ? data.assets.indexOf(missing) : 'all') + '-vs.mp4');
      assert(JSON.stringify(restoredHash) === JSON.stringify(hashes.get(vs.id)), 'VS 恢復下載 bytes 不同');
      if (!missing) for (const asset of data.assets.filter(a => a.kind !== 'vs')) {
        const hash = await save(p, () => row(p, asset.id).getByRole('button', { name: '另存影片檔', exact: true }).click(), 'output/backup-drill/restored-original-' + data.assets.indexOf(asset) + '.mp4');
        assert(JSON.stringify(hash) === JSON.stringify(hashes.get(asset.id)), '原片恢復下載 bytes 不同');
      }
      if (missing) {
        await p.reload(); await idle(p); await available(p, missing.id, 'missing'); await unchanged(p);
        assert(!(await keys(p)).includes(missing.id), 'session-only 重開後冒充已存副本');
      }
      results.push(missing ? missing.kind + ':' + data.assets.indexOf(missing) : 'cleared-full-restore');
    };
    await exercise(current);
    for (const missing of data.assets) {
      const context = await browser.newContext({ acceptDownloads: true }); await guard(context);
      try { const p = await context.newPage(); await p.goto(origin); await idle(p); await exercise(p, missing); }
      finally { await context.close(); }
    }
    return { cases: results, videos: 3, markers: 10, takes: 2, exports: 1, testOriginActuallyCleared: true, eachMissingAssetRetainsAllMetadata: true, sessionOnlyMissingAfterReload: true, restoredVs: hashes.get(data.exports[0].assetId), browser: browser.version() };
  } finally { await source.close(); }
}
