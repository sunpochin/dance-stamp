/* 用途：逐塊裁 PCM、驗未知缺口，讓庫做自然變調重採樣。所在層：匯出純音訊邊界。關聯：export-pts-core.js、engine.test.ts。 */
const ceilFrame = value => Math.ceil(value - 1e-6);
export function pcmCursor({ start, end, declaredStart, declaredEnd, sampleRate, channels, rate, gridOrigin = 0 }) {
  if (![start, end, declaredStart, declaredEnd, sampleRate, gridOrigin].every(Number.isFinite) || end <= start
    || declaredEnd < declaredStart || sampleRate <= 0 || !Number.isInteger(channels) || channels <= 0 || ![.5, .75, 1].includes(rate)) throw Error('音訊時間或格式無效。');
  // 空 edit 可讓真 PCM 格線不從絕對零開始；以第一份實際 PCM 的相位為格線，不偷移來源起點。
  const atFrame = time => ceilFrame((time - gridOrigin) * sampleRate);
  const first = atFrame(start), last = atFrame(end);
  const audibleFirst = Math.min(last, Math.max(first, atFrame(declaredStart)));
  const audibleLast = Math.max(audibleFirst, Math.min(last, atFrame(declaredEnd)));
  let next = audibleFirst, covered = 0, roundingSamples = 0;
  return {
    first, last, audibleFirst, audibleLast, sampleRate, channels, gridOrigin,
    accept(sample) {
      if (sample.sampleRate !== sampleRate || sample.numberOfChannels !== channels || !Number.isFinite(sample.timestamp)
        || !Number.isInteger(sample.numberOfFrames) || sample.numberOfFrames <= 0) throw Error('解碼 PCM 格式改變。');
      const exact = (sample.timestamp - gridOrigin) * sampleRate, base = Math.round(exact);
      roundingSamples = Math.max(roundingSamples, Math.abs(exact - base));
      if (Math.abs(exact - base) > Math.max(.1, sampleRate / 1e6) + 1e-6) throw Error('PCM 時間不在可確認的取樣格線。');
      const from = Math.max(audibleFirst, base), to = Math.min(audibleLast, base + sample.numberOfFrames);
      if (to <= from) return null;
      // 只有 track 宣告的首前／尾後可補靜音；解碼區間內缺格與重疊一律拒絕。
      if (from !== next) throw Error(from > next ? '音訊解碼有未知缺口。' : '音訊解碼區間重疊。');
      next = to; covered += to - from;
      return { frameOffset: from - base, frameCount: to - from, sourceFrame: from,
        timestamp: (gridOrigin + from / sampleRate - start) / rate, sampleRate: sampleRate * rate };
    },
    finish() {
      if (next !== audibleLast) throw Error('音訊解碼未覆蓋宣告的有效區間。');
      return { coveredFrames: covered, leadingSilentFrames: audibleFirst - first, trailingSilentFrames: last - audibleLast, maximumGridRoundingSamples: roundingSamples };
    },
    packet(sourceFrame, count) {
      return { timestamp: (gridOrigin + sourceFrame / sampleRate - start) / rate, sampleRate: sampleRate * rate, numberOfChannels: channels, frames: count };
    },
  };
}
export function copyPcm(sample, part) {
  const output = new Float32Array(part.frameCount * sample.numberOfChannels);
  for (let channel = 0; channel < sample.numberOfChannels; channel++) {
    const plane = output.subarray(channel * part.frameCount, (channel + 1) * part.frameCount);
    sample.copyTo(plane, { planeIndex: channel, format: 'f32-planar', frameOffset: part.frameOffset, frameCount: part.frameCount });
    if (plane.some(value => !Number.isFinite(value))) throw Error('來源 PCM 含非有限值。');
  }
  return output;
}
