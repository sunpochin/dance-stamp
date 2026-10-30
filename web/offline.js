/* 檔案用途：顯示真實離線完整性、容量及等待更新；不接觸私人媒體。所在層：Web 能力。主要關聯：sw.js、main.js、TECHNICAL.md。 */
export function storageEstimateText(estimate) {
  const { usage, quota } = estimate || {};
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || usage < 0 || quota <= 0) return '此瀏覽器未提供容量估計。';
  const mib = value => (value / 1048576).toFixed(1);
  return `此網站估計已用 ${mib(usage)} MiB／額度 ${mib(quota)} MiB，估計可用 ${mib(Math.max(0, quota - usage))} MiB；不是裝置剩餘空間或寫入保證。`;
}
/** @param {ServiceWorker} worker */
function offlineStatus(worker) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const close = () => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); };
    const timer = setTimeout(() => { close(); reject(new Error('離線檢查逾時。')); }, 5000);
    channel.port1.onmessage = e => { close(); resolve(e.data); };
    try { worker.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]); }
    catch (error) { close(); reject(error); }
  });
}
/** @param {{offline: HTMLElement, capacity: HTMLElement, persistence: HTMLElement, updates: HTMLElement, refresh: HTMLButtonElement, persist: HTMLButtonElement, checkUpdate: HTMLButtonElement}} ui */
export async function startOffline(ui) {
  let registration;
  let checkingUpdate = false;
  const refreshCapacity = async () => {
    // 同步拒絕也視為能力未知，不能阻止筆記開啟或 SW 註冊。
    const [estimate, persisted] = await Promise.allSettled([Promise.resolve().then(() => navigator.storage?.estimate?.()), Promise.resolve().then(() => navigator.storage?.persisted?.())]);
    ui.capacity.textContent = storageEstimateText(estimate.status === 'fulfilled' ? estimate.value : undefined);
    ui.persistence.textContent = persisted.status === 'fulfilled' && persisted.value === true ? '瀏覽器已允許持久保存；手動清除網站資料仍會刪除，請另存 JSON 及影片。' : persisted.status === 'fulfilled' && persisted.value === false ? '未獲持久保存，瀏覽器可能自動清除；請另存 JSON 及影片。' : '無法確認持久保存狀態；請另存 JSON 及影片。';
  };
  const updateText = () => { ui.updates.textContent = registration?.waiting ? '新版已備妥，正在等待。先保存工作及原片，關閉所有本站分頁後再開啟；不會自動重載。' : '新版只在所有舊分頁關閉後啟用，不會中斷錄影或匯出。'; };
  const refresh = async () => {
    await refreshCapacity();
    try {
      const worker = navigator.serviceWorker?.controller || registration?.active;
      if (!worker) { ui.offline.textContent = '離線資源尚未備妥；首次請保持連線，稍後重新檢查。'; return; }
      const result = await offlineStatus(worker);
      ui.offline.textContent = result.complete === true ? `已檢查應用資源完整（${result.version}），可離線重開；影片須看保存清單或重新選片。${navigator.serviceWorker.controller ? '' : '首次請先重開一次，確認本頁已受離線服務控制。'}` : '應用離線資源不完整，請保持連線；已存筆記與影片未刪除。';
    } catch { ui.offline.textContent = '暫時無法確認離線資源，請保持連線；原資料保留。'; }
    updateText();
  };
  ui.refresh.addEventListener('click', () => { refresh().catch(() => {}); });
  ui.persist.disabled = !navigator.storage?.persist;
  ui.persist.addEventListener('click', async () => {
    ui.persist.disabled = true;
    try {
      // 僅使用者點按才請求，明確報告拒絕／例外，不把 API 存在當成已允許。
      const granted = await navigator.storage.persist();
      await refreshCapacity();
      ui.persistence.textContent = granted ? '瀏覽器已允許持久保存；仍請另存 JSON 及影片，手動清除不受保護。' : '瀏覽器未允許持久保存；仍可使用，請另存 JSON 及影片。';
    } catch { ui.persistence.textContent = '持久保存請求失敗；原資料保留，仍請另存 JSON 及影片。'; }
    finally { ui.persist.disabled = false; }
  });
  const checkForUpdate = async () => {
    // 回前景與恢復連線可能接連發生；同一輪共用檢查，失敗後仍可重試。
    if (!registration || checkingUpdate) return;
    checkingUpdate = true;
    try { await registration.update(); updateText(); }
    catch { ui.updates.textContent = '目前無法檢查新版；現有版本與資料保留，可稍後再試。'; }
    finally { checkingUpdate = false; }
  };
  ui.checkUpdate.addEventListener('click', checkForUpdate);
  await refreshCapacity();
  // 本機開發由 watcher 更新；若再註冊正式 SW，舊快取會把修改擋在頁面之外。
  if (document.documentElement?.dataset.devReload === 'true' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
    ui.offline.textContent = '本機即時更新模式暫停離線快取；筆記與影片副本仍保留。';
    ui.checkUpdate.disabled = true; return;
  }
  if (!('serviceWorker' in navigator)) { ui.offline.textContent = '此瀏覽器不支援應用離線重開；本機選片仍可使用。'; ui.checkUpdate.disabled = true; return; }
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    const watch = worker => { worker?.addEventListener('statechange', () => { refresh().catch(() => {}); }); };
    watch(registration.installing);
    registration.addEventListener('updatefound', () => { watch(registration.installing); });
    navigator.serviceWorker.addEventListener('controllerchange', () => { refresh().catch(() => {}); });
    const checkWhenVisible = () => {
      // 手機背景及離線時不喚醒網路；新版仍走原本 waiting，不能為更新打斷錄影或草稿。
      if (navigator.onLine && document.visibilityState === 'visible') void checkForUpdate();
    };
    document.addEventListener('visibilitychange', checkWhenVisible);
    window.addEventListener('online', checkWhenVisible);
    // 從上一頁快取還原不一定改變可見狀態，pageshow 要另查，不能只等重新開站。
    window.addEventListener('pageshow', checkWhenVisible);
    window.setInterval(checkWhenVisible, 15 * 60 * 1000);
    await refresh();
    // 先完成初始狀態顯示，免得隨後的 refresh 把檢查失敗訊息蓋掉。
    checkWhenVisible();
  } catch { ui.offline.textContent = '離線資源未備妥，請保持連線；本機資料未刪除。'; }
}
