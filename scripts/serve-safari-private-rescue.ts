/* 用途：私人 Safari 合成 QA 的唯讀 loopback 主機；層：本機測試工具；關聯 #13、safari-private-rescue-observer.js。 */
import assert from 'node:assert/strict';
import { readFileSync as read,writeFileSync as write,unlinkSync,existsSync } from 'node:fs';
import { createHash,randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { webPaths,webHeaders } from './web-assets';
assert.equal(Bun.version,'1.4.4');const root=resolve(import.meta.dir,'..'),folder=resolve(root,process.argv[2]||'output/safari-private-rescue'),observer=resolve(root,'tests/browser/safari-private-rescue-observer.js'),nonce=randomUUID(),lock='/private/tmp/dance-stamp-p0-media-test.lock',sha=(v:any)=>createHash('sha256').update(v).digest('hex');
assert.equal(process.cwd(),root);assert(folder.startsWith(root+'/output/'),'QA 收據必須留在本工作樹 output');
assert.equal(Bun.spawnSync(['git','status','--porcelain']).stdout.toString().trim(),'');
for(const [side,expected]of [['reference','4899551b4cec878137bca1e1d510cfbea00d5de1ae62799275cdcf04d8c689ae'],['self','ae6db98e328a05a1a0cff319e30ee4651607af84b8b0bcf0d4204cd55777af9f']])assert.equal(sha(read(folder+'/fixtures/'+side+'.mp4')),expected);
assert(!existsSync(folder+'/server.local.json'),'請用新的 output 子資料夾，不覆寫原收據');
// 只原子取得自己的鎖，既有鎖忙就退出，不能接管或刪除。

const files=new Map([...webPaths].map(([path,file])=>[path,{file,bytes:read(root+'/dist/web/'+file)}]));
const original=files.get('/')!.bytes,html=original.toString().replace('<script type="module" src="/main.js"></script>','<script src="/qa/observer.js"></script><script type="module" src="/main.js"></script>');assert.notEqual(sha(html),sha(original));
const config:any={nonce,sourceHead:Bun.spawnSync(['git','rev-parse','HEAD']).stdout.toString().trim(),productHead:'7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca',dependencyHead:'14cdaefd8159b0b1939d1304df1033f08edded0e',bun:Bun.version,static:files.get('/sw.js')!.bytes.toString().match(/const version = '([^']+)'/)?.[1],originalHtmlSha:sha(original),qaHtmlSha:sha(html),observerSha:sha(read(observer)),resources:Object.fromEntries([...files].map(([p,v])=>[p,sha(v.bytes)])),fixtures:Object.fromEntries(['reference','self'].map(s=>[s,{bytes:read(folder+'/fixtures/'+s+'.mp4').length,sha256:sha(read(folder+'/fixtures/'+s+'.mp4'))}]))};assert.equal(config.static,'80faff7573fa1d79');
write(lock,JSON.stringify({pid:process.pid,cwd:root,nonce,task:'issue13-safari-private-rescue'}),{flag:'wx'});
const requests:any[]=[];const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const u=new URL(req.url),p=u.pathname,h={...webHeaders,'Permissions-Policy':'camera=(), microphone=(), display-capture=(), geolocation=()'};
// 主機完全沒有資料或媒體上傳路由，唯一 POST 是自有 nonce 的結束訊號且 body 必須空。
if(req.method==='POST'&&p==='/qa/finish/'+nonce&&req.headers.get('origin')===u.origin&&!req.body){setTimeout(()=>{server.stop(true);assert.equal(JSON.parse(read(lock,'utf8')).nonce,nonce);unlinkSync(lock);write(folder+'/cleanup.local.json',JSON.stringify({pid:process.pid,nonce,stopped:true,requests}),{flag:'wx'});},100);return new Response('finishing');}
if(req.method!=='GET')return new Response('method rejected',{status:405});
if(p==='/qa/config')return Response.json(config,{headers:h});if(p==='/qa/observer.js')return new Response(Bun.file(observer),{headers:{...h,'Content-Type':'text/javascript'}});
const row=files.get(p);if(!row)return new Response('not found',{status:404});requests.push({p,at:Date.now(),sha:sha(p==='/'?html:row.bytes)});return new Response(p==='/'?html:row.bytes,{headers:{...h,'Content-Type':row.file.endsWith('.js')?'text/javascript':row.file.endsWith('.html')?'text/html':row.file.endsWith('.css')?'text/css':'application/octet-stream'}});
}});config.origin='http://127.0.0.1:'+server.port;write(folder+'/server.local.json',JSON.stringify({...config,pid:process.pid},null,2),{flag:'wx'});console.log(JSON.stringify({pid:process.pid,origin:config.origin,sourceHead:config.sourceHead,static:config.static}));
