<!-- 檔案用途：說明共用 skills 與來源參考的界線。所在層：AI 操作文件。主要關聯：AGENTS.md、skills/、HARNESS.md。 -->
# Skill 使用與維護

`skills/` 是本專案可用的共用流程；`.agents/skills/` 與 `.codex/skills/` 只放相對連結，避免三份內容漂移。
按任務需要讀一個 skill，不預先載入所有來源文件。使用者明確要求與 `AGENTS.md` 優先。

來源的設計／archify／UI catalog、安全、autopilot 等完整檔案保存在
`vendor/jia-jian-log-harness/source/`，未註冊為本專案 skill。需要其中某個工具時：

1. 檢查來源授權、相對依賴、安裝與網路行為。
2. 移除來源產品的醫療、部署及機器路徑假設，列出本次需要的最小範圍。
3. 補對應驗證，更新匯入清單及 `TECHNICAL.md`，再接到入口。

讀取來源 skill 不代表授權發布、上傳、寄信或讀秘密；不能執行其中的自動安裝／自動派工步驟。
目前不啟用排程或自動挑 issue。明確指定的任務才可開工。
