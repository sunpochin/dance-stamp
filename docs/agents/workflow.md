<!-- 檔案用途：把已合併產品規劃轉成每天能執行的工作流程。所在層：操作文件。主要關聯：AGENTS.md、ROADMAP.md、ACCEPTANCE.md。 -->
# Dance Stamp 開發與交付流程

## 為何採這個流程

這是本機媒體產品。最大的未知是手機能否一邊播放、一邊錄影，最後產生可保存的 VS 檔案；不是選哪個 UI 框架。
因此沿用來源專案的單一規則、分支、驗證與 PR 方法，改為「媒體可行性先行」，不帶入照護授權、staging 資料庫或自動部署。

## 現在的下一步

接續既有 [#3](https://github.com/sunpochin/dance-stamp/issues/3)，依其前置條件核對授權工作，再做最小原生 Web 媒體試驗。
先讓選片、相機、錄影、校正與成檔走通，再依證據固定 Svelte／Vite 等選型；不搶先完成 #4 全套畫面。
缺設備時完成可做的測試並記錄缺口；只有可重現失敗與限時修正結果才能觸發 [#16](https://github.com/sunpochin/dance-stamp/issues/16)。
本次 harness 匯入沒有執行 #3，也沒有關閉任何產品功能 issue。

## 每件任務

### Issue 標題與開票 AI

- AI 開票時，標題開頭寫 `[AI: 廠商 / 模型]`，接原本的優先級與問題摘要，例如 `[AI: OpenAI / gpt-6-astra] [P0] 完成備份`。
- 廠商與模型以實際建立該 issue 當下的開票 AI 為準；Codex、Claude Code 等工具名稱不等於模型名稱。協助修改或審查的 AI 不取代原開票資訊。
- 無法確認廠商或模型時，在缺失欄位寫「待確認」，取得可靠紀錄後更新；不得猜測。人工開票不冒用 AI 標籤。
- 測試裝置、作業系統、瀏覽器／App 版本及重現步驟依需要記在 issue 內文，與開票 AI 分開。

1. 讀對應 issue、依賴與一份相關技術文件，寫清楚使用者結果、不做事項、驗收方法。
2. `git fetch origin` 後確認乾淨基線；在專用 clone 建 `feature/*`、`fix/*`、`docs/*` 或 `chore/*` 分支。共用 checkout 用獨立 worktree。
3. 一次交付一個可驗收結果；遇到延伸工作另建 issue，兩次有意義的修正仍失敗先重新找原因。
4. 執行下表檢查。證據記錄 commit；變更後舊版本結果不能當作新版本結果。
5. `git diff --check`、檢查 diff、暫存完整檔案，再 commit 並立即 push 該分支。用新 PR 到 `main`，不直接推 main。
6. PR 附結果、測試、未驗證與風險；重大變更交 Claude Code 或使用者審查。除非已獲授權，停在可審查 PR，不合併、不發布。

## 驗證矩陣

| 改動 | 必做證據 |
| --- | --- |
| 文件、skills、harness | `bun run check`，檢查引用、來源指紋與 hook 負向測試 |
| 純時間／資料邏輯 | 受影響 unit、邊界與失敗案例；應用骨架建立後另跑其 typecheck/lint |
| 相機／播放／錄影／合成 | 自動化回歸＋[RECORD_COMPARE](../RECORD_COMPARE.md) 的 G1–G7，依支援範圍逐一真機 |
| 儲存／備份／migration | 交易失敗、quota、中斷、重開、多分頁、匯出還原與缺檔演練 |
| 手機 UI／PWA | 瀏覽器流程、觸控／鍵盤／錯誤恢復；真機旋轉、背景、更新與保存 |
| 發布 | P0 證據、支援矩陣、授權與 origin 盤點、回復方案，以及使用者核准 |

不重抄同步誤差或效能數字；數值以 [錄影比較](../RECORD_COMPARE.md) 為準。
Playwright／假相機可驗證事件與畫面，不能證明 iPhone 的編碼、音訊路由或相簿保存成功。
目前 `bun run check` 只驗證 harness；應用建置、typecheck、lint、E2E 由 #4 實作後接入同一品質入口。

## Review 與發布

- CI 沒有 findings 不等於有人審過。PR 清楚記錄審查者與 reviewed commit，不自行蓋審查章。
- 啟用付費 bot 或外部審查服務不是本流程的前提；現在採人工審查，來源 bot 工具只保留參考。
- 使用者授權合併後，仍核對最新 head、CI、未結案意見與依賴；不得強推或跳過門檻。
- main 是目前唯一整合分支，沒有部署連線；未來若需要 staging 或發布自動化，另提可審查變更。
- issue 的完成標準由實際驗收決定。合併基礎工具不會完成媒體或真機功能。
