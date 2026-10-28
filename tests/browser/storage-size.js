/* 檔案用途：驗證 20／100／200 MiB 副本、跨瀏覽器重啟保存及超限拒絕。所在層：合成儲存矩陣。主要關聯：make-storage-fixtures.ts、ACCEPTANCE.md。 */
async (page, fixtures, phase = 'prepare') => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  assert(fixtures.kind === 'synthetic-mp4-free-atom', '僅允許本輪合成保存測片');
  const origin = new URL(page.url()).origin, key = 'dance-synthetic-storage-size';
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('儲存矩陣禁止存取相機／麥克風'); };
  });
  await page.goto(origin); await idle();
  const media = id => page.evaluate(async id => {
    const blob = await (await import('/storage.js')).readMedia(id);
    if (!blob) return null;
    return { bytes: blob.size, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('') };
  }, id);
  const select = async file => {
    await page.locator('#reference-file').setInputFiles(file.path); await idle();
    await page.locator('#self-file').setInputFiles(file.path); await idle();
    const data = await library(), videoId = await page.locator('#library').inputValue();
    const referenceId = data.assets.find(a => a.videoId === videoId && a.kind === 'reference').id;
    const take = data.takes.filter(t => t.referenceVideoId === videoId).at(-1);
    assert(take && !await media(referenceId) && !await media(take.cameraAssetId), '選片就自動保存副本或配對失敗');
    await page.locator('#mark').click(); await page.locator('#marker-title').fill(`合成容量 ${file.label}`);
    await page.locator('#marker-form').evaluate(f => f.requestSubmit()); await idle();
    return { label: file.label, videoId, referenceId, takeId: take.id, selfId: take.cameraAssetId };
  };
  const playPair = async () => {
    await page.locator('#play').click();
    await page.waitForFunction(() => document.getElementById('reference').currentTime > 0.1 && document.getElementById('self').currentTime > 0.1);
    await page.locator('#stop').click(); await idle();
  };
  if (phase === 'prepare') {
    // 拒絕在已有使用者筆記的 profile 操作；確認框只適用本次新建的合成資料。
    const empty = await library(); assert(empty.videos.length === 0 && empty.assets.length === 0 && empty.takes.length === 0, '請使用本輪全新專用 profile，不清除既有資料');
    await page.evaluate(() => { window.confirm = () => true; });
    const saved = [];
    for (const file of fixtures.cases.filter(f => f.bytes <= 200 * 1048576)) {
      const row = await select(file), began = Date.now();
      await page.locator('#copy-reference').click(); await idle();
      await page.locator('#copy-self').click(); await idle();
      for (const id of [row.referenceId, row.selfId]) {
        const blob = await media(id), asset = (await library()).assets.find(a => a.id === id);
        assert(blob?.bytes === file.bytes && blob.sha256 === file.sha256 && asset.state === 'ready' && asset.byteLength === file.bytes, `${file.label} 副本未完整保存`);
      }
      saved.push({ ...row, saveAndVerifyMs: Date.now() - began });
    }
    const over = await select(fixtures.cases.find(f => f.bytes === 200 * 1048576 + 1)), before = await library();
    for (const button of ['copy-reference', 'copy-self']) {
      await page.locator('#' + button).click(); await idle();
      assert((await page.locator('#status').textContent()).includes('200 MiB'), '超限副本缺少可理解提示');
      assert(JSON.stringify(await library()) === JSON.stringify(before) && !await media(over.referenceId) && !await media(over.selfId), '超限保存改動 metadata 或留下半份副本');
    }
    await playPair();
    assert(JSON.stringify(await library()) === JSON.stringify(before), '超限後當次播放改動原配方');
    await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('已檢查應用資源完整'));
    const version = (await (await page.request.get(origin + '/sw.js')).text()).match(/const version = '([a-f0-9]{16})'/)?.[1];
    assert(version, '無法辨識受測版本');
    // 只保存合成 QA 的對照表供完全關閉瀏覽器後讀回，不把它當產品備份能力。
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key, value: { saved, over, metadata: before, version } });
    return { phase, version, saved, overLimitRejectedWithoutChanges: true, overLimitSessionPlayback: true, restartRequired: true };
  }
  assert(phase === 'verify', '未知儲存矩陣階段');
  const baseline = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert(baseline?.saved?.length === 3, '缺少 prepare 證據，請使用同一個專用 profile');
  assert(JSON.stringify(await library()) === JSON.stringify(baseline.metadata), '瀏覽器重啟遺失或改動 metadata');
  await page.context().setOffline(true); await page.reload(); await idle();
  assert(await page.evaluate(() => !!navigator.serviceWorker.controller), '離線重開未受已備妥的 Service Worker 控制');
  await page.evaluate(() => { window.confirm = () => true; });
  const downloads = [];
  for (const row of baseline.saved) {
    const file = fixtures.cases.find(f => f.label === row.label);
    await page.locator('#library').selectOption(row.videoId); await page.locator('#open-library').click(); await idle();
    await page.locator('#takes li').getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
    assert(await page.locator('#reference').evaluate(v => v.readyState >= 2) && await page.locator('#self').evaluate(v => v.readyState >= 2), '離線重開大檔未解碼');
    for (const [kind, id, selector] of [['reference', row.referenceId, '#reference-download'], ['self', row.selfId, '#take-download']]) {
      const blob = await media(id); assert(blob?.bytes === file.bytes && blob.sha256 === file.sha256, '重啟／斷網後副本內容改變');
      const event = page.waitForEvent('download'); await page.locator(selector).click();
      const download = await event, path = `${fixtures.directory}/${row.label}-${kind}-download.mp4`;
      assert(download.suggestedFilename().endsWith('.mp4'), '下載副檔名與測片不符');
      await download.saveAs(path); assert(!await download.failure(), '實際大檔下載失敗');
      downloads.push({ label: row.label, kind, path, ...blob });
    }
    await playPair();
  }
  await page.locator('#library').selectOption(baseline.over.videoId); await page.locator('#open-library').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('尚未連結') && !await media(baseline.over.referenceId) && !await media(baseline.over.selfId), '未保存的超限原片被冒充已保存');
  assert(JSON.stringify(await library()) === JSON.stringify(baseline.metadata), '重開／播放遺失標記或配方');
  return { phase, version: baseline.version, preservedMetadata: true, offlinePlaybackOfThreePairs: true, missingOverLimitCopyTruthful: true, downloads, userAgent: await page.evaluate(() => navigator.userAgent) };
}
