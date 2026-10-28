/* 檔案用途：重現壞檔／取消恢復後舊原片與校正仍須成對保存。所在層：合成瀏覽器回歸。主要關聯：main.js、capture.js。 */
async (page) => {
  const origin = new URL(page.url()).origin, checks = {};
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const fields = () => page.evaluate(() => ['start', 'end', 'rate', 'offset', 'reference-mirror', 'self-mirror'].map(id => {
    const el = document.getElementById(id); return el.type === 'checkbox' ? el.checked : el.value;
  }));
  const change = async (id, value) => { await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); await idle(); };
  await page.addInitScript(() => { window.confirm = () => true; navigator.mediaDevices.getUserMedia = async () => { throw new Error('此回歸禁止相機'); }; });
  await page.goto(origin); await idle();
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#copy-reference').click(); await idle();
  const videoId = await page.locator('#library').inputValue();
  await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await change('end', '2'); await change('offset', '0.25');
  await page.locator('#reference-mirror').check(); await idle();
  const before = await library(), original = before.takes.at(-1), originalRecipe = before.recipes.find(r => r.takeId === original.id);
  await page.locator('#copy-self').click(); await idle();
  await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await change('start', '10'); await change('end', '14'); await change('offset', '1');
  await page.locator('#reference-mirror').uncheck(); await idle();
  await page.locator('#copy-self').click(); await idle();
  const seeded = await library(), target = seeded.takes.at(-1);
  // 重新開頁清掉當次 File，確保本例真的讀取已保存媒體，而非繞過壞檔的 session 快取。
  await page.reload(); await idle();
  await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
  const takes = seeded.takes.filter(t => t.referenceVideoId === videoId);
  const open = async take => { await page.getByRole('button', { name: '開啟自拍／恢復', exact: true }).nth(takes.findIndex(t => t.id === take.id)).click(); };
  await open(original); await idle();
  const previous = await fields(), source = await page.locator('#self').getAttribute('src'), download = await page.locator('#take-download').getAttribute('href');
  const media = async mode => page.evaluate(async ({ id, mode }) => {
    const store = await import('/storage.js');
    if (mode === 'corrupt') window.recoveryOriginalBlob = await store.readMedia(id);
    const db = await store.openStore(), tx = db.transaction('media', 'readwrite');
    const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
    const media = tx.objectStore('media');
    if (mode === 'delete') media.delete(id);
    else media.put(mode === 'restore' ? window.recoveryOriginalBlob : new Blob(['synthetic undecodable'], { type: 'video/mp4' }), id);
    await done;
  }, { id: target.cameraAssetId, mode });
  const unchanged = async label => {
    assert(JSON.stringify(await fields()) === JSON.stringify(previous), label + ' 混入另一段的校正設定');
    assert(await page.locator('#self').getAttribute('src') === source, label + ' 沒有恢復舊播放器');
    assert(await page.locator('#take-download').getAttribute('href') === download, label + ' 換掉舊原片下載');
    assert(await page.locator('#export').isEnabled(), label + ' 不能繼續原比較');
    const after = await library();
    assert(JSON.stringify(after.recipes.find(r => r.id === originalRecipe.id)) === JSON.stringify(originalRecipe), label + ' 改寫舊校正');
  };
  await media('corrupt'); await open(target); await idle();
  assert((await page.locator('#status').textContent()).includes('原片仍保留，可重試'), '未真正觸發壞檔');
  await unchanged('壞檔'); checks.corruptPreservesPairAndRecipe = true;
  await media('restore');
  await page.locator('#self').evaluate(video => video.addEventListener('loadeddata', e => {
    e.stopImmediatePropagation(); window.takeLoadDelayed = true;
  }, { once: true, capture: true }));
  await open(target); await page.waitForFunction(() => window.takeLoadDelayed);
  await page.locator('#stop').click(); await idle();
  await unchanged('取消'); checks.cancelPreservesPairAndRecipe = true;
  await media('delete'); await open(target); await idle();
  assert(await page.locator('#export').isDisabled(), '缺片未等待人工重連');
  await open(original); await idle();
  assert(await page.locator('#export').isEnabled() && await page.locator('#confirm-take').isHidden(), '成功開啟舊片仍被前一個缺片狀態鎖住');
  checks.successClearsPreviousPendingLink = true;
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '恢復後無法輸出原比較');
  const after = await library(), info = JSON.parse(await page.locator('#diagnostics').textContent()).export;
  assert(after.takes.length === seeded.takes.length && JSON.stringify(after.recipes.find(r => r.id === originalRecipe.id)) === JSON.stringify(originalRecipe), '重試輸出改寫或另建了錯誤配方');
  assert(info.recipe.startMs === 0 && info.recipe.endMs === 2000 && info.recipe.offsetMs === 250 && info.recipe.referenceMirror === true, '輸出未使用原校正');
  checks.exportUsesOriginalRecipe = info.recipe;
  return checks;
}
