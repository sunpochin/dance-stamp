/* 檔案用途：閒置頁自動更新，有練習或草稿時保留工作。所在層：僅本機開發注入。主要關聯：dev-web.ts、serve-web.ts。 */
if (document.documentElement.dataset.devReload === 'true' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
  const version = document.documentElement.dataset.devVersion;
  let dirty = false;
  const panel = document.createElement('aside'), message = document.createElement('p'), reload = document.createElement('button');
  panel.id = 'dev-live'; panel.className = 'notice'; message.setAttribute('role', 'status');
  message.textContent = '本機即時更新已啟用。'; reload.type = 'button'; reload.textContent = '已保存工作，載入新版'; reload.hidden = true;
  panel.append(message, reload); document.querySelector('main').prepend(panel);
  // 開發頁不重複註冊 SW；只退出本站 root 註冊，不碰筆記、影片副本或其他 scope。
  navigator.serviceWorker?.getRegistrations().then(registrations => Promise.all(registrations.filter(registration => registration.scope === new URL('/', location.href).href).map(registration => registration.unregister()))).catch(() => {});
  for (const event of ['input', 'change']) document.addEventListener(event, () => { dirty = true; });
  const busy = () => !!document.querySelector('[aria-busy="true"], dialog[open], #storage-recovery:not([hidden])');
  // File／相機串流只活在此頁，暫停播放也不能直接重載；保存過輸入仍採保守的人工確認。
  const protectedWork = () => dirty || busy() || [...document.querySelectorAll('video')].some(video => video.getAttribute('src') || video.srcObject) || !!document.querySelector('a[download][href^="blob:"]');
  reload.addEventListener('click', () => { if (!busy()) location.reload(); });
  async function poll() {
    try {
      const response = await fetch('/__dev/revision', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('更新服務未就緒');
      const state = await response.json();
      reload.disabled = busy() || state.building || state.failed;
      if (state.failed) message.textContent = '修改暫時無法更新，先保留上一版；修正後會自動再試。';
      else if (!state.building && state.version !== version) {
        if (!protectedWork()) { location.reload(); return; }
        message.textContent = '有新版，已保留目前練習。請先保存筆記及原片，再載入新版。'; reload.hidden = false;
      } else if (state.building) message.textContent = '正在準備更新，目前練習會保留。';
      else message.textContent = '本機即時更新已啟用。';
    } catch { message.textContent = '正在重新連接本機更新服務，目前練習會保留。'; }
    setTimeout(poll, 1000);
  }
  void poll();
}
