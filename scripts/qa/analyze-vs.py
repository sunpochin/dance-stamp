"""用途：按實際診斷碼聯結來源／繪圖／原生擷取／成檔；層：獨立QA；關聯：vs-content.js、RECORD_COMPARE.md。"""
import array, base64, hashlib, importlib.util, json, math, re, statistics, subprocess, sys, zlib
from collections import Counter, defaultdict
from pathlib import Path
spec = importlib.util.spec_from_file_location('short_capture', Path(__file__).with_name('analyze-capture.py'))
short = importlib.util.module_from_spec(spec); spec.loader.exec_module(short)

def run(command, data=None):
    r = subprocess.run(command, input=data, capture_output=True, timeout=120)
    assert r.returncode == 0, (command, r.returncode, r.stderr.decode(errors='replace')[:2000])
    return r

def word(raw, width, x, y, count, step):
    value = 0
    for bit in range(count):
        level = sum(raw[(y+dy)*width+x+bit*step+dx] for dy in [-1,0,1] for dx in [-1,0,1])/9
        assert level < 70 or level > 185, ('ambiguous',bit,level)
        value |= int(level > 185) << bit
    return value

def decode(raw):
    assert len(raw) == 288*132
    words = [word(raw,288,8,4+row*8,16,16) for row in range(4)]
    assert words[0] == 0xa55a and words[2] == (words[1]^65535) and words[3] == short.crc16(words[1]), words
    return {'id':words[1], 'codes':[word(raw,288,9,57,12,24),word(raw,288,9,107,12,24)]}

def pts_failures(rows):
    return [{'index':i+1,'leftPts':a['pts'],'rightPts':b['pts']} for i,(a,b) in enumerate(zip(rows,rows[1:])) if a['pts']>=b['pts']]

def join(encoded, native, paints):
    # 只准內容身分聯結；重複回呼會保留多義，不能任挑第N筆或最近時間。
    lookup = {p['id']:p for p in paints}; assert len(lookup)==len(paints)
    by_id=defaultdict(list)
    for n in native:
        assert n['id'] in lookup and n['codes']==lookup[n['id']]['codes'], ('native content mismatch',n)
        by_id[n['id']].append(n)
    for e in encoded:
        assert e['id'] in lookup and e['codes']==lookup[e['id']]['codes'], ('encoded content mismatch',e)
    observed={e['id'] for e in encoded}; rows=[]
    for e in encoded:
        matches=by_id.get(e['id'],[]); p=lookup[e['id']]
        rows.append({**e,'paint':p,'native':matches,'match':'unique' if len(matches)==1 else 'missing' if not matches else 'ambiguous'})
    return rows, {'encodedWithoutNative':sorted(observed-set(by_id)), 'nativeWithoutEncoded':sorted(set(by_id)-observed), 'paintWithoutEncoded':sorted(set(lookup)-observed), 'duplicateNative':{str(k):len(v) for k,v in by_id.items() if len(v)>1}, 'duplicateEncoded':{str(k):v for k,v in Counter(e['id'] for e in encoded).items() if v>1}}

FILTER='[0:v]split=3[m][l][r];[m]crop=256:32:256:4,pad=288:32:0:0:black[m];[l]crop=576:100:16:304,scale=288:50[l];[r]crop=576:100:656:304,scale=288:50[r];[m][l][r]vstack=3,format=gray,showinfo'
def encoded(path, marked=True):
    info=json.loads(run(['ffprobe','-v','error','-show_streams','-show_packets','-show_frames','-of','json',str(path)]).stdout)
    video=next(s for s in info['streams'] if s['codec_type']=='video');vi=video['index']
    frames=[f for f in info['packets_and_frames'] if f['type']=='frame' and f['stream_index']==vi]
    packets={p['pos']:p for p in info['packets_and_frames'] if p['type']=='packet' and p['stream_index']==vi}
    r=run(['ffmpeg','-v','info','-copyts','-i',str(path),'-filter_complex',FILTER,'-fps_mode','passthrough','-enc_time_base',video['time_base'],'-pix_fmt','gray','-f','rawvideo','-'])
    details=re.findall(r'n:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:([^ ]+).*?checksum:([0-9A-F]+)',r.stderr.decode()); size=288*132
    assert len(r.stdout)==len(details)*size==len(frames)*size
    rows=[]
    for i,(f,d) in enumerate(zip(frames,details)):
        raw=r.stdout[i*size:(i+1)*size]
        assert i==int(d[0]) and f['pts']==int(d[1])==f['best_effort_timestamp']==packets[f['pkt_pos']]['pts']
        assert zlib.adler32(raw,0)==int(d[3],16)
        row=decode(raw) if marked else {'codes':[word(raw,288,9,57,12,24),word(raw,288,9,107,12,24)]}
        row.update(ptsMs=float(f['pts_time'])*1000,pts=f['pts'],packetPos=f['pkt_pos'],checksum=d[3]);rows.append(row)
    # 診斷仍列出不合格PTS，不能為了繼續量測而補時戳或把失敗改成通過。
    return rows,info,r.stderr

def audio(path):
    pcm=run(['ffmpeg','-v','error','-copyts','-i',str(path),'-vn','-ac','1','-af','aresample=8000:async=1:first_pts=0','-f','f32le','-']).stdout
    samples=array.array('f',pcm);onsets=[];was=False
    for i in range(0,len(samples),80):
        b=samples[i:i+80];loud=math.sqrt(sum(v*v for v in b)/len(b))>.03
        if loud and not was and (not onsets or i/8-onsets[-1]>=250/.75):onsets.append(i/8)
        was=loud
    return onsets

def cues(rows):
    found=[];last=None
    for row in rows:
        code=row['codes'][0];second=code//30
        if code!=last and code%30<=2 and (last is None or second!=last//30) and 12<=second<57:found.append({**row,'sourceSecond':second})
        last=code
    return found

def analyze(folder,path,receipt):
    log=json.loads(receipt.read_text()); rows,info,stderr=encoded(path)
    full=subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(path),'-fps_mode','passthrough','-enc_time_base','demux','-f','null','-'],capture_output=True,timeout=120)
    (folder/'full-decode.stderr.local.txt').write_bytes(full.stderr)
    native=[];pngs=[]
    for n in log['native']:
        assert not n.get('error'),n
        png=base64.b64decode(n['png'].split(',')[1]);assert int.from_bytes(png[16:20],'big')==288 and int.from_bytes(png[20:24],'big')==132;pngs.append(png)
    raw=run(['ffmpeg','-v','error','-f','image2pipe','-i','pipe:0','-pix_fmt','gray','-f','rawvideo','pipe:1'],b''.join(pngs)).stdout
    assert len(raw)==len(pngs)*288*132
    for i,n in enumerate(log['native']):
        pixel=decode(raw[i*288*132:(i+1)*288*132]);assert pixel==n['pixels']
        capture=n['metadata']['captureTime'];assert capture['type']=='number' and capture['value']>0
        native.append({**pixel,'captureTime':capture['value'],'entered':n['entered'],'exited':n['exited'],'metadata':n['metadata']})
    source_pngs=[base64.b64decode(s['png'].split(',')[1]) for s in log['source']]
    source_raw=run(['ffmpeg','-v','error','-f','image2pipe','-i','pipe:0','-pix_fmt','gray','-f','rawvideo','pipe:1'],b''.join(source_pngs)).stdout
    assert len(source_raw)==len(source_pngs)*288*50
    for i,item in enumerate(log['source']):
        assert word(source_raw[i*288*50:(i+1)*288*50],288,9,25,12,24)==item['code'],'source callback pixels disagree'
    matched,missing=join(rows,native,log['paints']);unique=[r for r in matched if r['match']=='unique']
    assert unique,'no uniquely matched content'
    onsets=audio(path);visual=cues(rows);errors=[a-v['ptsMs'] for a,v in zip(onsets,visual)]
    bounds=short.mapping([dict(r) for r in rows],log['paints'],None)
    origin=unique[0]['native'][0]['captureTime']-unique[0]['ptsMs'];mapping=[r['native'][0]['captureTime']-r['ptsMs'] for r in unique]
    cap_paint=[r['native'][0]['captureTime']-r['paint']['begin'] for r in unique]
    encoded_cues=[]
    for v,a in zip(visual,onsets):
        row=next(r for r in matched if r['id']==v['id'] and r['pts']==v['pts']);encoded_cues.append({'sourceSecond':v['sourceSecond'],'id':v['id'],'videoPtsMs':v['ptsMs'],'audioPtsMs':a,'audioMinusVideoMs':a-v['ptsMs'],'paintBegin':row['paint']['begin'],'paintEnd':row['paint']['end'],'paintAudio':row['paint']['audio'],'nativeMatches':row['native']})
    snapshot=log['snapshots'][-1];media_sha=hashlib.sha256(path.read_bytes()).hexdigest();assert any(m['sha256']==media_sha and m['bytes']==path.stat().st_size for m in snapshot['media'])
    failures=pts_failures(rows)
    summary={'strictPtsPass':not failures,'ptsFailures':failures,'sha256':media_sha,'bytes':path.stat().st_size,'encodedFrames':len(rows),'paintCount':len(log['paints']),'nativeCount':len(native),'uniqueJoin':len(unique),'missingAndDuplicates':missing,'conditionalOffsetBounds':bounds,'captureMinusPtsRangeMs':[min(mapping),max(mapping)],'relativeMappingChangeFromFirstMs':[min(x-origin for x in mapping),max(x-origin for x in mapping)],'captureMinusPaintBeginRangeMs':[min(cap_paint),max(cap_paint)],'audioMinusVideoMs':errors,'audioCounts':[len(onsets),len(visual)],'maxAudioMs':max(map(abs,errors)) if errors else None,'original100msPass':len(onsets)==len(visual)==45 and max(map(abs,errors))<=100,'nativeCallbackCostMs':{'median':statistics.median(n['exited']-n['entered'] for n in native),'max':max(n['exited']-n['entered'] for n in native)},'sourceCallbackCostMs':{'median':statistics.median(n['exited']-n['entered'] for n in log['source']),'max':max(n['exited']-n['entered'] for n in log['source'])},'markerReadCostMs':{'median':statistics.median(p['end']-p['markEntered'] for p in log['paints']),'max':max(p['end']-p['markEntered'] for p in log['paints'])},'fullDecode':{'exit':full.returncode,'stderrBytes':len(full.stderr),'pixelDecodeCount':len(rows),'audioDecode':'complete PCM;original PTS;no file edits'},'limits':'extra diagnostic layer and same-stream video sink;metadata/pixels not atomic;not calibrated physical latency;upstream not installed binary;no original130ms repair claim'}
    for name,value in [('joined',matched),('cues',encoded_cues),('summary',summary),('probe',info)]: (folder/(name+'.local.json')).write_text(json.dumps(value,indent=2))
    (folder/'decode.local.stderr').write_bytes(stderr);print(json.dumps(summary,indent=2))

def summarize(folder, receipt):
    """原嚴格量尺停止後，另列可計算欄位；不能把局部數字冒充整案通過。"""
    log=json.loads(receipt.read_text());rows=json.loads((folder/'joined.local.json').read_text())
    # 片長由原檔完整解碼的PTS與樣本尾端推導，不借產品讀回值作獨立證據。
    rate=.75;probe=json.loads((folder/'probe.local.json').read_text())
    video_end=(rows[-1]['ptsMs']+statistics.median(b['ptsMs']-a['ptsMs'] for a,b in zip(rows,rows[1:])))/1000
    sample_rate=int(next(s['sample_rate'] for s in probe['streams'] if s['codec_type']=='audio'))
    audio_end=max(float(f['pts_time'])+f['nb_samples']/sample_rate for f in probe['packets_and_frames'] if f['type']=='frame' and f.get('media_type')=='audio')
    duration=max(video_end,audio_end)
    values=[(r['ptsMs']/1000,(r['codes'][1]-r['codes'][0])/30/rate*1000) for r in rows]
    windows=[statistics.median([e for t,e in values if max(0,target-.5)<=t<=target+.5]) for target in [.5,30,59.5]]
    coverage=[(rows[0]['codes'][side]/30-12)/rate*1000 for side in [0,1]]+[((rows[-1]['codes'][side]+1)/30-57)/rate*1000 for side in [0,1]]
    frozen=[]
    for side in [0,1]:
        begin=rows[0]['ptsMs'];last=None;maximum=0
        for row in rows:
            maximum=max(maximum,row['ptsMs']-begin)
            if row['codes'][side]!=last:begin=row['ptsMs']
            last=row['codes'][side]
        frozen.append(max(maximum,duration*1000-begin))
    start=log['audio'][0]['args'][0];phases=[]
    for cue in json.loads((folder/'cues.local.json').read_text()):
        second=cue['sourceSecond'];sample=cue['paintAudio'][0]['time'] if cue['paintAudio'] else None
        phases.append({**cue,'postMarkerAudioElapsedMs':None if sample is None else (sample-start)*1000,'idealCueElapsedMs':(second-12)/rate*1000,'sourceActualCodeCallbacks':[{k:item[k] for k in ['entered','exited','metadata','geometry']} for item in log['source'] if item['side']=='reference' and item['code']==second*30]})
    ended=next(e for e in log['audio'] if e['kind']=='ended')['now']
    # 依真正ended事件作事後分層；完整尾段仍保留，不能移除尾格來取得通過。
    before=[r['native'][0]['captureTime']-r['ptsMs'] for r in rows if r['match']=='unique' and r['native'][0]['captureTime']<ended]
    report={'scope':'posthoc descriptive fields;strict PTS and100ms failure retained','durationSeconds':duration,'durationBasis':'decoded video PTS+median interval / decoded audio frame end;duplicates retained','fps':len(rows)/duration,'startMiddleEndMedianMs':windows,'addedDriftMs':windows[-1]-windows[0],'allFramePairMaxMs':max(abs(e) for _,e in values),'sourceCoverageMs':coverage,'maxContentClockMs':max(abs((code/30-12)/rate-r['ptsMs']/1000)*1000 for r in rows for code in r['codes']),'frozenMs':frozen,'captureMinusPtsBeforeSourceEndedRangeMs':[min(before),max(before)],'sourceBufferEnded':next(e for e in log['audio'] if e['kind']=='ended'),'cuePhases':phases,'tailPaints':log['paints'][-6:]}
    (folder/'phases.local.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ['cuePhases','tailPaints']},indent=2))

if __name__=='__main__':
    if sys.argv[1:]==['--selfcheck']:
        paints=[{'id':2,'codes':[360,360]},{'id':5,'codes':[361,360]}]
        rows=[{'id':5,'codes':[361,360],'ptsMs':0},{'id':2,'codes':[360,360],'ptsMs':20}]
        native=[{'id':2,'codes':[360,360],'captureTime':50},{'id':5,'codes':[361,360],'captureTime':70}]
        joined,report=join(rows,native,paints);assert joined[0]['native'][0]['captureTime']==70
        assert join(rows,native+[native[0]],paints)[0][1]['match']=='ambiguous'
        missing_rows,missing_report=join(rows,native[:1],paints);assert missing_rows[0]['match']=='missing' and missing_report['encodedWithoutNative']==[5]
        try:join(rows,[{'id':5,'codes':[360,360]}],paints)
        except AssertionError:pass
        else:raise AssertionError('wrong pixel pairing accepted')
        assert not pts_failures([{'pts':0},{'pts':1}]) and len(pts_failures([{'pts':0},{'pts':0},{'pts':-1}]))==2
        print('selfcheck: reordered identity;duplicates ambiguous;missing retained in rows AND summary;wrong-code rejected;repeated/decreasing PTS fails')
    elif sys.argv[1:2]==['--summarize']:summarize(Path(sys.argv[2]),Path(sys.argv[3]))
    else: analyze(Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]))
