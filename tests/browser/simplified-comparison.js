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
  for (const selector of ['#reference-seek', '#self-seek', '.segment-settings', '#compare', '#save-result', '#play', '#overlay-play', '#overlay-opacity']) assert(!await page.locator(selector).isVisible(), '未選雙片就顯示後續工具');
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
  for (const selector of ['#reference-seek', '#self-seek', '.segment-settings', '#compare', '#save-result', '#play', '#overlay-play', '#overlay-opacity']) assert(await page.locator(selector).isVisible(), '雙片就緒後沒有開放比較');
  // 簡化選片不能蓋掉較新主線明確開放的身體對齊控制。
  assert(await page.locator('#overlay-layout').isVisible() && await page.locator('#overlay-reference-scale').isEnabled(), '整合後疊影大小位置控制消失');
  for (const [id, value] of [['start', '0.2'], ['end', '6.2']]) {
    // 真正失焦才提交欄位；手送 change 再失焦會多存一次，把隨後的定位蓋回起點。
    await page.locator('#' + id).fill(value); await page.locator('#' + id).press('Tab'); await idle();
  }
  assert(!await page.locator('#offset').isVisible(), '預設頁仍重複顯示練習影片起點欄位');
  // 從使用者保留的定位尺設定起點，不能靠修改已隱藏的欄位讓測試通過。
  await page.locator('#self-seek').fill('0.1'); await page.locator('#self-seek').dispatchEvent('input');
  await page.waitForFunction(() => !document.getElementById('self').seeking && Math.abs(document.getElementById('self').currentTime - 0.1) < 0.02).catch(async error => {
    throw new Error(`定位尺沒有到達起點：${JSON.stringify(await page.evaluate(() => ({ time: document.getElementById('self').currentTime, seeking: document.getElementById('self').seeking, slider: document.getElementById('self-seek').value, disabled: document.getElementById('self-seek').disabled, status: document.getElementById('status').textContent, busy: document.getElementById('compare').getAttribute('aria-busy') })))}；${error}`);
  });
  await page.locator('#self-start').click(); await idle();
  assert((await page.locator('#self-chosen-start').textContent()).includes('0.100'), '定位尺未保留起點設定');
  const read = () => page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data));
  const beforePreview = await read();
  await page.locator('#play').click(); await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden);
  assert((await page.locator('#status').textContent()).includes('左右比較') && await page.locator('#play').isEnabled() && await page.locator('#play').textContent() === '暫停左右比較' && await page.locator('#overlay-play').isDisabled(), '左右預覽不能原地暫停或仍能啟動另一輪');
  assert(await page.locator('#stop').isVisible(), '預覽時無法停止');
  await page.locator('#stop').focus(); await page.keyboard.press('Enter'); await idle();
  assert(!await page.locator('#stop').isVisible() && await page.evaluate(() => document.activeElement.id === 'play'), '停止後未收起或鍵盤焦點遺失');
  assert(await read() === beforePreview, '停止預覽改動資料');
  assert(!(await page.locator('#status').textContent()).includes('正在保留已錄到'), '仍顯示錄影中的誤導訊息');
  // 新入口也要真正走到播放與共用暫停，不能只驗 HTML 有第二顆按鈕。
  await page.locator('#overlay-play').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden);
  assert((await page.locator('#status').textContent()).includes('疊影比較') && await page.locator('#play').isDisabled() && await page.locator('#overlay-play').isEnabled() && await page.locator('#overlay-play').textContent() === '暫停疊影比較', '疊影預覽不能原地暫停或仍能啟動另一輪');
  await page.locator('#pause-comparison').click(); await idle();
  assert(await page.evaluate(() => document.activeElement.id === 'overlay-play') && await page.locator('#play').isEnabled() && await page.locator('#overlay-play').isEnabled(), '暫停後未還原兩區入口或鍵盤焦點');
  assert(await read() === beforePreview, '切換比較入口改動資料');
  // 同一顆按鈕連續暫停／續播，要驗兩側真正的媒體時間，不能只看標籤恢復可點。
  const resumed = [];
  for (const id of ['play', 'overlay-play']) {
    await page.locator('#scrub').fill('1'); await page.locator('#scrub').dispatchEvent('change'); await idle();
    for (let cycle = 0; cycle < 3; cycle++) {
      const before = await page.locator('#scrub').inputValue();
      const started = page.waitForFunction(() => !document.getElementById('reference').paused && !document.getElementById('self').paused);
      await page.locator('#' + id).focus(); await page.keyboard.press('Enter'); await started;
      const times = await page.evaluate(() => [document.getElementById('reference').currentTime, document.getElementById('self').currentTime]);
      assert(Math.abs(times[0] - (0.2 + Number(before))) < 0.3 && Math.abs(times[1] - (0.1 + Number(before))) < 0.3, '續播回到起點或兩側映射錯誤');
      await page.waitForFunction(before => Number(document.getElementById('scrub').value) > Number(before) + 0.2, before);
      await page.locator('#' + id).click(); await idle();
      const paused = await page.locator('#scrub').inputValue();
      assert(await page.evaluate(() => document.getElementById('reference').paused && document.getElementById('self').paused), '原地暫停未停止兩片');
      assert((await page.locator('#' + id).textContent()).startsWith('繼續') && await page.locator('#' + id).isEnabled(), '暫停後沒有恢復續播入口');
      await page.waitForTimeout(150);
      assert(await page.locator('#scrub').inputValue() === paused, '暫停後時間線仍前進');
      resumed.push({ id, cycle, before: Number(before), paused: Number(paused), times });
    }
  }
  await page.locator('#scrub').fill('5.5'); await page.locator('#scrub').dispatchEvent('change'); await idle();
  await page.locator('#play').click(); await idle();
  assert(await page.locator('#play').isEnabled() && await page.locator('#play').textContent() === '播放左右比較', '播完後無法重播');
  await page.locator('#play').click();
  await page.waitForFunction(() => !document.getElementById('reference').paused && document.getElementById('reference').currentTime < 0.8);
  await page.locator('#play').click(); await idle();
  assert(await read() === beforePreview, '反覆續播改動原配方或資料');
  await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('controls').disabled);
  assert(await page.locator('#stop').isVisible(), '合成時無法取消');
  assert(await page.locator('#play').isDisabled() && await page.locator('#overlay-play').isDisabled(), '合成期間仍能啟動比較');
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
  // 超過舊 60 秒的原片應可直接配對；五分鐘邊界另由純邏輯回歸驗證。
  await choose('reference-file', 'output/comparison/reference.mp4');
  assert(Number(await page.locator('#end').inputValue()) === 80, '長片被偷偷裁短，沒有保留完整範圍預設');
  await choose('self-file', 'output/comparison/self-1.mp4');
  assert(await page.locator('#compare').isVisible() && !await page.locator('#play').isDisabled(), '80 秒原片仍被舊比較上限拒絕');
  assert(await page.locator('.segment-settings').isVisible() && await page.locator('#end').isVisible(), '長片沒有可見的片段設定入口');
  await page.locator('#end').fill('15'); await page.locator('#end').dispatchEvent('change'); await idle();
  await choose('self-file', 'output/comparison/self-1.mp4');
  assert(await page.locator('#compare').isVisible() && !await page.locator('#play').isDisabled() && (await page.locator('#self-selection').getAttribute('data-source')) !== null, '縮短後無法從真正預設頁建立長片比較');
  assert(await page.evaluate(() => window.simplifiedCaptureCalls) === 0, '雙片比較嘗試擷取相機／麥克風／畫面');
  return { interface: 'comparison-only-default', keyboardChooser: true, deferredToolsHidden: true, stopOnlyWhileWorking: true, stopRestoresVisibleFocus: true, singleStartControl: true, pauseResume: resumed, naturalEndReplays: true, cancelledAndCorruptKeepDataAndOutput: true, actualDownload: { filename, ...downloadInfo }, rescueVisibilityOnly: true, longVideoCanShortenAndRetry: true, captureCalls: 0, sizes };
}
