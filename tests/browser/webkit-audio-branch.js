/* 檔案用途：在 Chromium 明選 WebKit 程式分支驗證準備、成檔與失敗恢復。所在層：條件分支回歸，不是原生 Safari 驗收。主要關聯：main.js、local-audio.js。 */
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  assert(await page.evaluate(async () => (await import('/local-audio.js')).safariAudio()), '測試必須明確選 WebKit 分支');
  await page.locator('#existing-mode').click();
  for (const [id, path] of [['reference-file', 'output/export-failure/reference.mp4'], ['self-file', 'output/export-failure/self.mp4']]) { await page.locator('#' + id).setInputFiles(path); await idle(); }
  await page.locator('#end').fill('1.5'); await page.locator('#end').dispatchEvent('change'); await idle();
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '有界原生音訊未成檔：' + await page.locator('#status').textContent());
  const previous = await page.locator('#output-download').getAttribute('href');
  const first = await page.evaluate(async () => {
    const store = await import('/storage.js'), state = await store.readLibrary(), artifact = state.data.exports.at(-1), blob = await store.readMedia(artifact.assetId);
    return { artifact, bytes: blob.size, diagnostics: JSON.parse(document.getElementById('diagnostics').textContent) };
  });
  assert(first.artifact.mimeType.startsWith('video/webm') && first.bytes > 0 && first.diagnostics.audioPath === 'bounded-aac-v1', '錯誤退回其他音訊／容器');
  // 原生能力拒絕時不能清掉前次 VS；故障移除後仍可用同一對原片重試。
  await page.evaluate(() => { window.coverageNativeSupport = AudioDecoder.isConfigSupported; AudioDecoder.isConfigSupported = async () => ({ supported: false }); });
  try {
    await page.locator('#export').click(); await idle();
    assert(await page.locator('#output-download').getAttribute('href') === previous && (await page.locator('#status').textContent()).includes('Safari'), '解碼拒絕破壞舊 VS 或沒有清楚說明');
  } finally { await page.evaluate(() => { AudioDecoder.isConfigSupported = window.coverageNativeSupport; }); }
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '能力恢復後無法重試');
  return { engine: 'Chromium', selectedWebKitBranch: true, nativeAudioDecoder: true, webmOutput: true, failedDecodePreservesPriorExport: true, retry: true, safariDeviceAcceptance: false };
}
