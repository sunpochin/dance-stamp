"""用途：製作有逐幀編號的合成測片。所在層：#3 驗證工具。關聯：analyze-media.py、MEDIA_PROBE.md。"""
import argparse
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--reference-only', action='store_true', help='只產生原65秒合成示範，不產生相機素材或設定檔')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
folder = root / 'output/media-feasibility'
folder.mkdir(parents=True, exist_ok=True)
reference = folder / 'reference.mp4'
camera = folder / 'camera.y4m'
# 高四位固定為 A，避免黑屏或錯誤取樣區域被當成有效時間碼。
filters = ['drawbox=x=80:y=40:w=480:h=48:color=black:t=fill',
           'drawbox=x=0:y=0:w=iw:h=30:color=white:t=fill:enable=lt(mod(t\\,1)\\,0.06)',
           'drawbox=x=0:y=100:w=32:h=200:color=red:t=fill',
           'drawbox=x=608:y=100:w=32:h=200:color=blue:t=fill']
filters += [f'drawbox=x={80 + bit * 30}:y=40:w=24:h=40:color=white:t=fill:enable=bitand(n+40960\\,{1 << bit})' for bit in range(16)]
subprocess.run(['ffmpeg', '-v', 'error', '-n', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=65',
                '-f', 'lavfi', '-i', 'aevalsrc=sin(2*PI*660*t)*lt(mod(t\\,1)\\,0.06):s=48000:d=65',
                '-vf', ','.join(filters), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-movflags', '+faststart', str(reference)], check=True)
# 影格恢復回歸只讀示範來源；保留同一測片，省去未使用的65秒相機大檔與設定檔。
if args.reference_only:
    print('已建立原65秒逐幀合成示範；未產生相機素材或瀏覽器設定。')
    raise SystemExit(0)
# 65 秒涵蓋單次 60 秒 take，避免短測片重複編號；相機模擬仍不代表硬體驗收。
subprocess.run(['ffmpeg', '-v', 'error', '-n', '-i', str(reference), '-an', '-pix_fmt', 'yuv420p',
                '-f', 'yuv4mpegpipe', str(camera)], check=True)
init = folder / 'synthetic-only.js'
init.write_text('window.__danceSyntheticCameraOnly = true;\n')
config = {'browser': {'browserName': 'chromium', 'isolated': True, 'initScript': [str(init)],
          'launchOptions': {'channel': 'chrome', 'headless': False, 'args': ['--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream', f'--use-file-for-fake-video-capture={camera}']},
          'contextOptions': {'viewport': {'width': 1280, 'height': 960}, 'acceptDownloads': True}}}
(folder / 'browser.json').write_text(json.dumps(config, indent=2))
print('已建立逐幀時間碼／閃光／660Hz 提示音與不循環合成相機；檔案只留 ignored output。')
