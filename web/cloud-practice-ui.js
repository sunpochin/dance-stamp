/* 檔案用途：選定練習的手動保存、版本選擇及下載預覽。所在層：Web 雲端介面。主要關聯：cloud-ui.js、cloud-snapshot.js、storage.js。 */
import { selectedPractice, prepareSnapshot, saveSnapshot, listSnapshots, snapshotBranches } from './cloud-snapshot.js';
import { chunkHashes } from './google-drive.js';
import { saveCloudWork, readCloudWork } from './storage.js';
export function createCloudPracticeUI({ drive, root, run, message, hooks }) {
  const $ = id => /** @type {any} */ (document.getElementById(id));
  const bindingKey = video => `dance-stamp-cloud-binding:${drive.binding()}:${root()}:${video}`;
  const jobPrefix = () => `dance-stamp-cloud-job:${drive.binding()}:${root()}:`;
  let draft, incoming, restoredTake, urls = [], snapshots = [];
  function binding(video) { const raw = localStorage.getItem(bindingKey(video)); return raw ? JSON.parse(raw) : undefined; }
  function setBinding(video, value) { localStorage.setItem(bindingKey(video), JSON.stringify(value)); }
  function pause() { for (const video of $('cloud-media-preview').querySelectorAll('video')) video.pause(); }
  function clearMedia() { pause(); for (const video of $('cloud-media-preview').querySelectorAll('video')) { video.removeAttribute('src'); video.load(); } for (const url of urls) URL.revokeObjectURL(url); urls = []; $('cloud-media-preview').replaceChildren(); }
  function invalidate() {
    draft = undefined; incoming = undefined; restoredTake = undefined; snapshots = []; clearMedia();
    $('cloud-local-assets').replaceChildren(); $('cloud-remote-assets').replaceChildren(); $('cloud-snapshots').replaceChildren();
    $('cloud-save-confirm').checked = false; $('cloud-restore-confirm').checked = false; $('cloud-practice-preview').textContent = ''; $('cloud-remote-preview').textContent = '';
  }
  function choices(container, assets, available) {
    container.replaceChildren();
    for (const asset of assets) {
      const label = document.createElement('label'); label.className = 'check-label';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = asset.id; input.disabled = !available(asset);
      label.append(input, document.createTextNode(`${({ reference: '老師原片', take: '自己原片', vs: 'VS 成品' })[asset.kind]} · ${(asset.byteLength / 1048576).toFixed(2)} MiB${input.disabled ? '（缺片）' : ''}`)); container.append(label);
    }
  }
  function selected(id) { return new Set([...$(id).querySelectorAll('input:checked')].map(el => el.value)); }
  function progress(done, total) { message(`傳輸／核對 ${Math.round(done / total * 100)}%；目前這個檔案未核對完成前不標成功。`); }
  $('cloud-preview-practice').addEventListener('click', () => run(async signal => {
    const selection = await hooks.selection(signal), previous = binding(selection.videoId);
    const data = selectedPractice(selection.data, selection.videoId, selection.takeId, $('cloud-notes').checked, previous), files = new Map();
    const mapping = previous?.mapping?.assets || {};
    for (const asset of data.assets) { const id = mapping[asset.id] || asset.id, file = await hooks.media(id); if (file) files.set(id, file); }
    drive.binding(); draft = { data, files, previous, mapping, revision: selection.revision, videoId: selection.videoId, account: drive.binding(), root: root() };
    choices($('cloud-local-assets'), data.assets.map(a => ({ ...a, id: mapping[a.id] || a.id })), a => files.has(a.id));
    $('cloud-save-confirm').checked = false;
    $('cloud-practice-preview').textContent = JSON.stringify(data, null, 2);
    message(`帳號：${drive.account.name}。僅保存「${data.videos[0].title}」這份練習的標題／比較設定${$('cloud-notes').checked ? '與其筆記' : '，不含標記筆記'}。請逐一勾選影片；未選原片需另行重連。${previous ? `接續版本 ${previous.parent.slice(-8)}` : '將建立新資料集'}。`);
  }));
  $('cloud-notes').addEventListener('change', () => { draft = undefined; $('cloud-save-confirm').checked = false; message('保存範圍已改變，請重新預覽。'); });
  $('cloud-local-assets').addEventListener('change', () => { $('cloud-save-confirm').checked = false; });
  $('cloud-save-practice').addEventListener('click', () => run(async signal => {
    if (!draft || !$('cloud-save-confirm').checked || hooks.revision() !== draft.revision || root() !== draft.root) throw new Error('請先重新預覽並確認保存範圍。');
    drive.checkAccount(draft.account);
    const work = await prepareSnapshot(drive, draft.data, selected('cloud-local-assets'), draft.files, { root: draft.root, dataset: draft.previous?.dataset, parent: draft.previous?.parent || null, mapping: draft.mapping }, signal);
    await saveCloudWork(work.operation, work, signal);
    const key = jobPrefix() + work.operation;
    localStorage.setItem(key, JSON.stringify({ state: 'pending', title: draft.data.videos[0].title, videoId: draft.videoId }));
    await saveSnapshot(drive, work, id => draft.files.get(id), signal, progress);
    const mapping = draft.previous?.mapping || Object.fromEntries(['videos', 'assets', 'markers', 'takes', 'recipes', 'exports', 'moves'].map(t => [t, Object.fromEntries(draft.data[t].map(row => [row.id, row.id]))]));
    setBinding(draft.videoId, { dataset: work.envelope.dataset, parent: work.envelope.snapshot, sourceLibraryId: work.envelope.data.sourceLibraryId, mapping });
    localStorage.setItem(key, JSON.stringify({ state: 'saved', title: draft.data.videos[0].title, videoId: draft.videoId }));
    draft = undefined; $('cloud-save-confirm').checked = false;
    message('選定練習已保存為新的完整快照，媒體已全部核對。未選影片仍需重連；請讀取版本清單檢查是否有分支。');
  }));
  $('cloud-list-jobs').addEventListener('click', () => {
    try {
      const prefix = jobPrefix(), select = $('cloud-jobs'); select.replaceChildren();
      for (const key of Object.keys(localStorage).filter(k => k.startsWith(prefix))) { const value = JSON.parse(localStorage.getItem(key) || 'null'); if (value) select.add(new Option(`${value.state === 'saved' ? '已保存，可再核對' : '待傳／結果待確認'} · ${value.title} · ${key.slice(-8)}`, key.slice(prefix.length))); }
      message('工作僅屬於目前帳號及位置；重試不自動改傳其他帳號。關頁後失效原片可在下方重新選取。');
    } catch (error) { message(error instanceof Error ? error.message : '無法讀取待傳工作。'); }
  });
  $('cloud-retry-job').addEventListener('click', () => run(async signal => {
    const id = $('cloud-jobs').value, work = await readCloudWork(id), key = jobPrefix() + id, summary = JSON.parse(localStorage.getItem(key) || 'null');
    if (!work || !summary || work.envelope.root !== root()) throw new Error('請先選擇這個帳號的保存工作。');
    drive.checkAccount(work.envelope.account);
    const candidates = [...($('cloud-retry-files').files || [])], chosen = new Map();
    for (const file of candidates) chosen.set(JSON.stringify(await chunkHashes(file, signal)), file);
    await saveSnapshot(drive, work, async (localId, hashes) => chosen.get(JSON.stringify(hashes)) || await hooks.media(localId), signal, progress);
    localStorage.setItem(key, JSON.stringify({ ...summary, state: 'saved' }));
    message('先前工作的完整快照已核對；沒有建立重複快照。請從版本清單預覽、選擇要接續的版本。');
  }));
  $('cloud-list-snapshots').addEventListener('click', () => run(async signal => {
    snapshots = await listSnapshots(drive, root(), signal); $('cloud-snapshots').replaceChildren(new Option('請明確選版本，不依時間覆寫', ''));
    for (const item of snapshots) {
      const heads = snapshotBranches(snapshots.filter(s => s.dataset === item.dataset));
      $('cloud-snapshots').add(new Option(`${item.data.videos[0].title} · ${item.snapshot.slice(-8)}${heads.length > 1 ? '（有分支，各版保留）' : ''}`, item.snapshot));
    }
    message(`找到 ${snapshots.length} 份完整快照。每版獨立保留；請選擇後預覽。`);
  }));
  $('cloud-preview-snapshot').addEventListener('click', () => run(async signal => {
    const value = snapshots.find(s => s.snapshot === $('cloud-snapshots').value);
    if (!value) throw new Error('請先讀取並選擇雲端版本。');
    drive.checkAccount(value.account); if (value.root !== root()) throw new Error('雲端位置已改變，請重新讀取。');
    const revision = hooks.revision(), plan = await hooks.planImport(value.data, signal); clearMedia();
    incoming = { value, plan, revision, media: new Map() }; $('cloud-restore-confirm').checked = false;
    choices($('cloud-remote-assets'), value.data.assets, a => !!value.media.find(m => m.assetId === a.id)?.fileId);
    $('cloud-remote-preview').textContent = JSON.stringify(value.data, null, 2);
    message(`將新增 ${plan.added} 筆資料，${plan.conflicts.length} 處衝突會另存副本。缺片／未選影片不下載；只保存 VS 無法重新調整兩片。確認前本機不變。`);
  }));
  $('cloud-remote-assets').addEventListener('change', () => { if (incoming) incoming.media.clear(); clearMedia(); $('cloud-restore-confirm').checked = false; });
  $('cloud-download-media').addEventListener('click', () => run(async signal => {
    if (!incoming || incoming.value.root !== root()) throw new Error('請先預覽要接續的版本。');
    drive.checkAccount(incoming.value.account); clearMedia(); incoming.media.clear();
    for (const id of selected('cloud-remote-assets')) {
      const item = incoming.value.media.find(m => m.assetId === id), blob = await drive.download(item.fileId, item.byteLength, item.hashes, signal, progress);
      const file = new File([blob], `dance-${item.role}`, { type: item.mimeType });
      await hooks.validateMedia(file, incoming.value.data.assets.find(a => a.id === id), incoming.value.data, signal);
      const url = URL.createObjectURL(file), video = document.createElement('video'); urls.push(url); video.src = url; video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.setAttribute('aria-label', ({ reference: '老師原片預覽', take: '自己原片預覽', vs: 'VS 預覽' })[item.role]);
      $('cloud-media-preview').append(video); incoming.media.set(id, file);
    }
    message('勾選影片已下載、校驗並解碼。請逐一播放核對畫面／聲音，再勾選確認；尚未寫入本機。');
  }));
  $('cloud-apply-snapshot').addEventListener('click', () => run(async signal => {
    if (!incoming || !$('cloud-restore-confirm').checked || incoming.revision !== hooks.revision() || incoming.value.root !== root()) throw new Error('請重新預覽並確認版本／影片。');
    drive.checkAccount(incoming.value.account);
    const ids = selected('cloud-remote-assets');
    if ([...ids].some(id => !incoming.media.has(id))) throw new Error('勾選的影片尚未全部下載及預覽。');
    const changes = [];
    for (const [id, blob] of incoming.media) {
      const mapped = incoming.plan.mapping.assets[id], existing = await hooks.media(mapped), hashes = incoming.value.media.find(m => m.assetId === id).hashes;
      if (existing && JSON.stringify(await chunkHashes(existing, signal)) !== JSON.stringify(hashes)) throw new Error('本機已有不同內容的影片，沒有覆寫。請保留原片並另開資料集接續。');
      if (!existing) changes.push({ id: mapped, blob });
    }
    await hooks.applyImport(incoming.plan, incoming.revision, changes, signal);
    const videoId = incoming.plan.mapping.videos[incoming.value.data.videos[0].id];
    setBinding(videoId, { dataset: incoming.value.dataset, parent: incoming.value.snapshot, sourceLibraryId: incoming.value.data.sourceLibraryId, mapping: incoming.plan.mapping });
    restoredTake = incoming.plan.mapping.takes[incoming.value.data.takes[0].id]; incoming = undefined; clearMedia(); $('cloud-restore-confirm').checked = false;
    message('已原子保存所選版本與影片，舊資料保留。可按「開啟這份比較」；未下載的原片仍需重連。');
  }));
  $('cloud-open-restored').addEventListener('click', () => run(async signal => {
    if (!restoredTake) throw new Error('請先確認接續一份快照。');
    if (await hooks.openTake(restoredTake, signal)) $('cloud-dialog').close();
  }));
  return { invalidate, pause, update: (working, connected) => { for (const id of ['cloud-preview-practice', 'cloud-save-practice', 'cloud-list-jobs', 'cloud-retry-job', 'cloud-list-snapshots', 'cloud-preview-snapshot', 'cloud-download-media', 'cloud-apply-snapshot', 'cloud-open-restored']) $(id).disabled = working || !connected; } };
}
