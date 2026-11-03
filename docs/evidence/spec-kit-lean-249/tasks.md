<!-- 檔案用途：依官方 Lean tasks 指示追蹤 #249 依序實作。所在層：本次試用任務。主要關聯：spec.md、plan.md、../issue-249-spec-kit-lean.md。 -->
# 任務

## Setup

- [x] [T001] 核對 `AGENTS.md`、`docs/agents/skill-security.md`、固定工具來源與 issue #249，建立隔離工作區；保存原生流程基準。

## Foundational

- [x] [T002] 在 `tests/unit/harness.test.ts` 加入直接執行檢查器的可拋棄合成副本回歸，先確認舊訊息無法通過新驗收。

## User story

- [x] [T003] 在 `scripts/check-harness.ts` 只分流 AWM 指紋失敗訊息，受影響測試通過。

## Polish

- [x] [T004] 在 `docs/evidence/issue-249-spec-kit-lean.md` 保存試用／接手／測試與回復紀錄，`TECHNICAL.md` 加索引；封存實用生成指示並停用本輪局部註冊。
- [x] [T005] 完整 check／diff／正常 hooks、commit／push，開 main PR，記錄該 head CI 與既有審查狀態；不合併。
