/* 用途：在 sample 釋放／source 收尾前保留首錯。所在層：Worker 非 codec 排程。關聯：固定 Mediabunny1.65.0、export-pts-core.js。 */
export async function useSamples(samples, work, remember, release) {
  try { return await work(); }
  catch (error) { remember(error); throw error; }
  finally {
    // 清理再壞也不能搶走先發生的 draw／add 錯誤；每份 sample 仍各自嘗試釋放。
    for (const sample of samples) { try { release(sample); } catch (error) { remember(error); } }
  }
}
export async function runProducer(work, remember, stop) {
  try { await work(); }
  catch (error) { remember(error); stop(); throw error; }
}
export async function closeSource(source) {
  source.close();
  // 1.65 的 public close 回 void；立刻旁聽其固定 private promise，不能等其他 producer 結束才發現 AAC 收尾失敗。
  const completion = source._closingPromise;
  if (!(completion instanceof Promise)) throw new Error('Mediabunny1.65 source 收尾介面不相符，原片保留。');
  await completion;
}
