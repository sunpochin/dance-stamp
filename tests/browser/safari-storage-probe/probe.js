/* 檔案用途：獨立原生 IDB 文字／Blob 對照，不依賴 storage.js。所在層：瀏覽器診斷。主要關聯：probe.html、Safari 驗收證據。 */
const run=document.getElementById('run'),status=document.getElementById('status'),summary=document.getElementById('summary'),result=document.getElementById('result');
const bounded=(promise,stage)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{const error=new Error(stage+' timeout');error.name='TimeoutError';reject(error);},5000);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const requested=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const completed=transaction=>new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onabort=()=>reject(transaction.error||new Error('aborted'));transaction.onerror=()=>{};});
run.addEventListener('click',async()=>{
 run.disabled=true;summary.replaceChildren();let db,transaction,stage='open';const start=performance.now(),record={startedAt:new Date().toISOString(),userAgent:navigator.userAgent,metadataRoundTrip:false,blobBytes:8192,abortRequested:false};
 try{
  // 隨機診斷庫不與產品共用 store／revision；錯誤不能改寫使用者的練舞庫。
  const open=indexedDB.open('dance-synthetic-blob-'+crypto.randomUUID(),1);open.onupgradeneeded=()=>open.result.createObjectStore('probe');db=await bounded(requested(open),stage);
  stage='metadata-write';transaction=db.transaction('probe','readwrite');let done=completed(transaction);done.catch(()=>{});transaction.objectStore('probe').put('synthetic local only','metadata');await bounded(done,stage);
  stage='metadata-read';let value=await bounded(requested(db.transaction('probe').objectStore('probe').get('metadata')),stage);if(value!=='synthetic local only')throw new Error('metadata mismatch');record.metadataRoundTrip=true;
  stage='blob-write';transaction=db.transaction('probe','readwrite');done=completed(transaction);done.catch(()=>{});transaction.objectStore('probe').put(new Blob([new Uint8Array(8192).fill(83)],{type:'application/octet-stream'}),'blob');await bounded(done,stage);
  stage='blob-read';value=await bounded(requested(db.transaction('probe').objectStore('probe').get('blob')),stage);
  stage='bytes';const bytes=new Uint8Array(await bounded(value.arrayBuffer(),stage));if(bytes.length!==8192||!bytes.every(byte=>byte===83))throw new Error('blob bytes mismatch');record.roundTripBytes=bytes.length;record.status='pass';
 }catch(error){record.status=error?.name==='TimeoutError'?'timeout':'error';record.stage=stage;record.errorName=error?.name||'Error';record.message=String(error?.message||error).slice(0,200);try{transaction?.abort();record.abortRequested=true;}catch{}}
 finally{
  // 逾時只記實際觀察；不把 abort 呼叫或 db.close 當作已回滾／已釋放證據。
  db?.close();record.elapsedMs=Math.round(performance.now()-start);result.textContent=JSON.stringify(record,null,2);status.textContent='已記錄：'+record.status;
  for(const [key,value]of Object.entries(record)){const line=document.createElement('p');line.textContent=key+': '+value;summary.append(line);}run.disabled=false;
 }
});
