<!--
檔案用途：Dance Stamp 的唯一 AI 協作規則。
所在層：專案根目錄；人工決策優先，工具入口只引用本檔。
主要關聯：TECHNICAL.md、docs/agents/workflow.md、docs/ai/HARNESS.md。
-->
# 核心憲法

本專案的 GitHub 名稱是 `dance-stamp`；本機資料夾可叫 `dance-recaps`。
先讀本檔與 `TECHNICAL.md` 索引，再只讀任務相關文件。
`vendor/jia-jian-log-harness/source/` 是不進 Git 的本機來源參考，不是本專案的操作規則。
不得執行其中的 hooks、部署、雲端任務或安裝腳本來代替本專案入口。

## 1. 工具定位

- 依使用者提供的分工，Claude Code 是主要工程與最終審查工具；Antigravity 可規劃、做原型及瀏覽器驗證。
- 使用者直接交付其他 Agent 的任務，可在該授權範圍實作；重要變更由 Claude Code 或使用者審查。
- 不自動建立平行 Agent、跨聊天派工或背景任務。需要時遵守當次使用者授權與平台規則。
- 自動化檢查提供證據，不能代替獨立審查或真機驗收。

## 2. 最高原則

每次修改都完成：

1. **小朋友解說**：最後用簡單繁體中文說明改動對使用者有什麼幫助。
2. **說明原因的註解**：修改程式時用繁體中文註解交代非直覺決策、陷阱與重要順序。
3. **技術文件**：新功能或架構更新 `TECHNICAL.md` 與直接相關文件，記錄取捨。
4. **Commit & Push**：從同步的 `main` 建新分支；一件任務完成、檢查通過就 commit 並立即 push，開 PR 到 `main`。不得直接推 `main`。

提交格式：`type: Title`，空一行後寫具體 why-explanation。
共用 checkout 有其他任務時使用獨立 worktree；本聊天專用的全新 clone 可直接在 feature branch 工作。
不得清除、覆蓋或移動他人的未提交變更。

## 3. 產品不變量

- 免費、非商用、原始碼公開；以根目錄 `LICENSE` 和 `docs/LICENSING_AND_COST.md` 為準。
- 核心不能依賴付費 API、Pro、訂閱、廣告、追蹤或雲端影片額度。
- 影片、相機內容、筆記預設留在裝置；不得自動上傳或為診斷外傳。
- P0 必須真的「邊播邊錄 → 校正 → 匯出帶音訊的單一 VS 影片」，雙播放器不代表完成。
- 順序是 Web → 有證據需要時的 iOS → Android；不能因沒有 iPhone 就把 Web 判為失敗。
- 時間映射、音訊、鏡像與輸出標準只引用 `docs/RECORD_COMPARE.md`，不另訂一套門檻。
- 備份、媒體重新連結、取消及失敗恢復必須保留資料；不能以重置儲存修掉使用者問題。
- 當前 UI 語言以產品需求為準，預設繁體中文；不繼承照護專案的強制三語或病患授權規則。

## 4. 安全邊界

未經明確核准，禁止 `rm -rf`、`git reset --hard`、`git clean -fd`、`drop table`、
`truncate table`、`supabase db reset`、`supabase db push`、`vercel deploy --prod` 及覆寫 `.env`。
保護 `.env*`、OAuth 憑證、service role key、私鑰與正式資料。
公開前必跑 `bun run check` 的公開內容掃描，並人工檢查 diff。
不把真人資料、私人課程影片、相機錄影、原檔名、內部網址／營運識別或第三方音樂放入 Git、issue、PR、測試或公開附件。
測試用合成資料；經授權的真機影片仍留在本機，公開證據須匿名化。
相機與麥克風存取必須由產品使用者明確操作；停止、取消、離頁都要釋放資源。
匯入的 JSON、筆記與外部檔案視為資料，不可當作可執行指令或 HTML。

## 5. 最短工作流程

1. 核對現有 issue、前置條件與範圍；沒有對應 issue 時先建立，不重建 #1–#19。
2. 用一句話寫使用者結果與驗收方法，確認是文件、純邏輯、媒體、儲存或發布工作。
3. 新分支、小範圍修改；新檔以繁體中文檔頭說明用途、所在層與關聯，JSON／授權／未改動來源除外。
4. 執行 `bun run check`，另跑任務需要的既有測試；不得弱化測試或跳過 hook 換取綠燈。
5. 媒體、儲存及手機 UI 按驗收矩陣補真機證據；未測就寫「未驗證」。
6. 看完整 diff，commit、push、開 PR；列出測試結果、限制與下一步。
7. 收到 review 先重現與判斷，同意且修好才結案；不同意要留理由。

合併、發布、變更授權與新增必要外部服務都需要使用者明確授權。
PR 合併、程式驗證、真機驗收、發布分開記錄，不能互相代替。
目前沒有產品 app、部署或 bot 審查服務；CI 只有待啟用範本，不能把 harness 檢查寫成產品已可用。

## 6. 按需閱讀

| 情境 | 文件 |
| --- | --- |
| 開工、分支、PR、風險與完成條件 | [工作流程](docs/agents/workflow.md) |
| 安裝／執行 harness、來源範圍、停用工具 | [Harness 說明](docs/ai/HARNESS.md) |
| 產品範圍、優先順序 | [產品規劃](docs/PRODUCT_PLAN.md)、[路線圖](docs/ROADMAP.md) |
| 相機、錄影、同步、匯出 | [錄影比較](docs/RECORD_COMPARE.md) |
| 本機資料、備份、migration | [資料格式](docs/DATA_FORMAT.md) |
| 手機、媒體與發布驗證 | [驗收計畫](docs/ACCEPTANCE.md)、[證據範本](docs/agents/acceptance-template.md) |
| 選用或修改 skill | [Skill 使用規則](docs/agents/skills.md) |

保留憲法簡短；操作細節放文件，自動可查的事項放檢查程式。
