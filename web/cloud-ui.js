/* 檔案用途：雙片首頁的 Google 雲端設定與合成傳輸驗證。所在層：Web 使用者入口。主要關聯：main.js、google-drive.js、CLOUD_SYNC_SHARING.md。 */
import { GoogleDrive, chunkHashes } from './google-drive.js';
import { cloudConfig, loadGoogle, requestGoogle } from './cloud-auth.js';
export function createCloudUI(hooks) {
  const $ = id => /** @type {any} */ (document.getElementById(id));
  const configKey = 'dance-stamp-cloud-config-v1', probeKey = 'dance-stamp-cloud-probe-v1';
  let oauth, config, authController, working = false;
  const drive = new GoogleDrive({ changed: () => { $('cloud-account').textContent = drive.account ? `目前帳號：${drive.account.name}` : '尚未連接或授權已結束；本機功能可照常使用。'; update(); } });
  function update() {
    $('cloud-connect').disabled = !oauth || !config || working;
    for (const id of ['cloud-roots', 'cloud-create-root', 'cloud-probe', 'cloud-read-probe']) $(id).disabled = !drive.account || working;
    $('cloud-disconnect').disabled = !drive.account && !authController;
    $('cloud-load').disabled = working;
  }
  function message(text) { $('cloud-status').textContent = text; }
  async function run(task) {
    await hooks.operate(async signal => {
      working = true; update();
      try { await task(signal); } catch (caught) { const error = caught instanceof Error ? caught : new Error('雲端操作未完成。'); message(error.name === 'AbortError' ? '已取消；本機與已完成的雲端檔案保留。' : error.message); throw error; }
      finally { working = false; update(); }
    });
  }
  async function roots(signal) {
    const rows = await drive.roots(signal), select = $('cloud-root'), previous = select.value;
    select.replaceChildren(new Option('請選擇私人資料夾', ''));
    for (const row of rows) select.add(new Option(`${row.name} · ${row.id.slice(-8)}`, row.id));
    if (rows.some(r => r.id === previous)) select.value = previous;
    message(`找到 ${rows.length} 個位置；同名位置分別列出，請明確選擇。`);
  }
  function root() { if (!$('cloud-root').value) throw new Error('請先選擇或建立私人資料夾。'); return $('cloud-root').value; }
  $('open-cloud').addEventListener('click', () => {
    if (hooks.busy()) return;
    $('cloud-origin').value = location.origin;
    try { const saved = JSON.parse(localStorage.getItem(configKey) || 'null'); if (saved?.origin === location.origin) $('cloud-client').value = saved.clientId; } catch { /* 設定不可用不影響本機資料。 */ }
    $('cloud-dialog').showModal(); update(); $('cloud-close').focus();
  });
  function close() { authController?.abort(); authController = undefined; hooks.cancel?.(); $('cloud-dialog').close(); $('open-cloud').focus(); }
  $('cloud-close').addEventListener('click', close);
  $('cloud-dialog').addEventListener('cancel', e => { e.preventDefault(); close(); });
  $('cloud-load').addEventListener('click', () => run(async signal => {
    const next = cloudConfig($('cloud-client').value.trim(), $('cloud-origin').value.trim(), location.origin);
    drive.disconnect(); oauth = undefined; config = undefined;
    localStorage.setItem(configKey, JSON.stringify(next));
    oauth = await loadGoogle(signal); signal.throwIfAborted(); config = next;
    message('工具已就緒，請按「連接 Google Drive」選帳號並授權。尚未上傳任何資料。');
  }));
  $('cloud-connect').addEventListener('click', () => {
    if (!oauth || !config || hooks.busy() || working) return;
    authController?.abort(); drive.disconnect(); $('cloud-root').replaceChildren();
    const controller = new AbortController(); authController = controller; working = true; update();
    // OAuth popup 先同步啟動，之後才進入共用的非同步工作鎖。
    const pending = requestGoogle(oauth, config.clientId, controller.signal);
    pending.then(token => run(async signal => {
      await drive.authorize(token, AbortSignal.any([signal, controller.signal]));
      message('已確認帳號。請讀取或建立私人資料夾；連接不會上傳影片或筆記。');
    })).catch(error => message(error.name === 'AbortError' ? '已取消授權；本機資料保留。' : error.message)).finally(() => { if (authController === controller) authController = undefined; working = false; update(); });
  });
  $('cloud-disconnect').addEventListener('click', () => {
    authController?.abort(); authController = undefined; drive.disconnect(); hooks.cancel?.(); $('cloud-root').replaceChildren();
    message('已停止傳輸並清除本次憑證。檔案與既有公開連結保留；撤銷授權請到 Google 帳號管理，停止分享另操作。');
  });
  $('cloud-roots').addEventListener('click', () => run(roots));
  $('cloud-create-root').addEventListener('click', () => run(async signal => {
    const file = await drive.createRoot(signal); await roots(signal); $('cloud-root').value = file.id; message('已建立並核對私人資料夾；尚未傳送練習。');
  }));
  $('cloud-probe').addEventListener('click', () => run(async signal => {
    const account = drive.binding(), selected = root();
    let job; try { job = JSON.parse(localStorage.getItem(probeKey) || 'null'); } catch { /* 僅合成傳輸工作，不讀私人資料。 */ }
    if (job?.account !== account || job?.root !== selected) job = { account, root: selected, id: await drive.newId(signal), operation: crypto.randomUUID(), name: 'dance-stamp-synthetic-check.txt', kind: 'probe-v1' };
    const blob = new Blob([`Dance Stamp synthetic transfer v1\n${job.operation}\n`], { type: 'text/plain' });
    job.hashes = await chunkHashes(blob, signal);
    // 只存非秘密識別與校驗；不保存 token、session URL、帳號 email 或任何使用者內容。
    localStorage.setItem(probeKey, JSON.stringify(job));
    await drive.upload(blob, job, signal); message('合成小檔已上傳，並完整讀回核對；這不代表真實跨裝置已驗收。');
  }));
  $('cloud-read-probe').addEventListener('click', () => run(async signal => {
    const selected = root(); await drive.privateFile(selected, signal, true);
    const rows = await drive.list(`trashed = false and '${selected}' in parents and appProperties has { key='dsKind' and value='probe-v1' }`, signal);
    if (!rows.length) throw new Error('這個資料夾尚未有合成測試檔。');
    for (const row of rows) {
      if (!/^[a-f0-9-]{36}$/.test(row.appProperties?.dsOperation)) throw new Error('合成檔識別無效。');
      const expected = new Blob([`Dance Stamp synthetic transfer v1\n${row.appProperties.dsOperation}\n`]);
      if (Number(row.size) !== expected.size) throw new Error('合成檔大小不符。');
      await drive.download(row.id, expected.size, await chunkHashes(expected, signal), signal);
    }
    message(`已讀回並核對 ${rows.length} 份合成小檔；另一台實體裝置的結果須另記錄。`);
  }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { authController?.abort(); if (working) hooks.cancel?.(); } });
  window.addEventListener('pagehide', () => { authController?.abort(); drive.disconnect(); });
  update();
  return { busy: () => working || !!authController };
}
