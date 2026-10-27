/* 檔案用途：以合成資料驗證筆記、缺檔、備份、交易與離線。所在層：Web 瀏覽器回歸函式。主要關聯：library.js、storage.js、MEDIA_PROBE.md。 */
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await page.goto('http://127.0.0.1:4173/');
  await page.getByLabel('示範影片', { exact: true }).setInputFiles('output/media-probe/reference.mp4');
  await page.waitForFunction(() => !document.getElementById('practice').disabled);
  await page.locator('#reference').evaluate(async video => { video.currentTime = 2; await new Promise(r => video.addEventListener('seeked', r, { once: true })); });
  await page.getByRole('button', { name: '標記當下時間', exact: true }).click();
  await page.locator('#reference').evaluate(video => { video.currentTime = 4; });
  await page.getByLabel('標記標題', { exact: true }).fill('合成腳步');
  await page.getByLabel('筆記', { exact: true }).fill('<img src=x onerror=alert(1)> 純文字');
  await page.getByRole('button', { name: '儲存標記', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('markers').textContent.includes('合成腳步'));
  assert((await page.locator('#markers').textContent()).includes('2.00s'), '輸入筆記改變了標記時刻');
  assert(await page.locator('#markers img').count() === 0, '筆記被當成 HTML');
  const storedId = await page.locator('#library').inputValue();
  await page.reload();
  await page.waitForFunction(() => document.getElementById('library').options.length > 1);
  await page.getByRole('combobox', { name: '已保存的筆記', exact: true }).selectOption(storedId);
  await page.getByRole('button', { name: '開啟筆記／重連影片', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('尚未連結'));
  assert((await page.locator('#markers').textContent()).includes('合成腳步'), '缺檔時筆記消失');
  await page.getByLabel('示範影片', { exact: true }).setInputFiles('output/media-probe/reference.mp4');
  await page.getByRole('button', { name: '已預覽，確認連結到這份筆記', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('practice').disabled);
  await page.getByRole('button', { name: '保存示範副本到此瀏覽器', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已保存本機示範'));
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載筆記備份', exact: true }).click();
  const download = await saved; await download.saveAs('output/media-probe/notes.dance-stamp.json');
  const transactions = await page.evaluate(async () => {
    const { readLibrary, writeLibrary } = await import('/storage.js');
    const before = await readLibrary();
    await writeLibrary(before.data, before.revision);
    let conflict = false;
    try { await writeLibrary(before.data, before.revision); } catch { conflict = true; }
    const after = await readLibrary();
    return { conflict, preserved: after.data.markers.length === before.data.markers.length, revision: after.revision };
  });
  assert(transactions.conflict && transactions.preserved, '舊 revision 覆蓋資料');
  const rollback = await page.evaluate(async () => {
    const { readLibrary, writeLibrary } = await import('/storage.js');
    const before = await readLibrary(), original = IDBObjectStore.prototype.put;
    let rejected = false;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'media') throw new DOMException('synthetic quota', 'QuotaExceededError');
      return original.apply(this, args);
    };
    try { await writeLibrary({ ...before.data, exportedAt: '2026-10-01T00:00:00Z' }, before.revision, { id: 'synthetic-only', blob: new Blob(['synthetic']) }); }
    catch { rejected = true; }
    finally { IDBObjectStore.prototype.put = original; }
    const after = await readLibrary();
    return rejected && after.revision === before.revision && after.data.exportedAt === before.data.exportedAt;
  });
  assert(rollback, '媒體 quota 失敗卻部分寫入筆記');
  await page.reload();
  await page.waitForFunction(() => document.getElementById('library').options.length > 1);
  await page.getByRole('combobox', { name: '已保存的筆記', exact: true }).selectOption(storedId);
  await page.getByRole('button', { name: '開啟筆記／重連影片', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已開啟此瀏覽器'));
  assert(await page.locator('#reference').evaluate(video => video.videoWidth > 0), '副本重開未解碼');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.context().setOffline(true);
  try {
    await page.reload();
    await page.waitForFunction(() => document.getElementById('library').options.length > 1);
  } finally { await page.context().setOffline(false); }
  return { timestampCapturedBeforeTyping: true, textIsNotHTML: true, notesSurviveMissingMedia: true, explicitRelink: true, savedMediaReopens: true, transactionConflictRejected: transactions.conflict, simulatedQuotaRollsBack: rollback, offlineReload: true };
}
