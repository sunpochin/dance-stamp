# 全 App coverage

這是最近一次 main 成功完整量測；新測試失敗時保留上次成功數字，最新狀態請看首頁 CI。

來源：[710e3d8bd5b6db4970e8273dcc1d03de654c8ca2](https://github.com/sunpochin/dance-stamp/commit/710e3d8bd5b6db4970e8273dcc1d03de654c8ca2) · [CI 執行與可下載報告](https://github.com/sunpochin/dance-stamp/actions/runs/41461779477)

14 個 web/*.js 全列入分母；78 個瀏覽器流程通過。單元、VM 與隔離 Chromium 的插樁合成測試不代表真機或影音品質驗收。

| 指標 | 已覆蓋 / 總數 | 比例 |
| --- | --- | --- |
| lines | 2607 / 2616 | 99.65% |
| functions | 821 / 843 | 97.39% |
| branches | 2563 / 2882 | 88.93% |

逐檔數字及來源指紋見 [summary.json](summary.json)；CI artifact 包含可離線開啟的 report.html。
