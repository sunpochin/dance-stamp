/* 檔案用途：驗證解壓後的本機包有可信任入口及不可寫入白名單。所在層：下載包瀏覽器驗收。主要關聯：START_HERE.md、serve-web.ts、package-web.ts。 */
async page => {
  const origin = new URL(page.url()).origin, assert = (ok, message) => { if (!ok) throw new Error(message); };
  // 只測操作者自己開的隔離合成環境，不能誤送到公開網站或日常資料頁。
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) && await page.evaluate(() => window.__danceSyntheticCameraOnly === true), '必須使用本機隔離合成設定');
  await page.goto(origin);
  await page.waitForFunction(() => document.getElementById('offline-status').textContent.includes('已檢查應用資源完整'));
  assert(await page.evaluate(async () => window.isSecureContext && (await (await import('/storage.js')).readLibrary()).data.videos.length === 0), '入口不可信任或並非乾淨測試資料');
  const root = await page.request.get(origin + '/'), script = await page.request.get(origin + '/main.js'), sw = await page.request.get(origin + '/sw.js');
  const headers = root.headers();
  assert(headers['cache-control'] === 'no-store' && headers['content-security-policy'].includes("frame-ancestors 'none'") && headers['permissions-policy'].includes('microphone=()'), '下載包的實際回應政策不完整');
  assert(script.headers()['content-type'].startsWith('text/javascript'), '模組 MIME 錯誤');
  const version = (await sw.text()).match(/const version = '([a-f0-9]{16})'/)?.[1]; assert(version, '沒有可追溯的靜態版本');
  for (const path of ['/.env', '/.git/config', '/release.json', '/_headers', '/scripts/serve-web.ts', '/__test__/version']) assert((await page.request.get(origin + path)).status() === 404, '不應公開包內非應用路由');
  for (const method of ['POST', 'PUT', 'DELETE']) assert((await page.request.fetch(origin + '/', { method })).status() === 404, '本機主機接受了寫入方法');
  const head = await page.request.head(origin + '/main.js'); assert(head.status() === 200 && (await head.body()).length === 0, 'HEAD 行為錯誤');
  return { version, secureContext: true, emptyIsolatedLibrary: true, realHeadersAndMime: true, internalFilesAndWritesDenied: true, offlineResourcesVerified: true };
}
