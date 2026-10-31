/* 檔案用途：驗證雙片入口、播放暫停與微調可由鍵盤操作。所在層：Web 介面驗收。主要關聯：existing-comparison.js、frontend-review。 */
async (page) => {
  const origin = new URL(page.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const idle = () => page.waitForFunction(() => !document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy') !== 'true');
  await page.addInitScript(() => {
    window.comparisonKeyboardTrace = [];
    // CI 已連續漏掉選檔事件；只讀焦點與原生按鍵，不先訂閱 filechooser 而改變攔截啟用時序。
    // 捕獲與冒泡各留一筆，才能分辨原生按鍵已到達但預設動作被取消；不攔截或重送事件。
    for (const type of ['focusin', 'focusout', 'keydown', 'keyup', 'click']) for (const capture of [true, false]) document.addEventListener(type, event => {
      if (window.comparisonKeyboardTrace.length >= 64) { window.comparisonKeyboardTraceTruncated = true; return; }
      window.comparisonKeyboardTrace.push({ type, phase: event.eventPhase, id: event.target.id, key: event.key, repeat: event.repeat, trusted: event.isTrusted, prevented: event.defaultPrevented, disabled: event.target.matches(':disabled'), active: document.activeElement?.id, focused: document.hasFocus(), visibility: document.visibilityState, activation: navigator.userActivation.isActive, time: performance.now() });
    }, capture);
  });
  await page.goto(origin); await idle();
  await page.locator('#existing-mode').focus(); await page.keyboard.press('Enter');
  // 新版將原生檔案欄位藏在可見按鈕後；須驗真正的鍵盤選檔，不能要求焦點停在隱藏欄位。
  assert(await page.locator('#existing-mode').getAttribute('aria-pressed') === 'true' && await page.evaluate(() => document.activeElement.id === 'select-video') && await page.locator('#select-video').isVisible(), '鍵盤入口沒有啟用或帶到選片');
  const steps = [], mark = stage => steps.push({ stage, hostTime: performance.now() });
  const chooserSnapshot = async () => ({ steps, ...await page.evaluate(() => ({ trace: window.comparisonKeyboardTrace, truncated: window.comparisonKeyboardTraceTruncated === true, active: document.activeElement?.id, focused: document.hasFocus(), visibility: document.visibilityState, activation: navigator.userActivation.isActive })).catch(() => ({ unavailable: true })) });
  let chooserInput;
  try {
    // requested 只代表呼叫等待，不宣稱瀏覽器已確認攔截；送 Enter 前不可插入額外等待來遮住競爭。
    mark('waiter-requested');
    const choosing = page.waitForEvent('filechooser').then(chooser => { mark('chooser-resolved'); return chooser; });
    mark('enter-requested'); await page.keyboard.press('Enter'); mark('enter-completed');
    const chooser = await choosing;
    chooserInput = await chooser.element().getAttribute('id');
    assert(chooserInput === 'reference-file', 'Enter 開啟的不是示範選片欄位');
    await chooser.setFiles('output/comparison/reference.mp4'); await idle(); mark('file-loaded');
  } catch (error) {
    // 只記測試控制項 ID 與事件資格，不輸出檔名、筆記、影片 bytes 或外部網址。
    console.error('comparison-keyboard native events:', JSON.stringify(await chooserSnapshot()));
    throw error;
  }
  // 成功輪也保留相同格式；只有失敗收據無法與 Linux 的正常按鍵順序對照。兩個時鐘不可跨層相減。
  const keyboardChooser = { inputId: chooserInput, ...await chooserSnapshot() };
  console.log('comparison-keyboard native events:', JSON.stringify(keyboardChooser));
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
  return { keyboardChooser, keyboardEntryAndFocus: true, keyboardPlayAndPause: true, nativeNumberInputPersistsMs: true, keyboardFineAdjustment: true, narrowStopVisible: true, narrowNoOverflow: true };
}
