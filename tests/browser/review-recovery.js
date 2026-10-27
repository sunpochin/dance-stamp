/* 檔案用途：重現 PR #26 的音訊、換片筆記與自拍替換恢復。所在層：合成資料瀏覽器回歸。主要關聯：main.js、MEDIA_PROBE.md。 */
async (page) => {
  const origin = new URL(page.url()).origin, checks = {};
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled);
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.reviewAudioContexts = [];
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) { super(...args); window.reviewAudioContexts.push(this); }
    };
  });
  await page.goto(origin);
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  const firstVideoId = await page.locator('#library').inputValue();
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成原片筆記');
  await page.getByRole('button', { name: '儲存標記', exact: true }).click(); await idle();
  await page.getByRole('button', { name: '編輯', exact: true }).click(); await idle();
  await page.locator('#marker-title').fill('未儲存草稿');
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  checks.markerDraftPreserved = await page.locator('#marker-title').inputValue() === '未儲存草稿';
  await page.locator('#cancel-marker').click();
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  checks.markerEditorCleared = await page.locator('#marker-form').evaluate(form => form.hidden && !form.elements.namedItem('marker-title')?.value);
  checks.originalMarkerPreserved = (await library()).markers.some(m => m.videoId === firstVideoId && m.title === '合成原片筆記');
  await page.locator('#end').fill('1.5');
  await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#play').click(); await idle();
  checks.audioSuspendedWhenIdle = await page.evaluate(() => window.reviewAudioContexts[0]?.state === 'suspended');
  await page.locator('#reference').evaluate(video => video.play());
  await page.waitForTimeout(200);
  checks.nativePracticeAudioRunning = await page.evaluate(() => window.reviewAudioContexts[0]?.state === 'running');
  await page.locator('#reference').evaluate(video => video.pause()); await page.waitForTimeout(100);
  checks.nativePauseSuspendsAudio = await page.evaluate(() => window.reviewAudioContexts[0]?.state === 'suspended');
  await page.locator('#loop').click(); await page.waitForTimeout(200);
  checks.loopPracticeAudioRunning = await page.evaluate(() => window.reviewAudioContexts[0]?.state === 'running');
  await page.locator('#loop').click();
  await page.evaluate(() => { window.confirm = () => true; });
  const currentRecipe = () => library().then(data => data.recipes.at(-1));
  async function verifyReplacement(cancel) {
    const before = await currentRecipe();
    if (cancel) await page.locator('#self').evaluate(video => {
      window.reviewLoadBlocked = false;
      // 等新檔真的載入後才模擬等待，避免 src 自動載入比取消更早完成而誤測成成功替換。
      video.addEventListener('loadeddata', event => { event.stopImmediatePropagation(); window.reviewLoadBlocked = true; }, { capture: true, once: true });
    });
    await page.locator('#self-file').setInputFiles(cancel ? 'output/media-probe/reference.mp4' : { name: 'synthetic-broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic invalid video') });
    if (cancel) { await page.waitForFunction(() => window.reviewLoadBlocked && document.getElementById('controls').disabled); await page.locator('#stop').click(); }
    await idle();
    const offset = cancel ? '0.2' : '0.1';
    await page.locator('#offset').fill(offset); await page.locator('#offset').dispatchEvent('change'); await idle();
    const after = (await library()).recipes.find(r => r.id === before.id);
    checks[cancel ? 'cancelPreservesRecipe' : 'invalidFilePreservesRecipe'] = after.offsetMs === Number(offset) * 1000 && after.revision > before.revision;
    await page.locator('#export').click(); await idle();
    checks[cancel ? 'cancelStillPersistsExport' : 'invalidFileStillPersistsExport'] = (await library()).exports.some(e => e.recipeId === before.id && e.recipeRevision === after.revision);
  }
  await verifyReplacement(false);
  await page.locator('#self-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await verifyReplacement(true);
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#reference').evaluate(video => video.play()); await page.waitForTimeout(200);
  checks.changedReferenceAudioRunning = await page.evaluate(() => window.reviewAudioContexts[0]?.state === 'running');
  await page.locator('#reference').evaluate(video => video.pause());
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length) throw new Error(JSON.stringify({ checks, failures }));
  return checks;
}
