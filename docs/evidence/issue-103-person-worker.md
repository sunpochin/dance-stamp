<!-- 檔案用途：記錄人物背景工作回覆與資源收尾的補測。所在層：#103 單元證據。主要關聯：personWorker.test.ts、person-worker.js、app-coverage/instrument.ts。 -->
# 人物背景工作的回覆、重試與影格釋放

像把一張影片畫面交給背景小幫手：成功要回傳正確位置，失敗要清楚回報，而且兩種情況都必須把這張畫面用掉的資源收好，才能繼續下一張。這輪補上這些檢查，模型可以重用，但不能沿用上一張的座標。

執行 `bun --no-env-file test --isolate tests/unit/personWorker.test.ts` 可重跑五個單元案例。一般品質入口及原 `test:coverage:app` 的單元 preload 也會自動納入；不需另設收集開關。

## 原缺口與固定來源

從同步 main `69ebdd589112cd9ee85881778a98c4917c01bb74` 開獨立分支。十二份產品 JS 與 [CI #290](https://github.com/sunpochin/dance-stamp/actions/runs/41207614955) 的 `c4690d44844b5c3c6f33757678cbfe931ed37756` 逐一 SHA 相同，沒有帶入 PR #171 尚未合併的量尺修改。

該輪 73 個瀏覽器情境通過，包含真正模型的 person-follow；報表仍把 `web/person-worker.js` 列為 0%。原入口收集頁面與 Service Worker，沒有取得這個會被父頁終止的專用 Worker 計數，原單元也未直接執行它。0% 是本輪補測的依據，不改寫成產品人物分析沒有執行。

## 五案與計數方式

- 兩張不同尺寸的影格：模型與本機資源只初始化一次，每張重新正規化座標，略過缺少框的結果，各自只釋放一次；確認 CPU、本機模型／WASM 與 person 類別設定。
- 載入腳本、建立模型、偵測及傳送回覆四個階段各故障一次：只回通用錯誤，不洩漏引擎細節；失敗影格仍釋放，下一張成功回覆且釋放。

沿既有 `sourceForVm`／`vmCoverageContext` 在 VM 執行**未改的原 Worker handler**。只替換模型引擎、匯入與傳訊依賴；沒有在測試另寫座標或清理邏輯。沿原 `mergeReceipt` 驗完整來源 SHA 與位置表，與其他單元／瀏覽器使用相同計數格式；不改收集器、分母、忽略規則、品質門檻或原 73 情境名稱／順序。

一般與插樁兩條單元入口皆 **5 pass／0 fail／40 expects**。插樁原始收據獨立核對此 Worker：行 12／12、函式 3／3、分支 2／2，三者皆 100%；這是此模組的單元控制碼覆蓋率，**不是整個 App 100%**。全部十二份來源的 SHA 與原零覆蓋率基線一致，原收據留本機。

本機完整原 `bun run check` 通過：662 tests／0 fail／3,356 expects、333 檔公開掃描、型別、原 lint（19 info）及建置；完整 diff 已人工檢查。新 head 的 CI 另記 PR，不能以這份局部結果代簽全 App。模型推論準確度、實際專用 Worker 生命週期、真人、Safari／手機及完整 G1–G7 仍按原功能的瀏覽器／裝置證據追蹤。沒有合併或發布。
