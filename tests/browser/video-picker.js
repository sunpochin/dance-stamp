/* 檔案用途：驗證影片庫選片與 JSON 匯入分流，並實際解碼 MOV／MP4。所在層：隔離瀏覽器回歸。主要關聯：index.html、main.js、make-player-fixtures.ts。 */
async (controller) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  // 專用 context 讓「零份筆記」可重跑，也不清除使用者或其他測試的資料。
  const context = await controller.context().browser().newContext({ acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.goto(new URL(controller.url()).origin);
    const idle = () => page.waitForFunction(() => document.getElementById('storage-status').textContent !== '正在開啟本機筆記…' && document.getElementById('library-panel').getAttribute('aria-busy') !== 'true');
    await idle();
    const library = () => page.evaluate(async () => JSON.stringify((await (await import('/storage.js')).readLibrary()).data));
    // 以使用者指定的完整文案找入口，避免選片按鈕又被加回儲存位置限制。
    const button = page.getByRole('button', { name: '選擇影片（MOV／MP4 等）', exact: true });
    assert(await page.locator('#library option').count() === 1, '測試必須從空筆記庫開始');
    assert(await button.isVisible() && !await page.locator('#backup').isVisible() && !await page.locator('#restore').isVisible(), '開始練習時未區分選片與次要筆記工具');
    const select = async (file, keyboard = false) => {
      if (!await page.locator('#reference-picker').evaluate(details => details.open)) await page.locator('#reference-picker > summary').click();
      const waiting = page.waitForEvent('filechooser');
      if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
      const chooser = await waiting;
      assert(await chooser.element().getAttribute('id') === 'reference-file', '影片庫開啟了 JSON 或另一份選片流程');
      await chooser.setFiles(file); await idle();
    };
    for (const id of ['reference-file', 'self-file', 'relink-file']) {
      const accept = (await page.locator('#' + id).getAttribute('accept')).split(',');
      for (const type of ['.mov', '.mp4', '.m4v', '.webm', '.mkv', 'video/*']) assert(accept.includes(type), id + ' 沒有明列 ' + type);
    }
    assert(await page.locator('#restore').getAttribute('accept') === '.json,application/json', '筆記匯入失去 JSON 篩選');
    const played = [];
    for (const [file, keyboard] of [['output/media-probe/reference.mp4', false], ['output/media-probe/player/sample.mov', true]]) {
      await select(file, keyboard);
      assert((await page.locator('#status').textContent()).startsWith('示範影片已載入'), '影片選取後未成功載入');
      await page.locator('#reference').evaluate(async video => { video.muted = true; await video.play(); });
      await page.waitForFunction(() => { const video = document.getElementById('reference'); return video.currentTime > 0.1 && video.videoWidth > 0 && video.videoHeight > 0 && !video.error; });
      await page.locator('#reference').evaluate(video => { video.pause(); });
      played.push(file.endsWith('.mov') ? 'MOV' : 'MP4');
    }
    await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成選片保留標記');
    await page.locator('#marker-form button[type=submit]').click(); await idle();
    const before = await library(), source = await page.locator('#reference').getAttribute('src');
    // 空選取模擬取消；壞檔另測原生解碼拒絕，兩者都不能建立筆記或換掉原片。
    for (const file of [[], 'output/media-probe/player/corrupt.mp4']) {
      await select(file);
      assert(await library() === before, '取消或壞檔改掉筆記');
      assert(await page.locator('#reference').getAttribute('src') === source, '取消或壞檔換掉原片');
      assert(await page.locator('#reference-file').inputValue() === '', '未清空選檔，無法再次選取同一檔');
    }
    await select('output/media-probe/player/sample.mov');
    assert((await page.locator('#status').textContent()).startsWith('示範影片已載入'), '壞檔後無法重新選片');
    const saved = JSON.parse(await library());
    // 備份工具必須能由鍵盤展開，影片選取則不需要先打開這個區塊。
    await page.locator('#note-tools > summary').focus(); await page.keyboard.press('Enter');
    assert(await page.getByLabel('匯入筆記 JSON（分享／備份）', { exact: true }).isVisible(), '展開筆記工具後仍找不到匯入');
    const downloading = page.waitForEvent('download'); await page.locator('#backup').click(); await downloading; await idle();
    await page.locator('#share-notes').click(); await idle();
    assert(await page.locator('#share-dialog').isVisible(), '次要工具無法開啟分享');
    await page.locator('#share-cancel').click();
    await page.locator('#delete-video').click(); await idle();
    assert(await page.locator('#delete-dialog').isVisible(), '次要工具無法預覽刪除');
    await page.locator('#delete-cancel').click();
    assert(await library() === JSON.stringify(saved), '預覽或取消次要工具改掉資料');
    await page.locator('#restore').setInputFiles({ name: 'synthetic-picker-notes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
    await idle(); await page.locator('#import-dialog').waitFor({ state: 'visible' });
    await page.locator('#import-confirm').click(); await idle();
    assert(await library() === JSON.stringify(saved), '重匯 JSON 新增或覆寫資料');
    // 重開後從影片庫按鈕重連，仍須人工確認，不能把同名片自動綁回筆記。
    const videoId = saved.videos[0].id;
    await page.reload(); await idle();
    await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
    await select('output/media-probe/reference.mp4');
    const relink = { confirmationVisible: await page.locator('#confirm-link').isVisible(), practiceDisabled: await page.locator('#practice').evaluate(fieldset => fieldset.disabled), status: await page.locator('#status').textContent() };
    assert(relink.confirmationVisible && relink.practiceDisabled, '新入口繞過重連確認：' + JSON.stringify(relink));
    await page.locator('#confirm-link').click(); await idle();
    assert(JSON.parse(await library()).videos.length === saved.videos.length, '重連誤建新筆記');
    await page.setViewportSize({ width: 320, height: 800 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '選片按鈕撐出窄版頁面');
    return { played, mouseAndKeyboardOpenVideoPicker: true, secondaryToolsCollapsedAndKeyboardAccessible: true, backupShareAndDeleteAccessible: true, allVideoInputsListExtensions: true, cancelAndCorruptPreserveSourceAndNotes: true, retryWorks: true, jsonReimportPreserved: true, relinkStillNeedsConfirmation: true, narrowLayoutFits: true, nativeOSDialogNotVerified: true };
  } finally { await context.close(); }
}
