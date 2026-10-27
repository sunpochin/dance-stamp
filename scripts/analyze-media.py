"""用途：獨立解碼 #3 的原片及 VS，量測逐幀配方誤差與聲畫。所在層：驗收工具。關聯：make-sync-fixtures.py。"""
import argparse
import array
import json
import math
import statistics
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('record', type=Path)
parser.add_argument('--report', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
record = json.loads(args.record.read_text())

def run(command):
    return subprocess.run(command, cwd=root, check=True, capture_output=True).stdout

def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))

def frames(path, output=False, mirrored=(False, False)):
    data = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_frames',
                          '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', str(path)]))
    pts = [float(frame['best_effort_timestamp_time']) for frame in data['frames']]
    filter_graph = ('[0:v]split[l][r];[l]crop=480:40:80:244,scale=16:1:flags=neighbor[l];'
                    '[r]crop=480:40:720:244,scale=16:1:flags=neighbor[r];[l][r]hstack,format=gray' if output
                    else 'crop=480:40:80:40,scale=16:1:flags=neighbor,format=gray')
    pixels = run(['ffmpeg', '-v', 'error', '-i', str(path), '-vf' if not output else '-filter_complex',
                  filter_graph, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
    width = 32 if output else 16
    if len(pixels) != len(pts) * width:
        raise ValueError('獨立解碼影格數與時間戳不一致')
    decoded = []
    for i, timestamp in enumerate(pts):
        row = pixels[i * width:(i + 1) * width]
        values = []
        for side in range(width // 16):
            cells = row[side * 16:(side + 1) * 16]
            if mirrored[side]:
                cells = cells[::-1]
            if any(80 < cell < 160 for cell in cells):
                raise ValueError(f'第 {i} 幀時間碼模糊，不能猜測同步')
            value = sum((cell >= 160) << bit for bit, cell in enumerate(cells))
            if value >> 12 != 0xA:
                raise ValueError(f'第 {i} 幀時間碼無效，請確認尺寸／鏡像／黑屏')
            values.append(value & 4095)
        decoded.append((timestamp, *values))
    return decoded

take = root / record['takePath']
output = root / record['outputPath']
take_info, output_info = probe(take), probe(output)
for path in [take, output]:
    # metadata 與首幀可讀仍可能有後段損壞，完整解碼才記為成檔證據。
    run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'])
take_frames = frames(take)
recipe = record['diagnostics']['export']['recipe']
output_frames = frames(output, True, (recipe['referenceMirror'], recipe['selfMirror']))
lookup = {}
for pts, code in take_frames:
    lookup.setdefault(code, []).append(pts)
rate = recipe['rate']
start, offset = recipe['startMs'] / 1000, recipe['offsetMs'] / 1000
errors, reference_flashes, frozen, self_frozen = [], [], [], []
last_code, last_self_code = None, None
hold_start = self_hold_start = output_frames[0][0]
for pts, reference_code, camera_code in output_frames:
    if camera_code not in lookup:
        raise ValueError('VS 時間碼找不到對應的自拍原片影格')
    self_time = statistics.median(lookup[camera_code])
    # 量測的是「成檔對配方」誤差；模擬相機沒有實體光學時鐘，不能冒充硬體 G2。
    errors.append((pts, ((reference_code / 30 - start) / rate - (self_time - offset)) * 1000))
    if reference_code != last_code:
        frozen.append((pts - hold_start) * 1000)
        hold_start = pts
        if reference_code % 30 <= 2 and (last_code is None or reference_code // 30 != last_code // 30):
            reference_flashes.append(pts)
    last_code = reference_code
    if camera_code != last_self_code:
        self_frozen.append((pts - self_hold_start) * 1000)
        self_hold_start = pts
    last_self_code = camera_code
frozen.append((output_frames[-1][0] - hold_start) * 1000)
self_frozen.append((output_frames[-1][0] - self_hold_start) * 1000)

samples = array.array('f', run(['ffmpeg', '-v', 'error', '-i', str(output), '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']))
audio_onsets, was_loud = [], False
for position in range(0, len(samples), 80):
    block = samples[position:position + 80]
    loud = math.sqrt(sum(value * value for value in block) / len(block)) > 0.03
    if loud and not was_loud:
        audio_onsets.append(position / 8000)
    was_loud = loud
grouped_onsets = []
for onset in audio_onsets:
    # 慢速音高修正可能把同一短音切成數個 RMS 脈衝；先合併，再按次序比對，避免最近點掩蓋整秒延遲。
    if not grouped_onsets or onset - grouped_onsets[-1] >= 0.25 / rate:
        grouped_onsets.append(onset)
audio_errors = [(audio - visual) * 1000 for visual, audio in zip(reference_flashes, grouped_onsets)]
audio_counts_match = len(reference_flashes) == len(grouped_onsets)
frame_interval = statistics.median(right[0] - left[0] for left, right in zip(output_frames, output_frames[1:]))
# 即時 WebM 不一定寫入 Duration；從完整解碼的影音尾端計算，不採用產品自己的長度聲稱。
container_duration = output_info['format'].get('duration')
duration = float(container_duration) if container_duration else max(output_frames[-1][0] + frame_interval,
    len(samples) / 8000 + float(next(stream for stream in output_info['streams'] if stream['codec_type'] == 'audio').get('start_time', 0)))
checkpoints = []
for fraction in [0, 0.5, 1]:
    target = output_frames[-1][0] * fraction
    _, error = min(errors, key=lambda pair: abs(pair[0] - target))
    checkpoints.append(round(error, 3))
video = next(stream for stream in output_info['streams'] if stream['codec_type'] == 'video')
video_span = output_frames[-1][0] - output_frames[0][0] + frame_interval
# 整檔平均把音訊尾塊／起始等待也算進去，避免只算活躍視訊區間而高估輸出品質。
average_fps = len(output_frames) / duration
audio_streams = [stream for stream in output_info['streams'] if stream['codec_type'] == 'audio']
container = output_info['format']['format_name'].split(',')
extension_matches = output.suffix == ('.mp4' if 'mp4' in container else '.webm' if 'webm' in container else '')
drift = checkpoints[-1] - checkpoints[0]
result = {'name': record['name'], 'scope': 'synthetic encoded-file recipe validation, not physical-camera G2',
          'durationSeconds': duration, 'width': video['width'], 'height': video['height'], 'codec': video['codec_name'],
          'durationSource': 'container' if container_duration else 'decoded audio/video end',
          'audioCodecs': [stream['codec_name'] for stream in audio_streams], 'averageFps': round(average_fps, 3),
          'presentedVideoFps': round(len(output_frames) / video_span, 3),
          'container': ','.join(container), 'extensionMatches': extension_matches,
          'takeAudioTracks': sum(stream['codec_type'] == 'audio' for stream in take_info['streams']),
          'decodedFrames': len(output_frames), 'recipeErrorStartMiddleEndMs': checkpoints,
          'addedDriftMs': round(drift, 3), 'maximumRecipeErrorMs': round(max(abs(error) for _, error in errors), 3),
          'maximumUnchangedReferenceMs': round(max(frozen), 3), 'audioPulseCount': len(grouped_onsets),
          'maximumUnchangedSelfMs': round(max(self_frozen), 3),
          'referenceFlashCount': len(reference_flashes), 'audioCountsMatch': audio_counts_match,
          'maximumFlashToAudioMs': round(max(abs(error) for error in audio_errors), 3) if audio_errors else None,
          'exportElapsedMs': record['diagnostics']['export']['elapsedMs'], 'fullDecode': True}
result['withinSyntheticTargets'] = (all(abs(error) <= 100 for error in checkpoints) and abs(drift) <= 100
    and average_fps >= 24 and max(frozen) <= 250 and max(self_frozen) <= 250
    and len(audio_streams) == 1 and bool(audio_errors) and extension_matches
    and audio_counts_match and max(abs(error) for error in audio_errors) <= 100
    and record['diagnostics']['export']['elapsedMs'] <= 90_000)
destination = args.report or args.record.with_name(args.record.stem + '-analysis.json')
if destination.exists():
    raise FileExistsError('拒絕覆寫既有量測證據')
destination.write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
sys.exit(0 if result['withinSyntheticTargets'] else 1)
