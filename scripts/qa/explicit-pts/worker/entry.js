/* 用途：在真正Module Worker檢查能力並只執行一次首匯出；所在層：scripts/qa/explicit-pts/worker；關聯：core.js、probe.js、README.md。 */
import { Quality, canEncodeVideo, canEncodeAudio } from '/mediabunny.mjs';
import { runSpike } from '/worker-core.js';

let caseId, phase = 'idle';
const errorInfo = error => ({ name: error?.name ?? 'Error', message: String(error?.message ?? error) });
const apis = ['VideoDecoder', 'VideoEncoder', 'VideoFrame', 'AudioDecoder', 'AudioEncoder', 'AudioData', 'OffscreenCanvas'];
const requested = {
  video: { codec: 'avc', width: 1280, height: 720, frameRate: 30, bitrate: 5e6 },
  audio: { codec: 'aac', numberOfChannels: 1, sampleRate: 48000, bitrate: 128e3 },
};
const send = value => self.postMessage({ ...value, caseId });

self.onmessage = async event => {
  // DOM合成事件不能觸發工作；只有主頁持有的本次Worker通道與隨機case綁定有效。
  if (!event.isTrusted || !event.data || typeof event.data.caseId !== 'string'
    || !/^[a-f0-9-]{36}$/.test(event.data.caseId)) return;
  const message = event.data;
  if (phase === 'idle' && message.kind === 'capability') {
    caseId = message.caseId; phase = 'checking';
    const record = {
      stage: 'capability', observationMode: 'actual-module-worker', userAgent: navigator.userAgent,
      workerGlobal: typeof WorkerGlobalScope === 'function' && self instanceof WorkerGlobalScope,
      documentType: typeof document, audioBufferTypeNotUsed: typeof AudioBuffer,
      secureContext: isSecureContext, requested,
      apis: Object.fromEntries(apis.map(key => [key, typeof globalThis[key]])), codecs: {}, capable: false,
    };
    try {
      record.codecs.avc720p30 = await canEncodeVideo('avc', {
        width: 1280, height: 720, frameRate: 30, quality: new Quality({ bitrate: 5e6 }),
      });
      record.codecs.aacMono48k = await canEncodeAudio('aac', {
        numberOfChannels: 1, sampleRate: 48000, quality: new Quality({ bitrate: 128e3 }),
      });
      record.capable = record.workerGlobal && Object.values(record.apis).every(type => type === 'function')
        && record.codecs.avc720p30 && record.codecs.aacMono48k;
    } catch (error) { record.error = errorInfo(error); }
    phase = record.capable ? 'ready' : 'done';
    send({ kind: 'capability', record });
    return;
  }
  if (caseId !== message.caseId || phase !== 'ready' || message.kind !== 'run') return;
  phase = 'running';
  const controller = new AbortController();
  try {
    const { blob, metadata } = await runSpike({ signal: controller.signal });
    phase = 'done'; send({ kind: 'result', stage: 'encoded', blob, metadata });
  } catch (error) {
    phase = 'done'; send({ kind: 'result', stage: 'failed', error: errorInfo(error), metadata: error?.metadata ?? null });
  }
};
