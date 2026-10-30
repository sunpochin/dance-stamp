/* 檔案用途：同名短片重連不能改掉原筆記時間。所在層：桌面合成資料回歸。主要關聯：main.js、storage.js。 */
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  // 保留新版選片欄位並固定預覽入口，避免整合時測到舊介面或其他本機網站。
  await page.goto('http://127.0.0.1:4174/');
  await page.getByLabel('選擇示範影片', { exact: true }).setInputFiles('output/media-probe/reference.mp4');
  await page.waitForFunction(() => !document.getElementById('practice').disabled);
  await page.locator('#reference').evaluate(async v => { v.currentTime = 10; await new Promise(r => v.addEventListener('seeked', r, { once: true })); });
  await page.getByRole('button', { name: '標記當下時間', exact: true }).click();
  await page.getByLabel('標記標題', { exact: true }).fill('合成片尾標記');
  await page.getByRole('button', { name: '儲存標記', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('markers').textContent.includes('合成片尾標記'));
  const id = await page.locator('#library').inputValue();
  await page.reload();
  await page.getByRole('combobox', { name: '已保存的筆記', exact: true }).selectOption(id);
  await page.getByRole('button', { name: '開啟筆記', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('尚未連結'));
  await page.getByLabel('選擇示範影片', { exact: true }).setInputFiles('output/media-probe/short/reference.mp4');
  await page.getByRole('button', { name: '已預覽，確認連結到這份筆記', exact: true }).waitFor();
  assert(await page.evaluate(() => document.getElementById('practice').disabled && document.getElementById('camera').disabled), '同名新片未確認就連到舊筆記');
  await page.getByRole('button', { name: '已預覽，確認連結到這份筆記', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('markers').textContent.includes('超出目前影片'));
  assert(await page.getByRole('button', { name: '跳到這裡', exact: true }).isDisabled(), '超界標記仍可啟用');
  const original = await page.evaluate(async id => {
    const saved = await (await import('/storage.js')).readLibrary();
    return { marker: saved.data.markers.find(m => m.videoId === id).startMs, duration: saved.data.videos.find(v => v.id === id).durationMs };
  }, id);
  assert(original.marker === 10000 && original.duration > 60000, '重連短片靜默裁掉筆記或時間');
  return { sameFilenameNeedsExplicitConfirmation: true, outOfRangeMarkerRequiresRepair: true, originalNoteAndTimePreserved: true };
}
