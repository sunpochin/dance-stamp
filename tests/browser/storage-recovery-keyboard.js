/* 檔案用途：驗證原生交易失敗且產品缺結束通知時的鍵盤保全。所在層：隔離合成瀏覽器回歸。主要關聯：main.js、storage.js、issue-14-storage-keyboard.md。 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export default async function storageRecoveryKeyboard(page, fixtures, folder, report, kind = 'title') {
  assert(['title', 'import'].includes(kind));
  const result = { kind, keyboard: [], snapshots: {}, downloads: {} };
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const idle = () => page.waitForFunction(() => ['controls', 'compare', 'practice', 'library-panel'].every(id => document.getElementById(id).getAttribute('aria-busy') !== 'true'));
  const opened = () => page.waitForFunction(() => document.getElementById('storage-status').textContent.startsWith('此瀏覽器有'));
  // 不用 focus() 跳過真實 Tab 順序；救援後每一個動作都由鍵盤抵達與啟動。
  const tabTo = async selector => {
    for (let n = 0; n < 160; n++) {
      if (await page.locator(selector).evaluate(el => el === document.activeElement)) return;
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => { const el = document.activeElement; return { id: el.id, tag: el.tagName, disabled: el.matches(':disabled'), visible: !!el.getClientRects().length }; });
      assert(!focus.disabled && focus.visible, 'Tab 落在停用或隱藏元素'); result.keyboard.push(focus);
    }
    throw new Error('Tab 無法抵達 ' + selector);
  };
  const activate = async selector => { await tabTo(selector); await page.keyboard.press('Enter'); await idle(); };
  const snapshot = async label => {
    // 未確認時只用獨立 QA 原生唯讀連線查核，不解除產品旗標或替產品建立替代連線。
    const value = await page.evaluate(async () => {
      const req = indexedDB.open('dance-stamp', 1), db = await new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      const read = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try {
        const tx = db.transaction(['metadata', 'media', 'chunks']);
        const [native, keys, blobs, chunkKeys] = await Promise.all([read(tx.objectStore('metadata').get('library')), read(tx.objectStore('media').getAllKeys()), read(tx.objectStore('media').getAll()), read(tx.objectStore('chunks').getAllKeys())]);
        const media = await Promise.all(blobs.map(async (blob, i) => ({ id: keys[i], type: blob.type, base64: await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(';base64,') + 8)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }) })));
        return { native, keys, chunkKeys, media };
      } finally { db.close(); }
    });
    for (const media of value.media) {
      const bytes = Buffer.from(media.base64, 'base64'); delete media.base64;
      media.bytes = bytes.length; media.sha256 = hash(bytes); writeFileSync(join(folder, label + '-' + media.id + '.bin'), bytes);
      if (label !== 'baseline') assert(bytes.equals(readFileSync(join(folder, 'baseline-' + media.id + '.bin'))), label + ' changed full Blob bytes');
    }
    result.snapshots[label] = value;
    if (label !== 'baseline') assert.deepEqual(value, result.snapshots.baseline);
    await report(label, result); return value;
  };
  await page.addInitScript(() => {
    const qa = window.recoveryKeyboard = { armed: false, transactions: [], suppressed: [], mediaCalls: 0 };
    for (const name of ['getUserMedia', 'getDisplayMedia']) if (navigator.mediaDevices?.[name]) navigator.mediaDevices[name] = async () => { qa.mediaCalls++; throw new Error('QA 禁止真實媒體擷取'); };
    const nativeTransaction = IDBDatabase.prototype.transaction, nativeAdd = IDBTransaction.prototype.addEventListener, nativePut = IDBObjectStore.prototype.put;
    const entries = new WeakMap();
    IDBDatabase.prototype.transaction = function(...args) {
      const tx = nativeTransaction.apply(this, args), inject = qa.armed && tx.mode === 'readwrite';
      if (inject) qa.armed = false;
      const entry = { inject, mode: tx.mode, events: [], at: performance.now() }; entries.set(tx, entry); qa.transactions.push(entry);
      // 觀測器用原生註冊保留 trusted error/abort；只抑制產品的 complete/abort 接收，不偽造事件。
      for (const name of ['error', 'abort', 'complete']) nativeAdd.call(tx, name, event => entry.events.push({ name, isTrusted: event.isTrusted, at: performance.now(), error: event.target.error?.name || null }), true);
      return tx;
    };
    IDBTransaction.prototype.addEventListener = function(name, listener, options) {
      if (entries.get(this)?.inject && ['complete', 'abort'].includes(name)) { qa.suppressed.push(name); return; }
      return nativeAdd.call(this, name, listener, options);
    };
    IDBObjectStore.prototype.put = function(...args) {
      const request = nativePut.apply(this, args), entry = entries.get(this.transaction);
      if (entry?.inject && this.name === 'metadata') {
        entry.candidate = structuredClone(args[0]);
        // 重複既有 primary key 產生真正 ConstraintError 與原生回滾，產品只缺結束通知。
        this.add({ synthetic: true }, 'library');
      }
      return request;
    };
  });
  await page.goto(fixtures.origin); await opened(); await idle();
  const payloads = Object.fromEntries(['reference', 'self', 'vs'].map(key => [key, readFileSync(fixtures[key]).toString('base64')]));
  const ids = await page.evaluate(async payloads => {
    const storage = await import('/storage.js'), { newLibrary } = await import('/library.js');
    if ((await storage.readLibrary()).revision !== 0) throw new Error('拒絕既有庫；不能清庫建案例');
    const data = newLibrary(), video = crypto.randomUUID(), take = crypto.randomUUID(), recipe = crypto.randomUUID(), assets = {};
    for (const key of ['reference', 'self', 'vs']) assets[key] = crypto.randomUUID();
    data.videos.push({ id: video, title: '合成鍵盤保全筆記', durationMs: 80000, revision: 1 });
    data.markers.push({ id: crypto.randomUUID(), videoId: video, startMs: 1000, title: '合成標記', note: '交易未知時必須保留的非空正文', revision: 1 });
    data.takes.push({ id: take, referenceVideoId: video, cameraAssetId: assets.self, referenceStartMs: 2000, referenceEndMs: 5000, rate: 1, state: 'ready', createdAt: data.exportedAt });
    data.recipes.push({ id: recipe, takeId: take, offsetMs: 1000, referenceMirror: false, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 });
    data.exports.push({ id: crypto.randomUUID(), recipeId: recipe, recipeRevision: 1, assetId: assets.vs, mimeType: 'video/mp4', state: 'ready', createdAt: data.exportedAt });
    const blobs = Object.fromEntries(Object.entries(payloads).map(([key, value]) => [key, new Blob([Uint8Array.from(atob(value), c => c.charCodeAt(0))], { type: 'video/mp4' })]));
    for (const key of ['reference', 'self', 'vs']) data.assets.push({ id: assets[key], ...(key === 'reference' ? { videoId: video } : {}), kind: key === 'self' ? 'take' : key, byteLength: blobs[key].size, mimeType: 'video/mp4' });
    let revision = 0;
    for (const key of ['reference', 'self', 'vs']) revision = (await storage.writeLibrary(data, revision, { id: assets[key], blob: blobs[key] })).revision;
    return { video, assets };
  }, payloads);
  await page.reload(); await opened(); await idle();
  // 種入與選取合成 fixture 屬前置；這支回歸專驗未確認之後的鍵盤，不測 OS 原生下拉選單。
  await page.locator('#library').selectOption(ids.video); await activate('#open-library');
  await activate('#takes button[data-focus-key$=":open"]'); await activate('#takes button[data-focus-key$=":download"]');
  const baseline = await snapshot('baseline'); assert.equal(baseline.native.revision, 3);
  const incoming = await page.evaluate(async () => { const data = (await import('/library.js')).newLibrary(); data.videos.push({ id: crypto.randomUUID(), title: '合成尚未確認匯入', durationMs: 3000, revision: 1 }); return data; });
  // 次要工具現在預設收起；先展開並真的以 Tab 到選檔入口，才有可驗證的取消返回焦點。
  await page.locator('#note-tools').evaluate(details => { details.open = true; });
  const choose = async () => { await tabTo('#restore'); await page.locator('#restore').setInputFiles({ name: 'synthetic-import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) }); await idle(); assert(await page.locator('#import-dialog').evaluate(el => el.matches(':modal'))); };
  await choose(); await page.keyboard.press('Escape'); await idle();
  assert(await page.locator('#restore').evaluate(el => el === document.activeElement)); await snapshot('escape');
  await choose(); await activate('#import-cancel'); await snapshot('cancel');
  if (kind === 'import') await choose();
  else await page.locator('#video-title').fill('合成未確認的新標題草稿');
  const links = await page.evaluate(() => Object.fromEntries(['reference-download', 'take-download', 'output-download'].map(id => [id, document.getElementById(id).href])));
  await page.evaluate(() => { window.recoveryKeyboard.armed = true; });
  await activate(kind === 'import' ? '#import-confirm' : '#save-title');
  await page.waitForFunction(async () => (await import('/storage.js')).storageUnconfirmed()); await idle();
  result.observation = await page.evaluate(() => structuredClone(window.recoveryKeyboard));
  const failed = result.observation.transactions.filter(tx => tx.inject); assert.equal(failed.length, 1);
  for (const name of ['error', 'abort']) assert(failed[0].events.some(event => event.name === name && event.isTrusted && event.error === 'ConstraintError'));
  assert(!failed[0].events.some(event => event.name === 'complete')); assert.deepEqual(result.observation.suppressed, ['complete', 'abort']);
  result.unknown = await page.evaluate(() => ({ focus: document.activeElement.id, busy: ['controls', 'compare', 'practice', 'library-panel'].map(id => document.getElementById(id).getAttribute('aria-busy')), modal: !!document.querySelector('dialog[open]'), disabled: ['controls', 'compare', 'practice', 'inventory-controls', 'import-controls', 'relink-controls', 'delete-controls', 'share-controls'].map(id => document.getElementById(id).disabled), status: document.getElementById('status').textContent, links: Object.fromEntries(['reference-download', 'take-download', 'output-download'].map(id => [id, document.getElementById(id).href])) }));
  await report('unknown-state', result);
  assert.equal(result.unknown.focus, 'storage-backup'); assert(result.unknown.busy.every(value => value === 'false')); assert(result.unknown.disabled.every(Boolean)); assert(!result.unknown.modal); assert.deepEqual(result.unknown.links, links);
  assert(await page.locator('#storage-backup').isVisible() && await page.locator('#storage-backup').isEnabled());
  const cdp = await page.context().newCDPSession(page);
  try {
    const nodes = (await cdp.send('Accessibility.getFullAXTree')).nodes;
    const alert = nodes.find(node => !node.ignored && node.role?.value === 'alert');
    // 只有空 alert 節點不足以證明可讀；必須保留它實際可讀的文字子節點。
    assert(alert && nodes.some(node => !node.ignored && node.parentId === alert.nodeId && node.name?.value?.includes('瀏覽器沒有確認這次保存是否完成或回復')));
    result.ax = nodes.filter(node => !node.ignored && (['alert', 'status', 'region'].includes(node.role?.value) || node.parentId === alert.nodeId || node.name?.value?.includes('另存本頁')));
    assert(result.ax.some(node => node.role.value === 'alert' && node.properties?.some(prop => prop.name === 'live' && prop.value.value === 'assertive')));
    assert(result.ax.some(node => node.name?.value === '另存本頁筆記備份'));
  } finally { await cdp.detach(); }
  const before = result.observation.transactions.filter(tx => tx.mode === 'readwrite').length;
  // 停用入口不接收鍵盤，操作封鎖另由既有 storageCompletion 單元確認，這裡驗真 DOM 與下載。
  for (const selector of ['#save-title', '#restore', '#reference-file', '#export', '#copy-reference']) assert(await page.locator(selector).isDisabled());
  const download = async (selector, label, expected) => {
    await tabTo(selector); const waiting = page.waitForEvent('download'); await page.keyboard.press('Enter'); const file = await waiting;
    const target = join(folder, label + '-' + file.suggestedFilename()); await file.saveAs(target); assert.equal(await file.failure(), null);
    const bytes = readFileSync(target); if (expected) assert(bytes.equals(readFileSync(expected)), label + ' changed full download bytes');
    result.downloads[label] = { bytes: bytes.length, sha256: hash(bytes) }; return bytes;
  };
  const backup = await download('#storage-backup', 'notes');
  const { parseBackup, validateBackup } = await import('../../web/library.js');
  const parsed = parseBackup(backup.toString()), expected = validateBackup(baseline.native.data);
  assert.deepEqual({ ...parsed, exportedAt: expected.exportedAt }, expected);
  for (const [selector, key] of [['#reference-download', 'reference'], ['#take-download', 'self'], ['#output-download', 'vs']]) await download(selector, key, fixtures[key]);
  await tabTo('#reference'); await page.keyboard.press('Space'); await page.waitForFunction(() => !document.getElementById('reference').paused);
  await page.keyboard.press('Space'); assert(await page.locator('#reference').evaluate(el => el.paused && el.controls)); result.readOnlyPlayback = true;
  await page.keyboard.press('Escape'); await snapshot('unknown');
  assert.equal(await page.evaluate(() => window.recoveryKeyboard.transactions.filter(tx => tx.mode === 'readwrite').length), before);
  // 真正 UI 匯入還原另用隔離 context；不能把空 context 當作舊資料恢復。此頁先驗相同頁面 reload。
  page.once('dialog', dialog => dialog.dismiss()); await activate('#storage-reopen'); assert.equal(page.url(), fixtures.origin + '/');
  assert(await page.evaluate(async () => (await import('/storage.js')).storageUnconfirmed()));
  page.on('dialog', async dialog => { await dialog.accept(); });
  const reloaded = page.waitForEvent('load'); await tabTo('#storage-reopen'); await page.keyboard.press('Enter'); await reloaded; await opened(); await idle();
  assert.equal(await page.evaluate(async () => (await import('/storage.js')).storageUnconfirmed()), false); await snapshot('reloaded');
  assert.equal(result.observation.mediaCalls, 0);
  const backupPath = join(folder, 'rescue-notes.json'); writeFileSync(backupPath, backup);
  const restoreContext = await page.context().browser().newContext();
  try {
    const restore = await restoreContext.newPage(); await restore.goto(fixtures.origin);
    await restore.waitForFunction(() => document.getElementById('storage-status').textContent.startsWith('此瀏覽器有 0'));
    await restore.locator('#restore').setInputFiles(backupPath);
    await restore.waitForFunction(() => document.getElementById('import-dialog').open && !document.getElementById('import-controls').disabled);
    for (let i = 0; i < 12 && !await restore.locator('#import-confirm').evaluate(el => document.activeElement === el); i++) await restore.keyboard.press('Tab');
    assert(await restore.locator('#import-confirm').evaluate(el => document.activeElement === el)); await restore.keyboard.press('Enter');
    await restore.waitForFunction(() => !document.getElementById('import-dialog').open && !document.getElementById('controls').disabled);
    const restored = await restore.evaluate(async () => (await (await import('/storage.js')).readLibrary()));
    for (const table of ['videos', 'assets', 'markers', 'takes', 'recipes', 'exports', 'moves']) assert.deepEqual(validateBackup(restored.data)[table], parsed[table]);
    result.restore = { revision: restored.revision, tableEquality: true, isolatedContextForImportOnly: true };
  } finally { await restoreContext.close(); }
  await report('complete', result);
  return { result, backup: join(folder, 'rescue-notes.json'), data: parsed, ids };
}
