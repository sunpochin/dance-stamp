/* 用途：保留 QA 能力、第一次結果與本機成品；所在層：scripts/qa/explicit-pts；關聯：spike.js、serve.ts、README.md。相對 Chrome 受測 probe 僅改檔頭。 */
import { Quality, canEncodeVideo, canEncodeAudio } from '/mediabunny.mjs';
import { runSpike } from '/spike.js';
const config = await (await fetch('/config')).json();
const result = document.querySelector('#result');
let capable = false, attempted = false, controller;
const sha = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(x => x.toString(16).padStart(2, '0')).join('');
const show = value => { result.textContent = JSON.stringify(value, null, 2); };
async function save(kind, body, type = 'application/json') {
  const response = await fetch(`/${kind}/${config.nonce}`, { method: 'POST', headers: { 'Content-Type': type }, body });
  if (!response.ok) throw Error(`${kind} receipt ${response.status}: ${await response.text()}`);
}
const hardware = [];
// 合成原型沒有任何硬體路徑；誤呼叫仍保留錯誤，不要求額外權限。
if (navigator.mediaDevices) for (const key of ['getUserMedia', 'getDisplayMedia']) navigator.mediaDevices[key] = async () => { hardware.push(key); throw Error('synthetic-only'); };
document.querySelector('#capability').onclick = async event => {
  if (!event.isTrusted) throw Error('trusted click required');
  event.currentTarget.disabled = true;
  const record = { stage: 'capability', userAgent: navigator.userAgent, secureContext: isSecureContext, library: config.library, requested: { video: { codec: 'avc', width: 1280, height: 720, frameRate: 30, bitrate: 5e6 }, audio: { codec: 'aac', numberOfChannels: 1, sampleRate: 48000, bitrate: 128e3 } }, apis: Object.fromEntries(['VideoEncoder', 'VideoDecoder', 'VideoFrame', 'AudioEncoder', 'AudioDecoder', 'AudioData', 'AudioBuffer'].map(key => [key, typeof globalThis[key]])), codecs: {}, hardware };
  try {
    // 能力收據必須與唯一實編碼配置相同，不能用庫的medium預設替代實際bitrate。
    record.codecs.avc720p30 = await canEncodeVideo('avc', { width: 1280, height: 720, frameRate: 30, quality: new Quality({ bitrate: 5e6 }) });
    record.codecs.aacMono48k = await canEncodeAudio('aac', { numberOfChannels: 1, sampleRate: 48000, quality: new Quality({ bitrate: 128e3 }) });
    capable = Object.values(record.apis).every(type => type === 'function') && record.codecs.avc720p30 && record.codecs.aacMono48k;
    record.capable = capable;
  } catch (error) { record.error = String(error); }
  show(record);
  try { await save('capability', JSON.stringify(record)); }
  catch (error) { capable = false; show({ ...record, receiptError: String(error) }); }
  document.querySelector('#run').disabled = !capable;
};
document.querySelector('#cancel').onclick = event => { if (event.isTrusted) controller?.abort(new DOMException('cancelled', 'AbortError')); };
document.querySelector('#run').onclick = async event => {
  if (!event.isTrusted || !capable || attempted) throw Error('one capable trusted attempt required');
  attempted = true; event.currentTarget.disabled = true; controller = new AbortController();
  document.querySelector('#cancel').disabled = false;
  const started = performance.now(), record = { stage: 'running', library: config.library, exportAttempts: 1, hardware };
  show(record);
  // 期限只停止這個原型，不會把 race 逾時當成編碼器已釋放。
  const timer = setTimeout(() => controller.abort(new DOMException('prototype deadline', 'TimeoutError')), 60_000);
  try {
    const { blob, metadata } = await runSpike({ signal: controller.signal });
    controller.signal.throwIfAborted();
    const sha256 = await sha(blob); controller.signal.throwIfAborted();
    // 只向同機nonce主機保全第一次合成輸出；這份POST不是瀏覽器原生下載或產品保存驗收。
    await save('artifact', blob, blob.type || 'video/mp4');
    controller.signal.throwIfAborted();
    // 候選指紋與本機保全完成後才公開連結；取消途中留下的候選不當成成功發布。
    const link = document.querySelector('#download');
    link.href = URL.createObjectURL(blob); link.download = 'explicit-pts-first.mp4'; link.hidden = false;
    Object.assign(record, { stage: 'encoded', bytes: blob.size, mime: blob.type, sha256, metadata });
  } catch (error) { Object.assign(record, { stage: controller.signal.aborted ? 'aborted' : 'failed', error: String(error), metadata: error?.metadata ?? null, cleanupErrors: error?.metadata?.cleanupErrors ?? [] }); }
  finally {
    clearTimeout(timer); document.querySelector('#cancel').disabled = true;
    record.elapsedMs = performance.now() - started; show(record);
    try { await save('result', JSON.stringify(record)); } catch (error) { show({ ...record, receiptError: String(error) }); }
  }
};
