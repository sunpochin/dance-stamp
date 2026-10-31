<!-- 檔案用途：說明如何用少量閱讀找到真正的修改入口。所在層：skill 內參考。主要關聯：../SKILL.md。 -->
# Find a useful map

先找這次工作會走過的入口、共用程式和檢查，就像先找目的地的路線，不必把整張地圖背下來。這樣能減少讀到無關或過期規則的機會。

Start with the requested behavior, then collect only evidence that changes the implementation decision:

| Question | Useful evidence |
| --- | --- |
| What governs this work? | Applicable instructions, user constraints, nearby module documentation |
| What actually runs? | Entry points, imports, configuration, existing commands and tests |
| Who else uses it? | Callers, shared state owners, public interfaces, persistence format |
| What must survive? | Existing changes, user data, previous successful output, compatibility |
| How will success be observed? | An existing behavior check and its actual prerequisites |

A missing conventional filename is not an instruction failure. A Python service, static website, and command-line utility can have different maps. Search for the owning source instead of creating a new convention to satisfy this method.

Handoff: record the goal, exact revision and working-tree state, relevant paths, decisions, checks and results, gaps, and next action. Keep durable design in the project's chosen documentation location; link to it rather than duplicating an entire specification into chat.
