<!-- 檔案用途：說明選取、複製與更新完整 skills。所在層：公開教學。主要關聯：../README.md、../TECHNICAL.md。 -->
# 採用與更新 / Adoption and updates

先挑一個真的需要的 skill，把整個資料夾帶走，像借一本完整的小手冊。專案仍用原本規則；想換新版時，先看改了哪裡，再決定要不要換。

## Get a reviewed source

Clone or download the collection at an exact revision you review. Record its URL and commit in your dependency record. A branch name or moving `latest` reference is not immutable.

```sh
git clone https://github.com/sunpochin/agent-work-methods.git
```

Inspect the selected commit and changes before copying. This guide does not silently trust the current branch tip or install every skill.

## Copy a complete skill

Use a location documented by your agent client. Create its parent if needed and confirm the destination does not exist. For example, from this collection, replace `/path/to/project` with the intended project:

```sh
test ! -e /path/to/project/.agents/skills/awm-onboarding && cp -R skills/awm-onboarding /path/to/project/.agents/skills/
```

`.agents/skills/` is an example location, not a guarantee of discovery by every client. You may instead provide the full `SKILL.md` path. Confirm actual discovery; do not change global settings or install into another project as a side effect.

Copy `SKILL.md`, `references/`, `LICENSE` and `NOTICE.md` together. The skill has no dependency on the root README, another skill, or a source product. The target keeps a complete local copy even if this repository is unavailable later.

## Keep decisions local

Point the agent to actual project instructions, commands, data boundaries, failure contracts and acceptance criteria. No new configuration schema or policy document is required. Do not overwrite existing rules with this collection's maintainer AGENTS.md or turn an example, preference or prior approval from another project into authority.

## Update deliberately

Compare the adopted commit with the candidate. Review instructions, references, licenses and any new executable content; this first version has no executable skill helpers. Preserve local adaptations and resolve conflicts explicitly. Update the complete selected skill and its source record together through the consuming project's workflow.

Publication does not install or update either source product. Each can adopt a reviewed version separately.
