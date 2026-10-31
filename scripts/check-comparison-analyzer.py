"""用途：用已知正負成檔檢查雙片量測入口。所在層：媒體工具自查。關聯：analyze-comparison.py、#11。"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[1]
folder = root / 'output' / f'comparison-analyzer-{time.time_ns()}'
folder.mkdir(parents=True, exist_ok=False)
results = []
# 直接編入已知來源碼與聲源；這是量尺的正負控制，不是產品匯出或裝置驗收。
cases = [
    ('webm', 1, 'single', 660, 0, False, 3, True),
    ('mp4', 1, 'single', 660, 0, False, 3, True),
    ('slow075', 0.75, 'single', 495, 0, False, 3, True),
    ('slow05', 0.5, 'single', 330, 0, False, 3, True),
    ('silent', 1, 'silent', None, 0, False, 3, True),
    ('mirror', 1, 'mirror', 660, 0, False, 3, True),
    ('self-ahead', 1, 'single', 660, 30, False, 3, False),
    ('wrong-source', 1, 'single', 880, 0, False, 3, False),
    ('old-pitch', 0.5, 'single', 660, 0, False, 3, False),
    ('truncated', 1, 'single', 660, 0, False, 2, False),
    ('both-repeated', 1, 'single', 660, 0, True, 3, False),
]
for name, rate, mode, tone, offset, repeated, seconds, should_pass in cases:
    directory = folder / name
    directory.mkdir()
    path = directory / f'vs-{rate}-3-{mode}.{"mp4" if name == "mp4" else "webm"}'
    graph = []
    for side in range(2):
        counter = 'mod(n,30)' if repeated else 'n'
        code = f'360+floor({counter}*{rate})+{offset if side else 0}'
        boxes = [f"drawbox=x={16 + bit * 48}:y=304:w=36:h=100:color=white:t=fill:enable='bitand({code},{2 ** bit})'" for bit in range(12)]
        graph.append(f'[{side}:v]' + ','.join(boxes + (['hflip'] if mode == 'mirror' else [])) + f'[v{side}]')
    graph.append('[v0][v1]hstack[v]')
    command = ['ffmpeg', '-v', 'error', '-n']
    for _ in range(2):
        command += ['-f', 'lavfi', '-i', f'color=c=0x101820:s=640x720:r=30:d={seconds}']
    if tone is not None:
        command += ['-f', 'lavfi', '-i', f'sine=frequency={tone}:sample_rate=48000:duration={seconds}']
    command += ['-filter_complex', ';'.join(graph), '-map', '[v]']
    if tone is not None:
        command += ['-map', '2:a']
    if path.suffix == '.mp4':
        command += ['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac']
    else:
        # live WebM 刻意省略容器 duration，才能真正覆蓋 Safari 的原始崩潰入口。
        command += ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '1M', '-c:a', 'libopus', '-live', '1']
    subprocess.run(command + ['-t', str(seconds), str(path)], check=True, capture_output=True)
    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(path)]))
    if path.suffix == '.webm':
        assert not info['format'].get('duration'), '控制檔意外帶有容器片長'
    result = subprocess.run([sys.executable, str(root / 'scripts/analyze-comparison.py'), str(path)], capture_output=True, text=True)
    (directory / 'stdout.local.txt').write_text(result.stdout)
    (directory / 'stderr.local.txt').write_text(result.stderr)
    assert (result.returncode == 0) == should_pass, f'{name}: {result.stdout}{result.stderr}'
    if should_pass:
        assert not result.stderr
    else:
        expected = '音訊不正確' if name in ('wrong-source', 'old-pitch') else '來源起末覆蓋不符'
        assert expected in result.stderr, f'{name} 未在預期護欄拒絕：{result.stderr}'
    results.append({'name': name, 'expectedPass': should_pass, 'exit': result.returncode, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'metrics': json.loads(result.stdout) if should_pass else None})
    print(f'{name}: expected {"pass" if should_pass else "reject"}, exit {result.returncode}', flush=True)
(folder / 'results.local.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(f'已保存 {len(results)} 組量尺控制：{folder.relative_to(root)}')
