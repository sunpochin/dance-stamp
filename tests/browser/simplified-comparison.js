/* 檔案用途：驗證預設雙片簡化介面與真實 VS 下載。所在層：隔離瀏覽器回歸。主要關聯：index.html、main.js、run-app.ts。 */
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await page.addInitScript(() => {
    window.confirm = () => true; window.simplifiedCaptureCalls = 0;
    // 當前流程不開硬體；任何擷取嘗試都要失敗並留下計數，不能用假相機掩蓋誤觸。
    for (const key of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices) navigator.mediaDevices[key] = () => { window.simplifiedCaptureCalls++; throw new Error('雙片比較不可擷取硬體'); };
  });
  await page.goto(origin); await idle();
  assert(await page.locator('body').getAttribute('data-comparison-only') !== null, '沒有測到真正預設簡化介面');
  const deferred = page.locator('[data-deferred]');
  for (const element of await deferred.all()) assert(!await element.isVisible(), '暫藏工具仍出現在預設頁面');
  assert(!await page.locator('#stop').isVisible(), '閒置停止鍵仍顯示');
  for (const selector of ['#reference-seek', '#self-seek', '.segment-settings', '#compare', '#save-result', '#overlay-opacity']) assert(!await page.locator(selector).isVisible(), '未選雙片就顯示後續工具');
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => !document.activeElement.closest('[data-deferred]')), '鍵盤進入暫藏工具');
  }
  const choose = async (id, files, keyboard = false) => {
    const picker = page.locator(id === 'reference-file' ? '#reference-picker' : '#self-picker');
    if (!await picker.evaluate(element => element.open)) await picker.locator('summary').click();
    const button = page.locator(id === 'reference-file' ? '#select-video' : '#select-self-video');
    const waiting = page.waitForEvent('filechooser');
    if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
    const chooser = await waiting;
    assert(await chooser.element().getAttribute('id') === id, '選片跑到錯誤的一側');
    await chooser.setFiles(files); await idle();
  };
  await choose('reference-file', 'output/export-failure/reference.mp4', true);
  // 單片保存失敗也需要原片救援；此處只驗顯示，真正交易故障由既有回歸涵蓋。
  await page.locator('#storage-recovery').evaluate(element => { element.hidden = false; });
  assert(await page.locator('#reference-download').isVisible(), '尚缺右片時藏掉救援下載');
  await page.locator('#storage-recovery').evaluate(element => { element.hidden = true; });
  await choose('self-file', 'output/export-failure/self.mp4');
  for (const selector of ['#reference-seek', '#self-seek', '.segment-settings', '#compare', '#save-result', '#overlay-opacity']) assert(await page.locator(selector).isVisible(), '雙片就緒後沒有開放比較');
  // 簡化選片不能蓋掉較新主線明確開放的身體對齊控制。
  assert(await page.locator('#overlay-layout').isVisible() && await page.locator('#overlay-reference-scale').isEnabled(), '整合後疊影大小位置控制消失');
  for (const [id, value] of [['start', '0.2'], ['end', '2.2'], ['offset', '0.1']]) {
    await page.locator('#' + id).fill(value); await page.locator('#' + id).dispatchEvent('change'); await idle();
  }
  const read = () => page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data));
  const beforePreview = await read();
  await page.locator('#play').click(); await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden);
  assert(await page.locator('#stop').isVisible(), '預覽時無法停止');
  await page.locator('#stop').focus(); await page.keyboard.press('Enter'); await idle();
  assert(!await page.locator('#stop').isVisible() && await page.evaluate(() => document.activeElement.id === 'play'), '停止後未收起或鍵盤焦點遺失');
  assert(await read() === beforePreview, '停止預覽改動資料');
  assert(!(await page.locator('#status').textContent()).includes('正在保留已錄到'), '仍顯示錄影中的誤導訊息');
  await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('controls').disabled);
  assert(await page.locator('#stop').isVisible(), '合成時無法取消');
  await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '簡化介面沒有真正成檔');
  const downloadInfo = await page.evaluate(async () => {
    // CSP 不允許 fetch(blob:)；從實際已提交的輸出讀回，再比對真正下載檔。
    const storage = await import('/storage.js'), state = await storage.readLibrary();
    const buffer = await (await storage.readMedia(state.data.exports.at(-1).assetId)).arrayBuffer();
    return { bytes: buffer.byteLength, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), value => value.toString(16).padStart(2, '0')).join('') };
  });
  const waiting = page.waitForEvent('download'); await page.locator('#output-download').click();
  const download = await waiting, filename = 'output/playwright/simplified-vs.' + download.suggestedFilename().split('.').pop();
  await download.saveAs(filename);
  const beforeFailure = await read(), urls = await page.evaluate(() => ['reference', 'self', 'output-download'].map(id => document.getElementById(id).getAttribute(id === 'output-download' ? 'href' : 'src')));
  for (const id of ['reference-file', 'self-file']) for (const files of [[], 'output/media-probe/player/corrupt.mp4']) {
    await choose(id, files);
    assert(await read() === beforeFailure, '取消或壞檔破壞既有資料');
    assert(await page.evaluate(() => ['reference', 'self', 'output-download'].map(id => document.getElementById(id).getAttribute(id === 'output-download' ? 'href' : 'src')).join()) === urls.join(), '取消或壞檔替換成功來源／輸出');
  }
  const sizes = [];
  for (const width of [320, 390, 1280]) for (const scale of [100, 200]) {
    await page.setViewportSize({ width, height: 960 }); await page.evaluate(scale => { document.documentElement.style.fontSize = scale + '%'; }, scale);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '窄版或放大文字超出畫面');
    assert(!await page.locator('#camera-tools').isVisible() && !await page.locator('#stop').isVisible(), '窄版重新顯示暫藏工具');
    sizes.push({ width, scale });
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '100%'; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#self').evaluate(video => video.play());
  await page.waitForFunction(() => document.getElementById('stop').hasAttribute('data-stoppable'));
  assert(await page.locator('#stop').isVisible(), '單側播放在窄版無法停止');
  await page.locator('#stop').click(); assert(!await page.locator('#stop').isVisible(), '單側停止後沒有收起');
  // 只驗救援區的顯示契約；真正未確認交易由原儲存回歸驗證，不把此 DOM 模擬冒充故障。
  await page.locator('#storage-recovery').evaluate(element => { element.hidden = false; });
  assert(await page.locator('#reference-download').isVisible() && await page.locator('#take-download').isVisible(), '簡化介面藏掉救援原片');
  assert(!await page.locator('#camera-tools').isVisible(), '救援時重新開放錄影');
  await page.locator('#storage-recovery').evaluate(element => { element.hidden = true; });
  await page.setViewportSize({ width: 1280, height: 960 }); await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/simplified-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/simplified-mobile.png' });
  assert(await page.evaluate(() => window.simplifiedCaptureCalls) === 0, '雙片比較嘗試擷取相機／麥克風／畫面');
  return { interface: 'comparison-only-default', keyboardChooser: true, deferredToolsHidden: true, stopOnlyWhileWorking: true, stopRestoresVisibleFocus: true, cancelledAndCorruptKeepDataAndOutput: true, actualDownload: { filename, ...downloadInfo }, rescueVisibilityOnly: true, captureCalls: 0, sizes };
}
