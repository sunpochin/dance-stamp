/* 檔案用途：手動拍點、合成音訊與資料失敗恢復。所在層：隔離瀏覽器回歸。主要關聯：beats.js、DATA_FORMAT.md。 */
// 筆記管理收在次要工具，先展開再驗證既有功能；資料斷言維持原樣。
async (page) => {
  const origin = new URL(page.url()).origin, checks = {};
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()));
  const fill = async (bpm = '120', first = '0.35', count = '4') => {
    await page.locator('#beat-bpm').fill(bpm); await page.locator('#beat-first').fill(first); await page.locator('#beat-count-in').selectOption(count);
  };
  await page.goto(origin);
  await page.locator('#reference-file').setInputFiles('output/beats/reference.mp4'); await idle();
  await page.locator('#practice details summary').click();
  await page.locator('#copy-reference').click(); await idle();
  const beforeDownload = page.waitForEvent('download'); await page.locator('#reference-download').click(); await (await beforeDownload).saveAs('output/beats/before.mp4');
  const videoId = await page.locator('#library').inputValue();
  const initial = await library();
  assert(!initial.data.videos[0].beatGrid && (await page.locator('#beat-position').textContent()).includes('秒倒數'), '沒有 BPM 的舊秒數路徑消失');
  for (const [bpm, first] of [['', '0'], ['0', '0'], ['301', '0'], ['1e99', '0'], ['120', '-0.0001'], ['120', '20'], ['120', '1e99']]) {
    await fill(bpm, first); await page.locator('#beat-save').click(); await idle();
    assert((await library()).revision === initial.revision && await page.locator('#beat-bpm').inputValue() === bpm, '無效輸入寫入或草稿被清掉');
  }
  await fill();
  await page.locator('#open-library').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('拍點尚未保存') && await page.locator('#beat-bpm').inputValue() === '120', '換片吃掉未保存拍點');
  await page.locator('#beat-save').click(); await idle();
  const saved = await library();
  assert(JSON.stringify(saved.data.videos[0].beatGrid) === JSON.stringify({ bpm: 120, firstBeatMs: 350, countInBeats: 4 }), '未保存來源拍點');
  await page.locator('#reference').evaluate(async video => { video.currentTime = 1.35; await new Promise(r => video.addEventListener('seeked', r, { once: true })); });
  await page.locator('#beat-set-first').click(); assert(Number(await page.locator('#beat-first').inputValue()) === 1.35, '目前畫面未定位第一拍');
  await page.locator('#beat-cancel').click(); assert(await page.locator('#beat-first').inputValue() === '0.35', '取消未還原保存值');
  for (const rate of ['0.5', '0.75', '1']) {
    await page.locator('#practice-rate').selectOption(rate);
    for (const [seconds, text] of [[0.34, '第一拍之前'], [0.35, '第 1 組八拍 · 第 1 拍'], [3.85, '第 1 組八拍 · 第 8 拍'], [4.35, '第 2 組八拍 · 第 1 拍']]) {
      await page.locator('#reference').evaluate(async (video, seconds) => { video.currentTime = seconds; await new Promise(r => video.addEventListener('seeked', r, { once: true })); }, seconds);
      await page.waitForFunction(text => document.getElementById('beat-position').textContent.includes(text), text);
    }
    await page.locator('#reference').evaluate(async video => { video.currentTime = 0.35; await new Promise(r => video.addEventListener('seeked', r, { once: true })); await video.play(); });
    await page.waitForTimeout(750);
    const playing = await page.locator('#reference').evaluate(video => ({ source: video.currentTime, rate: video.playbackRate, label: document.getElementById('beat-position').textContent }));
    const displayedMs = Number(playing.label.match(/原片 ([0-9.]+) 秒/)[1]) * 1000;
    const index = Math.floor((displayedMs - 350) / 500 + 1e-9);
    assert(playing.rate === Number(rate) && Math.abs(displayedMs - playing.source * 1000) < 120 && playing.label.includes(`第 ${index % 8 + 1} 拍`), '播放拍號未跟來源時鐘／速度：' + JSON.stringify({ ...playing, displayedMs, index, deltaMs: displayedMs - playing.source * 1000 }));
    await page.locator('#reference').evaluate(video => video.pause()); await page.waitForTimeout(100);
    const paused = await page.locator('#beat-position').textContent(); await page.waitForTimeout(150); assert(await page.locator('#beat-position').textContent() === paused, '暫停後仍累加拍號');
  }
  await page.locator('#start').fill('0.35'); await page.locator('#end').fill('0.85'); await page.locator('#loop').click(); await page.waitForTimeout(1250);
  assert(await page.locator('#reference').evaluate(video => !video.paused && video.currentTime >= 0.35 && video.currentTime < 1) && (await page.locator('#beat-position').textContent()).includes('第 1 拍'), 'A–B 回捲未依來源重新計拍');
  await page.locator('#stop').click(); await page.locator('#end').fill('15.35');
  await page.locator('#reference').evaluate(async video => { video.currentTime = 4.35; await new Promise(r => video.addEventListener('seeked', r, { once: true })); });
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成八拍'); await page.locator('#marker-form button[type=submit]').click(); await idle();
  assert((await page.locator('#markers').textContent()).includes('第 2 組八拍 · 第 1 拍'), '秒數標記未附八拍標籤');
  // 真正的 IndexedDB put 故障必須回滾；不要只模擬 UI 顯示錯誤。
  await fill('100'); const beforeFailure = await library();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put; window.restoreBeatPut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function(...args) { if (this.name === 'metadata') throw new DOMException('synthetic quota', 'QuotaExceededError'); return put.apply(this, args); };
  });
  try { await page.locator('#beat-save').click(); await idle(); assert((await library()).revision === beforeFailure.revision && await page.locator('#beat-bpm').inputValue() === '100', 'quota 改寫舊資料或吃掉草稿'); }
  finally { await page.evaluate(() => window.restoreBeatPut()); }
  await page.locator('#beat-save').click(); await idle(); assert((await library()).data.videos[0].beatGrid.bpm === 100, 'quota 後無法重試');
  await fill(); await page.locator('#beat-save').click(); await idle();
  const rollback = await page.evaluate(async () => {
    const storage = await import('/storage.js'), saved = await storage.readLibrary(), next = structuredClone(saved.data), controller = new AbortController(); next.videos[0].beatGrid.bpm = 90;
    const put = IDBObjectStore.prototype.put; let rejected = false;
    IDBObjectStore.prototype.put = function(...args) { const result = put.apply(this, args); if (this.name === 'metadata') controller.abort(); return result; };
    try { await storage.writeLibrary(next, saved.revision, undefined, controller.signal); } catch { rejected = true; } finally { IDBObjectStore.prototype.put = put; }
    const after = await storage.readLibrary(); return rejected && after.revision === saved.revision && after.data.videos[0].beatGrid.bpm === 120;
  });
  assert(rollback, '交易寫入後取消沒有原子回滾');
  await page.locator('#note-tools').evaluate(d => { d.open = true; });
  const backupWait = page.waitForEvent('download'); await page.locator('#backup').click(); const backup = await backupWait; await backup.saveAs('output/beats/notes.dance-stamp.json'); await idle();
  const beforeImport = await library();
  await page.locator('#restore').setInputFiles('output/beats/notes.dance-stamp.json'); await idle(); await page.locator('#import-cancel').click();
  assert((await library()).revision === beforeImport.revision, '取消匯入仍寫入');
  await page.locator('#restore').setInputFiles('output/beats/notes.dance-stamp.json'); await idle(); await page.locator('#import-confirm').click(); await idle();
  assert((await library()).revision === beforeImport.revision, '同備份重新匯入新增或覆寫');
  const otherTab = await page.context().newPage();
  try {
    await otherTab.goto(origin);
    await otherTab.evaluate(async () => { const storage = await import('/storage.js'), saved = await storage.readLibrary(); saved.data.videos[0].title = '合成另一分頁更新'; await storage.writeLibrary(saved.data, saved.revision); });
    await fill('100'); await page.locator('#beat-save').click(); await idle();
    assert((await page.locator('#status').textContent()).includes('另一分頁') && await page.locator('#beat-bpm').inputValue() === '100' && (await library()).data.videos[0].beatGrid.bpm === 120, '分頁衝突丟草稿或蓋掉資料');
    await page.locator('#beat-cancel').click();
  } finally { await otherTab.close(); }
  await page.reload(); await page.locator('#library').selectOption(videoId); await page.locator('#open-library').click(); await idle();
  assert(await page.locator('#beat-bpm').inputValue() === '120' && await page.locator('#beat-first').inputValue() === '0.35', '重開未取回拍點');
  await page.locator('#practice details summary').click();
  // 獨立音訊渲染量測真正 samples；不把排程參數當成聽到的證據。
  checks.audio = await page.evaluate(async () => {
    const { scheduleCountIn, countInPlan } = await import('/beats.js'), results = [];
    for (const beats of [4, 8]) for (const rate of [0.5, 0.75, 1]) {
      const plan = countInPlan({ bpm: 120, firstBeatMs: 350, countInBeats: beats }, rate), hz = 48000;
      const audio = new OfflineAudioContext(1, Math.ceil((plan.durationMs / 1000 + 0.2) * hz), hz);
      scheduleCountIn(audio, plan, 0.1); const samples = (await audio.startRendering()).getChannelData(0);
      const spans = []; let start = -1;
      for (let i = 0; i < samples.length; i++) { if (Math.abs(samples[i]) > 0.001) { if (start < 0) start = i; } else if (start >= 0 && i - start > hz * 0.07) { spans.push(start / hz); start = -1; } }
      if (spans.length !== beats || spans.some((at, i) => Math.abs(at - (0.1 + i * 0.5 / rate)) > 0.002)) throw new Error(`提示音 samples 時間不符 ${rate}: ${spans}`);
      // 首拍／其餘拍的頻率以零交越獨立估計，允許窗邊界的一個週期誤差。
      const frequencies = spans.map(at => { const from = Math.ceil((at + 0.008) * hz), to = Math.floor((at + 0.05) * hz); let crossings = 0; for (let i = from + 1; i < to; i++) if (samples[i - 1] <= 0 && samples[i] > 0) crossings++; return crossings / ((to - from) / hz); });
      if (frequencies.some((f, i) => Math.abs(f - (i ? 660 : 880)) > 30)) throw new Error('提示音頻率不符');
      results.push({ beats, rate, spans, frequencies });
    }
    return results;
  });
  const restored = await page.context().browser().newContext({ acceptDownloads: true });
  try {
    const other = await restored.newPage(); await other.goto(origin); await other.locator('#restore').setInputFiles('output/beats/notes.dance-stamp.json');
    await other.waitForFunction(() => document.getElementById('import-dialog').open); await other.locator('#import-confirm').click(); await other.waitForFunction(() => !document.getElementById('controls').disabled);
    const state = await other.evaluate(async () => (await (await import('/storage.js')).readLibrary()));
    await other.locator('#library').selectOption(state.data.videos[0].id); await other.locator('#open-library').click(); await other.waitForFunction(() => !document.getElementById('controls').disabled);
    assert(await other.locator('#beat-bpm').inputValue() === '120' && state.data.assets.every(a => a.state === 'missing'), '乾淨 context 還原遺失拍點或冒稱影片已備份');
    await other.locator('#reference-file').setInputFiles('output/beats/reference.mp4'); await other.waitForFunction(() => !document.getElementById('controls').disabled);
    await other.locator('#confirm-link').click(); await other.waitForFunction(() => !document.getElementById('controls').disabled);
    await other.locator('#reference').evaluate(async video => { video.currentTime = 4.35; await new Promise(r => video.addEventListener('seeked', r, { once: true })); });
    assert((await other.locator('#beat-position').textContent()).includes('第 2 組八拍 · 第 1 拍'), '重新連結後拍點不符');
  } finally { await restored.close(); }
  await page.locator('#beat-clear').click(); await idle(); assert(!(await library()).data.videos[0].beatGrid, '移除拍點未回秒數');
  const afterDownload = page.waitForEvent('download'); await page.locator('#reference-download').click(); await (await afterDownload).saveAs('output/beats/after.mp4');
  checks.manualSaveCancelInvalidQuotaReloadBackupAndRestore = true;
  checks.atomicAbortAndCrossTabConflict = true;
  checks.version = await page.evaluate(async () => (await (await fetch('/sw.js')).text()).match(/const version = '([^']+)'/)?.[1]);
  return checks;
}
