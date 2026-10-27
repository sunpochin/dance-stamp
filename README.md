<!-- 檔案用途：產品及開發入口。所在層：根文件。主要關聯：AGENTS.md、TECHNICAL.md。 -->
# Dance Stamp

把練舞影片變成可以標記、重播、錄下自己並比較的練習筆記。

**產品目標：完全免費、非商用、原始碼公開。平台順序：Web 優先；核心功能無法可靠完成時，iOS 優先於 Android。**

目前是規劃階段，尚無可執行 App。下列功能、效能數字與平台支援都是待實作／驗證的目標，不能視為已提供的能力。

## 第一版要做到什麼

1. 選取自己的課程影片，標記重要動作，點一下跳到重點。
2. 變速、鏡像、A–B 循環，練熟一小段 Salsa shine。
3. **一邊播放示範，一邊錄下自己；錄完校正時間，輸出帶示範音訊的左右 VS 影片。這是 P0，不能只交付雙播放器。**
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

先從[路線圖](docs/ROADMAP.md)的可行性驗證開始。已提供 AI harness：先讀 [AGENTS.md](AGENTS.md) 與[工具說明](docs/ai/HARNESS.md)，使用 Bun 1.4.4 執行 `bun run check`，並以 `bun run hooks:install` 安裝此 clone 的 Git 防護。產品 app、建置與真機測試仍待實作；不能把 harness 通過寫成產品完成。回報問題請提供合成或自有權利的短片，勿把私人課程影片直接貼到公開 issue。
