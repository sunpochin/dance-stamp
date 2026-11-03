/* 用途：觀察本輪 PTS Worker／Blob 的真實保全收據；所在層：合成瀏覽器測試；關聯：webkit-audio-branch.js、explicit-pts-owner.js。 */
export function installPtsAudit() {
  if (window.__ptsAudit) throw Error('PTS audit already installed');
  const NativeWorker = window.Worker, create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  const audit = window.__ptsAudit = { mode: 'pass', workers: [], blobs: new Map(), created: [], revoked: [], markerCount: 0 };
  URL.createObjectURL = function(blob) { const url = create.call(this, blob); audit.blobs.set(url, blob); audit.created.push(url); return url; };
  URL.revokeObjectURL = function(url) { audit.revoked.push(url); return revoke.call(this, url); };
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      const target = new URL(String(url), location.href);
      if (target.origin !== location.origin || target.pathname !== '/export-pts-worker.js') return;
      const row = this.__ptsRow = { mode: audit.mode, requestId: null, markers: [], errors: [], messages: 0, held: null, terminateCalls: 0, terminateReturns: 0, terminateErrors: [] };
      audit.workers.push(row);
      // 原生 MessageEvent 先到此處；hold-result 只延後交付同一份真 Blob，不造完成事件或假 Blob。
      this.addEventListener('message', event => {
        if (!event.isTrusted || event.target !== this) return;
        if (event.data?.__dancePtsQaMarker) { row.markers.push({ ...event.data, trusted: event.isTrusted }); audit.markerCount++; }
        if (event.data?.id !== row.requestId) return;
        row.messages++;
        if (event.data?.kind === 'error') row.errors.push({ ...event.data.error, trusted: event.isTrusted, diagnostics: event.data.diagnostics });
        if (row.mode === 'hold-result' && event.data?.kind === 'result') {
          if (row.held) throw Error('duplicate native result');
          row.held = { event, handler: this.onmessage, delivered: false, nativeBlob: event.data.blob instanceof Blob, bytes: event.data.blob?.size, trusted: event.isTrusted };
          event.stopImmediatePropagation();
        }
      }, { capture: true });
    }
    postMessage(...args) { if (this.__ptsRow && args[0]?.kind === 'export') this.__ptsRow.requestId = args[0].id; return super.postMessage(...args); }
    terminate() {
      const row = this.__ptsRow; if (row) row.terminateCalls++;
      try { const value = super.terminate(); if (row) row.terminateReturns++; return value; }
      catch (error) { if (row) row.terminateErrors.push(error.name); throw error; }
    }
  };
  audit.sha = async blob => {
    if (!(blob instanceof Blob) || !blob.size) throw Error('missing retained source Blob');
    return { bytes: blob.size, mime: blob.type, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('') };
  };
  audit.snapshot = async () => {
    const store = await import('/storage.js'); if (store.storageUnconfirmed()) throw Error('unknown DB: audit refuses further read');
    const { data } = await store.readLibrary();
    const urls = ['reference', 'self'].map(id => document.getElementById(id).getAttribute('src'));
    const output = document.getElementById('output-download').getAttribute('href');
    const bytes = await Promise.all([...urls, output].map(url => audit.sha(audit.blobs.get(url))));
    const savedExports = await Promise.all(data.exports.map(async row => ({ id: row.id, assetId: row.assetId, fingerprint: await audit.sha(await store.readMedia(row.assetId)) })));
    return { data, urls, output, bytes, savedExports, sourcePaused: ['reference', 'self'].every(id => document.getElementById(id).paused), created: audit.created.length, revoked: [...audit.revoked] };
  };
  audit.workerReceipt = () => audit.workers.map(row => ({ mode: row.mode, requestId: row.requestId, markers: row.markers, errors: row.errors, messages: row.messages,
    terminateCalls: row.terminateCalls, terminateReturns: row.terminateReturns, terminateErrors: row.terminateErrors,
    held: row.held && { nativeBlob: row.held.nativeBlob, bytes: row.held.bytes, trusted: row.held.trusted, delivered: row.held.delivered } }));
  audit.restore = () => { window.Worker = NativeWorker; URL.createObjectURL = create; URL.revokeObjectURL = revoke; delete window.__ptsAudit; };
}
