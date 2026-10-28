"""用途：從實際三速度成檔驗自然音高、正確聲源及完整解碼。所在層：#11 獨立媒體量測。關聯：comparison-pitch.js。"""
import array
import hashlib
import json
import math
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
results = []
for rate in [0.5, 0.75, 1]:
    path = root / f'output/comparison/pitch-{rate}.mp4'
    data = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))
    audio = [stream for stream in data['streams'] if stream['codec_type'] == 'audio']
    assert len(audio) == 1 and abs(float(data['format']['duration']) - 3) <= 0.1, '音軌數或完整片長不符'
    # 整段影音先完整解碼，再從中段固定樣本量頻率；頻率分析不是聲畫同步的替代證據。
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-fps_mode', 'passthrough', '-enc_time_base:v', 'demux', '-f', 'null', '-'], check=True, capture_output=True)
    samples = array.array('f', subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-ss', '0.5', '-t', '1', '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']))
    def amplitude(frequency):
        real = sum(value * math.cos(2 * math.pi * frequency * i / 8000) for i, value in enumerate(samples))
        imag = sum(value * math.sin(2 * math.pi * frequency * i / 8000) for i, value in enumerate(samples))
        return 2 * math.hypot(real, imag) / len(samples)
    expected = 660 * rate
    frequencies = {frequency: amplitude(frequency) for frequency in set([expected, 660, 880])}
    assert frequencies[expected] > 0.025 and all(frequencies[expected] > 10 * value for frequency, value in frequencies.items() if frequency != expected), '自然音高或老師單一聲源不符'
    results.append({'rate': rate, 'expectedHz': expected, 'amplitudes': frequencies, 'fullDecode': True, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
print(json.dumps(results, indent=2))
