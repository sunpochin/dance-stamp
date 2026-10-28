/* 檔案用途：量測可點範圍、長訊息、放大文字與橫直向 viewport。所在層：桌面版面回歸；不冒充實體手機。主要關聯：style.css、ACCEPTANCE.md。 */
async page => {
  const origin=new URL(page.url()).origin, assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const idle=()=>page.waitForFunction(()=>!document.getElementById('controls').disabled);
  await page.goto(origin);await idle();await page.locator('#reference-file').setInputFiles('output/comparison/reference.mp4');await idle();await page.locator('#self-file').setInputFiles('output/comparison/self-1.mp4');await idle();
  await page.locator('#offline-panel').evaluate(d=>{d.open=true;});
  const contrast=await page.evaluate(()=>{
    const rgb=s=>s.match(/[\d.]+/g).map(Number),blend=(fg,bg)=>{const a=fg[3]??1;return fg.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a));};
    const background=el=>{const chain=[];for(let n=el;n;n=n.parentElement)chain.push(n);return chain.reverse().reduce((bg,n)=>blend(rgb(getComputedStyle(n).backgroundColor),bg),[255,255,255]);};
    const luminance=c=>c.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
    return ['#status','#offline-status','.notice','.hint','#stop','#existing-mode','#copy-reference'].map(selector=>{const el=document.querySelector(selector),bg=background(el),fg=blend(rgb(getComputedStyle(el).color),bg),a=luminance(fg),b=luminance(bg);return{selector,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};});
  });
  assert(contrast.every(c=>c.ratio>=4.5),'常用文字對比不足：'+JSON.stringify(contrast));
  const results=[];
  for(const size of [{width:320,height:568},{width:390,height:844},{width:667,height:320},{width:844,height:390},{width:1280,height:960}])for(const scale of [100,200]){
    await page.setViewportSize(size);await page.evaluate(scale=>{document.documentElement.style.fontSize=scale+'%';},scale);
    await page.locator('#status').evaluate(p=>{p.textContent='合成長訊息：'+ '請先保留原片與筆記。'.repeat(18)+'a'.repeat(500);});
    await page.locator('#remove-copy').focus();await page.keyboard.press('Tab');
    const geometry=await page.evaluate(()=>{
      const bar=document.querySelector('.statusbar').getBoundingClientRect(),focus=document.activeElement.getBoundingClientRect(),stop=document.getElementById('stop').getBoundingClientRect();
      const small=[...document.querySelectorAll('button,input,select,textarea,summary,a[download]')].filter(e=>e.getClientRects().length&&!e.matches(':disabled')).map(e=>{const target=e.type==='checkbox'?e.closest('label')||e:e,r=target.getBoundingClientRect();return {id:e.id||e.textContent.slice(0,20),width:r.width,height:r.height};}).filter(r=>r.width<44||r.height<44);
      return{barBottom:bar.bottom,focusTop:focus.top,focusBottom:focus.bottom,viewport:innerHeight,stopVisible:stop.top>=0&&stop.bottom<=innerHeight,small,noOverflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth};
    });
    assert(geometry.noOverflow && geometry.stopVisible && geometry.small.length===0,JSON.stringify({size,scale,geometry}));
    assert(geometry.focusTop>=geometry.barBottom && geometry.focusBottom<=geometry.viewport,'焦點被停止列遮住：'+JSON.stringify({size,scale,geometry}));
    results.push({size,scale,...geometry});
  }
  await page.evaluate(()=>{document.documentElement.style.fontSize='100%';});await page.setViewportSize({width:667,height:320});
  await page.locator('#status').focus();await page.keyboard.press('End');
  await page.waitForFunction(()=>document.getElementById('status').scrollTop>0,null,{timeout:2000});
  assert(await page.locator('#status').evaluate(p=>p.scrollTop>0),'長狀態不能以鍵盤捲讀');
  await page.screenshot({path:'output/a11y14-landscape.png'});
  // 原生 modal 內的 checkbox 以整列 label 作為可點範圍。
  const data=await page.evaluate(async()=>{const d=(await import('/library.js')).newLibrary(),id=crypto.randomUUID();d.videos.push({id,title:'合成重連',durationMs:90000,revision:1});d.assets.push({id:crypto.randomUUID(),videoId:id,kind:'reference',byteLength:1,mimeType:'video/mp4'});return d;});
  await page.locator('#restore').setInputFiles({name:'synthetic-layout.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await idle();await page.locator('#import-confirm').click();await idle();
  await page.getByRole('button',{name:'選片並預覽重連',exact:true}).click();await idle();assert(await page.evaluate(()=>document.activeElement.id==='relink-file'),'重連未等控制啟用才聚焦');
  await page.setViewportSize({width:390,height:844});
  const checks=await page.locator('#media-dialog .check-label').evaluateAll(labels=>labels.map(e=>{const r=e.getBoundingClientRect();return{width:r.width,height:r.height};}));
  assert(checks.every(r=>r.width>=44&&r.height>=44),'重連 checkbox 列小於 44px');await page.screenshot({path:'output/a11y14-relink.png'});
  await page.keyboard.press('Escape');assert(await page.evaluate(()=>document.activeElement.textContent==='選片並預覽重連'),'重連取消未返回原清單');
  return{viewports:results,contrast,checkboxLabels:checks,nativeStatusKeyboardScroll:true,relinkFocusAndCancel:true};
}
