"""用途：從 #11 真正下載檔核對容器、全身 fit、鏡像、聲源與失敗前後 bytes。所在層：獨立驗收工具；關聯 export-failure.js。"""
import array
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tones(path):
    sound = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    assert not sound.stderr, '音訊解碼錯誤'
    pcm = array.array('h', sound.stdout)
    return [abs(sum(sample / 32768 * complex(math.cos(2 * math.pi * frequency * i / 8000), math.sin(2 * math.pi * frequency * i / 8000)) for i, sample in enumerate(pcm))) / max(1, len(pcm)) for frequency in [660, 880]]


def analyze(path, source_level):
    info = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))
    video = [s for s in info['streams'] if s['codec_type'] == 'video']
    audio = [s for s in info['streams'] if s['codec_type'] == 'audio']
    assert len(video) == len(audio) == 1, '須各一條視訊／音訊軌'
    assert (video[0]['width'], video[0]['height']) == (1280, 720), '尺寸錯誤'
    assert ('mp4' if path.suffix == '.mp4' else 'webm') in info['format']['format_name'], '副檔名不符真正容器'
    times = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time,duration_time,pkt_duration_time', '-of', 'json', str(path)]))['frames']
    pts = [float(f['best_effort_timestamp_time']) for f in times]
    assert len(pts) > 1 and all(a < b for a, b in zip(pts, pts[1:])), '影格時間未前進'
    # 即時 WebM 可沒有容器 duration；用真正最後影格的時間與時長，不能拿預期三秒補值。
    last_duration = float(times[-1].get('duration_time', times[-1].get('pkt_duration_time', 0)))
    duration = pts[-1] + last_duration - pts[0]
    assert last_duration > 0 and abs(duration - 3) <= 0.3, '輸出長度錯誤'
    if 'duration' in info['format']:
        assert abs(float(info['format']['duration']) - 3) <= 0.3, '容器長度錯誤'
    # 真正讀完每一影格；靜態邊界片只驗 fit，不能冒充凍結／同步量測。
    decoded = subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-i', str(path), '-vf', 'scale=640:360', '-threads', '1', '-enc_time_base', '1:90000', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    assert not decoded.stderr and len(decoded.stdout) == len(pts) * 640 * 360 * 3, '全片解碼不完整'
    samples = [(320, 214, (255, 255, 255)), (320, 553, (255, 0, 0)), (960, 58, (0, 255, 0)), (960, 710, (0, 0, 255)), (778, 384, (255, 0, 255)), (1142, 384, (255, 255, 0)), (700, 384, (8, 12, 14)), (1200, 384, (8, 12, 14))]
    for offset in range(0, len(decoded.stdout), 640 * 360 * 3):
        for x, y, expected in samples:
            index = offset + (y // 2 * 640 + x // 2) * 3
            pixel = decoded.stdout[index:index + 3]
            assert all(abs(a - b) <= 50 for a, b in zip(pixel, expected)), f'全身邊界／鏡像／留邊錯誤：{x},{y} {list(pixel)}'
    amplitudes = tones(path)
    assert amplitudes[0] > 0.01 and amplitudes[0] > amplitudes[1] * 10, '老師聲源缺少或混入自拍聲音'
    # 一條音軌仍可能把同一老師重複加總；定音量合成片另與原片比較，抓出兩倍增益。
    gain = amplitudes[0] / source_level
    assert 0.8 <= gain <= 1.2, '老師音訊增益異常，可能重複混入'
    return {'file': path.name, 'sha256': digest(path), 'videoCodec': video[0]['codec_name'], 'audioCodec': audio[0]['codec_name'], 'frames': len(pts), 'decodedVideoDuration': duration, 'containerDuration': info['format'].get('duration'), 'source660Hz': amplitudes[0], 'self880Hz': amplitudes[1], 'sourceGain': gain, 'allFramesFitAndMirror': True}


def main():
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else 'output/export-failure')
    baseline = folder / 'baseline.mp4'
    for mode in ['unavailable', 'encoder', 'readback', 'cancel-readback']:
        assert digest(folder / f'preserved-{mode}.mp4') == digest(baseline), f'{mode} 改動舊 VS'
    originals = {}
    for name in ['reference', 'self']:
        originals[name] = digest(folder / f'{name}.mp4')
        assert digest(folder / f'{name}-before.mp4') == digest(folder / f'{name}-after.mp4') == originals[name], '原片 bytes 改動'
    source_level = tones(folder / 'reference.mp4')[0]
    assert source_level > 0.01, '老師測片缺少已知聲源'
    print(json.dumps({'artifacts': [analyze(baseline, source_level), analyze(folder / 'retry.webm', source_level)], 'preservedVsCopies': 4, 'originalSha256': originals}, ensure_ascii=False))


if __name__ == '__main__':
    main()
