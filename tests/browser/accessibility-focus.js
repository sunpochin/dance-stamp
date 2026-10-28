/* 檔案用途：驗證原生鍵盤、停用後焦點、重新繪製與確認框返回。所在層：Web 可及性回歸。主要關聯：main.js、backup-keyboard.js。 */
async page => {
  const origin=new URL(page.url()).origin, assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const idle=()=>page.waitForFunction(()=>!document.getElementById('controls').disabled && document.getElementById('compare').getAttribute('aria-busy')!=='true');
  const focused=()=>page.evaluate(()=>document.activeElement.id);
  await page.goto(origin);await idle();
  await page.locator('.skip-link').focus();await page.keyboard.press('Enter');assert(await focused()==='controls','跳到內容未帶到選片');
  await page.locator('#existing-mode').focus();await page.keyboard.press('Enter');assert(await focused()==='reference-file','入口未帶到選片');
  await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4');await idle();
  await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4');await idle();
  await page.locator('#copy-reference').focus();await page.keyboard.press('Enter');await idle();assert(await focused()==='copy-reference','副本保存後焦點遺失');
  await page.locator('#mark').focus();await page.keyboard.press('Enter');assert(await focused()==='marker-title','新增標記未進入輸入');
  await page.locator('#marker-title').fill('合成鍵盤標記');await page.locator('#marker-note').pressSequentially('M L ');
  assert(await page.locator('#reference').evaluate(v=>v.paused),'輸入文字觸發播放');
  await page.locator('#marker-form button[type=submit]').focus();await page.keyboard.press('Enter');await idle();assert(await focused()==='mark','保存標記後焦點未返回');
  await page.getByRole('button',{name:'編輯',exact:true}).focus();await page.keyboard.press('Enter');await idle();assert(await focused()==='marker-title','操作期間停用讓編輯焦點失效');
  await page.locator('#cancel-marker').focus();await page.keyboard.press('Enter');assert(await focused()==='mark','取消標記後焦點遺失');
  const open=page.getByRole('button',{name:'開啟自拍／恢復',exact:true});await open.focus();await page.keyboard.press('Enter');await idle();
  assert(await page.evaluate(()=>document.activeElement.textContent==='開啟自拍／恢復'),'開啟練習後焦點遺失');
  // 比較設定失焦保存會重繪列表；鍵盤已移到列表時仍留在同一筆。
  await page.locator('#offset').fill('0.01');await page.locator('#offset').dispatchEvent('change');await open.focus();await idle();
  assert(await page.evaluate(()=>document.activeElement.textContent==='開啟自拍／恢復'),'背景保存重繪吃掉列表焦點');
  await page.locator('#media-inventory').evaluate(d=>{d.open=true;});
  const selfRow=page.locator('#media-items li[data-availability=session]').first();await selfRow.getByRole('button',{name:'保存瀏覽器副本',exact:true}).focus();await page.keyboard.press('Space');await idle();
  await page.waitForFunction(()=>document.activeElement.closest('#media-items') && document.activeElement.textContent==='另存影片檔');
  assert(await page.evaluate(()=>document.activeElement.closest('li').dataset.availability==='stored'),'清單重繪後焦點沒有留在同一份媒體');
  const takeDelete=page.getByRole('button',{name:'刪除此練習與比較…',exact:true});await takeDelete.focus();await page.keyboard.press('Enter');await idle();
  assert(await focused()==='delete-cancel','刪除預設不是取消');await page.keyboard.press('Escape');assert(await page.evaluate(()=>document.activeElement.textContent==='刪除此練習與比較…'),'關閉刪除框未返回開啟處');
  // 原生交易故障仍能保留焦點；不以重載恢復鍵盤。
  await page.evaluate(()=>{window.focusPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='media')throw new DOMException('synthetic-private-filename','QuotaExceededError');return window.focusPut.apply(this,args);};});
  try {await page.locator('#copy-reference').focus();await page.keyboard.press('Enter');await idle();assert(await focused()==='copy-reference','quota 後焦點遺失');}
  finally {await page.evaluate(()=>{IDBObjectStore.prototype.put=window.focusPut;});}
  const diag=JSON.parse(await page.locator('#diagnostics').textContent());assert(diag.lastError==='storage-full' && !JSON.stringify(diag).includes('synthetic-private'),'診斷含原生私密錯誤字串');
  await page.locator('#play').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.getElementById('pause-comparison').hidden);
  await page.locator('#stop').focus();await page.keyboard.press('Enter');await idle();assert(await focused()==='stop','作業結束搶走停止鍵焦點');
  assert(await page.evaluate(()=>['controls','compare','practice','library-panel'].every(id=>document.getElementById(id).getAttribute('aria-busy')==='false')),'忙碌狀態未清除');
  return {skipLink:true,entryFocus:true,copyAndMarkerFocusRestored:true,dynamicListFocusPreserved:true,modalReturnsToOpener:true,quotaKeepsFocusAndRedactsDiagnostics:true,stopFocusNotStolen:true,typingDoesNotPlay:true,busyStateCleared:true};
}
