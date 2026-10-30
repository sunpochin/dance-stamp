/* 檔案用途：驗證刪除目前顯示的 VS、交易回滾及原片重新合成。所在層：合成瀏覽器回歸。主要關聯：main.js 的刪除控制、run-app.ts、issue #103。 */
async page => {
  const origin = new URL(page.url()).origin, errors = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__liveVsRevoked = []; window.__liveVsCaptureCalls = 0;
    const revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = function(url) { window.__liveVsRevoked.push(url); return revoke.call(this, url); };
    for (const key of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices?.[key]) navigator.mediaDevices[key] = async () => { window.__liveVsCaptureCalls++; throw new Error('VS 刪除只使用合成檔案'); };
  });
  const snapshot = () => page.evaluate(async () => {
    const store = await import('/storage.js'), library = await store.readLibrary(), media = [];
    for (const id of await store.readMediaKeys()) {
      const blob = await store.readMedia(id), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
      media.push({ id, size: blob.size, type: blob.type, hash });
    }
    return { library, media, sources: ['reference', 'self', 'output'].map(id => document.getElementById(id).getAttribute('src')), href: document.getElementById('output-download').getAttribute('href') };
  });
  const preview = async () => { await page.getByRole('button', { name: '刪除此 VS 輸出…', exact: true }).last().click(); await idle(); await page.locator('#delete-dialog').waitFor({ state: 'visible' }); };
  await page.goto(origin); await idle();
  await page.locator('#reference-file').setInputFiles('output/export-failure/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/export-failure/self.mp4'); await idle();
  await page.locator('#end').fill('3'); await page.locator('#end').dispatchEvent('change'); await idle();
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成 VS 刪除保全'); await page.locator('#marker-note').fill('取消或失敗時，完整筆記與原片必須保留');
  await page.locator('#marker-form button[type=submit]').click(); await idle();
  for (const id of ['copy-reference', 'copy-self', 'export']) { await page.locator('#' + id).click(); await idle(); }
  const before = await snapshot(), artifact = before.library.data.exports.at(-1);
  assert(artifact && before.media.length === 3 && before.href && await page.locator('#share').isEnabled(), '未真正保存三份影片或建立目前 VS');
  await preview(); await page.locator('#delete-cancel').click();
  assert(same(await snapshot(), before), '取消刪除改掉筆記、影片或目前 URL');
  // 用真正交易 abort 核對完整回滾；只改 QA 的 delete 呼叫，不偽造成功或改寫產品狀態。
  await page.evaluate(id => {
    window.__liveVsAbortCount = 0; window.__liveVsDelete = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function(...args) { const request = window.__liveVsDelete.apply(this, args); if (this.name === 'media' && args[0] === id) { window.__liveVsAbortCount++; this.transaction.abort(); } return request; };
  }, artifact.assetId);
  try { await preview(); await page.locator('#delete-confirm').click(); await idle(); }
  finally { await page.evaluate(() => { IDBObjectStore.prototype.delete = window.__liveVsDelete; }); }
  assert(await page.evaluate(() => window.__liveVsAbortCount === 1) && same(await snapshot(), before), '交易失敗部分刪除目前 VS 或既有資料');
  if (await page.locator('#delete-dialog').evaluate(d => d.open)) await page.locator('#delete-cancel').click();
  await preview(); await page.locator('#delete-confirm').click(); await idle();
  const removed = await snapshot(), data = removed.library.data, original = before.library.data;
  for (const key of Object.keys(original).filter(key => !['assets', 'exports'].includes(key))) assert(same(data[key], original[key]), '刪 VS 改掉 ' + key);
  assert(same(data.assets, original.assets.filter(a => a.id !== artifact.assetId)) && same(data.exports, original.exports.filter(e => e.id !== artifact.id)), '未只移除指定 VS 描述');
  assert(same(removed.media, before.media.filter(m => m.id !== artifact.assetId)) && same(removed.sources.slice(0, 2), before.sources.slice(0, 2)), '刪 VS 改掉原片完整指紋或播放來源');
  const inactive = { href: removed.href, source: removed.sources[2], outputHidden: await page.locator('#output').isHidden(), downloadHidden: await page.locator('#output-download').isHidden(), shareEnabled: await page.locator('#share').isEnabled() };
  assert(!inactive.source && inactive.outputHidden && inactive.downloadHidden && !inactive.shareEnabled, '刪除後仍可操作已刪 VS：' + JSON.stringify(inactive));
  assert(await page.evaluate(url => window.__liveVsRevoked.includes(url), before.href), '已刪 VS 的 URL 沒有真正撤銷');
  // 隱藏連結可保留舊 href，真正的保護是撤銷底層 URL；用原生導覽驗證，不為 QA 放寬 Blob fetch 的 CSP。
  const viewer = await page.context().newPage(); let revoked = false;
  try { await viewer.goto(before.href); } catch (error) { revoked = String(error).includes('ERR_FILE_NOT_FOUND'); } finally { await viewer.close(); }
  assert(revoked, '另一頁仍可載入已刪 VS 的舊 URL');
  // 獨立驗上方移除副本入口；預覽取消必須保留當次原片與筆記，再用它們重新合成。
  await page.locator('#remove-copy').click(); await idle(); await page.locator('#delete-dialog').waitFor({ state: 'visible' });
  assert((await page.locator('#delete-title').textContent()).startsWith('只移除此瀏覽器副本'), '上方移除副本指向錯誤刪除範圍');
  await page.locator('#delete-cancel').click(); assert(same(await snapshot(), removed), '副本預覽取消改掉保留資料');
  await page.locator('#export').click(); await idle(); const retry = await snapshot(), next = retry.library.data.exports.at(-1);
  assert(next && next.assetId !== artifact.assetId && await page.locator('#share').isEnabled(), '刪目前 VS 後無法用原片重新合成');
  for (const media of removed.media) assert(same(retry.media.find(m => m.id === media.id), media), '重新合成改掉原片 bytes');
  const waiting = page.waitForEvent('download'); await page.locator('#output-download').click(); const file = await waiting;
  const path = 'output/playwright/vs-live-delete-recreated.' + file.suggestedFilename().split('.').pop(); await file.saveAs(path);
  assert(errors.length === 0 && await page.evaluate(() => window.__liveVsCaptureCalls === 0), '頁面錯誤或誤觸硬體擷取');
  await page.locator('#save-result').screenshot({ path: 'output/playwright/vs-live-delete.png' });
  return { cancelAndNativeAbortPreserveMetadataAndFullMediaHashes: true, onlyCurrentVsRemoved: true, revokedUrlAndDisabledOutput: true, originalsAndNotesPreserved: true, copyRemovalPreviewScopedAndCancelable: true, freshVsRecreatedAndDownloaded: true, cameraMicrophoneAndScreenCaptureCalls: 0, pageErrors: errors, download: path };
}
