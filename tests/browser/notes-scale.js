/* 檔案用途：量測合成大筆記庫的開啟與搜尋，不設定未經產品規格定義的速度門檻。所在層：#17 桌面效能驗證。主要關聯：library.js、main.js。 */
// 預設中型資料量；更大的資料量由呼叫端明確傳入，避免一般回歸意外佔用過多資源。
async (page, count = 1000) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); }, origin = new URL(page.url()).origin;
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) && [100,1000,5000].includes(count) && await page.evaluate(() => window.__danceSyntheticCameraOnly === true), '只允許隔離合成筆記庫');
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined }); });
  await page.goto(origin); await page.waitForFunction(() => !document.getElementById('controls').disabled);
  const seed = await page.evaluate(async count => {
    const storage = await import('/storage.js'), saved = await storage.readLibrary(), data = (await import('/library.js')).newLibrary();
    if (saved.data.videos.length) throw new Error('需要全新隔離資料庫');
    for (let i=0; i<count; i++) {
      const key=String(i+1).padStart(6,'0'), videoId=crypto.randomUUID(), moveId=crypto.randomUUID(), assetId=crypto.randomUUID(), takeId=crypto.randomUUID();
      data.videos.push({id:videoId,title:'合成課程'+key,durationMs:15000,revision:1});
      data.moves.push({id:moveId,name:'合成動作'+key,danceStyle:'Salsa',status:'wanted',revision:1});
      data.markers.push({id:crypto.randomUUID(),videoId,startMs:2000,endMs:4000,title:'合成片段',note:'合成筆記',moveId,revision:1});
      data.assets.push({id:assetId,kind:'take',byteLength:0,mimeType:'video/mp4'});
      data.takes.push({id:takeId,referenceVideoId:videoId,cameraAssetId:assetId,referenceStartMs:0,referenceEndMs:15000,rate:1,state:'ready',createdAt:'2026-10-28T00:00:00.000Z'});
      data.recipes.push({id:crypto.randomUUID(),takeId,offsetMs:0,referenceMirror:false,selfMirror:false,layout:'side-by-side',audioSource:'reference',revision:1});
    }
    const bytes=new Blob([JSON.stringify(data)]).size;if(bytes>10*1024*1024)return {count,bytes,skippedByFormatSize:true};
    const start=performance.now();await storage.writeLibrary(data,0);return {count,bytes,nativeWriteMs:performance.now()-start};
  },count);
  if(seed.skippedByFormatSize)return seed;
  await page.reload();await page.waitForFunction(n => document.getElementById('search-videos').children.length===n && document.getElementById('move-results').children.length===n,count,{timeout:180000});
  const twoFrames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))));
  const initialReadyUpperMs=await twoFrames();
  const before=await page.evaluate(async()=>{const state=await (await import('/storage.js')).readLibrary();window.scaleDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(v=>v.toString(16).padStart(2,'0')).join('');return {revision:state.revision,digest:await window.scaleDigest(state.data)};});
  const beforeOpen=await page.evaluate(()=>performance.now());await page.getByText('分類搜尋與動作庫',{exact:true}).click();const expandUpperMs=(await twoFrames())-beforeOpen;
  // capture listener 先記輸入，再等產品同步重繪及兩個影格，避免只量 dispatchEvent 自己的耗時。
  await page.evaluate(()=>document.getElementById('library-keyword').addEventListener('input',()=>{const start=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>{window.scaleSample={inputToTwoFramesMs:performance.now()-start,videos:document.getElementById('search-videos').children.length,moves:document.getElementById('move-results').children.length};}));},{capture:true}));
  const queries=[];
  for(const [query,expected] of [['不存在合成代號',0],['課程000001',1],['',count]]){
    await page.evaluate(()=>{window.scaleSample=null;});await page.locator('#library-keyword').fill(query);await page.waitForFunction(()=>window.scaleSample!==null,null,{timeout:180000});
    const result=await page.evaluate(()=>window.scaleSample);assert(result.videos===expected&&result.moves===expected,'大庫搜尋結果不正確');queries.push({query:query||'(空白)',...result});
  }
  const after=await page.evaluate(async()=>{const state=await (await import('/storage.js')).readLibrary();return {revision:state.revision,digest:await window.scaleDigest(state.data),mediaKeys:(await (await import('/storage.js')).readMediaKeys()).length};});
  assert(after.revision===before.revision&&after.digest===before.digest&&after.mediaKeys===0,'搜尋改寫筆記或出現媒體');
  return {...seed,initialReadyUpperMs,expandUpperMs,queries,metadataUnchanged:true,noMediaApis:true};
}
