/* 檔案用途：驗證編碼／讀回失敗仍保留成功 VS，並可同頁改用 WebM 重試。所在層：#11 合成回歸。主要關聯：main.js、recorder.js、MEDIA_PROBE.md。 */
async (page) => {
  const origin = new URL(page.url()).origin, folder = 'output/export-failure';
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true', null, { timeout: 30_000 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    window.confirm = () => true;
  });
  await page.goto(origin); await idle();
  await page.locator('#existing-mode').click();
  await page.locator('#reference-file').setInputFiles(`${folder}/reference.mp4`); await idle();
  await page.locator('#self-file').setInputFiles(`${folder}/self.mp4`); await idle();
  for (const [id, value] of [['start', '2'], ['end', '5'], ['offset', '1']]) {
    await page.locator(`#${id}`).fill(value); await page.locator(`#${id}`).dispatchEvent('change'); await idle();
  }
  await page.locator('#self-mirror').setChecked(true); await idle();
  const save = async (id, name) => {
    const waiting = page.waitForEvent('download'); await page.locator(`#${id}`).click();
    const download = await waiting, extension = download.suggestedFilename().split('.').pop();
    const path = `${folder}/${name}.${extension}`; await download.saveAs(path); return path;
  };
  const state = () => page.evaluate(async () => {
    const library = await (await import('/storage.js')).readLibrary();
    return { data: library.data, reference: document.getElementById('reference-download').href, take: document.getElementById('take-download').href, output: document.getElementById('output-download').href };
  });
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '基準輸出未完成');
  const baseline = await state(), files = [await save('output-download', 'baseline')];
  files.push(await save('reference-download', 'reference-before'), await save('take-download', 'self-before'));
  await page.evaluate(() => {
    const NativeRecorder = MediaRecorder, nativeLoad = HTMLMediaElement.prototype.load;
    const capture = HTMLCanvasElement.prototype.captureStream;
    window.exportFailure = { mode: '', attempted: [], streams: [], readbacks: 0, decodeErrors: 0, injected: 0 };
    HTMLCanvasElement.prototype.captureStream = function(rate) {
      const stream = capture.call(this, rate); window.exportFailure.streams.push(stream); return stream;
    };
    // 只破壞本輪新輸出；主播放器與上次成功檔不能因故障注入而被測試自行撤銷。
    HTMLMediaElement.prototype.load = function() {
      const test = window.exportFailure;
      if (!this.isConnected && this.src.startsWith('blob:') && ['readback', 'cancel-readback'].includes(test.mode)) {
        test.readbacks++;
        if (test.mode === 'cancel-readback') {
          // 設定 src 本身就會開始載入；只略過 load() 仍可能在按取消前完成，須攔住完成事件。
          test.injected++; this.addEventListener('loadeddata', event => event.stopImmediatePropagation(), { once: true, capture: true }); return;
        }
        this.addEventListener('error', () => { test.decodeErrors++; }, { once: true });
      }
      return nativeLoad.call(this);
    };
    window.MediaRecorder = class extends NativeRecorder {
      static isTypeSupported(type) { return window.exportFailure.mode === 'unavailable' || super.isTypeSupported(type); }
      constructor(stream, options) {
        const test = window.exportFailure;
        test.attempted.push(options?.mimeType || 'default');
        if (test.mode === 'unavailable' || (test.mode === 'webm' && options?.mimeType?.startsWith('video/mp4'))) {
          test.injected++; throw new DOMException('synthetic unsupported encoder', 'NotSupportedError');
        }
        super(stream, options);
        if (test.mode === 'encoder') this.addEventListener('start', () => setTimeout(() => { test.injected++; this.dispatchEvent(new Event('error')); }, 200), { once: true });
        // 讓真正的解碼器拒絕壞 bytes；只在 load() 丟例外無法驗證媒體 error 的路徑。
        if (test.mode === 'readback') this.addEventListener('dataavailable', event => {
          test.injected++; Object.defineProperty(event, 'data', { value: new Blob(['synthetic invalid video'], { type: event.data.type }) });
        });
      }
    };
  });
  const failures = [];
  for (const mode of ['unavailable', 'encoder', 'readback', 'cancel-readback']) {
    await page.evaluate(mode => { const test = window.exportFailure; test.mode = mode; test.readbacks = 0; test.decodeErrors = 0; test.injected = 0; }, mode);
    await page.locator('#export').click();
    if (mode === 'cancel-readback') {
      await page.waitForFunction(() => window.exportFailure.readbacks > 0);
      await page.locator('#stop').click();
    }
    await idle();
    const after = await state(), status = await page.locator('#status').textContent();
    const observed = await page.evaluate(() => ({ injected: window.exportFailure.injected, decodeErrors: window.exportFailure.decodeErrors, stopped: window.exportFailure.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')) }));
    assert(observed.injected > 0 && observed.stopped, `${mode} 未真正注入或遺漏 track 清理`);
    const changed = Object.keys(after.data).filter(key => JSON.stringify(after.data[key]) !== JSON.stringify(baseline.data[key]));
    assert(!changed.length, `${mode} 寫入半成品或改動原配方：${changed.join(',')}`);
    assert(after.reference === baseline.reference && after.take === baseline.take && after.output === baseline.output, `${mode} 破壞原片／成功 VS`);
    assert(mode === 'readback' ? observed.decodeErrors > 0 && /無法播放|解碼失敗|無法解碼/.test(status) : status.includes(mode === 'cancel-readback' ? '已停止' : mode === 'encoder' ? '編碼失敗' : '無法啟動任何'), `${mode} 未誠實回報失敗`);
    // 每輪真的點舊連結並下載，避免只比較相同 URL 卻漏掉已被撤銷的 Blob。
    files.push(await save('output-download', `preserved-${mode}`));
    failures.push({ mode, status, ...observed });
  }
  await page.evaluate(() => { window.exportFailure.mode = 'webm'; window.exportFailure.attempted = []; });
  await page.locator('#export').click(); await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'), '故障後無法在同頁重試');
  const retry = await state(), info = JSON.parse(await page.locator('#diagnostics').textContent()).export;
  assert(retry.data.exports.length === baseline.data.exports.length + 1 && info.mime.startsWith('video/webm'), 'WebM 重試未新增真正輸出');
  assert(retry.take === baseline.take && retry.data.takes.length === baseline.data.takes.length, '重試替換原片');
  const attempted = await page.evaluate(() => window.exportFailure.attempted);
  assert(attempted.some(type => type.startsWith('video/mp4')) && attempted.some(type => type.startsWith('video/webm')), '未驗證宣稱支援但建構失敗的格式備援');
  files.push(await save('output-download', 'retry'), await save('reference-download', 'reference-after'), await save('take-download', 'self-after'));
  return { failures, attempted, files, retry: info, cameraApiAbsent: await page.evaluate(() => navigator.mediaDevices === undefined) };
}
