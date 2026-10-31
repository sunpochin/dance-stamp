/* 檔案用途：核對相機與既有雙片共用音訊／資料生命週期。所在層：Web 整合驗收。主要關聯：capture.js、existing-comparison.js、main.js。 */
// 相機設定已收在選用區；先展開，再沿用原本的錄影與資料保護斷言。
async (page) => {
  const origin = new URL(page.url()).origin, outside = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout: 95_000 });
  const library = () => page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data);
  const change = async (id, value) => { await page.locator(`#${id}`).fill(value); await page.locator(`#${id}`).dispatchEvent('change'); await idle(); };
  const saveOutput = async name => {
    const waiting = page.waitForEvent('download'); await page.locator('#output-download').click();
    const file = await waiting, path = `output/media-probe/${name}.${file.suggestedFilename().split('.').pop()}`;
    await file.saveAs(path); return path;
  };
  page.on('request', request => { if ((!request.url().startsWith(origin + '/') && !request.url().startsWith('blob:')) || !['GET', 'HEAD'].includes(request.method())) outside.push({ method: request.method(), url: request.url() }); });
  await page.addInitScript(() => {
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices), NativeAudio = window.AudioContext;
    window.integrationTracks = []; window.integrationRequests = []; window.integrationAudio = [];
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!window.__danceSyntheticCameraOnly || constraints.audio !== false) throw new Error('只能使用隔離合成相機，禁止麥克風');
      window.integrationRequests.push(constraints); const stream = await capture(constraints);
      window.integrationTracks.push(...stream.getTracks()); return stream;
    };
    window.AudioContext = class extends NativeAudio { constructor(...args) { super(...args); window.integrationAudio.push(this); } };
    // 確認只限隔離的合成測片；不代替真人使用者的保存／換片決定。
    window.confirm = () => true;
  });
  await page.goto(origin); await idle();
  await page.locator('#reference-file').setInputFiles('output/media-probe/reference.mp4'); await idle();
  await page.locator('#copy-reference').click(); await idle();
  await page.locator('#mark').click(); await page.locator('#marker-title').fill('合成錄影整合標記'); await page.locator('#marker-form').evaluate(form => form.requestSubmit()); await idle();
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click(); await idle(); await page.locator('#capture').click(); await idle();
  const before = await library(), recorded = before.takes.at(-1);
  assert(recorded.state === 'ready' && Number.isSafeInteger(recorded.captureTiming?.recorderStartedMs), '沒有完成真實 MediaRecorder 合成相機路徑');
  const bytes = await page.evaluate(async id => (await (await import('/storage.js')).readMedia(id))?.size, recorded.cameraAssetId);
  assert(bytes > 0, '錄影原片未落盤');
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '錄影路徑沒有輸出單一 VS');
  const captureOutput = await saveOutput('integration-capture-vs'), saved = await library();
  const firstExport = saved.exports.at(-1), captureInfo = JSON.parse(await page.locator('#diagnostics').textContent()).export;
  await page.locator('#existing-mode').click();
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4'); await idle();
  // 新選片預設全長；此比較案例明確選 15 秒，保留原本的媒體護欄與測試範圍。
  await page.locator('#end').fill('15');
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  await change('start', '12'); await change('end', '17'); await change('offset', '4');
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '切到既有雙片後無法重新合成');
  const existingOutput = await saveOutput('integration-existing-vs'), after = await library();
  const retained = await page.evaluate(async ({ recorded, firstExport, bytes }) => {
    const store = await import('/storage.js'), { data } = await store.readLibrary();
    return JSON.stringify(data.takes.find(t => t.id === recorded.id)) === JSON.stringify(recorded) && (await store.readMedia(recorded.cameraAssetId))?.size === bytes && JSON.stringify(data.exports.find(e => e.id === firstExport.id)) === JSON.stringify(firstExport) && !!await store.readMedia(firstExport.assetId);
  }, { recorded, firstExport, bytes });
  assert(retained && JSON.stringify(after.markers) === JSON.stringify(saved.markers), '切換入口破壞原錄影、筆記或已存 VS');
  const external = after.takes.filter(t => !saved.takes.some(old => old.id === t.id));
  assert(external.length > 0 && external.every(t => t.state === 'ready' && !t.captureTiming), '外部比較偽造相機紀錄');
  const resources = await page.evaluate(() => ({ calls: window.integrationRequests.length, noMic: window.integrationRequests.every(c => c.audio === false), stopped: window.integrationTracks.every(t => t.readyState === 'ended'), audioContexts: window.integrationAudio.length, suspended: window.integrationAudio.every(a => a.state === 'suspended') }));
  assert(resources.calls === 1 && resources.noMic && resources.stopped && resources.audioContexts === 1 && resources.suspended && outside.length === 0, `切換入口遺漏清理或多開相機／音訊：${JSON.stringify(resources)}`);
  await page.reload(); await idle();
  await page.locator('#library').selectOption(recorded.referenceVideoId); await page.locator('#open-library').click(); await idle();
  await page.getByRole('button', { name: '開啟自拍／恢復', exact: true }).click(); await idle();
  assert(Number(await page.locator('#start').inputValue()) === 0 && Number(await page.locator('#end').inputValue()) === 15 && Number(await page.locator('#rate').inputValue()) === 1 && await page.locator('#self').evaluate(v => v.readyState >= 2), '兩入口使用後無法重開原錄影配方');
  return { captureOutput, existingOutput, captureInfo, oneSharedAudioContext: true, cameraRequestedOnlyExplicitly: true, originalsNotesAndOldOutputRetained: true, externalTakesHaveNoCaptureTiming: true, recordedPairReopens: true, outsideRequests: outside, resources };
}
