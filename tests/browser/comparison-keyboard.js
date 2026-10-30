/* 檔案用途：驗證雙片入口、播放暫停與微調可由鍵盤操作。所在層：Web 介面驗收。主要關聯：existing-comparison.js、frontend-review。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await page.goto(origin); await idle();
  await page.locator('#existing-mode').focus(); await page.keyboard.press('Enter');
  // 新版將原生檔案欄位藏在可見按鈕後；須驗真正的鍵盤選檔，不能要求焦點停在隱藏欄位。
  assert(await page.locator('#existing-mode').getAttribute('aria-pressed') === 'true' && await page.evaluate(() => document.activeElement.id === 'select-video') && await page.locator('#select-video').isVisible(), '鍵盤入口沒有啟用或帶到選片');
  const choosing = page.waitForEvent('filechooser'); await page.keyboard.press('Enter');
  await (await choosing).setFiles('output/comparison/reference.mp4'); await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4'); await idle();
  for (const [id, value] of [['start', '12'], ['end', '17'], ['offset', '4']]) {
    await page.locator(`#${id}`).fill(value); await page.locator(`#${id}`).dispatchEvent('change'); await idle();
  }
  await page.locator('#play').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.getElementById('pause-comparison').hidden && document.getElementById('self').currentTime > 4.1);
  await page.locator('#pause-comparison').focus(); await page.keyboard.press('Enter'); await idle();
  assert(await page.evaluate(() => document.getElementById('reference').paused && document.getElementById('self').paused), '鍵盤沒有一起暫停');
  await page.locator('#offset').focus(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Tab'); await idle();
  // 原生 blur 會排入保存佇列，必須等完成後核對毫秒，不能只讀輸入畫面。
  const offset = await page.evaluate(async () => { const { data } = await (await import('/storage.js')).readLibrary(); return data.recipes.find(r => r.takeId === data.takes.at(-1).id).offsetMs; });
  assert(offset === 4010, '鍵盤微調沒有以整數毫秒保存');
  await page.locator('button[data-offset="-10"]').focus(); await page.keyboard.press('Enter'); await idle();
  assert(Number(await page.locator('#offset').inputValue()) === 4, '鍵盤微調按鈕未生效');
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('.players').scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '窄版有水平溢出');
  await page.locator('#stop').focus(); await page.keyboard.press('Enter');
  assert(await page.locator('#stop').isVisible(), '窄版停止控制不可見');
  await page.screenshot({ path: 'output/integration-mobile.png' });
  return { keyboardEntryAndFocus: true, keyboardPlayAndPause: true, nativeNumberInputPersistsMs: true, keyboardFineAdjustment: true, narrowStopVisible: true, narrowNoOverflow: true };
}
