/* 檔案用途：重現比較設定保存失敗後仍可備份、另存及重試。所在層：資料恢復回歸。主要關聯：main.js、comparison-recovery.js。 */
async (page) => {
  const origin = new URL(page.url()).origin, checks = {};
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  for (const failure of ['quota', 'seek', 'revision']) {
    const context = await page.context().browser().newContext(), current = await context.newPage();
    const idle = () => current.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
    const library = () => current.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
    const download = async id => {
      const [file] = await Promise.all([current.waitForEvent('download', { timeout: 3000 }), current.locator(`#${id}`).click()]);
      assert(await file.failure() === null, `${failure} 後下載失敗`);
    };
    await context.addInitScript(() => {
      window.confirm = () => true;
      // 新分頁的 about:blank 尚無安全來源的媒體 API；仍須在真正頁面禁止硬體擷取。
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new Error('恢復驗收禁止相機'); };
    });
    try {
      await current.goto(origin); await idle();
      await current.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
      // 新選片預設全長；此比較案例明確選 15 秒，保留原本的媒體護欄與測試範圍。
      await current.locator('#end').fill('15');
      await current.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
      await current.locator('#end').fill('2'); await current.locator('#end').dispatchEvent('change'); await idle();
      const before = await library(), take = before.takes.at(-1);
      const urls = await current.evaluate(() => ['reference', 'self'].map(id => document.getElementById(id).src));
      if (failure === 'quota') await current.evaluate(() => {
        window.nativeComparisonPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(...args) {
          if (this.name === 'metadata') throw new DOMException('synthetic setting quota', 'QuotaExceededError');
          return window.nativeComparisonPut.apply(this, args);
        };
      });
      if (failure === 'seek') await current.evaluate(() => {
        window.nativeComparisonTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
        Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { ...window.nativeComparisonTime, set(value) {
          if (this.id === 'self') throw new Error('synthetic setting seek');
          window.nativeComparisonTime.set.call(this, value);
        } });
      });
      if (failure === 'revision') {
        const other = await context.newPage(); await other.goto(origin);
        await other.evaluate(async id => {
          const { readLibrary, writeLibrary } = await import('/storage.js');
          const data = await readLibrary(); data.data.videos.find(v => v.id === id).title = '合成較新版本';
          await writeLibrary(data.data, data.revision);
        }, take.referenceVideoId);
        await other.close();
      }
      await current.locator('#offset').fill('1'); await current.locator('#offset').dispatchEvent('change'); await idle();
      const message = await current.locator('#status').textContent();
      assert(message.includes(failure === 'revision' ? '另一分頁' : `synthetic setting ${failure}`), `未觸發 ${failure} 設定失敗`);
      await current.evaluate(kind => {
        if (kind === 'quota') IDBObjectStore.prototype.put = window.nativeComparisonPut;
        if (kind === 'seek') Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', window.nativeComparisonTime);
      }, failure);
      // 不重載、不再修改設定：原先 rejected 佇列會令備份連 task 都執行不到。
      // 備份入口已收進次要工具；先依真正 UI 展開，不能讓隱藏按鈕的逾時冒充保存失敗。
      await current.locator('#note-tools').evaluate(details => { details.open = true; });
      await download('backup'); await idle();
      assert(Number(await current.locator('#offset').inputValue()) === 1, '備份抹掉失敗時的輸入');
      assert(JSON.stringify(await current.evaluate(() => ['reference', 'self'].map(id => document.getElementById(id).src))) === JSON.stringify(urls), '失敗恢復丟失當次 File');
      await download('reference-download'); await download('take-download');
      await current.locator('#copy-self').click(); await idle();
      if (failure === 'revision') {
        const data = await library();
        assert((await current.locator('#status').textContent()).includes('另一分頁'), '恢復佇列繞過 revision 保護');
        assert(data.videos.find(v => v.id === take.referenceVideoId).title === '合成較新版本', '舊頁覆寫較新資料');
        assert(await current.evaluate(async id => !(await (await import('/storage.js')).readMedia(id)), take.cameraAssetId), '版本衝突部分寫入副本');
      } else {
        assert(await current.evaluate(async id => !!(await (await import('/storage.js')).readMedia(id)), take.cameraAssetId), '故障解除後無法保存副本');
        await current.locator('#export').click(); await idle();
        assert((await current.locator('#status').textContent()).includes('已成檔'), '故障解除後無法重試匯出');
        assert((await library()).recipes.find(r => r.takeId === take.id).offsetMs === 1000, '匯出未重新保存目前設定');
        await current.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
        assert((await library()).takes.at(-1).id !== take.id, '故障解除後無法重新選片');
      }
      checks[failure] = { failureShown: true, backupAndOriginalsAvailable: true, sessionFilesPreserved: true, recoveryOrRevisionProtection: true };
    } finally { await context.close(); }
  }
  return checks;
}
