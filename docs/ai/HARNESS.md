<!-- 檔案用途：說明本 repo 自足的 AI 開發工具與整理後的方法。所在層：開發工具文件。主要關聯：AGENTS.md、harness-import.json、TECHNICAL.md。 -->
# AI harness

Dance Stamp 自行維護開發工具、規則、skills、測試與文件。新 clone 只需本 repo 與指定版本的 Bun；不需其他產品的 checkout、本機來源副本或外部規則庫。
必要內容直接放在對應目錄，來源署名集中於 [第三方授權索引](../../THIRD_PARTY_NOTICES.md)。原命令防護用 [歷史來源清單](harness-import.json)；通用方法使用 repo 內完整的 [Agent Work Methods v0.1.0](../agents/work-methods.md) 與 [固定清單](work-methods-lock.json)。清單只追溯與核對內容，不下載或同步其他 repository。

## 保留下來的方法

像把完整通用手冊放在本 repo，再用產品補充頁交代特殊契約。通用正文只維護來源版本，練舞專用規則留在本地，避免同一方法越改越多份。

| 用途 | 本 repo 的正式入口 | 取捨 |
| --- | --- | --- |
| 單一規則、分支與交付 | [AGENTS.md](../../AGENTS.md)、[工作流程](../agents/workflow.md) | 規則只有一份；工具入口薄轉接 |
| 接手、排查與狀態觀察 | `awm-onboarding`、`awm-debugging`；[產品程式補充](../agents/code-conventions.md) | 通用正文來自固定版本；本地保留媒體與保存契約 |
| 審查與證據 | `awm-review-evidence`；[產品審查補充](../agents/review.md) | 通用版本收據與本地驗收／審查政策分開 |
| 外部 skills 與腳本 | `awm-skill-safety`；[本地邊界](../agents/skill-security.md)、[入口](../agents/skills.md) | 不自動安裝、上傳、讀憑證或新增派工 |
| 介面與使用者流程 | `awm-frontend-review`；[練舞補充](../agents/ui-review.md)、[驗收計畫](../ACCEPTANCE.md) | 通用介面檢查加本地選片、錄影、比較與成檔驗收 |
| 命令防護 | `scripts/destructive-guard.ts` 及必要 parser、`vendor/reviewlatch/` | 程式與依賴已在 Git，保留原授權與正常／負向測試 |

完整 33 檔保存在 `vendor/agent-work-methods/`，保持發行 bytes；`skills/awm-*` 與三種工具入口都是 repo 內的相對連結。舊名稱只保留產品薄接線。按需閱讀，不把所有參考資料載入每次工作。
舊產品的專用規則、營運事件、雲端任務、部署設定與未採用工具不屬於本 repo 的操作入口；開發與檢查也不以這些資料存在為前提。

## 已啟用的檢查

| 能力 | 入口 |
| --- | --- |
| 可重現自查 | `bun run check`、`bun run test:unit` |
| 遠端品質檢查 | [Harness CI](../../.github/workflows/harness-ci.yml)，權限與實際工作以該檔為準 |
| 提交檢查與禁止直接推 main | `.githooks/pre-commit`、`.githooks/pre-push` |
| 公開前檢查 | `scripts/check-public.ts`，檢查 Git 追蹤內容、憑證與非範例個人識別 |
| 交付與裝置證據 | issue／PR 範本及 [證據範本](../agents/acceptance-template.md) |

## 完整 App CI 的整場時間預算

追蹤 [#241](https://github.com/sunpochin/dance-stamp/issues/241)，Refs #103／#234。

白話：檢查影片、重新播放和保存報告都需要時間。整場上限由25調到30分鐘，讓最後收尾也有空間；每一項檢查仍須在原來的期限通過，不少跑、不放寬影片標準。

技術：只改 `harness-ci.yml` 的 `app-coverage.timeout-minutes`；所有案例／原順序、完整 `web/*.js` 分母、下載與離站全軌解碼、報表上傳及其他job保持。原5秒離線、15秒恢復、100ms音畫與各媒體期限不變；30分鐘仍是整場有限上限，不將個別失敗改標成功。

依據是 [#234 的原CI](https://github.com/sunpochin/dance-stamp/actions/runs/41498913294/job/125462889268)，head `6984861bc9cd4a911bf7ecfd79771c9b54a50236`：81個不同案例PASS／0FAIL、五份真下載離站自然播完與全軌解碼及artifact上傳完成，整場仍因25分鐘上限cancelled。協調者已實讀annotation「The job has exceeded the maximum execution time of 25m0s」，UTC 18:19:28開始、18:44:29結束，最後log 18:42:57為orphan cleanup。完整報告行3311／3357、函式1077／1127、分支3211／3713、skipped0，ZIP SHA-256 `07d431f9ff982a153b727ac7d04dbd7e956fd32bea6dfc0562c0465d247c61f8`。只能記「量測與成品已通過，整場超時取消」，不是CI成功，也沒有證明cleanup唯一根因或30分鐘一定足夠。

本次修復以同步main `e3d4ebd7a7e20802eeb539369067d5b96ac9d501` 為來源，只改workflow與本節，不帶產品依賴。正常check／hook及精確head CI後獨立審查；後續要重驗依賴PR須正常merge此infra形成新head，不重寫舊head或移記舊報告。這是完成既有檢查的阻擋修復，不新增coverage子範圍、外部服務或發布。

本機驗證：YAML解析後比對整份設定，語意唯一差異為App整場25→30，所有其他job與命令相同。正常check為754 pass／0 fail／4,142 expects、保留19項lint info，靜態仍83a29a61027b205d。首輪753／1是專用worktree切回主線後，原建置白名單拒絕先前節拍器分支留下的生成檔；保全整份自有舊產物後重建／重跑通過，未改白名單或測試，失敗log保留。本票不重跑無關影音，精確head完整CI仍待實際結果。

## 新 clone 使用

使用 `.bun-version` 固定的 Bun，在 repo 根目錄執行：

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run hooks:install
```

檢查涵蓋原工具與固定共用副本的指紋／追蹤完整性、相對連結實體目標、規則入口、文件連結、公開掃描、單元測試、型別、lint 與 Web 建置。下載包另跑 `bun run package:web` 及 `bun run check:package`。
完整流程不讀被 Git 忽略的舊參考；不再提供依賴本機來源副本的檢查命令。

`hooks:install` 只設定此 clone 的 `core.hooksPath`；每個新 clone 執行一次。已有不同 hooksPath 時安裝器拒絕覆寫，應先檢查既有設定。
pre-commit 拒絕 main／staging、敏感檔案與部分暫存，並執行完整 check；pre-push 拒絕指向 main／staging 的更新，包括刪除。伺服器 ruleset 由擁有者設定。
單元測試使用明確的 `./tests/unit` 入口，避免裸 `bun test` 的名稱篩選掃到 vendor 測試。

## 工具與授權邊界

Claude／Codex 設定只啟用 destructive guard，代表性輸入有測試；是否被特定工具版本載入仍須實際確認，設定檔存在不等於攔截已生效。parser 無法分析任意程式內藏的 shell 命令，不能取代平台權限或人工審查。
`mergeGuard.ts`、`codexReviewGate.ts` 與 reviewlatch 是 parser 依賴，不表示啟用其中的其他分支、bot 或豁免政策；沒有自動合併、雲端任務或排程入口。

共用副本不直接修改；先在來源修正與發布，再由本 repo 的升版 PR 整份替換並更新清單。產品補充留在本地。新增工具須把必要程式、資料、文件與授權一起入 Git，不能只放指向外部 checkout 的入口。
MIT 與其他第三方授權全文保留；產品根授權仍以 [LICENSE](../../LICENSE) 為準。

`check-public` 只回報問題類別與檔名；模式掃描不能辨識所有未知秘密，每次仍須人工審 diff。工具檢查、獨立審查、裝置驗收與發布各自記錄，不以測試數量宣稱產品完成或生產力提高。
