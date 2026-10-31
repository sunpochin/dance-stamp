# 全 App coverage

這是最近一次 main 成功完整量測；新測試失敗時保留上次成功數字，最新狀態請看首頁 CI。

來源：[19e7c12d24a91586c6ca88ade40c51fcc860a58c](https://github.com/sunpochin/dance-stamp/commit/19e7c12d24a91586c6ca88ade40c51fcc860a58c) · [CI 執行與可下載報告](https://github.com/sunpochin/dance-stamp/actions/runs/41249948251)

14 個 web/*.js 全列入分母；77 個瀏覽器流程通過。單元、VM 與隔離 Chromium 的插樁合成測試不代表真機或影音品質驗收。

| 指標 | 已覆蓋 / 總數 | 比例 |
| --- | --- | --- |
| lines | 2563 / 2573 | 99.61% |
| functions | 810 / 836 | 96.88% |
| branches | 2505 / 2817 | 88.92% |

逐檔數字及來源指紋見 [summary.json](summary.json)；CI artifact 包含可離線開啟的 report.html。
