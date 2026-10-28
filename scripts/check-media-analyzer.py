"""用途：用已知 0／200ms 差驗證量測工具會抓錯。所在層：媒體工具自查。關聯：analyze-media.py。"""
import argparse
import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
folder = root / 'output/media-feasibility'
parser = argparse.ArgumentParser()
parser.add_argument('--case', choices=['all', 'aligned', 'shifted', 'audio-delay', 'audio-second-delay', 'audio-pts-delay', 'terminal-boundary', 'audio-gap', 'tail-freeze', 'slow-finalize', 'missing-timing'], default='all')
parser.add_argument('--label', default='', help='另存一輪工具自查，不覆寫舊證據')
args = parser.parse_args()
if args.label and not re.fullmatch('[a-z0-9-]+', args.label):
    parser.error('證據標籤只接受小寫英數與連字號。')
for case in (['aligned', 'shifted', 'audio-delay', 'audio-second-delay', 'audio-pts-delay', 'terminal-boundary', 'audio-gap', 'tail-freeze', 'slow-finalize', 'missing-timing'] if args.case == 'all' else [args.case]):
    shifted = case == 'shifted'
    name = f'analyzer-{args.label + "-" if args.label else ""}{case}'
    output = folder / f'{name}.mp4'
    duration = 15.034 if case == 'terminal-boundary' else 15
    # 延後右側六幀（30fps）是刻意放入的已知錯誤，不能只測工具自己產生的成功布林值。
    graph = (f'[0:v]split[l][r];[l]trim=duration={duration},setpts=PTS-STARTPTS,pad=640:720:0:204[l];'
             f'[r]trim=start={0.2 if shifted else 0}:duration={duration},setpts=PTS-STARTPTS,pad=640:720:0:204[r];'
             '[l][r]hstack[v]')
    if case == 'tail-freeze':
        # 最後八格維持同一畫面共 266.667ms，僅算到最後 PTS 會誤判成 233.333ms。
        tail = 'trim=end_frame=443,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=0.234,pad=640:720:0:204'
        graph = f'[0:v]split[l][r];[l]{tail}[l];[r]{tail}[r];[l][r]hstack[v]'
    delay = 1200 if case == 'audio-second-delay' else 200
    audio_filter = ['-af', f'adelay={delay}:all=1'] if case.startswith('audio-') else []
    # 邊界正例保留 B 的末格但只輸出 [A,B) 聲音；缺中段提示音仍必須失敗。
    if case == 'terminal-boundary': audio_filter = ['-af', 'atrim=duration=15']
    # volume 以音訊區塊取樣啟用條件，提前靜音才能涵蓋跨過第七秒的整個區塊。
    if case == 'audio-gap': audio_filter = ['-af', 'volume=0:enable=between(t\\,6.8\\,7.2)']
    # 只移動音軌 PTS、不在樣本中插入靜音，才能抓到 raw PCM 遺失時間原點的漏洞。
    if case == 'audio-pts-delay': audio_filter = ['-af', 'asetpts=PTS+0.2/TB']
    subprocess.run(['ffmpeg', '-v', 'error', '-n', '-i', str(folder / 'reference.mp4'), '-filter_complex', graph,
                    '-map', '[v]', '-map', '0:a', *audio_filter, '-t', str(duration), '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', str(output)], check=True)
    # 故意保留 15 秒 timeline 卻注入 100 秒完整流程，確認不是只拿播放迴圈當效能通過。
    record = {'name': name, 'takePath': 'output/media-feasibility/reference.mp4', 'outputPath': str(output.relative_to(root)),
              'exportReadyUpperBoundMs': 100000 if case == 'slow-finalize' else 15000,
              'diagnostics': {'export': {'elapsedMs': 15000, 'recipe': {'startMs': 0, 'endMs': 15000, 'rate': 1,
              'offsetMs': 0, 'selfDurationMs': 65000, 'referenceMirror': False, 'selfMirror': False}}}}
    if case == 'missing-timing': record.pop('exportReadyUpperBoundMs')
    path = folder / f'{name}.json'
    if path.exists():
        raise FileExistsError('拒絕覆寫既有自查證據')
    path.write_text(json.dumps(record))
    result = subprocess.run(['python3', 'scripts/analyze-media.py', str(path)], cwd=root, capture_output=True, text=True)
    should_pass = case in ['aligned', 'terminal-boundary']
    if result.returncode != int(not should_pass):
        raise RuntimeError(result.stdout + result.stderr)
    analysis = json.loads(result.stdout)
    if abs(analysis['recipeErrorStartMiddleEndMs'][1] - (-200 if shifted else 0)) > 2:
        raise RuntimeError('量測數字沒有回復已知偏移')
    if case in ['audio-delay', 'audio-second-delay'] and analysis['maximumFlashToAudioMs'] < delay - 10:
        raise RuntimeError('量測沒有抓到音訊延遲')
    if case == 'audio-pts-delay' and (analysis['audioStartTimeSeconds'] < 0.17 or analysis['maximumFlashToAudioMs'] < 190):
        raise RuntimeError('量測漏掉容器內的音軌 PTS 延遲')
    if case == 'slow-finalize' and analysis['fullExportUpperBoundMs'] != 100000:
        raise RuntimeError('量測沒有使用完整匯出時間')
    if case == 'missing-timing' and analysis['performanceVerified']:
        raise RuntimeError('只有播放迴圈時間卻聲稱完整效能已驗證')
    if case == 'terminal-boundary' and (analysis['referenceFlashCount'] != 15 or len(analysis['boundaryFlashPts']) != 1):
        raise RuntimeError('量測沒有分開合法區間與末格邊界')
    if case == 'audio-gap' and analysis['audioCountsMatch']:
        raise RuntimeError('量測漏掉中段缺音')
    if case == 'tail-freeze' and abs(analysis['maximumUnchangedSelfMs'] - 266.667) > 2:
        raise RuntimeError('量測沒有算入片尾最後一格的呈現時間')
    print(f'{name}: expected {"pass" if should_pass else "failure"}, measured {analysis["recipeErrorStartMiddleEndMs"]}, audio={analysis["maximumFlashToAudioMs"]}ms', flush=True)
