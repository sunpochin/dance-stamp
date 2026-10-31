<!-- 檔案用途：保存別人能核對的審查與交接證據。所在層：skill 內參考。主要關聯：../SKILL.md。 -->
# Make conclusions checkable

把驗證當成貼在特定版本上的收據：寫清楚測了哪一版、怎麼測、看到什麼。程式換了，舊收據仍有用，但不能直接當成新版已通過。

A useful finding identifies a concrete trigger, observable consequence, relevant location, and supporting evidence. Explain uncertainty when the consequence depends on an unverified assumption. A clean tool report is evidence about that tool's scope, not proof that an independent reviewer examined the change.

Keep a compact delivery record:

- Goal and observable behavior before and after the change.
- Compared revisions, tested revision, and any working-tree changes affecting the result.
- Checks actually run, environment, results, and links or local artifacts that support them.
- Controlled injections, failures, untested paths, and limits of synthetic evidence.
- Outstanding feedback, decisions, and next action.

For example, a command-line test passing against revision A does not establish that a UI change at revision B was reviewed. A browser simulation does not establish touch, screen-reader, audio, or physical-device acceptance. Preserve each result's own scope instead of combining unrelated runs into a stronger claim.

When feedback exceeds the current outcome, record a follow-up in the project's chosen tracker with its own scope and dependency. Do not dismiss an actual correctness or safety defect merely to reduce review rounds. Do not mark incomplete work resolved simply because a follow-up link exists.
