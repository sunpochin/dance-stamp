/* 用途：綁定唯一Worker首結果、保全本機成品並終止自己的Worker；所在層：scripts/qa/explicit-pts/worker；關聯：entry.js、共用serve.ts、README.md。 */
const config = await (await fetch('/config', { cache: 'no-store' })).json();
const view = document.querySelector('#result'), capButton = document.querySelector('#capability');
const runButton = document.querySelector('#run'), cancelButton = document.querySelector('#cancel');
let worker, caseId, timer, phase = 'idle', terminal = false, capabilitySeen = false;
let attempted = false, leaving = false, started, capability;
const hardware = [], rejectedMessages = { untrustedOrWrongCase: 0, wrongPhase: 0 };
const errorInfo = error => ({ name: error?.name ?? 'Error', message: String(error?.message ?? error) });
const show = value => { view.textContent = JSON.stringify(value, null, 2); };
// 本頁沒有硬體入口；誤呼叫也只保留分類，不要求權限。
if (navigator.mediaDevices) for (const key of ['getUserMedia', 'getDisplayMedia']) navigator.mediaDevices[key] = async () => {
  hardware.push(key); throw Error('synthetic-only');
};

async function save(kind, body, type = 'application/json') {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(new DOMException('receipt deadline', 'TimeoutError')), 6500);
  try {
    const response = await fetch(`/${kind}/${config.nonce}`, {
      method: 'POST', headers: { 'Content-Type': type }, body, signal: controller.signal,
    });
    if (!response.ok) throw Error(`${kind} receipt ${response.status}: ${await response.text()}`);
  } finally { clearTimeout(deadline); }
}
function terminateOwnWorker(reason) {
  const own = worker; worker = null;
  const receipt = { reason, called: !!own, returned: false, physicalResourceExitIndependentlyVerified: false };
  if (!own) return receipt;
  own.onmessage = null; own.onerror = null; own.onmessageerror = null;
  try { own.terminate(); receipt.returned = true; }
  catch (error) { receipt.error = errorInfo(error); }
  return receipt;
}
async function finish(stage, details = {}, blob) {
  // 第一個有效終態獨占發布；取消／逾時先到就永遠不接受後來的Blob或重送POST。
  if (terminal) return;
  const terminalAt = performance.now();
  terminal = true; phase = 'terminal'; clearTimeout(timer);
  capButton.disabled = true; runButton.disabled = true; cancelButton.disabled = true;
  const record = {
    stage, library: config.library, baseEngineCommit: config.baseEngineCommit,
    workerCaseId: caseId ?? null, exportAttempts: attempted ? 1 : 0, capability: capability ?? null,
    hardware, rejectedMessages, ...details,
    workerTermination: terminateOwnWorker(stage),
    terminalClaimMs: started === undefined ? null : terminalAt - started,
    elapsedMs: null,
    artifactPostCompletedMs: null,
    timingScope: 'main-thread trusted-run to pre-result-POST; elapsedMs includes optional SHA/artifact preservation; not codec time or native download',
    artifactPreservation: 'same-machine POST, not native download or product storage',
  };
  // 不能在自己的Worker連終止呼叫都失敗時發布成功候選；原引擎收據仍獨立保留。
  if (stage === 'encoded' && (!record.workerTermination.called || !record.workerTermination.returned)) {
    record.stage = 'failed';
    record.error = record.workerTermination.error ?? { name: 'WorkerTerminationError', message: 'own worker termination did not complete' };
    record.cleanupFailure = 'own-worker-termination';
    blob = undefined;
  }
  try {
    if (blob) {
      if (leaving) throw new DOMException('page left before artifact preservation', 'AbortError');
      const bytes = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      if (leaving) throw new DOMException('page left before artifact preservation', 'AbortError');
      record.bytes = blob.size; record.mime = blob.type;
      record.sha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
      await save('artifact', blob, blob.type);
      record.artifactPostCompleted = true;
      record.artifactPostCompletedMs = started === undefined ? null : performance.now() - started;
      if (leaving) throw new DOMException('page left after artifact preservation', 'AbortError');
      const link = document.querySelector('#download');
      link.href = URL.createObjectURL(blob); link.download = 'worker-explicit-pts-first.mp4'; link.hidden = false;
    }
  } catch (error) { record.stage = 'preservation-failed'; record.preservationError = errorInfo(error); }
  finally {
    // 與原頁面原型同口徑包含本機保全；另列訊息抵達，不冒充純編碼耗時。
    record.elapsedMs = started === undefined ? null : performance.now() - started;
    show(record);
    try { await save('result', JSON.stringify(record)); }
    catch (error) { show({ ...record, receiptError: errorInfo(error) }); }
  }
}
function armDeadline() {
  clearTimeout(timer);
  timer = setTimeout(() => { void finish('aborted', {
    error: { name: 'TimeoutError', message: 'worker prototype deadline' },
    publicCleanupReceiptAvailable: false,
  }); }, 60_000);
}
function send(kind) {
  try { worker.postMessage({ kind, caseId }); }
  catch (error) { void finish('failed', { error: errorInfo(error), publicCleanupReceiptAvailable: false }); }
}

capButton.onclick = event => {
  if (!event.isTrusted || phase !== 'idle' || terminal) return;
  capButton.disabled = true; cancelButton.disabled = false; phase = 'checking';
  caseId = crypto.randomUUID(); armDeadline();
  try { worker = new Worker('/worker.js', { type: 'module', name: 'explicit-pts-single-case' }); }
  catch (error) { void finish('failed', { error: errorInfo(error), publicCleanupReceiptAvailable: false }); return; }
  worker.onmessage = async event => {
    if (!event.isTrusted || event.target !== worker || event.data?.caseId !== caseId || terminal) {
      rejectedMessages.untrustedOrWrongCase++; return;
    }
    const message = event.data;
    if (message.kind === 'capability' && phase === 'checking' && !capabilitySeen) {
      capabilitySeen = true; capability = message.record;
      if (!capability || typeof capability.capable !== 'boolean' || capability.observationMode !== 'actual-module-worker') {
        void finish('failed', { error: { name: 'ProtocolError', message: 'invalid worker capability receipt' } }); return;
      }
      try { await save('capability', JSON.stringify({ ...capability, library: config.library, workerCaseId: caseId })); }
      catch (error) { void finish('failed', { error: errorInfo(error), publicCleanupReceiptAvailable: false }); return; }
      if (terminal) return;
      if (!capability.capable) { void finish('unsupported'); return; }
      clearTimeout(timer); phase = 'ready'; runButton.disabled = false; cancelButton.disabled = false;
      show({ stage: 'ready', capability, library: config.library, exportAttempts: 0 });
      return;
    }
    if (message.kind === 'result' && phase === 'running') {
      if (message.stage === 'encoded') {
        const meta = message.metadata, blob = message.blob;
        if (!(blob instanceof Blob) || !blob.size || blob.size > 16_000_000 || !blob.type.startsWith('video/mp4')
          || meta?.prototype !== 'mediabunny-1.65.0-worker-three-second-only' || meta?.output?.finalState !== 'finalized'
          || meta.output.bytes !== blob.size || meta.submittedVideoFrames !== 90 || meta.pcm?.coveredFrames !== 144000
          || meta.cleanupCallsCompleted !== true || !Array.isArray(meta.cleanupErrors) || meta.cleanupErrors.length !== 0) {
          void finish('failed', { error: { name: 'ProtocolError', message: 'invalid worker result/blob/cleanup binding' }, metadata: meta ?? null }); return;
        }
        void finish('encoded', { metadata: meta, publicCleanupReceiptAvailable: true }, blob);
      } else if (message.stage === 'failed') {
        void finish('failed', { error: message.error, metadata: message.metadata, publicCleanupReceiptAvailable: !!message.metadata });
      } else void finish('failed', { error: { name: 'ProtocolError', message: 'unknown worker result stage' } });
      return;
    }
    rejectedMessages.wrongPhase++;
  };
  worker.onerror = event => {
    if (!event.isTrusted || event.target !== worker || terminal) return;
    event.preventDefault();
    void finish('failed', { error: { name: 'WorkerError', message: event.message }, publicCleanupReceiptAvailable: false });
  };
  worker.onmessageerror = event => {
    if (!event.isTrusted || event.target !== worker || terminal) return;
    void finish('failed', { error: { name: 'DataCloneError', message: 'worker message could not be decoded' }, publicCleanupReceiptAvailable: false });
  };
  send('capability');
};
runButton.onclick = event => {
  if (!event.isTrusted || terminal || phase !== 'ready' || attempted || !capability?.capable) return;
  attempted = true; phase = 'running'; started = performance.now(); runButton.disabled = true;
  show({ stage: 'running', exportAttempts: 1, observationMode: 'actual-module-worker' }); armDeadline(); send('run');
};
cancelButton.onclick = event => {
  if (event.isTrusted && !terminal) void finish('aborted', {
    error: { name: 'AbortError', message: 'user canceled worker prototype' }, publicCleanupReceiptAvailable: false,
  });
};
window.addEventListener('pagehide', event => {
  if (!event.isTrusted) return;
  leaving = true;
  if (!terminal) void finish('aborted', {
    error: { name: 'AbortError', message: 'page left worker prototype' }, publicCleanupReceiptAvailable: false,
  });
  else terminateOwnWorker('pagehide after terminal');
});
