/* 用途：單輪匯出 Worker 的唯一訊息入口。所在層：獨立編解碼 owner。關聯：export-pts-core.js、export-pts.js。 */
import { exportPts } from './export-pts-core.js';
let started = false;
self.onmessage = async event => {
  if (started || !event.isTrusted || event.data?.kind !== 'export' || typeof event.data.id !== 'string') return;
  started = true;
  const { id, request } = event.data, controller = new AbortController();
  try {
    const result = await exportPts(request, controller.signal, progress => self.postMessage({ id, kind: 'progress', ...progress }));
    self.postMessage({ id, kind: 'result', ...result });
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught));
    self.postMessage({ id, kind: 'error', error: { name: error?.name ?? 'Error', message: error?.message ?? String(error) }, diagnostics: 'metadata' in error ? error.metadata : null });
  }
};
