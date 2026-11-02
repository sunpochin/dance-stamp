# 全 App coverage

這是最近一次 main 成功完整量測；新測試失敗時保留上次成功數字，最新狀態請看首頁 CI。

來源：[1ecc42f2086d3edafdf53d334879aefcfa4b738d](https://github.com/sunpochin/dance-stamp/commit/1ecc42f2086d3edafdf53d334879aefcfa4b738d) · [CI 執行與可下載報告](https://github.com/sunpochin/dance-stamp/actions/runs/41510575159)

21 個 web/*.js 全列入分母；79 個瀏覽器流程通過。單元、VM 與隔離 Chromium 的插樁合成測試不代表真機或影音品質驗收。

| 指標 | 已覆蓋 / 總數 | 比例 |
| --- | --- | --- |
| lines | 3128 / 3182 | 98.3% |
| functions | 1014 / 1066 | 95.12% |
| branches | 3033 / 3506 | 86.5% |

逐檔數字及來源指紋見 [summary.json](summary.json)；CI artifact 包含可離線開啟的 report.html。
