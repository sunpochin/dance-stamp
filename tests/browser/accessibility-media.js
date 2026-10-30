/* 檔案用途：驗證讀屏可用的狀態與名稱、診斷去識別、網路及相機釋放。所在層：合成媒體可及性驗收；非讀屏實聽或真機。主要關聯：capture-comparison.js、ACCEPTANCE.md。 */
// 相機設定已收在選用區；先展開，再沿用原本的錄影與資料保護斷言。
async page => {
  const origin=new URL(page.url()).origin,assert=(ok,message)=>{if(!ok)throw new Error(message);},outside=[];
  const idle=()=>page.waitForFunction(()=>!document.getElementById('controls').disabled,null,{timeout:95000});
  page.on('request',r=>{if((!r.url().startsWith(origin+'/')&&!r.url().startsWith('blob:'))||!['GET','HEAD'].includes(r.method()))outside.push(r.method());});
  await page.addInitScript(()=>{
    const obtain=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.a11yRejectCamera=true;window.a11yTracks=[];window.a11yRequests=[];
    navigator.mediaDevices.getUserMedia=async constraints=>{
      if(!window.__danceSyntheticCameraOnly||constraints.audio!==false)throw new Error('只可使用合成相機，不可請求麥克風');
      window.a11yRequests.push(constraints);if(window.a11yRejectCamera)throw new DOMException('synthetic-private-device','NotAllowedError');
      const stream=await obtain(constraints);window.a11yTracks.push(...stream.getTracks());
      for(const track of stream.getVideoTracks()){const settings=track.getSettings.bind(track);track.getSettings=()=>({...settings(),deviceId:'synthetic-private-device',groupId:'synthetic-private-group'});Object.defineProperty(track,'label',{value:'synthetic-private-label'});}
      return stream;
    };
  });
  await page.goto(origin);await idle();
  // 用瀏覽器原生 File 換合成檔名，原 bytes 不變；CLI VM 不允許 Node 動態匯入。
  await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='synthetic-fixture-transfer';input.hidden=true;document.body.append(input);});
  await page.locator('#synthetic-fixture-transfer').setInputFiles('output/media-probe/reference.mp4');
  await page.evaluate(()=>{const fixture=document.getElementById('synthetic-fixture-transfer'),input=document.getElementById('reference-file'),transfer=new DataTransfer();transfer.items.add(new File([fixture.files[0]],'synthetic-private-reference.mp4',{type:'video/mp4'}));fixture.remove();input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));});await idle();
  assert(await page.evaluate(()=>window.a11yRequests.length===0),'開站或選片自行請求相機');
  await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click();await idle();assert((await page.locator('#status').textContent()).includes('權限未開啟'),'相機拒絕沒有可理解結果');
  assert(!(await page.locator('#diagnostics').textContent()).includes('synthetic-private'),'權限診斷含裝置資料');
  await page.evaluate(()=>{window.a11yRejectCamera=false;});await page.locator('#camera-tools').evaluate(d => { d.open = true; }); await page.locator('#camera').click();await idle();
  const cdp=await page.context().newCDPSession(page);
  const names=async()=>{const tree=await cdp.send('Accessibility.getFullAXTree');return tree.nodes.filter(n=>!n.ignored).map(n=>n.name?.value);};
  let readable=await names();assert(readable.includes('老師示範影片播放器')&&readable.includes('相機即時取景預覽'),'相機／老師影片缺少可讀名稱');
  await page.evaluate(()=>{window.a11yStatuses=[];new MutationObserver(()=>window.a11yStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,subtree:true,characterData:true});});
  await page.locator('#capture').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('錄影中'));
  assert(await page.evaluate(()=>document.getElementById('status').getAttribute('aria-live')==='polite'&&document.getElementById('status').getAttribute('aria-atomic')==='true'&&!document.getElementById('status').closest('[aria-busy=true]')),'錄影狀態被忙碌容器遮蔽或不是禮貌宣告');
  await idle();readable=await names();assert(readable.includes('我的練習影片播放器'),'自拍播放器沒有可讀名稱');
  await page.locator('#export').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('合成中'));
  assert((await page.locator('#status').ariaSnapshot()).includes('合成中'),'狀態不在可及性樹內');await idle();
  assert((await page.locator('#status').textContent()).includes('已成檔'),'沒有完成可下載 VS');
  readable=await names();assert(readable.includes('已合成的左右比較影片播放器')&&readable.includes('合成進度'),'輸出／進度缺少可讀名稱');await cdp.detach();
  const statuses=await page.evaluate(()=>window.a11yStatuses);assert(statuses.length<=20,'狀態以影格頻率洗版');
  const diag=await page.locator('#diagnostics').textContent(),data=await page.evaluate(async()=>JSON.stringify((await import('/library.js')).validateBackup((await (await import('/storage.js')).readLibrary()).data)));
  assert(!diag.includes('synthetic-private')&&!data.includes('synthetic-private'),'診斷或 JSON 含原檔名／裝置識別');
  const resources=await page.evaluate(()=>({calls:window.a11yRequests.length,noMic:window.a11yRequests.every(c=>c.audio===false),stopped:window.a11yTracks.every(t=>t.readyState==='ended'),previewCleared:document.getElementById('preview').srcObject===null}));
  assert(resources.calls===2&&resources.noMic&&resources.stopped&&resources.previewCleared&&outside.length===0,'網路、相機或拒絕重試流程不符');
  const download=page.waitForEvent('download');await page.locator('#output-download').click();await(await download).saveAs('output/media-probe/a11y14-capture-vs.mp4');
  assert(await page.locator('#reference-download').getAttribute('download')==='dance-reference.mp4','下載建議名稱洩漏原檔名');
  return{browserAXNamesVerified:true,politeAtomicStatusOutsideBusy:true,statusCount:statuses.length,states:statuses,permissionDenialAndExplicitRetry:true,diagnosticsAndBackupRedacted:true,resources,outsideRequests:outside,vsDownloaded:true};
}
