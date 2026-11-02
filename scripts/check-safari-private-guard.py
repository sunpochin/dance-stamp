#!/usr/bin/env python3
# 檔案用途：只讀核對私人匯出在保存前被護欄拒絕，不冒稱救援通過。
# 所在層：本機收據工具；主要關聯：#13、safari-private-rescue-observer.js。
import hashlib
import json
import sys
from pathlib import Path


def check(folder):
    read = lambda name: json.loads((folder / 'results' / name).read_text())
    config = json.loads((folder / 'server.local.json').read_text())
    seed, before, after = map(read, ['preset-complete.json', 'before-export.json', 'first-product-guard-failure.json'])
    assert seed['nonce'] == before['nonce'] == after['nonce'] == config['nonce'], '收據必須屬於同一個自有 cohort'
    assert seed['sourceHead'] == before['sourceHead'] == after['sourceHead'] == config['sourceHead']
    assert before['productHead'] == after['productHead'] == config['productHead']
    assert seed['native']['metadata']['revision'] == 1 and seed['native']['keys'] == []
    seed_write = [tx for tx in seed['transactions'] if tx['mode'] == 'readwrite']
    assert len(seed_write) == 1
    assert seed_write[0]['events'] == [dict(type='complete', at=seed_write[0]['events'][0]['at'], trusted=True, target='transaction', error=None, defaultPrevented=False)]
    assert seed['native']['metadata']['data']['markers'], '基準必須有非空筆記'
    assert not before['unknown'] and not after['unknown'], '未確認案例不能改標為保存前護欄拒絕'
    assert before['busy'] == after['busy'] == 'false'
    old, current = before['native']['metadata'], after['native']['metadata']
    assert current['revision'] == old['revision'] + 1
    assert current['data'] == old['data'], '完整筆記／配方必須相同'
    assert current['data']['markers'] == seed['native']['metadata']['data']['markers']
    assert current['data']['exports'] == []
    assert before['native']['keys'] == after['native']['keys'] == []
    assert before['native']['chunks'] == after['native']['chunks'] == []
    assert after['links']['output-download']['blob'] is None
    assert after['links']['output-download']['hidden']
    assert after['ui']['recovery']['hidden'] and not after['ui']['recovery']['rendered']
    assert '兩側偏移超過 250ms' in after['ui']['status']
    assert len(after['clicks']) == 1 and after['clicks'][0]['id'] == 'export' and after['clicks'][0]['trusted']
    # 不以 JS 計時推論回滾：此處只允許每筆 metadata 寫入皆有真正 complete 的首個護欄失敗。
    writes = [tx for tx in after['transactions'] if tx['mode'] == 'readwrite']
    assert len(writes) == 3
    for tx in writes:
        assert len(tx['success']) == 1 and tx['success'][0]['store'] == 'metadata', '出現媒體寫入，不能分類為未到新 VS 保存'
        assert len(tx['events']) == 1
        event = tx['events'][0]
        assert event['type'] == 'complete' and event['trusted'] and event['target'] == 'transaction'
        assert event['error'] is None and not event['defaultPrevented']
        assert tx['activeRead']['trusted'] and tx['activeRead']['triggerTrusted']
    assert writes[-1]['activeMetadata'] == current
    recipe, take = current['data']['recipes'][0], current['data']['takes'][0]
    assert (take['referenceStartMs'], take['referenceEndMs'], take['rate'], recipe['offsetMs']) == (0, 3000, 1, 0)
    assert recipe['layout'] == 'side-by-side' and not recipe['referenceMirror'] and not recipe['selfMirror']
    for side, link in [('reference', 'reference-download'), ('self', 'take-download')]:
        blob = (folder / 'fixtures' / (side + '.mp4')).read_bytes()
        observed = after['links'][link]
        assert observed == before['links'][link], '原片完整指紋／URL／可見狀態必須保留'
        assert not observed['revoked'] and not observed['rendered'] and observed['display'] == 'none'
        assert observed['blob']['bytes'] == len(blob) == config['fixtures'][side]['bytes']
        assert observed['blob']['sha256'] == hashlib.sha256(blob).hexdigest() == config['fixtures'][side]['sha256']
    assert before['hardwareCalls'] == after['hardwareCalls'] == 0 and after['errors'] == []
    assert after['resources']['recorders'] == ['inactive']
    assert all(track['state'] == 'ended' for track in after['resources']['tracks'])
    return dict(sourceHead=after['sourceHead'], productHead=after['productHead'], static=config['static'], result='first-guard-failure; new-VS-storage-rescue-unverified', revision=[old['revision'], current['revision']], nativeMetadataCompleteCount=len(writes), sourceFilesAndUrlsPreserved=True, hardwareCalls=0)


if __name__ == '__main__':
    print(json.dumps(check(Path(sys.argv[1])), ensure_ascii=False, indent=2))
