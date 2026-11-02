/* 用途：在原來源碼之外區分每次合成繪圖；層：合成QA；關聯：vs-observer.js、analyze-vs.py。 */
export const marker = { x: 256, y: 4, cell: 16, row: 8, width: 256, height: 32 };
export function crc16(value) {
  let crc = 65535;
  for (const byte of [value & 255, value >> 8]) { crc ^= byte << 8; for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 65535 : (crc << 1) & 65535; }
  return crc;
}
export function mark(ctx, id) {
  if (!Number.isInteger(id) || id < 0 || id > 65535) throw Error('diagnostic id overflow');
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    for (const [row, value] of [0xa55a, id, id ^ 65535, crc16(id)].entries()) for (let bit = 0; bit < 16; bit++) {
      ctx.fillStyle = value >> bit & 1 ? 'white' : 'black';
      ctx.fillRect(marker.x + bit * marker.cell, marker.y + row * marker.row, marker.cell, marker.row);
    }
  } finally { ctx.restore(); }
}
function word(data, width, x, y, count, step) {
  let value = 0;
  for (let bit = 0; bit < count; bit++) {
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += data[((y + dy) * width + x + bit * step + dx) * 4];
    const level = sum / 9;
    if (level >= 70 && level <= 185) throw Error('ambiguous pixel');
    value |= Number(level > 185) << bit;
  }
  return value;
}
export function readComposite(ctx) {
  const { data } = ctx.getImageData(0, 0, 288, 132), words = [];
  for (let row = 0; row < 4; row++) words.push(word(data, 288, 8, 4 + row * 8, 16, 16));
  if (words[0] !== 0xa55a || words[2] !== (words[1] ^ 65535) || words[3] !== crc16(words[1])) throw Error('marker magic/complement/CRC');
  return { id: words[1], codes: [word(data, 288, 9, 57, 12, 24), word(data, 288, 9, 107, 12, 24)] };
}
export function composite(ctx, video) {
  // 只讀診斷條與兩側原碼的小區塊；仍保存PNG供獨立解碼，不把metadata當像素身分。
  ctx.drawImage(video, marker.x, marker.y, marker.width, marker.height, 0, 0, 256, 32);
  for (let side = 0; side < 2; side++) ctx.drawImage(video, 16 + side * 640, 304, 576, 100, 0, 32 + side * 50, 288, 50);
  return readComposite(ctx);
}
export function readSource(ctx, video) {
  ctx.drawImage(video, 8, 50, 288, 50, 0, 0, 288, 50);
  const { data } = ctx.getImageData(0, 0, 288, 50);
  return word(data, 288, 9, 25, 12, 24);
}
