"""用途：只讀核對原生保存 Stop 的匿名結論。層：本機 QA；關聯 #13、safari-save-stop-observer.js。"""
from pathlib import Path
import json,hashlib,copy,sys
assert len(sys.argv)==3, '用法：python3 scripts/check-safari-save-stop.py <本機收據目錄> <實際舊VS另存檔>'
p=Path(sys.argv[1])
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda f:json.loads((p/f).read_text())
a,b,c,d=[read('run/receipt-%03d.local.json'%n) for n in range(1,5)]
e=read('receipt-001.local.json')
# 不混用其他來源或其他 origin 的收據，避免舊版結果替新版本背書。
assert len({v['sourceHead'] for v in [a,b,c,d,e]})==1 and len({v['nonce'] for v in [a,b,c,d,e]})==1
def rows(v):return {r['name']:r for r in v['rows']}
def meta(v):return rows(v)['metadata']['values'][0]
def media(v):
 r=rows(v)['media'];return dict(zip(r['keys'],r['values']))
assert meta(b)['revision']==meta(a)['revision']+2
assert a['ui']['unknown']==b['ui']['unknown']==c['ui']['unknown']==d['ui']['unknown']==e['ui']['unknown']==False
assert rows(b)==rows(c)
assert rows(d)==rows(e)
assert meta(b)==meta(d)
# 完成檔只准追加本輪 asset／export；不能只比筆記數量而漏掉內容變動。
old=meta(a)['data'];new=copy.deepcopy(meta(b)['data']);asset=b['target']['id']
new['assets']=[v for v in new['assets'] if v['id']!=asset]
new['exports']=[v for v in new['exports'] if v['assetId']!=asset]
assert new==old and len(meta(b)['data']['exports'])==len(old['exports'])+1
assert old['markers'][0]['note']
for v in [b,c,d,e]:
 for k,item in media(a).items():
  assert media(v)[k]==item
  binary=(p/'results'/(item['sha256']+'.bin')).read_bytes()
  assert len(binary)==item['bytes'] and sha(binary)==item['sha256']
assert rows(a)['chunks']==rows(d)['chunks']==rows(e)['chunks']
# Stop 本身不代表回滾；只有同一交易的真正 complete 能證明保存。
tx=d['transactions'][d['target']['transactionId']]
assert tx['stores']==['media','metadata'] and len(tx['success'])==2 and all(s['trusted'] for s in tx['success'])
assert {s['store'] for s in tx['success']}=={'metadata','media'}
assert tx['events']==[{'type':'complete','at':tx['events'][0]['at'],'trusted':True}]
assert b['transactions'][b['target']['transactionId']]['events']==c['transactions'][c['target']['transactionId']]['events']==[]
stops=[x for x in d['clicks'] if x['id']=='stop'];assert len(stops)==1 and stops[0]['trusted']
assert all(x['at']<stops[0]['at'] for x in tx['success']) and tx['events'][0]['at']>stops[0]['at']
assert b['ui']['busy']==c['ui']['busy']=='true' and d['ui']['busy']=='false'
for v in [b,c]:
 assert sorted(t['kind'] for t in v['resources']['tracks'])==['audio','audio','video']
 assert v['resources']['recorders']==['inactive'] and v['resources']['framePending']==0
 assert all(t['state']=='live' for t in v['resources']['tracks'])
assert all(t['state']=='ended' for t in d['resources']['tracks'])
assert d['resources']['recorders']==['inactive'] and d['resources']['framePending']==0
for v in [a,b,c,d,e]:assert v['hardwareCalls']==0 and v['errors']==[]
# 下載、候選及持久層必須是完整同一份 bytes，不能靠檔名或非空判定。
candidate=b['candidate'];assert b['candidate']==c['candidate']==d['candidate']==media(d)[asset]
binary=(p/'results'/(candidate['sha256']+'.bin')).read_bytes();assert sha(binary)==candidate['sha256'] and len(binary)==candidate['bytes']
for name in ['before-stop-new-vs.webm','after-stop-new-vs.webm','complete-new-vs.webm']:
 data=(p/'results'/name).read_bytes();assert data==(p/'results'/(candidate['sha256']+'.bin')).read_bytes()
oldvs=Path(sys.argv[2]).read_bytes();old_asset=old['exports'][0]['assetId'];assert oldvs==(p/'results'/(media(a)[old_asset]['sha256']+'.bin')).read_bytes()
prep=[t for t in d['transactions'] if t['mode']=='readwrite' and t['id']<tx['id']];assert prep[-1]['events'][0]['type']=='complete' and prep[-1]['success']==[prep[-1]['success'][0]]
result={'sourceHead':d['sourceHead'],'userAgent':d['userAgent'],'revision':[meta(a)['revision'],meta(b)['revision']-1,meta(d)['revision']],'targetNativeEvents':tx,'stop':stops[0],'pendingObservedAfterStopMs':c['resourcesAt']-stops[0]['at'],'pendingDataEqual':True,'allOldFieldsAndMediaBytesPreserved':True,'completeEqualsReload':True,'candidate':candidate,'resources':{'beforeStop':b['resources'],'afterStop':c['resources'],'complete':d['resources']},'chunks':'before/complete/reload empty and identical;pending target has no chunks scope;not directly reread while held','receipts':{str(f.relative_to(p)):sha(f.read_bytes()) for f in sorted(p.rglob('receipt-*.json'))}}
print(json.dumps(result,indent=2))
