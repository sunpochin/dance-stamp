"""用途：用已知 0／200ms 差驗證量測工具會抓錯。所在層：媒體工具自查。關聯：analyze-media.py。"""
import argparse
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
folder = root / 'output/media-feasibility'
parser = argparse.ArgumentParser()
parser.add_argument('--case', choices=['all', 'aligned', 'shifted', 'audio-delay', 'audio-second-delay'], default='all')
args = parser.parse_args()
for case in (['aligned', 'shifted', 'audio-delay', 'audio-second-delay'] if args.case == 'all' else [args.case]):
    shifted = case == 'shifted'
    name = f'analyzer-{case}'
    output = folder / f'{name}.mp4'
    # 延後右側六幀（30fps）是刻意放入的已知錯誤，不能只測工具自己產生的成功布林值。
    graph = ('[0:v]split[l][r];[l]trim=duration=15,setpts=PTS-STARTPTS,pad=640:720:0:204[l];'
             f'[r]trim=start={0.2 if shifted else 0}:duration=15,setpts=PTS-STARTPTS,pad=640:720:0:204[r];'
             '[l][r]hstack[v]')
    delay = 1200 if case == 'audio-second-delay' else 200
    audio_filter = ['-af', f'adelay={delay}:all=1'] if case.startswith('audio-') else []
    subprocess.run(['ffmpeg', '-v', 'error', '-n', '-i', str(folder / 'reference.mp4'), '-filter_complex', graph,
                    '-map', '[v]', '-map', '0:a', *audio_filter, '-t', '15', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', str(output)], check=True)
    record = {'name': name, 'takePath': 'output/media-feasibility/reference.mp4', 'outputPath': str(output.relative_to(root)),
              'diagnostics': {'export': {'elapsedMs': 15000, 'recipe': {'startMs': 0, 'endMs': 15000, 'rate': 1,
              'offsetMs': 0, 'selfDurationMs': 65000, 'referenceMirror': False, 'selfMirror': False}}}}
    path = folder / f'{name}.json'
    if path.exists():
        raise FileExistsError('拒絕覆寫既有自查證據')
    path.write_text(json.dumps(record))
    result = subprocess.run(['python3', 'scripts/analyze-media.py', str(path)], cwd=root, capture_output=True, text=True)
    if result.returncode != int(case != 'aligned'):
        raise RuntimeError(result.stdout + result.stderr)
    analysis = json.loads(result.stdout)
    if abs(analysis['recipeErrorStartMiddleEndMs'][1] - (-200 if shifted else 0)) > 2:
        raise RuntimeError('量測數字沒有回復已知偏移')
    if case.startswith('audio-') and analysis['maximumFlashToAudioMs'] < delay - 10:
        raise RuntimeError('量測沒有抓到音訊延遲')
    print(f'{name}: expected {"pass" if case == "aligned" else "failure"}, measured {analysis["recipeErrorStartMiddleEndMs"]}, audio={analysis["maximumFlashToAudioMs"]}ms', flush=True)
