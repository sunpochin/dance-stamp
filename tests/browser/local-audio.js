/* 檔案用途：用原生 WebCodecs 驗證有界音訊與取消／重試資料保護。所在層：瀏覽器回歸。主要關聯：local-audio.js、main.js、RECORD_COMPARE.md。 */
async page => {
  // 只在隔離合成資料環境確認更換來源，原片與前次 VS 的保護另作明確斷言。
  await page.evaluate(() => { window.confirm = () => true; });
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await page.evaluate(() => {
    const Native = AudioDecoder, closed = AudioDecoder.prototype.close, audit = window.audioAudit = { created: 0, closed: 0, frames: 0, sources: [], tracks: [] };
    const createSource = AudioContext.prototype.createBufferSource, createDestination = AudioContext.prototype.createMediaStreamDestination;
    AudioContext.prototype.createBufferSource = function() { const source = createSource.call(this); audit.sources.push(source); return source; };
    AudioContext.prototype.createMediaStreamDestination = function() { const destination = createDestination.call(this); audit.tracks.push(...destination.stream.getTracks()); return destination; };
    // 只計生命週期，仍由瀏覽器真正解 AAC；這是工程回歸，不冒充 Safari 真機。
    globalThis.AudioDecoder = class extends Native {
      constructor(init) { audit.created++; super({ ...init, output(data) { const close = data.close.bind(data); data.close = () => { audit.frames++; close(); }; init.output(data); } }); }
      close() { audit.closed++; return closed.call(this); }
    };
  });
  const decoded = await page.evaluate(async () => {
    const { decodeLocalAudio } = await import('/local-audio.js'), ctx = new AudioContext();
    const file = await (await fetch('/qa-reference.mp4')).blob();
    try {
      const buffer = await decodeLocalAudio(file, ctx, 0, 3, new AbortController().signal);
      const pcm = buffer.getChannelData(0); let peak = 0; for (const x of pcm.subarray(0, 2400)) peak = Math.max(peak, Math.abs(x));
      const offset = await decodeLocalAudio(file, ctx, 12, 1, new AbortController().signal);
      return { rate: buffer.sampleRate, frames: buffer.length, peak, offsetFrames: offset.length };
    } finally { await ctx.close(); }
  });
  assert(decoded.rate === 48000 && decoded.frames === 144000 && decoded.peak > .1 && decoded.offsetFrames === 48000, '來源零點或片段配置錯誤');
  assert(await page.evaluate(() => window.audioAudit.created === window.audioAudit.closed), '直接解碼未釋放');
  await page.locator('#existing-mode').click();
  await page.locator('#reference-file').setInputFiles('output/media-feasibility/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/media-feasibility/self-silent.mp4'); await idle();
  const change = async (id, value) => { await page.locator(`#${id}`).fill(value); await page.locator(`#${id}`).dispatchEvent('change'); await idle(); };
  await change('end', '3');
  await page.locator('#export').click(); await idle();
  const previous = await page.locator('#output-download').getAttribute('href'); assert(previous?.startsWith('blob:'), '首次輸出失敗');
  const before = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data.exports.length);
  await page.evaluate(() => { window.originalSupport = AudioDecoder.isConfigSupported; AudioDecoder.isConfigSupported = async () => ({ supported: false }); });
  await page.locator('#export').click(); await idle();
  assert(await page.locator('#output-download').getAttribute('href') === previous, '格式拒絕破壞前次 VS');
  assert((await page.locator('#status').textContent()).includes('Safari'), '不支援音訊沒有清楚拒絕');
  await page.evaluate(() => { AudioDecoder.isConfigSupported = window.originalSupport; });
  // 準備中取消也要保留舊片；模擬較慢的原生支援查詢，不替換實際解碼內容。
  await page.evaluate(() => { window.originalSupport = AudioDecoder.isConfigSupported; AudioDecoder.isConfigSupported = async config => { await new Promise(r => setTimeout(r, 300)); return window.originalSupport.call(AudioDecoder, config); }; });
  await page.locator('#export').click(); await page.locator('#stop').click(); await idle();
  await page.evaluate(() => { AudioDecoder.isConfigSupported = window.originalSupport; });
  assert(await page.locator('#output-download').getAttribute('href') === previous, '準備取消破壞前次 VS');
  await page.locator('#export').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('合成中')); await page.locator('#stop').click(); await idle();
  assert(await page.locator('#output-download').getAttribute('href') === previous, '合成取消破壞前次 VS');
  const after = await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data.exports.length); assert(after === before, '取消新增假完成輸出');
  await page.locator('#export').click(); await idle();
  assert(await page.locator('#output-download').getAttribute('href') !== previous, '取消後不能重試');
  const afterRetry = await page.locator('#output-download').getAttribute('href');
  await page.locator('#reference-file').setInputFiles('output/media-feasibility/self-silent.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/media-feasibility/reference.mp4'); await idle();
  await change('end', '3'); await page.locator('#export').click(); await idle();
  assert(await page.locator('#output-download').getAttribute('href') !== afterRetry, '無音軌來源未成檔');
  const audit = await page.evaluate(() => { const a = window.audioAudit; return { created: a.created, closed: a.closed, frames: a.frames, buffersReleased: a.sources.every(s => s.buffer === null), tracksStopped: a.tracks.every(t => t.readyState === 'ended') }; });
  assert(audit.created === audit.closed && audit.frames > 0 && audit.buffersReleased && audit.tracksStopped, '錯誤／成功後仍佔用音訊資源');
  return { nativeWebCodecs: decoded, formatRejection: true, preparationCancel: true, outputCancel: true, previousOutputRetained: true, retry: true, silentDifferentSource: true, audit };
}
