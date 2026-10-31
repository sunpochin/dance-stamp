<!-- 檔案用途：說明本 repo 自足的 AI 開發工具與整理後的方法。所在層：開發工具文件。主要關聯：AGENTS.md、harness-import.json、TECHNICAL.md。 -->
# AI harness

Dance Stamp 自行維護開發工具、規則、skills、測試與文件。新 clone 只需本 repo 與指定版本的 Bun；不需其他產品的 checkout、本機來源副本或外部規則庫。
必要內容直接放在對應目錄，來源署名集中於 [第三方授權索引](../../THIRD_PARTY_NOTICES.md)。[來源清單](harness-import.json) 保存歷史 Git blob、適配原因與目前 SHA-256；它用於追溯，不會下載或同步其他 repository。

## 保留下來的方法

舊方法有可重用的價值；採用時改寫成練舞產品適用的內容，並把完整說明放進本 repo。

| 用途 | 本 repo 的正式入口 | 取捨 |
| --- | --- | --- |
| 單一規則、分支與交付 | [AGENTS.md](../../AGENTS.md)、[工作流程](../agents/workflow.md) | 規則只有一份；工具入口薄轉接 |
| 程式分工、狀態與競態 | [程式慣例](../agents/code-conventions.md) | 保留讀寫狀態分離、資源 owner、過期結果防護；依原生 Web 調整，不要求改框架 |
| 審查、失敗排查與證據 | [審查與交接](../agents/review.md) | 保留先重現、版本綁定與失敗停損；不移植特定 bot、合併豁免或自動結案授權 |
| 外部 skills 與腳本 | [Skill 安全](../agents/skill-security.md)、[Skill 使用](../agents/skills.md) | 保留版本、依賴、檔案／網路行為檢查；不自動安裝或代讀憑證 |
| 介面與使用者流程 | [介面檢查](../agents/ui-review.md)、[驗收計畫](../ACCEPTANCE.md) | 保留鍵盤、觸控、空／錯誤狀態；用選片、錄影、比較與下載驗證 |
| 命令防護 | `scripts/destructive-guard.ts` 及必要 parser、`vendor/reviewlatch/` | 程式與依賴已在 Git，保留原授權與正常／負向測試 |

各工具共用 `skills/`，`.agents/skills/` 與 `.codex/skills/` 使用 repo 內的相對連結。設計方法按需閱讀，不把所有參考資料載入每次工作。
舊產品的專用規則、營運事件、雲端任務、部署設定與未採用工具不屬於本 repo 的操作入口；開發與檢查也不以這些資料存在為前提。

## 已啟用的檢查

| 能力 | 入口 |
| --- | --- |
| 可重現自查 | `bun run check`、`bun run test:unit` |
| 遠端品質檢查 | [Harness CI](../../.github/workflows/harness-ci.yml)，權限與實際工作以該檔為準 |
| 提交檢查與禁止直接推 main | `.githooks/pre-commit`、`.githooks/pre-push` |
| 公開前檢查 | `scripts/check-public.ts`，檢查 Git 追蹤內容、憑證與非範例個人識別 |
| 交付與裝置證據 | issue／PR 範本及 [證據範本](../agents/acceptance-template.md) |

## 新 clone 使用

使用 `.bun-version` 固定的 Bun，在 repo 根目錄執行：

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run hooks:install
```

檢查涵蓋來源指紋、Git 追蹤內容、規則入口、文件連結、公開掃描、單元測試、型別、lint 與 Web 建置。下載包另外執行 `bun run package:web` 及 `bun run check:package`。
完整流程不讀被 Git 忽略的舊參考；不再提供依賴本機來源副本的檢查命令。

`hooks:install` 只設定此 clone 的 `core.hooksPath`；每個新 clone 執行一次。已有不同 hooksPath 時安裝器拒絕覆寫，應先檢查既有設定。
pre-commit 拒絕 main／staging、敏感檔案與部分暫存，並執行完整 check；pre-push 拒絕指向 main／staging 的更新，包括刪除。伺服器 ruleset 由擁有者設定。
單元測試使用明確的 `./tests/unit` 入口，避免裸 `bun test` 的名稱篩選掃到 vendor 測試。

## 工具與授權邊界

Claude／Codex 設定只啟用 destructive guard，代表性輸入有測試；是否被特定工具版本載入仍須實際確認，設定檔存在不等於攔截已生效。parser 無法分析任意程式內藏的 shell 命令，不能取代平台權限或人工審查。
`mergeGuard.ts`、`codexReviewGate.ts` 與 reviewlatch 是 parser 依賴，不表示啟用其中的其他分支、bot 或豁免政策；沒有自動合併、雲端任務或排程入口。

修改採用內容時，先看相依與完整 diff，再更新適配原因、SHA-256 與相關測試。新增工具須把必要程式、資料、文件與授權一起納入 Git，不能只放一個指向外部 checkout 的入口。
MIT 與其他第三方授權全文保留；產品根授權仍以 [LICENSE](../../LICENSE) 為準。

`check-public` 只回報問題類別與檔名；模式掃描不能辨識所有未知秘密，每次仍須人工審 diff。工具檢查、獨立審查、裝置驗收與發布各自記錄，不以測試數量宣稱產品完成或生產力提高。
