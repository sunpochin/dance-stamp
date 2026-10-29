/* 檔案用途：用原生 WebCodecs 驗證有界音訊與取消／重試資料保護。所在層：瀏覽器回歸。主要關聯：local-audio.js、main.js、RECORD_COMPARE.md。 */
async page => {
  // 只在隔離合成資料環境確認更換來源，原片與前次 VS 的保護另作明確斷言。
  await page.evaluate(() => { window.confirm = () => true; });
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  assert(await page.evaluate(async () => (await import('/local-audio.js')).safariAudio()), '需明確選取工程用 WebKit 分支，不冒充原生 Safari');
  await page.evaluate(() => {
    const Native = AudioDecoder, closed = AudioDecoder.prototype.close, audit = window.audioAudit = { created: 0, closed: 0, frames: 0, sources: [], tracks: [] };
    // 只拒絕 WebM，MP4 仍宣稱支援；若產品偷偷退回 MP4，這個負向控制必須抓到。
    const Recorder = MediaRecorder; audit.formats = []; audit.formatChecks = []; audit.formatFault = '';
    globalThis.MediaRecorder = class extends Recorder {
      static isTypeSupported(type) { audit.formatChecks.push(type); return audit.formatFault === 'unsupported' && type === 'video/webm;codecs=vp8,opus' ? false : Recorder.isTypeSupported(type); }
      constructor(stream, options) { audit.formats.push(options?.mimeType || ''); if (audit.formatFault === 'construct' && options?.mimeType === 'video/webm;codecs=vp8,opus') throw new Error('synthetic WebM constructor failure'); super(stream, options); }
      start(...args) { if (audit.formatFault === 'start' && this.mimeType.startsWith('video/webm')) throw new Error('synthetic WebM start failure'); return super.start(...args); }
    };
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
  assert((await page.locator('#output-download').getAttribute('download')).endsWith('.webm'), '相容匯出未使用真正 WebM 檔名');
  const fingerprints = () => page.evaluate(async () => {
    // 原 CSP 禁止 fetch(blob:)；直接讀選入 File 與已保存 VS 的 bytes，不能放寬策略讓工具過關。
    const store = await import('/storage.js'), library = await store.readLibrary(), latest = library.data.exports.at(-1);
    const blobs = [document.getElementById('reference-file').files[0], document.getElementById('self-file').files[0], await store.readMedia(latest.assetId)];
    const hashes = await Promise.all(blobs.map(async blob => { if (!(blob instanceof Blob)) throw new Error('來源或舊 VS 不可讀'); const bytes = await blob.arrayBuffer(); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join(''); }));
    return { hashes, urls: [document.getElementById('reference').src, document.getElementById('self').src, document.getElementById('output-download').href] };
  });
  const preserved = await fingerprints(), webmRejections = [];
  for (const mode of ['unsupported', 'construct', 'start']) {
    await page.evaluate(mode => { window.audioAudit.formatFault = mode; }, mode);
    try {
      await page.locator('#export').click(); await idle();
      assert(await page.locator('#output-download').getAttribute('href') === previous, mode + ' 破壞前次 VS');
      assert((await page.evaluate(async () => (await (await import('/storage.js')).readLibrary()).data.exports.length)) === before, mode + ' 新增假完成輸出');
      assert((await page.locator('#status').textContent()).includes('WebM'), mode + ' 未明確拒絕專用格式');
      assert(JSON.stringify(await fingerprints()) === JSON.stringify(preserved), mode + ' 改變原片或舊 VS bytes');
      assert(await page.evaluate(() => window.audioAudit.sources.every(s => s.buffer === null) && window.audioAudit.tracks.every(t => t.readyState === 'ended') && document.getElementById('reference').paused && document.getElementById('self').paused), mode + ' 未釋放本輪音訊或停止播放');
      webmRejections.push({ mode, retained: true, resourcesReleased: true });
    } finally { await page.evaluate(() => { window.audioAudit.formatFault = ''; }); }
  }

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
  const audit = await page.evaluate(() => { const a = window.audioAudit; return { created: a.created, closed: a.closed, frames: a.frames, buffersReleased: a.sources.every(s => s.buffer === null), tracksStopped: a.tracks.every(t => t.readyState === 'ended'), formats: a.formats, formatChecks: a.formatChecks }; });
  assert(audit.formats.length > 0 && [...audit.formats, ...audit.formatChecks].every(type => type === 'video/webm;codecs=vp8,opus'), '相容匯出走到 MP4 或其他未驗證候選');
  assert(audit.created === audit.closed && audit.frames > 0 && audit.buffersReleased && audit.tracksStopped, '錯誤／成功後仍佔用音訊資源');
  return { nativeWebCodecs: decoded, webmRejections, formatRejection: true, preparationCancel: true, outputCancel: true, previousOutputRetained: true, retry: true, silentDifferentSource: true, audit };
}
