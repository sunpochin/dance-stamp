/* 檔案用途：Google Drive 的短效授權、私人位置與可核對傳輸。所在層：Web 雲端邊界。主要關聯：cloud-ui.js、CLOUD_SYNC_SHARING.md。 */
export const driveScope = 'https://www.googleapis.com/auth/drive.file';
const api = 'https://www.googleapis.com/drive/v3/';
const folderMime = 'application/vnd.google-apps.folder';
export const cloudChunkSize = 4 * 1024 * 1024;
export const cloudMediaLimit = 200 * 1024 * 1024;
const fields = 'id,name,mimeType,size,parents,trashed,driveId,ownedByMe,owners(permissionId),appProperties,webViewLink,sha256Checksum';
export function driveId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new Error('雲端檔案識別無效。');
  return value;
}
export async function chunkHashes(blob, signal) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > cloudMediaLimit) throw new Error('雲端影片初期限制為 1 byte–200 MiB；原檔仍可本機使用。');
  const hashes = [];
  for (let offset = 0; offset < blob.size; offset += cloudChunkSize) {
    signal?.throwIfAborted();
    const digest = await crypto.subtle.digest('SHA-256', await blob.slice(offset, offset + cloudChunkSize).arrayBuffer());
    signal?.throwIfAborted(); hashes.push([...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''));
  }
  return hashes;
}
async function boundedBlob(response, limit, signal) {
  if (!response.body || Number(response.headers.get('Content-Length')) > limit) throw new Error('雲端回應超過宣告大小。');
  const reader = response.body.getReader(), parts = []; let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted(); const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength; if (size > limit) throw new Error('雲端回應超過宣告大小。'); parts.push(item.value);
    }
    return new Blob(parts);
  } finally { await reader.cancel().catch(() => {}); }
}
export class GoogleDrive {
  #session;
  #timer;
  constructor({ fetcher = fetch, changed = () => {}, now = () => Date.now() } = {}) { this.fetcher = fetcher; this.changed = changed; this.now = now; }
  get account() { return this.#session?.account; }
  disconnect() {
    clearTimeout(this.#timer); this.#session?.controller.abort(); this.#session = undefined; this.changed();
  }
  async authorize(token, signal) {
    this.disconnect();
    if (!token?.access_token || !Number.isFinite(Number(token.expires_in)) || Number(token.expires_in) <= 0 || !token.scope?.split(' ').includes(driveScope)) throw new Error('未取得必要的逐檔授權，請重新連接。');
    // 換帳號先終止舊請求；身分必須由這次 token 的 API 取得，不能相信舊 email 或儲存的帳號名稱。
    const session = { token: token.access_token, expires: this.now() + Math.min(Number(token.expires_in), 86400) * 1000, controller: new AbortController(), account: /** @type {{ id: string, name: string } | undefined} */ (undefined) };
    this.#session = session;
    try {
      const response = await this.request('about?fields=user(permissionId,displayName,emailAddress)', {}, signal);
      const { user } = await response.json(); this.assert(session);
      if (!user?.permissionId) throw new Error('無法確認雲端帳號，未啟用傳輸。');
      session.account = { id: driveId(user.permissionId), name: String(user.emailAddress || user.displayName || 'Google Drive') };
      this.#timer = setTimeout(() => this.disconnect(), Math.max(0, session.expires - this.now()));
      this.changed(); return session.account;
    } catch (error) { if (this.#session === session) this.disconnect(); throw error; }
  }
  assert(session = this.#session) {
    if (!session || session !== this.#session || session.controller.signal.aborted || session.expires <= this.now()) throw new Error('授權已結束，請重新連接；本機資料保留。');
    return session;
  }
  binding() { const session = this.assert(); if (!session.account) throw new Error('正在確認帳號。'); return session.account.id; }
  checkAccount(account) { if (this.binding() !== account) throw new Error('帳號已切換，舊帳號的工作已暫停。'); }
  async request(path, init = {}, signal) {
    const session = this.assert(), url = new URL(path, api), fetcher = this.fetcher;
    // 絕不把 Bearer token 送到回應提供的任意網址；session URL 也只在記憶體使用。
    if (url.origin !== 'https://www.googleapis.com' || !/^\/(?:upload\/)?drive\/v3\//.test(url.pathname)) throw new Error('拒絕不明雲端端點。');
    signal?.throwIfAborted();
    let response;
    try {
      // 原生 fetch 不能以 GoogleDrive 當 this 呼叫；Bun 的合成 fetch 不會暴露這個瀏覽器陷阱。
      response = await fetcher(url.href, { ...init, headers: { ...init.headers, Authorization: `Bearer ${session.token}` }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([session.controller.signal, ...(signal ? [signal] : []), AbortSignal.timeout(60000)]) });
    } catch { signal?.throwIfAborted(); this.assert(session); throw new Error('雲端連線中斷或逾時；傳輸結果待確認，可用原工作重試。'); }
    this.assert(session); signal?.throwIfAborted();
    if (response.status === 401) { this.disconnect(); throw new Error('授權已到期，請重新連接。'); }
    if (!response.ok && response.status !== 308 && response.status !== 404 && response.status !== 409) throw new Error(response.status === 403 ? '雲端權限不足、空間已滿或帳號政策限制；本機資料保留。' : '雲端操作未完成，原工作可重試。');
    return response;
  }
  async json(path, init = {}, signal) {
    const response = await this.request(path, init, signal);
    if (!response.ok) throw new Error(response.status === 404 ? '雲端檔案已移除或無權讀取。' : '雲端檔案狀態待確認，請重新讀取。');
    return response.json();
  }
  async list(query, signal) {
    const rows = [], seen = new Set(); let pageToken = '';
    do {
      const page = await this.json(`files?${new URLSearchParams({ q: query, spaces: 'drive', fields: `nextPageToken,incompleteSearch,files(${fields})`, pageSize: '100', pageToken })}`, {}, signal);
      if (page.incompleteSearch || !Array.isArray(page.files) || rows.length + page.files.length > 10000) throw new Error('雲端清單不完整，請縮小資料範圍。');
      rows.push(...page.files); pageToken = page.nextPageToken || '';
      if (pageToken && seen.has(pageToken)) throw new Error('雲端清單分頁重複。');
      seen.add(pageToken);
    } while (pageToken);
    return rows;
  }
  roots(signal) { return this.list("trashed = false and appProperties has { key='dsKind' and value='private-root-v1' }", signal); }
  async permissions(id, signal) {
    const rows = []; let pageToken = ''; const seen = new Set();
    do {
      const page = await this.json(`files/${driveId(id)}/permissions?${new URLSearchParams({ fields: 'nextPageToken,permissions(id,type,role,allowFileDiscovery,permissionDetails)', pageSize: '100', pageToken })}`, {}, signal);
      if (!Array.isArray(page.permissions) || rows.length + page.permissions.length > 10000) throw new Error('無法核對分享權限。');
      rows.push(...page.permissions); pageToken = page.nextPageToken || '';
      if (pageToken && seen.has(pageToken)) throw new Error('權限清單不完整。'); seen.add(pageToken);
    } while (pageToken);
    return rows;
  }
  file(id, signal) { return this.json(`files/${driveId(id)}?fields=${fields}`, {}, signal); }
  async privateFile(id, signal, folder = false) {
    const account = this.binding(), file = await this.file(id, signal), permissions = await this.permissions(id, signal);
    this.checkAccount(account);
    // 僅接受本人擁有且沒有其他讀者的有效檔案；使用者在 Drive 改公開後，下次寫入必須停下。
    if (file.trashed || file.driveId || !file.ownedByMe || file.owners?.length !== 1 || file.owners[0].permissionId !== account || !permissions.length || permissions.some(p => p.type !== 'user' || p.role !== 'owner' || p.id !== account) || folder && file.mimeType !== folderMime) throw new Error('私人位置已有其他存取者或無法確認權限；請建立新的私人位置。');
    return file;
  }
  async createRoot(signal) {
    const account = this.binding();
    const file = await this.json('files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Dance Stamp 私人練習', mimeType: folderMime, appProperties: { dsKind: 'private-root-v1' } }) }, signal);
    this.checkAccount(account); return this.privateFile(file.id, signal, true);
  }
  async newId(signal) { const result = await this.json('files/generateIds?count=1&space=drive&type=files', {}, signal); return driveId(result.ids?.[0]); }
  async readJSON(id, signal) {
    const account = this.binding(), file = await this.privateFile(id, signal), size = Number(file.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > 10 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(file.sha256Checksum)) throw new Error('雲端快照大小或校驗資訊無效。');
    const response = await this.request(`files/${driveId(id)}?alt=media`, {}, signal);
    if (!response.ok) throw new Error('無法讀取雲端快照。');
    const blob = await boundedBlob(response, size, signal);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
    this.checkAccount(account); signal?.throwIfAborted();
    if (blob.size !== size || hash !== file.sha256Checksum) throw new Error('雲端快照校驗不符。');
    return { file, text: await blob.text() };
  }
  async download(id, size, hashes, signal, progress = (_done, _total) => {}) {
    if (!Number.isSafeInteger(size) || size < 1 || size > cloudMediaLimit || !Array.isArray(hashes) || hashes.length !== Math.ceil(size / cloudChunkSize) || hashes.some(h => !/^[a-f0-9]{64}$/.test(h))) throw new Error('雲端內容描述無效或超過容量上限。');
    const parts = [], account = this.binding();
    for (let start = 0; start < size; start += cloudChunkSize) {
      const end = Math.min(size, start + cloudChunkSize) - 1;
      const response = await this.request(`files/${driveId(id)}?alt=media`, { headers: { Range: `bytes=${start}-${end}` } }, signal);
      if (response.status !== 206 && !(response.status === 200 && start === 0 && size <= cloudChunkSize)) throw new Error('雲端未提供所需的檔案範圍。');
      const blob = await boundedBlob(response, end - start + 1, signal); this.checkAccount(account); signal?.throwIfAborted();
      if (blob.size !== end - start + 1 || (await chunkHashes(blob, signal))[0] !== hashes[start / cloudChunkSize]) throw new Error('雲端內容校驗不符，沒有套用資料。');
      parts.push(blob); progress(end + 1, size);
    }
    this.checkAccount(account); return new Blob(parts);
  }
  async upload(blob, job, signal, progress = (_done, _total) => {}) {
    this.checkAccount(job.account);
    const standalone = job.kind === 'shared-video-v1' && job.root === null;
    if (!job.id || !job.root && !standalone || !job.hashes) throw new Error('傳輸工作缺少核對資訊。');
    if (JSON.stringify(await chunkHashes(blob, signal)) !== JSON.stringify(job.hashes)) throw new Error('來源內容已改變，不能沿用先前工作識別。');
    if (!standalone) {
      const root = await this.privateFile(job.root, signal, true);
      if (root.appProperties?.dsKind !== 'private-root-v1') throw new Error('不是本 App 的私人位置。');
    }
    const existing = await this.request(`files/${driveId(job.id)}?fields=${fields}`, {}, signal);
    if (existing.ok) {
      const file = await existing.json();
      if (file.appProperties?.dsOperation !== job.operation || !standalone && !file.parents?.includes(job.root) || Number(file.size) !== blob.size) throw new Error('同一工作已有不同內容，請保留原件並重新預覽。');
      await this.privateFile(job.id, signal);
      await this.download(job.id, blob.size, job.hashes, signal); return file;
    }
    if (existing.status !== 404) throw new Error('無法確認先前工作，沒有建立副本。');
    const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Content-Type': blob.type || 'application/octet-stream', 'X-Upload-Content-Length': String(blob.size) },
      // 分享成品獨立放 My Drive，不繼承私人資料集資料夾，也不修改該資料夾權限。
      body: JSON.stringify({ id: driveId(job.id), name: job.name, mimeType: blob.type || 'application/octet-stream', ...(!standalone && { parents: [job.root] }), appProperties: { dsOperation: job.operation, dsKind: job.kind } }),
    }, signal);
    if (!response.ok) throw new Error('傳輸狀態待確認，請重試同一工作。');
    const location = response.headers.get('Location');
    if (!location) throw new Error('沒有取得可恢復傳輸位置。');
    let offset = 0, failures = 0;
    while (offset < blob.size) {
      this.checkAccount(job.account); signal?.throwIfAborted();
      const end = Math.min(blob.size, offset + cloudChunkSize);
      let result;
      try {
        result = await this.request(location, { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream', 'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}` }, body: blob.slice(offset, end) }, signal);
      } catch (error) {
        signal?.throwIfAborted(); this.checkAccount(job.account);
        if (++failures > 2) throw error;
        // 回應遺失不能重送整檔或增加副本；先問 session 已接收的位置，最多恢復兩次。
        result = await this.request(location, { method: 'PUT', headers: { 'Content-Range': `bytes */${blob.size}` } }, signal);
      }
      if (result.ok) { offset = blob.size; break; }
      if (result.status !== 308) throw new Error('傳輸工作已中斷；保留工作識別後重試。');
      const range = result.headers.get('Range'), next = range ? Number(range.match(/^bytes=0-(\d+)$/)?.[1]) + 1 : 0;
      if (!Number.isSafeInteger(next) || next < offset || next > end || next === offset && ++failures > 2) throw new Error('雲端回報的傳輸位置無效。');
      offset = next; progress(offset, blob.size);
    }
    this.checkAccount(job.account);
    // 不把 HTTP 成功當成成檔：分塊讀回比對全部 bytes，代價是首版需多一次下載流量。
    const file = await this.privateFile(job.id, signal);
    if (Number(file.size) !== blob.size || !standalone && !file.parents?.includes(job.root)) throw new Error('雲端成檔不完整。');
    await this.download(job.id, blob.size, job.hashes, signal); progress(blob.size, blob.size); return file;
  }
}
