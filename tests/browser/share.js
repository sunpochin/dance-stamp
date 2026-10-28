/* 檔案用途：以合成素材驗證選定分享、隔離接收、原子失敗與逐側重連。所在層：Web 檔案流程驗收。主要關聯：library.js、main.js、issue-18-sharing.md。 */
async (page) => {
  const origin = new URL(page.url()).origin, outside = [], errors = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = p => p.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const snapshot = p => p.evaluate(async () => await (await import('/storage.js')).readLibrary());
  const restore = async (p, data) => { await p.locator('#restore').setInputFiles({ name: 'synthetic.dance-stamp.json', mimeType: 'application/json', buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)) }); await idle(p); };
  const watch = p => { p.on('request', r => { if ((!r.url().startsWith(origin + '/') && !r.url().startsWith('blob:')) || !['GET','HEAD'].includes(r.method())) outside.push(r.method() + ' ' + r.url()); }); p.on('pageerror', e => errors.push(e.message)); };
  const init = () => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('分享驗收禁止相機'); }; Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }); };
  watch(page); await page.addInitScript(init); await page.goto(origin); await idle(page);
  await page.locator('#existing-mode').click();
  await page.locator('#reference-file').setInputFiles('output/export-failure/reference.mp4'); await idle(page);
  await page.locator('#self-file').setInputFiles('output/export-failure/self.mp4'); await idle(page);
  for (const [id, value] of [['start','1'],['end','3'],['offset','0.5']]) { await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); await idle(page); }
  await page.locator('#reference-mirror').check(); await idle(page);
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成八拍'); await page.locator('#marker-start').fill('1'); await page.locator('#marker-end').fill('3'); await page.locator('#marker-note').fill('<img src=x onerror="window.shareXss=true">合成私密正文'); await page.locator('#marker-form').evaluate(f => f.requestSubmit()); await idle(page);
  await page.locator('#export').click(); await idle(page);
  assert((await page.locator('#status').textContent()).includes('已成檔'), '未產生合成 VS');
  const vsDownload = page.waitForEvent('download'); await page.locator('#output-download').click(); await (await vsDownload).saveAs('output/share18/vs.mp4');
  const ids = await page.evaluate(async () => {
    const store = await import('/storage.js'), saved = await store.readLibrary(), data = saved.data, video = data.videos[0], marker = data.markers[0], take = data.takes.at(-1), artifact = data.exports.at(-1);
    video.teacher = '合成老師'; video.recordedDate = '2026-10-01'; video.danceStyle = 'Salsa'; video.futurePrivate = 'synthetic-secret';
    data.assets.find(a => a.videoId === video.id).originalName = 'synthetic-private-name.mp4';
    data.markers.push({ ...marker, id: crypto.randomUUID(), title: '未選片段', note: '未選私密筆記' });
    const otherTake = { ...take, id: crypto.randomUUID() }; data.takes.push(otherTake); data.recipes.push({ ...data.recipes.find(r => r.takeId === take.id), id: crypto.randomUUID(), takeId: otherTake.id });
    await store.writeLibrary(data, saved.revision);
    return { video: video.id, marker: marker.id, take: take.id, artifact: artifact.id };
  });
  await page.reload(); await idle(page);
  const original = await snapshot(page), pick = (table, id) => page.locator(`#share-items input[data-table="${table}"][value="${id}"]`);
  const open = async () => { await page.locator('#share-notes').click(); await idle(page); };
  const preview = async () => { await page.locator('#share-preview').click(); await idle(page); return JSON.parse(await page.locator('#share-content').textContent()); };
  await open(); assert(await page.locator('#share-items input:checked').count() === 0 && await page.locator('#share-fields input:checked').count() === 0, '分享預設暴露內容');
  assert(await page.evaluate(() => document.activeElement.id === 'share-cancel' && document.getElementById('share-dialog').matches(':modal')), '分享 modal 沒有預設關閉焦點');
  await pick('markers', ids.marker).check(); const minimal = await preview(), minimalText = JSON.stringify(minimal);
  for (const hidden of ['合成私密正文','合成老師','synthetic-private-name','2026-10-01','synthetic-secret','未選片段','未選私密筆記']) assert(!minimalText.includes(hidden), '預設分享洩漏 ' + hidden);
  assert(minimal.kind === 'share' && minimal.markers.length === 1 && minimal.takes.length === 0 && minimal.assets.length === 1 && await page.locator('#share-system').isHidden(), '未選 take／不支援系統時的基線錯誤');
  const downloaded = page.waitForEvent('download'); await page.locator('#share-download').click(); const actual = await downloaded;
  assert(actual.suggestedFilename().endsWith('.dance-stamp.json'), '副檔名不正確'); await actual.saveAs('output/share18/minimal.dance-stamp.json'); await idle(page);
  const stream = await actual.createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk);
  assert(Buffer.concat(chunks).toString() === await page.locator('#share-content').textContent(), '預覽與下載內容不同');
  await page.locator('#share-fields input[value="note"]').check(); assert(await page.locator('#share-download').isDisabled() && !await page.locator('#share-content').textContent(), '修改選項後仍可傳舊預覽');
  for (const field of ['teacher','danceStyle','recordedDate','originalName']) await page.locator(`#share-fields input[value="${field}"]`).check();
  await pick('exports', ids.artifact).check(); const complete = await preview();
  const completeDownload=page.waitForEvent('download'); await page.locator('#share-download').click(); await (await completeDownload).saveAs('output/share18/complete.dance-stamp.json'); await idle(page);
  assert(complete.markers[0].note.includes('合成私密正文') && complete.videos[0].teacher === '合成老師' && complete.assets.some(a => a.originalName) && complete.takes.length === 1 && complete.recipes.length === 1 && complete.exports.length === 1 && complete.assets.length === 3, '明確加入欄位／必要閉包錯誤');
  assert(!JSON.stringify(complete).includes('futurePrivate') && !JSON.stringify(complete).includes('captureTiming'), '未來欄位／裝置觀測外流');
  // 只替換能力與分享 API；不打開真實 OS 寄件，也不向任何人傳檔。
  await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true }); Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.sharedPayload = await data.files[0].text(); window.shareActivation = navigator.userActivation.isActive; } }); });
  await preview(); assert(await page.locator('#share-system').isVisible() && !await page.evaluate(() => window.sharedPayload), '未點按便啟動系統分享');
  await page.locator('#share-system').click(); await page.waitForFunction(() => document.getElementById('share-summary').textContent.includes('無法確認'));
  assert(await page.evaluate(() => window.sharedPayload === document.getElementById('share-content').textContent && window.shareActivation), '系統分享與預覽不同或失去使用者啟動');
  for (const name of ['AbortError', 'NotAllowedError']) {
    await page.evaluate(name => { Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('synthetic only', name); } }); }, name);
    await page.locator('#share-system').click(); await page.waitForFunction(() => !document.getElementById('share-controls').disabled); assert((await page.locator('#share-summary').textContent()).includes('仍可下載') || (await page.locator('#share-summary').textContent()).includes('改用下載'), '系統取消／失敗沒有下載替代');
  }
  await page.evaluate(() => { window.originalClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function() { throw new Error('synthetic export failure'); }; });
  try { await page.locator('#share-download').click(); await idle(page); assert(JSON.stringify(await snapshot(page)) === JSON.stringify(original), '匯出失敗破壞資料'); }
  finally { await page.evaluate(() => { HTMLAnchorElement.prototype.click = window.originalClick; }); }
  await page.setViewportSize({width:390,height:844}); assert(await page.locator('#share-dialog').evaluate(d => d.scrollWidth <= d.clientWidth), '分享窄版溢出');
  await page.locator('#share-dialog').evaluate(d => { d.scrollTop = 0; }); await page.screenshot({path:'output/share18/share-preview.png'}); await page.keyboard.press('Escape'); await open();
  assert(await page.locator('#share-fields input:checked').count() === 0 && await page.locator('#share-download').isDisabled(), '重新開啟沿用私密選項'); await page.keyboard.press('Escape');
  assert(JSON.stringify(await snapshot(page)) === JSON.stringify(original), '分享修改來源資料');
  const context = await page.context().browser().newContext({acceptDownloads:true}); await context.addInitScript(init); const receiver = await context.newPage(); watch(receiver);
  try {
    await receiver.goto(origin); await idle(receiver);
    // 接收者特意具有相同 library／ID；分享仍必須分開，不覆寫原筆記。
    const existing = structuredClone(minimal); existing.kind = 'backup'; existing.videos[0].title = '接收者原筆記'; existing.markers[0].note = '接收者保留正文';
    await restore(receiver, existing); await receiver.locator('#import-confirm').click(); await idle(receiver); const before = await snapshot(receiver);
    await restore(receiver, complete); assert(JSON.stringify(await snapshot(receiver)) === JSON.stringify(before) && (await receiver.locator('#import-title').textContent()).includes('重建 ID') && (await receiver.locator('#import-content').textContent()).includes('合成私密正文'), '匯入前未預覽或提早寫入');
    await receiver.keyboard.press('Escape'); assert(JSON.stringify(await snapshot(receiver)) === JSON.stringify(before), '匯入取消仍寫入');
    for (const mode of ['quota','cancel']) {
      await restore(receiver, complete);
      await receiver.evaluate(mode => { window.savedPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { if (this.name === 'metadata' && mode === 'quota') throw new DOMException('synthetic quota', 'QuotaExceededError'); const req = window.savedPut.apply(this, args); if (this.name === 'metadata' && mode === 'cancel') queueMicrotask(() => document.getElementById('import-cancel').click()); return req; }; }, mode);
      try { await receiver.locator('#import-confirm').click(); await idle(receiver); assert(JSON.stringify(await snapshot(receiver)) === JSON.stringify(before), mode + ' 沒有原子回滾'); }
      finally { await receiver.evaluate(() => { IDBObjectStore.prototype.put = window.savedPut; }); }
      if (await receiver.locator('#import-dialog').evaluate(d => d.open)) await receiver.locator('#import-cancel').click();
    }
    for (const bad of ['{', ' '.repeat(10*1024*1024+1), {...complete,schemaVersion:99}, {...complete,videos:[]}]) { await restore(receiver,bad); assert(JSON.stringify(await snapshot(receiver)) === JSON.stringify(before) && !await receiver.locator('#import-dialog').evaluate(d=>d.open), '壞 JSON／超限／孤兒部分匯入'); }
    await receiver.locator('#restore').setInputFiles('output/share18/complete.dance-stamp.json'); await idle(receiver); await receiver.locator('#import-confirm').click(); await idle(receiver); const imported = await snapshot(receiver);
    const video = imported.data.videos.find(v=>v.id !== ids.video), take = imported.data.takes[0], recipe = imported.data.recipes[0], marker = imported.data.markers.find(m=>m.videoId===video.id);
    assert(video.id !== ids.video && take.id !== ids.take && take.referenceVideoId === video.id && recipe.takeId === take.id && marker.id !== ids.marker && imported.data.videos[0].title === '接收者原筆記' && imported.data.markers[0].note === '接收者保留正文', '分享 ID／關聯或原資料錯誤');
    await restore(receiver,complete); await receiver.locator('#import-confirm').click(); await idle(receiver); assert(JSON.stringify(await snapshot(receiver)) === JSON.stringify(imported), '重匯不冪等');
    const conflict = structuredClone(complete); conflict.markers[0].title = '分享修訂片段';
    await restore(receiver,conflict); assert((await receiver.locator('#import-summary').textContent()).includes('內容衝突'), '未預覽衝突'); await receiver.locator('#import-confirm').click(); await idle(receiver); const copied = await snapshot(receiver);
    assert(copied.data.markers.length === imported.data.markers.length+1 && copied.data.markers.some(m=>m.id===marker.id && m.title==='合成八拍'), '衝突未另存');
    await restore(receiver,conflict); await receiver.locator('#import-confirm').click(); await idle(receiver); assert(JSON.stringify(await snapshot(receiver)) === JSON.stringify(copied), '衝突重匯不冪等');
    const row = id => receiver.locator(`#media-items li[data-asset-id="${id}"]`), reference = copied.data.assets.find(a=>a.kind==='reference' && a.videoId===video.id), self = copied.data.assets.find(a=>a.id===take.cameraAssetId), vs = copied.data.assets.find(a=>a.kind==='vs');
    assert(await receiver.evaluate(async()=> (await (await import('/storage.js')).readMediaKeys()).length===0), 'JSON 夾帶媒體');
    await row(reference.id).getByRole('button',{name:'選片並預覽重連',exact:true}).click(); await idle(receiver);
    await receiver.locator('#relink-file').setInputFiles('output/share18/different/reference.mp4'); await idle(receiver);
    assert(await receiver.locator('#relink-confirm').isDisabled() && JSON.stringify(await snapshot(receiver))===JSON.stringify(copied), '同名不同片自動連結');
    await receiver.locator('#relink-file').setInputFiles('output/share18/cut/reference.mp4'); await idle(receiver); await receiver.locator('#relink-checked').check();
    assert(await receiver.locator('#relink-confirm').isDisabled(), '同名裁切片未涵蓋 B 仍可連結');
    await receiver.locator('#relink-file').setInputFiles('output/share18/vs.mp4'); await idle(receiver);
    assert(await receiver.locator('#relink-confirm').isDisabled() && (await receiver.locator('#relink-file-label').textContent()).includes('請勿用 VS'), '誤選 VS 自動連結');
    await receiver.locator('#relink-checked').check(); assert(await receiver.locator('#relink-confirm').isDisabled(), '不足 B 的 VS 被當成示範');
    await receiver.locator('#relink-file').setInputFiles({name:'reference.mp4',mimeType:'video/mp4',buffer:Buffer.from('invalid synthetic media')}); await idle(receiver); assert(await receiver.locator('#relink-confirm').isDisabled(), '壞檔仍可確認');
    await receiver.keyboard.press('Escape'); assert(JSON.stringify(await snapshot(receiver))===JSON.stringify(copied), '重連取消改動資料');
    for (const [asset,path] of [[reference,'output/export-failure/reference.mp4'],[self,'output/export-failure/self.mp4'],[vs,'output/share18/vs.mp4']]) {
      await row(asset.id).getByRole('button',{name:'選片並預覽重連',exact:true}).click(); await idle(receiver); await receiver.locator('#relink-file').setInputFiles(path); await idle(receiver);
      assert(await receiver.locator('#relink-confirm').isDisabled() && !await receiver.locator('#relink-save').isChecked(), '未確認便連結／預設落盤');
      await receiver.locator('#relink-checked').check(); await receiver.locator('#relink-confirm').click(); await idle(receiver);
      assert(await row(asset.id).getAttribute('data-availability')==='session','逐側連結失敗');
    }
    await receiver.locator('#library').selectOption(video.id); await receiver.locator('#open-library').click(); await idle(receiver);
    await receiver.locator('#markers').getByRole('button',{name:'跳到這裡',exact:true}).first().click(); await idle(receiver);
    assert(await receiver.locator('#reference').evaluate(v=>Math.abs(v.currentTime-1)<.05), '未跳到分享片段');
    await receiver.getByRole('button',{name:'開啟自拍／恢復',exact:true}).click(); await idle(receiver);
    await receiver.locator('#scrub').fill('1'); await receiver.locator('#scrub').dispatchEvent('change'); await idle(receiver);
    assert(await receiver.evaluate(()=>Math.abs(document.getElementById('reference').currentTime-2)<.05 && Math.abs(document.getElementById('self').currentTime-1.5)<.05),'重連後時間映射錯誤');
    assert(!await receiver.evaluate(()=>window.shareXss || document.querySelector('#markers img')), '筆記執行 HTML');
    const backupDownload=receiver.waitForEvent('download'); await receiver.locator('#backup').click(); await (await backupDownload).saveAs('output/share18/receiver-backup.dance-stamp.json'); await idle(receiver);
    const recoveredContext = await page.context().browser().newContext(); await recoveredContext.addInitScript(init);
    try {
      const recovered = await recoveredContext.newPage(); watch(recovered); await recovered.goto(origin); await idle(recovered);
      await recovered.locator('#restore').setInputFiles('output/share18/receiver-backup.dance-stamp.json'); await idle(recovered); await recovered.locator('#import-confirm').click(); await idle(recovered);
      const recoveredBefore = await snapshot(recovered); await restore(recovered,complete); await recovered.locator('#import-confirm').click(); await idle(recovered);
      assert(JSON.stringify(await snapshot(recovered))===JSON.stringify(recoveredBefore), '完整備份恢復後重匯分享不冪等');
      assert(recoveredBefore.data.videos.find(v=>v.id===video.id).teacher==='合成老師' && recoveredBefore.data.markers.find(m=>m.id===marker.id).note===marker.note, '備份恢復遺失明確分享欄位');
    } finally { await recoveredContext.close(); }
    // 實際第二分頁寫入後，第一頁的匯入預覽必須因 revision 拒絕。
    const changed = structuredClone(complete); changed.markers[0].title='另一份分享版本'; await restore(receiver,changed);
    const other=await context.newPage(); await other.goto(origin); await idle(other); await other.evaluate(async()=>{const s=await import('/storage.js'), d=await s.readLibrary(); d.data.videos[0].title='另一分頁原資料'; await s.writeLibrary(d.data,d.revision);}); await other.close();
    const tabState=await snapshot(receiver); await receiver.locator('#import-confirm').click(); await idle(receiver); assert(JSON.stringify(await snapshot(receiver))===JSON.stringify(tabState) && (await receiver.locator('#status').textContent()).includes('另一分頁'), '跨分頁覆寫'); await receiver.locator('#import-cancel').click();
    assert(outside.length===0 && errors.length===0, '外部請求或頁面錯誤');
    return {senderPrivacyDefaults:true,explicitFieldsAndSubsetClosure:true,previewMatchesDownload:true,optionalShareMockOnly:true,exportFailurePreservesSource:true,keyboardAndNarrowModal:true,isolatedReceiverSameMachine:true,idsRemappedAndExistingPreserved:true,reimportAndConflictIdempotent:true,quotaAndCancelAtomic:true,invalidAndOversizeRejected:true,manualThreeSideRelink:true,sameNameDifferentAndCutRequireConfirmation:true,wrongVsAndBrokenRejected:true,backupRestoreAndReimport:true,jumpAndComparisonMapping:true,actualTabConflictProtected:true,outsideRequests:outside,pageErrors:errors};
  } finally { await context.close(); }
}
