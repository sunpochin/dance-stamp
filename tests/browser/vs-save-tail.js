/* 檔案用途：真正成檔後才驗證保存尾段的 Stop、原生拒絕及明示缺通知救援。所在層：合成瀏覽器回歸。主要關聯：main.js、storage.js、verify-vs-save-tail.ts。 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateBackup } from '../../web/library.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const cases = ['stop-complete', 'native-reject', 'unknown-abort', 'unknown-complete'];

export default async function verify(page, fixtures, folder, kind, report) {
  assert(cases.includes(kind));
  const result = { kind, snapshots: {}, downloads: {} }, originals = new Map();
  page.on('pageerror', error => { (result.pageErrors ||= []).push(String(error)); });
  const idle = () => page.waitForFunction(() => document.getElementById('compare').getAttribute('aria-busy') === 'false');
  const observe = () => page.evaluate(() => structuredClone(window.vsTail.log));
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => {
    const state = window.vsTail = { armed: false, target: null, hold: false, candidate: null, urls: new Map(), streams: [], recorders: [], log: { transactions: [], puts: [], clicks: [], createdUrls: [], revokedUrls: [], suppressed: [], opens: 0 } };
    const nativeTx = IDBDatabase.prototype.transaction, nativePut = IDBObjectStore.prototype.put, nativeOpen = IDBFactory.prototype.open;
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL, entries = new WeakMap();
    const capture = HTMLCanvasElement.prototype.captureStream, start = MediaRecorder.prototype.start;
    // 只觀察原生資源；不替換編碼 bytes、duration 或產品的停止／清理動作。
    HTMLCanvasElement.prototype.captureStream = function(...args) { const stream = capture.apply(this, args); state.streams.push(stream); return stream; };
    MediaRecorder.prototype.start = function(...args) { state.recorders.push(this); return start.apply(this, args); };
    URL.createObjectURL = function(blob) { const url = create.call(this, blob); state.urls.set(url, blob); state.log.createdUrls.push(url); return url; };
    URL.revokeObjectURL = function(url) { state.log.revokedUrls.push(url); return revoke.call(this, url); };
    IDBFactory.prototype.open = function(...args) { state.log.opens++; return nativeOpen.apply(this, args); };
    document.addEventListener('click', event => { if (event.target.id === 'stop') state.log.clicks.push({ id: 'stop', trusted: event.isTrusted, at: performance.now() }); }, true);
    IDBDatabase.prototype.transaction = function(...args) {
      const tx = nativeTx.apply(this, args), add = tx.addEventListener.bind(tx);
      const entry = { id: state.log.transactions.length, mode: tx.mode, stores: [...tx.objectStoreNames], events: [] };
      entries.set(tx, entry); state.log.transactions.push(entry);
      for (const type of ['complete', 'abort', 'error']) add(type, event => entry.events.push({ type, trusted: event.isTrusted, at: performance.now(), target: event.target === tx ? 'transaction' : 'request', error: event.target.error?.name }), true);
      // 只遮住產品收到的結束通知；另保留真正原生收據，不能把注入冒充 Safari 自然故障。
      tx.addEventListener = function(type, callback, options) {
        if (!['complete', 'abort'].includes(type)) return add(type, callback, options);
        return add(type, function(event) {
          if (tx === state.target && state.kind.startsWith('unknown-')) { state.log.suppressed.push({ type, trusted: event.isTrusted }); return; }
          return typeof callback === 'function' ? callback.call(this, event) : callback.handleEvent(event);
        }, options);
      };
      return tx;
    };
    IDBObjectStore.prototype.put = function(...args) {
      const req = nativePut.apply(this, args), tx = this.transaction, entry = entries.get(tx);
      const put = { transactionId: entry.id, store: this.name, key: args[1], native: req instanceof IDBRequest, events: [] };
      state.log.puts.push(put);
      req.addEventListener('success', event => put.events.push({ type: 'success', trusted: event.isTrusted }));
      if (state.armed && this.name === 'media' && args[0] instanceof Blob) {
        state.armed = false; state.target = tx; state.hold = true;
        state.candidate = { id: args[1], blob: args[0], transactionId: entry.id };
        // 目標一定是成檔後的 media put，避開匯出準備的 metadata-only 交易；延長期間仍是真交易。
        const keep = () => {
          if (!state.hold) return;
          const get = tx.objectStore('metadata').get('library');
          get.onsuccess = () => { state.candidate.metadata = get.result; state.candidate.ticks = (state.candidate.ticks || 0) + 1; if (state.releaseRequested) state.finish(); else keep(); };
        };
        keep();
        state.finish = () => {
          state.hold = false;
          if (state.kind === 'stop-complete') return;
          // 重複既有主鍵，讓原生引擎發出 trusted ConstraintError；不 throw、不偽造 error 或 abort。
          const request = tx.objectStore('metadata').add({ synthetic: true }, 'library');
          if (state.kind === 'unknown-complete') request.addEventListener('error', event => event.preventDefault());
        };
      }
      return req;
    };
  });
  const ui = () => page.evaluate(async () => {
    const storage = await import('/storage.js');
    return { unknown: storage.storageUnconfirmed(), status: document.getElementById('status').textContent, outputStatus: document.getElementById('output-status').textContent,
      busy: ['controls', 'compare', 'library-panel', 'practice'].map(id => document.getElementById(id).getAttribute('aria-busy')),
      links: Object.fromEntries(['reference-download', 'take-download', 'output-download'].map(id => [id, document.getElementById(id).href])),
      sources: ['reference', 'self'].map(id => document.getElementById(id).currentSrc), diagnostics: JSON.parse(document.getElementById('diagnostics').textContent),
      transactions: window.vsTail.log.transactions.length, opens: window.vsTail.log.opens,
      recorders: window.vsTail.recorders.map(r => r.state), tracks: window.vsTail.streams.flatMap(s => s.getTracks().map(t => ({ kind: t.kind, state: t.readyState }))) };
  });
  const snapshot = async label => {
    const value = await page.evaluate(async () => {
      const storage = await import('/storage.js');
      if (storage.storageUnconfirmed()) throw new Error('QA 禁止在未知狀態重讀 DB');
      const db = await storage.openStore(), tx = db.transaction(['metadata', 'media', 'chunks']);
      const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      const rows = await Promise.all([...tx.objectStoreNames].map(async name => ({ name, keys: await request(tx.objectStore(name).getAllKeys()), values: await request(tx.objectStore(name).getAll()) })));
      for (const row of rows) for (let i = 0; i < row.values.length; i++) if (row.values[i] instanceof Blob) {
        const blob = row.values[i], bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = ''; for (let j = 0; j < bytes.length; j += 8192) binary += String.fromCharCode(...bytes.subarray(j, j + 8192));
        row.values[i] = { bytes: bytes.length, type: blob.type, base64: btoa(binary) };
      }
      return rows;
    });
    for (const row of value) row.values.forEach((item, i) => {
      if (!item?.base64) return;
      const bytes = Buffer.from(item.base64, 'base64'); delete item.base64;
      assert.equal(bytes.length, item.bytes); item.sha256 = hash(bytes);
      writeFileSync(join(folder, `${label}-${row.name}-${i}.bin`), bytes);
      const key = row.name + ':' + JSON.stringify(row.keys[i]);
      if (originals.has(key)) assert(bytes.equals(originals.get(key)), 'existing Blob bytes changed');
      else originals.set(key, bytes);
    });
    result.snapshots[label] = value; return value;
  };
  const metadata = snap => snap.find(x => x.name === 'metadata').values[0];
  const download = async (selector, label) => {
    // 備份已收進次要工具；走使用者的展開步驟，避免把隱藏按鈕逾時誤判為保存失敗。
    if (selector === '#backup' && !await page.locator('#note-tools').evaluate(details => details.open)) await page.locator('#note-tools > summary').click();
    const waiting = page.waitForEvent('download');
    if (selector.startsWith('blob:')) {
      // 產品 CSP 不開放 fetch(blob:)；沿原生下載驗 URL，不能為 QA 放寬 connect-src。
      await page.evaluate(url => { const a = document.createElement('a'); a.href = url; a.download = 'preserved-old-vs.mp4'; a.click(); }, selector);
    } else await page.locator(selector).click();
    const file = await waiting;
    const path = join(folder, label + '.' + file.suggestedFilename().split('.').pop()); await file.saveAs(path);
    const bytes = readFileSync(path); result.downloads[label] = { path, bytes: bytes.length, sha256: hash(bytes) }; return bytes;
  };
  const assertOld = (after, before) => {
    assert.deepEqual(after.find(x => x.name === 'chunks'), before.find(x => x.name === 'chunks'));
    for (const row of before) for (let i = 0; i < row.keys.length; i++) if (row.name !== 'metadata') {
      const actual = after.find(x => x.name === row.name), index = actual.keys.indexOf(row.keys[i]);
      assert(index >= 0); assert.deepEqual(actual.values[index], row.values[i]);
    }
    const next = metadata(after).data, old = metadata(before).data;
    for (const key of Object.keys(old).filter(key => !['assets', 'exports'].includes(key))) assert.deepEqual(next[key], old[key]);
    for (const key of ['assets', 'exports']) for (const item of old[key]) assert.deepEqual(next[key].find(x => x.id === item.id), item);
  };
  try {
    await page.goto(fixtures.origin); await page.waitForFunction(() => !document.getElementById('controls').disabled);
    assert.equal(await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).revision), 0, 'fresh profile only; no DB clearing');
    await page.locator('#existing-mode').click();
    for (const [id, file] of [['reference-file', fixtures.reference], ['self-file', fixtures.self]]) {
      await page.locator('#' + id).setInputFiles(file); await idle();
      assert(await page.locator(id === 'reference-file' ? '#reference-download' : '#take-download').isVisible(), 'synthetic input prerequisite: ' + await page.locator('#status').textContent());
    }
    for (const [id, value] of [['start', '2'], ['end', '5'], ['offset', '1']]) { await page.locator('#' + id).fill(value); await page.locator('#' + id).press('Tab'); await idle(); }
    await page.locator('#self-mirror').setChecked(true); await idle();
    await page.locator('#video-title').fill('合成保存尾段筆記'); await page.locator('#save-title').click(); await idle();
    await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成保存尾段標記'); await page.locator('#marker-note').fill('保存失敗也必須保留完整筆記');
    await page.getByRole('button', { name: '儲存標記', exact: true }).click(); await idle();
    for (const id of ['copy-reference', 'copy-self', 'export']) { await page.locator('#' + id).click(); await idle(); }
    assert.match(await page.locator('#status').textContent(), /已成檔並保存在/);
    const before = await snapshot('before'), baseline = metadata(before), previous = await ui();
    assert(baseline.data.markers[0].note && baseline.data.exports.length === 1 && before.find(x => x.name === 'media').keys.length === 3);
    const oldVs = await download('#output-download', 'old-vs');
    for (const [id, file] of [['reference-download', fixtures.reference], ['take-download', fixtures.self]]) assert((await download('#' + id, 'before-' + id)).equals(readFileSync(file)));
    // 庫存另存使用獨立 URL；新 VS 合成成功會正常替換 output 連結，不能誤稱舊 output URL 永不撤銷。
    await page.locator('#media-inventory').evaluate(el => { el.open = true; }); await page.locator('#refresh-media').click(); await idle();
    const oldAsset = baseline.data.exports[0].assetId;
    assert((await download(`[data-focus-key="asset:${oldAsset}:download"]`, 'old-vs-inventory')).equals(oldVs)); await idle();
    const oldUrl = await page.evaluate(() => window.vsTail.log.createdUrls.at(-1));
    await page.evaluate(kind => { window.vsTail.kind = kind; window.vsTail.armed = true; }, kind);
    await page.locator('#export').click();
    await page.waitForFunction(() => {
      const s = window.vsTail, c = s.candidate; if (!c?.metadata || c.ticks < 2) return false;
      const puts = s.log.puts.filter(p => p.transactionId === c.transactionId);
      return puts.length === 2 && puts.every(p => p.native && p.events.some(e => e.type === 'success' && e.trusted)) && !s.log.transactions[c.transactionId].events.some(e => ['complete', 'abort'].includes(e.type));
    });
    result.barrier = await observe(); result.pendingUi = await ui();
    const candidate = await page.evaluate(async () => {
      const c = window.vsTail.candidate, bytes = new Uint8Array(await c.blob.arrayBuffer());
      return { id: c.id, transactionId: c.transactionId, metadata: c.metadata, type: c.blob.type, bytes: [...bytes] };
    });
    const candidateBytes = Buffer.from(candidate.bytes); delete candidate.bytes; result.candidate = { ...candidate, sha256: hash(candidateBytes), bytes: candidateBytes.length };
    assert(Math.abs(candidate.metadata.data.assets.find(a => a.id === candidate.id).durationMs - 3000) <= 100, 'new Blob must reach persistExport through original duration guard');
    // 匯出準備會先正常提交同資料的新 revision；尾段拒絕必須回到這份最後確認資料，不能誤比準備前 revision。
    const confirmed = structuredClone(before); metadata(confirmed).revision = candidate.metadata.revision - 1;
    assert.equal(metadata(confirmed).revision, baseline.revision + 1);
    writeFileSync(join(folder, 'candidate.bin'), candidateBytes);
    assert((await download('#output-download', 'pending-new-vs')).equals(candidateBytes));
    await page.locator('#stop').click(); await page.waitForTimeout(250);
    const pending = await observe(); result.afterStop = pending;
    assert(pending.clicks.some(x => x.trusted)); assert(!pending.transactions[candidate.transactionId].events.some(x => ['complete', 'abort'].includes(x.type)));
    assert.equal((await ui()).busy[1], 'true', 'Stop must not discard completed VS transaction');
    await report('real-vs-pending-after-stop', result);
    // 只解除自己的原生讀取 hold；在 request callback 內排入衝突，避免交易已失效才呼叫 add。
    await page.evaluate(() => { window.vsTail.releaseRequested = true; });
    await idle(); result.afterUi = await ui(); result.events = await observe();
    assert(result.afterUi.busy.every(x => x === 'false'));
    assert(result.afterUi.recorders.every(x => x === 'inactive') && result.afterUi.tracks.every(x => x.state === 'ended'));
    const tx = result.events.transactions[candidate.transactionId], outcome = kind === 'stop-complete' || kind === 'unknown-complete' ? 'complete' : 'abort';
    assert(tx.events.some(e => e.type === outcome && e.trusted && e.target === 'transaction'));
    if (kind !== 'stop-complete') assert(tx.events.some(e => e.type === 'error' && e.trusted && e.error === 'ConstraintError'));
    assert.equal(result.afterUi.unknown, kind.startsWith('unknown-'));
    assert.deepEqual(result.afterUi.sources, previous.sources);
    for (const id of ['reference-download', 'take-download']) assert.equal(result.afterUi.links[id], previous.links[id]);
    assert.equal(result.afterUi.links['output-download'], result.pendingUi.links['output-download']);
    assert((await download('#output-download', 'rescued-new-vs')).equals(candidateBytes));
    for (const [id, file] of [['reference-download', fixtures.reference], ['take-download', fixtures.self]]) assert((await download('#' + id, 'after-' + id)).equals(readFileSync(file)));
    assert((await download(oldUrl, 'preserved-old-url')).equals(oldVs)); assert(!result.events.revokedUrls.includes(oldUrl));
    const backupBytes = await download(kind.startsWith('unknown-') ? '#storage-backup' : '#backup', 'rescued-notes');
    const backup = JSON.parse(backupBytes), expected = kind === 'stop-complete' ? candidate.metadata.data : baseline.data;
    assert.deepEqual({ ...backup, exportedAt: expected.exportedAt }, validateBackup(expected));
    if (kind.startsWith('unknown-')) {
      assert.match(result.afterUi.status, /保存狀態未確認/);
      assert(result.events.suppressed.some(e => e.type === outcome && e.trusted));
      await page.evaluate(() => { document.getElementById('export').dispatchEvent(new MouseEvent('click', { bubbles: true })); document.getElementById('refresh-media').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const sealed = await ui();
      assert.equal(sealed.transactions, result.afterUi.transactions); assert.equal(sealed.opens, result.afterUi.opens);
      result.noDatabaseRetry = true;
      // 未確認期間不再讀 DB；只有產品明確同頁重載，才根據真實讀回結果判定持久內容。
      await page.locator('#storage-reopen').click(); await page.waitForFunction(() => !document.getElementById('controls').disabled);
    } else {
      await idle();
      if (kind === 'native-reject') assert.match(result.afterUi.status, /已成檔但無法保存/);
    }
    const after = await snapshot('after'); assertOld(after, before);
    if (outcome === 'abort') assert.deepEqual(after, confirmed);
    else {
      assert.deepEqual(metadata(after), candidate.metadata); assert.equal(after.find(x => x.name === 'media').values.length, 4);
      assert(originals.get('media:' + JSON.stringify(candidate.id)).equals(candidateBytes), 'committed native Blob must equal actual download');
    }
    let finalSnapshot = after;
    if (kind === 'native-reject') {
      // 產品沒有「重存同一 Blob」入口；只驗同原片／配方重新成檔，不假稱同候選 byte 重試。
      await page.locator('#export').click(); await idle(); assert.match(await page.locator('#status').textContent(), /已成檔並保存在/);
      await download('#output-download', 'retry-new-vs'); finalSnapshot = await snapshot('retry'); assertOld(finalSnapshot, before);
      assert.equal(metadata(finalSnapshot).data.exports.length, 2); result.retry = 'same sources and recipe; freshly encoded Blob';
    }
    if (!kind.startsWith('unknown-')) { await page.reload(); await page.waitForFunction(() => !document.getElementById('controls').disabled); assert.deepEqual(await snapshot('reopened'), finalSnapshot); }
    result.firstReadOutcome = outcome === 'abort' ? 'old-library-after-preparation' : 'new-vs-committed';
    result.reopenOutcome = kind === 'native-reject' ? 'fresh-vs-after-retry' : result.firstReadOutcome;
    await report('tail-preservation-and-reopen', result);
    return result;
  } catch (error) { result.failure = String(error); result.failureObservation = await observe().catch(() => null); result.failureUi = await ui().catch(() => null); await report('failure', result); throw error; }
}
