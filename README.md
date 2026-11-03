# 全 App coverage

這是最近一次 main 成功完整量測；新測試失敗時保留上次成功數字，最新狀態請看首頁 CI。

來源：[7c97df972aad940683de40f7f15d333cd61ecd68](https://github.com/sunpochin/dance-stamp/commit/7c97df972aad940683de40f7f15d333cd61ecd68) · [CI 執行與可下載報告](https://github.com/sunpochin/dance-stamp/actions/runs/41627102641)

25 個 web/*.js 全列入分母；83 個瀏覽器流程通過。單元、VM 與隔離 Chromium 的插樁合成測試不代表真機或影音品質驗收。

| 指標 | 已覆蓋 / 總數 | 比例 |
| --- | --- | --- |
| lines | 3347 / 3369 | 99.34% |
| functions | 1096 / 1139 | 96.22% |
| branches | 3229 / 3719 | 86.82% |

逐檔數字及來源指紋見 [summary.json](summary.json)；CI artifact 包含可離線開啟的 report.html。
