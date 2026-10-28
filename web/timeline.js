/* 檔案用途：驗證 M0 比較配方與共同時間。所在層：純媒體邏輯。主要關聯：RECORD_COMPARE.md、main.js。 */
/** @param {number} startMs @param {number | undefined} endMs @param {number} durationMs */
export function validateMarkerRange(startMs, endMs, durationMs) {
  // 表單與備份共用毫秒邊界，避免重連或匯入後出現另一套合法區間。
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0
    || !Number.isSafeInteger(startMs) || startMs < 0
    || (endMs !== undefined && (!Number.isSafeInteger(endMs) || endMs < 0))) throw new Error('標記時間必須是非負整數毫秒。');
  if (endMs !== undefined && endMs <= startMs) throw new Error('標記終點必須晚於起點，不會自動交換。');
  if ((endMs ?? startMs) > durationMs) throw new Error('標記超出影片長度。');
}

export function comparison(recipe) {
  const { startMs, endMs, rate, offsetMs, selfDurationMs } = recipe;
  if (![startMs, endMs, offsetMs, selfDurationMs].every(Number.isSafeInteger)
    || startMs < 0 || endMs <= startMs || selfDurationMs <= 0 || ![0.5, 0.75, 1].includes(rate)) {
    throw new Error('片段、速度或自拍長度無效。');
  }
  const practiceMs = (endMs - startMs) / rate;
  if (practiceMs > 60_000) throw new Error('請縮短片段：慢速後每次最多 60 秒。');
  // 正偏移是略過自拍開頭；負偏移必須連來源音訊一起裁切，否則會有聲畫錯位。
  const lowerMs = Math.max(0, -offsetMs);
  const upperMs = Math.min(practiceMs, selfDurationMs - offsetMs);
  if (upperMs <= lowerMs) throw new Error('兩支影片沒有可比較的共同區間。');
  return { lowerMs, upperMs, durationMs: upperMs - lowerMs };
}

export function captureDuration({ startMs, endMs, rate }) {
  const { durationMs } = comparison({ startMs, endMs, rate, offsetMs: 0, selfDurationMs: 60_000 });
  // 下限只約束新錄影；既有短片與中斷原片仍可保留、播放及比較。
  if (durationMs < 15_000) throw new Error('請調整片段或速度，讓實際錄影時間介於 15 到 60 秒。');
  return durationMs;
}

export function positions(recipe, elapsedMs) {
  const { lowerMs, durationMs } = comparison(recipe);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > durationMs) throw new Error('時間超出共同區間。');
  const timeMs = lowerMs + elapsedMs;
  return { referenceMs: recipe.startMs + recipe.rate * timeMs, selfMs: timeMs + recipe.offsetMs };
}

export function contain(width, height, boxWidth, boxHeight) {
  if (![width, height, boxWidth, boxHeight].every(n => Number.isFinite(n) && n > 0)) throw new Error('影片尺寸無效。');
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return { width: width * scale, height: height * scale, x: (boxWidth - width * scale) / 2, y: (boxHeight - height * scale) / 2 };
}
