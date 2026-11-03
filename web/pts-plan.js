/* 用途：共用原配方與輸出格線，不另訂時間映射。所在層：匯出純邏輯。關聯：timeline.js、export-pts-core.js、engine.test.ts。 */
import { comparison, positions } from './timeline.js';

export const FPS = 30, AUDIO_RATE = 48000;
export function exportPlan(recipe) {
  const { durationMs } = comparison(recipe);
  const first = positions(recipe, 0), last = positions(recipe, durationMs);
  return { duration: durationMs / 1000, durationMs, first, last, frames: Math.ceil(durationMs / 1000 * FPS - 1e-9) };
}
export function* outputFrames(recipe) {
  const plan = exportPlan(recipe);
  // 最後一格可以短於 1/30 秒；不能為整格而偷偷改共同區間的首尾。
  for (let index = 0; index < plan.frames; index++) {
    const timestamp = index / FPS;
    const target = positions(recipe, timestamp * 1000);
    yield { index, timestamp, duration: Math.min(1 / FPS, plan.duration - timestamp),
      reference: target.referenceMs / 1000, self: target.selfMs / 1000 };
  }
}
export function validateTrack(track, start, end) {
  if (!track) return;
  if (![track.start, track.end].every(Number.isFinite) || !Array.isArray(track.samples) || !track.samples.length || track.start > start + .001 || track.end < end - .001) throw Error('跟隨路徑未覆蓋共同區間。');
  let previous = -Infinity;
  for (const sample of track.samples) {
    if (![sample.time, sample.x, sample.y, sample.width, sample.height].every(Number.isFinite)
      || sample.time < previous || sample.width <= 0 || sample.height <= 0
      || sample.x < 0 || sample.y < 0 || sample.x + sample.width > 1.000001 || sample.y + sample.height > 1.000001) throw Error('跟隨路徑無效。');
    previous = sample.time;
  }
}
export function validateSourceRange(start, end, requiredStart, requiredEnd) {
  // 完整來源範圍獨立驗證 A/B；取樣格自身的 duration 不能代表高 fps 來源的 B 尾覆蓋。
  if (![start, end].every(Number.isFinite) || start > requiredStart + .001 || end < requiredEnd - .001) throw Error('原片影格未覆蓋完整共同區間。');
}
export function validateFrame(sample, target, rate) {
  if (!sample || !Number.isFinite(sample.timestamp) || !Number.isFinite(sample.duration) || sample.duration <= 0
    || sample.timestamp > target + 1e-8 || sample.timestamp + sample.duration <= target + 1e-8) throw Error('來源影格沒有覆蓋指定時間，原片與前次 VS 保留。');
  // 一格只須覆蓋取樣點；完整 B 尾由 track 範圍驗證，60→30fps 不要求倒數第二格覆蓋整個 B。
  const lagMs = (target - sample.timestamp) / rate * 1000;
  // 合法 VFR 長格是來源呈現區間，不等於舊 live 路徑的 PCM／播放器時鐘漂移；只能記診斷。
  return lagMs;
}
