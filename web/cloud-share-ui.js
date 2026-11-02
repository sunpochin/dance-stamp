/* 檔案用途：明確選定成品、預覽確認公開及停止連結。所在層：Web 分享介面。主要關聯：cloud-sharing.js、cloud-ui.js、follow-ui.js。 */
import { prepareVideoShare, publishVideoShare, videoShareState, stopVideoShare, listVideoShares } from './cloud-sharing.js';
import { extension } from './recorder.js';
export function createCloudShareUI({ drive, run, message, hooks }) {
  const $ = id => /** @type {any} */ (document.getElementById(id));
  let entries = [], draft, selectedJob, url;
  const prefix = () => `dance-stamp-cloud-share:${drive.binding()}:`;
  function persist(job) { localStorage.setItem(prefix() + job.id, JSON.stringify(job)); }
  function pause() { $('cloud-share-preview').pause(); }
  function clearLink() { $('cloud-watch').hidden = true; $('cloud-watch').removeAttribute('href'); $('cloud-copy-link').disabled = true; }
  function invalidate() {
    pause(); if (url) URL.revokeObjectURL(url); url = undefined;
    $('cloud-share-preview').removeAttribute('src'); $('cloud-share-preview').load();
    draft = undefined; selectedJob = undefined; $('cloud-public-confirm').checked = false; $('cloud-share-source').replaceChildren(); $('cloud-shares').replaceChildren(); clearLink();
  }
  function show(state) {
    clearLink();
    if (state.link) { $('cloud-watch').href = state.link; $('cloud-watch').hidden = false; $('cloud-copy-link').disabled = false; }
    message(state.grant ? `唯讀觀看連結已核對${state.otherAccess ? '，但仍有其他授權，請到 Drive 管理' : ''}。供應商可能仍在處理影片；尚未驗證匿名播放或對方收到。` : state.otherAccess ? '本 App 的連結未生效，但仍有其他授權；不能宣稱影片完全私人。' : '未偵測到公開權限；已下載的副本不能收回。');
  }
  function chooseJob() { if (!selectedJob) throw new Error('請先選擇並讀取要管理的成品副本。'); drive.checkAccount(selectedJob.account); return selectedJob; }
  $('cloud-share-refresh').addEventListener('click', () => {
    entries = hooks.shareFiles(); $('cloud-share-source').replaceChildren(new Option('請選擇一支已完成成品', ''));
    for (const entry of entries) $('cloud-share-source').add(new Option(entry.label, entry.id));
    draft = undefined; $('cloud-public-confirm').checked = false; pause(); clearLink();
    message(entries.length ? '請選一支成品並播放檢查；不包含原片、筆記或其他練習。' : '目前沒有已完成成品，請先完成 VS 或單側跟隨影片。');
  });
  $('cloud-share-source').addEventListener('change', () => {
    pause(); if (url) URL.revokeObjectURL(url); draft = undefined; $('cloud-public-confirm').checked = false; clearLink();
    const entry = entries.find(e => e.id === $('cloud-share-source').value);
    if (!entry) { $('cloud-share-preview').removeAttribute('src'); $('cloud-share-preview').load(); return; }
    url = URL.createObjectURL(entry.blob); $('cloud-share-preview').src = url; $('cloud-share-name').value = 'dance-video';
    draft = { ...entry, account: drive.binding() };
    message(`將分享「${entry.label}」· ${(entry.blob.size / 1048576).toFixed(2)} MiB · ${entry.blob.type}，目的帳號：${drive.account.name}。先檢查影片、聲音及下方檔名。`);
  });
  $('cloud-share-name').addEventListener('input', () => { $('cloud-public-confirm').checked = false; if (draft?.job) { draft = undefined; message('先前副本仍保留；請先從分享清單核對，變更檔名後要重新選成品預覽。'); } });
  $('cloud-share-publish').addEventListener('click', () => run(async signal => {
    if (!draft || !$('cloud-public-confirm').checked) throw new Error('請先選成品、播放核對並確認公開範圍。');
    drive.checkAccount(draft.account); pause(); clearLink();
    const job = draft.job || await prepareVideoShare(drive, draft.blob, `${$('cloud-share-name').value.trim()}.${extension(draft.blob.type)}`, signal); draft.job = job;
    // 第一個遠端寫入前保存非秘密工作，權限回應遺失時仍能辨識同一副本，不能重按就再傳一支。
    persist(job); selectedJob = job;
    try { const state = await publishVideoShare(drive, job, draft.blob, persist, signal, (done, total) => message(`成品上傳／核對 ${Math.round(done / total * 100)}%；尚未提供觀看連結。`)); show(state); draft = undefined; $('cloud-public-confirm').checked = false; }
    catch { throw new Error('分享狀態待確認。原片保留；可用同一工作重試，或讀取分享清單找這份副本並核對權限。取消不代表遠端已撤銷。'); }
  }));
  $('cloud-list-shares').addEventListener('click', () => run(async signal => {
    const rows = await listVideoShares(drive, signal), select = $('cloud-shares'), known = new Map(rows.map(row => [row.id, row]));
    // 遠端尚未完成的本機工作也列出；不把 404 當成可悄悄再開新副本。
    for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix()))) {
      const local = JSON.parse(localStorage.getItem(key) || 'null');
      if (local?.account === drive.binding()) known.set(local.id, { ...known.get(local.id), ...local });
    }
    select.replaceChildren(new Option('請選擇成品副本', ''));
    for (const row of known.values()) { select.add(new Option(`${row.name} · ${row.id.slice(-8)}`, row.id)); }
    select._jobs = known; selectedJob = undefined; clearLink();
    message('清單只含這個帳號的 App 成品副本。請選擇後重新讀取權限；停止連結不刪除檔案。');
  }));
  $('cloud-shares').addEventListener('change', () => { selectedJob = $('cloud-shares')._jobs?.get($('cloud-shares').value); clearLink(); $('cloud-public-confirm').checked = false; });
  $('cloud-share-state').addEventListener('click', () => run(async signal => { show(await videoShareState(drive, chooseJob(), signal)); }));
  $('cloud-share-recover').addEventListener('click', () => run(async signal => {
    if (!$('cloud-public-confirm').checked) throw new Error('完成分享仍會公開這份副本，請重新確認公開範圍。');
    const job = chooseJob(); if (!job.hashes) throw new Error('此裝置沒有原傳輸核對資訊；可讀取／停止現有連結，重新分享請先選本機成品。');
    const candidate = $('cloud-share-retry-file').files?.[0];
    show(await publishVideoShare(drive, job, candidate, persist, signal)); $('cloud-public-confirm').checked = false;
  }));
  $('cloud-share-stop').addEventListener('click', () => run(async signal => {
    const job = chooseJob(); clearLink();
    try {
      const state = await stopVideoShare(drive, job, persist, signal);
      message(state.otherAccess ? '已停止這項 App 連結，但仍有其他授權；請到 Drive 核對，不能宣稱完全私人。' : '已重查並確認這項連結權限移除。已下載的副本不能收回；檔案仍留在 Drive。');
    } catch { throw new Error('停止分享結果待確認，請重新讀取權限。沒有刪除檔案；外部修改的授權請到 Drive 管理。'); }
  }));
  $('cloud-copy-link').addEventListener('click', async () => {
    const link = $('cloud-watch').getAttribute('href'); if (!link) return;
    try { await navigator.clipboard.writeText(link); message('已複製觀看網址；請自行傳送。尚未確認對方可播放或已收到。'); }
    catch { message('無法自動複製；可開啟觀看頁後從網址列複製。'); }
  });
  return { invalidate, pause, update: (working, connected) => { for (const id of ['cloud-share-refresh', 'cloud-share-publish', 'cloud-list-shares', 'cloud-share-state', 'cloud-share-recover', 'cloud-share-stop']) $(id).disabled = working || !connected; $('cloud-share-source').disabled = working || !connected; } };
}
