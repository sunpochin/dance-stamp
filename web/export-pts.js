/* 用途：只管理本輪 Worker，不接觸原片播放器或前次 VS。所在層：產品匯出 adapter。關聯：main.js operation、export-pts-worker.js、timeline.js。 */
import { exportPlan } from './pts-plan.js';

/** @param {import('./pts-types').OwnerRequest} options @returns {Promise<{blob: Blob, diagnostics: import('./pts-types').Diagnostics}>} */
export async function exportExplicitPts({ signal, progress = () => {}, ...request }) {
  const parent = signal ?? new AbortController().signal, plan = exportPlan(request.recipe);
  parent.throwIfAborted();
  if (document.hidden) throw Error('離開前景，未啟動匯出；前次 VS 保留。');
  return new Promise((resolve, reject) => {
    let worker, terminal = false, watchdog;
    const id = crypto.randomUUID(), began = performance.now();
    const finish = (ok, value, diagnostics) => {
      if (terminal) return;
      terminal = true; clearTimeout(watchdog);
      parent.removeEventListener('abort', aborted);
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leaving);
      const own = worker; worker = null;
      const cleanupErrors = [], termination = { called: !!own, returned: false, physicalResourceExitIndependentlyVerified: false };
      try {
        if (own) { own.onmessage = null; own.onerror = null; own.onmessageerror = null; own.terminate(); termination.returned = true; }
      } catch (error) { cleanupErrors.push({ name: 'worker.terminate', error: error instanceof Error ? error.name : 'Error' }); if (ok) { ok = false; value = error; } }
      const ownerElapsedMs = performance.now() - began;
      const metadata = { ...(diagnostics ?? {}), workerTermination: termination, ownerCleanupErrors: cleanupErrors, ownerElapsedMs,
        g7SixtySecondTargetMs: plan.durationMs === 60_000 ? 90_000 : null,
        g7SixtySecondOwnerIntervalExceeded: plan.durationMs === 60_000 ? ownerElapsedMs > 90_000 : null };
      // 首結果先佔終態；取消／背景已先到時，永不接受晚到 Blob，也不碰上一支影片。
      if (ok) resolve({ blob: value, diagnostics: metadata });
      else {
        reject(Object.assign(new Error(value?.message ?? String(value), { cause: value }), { name: value?.name ?? 'Error', metadata }));
      }
    };
    const aborted = () => finish(false, parent.reason);
    const visibility = () => { if (document.hidden) finish(false, new Error('離開前景，已停止匯出；前次 VS 保留。')); };
    const leaving = () => finish(false, new DOMException('離開頁面，已停止本輪匯出。', 'AbortError'));
    const armWatchdog = () => { clearTimeout(watchdog); watchdog = setTimeout(() => finish(false, new DOMException('等待編解碼進展逾時。', 'TimeoutError')), 10_000); };
    parent.addEventListener('abort', aborted, { once: true }); document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', leaving);
    try {
      parent.throwIfAborted();
      worker = new Worker(new URL('./export-pts-worker.js', import.meta.url), { type: 'module', name: 'dance-stamp-pts-export' });
      worker.onmessage = event => {
        if (terminal || !event.isTrusted || event.target !== worker || event.data?.id !== id) return;
        const message = event.data;
        if (parent.aborted) { aborted(); return; }
        if (document.hidden) { visibility(); return; }
        if (message.kind === 'progress') {
          if (!Number.isFinite(message.fraction) || message.fraction < 0 || message.fraction > 1) { finish(false, Error('匯出進度協定無效。')); return; }
          armWatchdog();
          try { progress({ stage: message.stage, fraction: message.fraction }); } catch (error) { finish(false, error); }
        } else if (message.kind === 'error') {
          // Worker 跨 realm 的錯誤是明確 plain record，不能用 instanceof Error 抹掉 EncodingError／AbortError。
          const error = new Error(typeof message.error?.message === 'string' ? message.error.message : '匯出失敗，原片保留。');
          error.name = typeof message.error?.name === 'string' && message.error.name.trim() ? message.error.name : 'Error';
          finish(false, error, message.diagnostics);
        } else if (message.kind === 'result') {
          const { blob, diagnostics } = message;
          if (!(blob instanceof Blob) || !blob.size || !blob.type.startsWith('video/mp4') || diagnostics?.backend !== 'explicit-pts'
            || diagnostics.output?.bytes !== blob.size || diagnostics.submittedFrames !== plan.frames
            || diagnostics.plannedDurationMs !== plan.durationMs || diagnostics.cleanupCallsCompleted !== true
            || !Array.isArray(diagnostics.cleanupErrors) || diagnostics.cleanupErrors.length) {
            finish(false, Error('新合成檔或清理收據不完整。'), diagnostics); return;
          }
          finish(true, blob, diagnostics);
        } else finish(false, Error('匯出 Worker 回覆無效。'));
      };
      worker.onerror = event => { if (event.isTrusted && event.target === worker) {
        event.preventDefault();
        // 本機靜態 Worker 的首錯保留，不用通用失敗文案蓋掉載入／執行原因。
        const error = new Error(event.message || '匯出 Worker 失敗，原片保留。'); error.name = 'WorkerError'; finish(false, error);
      } };
      worker.onmessageerror = event => { if (event.isTrusted && event.target === worker) finish(false, new DOMException('無法接收匯出 Worker 回覆。', 'DataCloneError')); };
      // 舊 D+10 秒只管即時播放 phase，不能套在含解碼／編碼的整輪而在 G7 的 90 秒目標前誤殺；仍十秒無進展即停。
      armWatchdog(); worker.postMessage({ kind: 'export', id, request });
    } catch (error) { finish(false, error); }
  });
}
