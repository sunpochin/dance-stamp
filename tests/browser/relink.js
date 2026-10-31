/* 檔案用途：同名短片重連不能改掉原筆記時間。所在層：桌面合成資料回歸。主要關聯：main.js、storage.js。 */
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  // 保留新版選片欄位並固定預覽入口，避免整合時測到舊介面或其他本機網站。
  await page.goto('http://127.0.0.1:4174/');
  await page.getByLabel('選擇示範影片', { exact: true }).setInputFiles('output/media-probe/reference.mp4');
  await page.waitForFunction(() => !document.getElementById('practice').disabled);
  await page.locator('#reference').evaluate(async v => { v.currentTime = 10; await new Promise(r => v.addEventListener('seeked', r, { once: true })); });
  await page.getByRole('button', { name: '標記當下時間', exact: true }).click();
  await page.getByLabel('標記標題', { exact: true }).fill('合成片尾標記');
  await page.getByRole('button', { name: '儲存標記', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('markers').textContent.includes('合成片尾標記'));
  const id = await page.locator('#library').inputValue();
  await page.reload();
  await page.getByRole('combobox', { name: '已保存的筆記', exact: true }).selectOption(id);
  await page.getByRole('button', { name: '開啟筆記', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('尚未連結'));
  await page.getByLabel('選擇示範影片', { exact: true }).setInputFiles('output/media-probe/short/reference.mp4');
  await page.getByRole('button', { name: '已預覽，確認連結到這份筆記', exact: true }).waitFor();
  assert(await page.evaluate(() => document.getElementById('practice').disabled && document.getElementById('camera').disabled), '同名新片未確認就連到舊筆記');
  await page.getByRole('button', { name: '已預覽，確認連結到這份筆記', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('markers').textContent.includes('超出目前影片'));
  assert(await page.getByRole('button', { name: '跳到這裡', exact: true }).isDisabled(), '超界標記仍可啟用');
  const original = await page.evaluate(async id => {
    const saved = await (await import('/storage.js')).readLibrary();
    return { marker: saved.data.markers.find(m => m.videoId === id).startMs, duration: saved.data.videos.find(v => v.id === id).durationMs };
  }, id);
  assert(original.marker === 10000 && original.duration > 60000, '重連短片靜默裁掉筆記或時間');
  // 舊時間／短片回歸先完整保留，再用真正 VS 與缺片清單驗證第二次恢復失敗，不能只看錯誤文字。
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const snapshot = () => page.evaluate(async () => {
    const store = await import('/storage.js'), library = await store.readLibrary(), media = [];
    for (const id of (await store.readMediaKeys()).sort()) {
      const blob = await store.readMedia(id);
      media.push({ id, bytes: blob.size, type: blob.type, hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('') });
    }
    return { library, media };
  });
  await page.locator('#copy-reference').click(); await idle();
  await page.locator('#end').fill('2'); await page.locator('#end').press('Tab'); await idle();
  await page.locator('#self-file').setInputFiles('output/export-failure/self.mp4'); await idle();
  await page.locator('#export').click(); await idle();
  assert(await page.locator('#output-download').isVisible(), '重連失敗基準沒有真正 VS');
  await page.addInitScript(() => {
    const create = URL.createObjectURL;
    window.relinkFailure = { arm: false, replacements: 0, errors: [], unloads: [], sentinel: crypto.randomUUID() };
    URL.createObjectURL = function(blob) {
      if (window.relinkFailure.arm && blob instanceof File) {
        // 只破壞舊候選重新準備的解碼輸入，保留原 File／已存媒體；真正引擎必須自行送 error。
        window.relinkFailure.arm = false; window.relinkFailure.replacements++;
        return create.call(this, new Blob(['synthetic unavailable decoder input'], { type: blob.type }));
      }
      return create.call(this, blob);
    };
    document.addEventListener('error', event => {
      if (event.target.id === 'relink-preview') window.relinkFailure.errors.push({ trusted: event.isTrusted, code: event.target.error?.code });
    }, true);
    document.addEventListener('DOMContentLoaded', () => window.addEventListener('beforeunload', event => window.relinkFailure.unloads.push({ trusted: event.isTrusted, prevented: event.defaultPrevented })));
  });
  await page.reload(); await idle();
  const before = await snapshot(), take = before.library.data.takes.at(-1), artifact = before.library.data.exports.at(-1), expected = before.media.find(row => row.id === artifact?.assetId);
  assert(expected && before.media.length === 2 && !before.media.some(row => row.id === take.cameraAssetId), '沒有真正缺少自拍的保存基準');
  await page.getByText('影片副本與重新連結', { exact: true }).click();
  const open = async () => { await page.locator(`[data-asset-id="${take.cameraAssetId}"]`).getByRole('button', { name: '選片並預覽重連', exact: true }).click(); await idle(); };
  await open();
  await page.locator('#relink-file').setInputFiles('output/export-failure/self.mp4'); await idle();
  assert(await page.locator('#relink-preview').evaluate(video => video.readyState >= 2 && !video.error), '舊候選沒有真正實播預覽');
  const candidate = await page.evaluate(() => ({ sentinel: window.relinkFailure.sentinel, src: document.getElementById('relink-preview').getAttribute('src'), summary: document.getElementById('relink-summary').textContent }));
  // 候選尚未確認不能因離頁遺失；用真正 reload／原生提醒留在同一頁，不派送 beforeunload。
  const navigation = page.waitForEvent('dialog'), requested = page.evaluate(() => { location.reload(); return 'requested'; }).then(value => ({ value }), error => ({ error: String(error) }));
  const dialog = await navigation; assert(dialog.type() === 'beforeunload', '未保存重連候選沒有原生離頁提醒'); await dialog.dismiss(); await requested;
  assert(await page.evaluate(candidate => window.relinkFailure.sentinel === candidate.sentinel && window.relinkFailure.unloads.length === 1 && window.relinkFailure.unloads[0].trusted && window.relinkFailure.unloads[0].prevented && document.getElementById('media-dialog').open && document.getElementById('relink-preview').getAttribute('src') === candidate.src && document.getElementById('relink-summary').textContent === candidate.summary, candidate), '留下後不是同一頁、候選預覽或說明遺失');
  assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '取消離頁改動原 metadata／revision 或媒體');
  // 空檔在建立 URL 前就拒絕，接著只破壞舊候選恢復；原空檔錯誤不能被第二次解碼錯誤蓋掉。
  await page.evaluate(() => { window.relinkFailure.arm = true; });
  await page.locator('#relink-file').setInputFiles({ name: 'synthetic-empty.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(0) }); await idle();
  const fault = await page.evaluate(() => window.relinkFailure);
  assert(fault.replacements === 1 && fault.errors.length === 1 && fault.errors.every(row => row.trusted && row.code > 0), '舊候選恢復沒有經真正原生解碼失敗');
  assert((await page.locator('#status').textContent()).includes('空檔案'), '次要恢復錯誤蓋掉原選片失敗');
  assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '雙重失敗改動完整 metadata／revision 或已存媒體');
  await page.locator('#relink-cancel').click(); await idle();
  assert(await page.locator('#media-dialog').isHidden() && await page.locator('#relink-preview').evaluate(video => video.paused && !video.getAttribute('src')), '取消後留下舊預覽或忙碌狀態');
  await open(); await page.locator('#relink-file').setInputFiles('output/export-failure/self.mp4'); await idle();
  await page.locator('#relink-checked').check(); await page.locator('#relink-confirm').click(); await idle();
  const linked = await snapshot();
  assert(linked.library.revision === before.library.revision + 1 && JSON.stringify(linked.media) === JSON.stringify(before.media), '重試沒有單次保存或偷偷存入候選影片');
  for (const [table, rows] of Object.entries(before.library.data)) if (Array.isArray(rows)) {
    assert(JSON.stringify(linked.library.data[table].filter(row => table !== 'assets' || row.id !== take.cameraAssetId)) === JSON.stringify(rows.filter(row => table !== 'assets' || row.id !== take.cameraAssetId)), '重連改動其他資料表：' + table);
  }
  const pending = page.waitForEvent('download'); await page.locator(`[data-asset-id="${artifact.assetId}"]`).getByRole('button', { name: '另存影片檔', exact: true }).click(); const file = await pending;
  const actualVsDownload = `output/export-failure/relink-double-failure-${file.suggestedFilename()}`; await file.saveAs(actualVsDownload);
  const bytes = await (await import('node:fs/promises')).readFile(actualVsDownload), { createHash } = await import('node:crypto');
  assert(bytes.length === expected.bytes && createHash('sha256').update(bytes).digest('hex') === expected.hash, '重試後真正舊 VS 下載不符');
  await page.reload(); await idle(); const reopened = await snapshot();
  assert(JSON.stringify(reopened) === JSON.stringify({ library: { ...before.library, revision: linked.library.revision }, media: before.media }), 'session 重連重開後改動原資料或殘留候選');
  return { sameFilenameNeedsExplicitConfirmation: true, outOfRangeMarkerRequiresRepair: true, originalNoteAndTimePreserved: true, relinkRecoveryFailure: { fault, nativeUnloadKeepsUnconfirmedCandidate: true, originalErrorPreserved: true, allMetadataAndMediaPreserved: true, cancelledAndRetried: true, sameProfileReload: true, actualVsDownload, expectedVs: expected } };
}
