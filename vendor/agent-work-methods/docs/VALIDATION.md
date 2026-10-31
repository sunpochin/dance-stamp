<!-- 檔案用途：記錄檢查與不能由它證明的事情。所在層：驗證說明。主要關聯：../scripts/check.py、../tests/test_bundle.py。 -->
# 驗證與限制 / Validation and limits

先確認每本手冊沒有缺頁，再看它遇到實際問題是否給出合理方法。缺頁檢查能自動做，但不能因此宣稱 agent 一定會照做或做得更好。

## Reproducible checks

Run `python3 scripts/check.py` and `python3 -m unittest discover -s tests -v`. Tests create and remove only their own temporary fixtures. They need no credentials, network, agent account, additional Python package or source-product checkout.

Checks cover frontmatter, required files, independent links, individual copies in unrelated layouts, missing references, escaped links, symlinks, source-product dependencies in instructions, and synthetic credentials. Public scanning catches some accidental disclosures, not every secret. It reports paths/categories without matching content.

## Initial maintainer walkthroughs

| Synthetic task | Expected behavior | Walkthrough result |
| --- | --- | --- |
| Onboard a Python CLI with README and Makefile | Discover existing commands without requiring Bun, staging or a rule filename | Method permits existing layout and commands |
| Old search response replaces a new result | Observe identity/order; fix ownership instead of adding waits | Guide specifies distinguishing observation and recovery |
| UI change has tests from an older revision | Preserve old evidence but identify unverified new behavior | Review method separates evidence from approval |
| Cancel file selection after a prior successful choice | Verify prior selection survives per host contract | Frontend guide covers cancellation and retry |
| Formatter imports code that searches environment files and uploads output | Read imports without execution; do not infer secret/upload permission | Review separates completeness, behavior, fit and authority |

These are maintainer walkthroughs, not independent agent runs. Tests establish package behavior; they do not establish adherence, productivity gains, security certification, cross-client integration, device behavior or human acceptance. Exact commands, commit and CI results are recorded in the publication PR. Consumer-project adoption remains unverified until performed there.
