---
name: "awm-frontend-review"
description: "Review a changed web interface through its real user task, including responsive layout, keyboard and touch interaction, focus, loading, error, cancellation and recovery states."
license: "MIT"
---
<!-- 檔案用途：提供框架與產品中性的前端檢查。所在層：可獨立採用的 skill。主要關聯：references/guide.md。 -->
# Review the user journey

1. Identify the actual user task, changed screens, supported environments, and the project's existing design and accessibility requirements.
2. Walk the primary task and relevant empty, loading, success, error, cancellation, and retry states. Confirm that displayed success corresponds to the operation's actual result.
3. Check the changed interface at relevant widths, orientations, text lengths, and zoom levels. Use keyboard and available touch input; verify readable labels, visible focus, sensible focus return, and access to essential actions.
4. Keep read and write status distinguishable. Check that late results do not replace newer state and that failure or cancellation preserves previous input and successful output according to the product contract.
5. Verify in the actual interface where available, check console errors, and report exact environment and gaps. Use [the guide](references/guide.md) for a focused checklist.

Reuse the host project's components and acceptance criteria. Do not impose a framework, color scheme, language count, package manager, media workflow, or deployment policy. Simulated viewport and input evidence must retain those limits.
