/* 檔案用途：從音量包絡估算數拍速度及手動點拍。所在層：純拍點邏輯。主要關聯：metronome.js、tempo.test.ts。 */
/** @param {ArrayLike<number>} envelope @param {number} hz */
export function estimateTempo(envelope, hz = 100) {
  if (!Number.isFinite(hz) || hz < 20 || envelope.length < hz * 6 || envelope.length > hz * 30) return null;
  const values = Array.from(envelope, n => Number.isFinite(n) ? Math.max(0, n) : 0);
  const sorted = [...values].sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.2)];
  const peak = Math.max(...values);
  if (peak < 0.001 || peak - floor < 0.0005) return null;
  // 人聲一個字可能有多個音節；平滑音量而非辨識文字，避免依賴外部語音服務。
  const smooth = values.map((_, i) => (values[i] + (values[i - 1] ?? values[i]) + (values[i + 1] ?? values[i])) / 3);
  const signal = smooth.map(n => Math.max(0, n - floor));
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const centered = signal.map(n => n - mean), scores = [];
  for (let lag = Math.ceil(hz * 60 / 300) - 1; lag <= Math.floor(hz * 60 / 20) + 1; lag++) {
    let product = 0, left = 0, right = 0;
    for (let i = lag; i < centered.length; i++) { product += centered[i] * centered[i - lag]; left += centered[i] ** 2; right += centered[i - lag] ** 2; }
    scores[lag] = product / Math.sqrt(left * right || 1);
  }
  const candidates = [];
  for (let lag = Math.ceil(hz * 60 / 300); lag < scores.length - 1; lag++) {
    if (scores[lag] < 0.4 || scores[lag] <= scores[lag - 1] || scores[lag] < scores[lag + 1]) continue;
    const correction = 0.5 * (scores[lag - 1] - scores[lag + 1]) / (scores[lag - 1] - 2 * scores[lag] + scores[lag + 1] || 1);
    const bpm = 60 * hz / (lag + correction);
    if (bpm < 19.5 || bpm > 300.5) continue;
    // ponytail: 優先一般練舞速度；半拍／雙拍仍由使用者聽原聲校正，不假裝能推斷拍號。
    candidates.push({ bpm: Math.max(20, Math.min(300, Math.round(bpm * 10) / 10)), correlation: scores[lag], rank: scores[lag] * (bpm >= 70 && bpm <= 180 ? 1 : 0.82) });
  }
  candidates.sort((a, b) => b.rank - a.rank);
  const best = candidates[0];
  if (!best) return null;
  return { bpm: best.bpm, confidence: best.correlation >= 0.65 ? '較穩定' : '需聽原聲確認', candidates: candidates.filter(n => Math.abs(n.bpm - best.bpm) > 3).slice(0, 3).map(n => n.bpm) };
}
/** @param {number[]} taps */
export function tapTempo(taps) {
  if (taps.length < 3) return null;
  const intervals = taps.slice(1).map((n, i) => n - taps[i]).sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  const steady = intervals.filter(n => Math.abs(n - median) < median * 0.25);
  const bpm = 60000 / (steady.reduce((a, b) => a + b, 0) / steady.length);
  return Number.isFinite(bpm) && bpm >= 20 && bpm <= 300 ? Math.round(bpm * 10) / 10 : null;
}
