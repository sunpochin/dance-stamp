/* 檔案用途：先在線備妥，再將真實瀏覽器 context 斷網，供原有錄影整合函式續測。所在層：隔離離線驗收。主要關聯：capture-comparison.js、sw.js。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  await page.goto(origin);
  await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('已檢查應用資源完整'));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('已檢查應用資源完整'));
  return { realBrowserOffline: true, controlledCachedReload: true, continueWithCaptureComparison: true };
}
