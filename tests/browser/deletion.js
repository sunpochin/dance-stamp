/* 檔案用途：驗證個別刪除、跨頁錄影鎖、交易取消與中斷回滾。所在層：隔離 IndexedDB 回歸。主要關聯：planDeletion、main.js、storage.js。 */
// 筆記管理收在次要工具，先展開再驗證既有功能；資料斷言維持原樣。
async (page) => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  const snapshot = () => page.evaluate(async () => await (await import('/storage.js')).readLibrary());
  const preview = async locator => { await locator.click(); await idle(); await page.locator('#delete-dialog').waitFor({ state: 'visible' }); };
  await page.addInitScript(() => { window.confirm = () => true; }); await page.goto(origin); await idle();
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  for (const [id, value] of [['end','5']]) { await page.locator('#'+id).fill(value); await page.locator('#'+id).dispatchEvent('change'); await idle(); }
  await page.locator('#copy-reference').click(); await idle(); await page.locator('#copy-self').click(); await idle();
  await page.locator('#export').click(); await idle();
  const initial = await snapshot(), take = initial.data.takes.at(-1), vs = initial.data.exports.at(-1), source = await page.locator('#reference').getAttribute('src');
  await page.locator('#media-inventory').evaluate(d => { d.open = true; });
  const reference = initial.data.assets.find(a => a.kind === 'reference'), row = page.locator('#media-items li[data-asset-id="'+reference.id+'"]');
  await preview(row.getByRole('button', { name: '移除此瀏覽器副本…', exact: true }));
  assert(await page.locator('#delete-cancel').evaluate(b => b === document.activeElement), '刪除預設焦點不是取消');
  await page.setViewportSize({ width:390, height:844 });
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth && document.getElementById('delete-dialog').scrollWidth<=document.getElementById('delete-dialog').clientWidth), '刪除窄版溢出');
  for (let i=0;i<5;i++) { await page.keyboard.press('Tab'); assert(await page.evaluate(()=>!document.hasFocus() || document.getElementById('delete-dialog').contains(document.activeElement)), '刪除焦點離開 modal'); }
  await page.locator('#delete-cancel').focus(); await page.screenshot({path:'output/offline13-delete.png'}); await page.setViewportSize({width:1280,height:960});
  await page.keyboard.press('Escape'); assert(JSON.stringify(await snapshot()) === JSON.stringify(initial), 'Escape 已刪資料');
  await preview(row.getByRole('button', { name: '移除此瀏覽器副本…', exact: true })); await page.locator('#delete-confirm').click(); await idle();
  const copied = await snapshot();
  assert(copied.data.takes.length === initial.data.takes.length && copied.data.exports.length === initial.data.exports.length && await page.locator('#reference').getAttribute('src') === source, '副本刪除破壞關聯或當次播放');
  assert(await page.evaluate(async id => !await (await import('/storage.js')).readMedia(id), reference.id), '副本沒有真的移除');
  await page.reload(); await idle();
  await page.locator('#library').selectOption(initial.data.videos[0].id); await page.locator('#open-library').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('尚未連結'), '刪副本重開後冒稱原片仍在');
  // 另一個真實分頁持有 take 錄影鎖時，刪除不能進入資料交易。
  const other = await page.context().newPage(); await other.goto(origin);
  try {
    await other.evaluate(id => { window.deleteLock = navigator.locks.request('dance-stamp:take:'+id, async () => { window.deleteLockHeld=true; await new Promise(r => { window.releaseDeleteLock=r; }); }); }, take.id);
    await other.waitForFunction(() => window.deleteLockHeld);
    await preview(page.getByRole('button', { name: '刪除此練習與比較…', exact: true }).last());
    const before = await snapshot(); await page.locator('#delete-confirm').click(); await idle();
    assert((await page.locator('#status').textContent()).includes('另一個分頁') && JSON.stringify(await snapshot()) === JSON.stringify(before), '刪除搶走錄影鎖或部分寫入');
    await page.locator('#delete-cancel').click(); await other.evaluate(async () => { window.releaseDeleteLock(); await window.deleteLock; });
  } finally { await other.close(); }
  await preview(page.getByRole('button', { name: '刪除此 VS 輸出…', exact: true }).last());
  const writer=await page.context().newPage();
  try { await writer.goto(origin); await writer.evaluate(async id=>{const store=await import('/storage.js'), saved=await store.readLibrary(); saved.data.videos.find(v=>v.id===id).title='合成較新筆記'; await store.writeLibrary(saved.data,saved.revision);},initial.data.videos[0].id); }
  finally { await writer.close(); }
  const newer=await snapshot(); await page.locator('#delete-confirm').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('另一分頁') && JSON.stringify(await snapshot())===JSON.stringify(newer),'舊刪除預覽覆寫另一分頁');
  await page.locator('#delete-cancel').click(); await page.reload(); await idle(); await page.locator('#library').selectOption(initial.data.videos[0].id); await page.locator('#open-library').click(); await idle();
  // 直接注入原生交易 abort 與取消事件；兩者都要保留 metadata 及 media。
  for (const mode of ['abort', 'cancel']) {
    const before = await snapshot(); await preview(page.getByRole('button', { name: '刪除此 VS 輸出…', exact: true }).last());
    await page.evaluate(mode => { window.deleteOriginal = IDBObjectStore.prototype.delete; IDBObjectStore.prototype.delete = function(...args) { const req = window.deleteOriginal.apply(this,args); if (this.name === 'media') { if (mode === 'abort') this.transaction.abort(); else queueMicrotask(() => document.getElementById('delete-cancel').click()); } return req; }; }, mode);
    try { await page.locator('#delete-confirm').click(); await idle(); }
    finally { await page.evaluate(() => { IDBObjectStore.prototype.delete = window.deleteOriginal; }); }
    assert(JSON.stringify(await snapshot()) === JSON.stringify(before) && await page.evaluate(async id => !!await (await import('/storage.js')).readMedia(id), vs.assetId), '中斷刪除部分寫入');
    if (await page.locator('#delete-dialog').evaluate(d => d.open)) await page.locator('#delete-cancel').click();
  }
  await preview(page.getByRole('button', { name: '刪除此 VS 輸出…', exact: true }).last()); await page.locator('#delete-confirm').click(); await idle();
  assert(!(await snapshot()).data.exports.some(e => e.id===vs.id) && (await snapshot()).data.takes.some(t => t.id===take.id), '刪 VS 也刪 take');
  // 改區間的兩份 take 共用原片；先刪第一份仍須保留共用副本。
  await preview(page.getByRole('button', { name: '刪除此練習與比較…', exact: true }).first()); await page.locator('#delete-confirm').click(); await idle();
  assert(await page.evaluate(async id => !!await (await import('/storage.js')).readMedia(id), take.cameraAssetId), '仍有 take 使用的共用原片遭刪除');
  const active = (await snapshot()).data.takes.at(-1);
  await page.evaluate(async id => { await (await import('/storage.js')).saveChunk(id, 0, new Blob(['synthetic orphan chunk'])); }, active.cameraAssetId);
  await preview(page.getByRole('button', { name: '刪除此練習與比較…', exact: true }).last()); await page.locator('#delete-confirm').click(); await idle();
  assert(!(await snapshot()).data.takes.some(t => t.id===active.id), 'take 未刪除');
  assert(await page.evaluate(async id => { const db=await (await import('/storage.js')).openStore(); return new Promise(resolve => { const r=db.transaction('chunks').objectStore('chunks').count(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER])); r.onsuccess=()=>resolve(r.result===0); }); }, active.cameraAssetId), 'take 殘留 chunks');
  await page.locator('#note-tools').evaluate(d => { d.open = true; });
  await preview(page.locator('#delete-video')); await page.locator('#delete-confirm').click(); await idle();
  const empty = await snapshot(); assert(empty.data.videos.length===0 && empty.data.takes.length===0 && empty.data.assets.length===0 && empty.data.exports.length===0, '整份筆記留下孤兒資料');
  await page.reload(); await idle(); assert((await snapshot()).data.videos.length===0, '刪除重開又恢復');
  // 正在等待缺少的自己原片時刪除該練習，下一次選片必須能建立新配對。
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle(); await page.locator('#copy-reference').click(); await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  const missing=(await snapshot()).data.takes[0]; await page.reload(); await idle();
  await page.locator('#library').selectOption(missing.referenceVideoId); await page.locator('#open-library').click(); await idle();
  await page.getByRole('button',{name:'開啟自拍／恢復',exact:true}).click(); await idle();
  assert((await page.locator('#status').textContent()).includes('缺少'), '未建立缺片重連情境');
  await preview(page.getByRole('button',{name:'刪除此練習與比較…',exact:true})); await page.locator('#delete-confirm').click(); await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  assert(await page.locator('#confirm-take').isHidden() && (await snapshot()).data.takes.length===1 && (await snapshot()).data.takes[0].id!==missing.id, '刪除缺片練習後仍卡在舊重連');
  // 空清單無法證明其他練習仍安全；另留已保存原片與非空筆記，再刪除正在補片的另一段。
  const mediaState = () => page.evaluate(async () => {
    const store = await import('/storage.js'), rows = [];
    for (const id of (await store.readMediaKeys()).sort()) {
      const blob = await store.readMedia(id), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
      rows.push({ id, bytes: blob.size, type: blob.type, hash });
    }
    return rows;
  });
  await page.locator('#end').fill('3'); await page.locator('#end').dispatchEvent('change'); await idle();
  await page.locator('#copy-self').click(); await idle();
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成多段保留'); await page.locator('#marker-note').fill('刪除另一段仍保留這份筆記');
  await page.locator('#marker-form button[type=submit]').click(); await idle();
  const kept = await snapshot(), keptTake = kept.data.takes.at(-1), keptIds = kept.data.takes.map(t => t.id), originalMedia = await mediaState();
  assert(keptIds.length > 0 && originalMedia.some(row => row.id === keptTake.cameraAssetId), '沒有其他已保存練習可驗證保全');
  await page.locator('#self-file').setInputFiles('output/comparison/self-0.75.mp4'); await idle();
  const withMissing = await snapshot(), pendingTake = withMissing.data.takes.find(t => !keptIds.includes(t.id));
  assert(pendingTake && withMissing.data.takes.length === keptIds.length + 1 && pendingTake.referenceVideoId === keptTake.referenceVideoId, '沒有建立同課程另一段待補原片的練習');
  await page.reload(); await idle(); await page.locator('#library').selectOption(pendingTake.referenceVideoId); await page.locator('#open-library').click(); await idle();
  await page.locator(`[data-focus-key="take:${pendingTake.id}:open"]`).click(); await idle();
  assert((await page.locator('#status').textContent()).includes('缺少') && !await page.locator('#self').getAttribute('src'), '不是重開後的真正缺片等待');
  const beforeDelete = await snapshot();
  // 用穩定ID選目標，不能依清單位置誤刪保留中的另一段。
  await preview(page.locator(`[data-focus-key="take:${pendingTake.id}:delete"]`)); await page.locator('#delete-confirm').click(); await idle();
  const afterDelete = await snapshot(), retainedMedia = await mediaState();
  for (const [key, rows] of Object.entries(kept.data)) if (Array.isArray(rows)) assert(JSON.stringify(afterDelete.data[key]) === JSON.stringify(rows), '刪除待補片段改動其他資料表：' + key);
  assert(afterDelete.revision === beforeDelete.revision + 1 && JSON.stringify(retainedMedia) === JSON.stringify(originalMedia), '刪除未單次提交或改動另一段的完整原生媒體');
  assert(await page.locator('#confirm-take').isHidden() && await page.locator('#take-download').isHidden() && !await page.locator('#self').getAttribute('src'), '刪除後仍留下待補片或下載狀態');
  await page.locator(`[data-focus-key="take:${keptTake.id}:open"]`).click(); await idle();
  assert(await page.locator('#self').evaluate(video => video.readyState >= 2 && !video.error), '另一段已保存原片無法經公開入口重開');
  await page.locator('#export').click(); await idle(); assert((await page.locator('#status').textContent()).includes('已成檔'), '刪除另一段後無法重新匯出');
  const exported = await snapshot(), artifact = exported.data.exports.at(-1), exportedMedia = await mediaState(), expectedVs = exportedMedia.find(row => row.id === artifact?.assetId);
  assert(expectedVs && JSON.stringify(exported.data.takes.filter(t => keptIds.includes(t.id))) === JSON.stringify(kept.data.takes), '重新匯出未保存VS或改動保留中的練習');
  assert(JSON.stringify(exportedMedia.filter(row => originalMedia.some(old => old.id === row.id))) === JSON.stringify(originalMedia), '重新匯出改動保留中的完整原片');
  const waiting = page.waitForEvent('download'); await page.locator('#output-download').click(); const file = await waiting;
  const actualVsDownload = 'output/comparison/pending-multi-vs.' + file.suggestedFilename().split('.').pop(); await file.saveAs(actualVsDownload);
  const bytes = await (await import('node:fs/promises')).readFile(actualVsDownload), { createHash } = await import('node:crypto');
  assert(bytes.length === expectedVs.bytes && createHash('sha256').update(bytes).digest('hex') === expectedVs.hash, '刪除後真正VS下載與完整原生保存不符');
  const multiPending = { deletedTakeId: pendingTake.id, keptTakeIds: keptIds, allTableArraysRestored: true, originalMedia, retainedMedia, deletionRevisionIncrement: afterDelete.revision - beforeDelete.revision, pendingControlsCleared: true, savedTakeReopened: true, actualVsDownload, expectedVs };
  return { copyOnlyKeepsRelationsAndSession: true, lostCopyMissingAfterReload: true, defaultCancelEscapeKeyboardAndNarrowLayout: true, otherTabTakeLockProtected: true, staleDeletePreviewRejected: true, abortAndCancelAtomic: true, exportAndTakeDeletedSeparately: true, chunksCleanedAtomically: true, notebookCascadeReopensCleanly: true, deletingPendingMissingTakeAllowsNewPair: true, multiPending };
}
