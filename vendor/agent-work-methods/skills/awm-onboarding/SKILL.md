---
name: "awm-onboarding"
description: "Orient within an unfamiliar code repository before a scoped change: find applicable instructions, relevant code, checks, and work in progress without loading unrelated files."
license: "MIT"
---
<!-- 檔案用途：提供不綁產品的專案接手方法。所在層：可獨立採用的 skill。主要關聯：references/guide.md。 -->
# Repository onboarding

Find the smallest reliable map for the requested task. This method does not supply project policy or authorize changes to other repositories.

1. Establish the requested outcome, repository root, current revision, and existing changes. Preserve work that is not part of the request.
2. Read applicable project instructions and the repository's documented entry point. Follow its links only as needed; do not assume a particular rule filename, documentation layout, package manager, or branch model.
3. Trace the relevant entry point, shared implementation, callers, data boundary, and existing checks. Distinguish current behavior from plans and historical evidence.
4. Identify local commands and prerequisites from owning configuration. Read commands before running them; do not install tools, load credentials, or contact external services merely because an old guide says to.
5. State the intended result, focused change, validation, and material gaps. Continue authorized work; ask only for information or approval that the next action actually needs.

For an unfamiliar layout or handoff, read [the guide](references/guide.md). Report concrete paths and findings, rather than a generic repository tour.
