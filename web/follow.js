/* 檔案用途：人物選框、身分連續性與可重播裁切路徑。所在層：純畫面邏輯。主要關聯：follow-ui.js、main.js、person-worker.js。 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
/** @typedef {{x:number,y:number,width:number,height:number}} Box */
/** @typedef {Box & {time:number}} Sample */
/** @typedef {{start:number,end:number,samples:Sample[],held:number}} Track */

/** @param {Box} box @returns {Box} */
export function validBox(box) {
  if (!Object.values(box).every(Number.isFinite) || box.width < 0.02 || box.height < 0.02) throw new Error('請框住完整身體，選框不能太小。');
  const width = clamp(box.width, 0.02, 1), height = clamp(box.height, 0.02, 1);
  return { x: clamp(box.x, 0, 1 - width), y: clamp(box.y, 0, 1 - height), width, height };
}
/** @param {Box} a @param {Box} b */
export function overlap(a, b) {
  const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return intersection / (a.width * a.height + b.width * b.height - intersection);
}
/** @param {Box[]} people @param {Box} previous */
export function matchPerson(people, previous) {
  const ranked = people.map(box => {
    const distance = Math.hypot(box.x + box.width / 2 - previous.x - previous.width / 2, box.y + box.height / 2 - previous.y - previous.height / 2);
    const ratio = box.height / previous.height;
    return { box, score: overlap(box, previous) - distance, distance, ratio };
  }).filter(item => item.distance < Math.max(0.12, previous.height * 0.45) && item.ratio > 0.5 && item.ratio < 2).sort((a, b) => b.score - a.score);
  // 多人交錯時寧可要求重選；單純挑最高分會把鏡中影像或旁人當成原目標。
  if (!ranked.length || ranked[0].score < 0.05 || ranked[1] && ranked[0].score - ranked[1].score < 0.08) return null;
  return ranked[0].box;
}
/** @param {Box} selection @param {Box} first @param {Box} person */
export function followBox(selection, first, person) {
  const scale = clamp(person.height / first.height, 0.5, 2);
  const width = Math.min(1, selection.width * scale), height = Math.min(1, selection.height * scale);
  return validBox({ x: person.x + person.width / 2 + (selection.x + selection.width / 2 - first.x - first.width / 2) * scale - width / 2,
    y: person.y + person.height / 2 + (selection.y + selection.height / 2 - first.y - first.height / 2) * scale - height / 2, width, height });
}
/** @param {Track} track @param {number} time @returns {Box} */
export function cropAt(track, time) {
  const samples = track.samples;
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (samples[mid].time < time) lo = mid + 1; else hi = mid; }
  const a = samples[Math.max(0, lo - 1)], b = samples[lo], fraction = clamp((time - a.time) / (b.time - a.time || 1), 0, 1);
  return validBox({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, width: a.width + (b.width - a.width) * fraction, height: a.height + (b.height - a.height) * fraction });
}
/** @param {Sample[]} samples */
export function smoothTrack(samples) {
  // 離線先算路徑，使用前後相同權重平滑，避免只用上一格造成追蹤持續落後。
  return samples.map((sample, index) => {
    const nearby = samples.slice(Math.max(0, index - 1), index + 2);
    const mean = key => nearby.reduce((sum, item) => sum + item[key], 0) / nearby.length;
    return { time: sample.time, ...validBox({ x: mean('x'), y: mean('y'), width: mean('width'), height: mean('height') }) };
  });
}
/** @param {HTMLVideoElement} video @param {Track | null} track */
export function sourceCrop(video, track) {
  const box = track ? cropAt(track, video.currentTime) : { x: 0, y: 0, width: 1, height: 1 };
  return { x: box.x * video.videoWidth, y: box.y * video.videoHeight, width: box.width * video.videoWidth, height: box.height * video.videoHeight };
}
