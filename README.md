<!-- 檔案用途：產品及開發入口。所在層：根文件。主要關聯：AGENTS.md、TECHNICAL.md。 -->
# Dance Stamp

把練舞影片變成可以標記、重播、錄下自己並比較的練習筆記。

**產品目標：完全免費、非商用、原始碼公開。平台順序：Web 優先；核心功能無法可靠完成時，iOS 優先於 Android。**

已有可執行的桌面 Web 預覽版：選片、時間筆記、變速／A–B、錄影、校正、單一 VS 影片與備份。依使用者本次決定，先做桌面 Web，iPhone／iOS 驗收不阻擋此預覽交付；未宣稱手機支援或完整 P0 驗收。詳見 [Web 使用說明](docs/WEB_PREVIEW.md)。

使用 Bun 1.4.4，先執行 `bun install --frozen-lockfile --ignore-scripts`，再執行 `bun run dev`，在此電腦開啟 `http://127.0.0.1:4174/`。`bun run build` 產出可自架的靜態 `dist/web/`，尚未對外發布。

`bun run package:web` 可產生附校驗碼、使用說明與授權的獨立桌面候選包；取得已建置包後不需自行編譯，但仍需 Bun 啟動本機主機。見 [開始使用](START_HERE.md)／[發布準備與來源盤點](docs/RELEASE.md)。目前沒有正式發行檔或公開網站；CI 只驗證包，不自動上傳或部署。

## 第一版要做到什麼

1. 選取自己的課程影片，標記重要動作，點一下跳到重點。
2. 變速、鏡像、A–B 循環，練熟一小段 Salsa shine。
3. **一邊播放示範，一邊錄下自己；錄完校正時間，輸出帶示範音訊的左右 VS 影片。這是 P0，不能只交付雙播放器。**
   同為 P0 的另一入口是「比較已有影片」：選老師課後影片與自己已錄好的影片，各自選起點、左右並排校正，再輸出同一種 VS 影片；不必開相機或重新錄影。桌面 Web 已提供此流程，由 [#10](https://github.com/sunpochin/dance-stamp/issues/10)／[#11](https://github.com/sunpochin/dance-stamp/issues/11) 追蹤；使用方式見 [Web 預覽](docs/WEB_PREVIEW.md)，手機支援仍待驗證。
4. 筆記留在裝置，可以匯出、還原；影片不自動上傳。

不設 Pro、訂閱、廣告、付費 API 或雲端影片分鐘額度。免費不代表無限硬碟、永久瀏覽器保存或免費無限影片雲端。

## 閱讀順序

| 文件 | 回答的問題 |
| --- | --- |
| [產品規劃](docs/PRODUCT_PLAN.md) | 使用者是誰、P0 範圍、畫面與完整練習流程 |
| [技術決策](TECHNICAL.md) | 為何優先 Web、框架比較、資料與媒體架構 |
| [錄影與 VS 規格](docs/RECORD_COMPARE.md) | 如何邊播邊錄、對齊、合成；何時轉向 iOS |
| [資料與交換格式](docs/DATA_FORMAT.md) | 筆記、影片、練習 take、備份與跨裝置傳送 |
| [驗收計畫](docs/ACCEPTANCE.md) | 真機、同步誤差、資料遺失、離線與匯出如何驗證 |
| [路線圖與 issues](docs/ROADMAP.md) | 依賴、先後順序、粗估工作量與發佈門檻 |
| [授權與免費政策](docs/LICENSING_AND_COST.md) | 非商用限制、GPLv3 轉換、iOS 發佈費用 |
| [資料來源](docs/SOURCES.md) | 官方技術依據、參考產品與未驗證事項 |

## 授權

本專案採用 [LICENSE](LICENSE) 的 **PolyForm Noncommercial 1.0.0**；匯入 harness 與第三方程式的原授權另列於 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

這是 **source-available（原始碼公開）**，不是 OSI 定義的 open source。可依授權條件進行非商用的使用、修改與分享；教育及公益等允許用途以授權原文為準。歷史上已按 GPLv3 授出的權利不會被追溯撤回。第三方依賴、影片、音樂各自保留原授權。詳細轉換說明見[授權文件](docs/LICENSING_AND_COST.md)。

## 參與方式

`bun run test:coverage` 重跑同一批單元測試，顯示行數／函式覆蓋率並輸出 `coverage/lcov.info`。這是測試載入模組的統計；`web/main.js`、`web/storage.js` 與以 VM 執行的 `web/sw.js` 尚無此報表的覆蓋率，不能把數字當成整個 Web App 或真機驗收。統計範圍與基準見 [覆蓋率證據](docs/evidence/issue-99-unit-coverage.md)。

先從[路線圖](docs/ROADMAP.md)的可行性驗證開始。已提供 AI harness：先讀 [AGENTS.md](AGENTS.md) 與[工具說明](docs/ai/HARNESS.md)，使用 Bun 1.4.4 執行 `bun run check`，並以 `bun run hooks:install` 安裝此 clone 的 Git 防護。`bun run check` 已包含 Web 建置與邏輯測試；瀏覽器回歸和媒體驗收另記錄，不能把工具檢查寫成整體產品完成。回報問題請提供合成或自有權利的短片，勿把私人課程影片直接貼到公開 issue。
