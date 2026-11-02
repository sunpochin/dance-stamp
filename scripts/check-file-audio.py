"""檔案用途：只讀核對離站音訊收據，保留零值未解狀態。所在層：QA。主要關聯：file-audio-player.html、MEDIA_PROBE.md。"""
import hashlib
import json
import math
import sys
from pathlib import Path


def check(receipt, media):
    raw = Path(receipt).read_bytes()
    report = json.loads(raw)
    content = Path(media).read_bytes()
    identity = {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
    assert report["schema"] == 1 and report["protocol"] == "file:"
    assert report["errors"] == [], "頁面錯誤不可忽略"
    selected = report["selected"]
    assert all(selected[k] == v for k, v in identity.items()), "選檔指紋不符"
    assert selected["trustedSelection"] is True
    kinds = [c["kind"] for c in report["cases"]]
    assert kinds in [["control", "selected-blob"], ["control", "direct-file", "selected-blob"]]
    results = []
    for case in report["cases"]:
        assert case["trustedClick"] and case["reason"] == "ended"
        assert not case.get("failure")
        events = case["events"]
        assert not any(e["type"] in ["seeking", "seeked", "error"] for e in events)
        assert sum(e["type"] == "ended" and e["trusted"] for e in events) == 1
        assert sum(e["type"] == "playing" and e["trusted"] for e in events) == 1
        samples = case["samples"]
        assert len(samples) > 1
        assert all(s["contextState"] == "running" and not s["muted"] and s["volume"] == 1 and s["error"] is None for s in samples)
        assert all(math.isfinite(s[k]) and s[k] >= 0 for s in samples for k in ["rms", "peak", "contextTime"])
        clocks = [s["contextTime"] for s in samples]
        assert clocks == sorted(clocks) and clocks[-1] > clocks[0]
        terminal = case["terminal"]
        assert terminal["ended"] and terminal["error"] is None and terminal["contextState"] == "running"
        assert case["cleanup"] == {"contextState": "closed", "paused": True}
        if case["kind"] == "control":
            assert case["synthetic"]["bytes"] == 76844
            assert any(s["peak"] > 0 for s in samples if s["time"] < 0.5), "合成 WAV 正控制沒有訊號"
            tail = [s for s in samples if s["time"] > 0.65]
            assert tail and all(s["peak"] == 0 for s in tail), "靜音控制未歸零"
        else:
            assert terminal["quality"]["totalVideoFrames"] > 0
            if case["kind"] == "selected-blob":
                assert case["file"] == selected
        # 核對有效不等於音訊通過；零值必須原樣列成未量到，不能由 ended 補勾。
        results.append({"kind": case["kind"], "samples": len(samples),
            "nonzeroSamples": sum(s["peak"] > 0 for s in samples),
            "peak": max(s["peak"] for s in samples), "maxRms": max(s["rms"] for s in samples),
            "contextRange": [clocks[0], clocks[-1]],
            "maxSampleGapMs": max(b["at"] - a["at"] for a, b in zip(samples, samples[1:])),
            "audioObservation": "nonzero-measured" if any(s["peak"] > 0 for s in samples) else "zero-unresolved",
            "pixelRead": case.get("pixelRead"), "terminal": terminal})
    return {"receiptValid": True, "receiptSha256": hashlib.sha256(raw).hexdigest(),
        "file": identity, "userAgent": report["userAgent"], "cases": results,
        "humanHearing": "unverified", "physicalNetwork": "unverified"}


if __name__ == "__main__":
    print(json.dumps(check(*sys.argv[1:]), indent=2, ensure_ascii=False))
