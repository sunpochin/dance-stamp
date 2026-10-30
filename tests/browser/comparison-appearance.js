/* 檔案用途：用合成色條核對兩側獨立鏡像與控制文字。所在層：畫面回歸。主要關聯：main.js、make-comparison-fixtures.ts。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await page.goto(origin); await idle();
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  // 先由使用者操作啟動預覽，讓兩個本機影片的可顯示影格進入共同畫面。
  await page.locator('#play').click();
  await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden);
  await page.waitForTimeout(400); await page.locator('#pause-comparison').click(); await idle();
  for (const referenceMirror of [false, true]) for (const selfMirror of [false, true]) {
    await page.locator('#reference-mirror').setChecked(referenceMirror); await idle();
    await page.locator('#self-mirror').setChecked(selfMirror); await idle();
    const observed = await page.locator('#canvas').evaluate(canvas => {
      const ctx = canvas.getContext('2d'), sample = x => [...ctx.getImageData(x, 524, 1, 1).data].slice(0, 3);
      const pixels = ctx.getImageData(0, 0, 1280, 48).data;
      const labels = [0, 0];
      for (let y = 0; y < 48; y++) for (let x = 0; x < 1280; x++) {
        const index = (y * 1280 + x) * 4;
        if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 500) {
          const localX = x % 640; if (localX >= 20 && localX < 130) labels[Math.floor(x / 640)]++;
        }
      }
      return { left: sample(80), right: sample(720), labels };
    });
    for (const [rgb, mirror] of [[observed.left, referenceMirror], [observed.right, selfMirror]]) {
      const channel = mirror ? 2 : 0, other = mirror ? 0 : 2;
      if (rgb[channel] < 150 || rgb[channel] < rgb[other] * 2) throw new Error('其中一側未獨立鏡像');
    }
    // GPU／CPU 字型反鋸齒可不同；驗證文字仍在各側原位置，不以逐像素相等冒充文字方向。
    if (observed.labels.some(count => count < 20)) throw new Error('鏡像讓文字離開原本的位置');
  }
  if (!await page.getByRole('heading', { name: '左 · 示範影片', exact: true }).isVisible()) throw new Error('老師／自己的角色不清楚');
  await page.setViewportSize({ width: 390, height: 844 });
  if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error('窄版出現水平溢出');
  return { fourIndependentMirrorCombinations: true, canvasLabelsNotMirrored: true, leftTeacherRightSelf: true, narrowLayout: true };
}
