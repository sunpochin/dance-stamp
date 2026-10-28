/* 檔案用途：共用靜態白名單與回應政策，避免下載包和本機主機漂移。所在層：建置工具。主要關聯：build-web.ts、serve-web.ts、package-web.ts。 */
export const webFiles = ['index.html', 'style.css', 'main.js', 'timeline.js', 'recorder.js', 'library.js', 'storage.js', 'offline.js', 'sw.js']
export const notices = ['LICENSE', 'THIRD_PARTY_NOTICES.md']
export const webPaths = new Map([...webFiles, ...notices].map(file => [file === 'index.html' ? '/' : `/${file}`, file]))
export const webHeaders = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
}
// 只有靜態主機解析這個設定；不把設定檔當成公開可讀路由。
export const pagesHeaders = '# 檔案用途：靜態主機的回應政策；與本機主機共用來源。\n/*\n' + Object.entries(webHeaders).map(([key, value]) => `  ${key}: ${value}\n`).join('')
