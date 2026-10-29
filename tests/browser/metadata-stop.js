/* 檔案用途：驗證可取消UI保存的原生Stop、舊資料／影片保留及同輸入重試。所在層：合成瀏覽器回歸。主要關聯：main.js、storage.js、issue-13-unconfirmed-storage.md。 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export const metadataStopCases = ['title', 'marker-edit', 'marker-delete', 'move-create', 'reference-select', 'self-select', 'confirm-link', 'preview-prepare', 'export-prepare', 'comparison-queue'];
export default async function metadataStop(page, fixtures, folder, report, options = {}) {
  const kind = options.kind || 'title'; assert(metadataStopCases.includes(kind));
  const result = { scope: 'UI metadata and actual Stop click; synthetic existing files. Not camera, Safari/private or completed VS-save Stop.', snapshots: {}, downloads: {} }, buffers = new Map();
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
  const observation = () => page.evaluate(() => structuredClone(window.metadataStop));
  // 測試只刪合成資料；明確接受真正confirm，不能讓自動dismiss誤當成交易取消。
  page.on('dialog', async dialog => { (result.dialogs ||= []).push({ type: dialog.type() }); await dialog.accept(); });
  await page.addInitScript(() => {
    const state = window.metadataStop = { phase: 'baseline', transactions: [], puts: [], clicks: [], armed: false, hold: null };
    const transactions = new WeakMap(), nativeTransaction = IDBDatabase.prototype.transaction, nativePut = IDBObjectStore.prototype.put;
    document.addEventListener('change', event => { if (event.target.id === 'reference-file' && event.target.files[0]) window.metadataStopReferenceFile = event.target.files[0]; }, true);
    document.addEventListener('click', event => { if (['copy-reference', 'play', 'export', 'stop'].includes(event.target.id)) state.clicks.push({ phase: state.phase, id: event.target.id, at: performance.now(), isTrusted: event.isTrusted }); }, true);
    IDBDatabase.prototype.transaction = function(...args) {
      const tx = nativeTransaction.apply(this, args), entry = { id: state.transactions.length + 1, phase: state.phase, mode: tx.mode, stores: [...tx.objectStoreNames], at: performance.now(), events: [] };
      transactions.set(tx, entry); state.transactions.push(entry);
      for (const kind of ['error', 'abort', 'complete']) tx.addEventListener(kind, event => entry.events.push({ kind, at: performance.now(), isTrusted: event.isTrusted, target: event.target === tx ? 'transaction' : 'request', error: event.target.error?.name || null }), true);
      return tx;
    };
    IDBObjectStore.prototype.put = function(...args) {
      const request = nativePut.apply(this, args), tx = this.transaction, transaction = transactions.get(tx);
      const entry = { transactionId: transaction?.id, phase: state.phase, store: this.name, key: args[1], at: performance.now(), nativeRequest: request instanceof IDBRequest, readyState: request.readyState,
        bytes: args[0] instanceof Blob ? args[0].size : null, sameReferenceFile: args[0] === window.metadataStopReferenceFile, metadata: this.name === 'metadata' ? structuredClone(args[0]) : null, events: [] };
      state.puts.push(entry);
      for (const kind of ['success', 'error']) request.addEventListener(kind, event => entry.events.push({ kind, at: performance.now(), isTrusted: event.isTrusted, error: request.error?.name || null }));
      if (state.armed && this.name === 'metadata' && args[1] === 'library') {
        state.armed = false;
        const hold = state.hold = { transactionId: transaction.id, at: performance.now(), enabled: true, ticks: 0, nativePutReturned: entry.nativeRequest, requestReadyState: entry.readyState };
        // 只在真正metadata put後加原生get延長交易；只讓產品Stop發signal／abort，不偽造事件。
        const keepAlive = () => {
          if (!hold.enabled) return;
          const get = tx.objectStore('metadata').get('library');
          get.onsuccess = () => { hold.ticks++; hold.candidate = structuredClone(get.result); keepAlive(); };
        };
        keepAlive();
      }
      return request;
    };
  });
  const snapshot = async label => {
    const value = await page.evaluate(async () => {
      const storage = await import('/storage.js'), db = await storage.openStore();
      const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      const native = await request(db.transaction('metadata').objectStore('metadata').get('library')), library = await storage.readLibrary(), keys = await storage.readMediaKeys(), media = [];
      for (const id of keys) {
        const blob = await storage.readMedia(id);
        const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
        // MP4 的 codecs MIME 本身可能含逗號；必須找 base64 分隔符，不能把 codec 當成檔案 bytes。
        const marker = ';base64,'; if (!dataUrl.includes(marker)) throw new Error('QA FileReader 沒有 base64 分隔符');
        media.push({ id, type: blob.type, bytes: blob.size, base64: dataUrl.slice(dataUrl.indexOf(marker) + marker.length) });
      }
      const links = Object.fromEntries(['reference-download', 'take-download', 'output-download'].map(id => { const a = document.getElementById(id); return [id, { href: a.href, hidden: a.hidden }]; }));
      return { native, library, keys, media, links, sources: Object.fromEntries(['reference', 'self', 'output'].map(id => [id, document.getElementById(id).currentSrc])), unknown: storage.storageUnconfirmed(), status: document.getElementById('status').textContent,
        busy: Object.fromEntries(['controls', 'compare'].map(id => [id, document.getElementById(id).getAttribute('aria-busy')])), diagnostics: JSON.parse(document.getElementById('diagnostics').textContent) };
    });
    for (const item of value.media) {
      const bytes = Buffer.from(item.base64, 'base64'); delete item.base64;
      assert.equal(bytes.length, item.bytes); item.sha256 = hash(bytes); item.file = join(folder, `${label}-${item.id}.bin`); writeFileSync(item.file, bytes);
      if (label === 'baseline') buffers.set(item.id, bytes);
      else if (buffers.has(item.id)) { item.fullBytesEqualBaseline = bytes.equals(buffers.get(item.id)); assert(item.fullBytesEqualBaseline, label + ' changed native Blob bytes'); }
    }
    result.snapshots[label] = value; return value;
  };
  const sameData = (actual, expected) => {
    assert.deepEqual(actual.native, expected.native); assert.deepEqual(actual.library, expected.library); assert.deepEqual(actual.keys, expected.keys);
    assert.deepEqual(actual.media.map(x => [x.id, x.type, x.bytes, x.sha256]), expected.media.map(x => [x.id, x.type, x.bytes, x.sha256]));
  };
  const downloadAll = async label => {
    const files = {};
    for (const id of ['reference-download', 'take-download', 'output-download']) {
      const waiting = page.waitForEvent('download'); await page.locator('#' + id).click(); const download = await waiting;
      const file = join(folder, label + '-' + id + '.' + download.suggestedFilename().split('.').pop()); await download.saveAs(file);
      const bytes = readFileSync(file); files[id] = { file, bytes: bytes.length, sha256: hash(bytes) };
    }
    result.downloads[label] = files; return files;
  };
  let markerId;
  const trigger = async () => {
    if (kind === 'reference-select' || kind === 'self-select') await page.locator(kind === 'reference-select' ? '#reference-file' : '#self-file').setInputFiles(kind === 'reference-select' ? fixtures.reference : fixtures.self);
    else if (kind === 'marker-edit') await page.locator('#marker-form button[type="submit"]').click();
    else if (kind === 'marker-delete') await page.locator(`[data-focus-key="marker:${markerId}:delete"]`).click();
    else if (kind === 'move-create') await page.locator('#move-form button[type="submit"]').click();
    else await page.locator({ title: '#save-title', 'confirm-link': '#confirm-link', 'preview-prepare': '#play', 'export-prepare': '#export', 'comparison-queue': '#play' }[kind]).click();
  };
  try {
    await page.goto(fixtures.origin); await idle();
    assert.equal((await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).revision)), 0, 'refuse existing library; no clearing');
    await page.locator('#existing-mode').click();
    await page.locator('#reference-file').setInputFiles(fixtures.reference); await idle();
    await page.locator('#self-file').setInputFiles(fixtures.self); await idle();
    for (const [id, value] of [['start', '2'], ['end', '5'], ['offset', '1']]) { await page.locator('#' + id).fill(value); await page.locator('#' + id).press('Tab'); await idle(); }
    await page.locator('#video-title').fill('合成產品停止保護筆記'); await page.locator('#save-title').click(); await idle();
    await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成既有標記'); await page.locator('#marker-note').fill('停止副本保存不能改掉這段非空筆記');
    await page.getByRole('button', { name: '儲存標記', exact: true }).click(); await idle();
    await page.locator('#copy-reference').click(); await idle(); await page.locator('#copy-self').click(); await idle();
    await page.locator('#export').click(); await idle();
    assert((await page.locator('#status').textContent()).includes('已成檔並保存在'), 'baseline VS must really be saved');
    const initial = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data); markerId = initial.markers[0].id;
    if (kind === 'title') await page.locator('#video-title').fill('合成停止後同候選重試標題');
    if (kind === 'marker-edit') { await page.locator(`[data-focus-key="marker:${markerId}:edit"]`).click(); await idle(); await page.locator('#marker-note').fill('合成停止後重試的新筆記'); }
    if (kind === 'move-create') {
      await page.locator('#library-panel details').filter({ has: page.locator('#move-form') }).locator('summary').click();
      await page.locator('#move-name').fill('合成停止後重試動作'); await page.locator('#move-style').fill('合成舞風');
    }
    if (kind === 'confirm-link') {
      // 以產品匯入建立缺片筆記；不直接修改產品內部狀態或資料庫。
      const incoming = { ...initial, sourceLibraryId: crypto.randomUUID(), exportedAt: new Date().toISOString(), videos: [{ ...initial.videos[0], id: crypto.randomUUID(), title: '合成待連結筆記' }], assets: [], markers: [], takes: [], recipes: [], exports: [], moves: [] };
      const file = join(folder, 'synthetic-note-without-media.json'); writeFileSync(file, JSON.stringify(incoming));
      await page.locator('#restore').setInputFiles(file); await idle(); await page.locator('#import-confirm').click(); await idle();
      const id = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data.videos.find(v => v.title === '合成待連結筆記').id);
      await page.locator('#library').selectOption(id); await page.locator('#open-library').click(); await idle();
      await page.locator('#reference-file').setInputFiles(fixtures.reference); await idle(); assert(await page.locator('#confirm-link').isVisible());
    }
    const baseline = await snapshot('baseline');
    assert(baseline.native.data.videos[0].title && baseline.native.data.markers[0].note && baseline.native.data.takes.length && baseline.native.data.exports.length === 1 && baseline.keys.length === 3);
    const baselineDownloads = await downloadAll('baseline');
    const referenceId = baseline.native.data.assets.find(x => x.kind === 'reference').id;
    for (const [id, kind] of [['reference-download', 'reference'], ['take-download', 'take'], ['output-download', 'vs']]) {
      const asset = baseline.native.data.assets.find(x => x.kind === kind), blob = baseline.media.find(x => x.id === asset.id);
      assert.equal(baselineDownloads[id].sha256, blob.sha256); assert(readFileSync(baselineDownloads[id].file).equals(buffers.get(asset.id)));
    }
    assert.equal(baselineDownloads['reference-download'].sha256, hash(readFileSync(fixtures.reference)));
    await report('baseline-real-vs-and-native-bytes', result);
    result.kind = kind;
    await page.evaluate(() => { window.metadataStop.phase = 'cancel'; window.metadataStop.armed = true; });
    if (kind === 'comparison-queue') { await page.locator('#offset').fill('1.1'); await page.locator('#offset').press('Tab'); }
    else await trigger();
    await page.waitForFunction(() => {
      const a = window.metadataStop, h = a.hold; if (!h || h.ticks < 2 || !h.candidate) return false;
      const tx = a.transactions.find(t => t.id === h.transactionId), put = a.puts.find(p => p.transactionId === tx.id && p.store === 'metadata');
      return put.nativeRequest && put.readyState === 'pending' && put.events.some(e => e.kind === 'success' && e.isTrusted) && !tx.events.some(e => ['abort', 'complete'].includes(e.kind));
    });
    result.barrier = await observation(); await report('trusted-metadata-uncommitted-before-stop', result);
    if (kind === 'comparison-queue') {
      await trigger();
      await page.waitForFunction(() => window.metadataStop.clicks.some(c => c.phase === 'cancel' && c.id === 'play' && c.isTrusted) && document.getElementById('controls').disabled && document.getElementById('library-panel').getAttribute('aria-busy') === 'true');
      result.operationBarrier = await page.evaluate(() => ({ controlsDisabled: document.getElementById('controls').disabled, libraryBusy: document.getElementById('library-panel').getAttribute('aria-busy'), compareBusy: document.getElementById('compare').getAttribute('aria-busy'), clicks: structuredClone(window.metadataStop.clicks) }));
    }
    await page.locator('#stop').click();
    if (kind === 'comparison-queue') {
      // 新操作等待舊佇列時的Stop不能取消舊交易；解除自己的hold後，舊佇列提交、新操作才回取消。
      await page.waitForTimeout(250); result.pendingAfterStop = await observation();
      const observed = result.pendingAfterStop, tx = observed.transactions.find(t => t.id === observed.hold.transactionId);
      assert(observed.clicks.some(c => c.id === 'stop' && c.isTrusted) && !tx.events.some(e => ['abort', 'complete'].includes(e.kind)));
      // fieldset不在Playwright原生控制項清單；核對實際disabled屬性與產品busy，不能用isDisabled誤判。
      result.pendingUiAfterStop = await page.evaluate(() => ({ controlsDisabled: document.getElementById('controls').disabled, libraryBusy: document.getElementById('library-panel').getAttribute('aria-busy'), compareBusy: document.getElementById('compare').getAttribute('aria-busy') }));
      assert(result.pendingUiAfterStop.controlsDisabled && result.pendingUiAfterStop.libraryBusy === 'true' && result.pendingUiAfterStop.compareBusy === 'true');
      await page.evaluate(() => { window.metadataStop.hold.enabled = false; }); await idle();
      const committed = await snapshot('committed'); assert.deepEqual(committed.native, observed.hold.candidate); assert.equal(committed.unknown, false);
      result.afterStopObservation = await observation(); const ended = result.afterStopObservation.transactions.find(t => t.id === tx.id);
      assert(ended.events.some(e => e.kind === 'complete' && e.isTrusted)); assert.equal(committed.diagnostics.lastError, 'cancelled'); assert(committed.status.includes('已停止'));
      assert.equal(result.afterStopObservation.puts.filter(p => p.phase === 'cancel' && p.store === 'metadata').length, 1);
      assert.deepEqual(committed.keys, baseline.keys); assert.deepEqual(committed.links, baseline.links); assert.deepEqual(committed.sources, baseline.sources);
      await page.reload(); await idle(); sameData(await snapshot('reload'), committed); result.independentQueueRetained = true; result.passed = true; await report('independent-queue-complete-new-operation-cancelled', result); return result;
    }
    await idle(); result.afterStopObservation = await observation();
    const observed = result.afterStopObservation, tx = observed.transactions.find(t => t.id === observed.hold.transactionId);
    assert(observed.clicks.some(c => c.id === 'stop' && c.isTrusted)); assert(tx.events.some(e => e.kind === 'abort' && e.isTrusted && e.target === 'transaction') && !tx.events.some(e => e.kind === 'complete'));
    assert(!observed.puts.some(p => p.transactionId === tx.id && p.store === 'media'), 'target must be metadata preparation, not VS storage');
    const cancelled = await snapshot('cancelled'); sameData(cancelled, baseline); assert.equal(cancelled.unknown, false); assert.equal(cancelled.diagnostics.lastError, 'cancelled');
    assert(Object.values(cancelled.busy).every(v => v === 'false') && cancelled.status.includes('已停止')); assert.deepEqual(cancelled.links, baseline.links); assert.deepEqual(cancelled.sources, baseline.sources);
    const cancelledDownloads = await downloadAll('cancelled'); for (const id of Object.keys(baselineDownloads)) assert(readFileSync(cancelledDownloads[id].file).equals(readFileSync(baselineDownloads[id].file)));
    await report('trusted-abort-full-old-data-and-downloads-preserved', result);
    await page.evaluate(() => { window.metadataStop.hold.enabled = false; window.metadataStop.phase = 'retry'; }); await trigger(); await idle();
    result.retryObservation = await observation(); const puts = result.retryObservation.puts.filter(p => p.phase === 'retry' && p.store === 'metadata'); assert(puts.length);
    for (const put of puts) { const row = result.retryObservation.transactions.find(t => t.id === put.transactionId); assert(row.events.some(e => e.kind === 'complete' && e.isTrusted) && !row.events.some(e => e.kind === 'abort')); }
    const retried = await snapshot('retry'); assert(retried.native.revision > baseline.native.revision && !retried.unknown);
    for (const item of baseline.media) assert(retried.media.some(m => m.id === item.id && m.sha256 === item.sha256 && m.fullBytesEqualBaseline));
    // 重選檔／新增動作會重新產生ID；沿相同來源bytes／表單語意驗證，不固定產品ID。
    if (!['reference-select', 'self-select', 'confirm-link', 'move-create'].includes(kind)) assert.deepEqual(puts[0].metadata, observed.hold.candidate);
    else if (kind === 'move-create') assert(retried.native.data.moves.some(m => m.name === '合成停止後重試動作'));
    else if (kind === 'confirm-link') assert(retried.native.data.assets.some(a => a.kind === 'reference' && a.videoId !== initial.videos[0].id && a.byteLength === readFileSync(fixtures.reference).length));
    else assert.equal(retried.native.data[kind === 'reference-select' ? 'videos' : 'takes'].length, baseline.native.data[kind === 'reference-select' ? 'videos' : 'takes'].length + 1);
    await page.reload(); await idle(); sameData(await snapshot('reload'), retried);
    result.passed = true; await report('same-input-retry-native-complete-and-reload', result); return result;
  } catch (error) { result.failure = { name: error.name, message: error.message }; result.failureObservation = await observation().catch(() => null); await report('metadata-stop-failure', result); throw error; }
}
