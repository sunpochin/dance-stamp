<!-- 檔案用途：記錄單元覆蓋率的可比較基準、結果與未量測範圍。所在層：品質證據。主要關聯：package.json、TECHNICAL.md、tests/unit/。 -->
# #99 單元測試覆蓋率

日期：2026-10-30。基準為 main `b1fc9327a5411144004464fc29341d2034cf6e83`；本次只新增測試、覆蓋率入口與文件，產品及受測工具的來源未變更。這是 PR 工程證據，未代表合併、發布或真機驗收。

## 重現與統計口徑

使用 `.bun-version` 指定的 Bun 1.4.4：

```sh
bun install --frozen-lockfile --ignore-scripts
bun run test:coverage
```

基準在未修改來源副本執行相同的 `bun --no-env-file test --isolate --coverage --coverage-reporter=text --coverage-reporter=lcov ./tests/unit`。既有 HTTP 測試需要允許專用 loopback 主機。兩輪均成功，未跳過測試。Bun 1.4.2 的初探數字不作比較基準。

報告保存在 ignored `coverage/lcov.info`，CI log 同時保留文字報表。沒有增加忽略規則、排除低分檔案、修改原測試斷言、引入測試套件或執行上游參考測試。

**主要指標使用 LCOV 加總**：行數為所有 `LH` 的和除以 `LF` 的和；函式為所有 `FNH` 的和除以 `FNF` 的和。文字報表的 `All files` 是各檔百分比的平均，與逐行／逐函式加總不同；兩種口徑都列出，避免混用。

| 指標 | 基準 | 本次候選 |
| --- | --- | --- |
| LCOV 行數覆蓋率 | 1,444 / 2,201 = **65.61%** | 2,091 / 2,201 = **95.00%** |
| LCOV 函式覆蓋率 | 345 / 424 = **81.37%** | 514 / 530 = **96.98%** |
| Bun 文字報表 All files 行數 | 66.33% | 96.25% |
| Bun 文字報表 All files 函式 | 71.68% | 96.71% |
| 測試 | 457 通過、0 失敗／21 檔 | 632 通過、0 失敗／25 檔 |
| 斷言 | 2,532 | 3,050 |

本次增加 175 個測試與 518 個斷言。LCOV 兩輪行數分母及檔案清單一致；函式計數依 Bun 在執行中登記的函式而變動，不能解讀成產品新增了 106 個函式。此輪未產出分支覆蓋率，不能宣稱分支達 90%。

## 覆蓋範圍

兩輪 LCOV 都只有以下 17 檔，保留相同範圍：

- Web：`beats.js`、`library.js`、`local-audio.js`、`offline.js`、`recorder.js`、`timeline.js`。
- scripts：`codexReviewGate.ts`、`destructiveGuard.ts`、`mergeGuard.ts`、`package-web.ts`、`publicSafety.ts`、`shellWords.ts`、`stagedSafety.ts`、`web-assets.ts`。
- 固定來源核心：`vendor/reviewlatch/src/gate.ts`、`vendor/reviewlatch/src/readiness.ts`。
- 既有合成資料 helper：`tests/fixtures/backup-planning.js`；沿用基準範圍，沒有藉此新增 helper 稀釋低分模組。

補測著重離線資源不完整／註冊失敗／儲存 API 例外／手動持久保存與更新、倒數音訊時鐘與節點清理、載入與 seek 順序、媒體錯誤及 EBML 容器辨識。工具測試涵蓋審查版本／過期證據／豁免範圍、shell 包裝與命令替換、Git 目的地／設定映射、REST／GraphQL 的保守判斷。危險命令只作為純函式輸入，沒有實際執行；全部使用合成資料。

## 剩餘範圍與限制

90% 目標已在上述單元測試量測範圍達成，**整個 Web App 的覆蓋率仍未知**。Bun 未載入的 `web/main.js`、`web/storage.js`，以及在 VM 中執行的 `web/sw.js` 不在 LCOV；瀏覽器測試雖已存在，本次未替它們收集或合併覆蓋率。fixture 產生器、其他 CLI 與 Python 分析器亦未全面量測。

`scripts/package-web.ts` 仍為行數 68.75%，`scripts/shellWords.ts` 為 74.82%。前者的完整 CLI 已由既有子程序測試檢查，但子程序計數不會自動併入此 LCOV；後者仍有 shell 語法邊界未覆蓋。保留真實數字，沒有以忽略規則或較低門檻掩蓋。

本入口只產出報表，未新增整體或每檔 90% 的強制閘門。Bun 的每檔門檻與本任務的加總目標不同，直接設成 90% 會讓上述檔案失敗，不能當成等價設定。相機、編碼、同步、音訊聆聽、瀏覽器交易及實體裝置驗收仍依原規格另做。

## 驗證

`bun run test:coverage` 通過上述 632 測試；`bun run check` 的來源指紋、公開內容掃描、同批單元測試、TypeScript、Biome 與靜態建置全部通過。`bun run package:web`、`bun run check:package` 通過，靜態版本為 `035b6b8afc5872f9`，63 檔下載包通過校驗；包只供本機檢查，沒有發布。本機完整結果不代替 PR 的遠端 CI。

工具格式參考：[Bun 官方覆蓋率文件](https://bun.com/docs/test/code-coverage)、[每檔門檻說明](https://bun.com/guides/test/coverage-threshold)。
