/* 檔案用途：只在明確操作後載入 GIS 並請求逐檔授權。所在層：Web OAuth 入口。主要關聯：google-drive.js、cloud-ui.js。 */
import { driveScope } from './google-drive.js';
export function cloudConfig(clientId, origin, currentOrigin) {
  if (!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('請填寫 Web OAuth client ID；不需要 secret。');
  const url = new URL(origin);
  if (url.origin !== origin || origin !== currentOrigin || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('授權 origin 必須精確等於目前的 HTTPS 網站或本機測試網址。');
  return { clientId, origin };
}
export async function loadGoogle(signal) {
  const global = /** @type {any} */ (window);
  if (global.google?.accounts?.oauth2) return global.google.accounts.oauth2;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const finish = error => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); script.onload = null; script.onerror = null; if (error) { script.remove(); reject(error); } else resolve(undefined); };
    const cancel = () => finish(new DOMException('已取消', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Google 工具載入逾時，可重試。')), 20000);
    // 不放在首頁 HTML，也不經 SW 快取；尚未選擇雲端功能時完全不載入第三方程式。
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.onload = () => finish(undefined); script.onerror = () => finish(new Error('無法載入 Google 工具，請檢查網路或網站政策。'));
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel(); else document.head.append(script);
  });
  if (!global.google?.accounts?.oauth2) throw new Error('Google 工具尚未就緒。');
  return global.google.accounts.oauth2;
}
export function requestGoogle(oauth, clientId, signal) {
  return new Promise((resolve, reject) => {
    const finish = (error, value) => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); if (settled) return; settled = true; error ? reject(error) : resolve(value); };
    let settled = false;
    const cancel = () => finish(new DOMException('已取消', 'AbortError'), undefined);
    const timer = setTimeout(() => finish(new Error('授權尚未完成，請重新連接。'), undefined), 120000);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    const client = oauth.initTokenClient({
      client_id: clientId, scope: driveScope, include_granted_scopes: false,
      callback: result => result.error || !oauth.hasGrantedAllScopes(result, driveScope) ? finish(new Error('未允許檔案授權，仍可使用本機功能。'), undefined) : finish(undefined, result),
      error_callback: () => finish(new Error('授權視窗已關閉或被阻擋，請由連接按鈕重試。'), undefined),
    });
    // 這個呼叫必須留在點按事件內；先 await 載入 SDK 會失去使用者手勢並被瀏覽器擋 popup。
    try { client.requestAccessToken({ prompt: 'select_account' }); } catch { finish(new Error('無法開啟授權視窗。'), undefined); }
  });
}
