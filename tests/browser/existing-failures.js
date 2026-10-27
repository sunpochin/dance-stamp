/* 檔案用途：驗證雙片確認的 quota／取消交易及舊配對保護。所在層：合成資料恢復驗收。主要關聯：existing-comparison.js、storage.js。 */
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const origin = new URL(page.url()).origin, idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  await page.goto(origin);
  await page.locator('#compare-existing').click(); await idle();
  await page.locator('#pair-reference-file').setInputFiles('output/comparison-fixtures/teacher.mp4'); await idle();
  await page.locator('#pair-self-file').setInputFiles('output/comparison-fixtures/own-1.mp4'); await idle();
  await page.locator('#pair-reference-ok').check(); await page.locator('#pair-self-ok').check(); await page.locator('#pair-confirm').click(); await idle();
  const snapshot = () => page.evaluate(async () => ({ data: (await (await import('/storage.js')).readLibrary()).data, reference: document.getElementById('reference').src, self: document.getElementById('self').src }));
  const before = await snapshot();
  for (const failure of ['quota', 'cancel']) {
    await page.locator('#edit-pair').click(); await idle();
    await page.locator('#pair-b').fill('20'); await page.locator('#pair-reference-ok').check(); await page.locator('#pair-self-ok').check();
    await page.evaluate(failure => {
      const original = IDBObjectStore.prototype.put;
      window.restorePairWrite = () => { IDBObjectStore.prototype.put = original; };
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name !== 'metadata') return original.apply(this, args);
        if (failure === 'quota') throw new DOMException('synthetic quota', 'QuotaExceededError');
        const request = original.apply(this, args);
        // 原生 transaction 已開始時取消，必須回滾 metadata，而非只有關閉畫面。
        document.getElementById('pair-cancel').click(); return request;
      };
    }, failure);
    try { await page.locator('#pair-confirm').click(); await idle(); }
    finally { await page.evaluate(() => window.restorePairWrite()); }
    const after = await snapshot();
    assert(JSON.stringify(after) === JSON.stringify(before), `${failure} 留下半份新配對或破壞原 URL`);
    if (failure === 'quota') await page.locator('#pair-cancel').click();
  }
  await page.locator('#edit-pair').click(); await idle();
  await page.locator('#pair-c').fill('1000'); await page.locator('#pair-c').dispatchEvent('change');
  assert(await page.locator('#pair-confirm').isDisabled() && (await page.locator('#pair-summary').textContent()).includes('沒有可比較'), '空交集仍可確認');
  await page.locator('#pair-c').fill('-2'); await page.locator('#pair-c').dispatchEvent('change');
  assert((await page.locator('#pair-summary').textContent()).includes('縮短'), '負偏移沒有告知共同區間縮短');
  await page.locator('#pair-cancel').click();
  await page.locator('#compare-existing').click(); await idle();
  await page.locator('#pair-reference-file').setInputFiles('output/comparison-fixtures/teacher-silent.mp4'); await idle();
  assert((await page.locator('#pair-audio').textContent()).includes('無聲'), '老師無音軌沒有明示無聲');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.getElementById('pair-dialog').scrollWidth <= document.getElementById('pair-dialog').clientWidth && document.documentElement.scrollWidth <= innerWidth), '雙片對話框有水平溢出');
  await page.screenshot({ path: 'output/playwright/existing-pair-mobile.png' });
  await page.locator('#pair-cancel').click();
  await page.locator('#edit-pair').click(); await idle();
  await page.locator('#pair-b').fill('20'); await page.locator('#pair-reference-ok').check(); await page.locator('#pair-self-ok').check();
  const other = await page.context().newPage();
  try {
    await other.goto(origin);
    await other.evaluate(async () => { const store = await import('/storage.js'), saved = await store.readLibrary(); saved.data.videos[0].title = '另一分頁的合成更新'; await store.writeLibrary(saved.data, saved.revision); });
  } finally { await other.close(); }
  const winning = await snapshot();
  await page.locator('#pair-confirm').click(); await idle();
  assert(JSON.stringify(await snapshot()) === JSON.stringify(winning) && (await page.locator('#status').textContent()).includes('另一分頁'), '舊分頁確認覆寫另一分頁或破壞舊 URL');
  await page.locator('#pair-cancel').click();
  await page.locator('#compare-existing').click(); await idle();
  for (let n = 0; n < 12; n++) {
    await page.keyboard.press('Tab');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    // Tab 可暫時移到瀏覽器介面；只檢查頁面有焦點時，不得落到 modal 外的頁面控制。
    assert(await page.evaluate(() => document.getElementById('pair-dialog').matches(':modal') && (!document.hasFocus() || document.getElementById('pair-dialog').contains(document.activeElement))), '頁面鍵盤焦點離開原生 modal');
  }
  await page.locator('#pair-cancel').focus();
  await page.keyboard.press('Escape'); await idle();
  assert(!await page.locator('#pair-dialog').isVisible() && JSON.stringify(await snapshot()) === JSON.stringify(winning), 'Escape 沒有清理候選或改動舊配對');
  return { quotaRollsBackPair: true, cancellationAbortsNativeTransaction: true, crossTabConflictPreservesWinner: true, emptyIntersectionBlocked: true, negativeOffsetWarns: true, silentTeacherDisclosed: true, mobileDialogFits: true, keyboardPageFocusStaysInModalAndEscapePreservesPair: true };
}
