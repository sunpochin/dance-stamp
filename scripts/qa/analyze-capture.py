"""用途：獨立解碼同串流原下載並配對實際像素／metadata；層：本機QA；關聯：capture-content.html、RECORD_COMPARE.md。"""
import array
import hashlib
import json
import math
import re
import subprocess
import sys
import zlib
from pathlib import Path
from collections import Counter

folder = None

def crc16(value):
    crc = 65535
    for byte in (value & 255, value >> 8):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 65535 if crc & 0x8000 else (crc << 1) & 65535
    return crc

def decode(raw):
    assert len(raw) == 640 * 240
    words = []
    for word in range(4):
        value = 0
        for bit in range(16):
            # 只讀每格中心，模糊或反碼／CRC不符便拒絕，不能猜最近序號。
            patch = [raw[y*640+x] for y in range(44+word*40,52+word*40) for x in range(bit*40+16,bit*40+24)]
            level = sum(patch)/len(patch)
            assert level < 70 or level > 185, ('ambiguous',word,bit,level)
            value |= int(level > 185) << bit
        words.append(value)
    assert words[0] == 0xa55a and words[2] == (words[1]^65535) and words[3] == crc16(words[1]), words
    flash = sum(raw[4*640:12*640])/(8*640)>185
    return words[1],flash

def mapping(rows, paints, stop):
    assert len({p['id'] for p in paints}) == len(paints)
    lookup = {p['id']:(p,paints[i+1]['end'] if i+1<len(paints) else stop) for i,p in enumerate(paints)}
    intervals=[]
    for row in rows:
        p,end=lookup[row['id']]
        row.update(paintBegin=p['begin'],paintEnd=p['end'],replacementEnd=end,offsetLower=p['begin']-row['ptsMs'],offsetUpper=None if end is None else end-row['ptsMs'])
        intervals.append((row['offsetLower'],row['offsetUpper']))
    lower=max(x[0] for x in intervals);upper=min(x[1] for x in intervals if x[1] is not None)
    return {'lowerMs':lower,'upperMs':upper,'nonempty':lower<=upper,'gapMs':max(0,lower-upper),'meaning':'conditional constant PTS-to-paint-clock offset only;origin,captureTime,queue and drift NOT measured'}

def run(command,input=None):
    result=subprocess.run(command,input=input,capture_output=True,timeout=30)
    assert result.returncode==0,(command,result.returncode,result.stderr.decode(errors='replace'))
    return result

def analyze(name,path):
    log=json.loads((folder/'content.local.json').read_text())
    log.update(log['media'])
    data=path.read_bytes();assert hashlib.sha256(data).hexdigest()==log['sha256']
    assert data==(folder/'content.receipt.webm').read_bytes(),'download != local recorder receipt'
    assert log['firstError'] is None and not log['cleanupErrors'] and all(t['state']=='ended' for t in log['tracks']) and log['audioState']=='closed' and log['hardwareCalls']==0
    assert all(x['state']=='visible' for x in log['visibility'])
    complete=run(['ffmpeg','-v','error','-xerror','-i',str(path),'-fps_mode','passthrough','-enc_time_base','demux','-f','null','-'])
    assert not complete.stderr
    meta=run(['ffprobe','-v','error','-show_streams','-show_frames','-show_packets','-of','json',str(path)])
    (folder/(name+'.probe.json')).write_bytes(meta.stdout)
    info=json.loads(meta.stdout);video=next(s for s in info['streams'] if s['codec_type']=='video');vi=video['index']
    # 不假定容器的stream編號，也不把requestFrame序號配給第N個編碼包。
    frames=[x for x in info['packets_and_frames'] if x['type']=='frame' and x['stream_index']==vi]
    packets={x['pos']:x for x in info['packets_and_frames'] if x['type']=='packet' and x['stream_index']==vi}
    result=run(['ffmpeg','-v','info','-copyts','-i',str(path),'-map','0:v:0','-vf','format=gray,showinfo','-fps_mode','passthrough','-enc_time_base','demux','-pix_fmt','gray','-f','rawvideo','-'])
    (folder/(name+'.decode.stderr.txt')).write_bytes(result.stderr)
    details=re.findall(r'n:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:([^ ]+).*?checksum:([0-9A-F]+)',result.stderr.decode())
    raw=result.stdout;size=640*240;assert len(raw)==len(frames)*size==len(details)*size
    num,den=map(int,video['time_base'].split('/'));rows=[]
    for i,(frame,detail) in enumerate(zip(frames,details)):
        pixels=raw[i*size:(i+1)*size]
        assert int(detail[0])==i and int(detail[1])==frame['pts']==frame['best_effort_timestamp']
        assert zlib.adler32(pixels,0)==int(detail[3],16),'raw frame checksum != same-decode showinfo'
        packet=packets[frame['pkt_pos']];assert packet['pts']==frame['pts']
        code,flash=decode(pixels)
        rows.append({'id':code,'flash':flash,'pts':frame['pts'],'ptsMs':frame['pts']*num/den*1000,'packetPos':frame['pkt_pos'],'packetDts':packet.get('dts'),'checksum':detail[3]})
    assert all(a['pts']<b['pts'] for a,b in zip(rows,rows[1:]))
    bounds=mapping(rows,log['paintLog'],None)
    counts=Counter(r['id'] for r in rows);observed=set(counts);painted={p['id'] for p in log['paintLog']}
    flashes=[r['ptsMs'] for i,r in enumerate(rows) if r['flash'] and (i==0 or not rows[i-1]['flash'])]
    audio=[]
    if True:
        pcm=run(['ffmpeg','-v','error','-copyts','-i',str(path),'-vn','-ac','1','-af','aresample=8000:async=1:first_pts=0','-f','f32le','-']).stdout
        samples=array.array('f',pcm);was=False
        for pos in range(0,len(samples),80):
            block=samples[pos:pos+80];loud=math.sqrt(sum(v*v for v in block)/len(block))>.03
            if loud and not was:audio.append(pos/8)
            was=loud
        assert len(audio)==len(flashes)==3,(audio,flashes)
    errors=[a-v for a,v in zip(audio,flashes)]
    native=[]
    for item in log['captureMetadata']:
        assert not item.get('error'), item
        png=__import__('base64').b64decode(item['pixels']['png'].split(',',1)[1])
        image=run(['ffmpeg','-v','error','-i','pipe:0','-pix_fmt','gray','-f','rawvideo','pipe:1'],png).stdout
        code,flash=decode(image)
        assert code==item['pixels']['id'] and flash==item['pixels']['flash']
        fields=item['metadata']['fields'];capture=fields['captureTime']['value']
        assert fields['captureTime']['type']=='number' and isinstance(capture,(int,float)) and capture>0
        matches=[r for r in rows if r['id']==code]
        paint=next(p for p in log['paintLog'] if p['id']==code)
        native.append({'id':code,'captureTime':capture,'mediaTime':fields.get('mediaTime'),'presentationTime':fields.get('presentationTime'),'presentedFrames':fields.get('presentedFrames'),'callbackNow':item['callbackNow'],'entered':item['entered'],'exited':item['exited'],'pixelBefore':item['pixels']['before'],'pixelAfter':item['pixels']['after'],'paintBegin':paint['begin'],'paintEnd':paint['end'],'encodedPtsMs':[r['ptsMs'] for r in matches],'captureMinusPaintBegin':capture-paint['begin'],'captureMinusEncodedPtsMs':[capture-r['ptsMs'] for r in matches]})
    assert all(a['captureTime']<b['captureTime'] for a,b in zip(native,native[1:]))
    (folder/'content.native-pairing.local.json').write_text(json.dumps(native,indent=2))
    summary={'name':name,'sha256':log['sha256'],'bytes':len(data),'paintCount':len(painted),'requestCount':len(log['requests']),'decodedFrames':len(rows),'observedUnique':len(observed),'unobservedPaintIds':sorted(painted-observed),'repeatedEncodedIds':{str(k):v for k,v in counts.items() if v>1},'decreasingContentSteps':sum(a['id']>b['id'] for a,b in zip(rows,rows[1:])),'packetDtsEqualsPts':all(r['packetDts']==r['pts'] for r in rows),'constantOffsetBounds':bounds,'flashPtsMs':flashes,'audioOnsetMs':audio,'audioMinusVideoMs':errors,'original100msPass':max(map(abs,errors))<=100 if errors else None,'fullDecode':'exit0;empty stderr','rawAndPtsBinding':'same-decode showinfo checksum+pts;ffprobe frame/packet pos+pts exact','nativeCallbacks':len(native),'nativePixelUnique':len(set(x['id'] for x in native)),'nativeIdsAbsentFromEncoded':sorted({x['id'] for x in native}-observed),'encodedIdsAbsentFromCallbacks':sorted(observed-{x['id'] for x in native}),'captureMinusPaintBeginRangeMs':[min(x['captureMinusPaintBegin'] for x in native),max(x['captureMinusPaintBegin'] for x in native)] if native else None,'captureMinusEncodedPtsRangeMs':[min(v for x in native for v in x['captureMinusEncodedPtsMs']),max(v for x in native for v in x['captureMinusEncodedPtsMs'])] if any(x['captureMinusEncodedPtsMs'] for x in native) else None,'captureTime':'raw native, matched by observed pixel value only; metadata/pixel non-atomic; no calibrated physical clock bound','worker':'not used'}
    (folder/(name+'.frames.local.json')).write_text(json.dumps(rows,indent=2));(folder/(name+'.summary.local.json')).write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))

if __name__ == '__main__' and sys.argv[1:] == ['--selfcheck']:
    raw=bytearray(640*240)
    for w,value in enumerate([0xa55a,17,17^65535,crc16(17)]):
        for bit in range(16):
            if value>>bit&1:
                for y in range(32+w*40,64+w*40):raw[y*640+bit*40:y*640+(bit+1)*40]=bytes([255])*40
    assert decode(raw)==(17,False)
    raw[44*640+16:52*640+24]=bytes(len(raw[44*640+16:52*640+24]))
    try:decode(raw)
    except AssertionError:pass
    else:raise AssertionError('corrupt code accepted')
    p=[{'id':0,'begin':100,'end':101},{'id':1,'begin':120,'end':121},{'id':2,'begin':140,'end':141}]
    assert mapping([{'id':0,'ptsMs':0},{'id':1,'ptsMs':20}],p,160)['nonempty']
    assert not mapping([{'id':0,'ptsMs':0},{'id':2,'ptsMs':200}],p,160)['nonempty']
    print('selfcheck pass: code;corruption rejected;content mapping;empty intersection retained')
elif __name__ == '__main__':
    folder = Path(sys.argv[1]).resolve()
    analyze('content',Path(sys.argv[2]))
