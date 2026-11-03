# 全 App coverage

這是最近一次 main 成功完整量測；新測試失敗時保留上次成功數字，最新狀態請看首頁 CI。

來源：[da0232505bb410337262ff89ff8e4daba5217812](https://github.com/sunpochin/dance-stamp/commit/da0232505bb410337262ff89ff8e4daba5217812) · [CI 執行與可下載報告](https://github.com/sunpochin/dance-stamp/actions/runs/41589617609)

24 個 web/*.js 全列入分母；83 個瀏覽器流程通過。單元、VM 與隔離 Chromium 的插樁合成測試不代表真機或影音品質驗收。

| 指標 | 已覆蓋 / 總數 | 比例 |
| --- | --- | --- |
| lines | 3335 / 3357 | 99.34% |
| functions | 1084 / 1127 | 96.18% |
| branches | 3223 / 3713 | 86.8% |

逐檔數字及來源指紋見 [summary.json](summary.json)；CI artifact 包含可離線開啟的 report.html。
