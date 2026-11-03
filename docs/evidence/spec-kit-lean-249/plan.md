<!-- 檔案用途：依官方 Lean plan 指示規劃 #249 最小修改。所在層：本次試用計畫。主要關聯：spec.md、tasks.md、../issue-249-spec-kit-lean.md。 -->
# 實作計畫

已讀 feature.json、引用 owning AGENTS.md 的 constitution 與 spec。使用既有 Bun 1.4.4、TypeScript 檢查程式及 bun:test，不加產品依賴或框架。

1. `scripts/check-harness.ts` 保持原迴圈與所有判斷，只在指紋不符的訊息依 `vendor/agent-work-methods/` 路徑分流。AWM 使用上游修正／已審版本升版 PR 的指引及產品文件路徑；其他來源原文保留。
2. `tests/unit/harness.test.ts` 增加最小整合回歸：把 Git 追蹤內容複製到自有暫存 fixture（保留相對 symlink，並清除 fixture 子程序繼承的 Git repo 環境），執行真正 check-harness。先驗正常，再只改 fixture 裡的 AWM／其他來源、缺檔、額外追蹤檔與規則入口。斷言訊息及 exit code，不鏡像檢查器實作、不改產品 vendor。
3. `TECHNICAL.md` 索引連到單份試用紀錄；該紀錄保存安全審查、官方 CLI 設定與生成證據、操作重播、耗時／unknown 費用、同 session 接手與版本收據。只保留使用過的四份生成指示及必要設定快照，其餘工具 scaffold 不提交，結束後停用局部註冊。
4. 既有完整 check、正常 hooks、diff、commit／push、PR 到 main；遠端 CI 與既有獨立審查只按實際結果記錄。

不抽新 helper、不建立 runner／Adapter；訊息在既有指紋檢查處選擇即可。拒絕只改本地 lock 指紋或對全部來源套 AWM 政策，因為前者破壞固定來源規則，後者改變其他來源的維護契約。未啟用 git／agent-context extensions、核心 research 派工或工作流引擎。
