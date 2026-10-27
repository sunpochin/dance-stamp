<!-- 檔案用途：描述 AI harness 的匯入、啟用方式與限制。所在層：開發工具文件。主要關聯：AGENTS.md、harness-import.json、TECHNICAL.md。 -->
# AI harness

來源：[jia-jian-log staging 固定版本](https://github.com/sunpochin/jia-jian-log/tree/fefc821045cc92df25101ce1554fb6c80e4e0093)，匯入日期 2026-10-27。
逐檔來源、Git blob、目的地、處理方式及 SHA-256 在 [清單](harness-import.json)。

## 已複製的範圍

保留 `.agents`、`.claude`、`.codex`、`.cursor`、`.serena`、`.githooks`、`skills/`、
`docs/agents`、`docs/ai`、PR/review/worktree/safety/runtime/CRG 工具、對應測試、
mission-control 套件與流程文件、review workflows、reviewlatch、授權及相關相對匯入依賴。
503 份完整來源副本已複製到本機 `vendor/jia-jian-log-harness/source/`，保留原目錄結構，沒有啟用其中的設定。此目錄被 Git 忽略，**不在公開提交中**，新 clone 不會下載它。公開 manifest 只列 17 個實際採用的檔案；完整 503 檔清單位於被 Git 忽略的 `vendor/jia-jian-log-harness/source-manifest.local.json`。公開 repo 不攜帶舊文件正文或整套內部資產清單。
真人帳號、個人本機根路徑與明確 hosted project URL 已替換為示例；清單標明改過的副本。
兩份來源檔案清除空白行上的空格／尾端多餘空行，清單保留原 Git blob 並記錄格式正規化。
公開啟用的來源程式保留 MIT 授權與 reviewlatch notices；其餘來源授權隨本機副本保留，不能套用本產品的非商用限制來取代其原授權。

不屬於 harness 的照護產品程式、病患資料、資料庫 migration、正式部署、備份與藥品同步不匯入。
mission-control 的雲端 schema 只保留來源連結，沒有複製或執行 Supabase migration。
來源參考不是獨立可部署的家健錄，也不保證所有歷史文件的產品連結在副本內存在。

## 目前啟用

| 能力 | 入口 |
| --- | --- |
| 單一規則與工具薄轉接 | 根 `AGENTS.md`、CLAUDE／CODEX／GEMINI、Cursor／Copilot |
| 共用工作方法 | `skills/` 與相對連結入口 |
| 破壞性命令提示／阻擋 | 來源 destructive guard 與必要 parser；Claude／Codex hooks 設定 |
| 可重現自查 | `bun run check`、`bun run test:unit` |
| 提交檢查與禁止直接推 main | `.githooks/pre-commit`、`.githooks/pre-push` |
| 公開前檢查 | `scripts/check-public.ts`，攔截本機副本、憑證與非範例個人識別 |
| 交付與真機證據 | issue／PR 範本及 `docs/agents/` |

## 使用

使用 `.bun-version` 固定的 Bun；目前 harness 沒有套件依賴，不需要安裝產品框架。

```sh
bun run check
bun run hooks:install
# 只有本機保留完整來源時使用：
bun run check:source
```

`hooks:install` 只設定此 clone 的 `core.hooksPath`；每個新 clone 需執行一次。
若已有不同 hooksPath，安裝器拒絕覆寫，先檢查既有設定並整合。
pre-commit 拒絕 main／staging、敏感檔案與部分暫存檔案，然後執行完整 harness check。
pre-push 拒絕任何指向 main／staging 的更新（包括刪除）。Git hooks 是本機防線，伺服器 ruleset 仍由擁有者另行設定。
使用 `bun run test:unit` 的明確 `./tests/unit` 入口；裸 `bun test` 或名稱 filter 可能掃到來源參考測試。

Claude／Codex 的 hook 檔已提供，CLI 的代表性輸入有測試；是否由特定桌面／CLI 版本自動載入，仍須在該工具的 hook 診斷確認。
不把設定檔存在當作所有 AI 工具都已攔截。平台權限與使用者安全邊界持續適用。
來源 parser 不是完整 shell 安全隔離，無法分析藏在任意程式內的命令。

## CI 範本與尚未啟用的整合

[CI 範本](workflows/harness-ci.yml) 已準備好，只有 contents:read、無 secrets、無部署。
目前 GitHub 登入權限缺少 workflow scope，不能寫入 `.github/workflows/`；因此本次交付不宣稱遠端 CI 已啟用或通過。
擁有者可在 GitHub 網頁把這份範本加入 `.github/workflows/harness-ci.yml`，或更新工具的 workflow 權限後再啟用；本次不要求提供 token，也不改帳號權限。

## 刻意未啟用

來源的 PR 自動合併、Codex review status、mission-control、血壓 reviewer、
遠端 MCP、staging／production、雲端任務與自動安裝都只保留參考。
本 repo 尚未設定相關 bot、credentials 或部署；沒有 `pr:merge`／`mission:control` 等可用承諾。
目前只需要標準 GitHub PR 與人工審查，不建立會永遠等不存在 bot 的 gate。

來源 `mergeGuard.ts` 與 `codexReviewGate.ts` 是 destructive guard 的解析依賴，
不代表本專案採用其中 staging、豁免或 bot 政策；沒有對應 workflow 或命令入口被啟用。

## 更新來源

先固定新 commit，再比較逐檔清單；來源副本不可直接編輯為本地規則，也不可取消忽略後整包公開。
有隱私替換或適配時記錄原因、更新 SHA-256 並保留來源 Git blob。
不要將整套來源設定直接覆蓋到根目錄。匯入 manifest／原始指紋是人工審查輔助，不能抵抗惡意 PR 同時竄改兩者。

## 公開邊界

使用者已確認保留 PolyForm Noncommercial，只公開原始碼。採用三層策略：

1. 公開產品需要的規則、skills、Git 防護、必要測試、PR 流程與待啟用 CI 範本。
2. 公開有明確用途的通用工具及其來源授權；目前保留命令防護與 reviewlatch 依賴，新的通用工具再按需求整理。
3. 完整家健錄原始 harness、照護規則、內部事故紀錄與未整理流程只留本機參考。這是產品範圍選擇，不宣稱所有來源檔案都是機密；後續可經針對性清理再獨立公開。

不把 503 份來源文件塞進產品 repo，也不以測試數量宣稱提高生產力或求職成效。需要衡量時記錄交付時間、回歸問題、人工介入與工具成本；沒有實測就不寫改善百分比。
`check-public` 掃描 Git 清單並只輸出問題類別與檔名。它是可維護的基礎防線，不能保證辨識所有個資或未知秘密；每次仍要審 diff，必要時另用 Gitleaks 掃描公開快照與本次 commit 歷史。
