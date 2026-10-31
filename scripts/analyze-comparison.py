"""用途：獨立解碼 VS 的影格碼、鏡像與音軌；位於驗收工具層，關聯 comparison-matrix.js。"""
import array
import json
import math
from pathlib import Path
import statistics
import subprocess
import sys


def ffprobe(path, *args):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', *args, '-of', 'json', str(path)]))


def analyze(path):
    parts = path.stem.split('-')
    rate, requested = float(parts[1]), float(parts[2])
    silent, mirror = parts[3] == 'silent', parts[3] == 'mirror'
    info = ffprobe(path, '-show_streams', '-show_format')
    times = [float(f['best_effort_timestamp_time']) for f in ffprobe(path, '-select_streams', 'v', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time')['frames']]
    assert len(times) > 1 and all(a < b for a, b in zip(times, times[1:])), '成檔時間沒有嚴格前進'
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    audio_tracks = [s for s in info['streams'] if s['codec_type'] == 'audio']
    assert (video['width'], video['height']) == (1280, 720), '輸出尺寸錯誤'
    # 兩片均為 16:9，contain 後 y=204；取真正成檔像素，不讀瀏覽器診斷的漂移數字。
    # 保留 VFR 原始影格與高精度時間，避免分析工具自行補／丟幀或四捨五入出重複時間。
    proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(path), '-vf', 'crop=1280:360:0:204,scale=640:180', '-enc_time_base', '1:90000', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    frame_size, values, frame_codes = 640 * 180 * 3, [], []
    last, code_since, max_frozen, first_codes = [None, None], [0, 0], [0, 0], None
    for pts in times:
        frame = proc.stdout.read(frame_size)
        assert len(frame) == frame_size, '成檔未能完整解碼'
        codes = []
        for side in range(2):
            code = 0
            for bit in range(12):
                x = 17 + bit * 24
                if mirror:
                    x = 319 - x
                index = (75 * 640 + side * 320 + x) * 3
                if sum(frame[index:index + 3]) > 500:
                    code |= 1 << bit
            codes.append(code)
        if first_codes is None:
            first_codes = codes
        for side in range(2):
            max_frozen[side] = max(max_frozen[side], (pts - code_since[side]) * 1000)
            if codes[side] != last[side]:
                code_since[side] = pts
            last[side] = codes[side]
        values.append((pts, (codes[1] - codes[0]) / 30 / rate * 1000))
        frame_codes.append((pts, *codes))
    assert not proc.stdout.read(1) and proc.wait() == 0, '解碼影格數不一致'
    # Safari WebM 可缺容器片長；保留音軌 PTS，從完整解碼的尾端量長度，不拿要求秒數代填。
    pcm = array.array('h', subprocess.check_output(['ffmpeg', '-v', 'error', '-copyts', '-i', str(path), '-vn', '-ac', '1', '-af', 'aresample=8000:async=1:first_pts=0', '-f', 's16le', '-'])) if audio_tracks else array.array('h')
    video_end = times[-1] + statistics.median(b - a for a, b in zip(times, times[1:]))
    duration = float(info['format']['duration']) if info['format'].get('duration') else max(video_end, len(pcm) / 8000)
    # 沿 v5 核對完整來源覆蓋；兩側一起截短或重播時，互相比較仍可能看似同步。
    coverage = [(frame_codes[0][side] / 30 - 12) / rate * 1000 for side in [1, 2]] + [((frame_codes[-1][side] + 1) / 30 - (12 + rate * requested)) / rate * 1000 for side in [1, 2]]
    content_clock = max(abs((code / 30 - 12) / rate - (stamp - times[0])) * 1000 for stamp, *codes in frame_codes for code in codes)
    assert abs(duration - requested) <= 0.1 and max(map(abs, coverage)) <= 100, 'v5完整片長或來源起末覆蓋不符'
    assert content_clock <= 250, 'v5兩側來源時間碼對輸出時鐘不符'
    for side in range(2):
        max_frozen[side] = max(max_frozen[side], (float(video.get('duration', duration)) - code_since[side]) * 1000)
    windows = [statistics.median([d for t, d in values if max(0, target - 0.5) <= t <= target + 0.5]) for target in [0.5, requested / 2, requested - 0.5]]
    assert max(map(abs, windows)) <= 100, f'起中末不同步：{windows}'
    assert abs(windows[2] - windows[0]) <= 100, f'累積漂移：{windows}'
    # 另讀真正首末幀及指定時刻；附近中位數不能掩蓋邊界幀的偏移。
    points = [min(values, key=lambda value: abs(value[0] - target)) for target in [times[0], 1, requested / 2, requested - 1, times[-1]]]
    assert max(abs(error) for _, error in points) <= 100, f'首末幀或指定時刻不同步：{points}'
    edge_drift = points[-1][1] - points[0][1]
    assert abs(edge_drift) <= 100, f'首末新增漂移：{edge_drift}'
    assert abs(first_codes[0] / 30 - 12) / rate * 1000 <= 100, '兩片雖同步但沒有從所選起點開始'
    assert len(times) / duration >= 24, '平均 fps 不足'
    freeze_ms = max(max_frozen)
    assert freeze_ms <= 250, f'成檔影格凍結 {freeze_ms}ms'
    # 沿現行 comparison-pitch 的自然變調：慢速須是 660×rate，不能接受舊的固定 660Hz。
    assert len(audio_tracks) <= 1 and (silent or len(audio_tracks) == 1), '輸出音軌數不正確'
    rms = math.sqrt(sum((s / 32768) ** 2 for s in pcm) / len(pcm)) if pcm else 0
    expected_hz = 660 * rate
    amplitudes = {frequency: abs(sum((sample / 32768) * complex(math.cos(2 * math.pi * frequency * i / 8000), math.sin(2 * math.pi * frequency * i / 8000)) for i, sample in enumerate(pcm))) / max(1, len(pcm)) for frequency in {expected_hz, 660, 880}}
    if silent:
        assert rms < 0.001, f'無聲來源被混入聲音：{rms}'
    else:
        # 本工具的單邊頻譜幅度是 comparison-pitch 峰值的一半；同一 0.025 峰值下限不變。
        assert rms > 0.01 and amplitudes[expected_hz] > 0.0125 and all(amplitudes[expected_hz] > value * 10 for hz, value in amplitudes.items() if hz != expected_hz), f'音訊不正確：{rms}, {amplitudes}'
    return {'file': path.name, 'frames': len(times), 'duration': duration, 'durationBasis': 'format' if info['format'].get('duration') else 'decoded-pts-pcm', 'sourceCoverageErrorMs': coverage, 'maximumContentClockMs': content_clock, 'fullFramePairErrorMs': max(abs(error) for _, error in values), 'fps': round(len(times) / duration, 2), 'startMiddleEndMs': windows, 'addedDriftMs': windows[2] - windows[0], 'firstAndLastFramePoints': points, 'firstToLastDriftMs': edge_drift, 'maxFrozenMs': round(freeze_ms, 2), 'audioRms': round(rms, 5), 'expectedSourceHz': expected_hz, 'sourceAmplitude': amplitudes[expected_hz], 'source660Hz': amplitudes[660], 'self880Hz': amplitudes[880], 'mirror': mirror, 'silent': silent}


if __name__ == '__main__':
    paths = [Path(p) for p in sys.argv[1:]] or sorted(Path('output/comparison').glob('vs-*.mp4'))
    assert paths, '沒有待驗證的下載影片'
    for path in paths:
        print(json.dumps(analyze(path)), flush=True)
