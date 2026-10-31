<!-- 檔案用途：先解釋使用方法，再記錄邊界與取捨。所在層：設計文件。主要關聯：README.md、docs/ADOPTION.md、docs/VALIDATION.md。 -->
# 設計與取捨 / Design decisions

## 怎麼用、為什麼有效

像拿一本只教做法的小手冊：挑這次需要的方法，把整個資料夾帶進自己的專案，再照自己的規則操作。手冊提醒你找入口、重現問題、留下證據，但不決定產品怎麼部署或誰能合併。

每個資料夾都有完整參考與授權，單取一個也不缺頁。固定版本讓你知道目前採用了哪套方法，更新時能先看差異。

## Packaging and policy

Five text-only skills use standard `SKILL.md` frontmatter and one-level, skill-local references. Short instructions route to reasoning and examples on demand. Each includes LICENSE and NOTICE.md so an individual copy preserves its distribution context; this small duplication of legal text is intentional.

Root documentation supports adoption and maintenance, not mandatory consumer rules. There is no installer, plugin, remote fetch, global symlink, auto-update or executable skill helper. Branch targets, push policy, language, framework, storage contracts, acceptance thresholds and publication authority stay local.

Provenance records the MIT baseline. Methods are rewritten from that source, rather than copied from later product-specific derivatives. No application, database, deployment, incident or credential material is imported.

## Validation

`scripts/check.py` and `tests/test_bundle.py` use Python's standard library. The checker validates the narrow frontmatter used here (JSON-quoted YAML scalars), required files, names, independent links, unsafe paths and common accidental disclosures. It is not a general YAML parser or proof of trustworthy instructions. The skill-authoring validator also checks frontmatter during initial preparation; it is not a consumer dependency.

Tests copy individual skills into unrelated synthetic layouts. Negative cases remove a reference, add an escaped path or symlink, introduce a source-product dependency, and include a synthetic secret. Maintainer walkthroughs inspect realistic tasks; they do not measure agent effectiveness. See [validation](docs/VALIDATION.md).

## Rejected alternatives

- A full archive would carry unrelated assumptions; only five concrete workflows are included.
- Live shared rules or cross-repository links create external-state dependencies. Complete pinned copies preserve independent operation.
- An installer/synchronizer needs more permissions and conflict handling than this version requires. Adoption uses explicit copies and reviewed updates.
- A universal constitution turns local choices into rules for strangers. This collection is a selectable library of methods.
