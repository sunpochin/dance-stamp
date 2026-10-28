/* 檔案用途：手動來源拍點、八拍位置及可取消提示音。所在層：Web 拍點邏輯。主要關聯：main.js、library.js、RECORD_COMPARE.md。 */
/** @param {unknown} input @param {number} durationMs @returns {import('./types').BeatGrid} */
export function validateBeatGrid(input, durationMs) {
  const grid = /** @type {import('./types').BeatGrid} */ (input);
  if (!grid || typeof grid !== 'object' || typeof grid.bpm !== 'number' || !Number.isFinite(grid.bpm) || grid.bpm < 20 || grid.bpm > 300
    || !Number.isSafeInteger(grid.firstBeatMs) || grid.firstBeatMs < 0 || grid.firstBeatMs >= durationMs
    || ![0, 4, 8].includes(grid.countInBeats)) throw new Error('拍點無效：BPM 須為 20–300，第一拍須在原片內，倒數選秒數、4 或 8 拍。');
  // 白名單不帶裝置資訊；可選欄位讓沒有拍點的 v1 備份完全沿用原秒數。
  return { bpm: grid.bpm, firstBeatMs: grid.firstBeatMs, countInBeats: grid.countInBeats };
}
/** @param {import('./types').BeatGrid | undefined} grid @param {number} sourceMs */
export function beatPosition(grid, sourceMs) {
  if (!grid || !Number.isFinite(sourceMs) || sourceMs < grid.firstBeatMs) return null;
  // 只用原片時間；變速、暫停及 seek 不可累加牆鐘，極小容差只處理浮點邊界。
  const index = Math.floor((sourceMs - grid.firstBeatMs) * grid.bpm / 60_000 + 1e-9);
  return { eight: Math.floor(index / 8) + 1, beat: index % 8 + 1 };
}
/** @param {import('./types').BeatGrid} grid @param {number} rate */
export function countInPlan(grid, rate) {
  if (![0.5, 0.75, 1].includes(rate) || ![4, 8].includes(grid.countInBeats)) throw new Error('請先保存拍數倒數及有效錄影速度。');
  const intervalMs = 60_000 / grid.bpm / rate;
  return { beats: grid.countInBeats, intervalMs, durationMs: grid.countInBeats * intervalMs };
}
/** @param {BaseAudioContext} audio @param {ReturnType<typeof countInPlan>} plan @param {number} startSeconds */
export function scheduleCountIn(audio, plan, startSeconds) {
  const nodes = [];
  for (let i = 0; i < plan.beats; i++) {
    const oscillator = audio.createOscillator(), gain = audio.createGain(), at = startSeconds + i * plan.intervalMs / 1000;
    oscillator.frequency.value = i === 0 ? 880 : 660;
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.12, at + 0.005); gain.gain.linearRampToValueAtTime(0, at + 0.06);
    // 提示音只往監聽端，不接影片輸出音軌；倒數完成後才啟動錄影與原片。
    oscillator.connect(gain).connect(audio.destination); oscillator.start(at); oscillator.stop(at + 0.065);
    nodes.push({ oscillator, gain });
  }
  return () => { for (const { oscillator, gain } of nodes) { try { oscillator.stop(); } catch { /* 已結束仍可清理。 */ } oscillator.disconnect(); gain.disconnect(); } };
}
