---
name: "awm-review-evidence"
description: "Review a scoped change or assess review feedback, tying findings, checks and handoff evidence to the actual source revision while separating verification from approval and release."
license: "MIT"
---
<!-- 檔案用途：讓審查意見與交付證據對應正確版本。所在層：可獨立採用的 skill。主要關聯：references/guide.md。 -->
# Review and evidence

1. Establish the intended outcome, change scope, comparison revisions, and any uncommitted changes. Read the full relevant diff and affected callers, not only a generated summary.
2. Trace observable consequences: incorrect behavior, data loss, privacy exposure, incompatible interfaces, inaccessible interaction, and broken failure or recovery paths. Do not invent a defect from a stylistic preference.
3. Reproduce or substantiate each finding. For incoming feedback, decide whether it is correct and relevant before changing code; preserve the reason and evidence when disagreeing.
4. Bind check results, review conclusions, and unresolved items to the version actually inspected. A previous successful check or approval does not automatically cover a later change.
5. Report the user-visible result, findings, validation, limits, and next action using [the evidence guide](references/guide.md).

Automated checks, independent review, human/device acceptance, merge, and release are separate facts. This skill does not grant authority to post comments, resolve threads, merge, publish, or waive a project gate. Use the active task's authorization and project policy for those actions.
