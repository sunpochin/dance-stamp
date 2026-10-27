<!-- 檔案用途：記錄 #4 的工程骨架驗收。所在層：驗收證據。主要關聯：TECHNICAL.md、WEB_PREVIEW.md。 -->
# #4 靜態 Web 與品質入口

2026-10-27。由 main `655918a` 建分支，帶入 #25 預覽，保留 #23 CI 及 #24 開票規則。使用者指定先做桌面 Web，不因暫未驗證 iPhone 停止工程工作；#3 真實媒體 gate 仍獨立未完成。

已實作：原生 ES modules 靜態產物、domain／媒體／storage／UI 邊界、Bun 固定版本、開發／建置／checkJs／Biome lint／測試指令、lockfile frozen 安裝、同一 CI 入口、產物 LICENSE／第三方 notices。TypeScript 7.0.2 Apache-2.0、Biome 2.6.3 MIT OR Apache-2.0 僅供開發，產品無 runtime 依賴。

`bun run check`：311 tests、兩個型別環境、Biome recommended（warning 視為失敗）及靜態建置通過。未以改副檔名、跳過程式或停用規則換綠燈。兩個局部 lint 說明分別為使用者影片無自動字幕，以及 hidden 防止控制被 display 樣式重新顯示。

可重現入口：Bun 1.4.4，`bun install --frozen-lockfile --ignore-scripts` 後 `bun run check`，再 `bun run dev`。不需要服務金鑰、登入、部署或外部 API。全新 checkout 與遠端 CI 的實際結果由 PR 列明，不以本機通過代替。

此票只驗收工程起點；完整媒體 G1–G7、真實相機與手機、使用者驗收、獨立 review、main 合併與發布分開記錄。
