/* 用途：同源固定 bundle 的上游型別薄轉接；所在層：只供檢查；關聯：web-assets.ts、Mediabunny1.65.0。
 * 原 index 的舊 WebCodecs ambient references 與 TS7 內建 DOM 重複；只引用原類別宣告，不能 skipLibCheck 掩蓋自有型別。
 */
// 只補上游簽名用的 track kind 細分；不載入舊全域 WebCodecs 宣告、不改原生實作。
declare global {
  interface MediaStreamVideoTrack extends MediaStreamTrack { readonly kind: 'video'; clone(): MediaStreamVideoTrack }
  interface MediaStreamAudioTrack extends MediaStreamTrack { readonly kind: 'audio'; clone(): MediaStreamAudioTrack }
}
export { Input } from '../node_modules/mediabunny/dist/modules/src/input.js';
export { BlobSource } from '../node_modules/mediabunny/dist/modules/src/source.js';
export { MP4, QTFF, WEBM, MATROSKA } from '../node_modules/mediabunny/dist/modules/src/input-format.js';
export { VideoSampleSink, AudioSampleSink } from '../node_modules/mediabunny/dist/modules/src/media-sink.js';
export { AudioSample, VideoSample } from '../node_modules/mediabunny/dist/modules/src/sample.js';
export { AudioSampleSource, CanvasSource } from '../node_modules/mediabunny/dist/modules/src/media-source.js';
export { Output } from '../node_modules/mediabunny/dist/modules/src/output.js';
export { Mp4OutputFormat } from '../node_modules/mediabunny/dist/modules/src/output-format.js';
export { BufferTarget, AppendOnlyStreamTarget } from '../node_modules/mediabunny/dist/modules/src/target.js';
export { Quality, canEncodeVideo, canEncodeAudio } from '../node_modules/mediabunny/dist/modules/src/encode.js';
