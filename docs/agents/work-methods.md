<!-- 檔案用途：說明完整固定副本的使用、去重與更新。所在層：共用方法採用。主要關聯：work-methods-lock.json、AGENTS.md、skills.md。 -->
# 共用方法 v0.1.0

像在專案裡放一本完整手冊：選下面的 skill 就能使用，不需要另外下載。各工具的入口只是書籤，指向同一本本地手冊，所以不會在同一 repo 裡改出好幾份正文。

| 任務 | 本地入口 | 產品補充 |
| --- | --- | --- |
| 接手專案 | [awm-onboarding](../../skills/awm-onboarding/SKILL.md) | 根規則、README、TECHNICAL 索引 |
| 排查問題 | [awm-debugging](../../skills/awm-debugging/SKILL.md) | [程式與狀態契約](code-conventions.md) |
| 審查與證據 | [awm-review-evidence](../../skills/awm-review-evidence/SKILL.md) | [媒體驗收與交接](review.md) |
| 介面驗證 | [awm-frontend-review](../../skills/awm-frontend-review/SKILL.md) | [練舞流程](ui-review.md) |
| 外部 skill | [awm-skill-safety](../../skills/awm-skill-safety/SKILL.md) | [影片與資料邊界](skill-security.md) |

## 固定來源與完整副本

[Agent Work Methods v0.1.0](https://github.com/sunpochin/agent-work-methods/releases/tag/v0.1.0)，commit `938619f5472ff4475f702d51e2a466ab0cc63f60`。完整 33 檔（含文件、skills、參考、授權、檢查與測試）原樣保存在 `vendor/agent-work-methods/`；來源、發行包 SHA-256、逐檔 SHA-256 與相對連結記在 [固定清單](../ai/work-methods-lock.json)。

`skills/awm-*` 指向該副本的五個 skill；`.agents/skills/`、`.codex/skills/` 與 `.claude/skills/` 再連到本 repo 的入口。沒有跨 repo 連結、submodule、安裝器或執行時網路讀取。新 clone 不需取得另一個產品。入口可讀與內容指紋不等於所有客戶端都已驗證自動發現。

## 維護與更新

通用修改回來源 repo 完成並發布；本 repo 不直接修改固定副本。升版時核對精確 commit 與發行包，整份換成已審版本，更新清單與入口，再用 PR 檢查 diff 和 `bun run check`。不隨遠端分支或 `latest` 自動更新。

有意保留跨 repo 的版本副本，換取各自離線、自足與獨立更新；同一 repo 裡只保留一份通用正文。媒體／資料／語言／分支／推送／審查與發布政策仍由根規則和本產品文件決定，不交由共用套件覆寫。原有文件與 skill 名稱只保留產品補充及相容接線。
