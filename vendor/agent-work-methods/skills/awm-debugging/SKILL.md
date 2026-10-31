---
name: "awm-debugging"
description: "Investigate a reproducible defect or failing check, separate product, test and environment causes, and verify a minimal root-cause fix without weakening the expected behavior."
license: "MIT"
---
<!-- 檔案用途：避免盲目反覆修補的問題排查方法。所在層：可獨立採用的 skill。主要關聯：references/guide.md。 -->
# Evidence-led debugging

1. Capture the trigger, expected behavior, actual behavior, relevant revision, and environment. Retain the original failure before changing anything.
2. Reproduce with the smallest representative input. Label synthetic inputs, controlled delays, and injected failures; do not describe them as naturally occurring defects.
3. Trace the operation through its callers and state owners. Form a falsifiable explanation and select one observation that distinguishes it from alternatives.
4. Fix the owning cause with the smallest compatible change. Preserve previous data and successful output; do not reset storage, widen acceptance thresholds, remove assertions, or replace real behavior with mocks to make a check pass.
5. Verify the original failure and the affected success, cancellation, retry, and recovery paths. Report the tested revision and any environment limits.

When repeated patches fail to support the explanation, pause that approach and revisit the cause instead of stacking workarounds. Use [the guide](references/guide.md) for asynchronous races and inconclusive reproductions. No fixed model vendor or escalation service is required.
