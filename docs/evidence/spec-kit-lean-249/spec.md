<!-- 檔案用途：以官方 Lean specify 指示記錄 #249 可驗收需求。所在層：本次試用規格。主要關聯：plan.md、tasks.md、../issue-249-spec-kit-lean.md。 -->
# AWM 漂移修復指引（#249）

維護者看到固定 AWM 副本的指紋錯誤時，能依產品既有規則回來源修正，並用升版 PR 採用已審版本，避免只改本地指紋而失去來源保證。

## 可驗證需求

- R1：AWM manifest 中的檔案 SHA-256 不符時仍失敗，診斷包含「上游修正」、「已審版本」、「升版 PR」與 `docs/agents/work-methods.md`。
- R2：其他來源 SHA-256 不符仍使用原本的適配／指紋訊息，不套用 AWM 政策。
- R3：正常來源、缺檔、非法路徑、完整副本／額外追蹤檔、skill／規則入口及 exit code 保持原有檢查；不弱化任何 gate。
- R4：全部失敗情境只改可拋棄合成 fixture；產品 AWM vendor、lock、aliases、五個 skills 與工具 hooks 不變。
- R5：Bun 1.4.4 受影響 harness 測試及完整 `bun run check` 通過後，正常 hook、commit／push、非 Draft PR 到 main；CI 與審查證據各自綁 SHA。

## 情境與成功標準

1. AWM 固定內容漂移 → exit 1，明確導回上游與升版 PR。
2. 其他匯入內容漂移 → exit 1，仍是原訊息。
3. 正常 fixture → exit 0；缺檔／額外追蹤檔／壞入口各自 exit 1。

本輪只做工具診斷與官方 Lean 試用記錄，不合併、發布、遷移、升版或改任何產品影音與資料行為。#246 與 AWM #3 保持未完成。
