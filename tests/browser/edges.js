/* 檔案用途：驗證循環、晚到權限、空間估計以外的取消行為。所在層：合成資料瀏覽器回歸。主要關聯：main.js、MEDIA_PROBE.md。 */
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  // 與預覽主機使用相同入口，避免把其他本機網站當成回歸目標。
  await page.goto('http://127.0.0.1:4174/');
  await page.getByLabel('示範影片', { exact: true }).setInputFiles('output/media-probe/reference.mp4');
  await page.waitForFunction(() => !document.getElementById('practice').disabled);
  await page.getByLabel('開始（秒）', { exact: true }).fill('1');
  await page.getByLabel('結束（秒）', { exact: true }).fill('1.5');
  await page.getByRole('combobox', { name: '練習速度', exact: true }).selectOption('2');
  await page.evaluate(() => {
    const video = document.getElementById('reference');
    window.loopSeeks = 0;
    video.addEventListener('seeked', () => window.loopSeeks++);
  });
  await page.getByRole('button', { name: '開始 A–B 循環', exact: true }).click();
  await page.waitForFunction(() => window.loopSeeks >= 21, null, { timeout: 20_000 });
  await page.getByRole('button', { name: '停止 A–B 循環', exact: true }).click();
  assert(await page.locator('#reference').evaluate(v => v.paused && v.playbackRate === 2), '循環停止或速度不正確');
  await page.evaluate(() => {
    if (window.__danceSyntheticCameraOnly !== true) throw new Error('必須使用合成假相機');
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.lateTracks = [];
    navigator.mediaDevices.getUserMedia = async c => {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const stream = await original(c); window.lateTracks = stream.getTracks(); return stream;
    };
  });
  await page.getByRole('button', { name: '開啟前相機', exact: true }).click();
  await page.getByRole('button', { name: '停止／取消', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('controls').disabled);
  await page.waitForFunction(() => window.lateTracks.length > 0 && window.lateTracks.every(t => t.readyState === 'ended'));
  const invalid = await page.request.get('http://127.0.0.1:4174/.env');
  const post = await page.request.post('http://127.0.0.1:4174/', { data: 'synthetic-only' });
  assert(invalid.status() === 404 && post.status() === 404, '靜態入口暴露非白名單或允許寫入');
  return { twentyLoopsAt2x: true, loopStopsAndKeepsRate: true, latePermissionStreamReleased: true, privatePathsAndWritesRejected: true };
}
