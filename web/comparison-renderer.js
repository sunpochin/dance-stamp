/* 檔案用途：用同一組明確影格繪製比較畫面。所在層：純合成畫面。主要關聯：main.js、follow.js、timeline.js。 */
import { contain } from './timeline.js';
import { frameCrop } from './follow.js';

/** @typedef {{width:number,height:number,time:number,draw:(context:CanvasRenderingContext2D,sx:number,sy:number,sw:number,sh:number,dx:number,dy:number,dw:number,dh:number)=>void}} Frame */
/** @typedef {{frame:Frame|null,track:import('./follow').Track|null}} Source */
/** @typedef {{reference:Source,self:Source}} Sources */
/** @param {HTMLVideoElement} video @returns {Frame|null} */
export function videoFrame(video) {
  if (video.readyState < 2) return null;
  // 原預覽只有跟隨裁切需要讀時間；不為新介面額外碰原生 currentTime 快取。
  return {
    get width() { return video.videoWidth; }, get height() { return video.videoHeight; }, get time() { return video.currentTime; },
    draw(context, sx, sy, sw, sh, dx, dy, dw, dh) { context.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh); },
  };
}
/** @param {Frame} frame @param {import('./follow').Track|null} track */
function crop(frame, track) {
  const time = track ? frame.time : 0;
  return frameCrop(frame.width, frame.height, time, track);
}
/** @param {CanvasRenderingContext2D} context @param {Source} source @param {number} width @param {number} height @param {boolean} mirror @param {import('./types').OverlayPresentation['reference']} layer @param {number} [alpha] @param {number} [anchor] */
export function drawLayer(context, source, width, height, mirror, layer, alpha = 1, anchor = 0.5) {
  const frame = source.frame;
  if (!frame) return;
  const area = crop(frame, source.track), rect = contain(area.width, area.height, width, height);
  context.save();
  // 平移在鏡像／縮放之外，向右仍是向右；失敗也還原，避免下一幀累加變換。
  try {
    context.globalAlpha = alpha;
    context.translate((width - rect.width) * anchor + rect.width / 2 + layer.x * width, height / 2 + layer.y * height);
    context.scale(layer.scale * (mirror ? -1 : 1), layer.scale);
    frame.draw(context, area.x, area.y, area.width, area.height, -rect.width / 2, -rect.height / 2, rect.width, rect.height);
  } finally { context.restore(); }
}
/** @param {CanvasRenderingContext2D} context @param {Sources} sources @param {import('./types').Comparison} value */
export function drawSideBySide(context, sources, value) {
  context.fillStyle = '#080c0e'; context.fillRect(0, 0, 1280, 720);
  for (const [source, x, mirror, label] of /** @type {const} */ ([[sources.reference, 0, value.referenceMirror, '示範'], [sources.self, 640, value.selfMirror, '我']])) {
    const frame = source.frame;
    if (!frame) continue;
    const area = crop(frame, source.track), rect = contain(area.width, area.height, 640, 672);
    // 全身等比保留，留白移到外側；只翻影片本身，鏡像後仍須貼著共同中線。
    const imageX = x === 0 ? 640 - rect.width : 0;
    context.save(); context.translate(x + imageX + (mirror ? rect.width : 0), 48); context.scale(mirror ? -1 : 1, 1);
    frame.draw(context, area.x, area.y, area.width, area.height, 0, rect.y, rect.width, rect.height); context.restore();
    context.fillStyle = '#e8f2ed'; context.font = '24px sans-serif'; context.fillText(label, x + 22, 33);
  }
}
/** @param {CanvasRenderingContext2D} context @param {number} width @param {number} height @param {Sources} sources @param {import('./types').Comparison} value @param {import('./types').OverlayPresentation} presentation */
export function drawOverlay(context, width, height, sources, value, presentation) {
  context.fillStyle = '#080c0e'; context.fillRect(0, 0, width, height);
  // 自己當底圖、老師最後半透明覆蓋；來源如何解碼不影響同一套裁切與變換。
  drawLayer(context, sources.self, width, height, value.selfMirror, presentation.self);
  drawLayer(context, sources.reference, width, height, value.referenceMirror, presentation.reference, presentation.opacity);
}
/** @param {CanvasRenderingContext2D} context @param {HTMLCanvasElement} original @param {Sources} sources @param {import('./types').Comparison} value @param {number[]} values */
export function drawAdjustedSide(context, original, sources, value, values) {
  // 未調整側沿用原並排像素，避免直式／鏡像另畫的原生色彩捨入。
  context.drawImage(original, 0, 0);
  for (const [source, x, mirror, index] of /** @type {const} */ ([[sources.reference, 0, value.referenceMirror, 0], [sources.self, 640, value.selfMirror, 3]])) {
    const [scale, dx, dy] = values.slice(index, index + 3);
    if (scale === 1 && dx === 0 && dy === 0) continue;
    context.save();
    try {
      context.beginPath(); context.rect(x, 48, 640, 672); context.clip(); context.translate(x, 48);
      context.fillStyle = '#080c0e'; context.fillRect(0, 0, 640, 672);
      drawLayer(context, source, 640, 672, mirror, { scale, x: dx, y: dy }, 1, x === 0 ? 1 : 0);
    } finally { context.restore(); }
  }
}
