# 全 App coverage

這是最近一次 main 成功完整量測；新測試失敗時保留上次成功數字，最新狀態請看首頁 CI。

來源：[83220edabd90cab274532900763c4ff696dffdc5](https://github.com/sunpochin/dance-stamp/commit/83220edabd90cab274532900763c4ff696dffdc5) · [CI 執行與可下載報告](https://github.com/sunpochin/dance-stamp/actions/runs/41473945359)

21 個 web/*.js 全列入分母；78 個瀏覽器流程通過。單元、VM 與隔離 Chromium 的插樁合成測試不代表真機或影音品質驗收。

| 指標 | 已覆蓋 / 總數 | 比例 |
| --- | --- | --- |
| lines | 2956 / 3182 | 92.89% |
| functions | 920 / 1066 | 86.3% |
| branches | 2926 / 3506 | 83.45% |

逐檔數字及來源指紋見 [summary.json](summary.json)；CI artifact 包含可離線開啟的 report.html。
