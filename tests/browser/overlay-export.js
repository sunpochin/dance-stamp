/* 檔案用途：驗證兩種比較可分別成檔、疊影真實像素與取消保全。所在層：瀏覽器回歸。主要關聯：main.js、comparison-overlay.js、DATA_FORMAT.md。 */
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); }, files = [];
  const origin = new URL(page.url()).origin;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  const set = async (id, value, event = 'input') => { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).dispatchEvent(event); if (event === 'change') await idle(); };
  const stored = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('匯出測試禁止相機與麥克風'); }; window.confirm = () => true; });
  await page.goto(origin); await idle();
  assert(await page.locator('#side-preview').evaluate(el => el.open), '左右預覽未預設展開');
  await page.locator('#side-preview summary').click();
  assert(await page.locator('#canvas').isHidden(), '左右預覽無法手動收合');
  await page.reload(); await idle();
  assert(await page.locator('#canvas').isVisible(), '重開後左右預覽未恢復預設展開');
  assert(await page.locator('#export').isDisabled() && await page.locator('#play').isDisabled() && await page.locator('#overlay-play').isDisabled(), '缺片仍可播放或匯出');
  // 各區只有自己的播放入口，不能再把左右畫面包在疊影區裡；暫停仍沿共同時間線。
  assert(await page.locator('#play').count() === 1 && await page.locator('#overlay-play').count() === 1 && await page.locator('#overlay-pause').count() === 0, '播放入口未分區或重複');
  assert(await page.locator('#play').evaluate(el => el.closest('section').getAttribute('aria-labelledby') === 'side-title') && await page.locator('#overlay-play').evaluate(el => el.closest('section').getAttribute('aria-labelledby') === 'overlay-title'), '播放鍵沒有放在對應區塊');
  assert(await page.locator('#canvas').evaluate(el => !el.closest('section[aria-labelledby="overlay-title"]')), '左右畫面仍混在疊影區');
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  // 新選片預設全長；此比較案例明確選 15 秒，保留原本的媒體護欄與測試範圍。
  await page.locator('#end').fill('15');
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  await set('start', 12, 'change'); await set('end', 15, 'change'); await set('offset', 4, 'change');
  await page.locator('#reference-mirror').setChecked(true); await idle();
  const exportFile = async (label, pixels, duration = 3) => {
    await page.locator('#export').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('合成中'));
    assert(await page.locator('#export-layout').isDisabled() && await page.locator('#overlay-opacity').isDisabled() && await page.locator('#play').isDisabled() && await page.locator('#overlay-play').isDisabled(), '成檔期間仍可改外觀或重開比較');
    await idle();
    assert((await page.locator('#status').textContent()).includes('已成檔'), '比較未成檔：' + await page.locator('#status').textContent());
    await page.locator('#output').evaluate(async video => {
      if (video.readyState < 2) await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true }));
      await new Promise(resolve => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = 0.7; });
    });
    const actual = await page.locator('#output').evaluate((video, points) => {
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(video, 0, 0);
      return { width: c.width, height: c.height, duration: video.duration, pixels: points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3)) };
    }, pixels.map(p => p.slice(0, 2)));
    assert(actual.width === 1280 && actual.height === 720 && Math.abs(actual.duration - duration) <= 0.1, '尺寸或共同片長改變');
    for (let i = 0; i < pixels.length; i++) assert(actual.pixels[i].every((v, channel) => Math.abs(v - pixels[i][2][channel]) < 28), label + ' 實際影片像素不符：' + JSON.stringify(actual));
    const expected = await page.evaluate(async () => {
      // CSP 禁止 fetch(blob:)，從真正已提交的影片讀 bytes，再核對實際下載。
      const storage = await import('/storage.js'), state = await storage.readLibrary();
      const bytes = await (await storage.readMedia(state.data.exports.at(-1).assetId)).arrayBuffer();
      return { bytes: bytes.byteLength, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('') };
    });
    const pending = page.waitForEvent('download'); await page.locator('#output-download').click(); const download = await pending;
    const path = 'output/playwright/' + label + '.' + download.suggestedFilename().split('.').pop(); await download.saveAs(path);
    files.push({ path, label, expected, actual });
    return (await stored()).exports.at(-1);
  };
  assert(await page.locator('#export-layout').inputValue() === 'side-by-side', '左右並排預設消失');
  await exportFile('side-by-side', []);
  await page.locator('#export-layout').selectOption('overlay');
  for (const opacity of [0, 32, 100]) {
    await set('overlay-opacity', opacity);
    const artifact = await exportFile('overlay-' + opacity, [[133, 640, [255 * (1 - opacity / 100), 0, 255 * opacity / 100]]]);
    assert(artifact.presentation?.opacity === opacity / 100, '疊影外觀沒有保存');
    assert(await page.locator('#canvas').evaluate(c => { const p = c.getContext('2d').getImageData(10, 10, 1, 1).data; return p[0] < 20 && p[1] < 20 && p[2] < 20; }), '疊影成檔後左右預覽未還原');
    await set('overlay-opacity', opacity === 100 ? 99 : opacity + 1);
    assert((await page.locator('#output-status').textContent()).includes('先前設定'), '舊片誤標為目前透明度');
  }
  await set('overlay-opacity', 100); await set('overlay-self-x', 200);
  await set('overlay-reference-scale', 50); await set('overlay-reference-x', 25); await set('overlay-reference-y', -25);
  const transformed = await exportFile('overlay-transformed', [[667, 333, [0, 0, 255]], [347, 333, [8, 12, 14]]]);
  assert(transformed.presentation.reference.scale === 0.5 && transformed.presentation.reference.x === 0.25 && transformed.presentation.self.x === 2, '位置外觀紀錄遺失');
  const before = await stored(), old = await page.locator('#output-download').getAttribute('href');
  await page.locator('#export').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('合成中'));
  await page.locator('#stop').click(); await idle();
  assert(await page.locator('#output-download').getAttribute('href') === old && JSON.stringify((await stored()).exports) === JSON.stringify(before.exports), '取消破壞舊片或誤存新片');
  // 換回左右仍能再成檔；空間設定不能污染左右輸出或刪除先前疊影。
  await page.locator('#export-layout').selectOption('side-by-side');
  await exportFile('side-after-overlay', []);
  const after = await stored(); assert(after.exports.length === 6 && !after.exports.at(-1).presentation && after.exports.some(e => e.presentation), '兩種輸出沒有同時保留');
  await page.locator(`[data-focus-key="export:${transformed.id}:download"]`).click(); await idle();
  assert((await page.locator('#output-download').getAttribute('download')).startsWith('dance-overlay.') && (await page.locator('#output-status').textContent()).includes('已取回當時保存的疊影'), '無法取回另存的疊影成品');
  // 橫片本來已占滿半框；另用直片抓出中央黑邊，並核對鏡像沒有翻轉靠齊方向。
  await set('start', 0, 'change'); await set('end', 2, 'change'); await set('offset', 0, 'change');
  const portrait = 'output/media-probe/player/portrait.mp4', landscape = 'output/comparison/reference.mp4';
  let portraitPixels;
  for (const [left, right] of [[portrait, landscape], [landscape, portrait], [portrait, portrait]]) {
    await page.locator('#reference-file').setInputFiles(left); await idle();
    // 混合比例也可能選到 80 秒示範；先選本例原有的兩秒，避免右片被護欄拒絕後只等停用欄位。
    await set('end', 2, 'change');
    await page.locator('#self-file').setInputFiles(right); await idle();
    assert(!await page.locator('#compare').isDisabled(), '混合比例配對未就緒：' + await page.locator('#status').textContent());
    await set('start', 0, 'change'); await set('end', 2, 'change'); await set('offset', 0, 'change');
    for (const referenceMirror of [false, true]) for (const selfMirror of [false, true]) {
      await page.locator('#reference-mirror').setChecked(referenceMirror); await idle();
      await page.locator('#self-mirror').setChecked(selfMirror); await idle();
      await set('scrub', 0.7, 'change');
      const pixels = await page.evaluate(() => {
        const actual = document.getElementById('canvas').getContext('2d'), points = [];
        for (const [id, side, mirrorId] of [['reference', 0, 'reference-mirror'], ['self', 1, 'self-mirror']]) {
          const video = document.getElementById(id), portrait = video.videoHeight > video.videoWidth;
          // 這兩種固定素材的完整 fit 尺寸由來源比例獨立算定，四角驗證不能只抽中央一點。
          const width = portrait ? 378 : 640, height = portrait ? 672 : 360;
          const x = side === 0 ? 640 - width : 640, y = 48 + (672 - height) / 2;
          const expected = document.createElement('canvas'); expected.width = width; expected.height = height;
          const ctx = expected.getContext('2d'); ctx.drawImage(video, 0, 0, width, height);
          for (const u of [4, width - 5]) for (const v of [4, height - 5]) {
            const rgb = [...ctx.getImageData(document.getElementById(mirrorId).checked ? width - 1 - u : u, v, 1, 1).data].slice(0, 3);
            const observed = [...actual.getImageData(x + u, y + v, 1, 1).data].slice(0, 3);
            if (!observed.every((value, channel) => Math.abs(value - rgb[channel]) < 5)) throw new Error('四角不完整、中央留白或鏡像靠齊錯誤：' + JSON.stringify({ id, u, v, rgb, observed }));
            points.push([x + u, y + v, rgb]);
          }
        }
        return points;
      });
      if (left === portrait && right === portrait) portraitPixels = pixels;
    }
  }
  await exportFile('side-portrait-joined', portraitPixels, 2);
  for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '比較介面窄版溢出'); }
  await page.locator('#side-preview').screenshot({ path: 'output/playwright/side-preview-joined.png' });
  await page.locator('#save-result').screenshot({ path: 'output/playwright/overlay-export-ui.png' });
  return { files, separateLayoutsPreserved: true, cancelPreserved: true, mixedPixelsAndTransforms: true, sharedPlaybackControls: true, sidePreviewOpen: true, portraitAndMixedLayoutsJoined: true };
}
