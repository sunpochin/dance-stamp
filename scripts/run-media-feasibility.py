"""用途：循序執行 #3 錄影矩陣，保留每段原片／VS。所在層：驗收工具。關聯：media-feasibility.js。"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--cli', required=True)
parser.add_argument('--url', default='http://127.0.0.1:42833')
parser.add_argument('--session', default='dance-issue3')
parser.add_argument('--mode', choices=['smoke', 'matrix', 'stability', 'webm', 'alignment', 'performance', 'recovery'], default='smoke')
parser.add_argument('--label', default='', help='不同版本的證據名稱，不覆寫上一輪')
parser.add_argument('--rate', type=float, choices=[0.5, 0.75, 1], default=1, help='smoke／performance 的速度')
parser.add_argument('--analyze', action='store_true', help='每段立即完整解碼，品質門檻未過就停止')
parser.add_argument('--allow-dirty', action='store_true', help='僅實驗允許未提交來源；紀錄仍標示 sourceDirty，不算該 Git head 的正式證據')
parser.add_argument('--start-index', type=int, default=1, help='保留既有證據，從尚未執行的矩陣編號繼續')
args = parser.parse_args()
if args.label and not re.fullmatch('[a-z0-9-]+', args.label):
    parser.error('證據標籤只接受小寫英數與連字號。')
if args.start_index < 1:
    parser.error('起始編號必須大於零。')
# 十輪必須連續，不允許拿不同批次的成功輪數拼成穩定性通過。
if args.start_index != 1 and args.mode != 'matrix':
    parser.error('只有速度／長度矩陣可接續；十輪穩定性及其他模式必須從第一組執行。')
root = Path(__file__).resolve().parents[1]
code = (root / 'tests/browser/media-feasibility.js').read_text()
folder = root / 'output/media-feasibility'
worker_source = (root / 'dist/web/sw.js').read_text()
# 新版 SW 將版本與 cache 名稱分開，仍須綁定實際建置，不能缺值就當成同版。
build_match = re.search(r"const version = '([a-f0-9]{16})'", worker_source) or re.search(r'dance-stamp-web-([a-f0-9]{16})', worker_source)
if not build_match:
    raise RuntimeError('無法辨識建置版本，請先建置並核對 Service Worker。')
build = build_match.group(1)
git_head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
# 不輸出路徑或內容；未提交修改不能冒充目前 head 的正式量測。
source_dirty = bool(subprocess.run(['git', 'status', '--porcelain'], cwd=root, capture_output=True, text=True, check=True).stdout.strip())
if source_dirty and not args.allow_dirty:
    raise RuntimeError('來源尚未提交；正式量測請先 commit，僅實驗才可指定 --allow-dirty。')

def invoke(options):
    # 以 argv 傳遞完整程式，不能把測試文字插入 shell 造成意外命令展開。
    expression = f'async (page) => await ({code})(page, {json.dumps(options)})'
    result = subprocess.run([args.cli, '--session', args.session, '--raw', 'run-code', expression],
                            cwd=root, text=True, capture_output=True, timeout=45)
    if result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(result.stdout) from error

cases = ([(15, args.rate)] if args.mode in ['smoke', 'webm', 'recovery'] else [(60, args.rate)] if args.mode == 'performance' else [(15, 1), (15, 0.75)] if args.mode == 'alignment' else
         [(seconds, rate) for rate in [0.5, 0.75, 1] for seconds in [15, 30, 60]] if args.mode == 'matrix' else [(60, 1)] * 10)
if args.start_index > len(cases):
    parser.error('起始編號超過此模式的案例數。')
for index, (seconds, rate) in enumerate(cases, 1):
    if index < args.start_index:
        continue
    name = f'{args.mode}-{args.label + "-" if args.label else ""}{index:02d}-{rate}x-{seconds}s'
    destination = folder / f'{name}.json'
    if destination.exists():
        raise RuntimeError(f'拒絕覆寫既有證據：{destination.name}')
    options = {'baseUrl': args.url, 'seconds': seconds, 'rate': rate, 'name': name, 'forceWebM': args.mode == 'webm'}
    if args.mode == 'alignment':
        options.update(offset=-0.2 if index == 1 else 0.2, referenceMirror=index == 1, selfMirror=index == 2)
    print(f'{name}: capture started', flush=True)
    started = time.monotonic()
    record = {'name': name, 'seconds': seconds, 'rate': rate, 'label': args.label, 'staticBuild': build, 'gitHead': git_head,
              'sourceDirty': source_dirty, 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    try:
        invoke({**options, 'phase': 'start'})
        for phase in ['capture-status', 'export-status']:
            deadline = time.monotonic() + seconds + 35
            while True:
                status = invoke({**options, 'phase': phase})
                if status['ready']:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError(f'{phase} 逾時：{status}')
                time.sleep(2)
            if phase == 'capture-status':
                # 從下載原片前就計時，完整涵蓋按匯出、讀回與儲存；作為偏保守的耗時上界。
                export_started = time.monotonic()
                record.update(invoke({**options, 'phase': 'export'}))
                print(f'{name}: capture finished, export started', flush=True)
            else:
                record['exportReadyUpperBoundMs'] = round((time.monotonic() - export_started) * 1000)
        record.update(invoke({**options, 'phase': 'save'}))
        if args.mode == 'recovery':
            record['recovery'] = invoke({**options, 'phase': 'recovery'})
        record['elapsedSeconds'] = round(time.monotonic() - started, 3)
        destination.write_text(json.dumps(record, indent=2))
        print(f'{name}: saved raw take and VS, storage={record["storage"]}', flush=True)
        if args.analyze:
            # 不等十輪跑完才發現同一停格；原片／失敗報告照常保留，不能把成檔當成過關。
            analysis = subprocess.run([sys.executable, 'scripts/analyze-media.py', str(destination)], cwd=root, capture_output=True, text=True)
            if analysis.returncode:
                raise RuntimeError(analysis.stdout + analysis.stderr)
            measured = json.loads(analysis.stdout)
            print(f'{name}: quality pass, longest frame={max(measured["maximumUnchangedReferenceMs"], measured["maximumUnchangedSelfMs"]):.3f}ms', flush=True)
    except Exception as error:
        record['error'] = str(error)
        destination.write_text(json.dumps(record, indent=2))
        raise
