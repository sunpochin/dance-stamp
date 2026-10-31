/* 檔案用途：實際選取兩支不同尺寸的合成影片，驗證左右來源與練習入口。所在層：隔離瀏覽器回歸。主要關聯：index.html、main.js、video-picker.js。 */
async controller => {
  const context = await controller.context().browser().newContext({ acceptDownloads: true });
  const page = await context.newPage(), assert = (ok, message) => { if (!ok) throw new Error(message); };
  try {
    await page.addInitScript(() => {
      window.confirm = () => true;
      // 選已有影片不應借道相機；完全移除能力，讓誤觸錄影立即失敗。
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    });
    await page.goto(new URL(controller.url()).origin);
    const idle = () => page.waitForFunction(() => document.getElementById('storage-status').textContent !== '正在開啟本機筆記…' && document.getElementById('library-panel').getAttribute('aria-busy') !== 'true');
    await idle();
    const choose = async (id, file, keyboard = false) => {
      const picker = page.locator(id === 'reference-file' ? '#reference-picker' : '#self-picker');
      if (!await picker.evaluate(details => details.open)) { await picker.locator('summary').focus(); await page.keyboard.press('Enter'); }
      const input = page.locator(id === 'reference-file' ? '#select-video' : '#select-self-video'), waiting = page.waitForEvent('filechooser');
      if (keyboard) { await input.focus(); await page.keyboard.press('Enter'); } else await input.click();
      const chooser = await waiting;
      assert(await chooser.element().getAttribute('id') === id, '選片進到另一側或 JSON');
      await chooser.setFiles(file); await idle();
    };
    assert(await page.locator('#select-self-video').isDisabled(), '沒有老師影片就能建立無主的練習');
    assert(!await page.locator('#camera').isVisible() && !await page.locator('#backup').isVisible(), '相機與管理工具干擾初次選片');
    assert(await page.locator('#controls input[type=file]').count() === 2 && await page.locator('.video-card button.primary').count() === 2, '仍有多個入口指向老師影片');
    await choose('reference-file', 'output/comparison/reference.mp4');
    // 此案例驗兩側選片，先明確選合法短段，避免長片護欄攔下右側來源。
    await page.locator('#end').fill('15');
    assert(!await page.locator('#reference-picker').evaluate(details => details.open), '示範影片載入後未收合');
    const left = await page.locator('#reference').getAttribute('src');
    await choose('self-file', 'output/media-probe/player/portrait.mp4', true);
    const dimensions = await page.evaluate(() => ['reference', 'self'].map(id => {
      const video = document.getElementById(id); return [video.videoWidth, video.videoHeight, video.duration];
    }));
    assert(dimensions[0][0] === 320 && dimensions[0][1] === 180 && dimensions[1][0] === 180 && dimensions[1][1] === 320, '兩個選片未載入各自播放器');
    assert(await page.locator('#reference').getAttribute('src') === left, '選右片換掉了左片');
    assert(!await page.locator('#self-picker').evaluate(details => details.open), '練習影片載入後未收合');
    assert(await page.locator('#self-selection').textContent() === 'portrait.mp4', '收合摘要未顯示選取的檔名');
    assert(await page.locator('#self-picker > summary').evaluate(summary => summary === document.activeElement), '鍵盤選片後焦點留在隱藏按鈕');
    // 尺寸與 loadeddata 不足以證明看得見；未按播放前，直接讀兩側影片的實際非黑影格。
    for (const id of ['reference', 'self']) {
      assert(await page.locator('#' + id).isVisible(), id + ' 播放器被一起收起');
      const frame = await page.locator('#' + id).evaluate(video => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d'); context.drawImage(video, 0, 0, 32, 32);
        const pixels = context.getImageData(0, 0, 32, 32).data;
        return { paused: video.paused, start: video.currentTime, visiblePixels: Array.from(pixels).some((value, i) => i % 4 !== 3 && value > 50) };
      });
      assert(frame.paused && frame.start === 0 && frame.visiblePixels, id + ' 選完必須直接顯示第一格，不需先按播放');
    }
    const read = () => page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data));
    const before = await read(), right = await page.locator('#self').getAttribute('src');
    assert(JSON.parse(before).videos.length === 1 && JSON.parse(before).takes.length === 1, '右片誤建另一份老師筆記');
    // 兩側都保留最後成功的來源與完整資料，不能只驗證狀態文字說「保留」。
    for (const id of ['reference-file', 'self-file']) for (const file of [[], 'output/media-probe/player/corrupt.mp4']) {
      await choose(id, file);
      assert(await read() === before, id + ' 取消或壞檔改掉資料');
      assert(await page.locator(id === 'reference-file' ? '#reference-picker' : '#self-picker').evaluate(details => details.open), '失敗或取消後選片區被收起');
      assert(await page.locator('#self-selection').textContent() === 'portrait.mp4', '失敗或取消後摘要丟失原檔名');
      assert(await page.locator('#reference').getAttribute('src') === left && await page.locator('#self').getAttribute('src') === right, id + ' 取消或壞檔改掉來源');
    }
    for (const id of ['reference', 'self']) {
      await page.locator('#' + id).evaluate(async video => { video.muted = true; await video.play(); });
      await page.waitForFunction(id => document.getElementById(id).currentTime > .1, id);
      await page.locator('#' + id).evaluate(video => { video.pause(); });
    }
    const order = await page.evaluate(() => ['controls', 'compare', 'save-result', 'practice', 'library-panel', 'offline-panel'].map(id => document.getElementById(id).getBoundingClientRect().top));
    assert(order.every((top, i) => !i || top > order[i - 1]), '管理資訊仍擋在主要練習流程前');
    await page.locator('#camera-tools > summary').focus(); await page.keyboard.press('Enter');
    assert(await page.locator('#camera').isVisible(), '鍵盤無法找到選用錄影');
    await page.keyboard.press('Enter');
    const sizes = [];
    for (const width of [320, 390, 768, 1280]) for (const scale of [100, 200]) {
      await page.setViewportSize({ width, height: 960 });
      await page.evaluate(scale => { document.documentElement.style.fontSize = scale + '%'; }, scale);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '窄版或文字放大超出頁面');
      sizes.push({ width, scale });
    }
    await page.locator('#self-file').setInputFiles('output/media-probe/player/portrait.mp4'); await idle();
    await page.locator('#reference-picker > summary').focus(); await page.keyboard.press('Enter');
    await page.evaluate(() => { document.documentElement.style.fontSize = '100%'; });
    await page.setViewportSize({ width: 1280, height: 1000 }); await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(150);
    await page.screenshot({ path: 'output/playwright/video-roles-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#controls').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/playwright/video-roles-mobile.png' });
    return { dimensions, sourcePerSide: true, firstFramesVisibleBeforePlay: true, selectionCollapsesOnSuccessOnly: true, selectedFilenamePreserved: true, cancelledAndCorruptPreserveBothSourcesAndData: true, noCameraApi: true, keyboardPickersAndRecordingDisclosure: true, sizes };
  } finally { await context.close(); }
}
