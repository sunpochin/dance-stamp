<!-- 檔案用途：提供可區分根因的排查與競態觀察。所在層：skill 內參考。主要關聯：../SKILL.md。 -->
# Test an explanation

先記下「做了什麼、應該怎樣、實際怎樣」，再一次改一個會影響判斷的因素。這樣才知道是哪個原因造成問題，不會只是把錯誤藏起來。

Separate these possibilities before changing production behavior:

- **Product:** the implementation violates the intended contract.
- **Test:** setup, timing, subscriptions, assertions, or fixtures fail to represent that contract.
- **Environment:** permissions, unavailable tools, resource limits, versions, or external state prevent the check from running.
- **Expectation:** the requested behavior conflicts with the established contract; clarify the intended outcome rather than silently changing it.

For an asynchronous race, identify who owns each operation, when a result becomes stale, which signal confirms completion, and what cancellation actually stops. Distinguish stopping a wait from aborting an operation, and a write request succeeding from the transaction committing. Check that late results cannot overwrite a newer result.

Example: an old successful search arrives after a newer failed search. Observe request identities and completion order. If the old result overwrites the current state, fix result ownership at the shared update point, then verify both completion orders. Do not make the test wait longer and declare the race solved.

If reproduction remains inconclusive, preserve the failure and attempted explanations, report the missing observation, and add narrowly scoped diagnostics only when they can resolve that uncertainty. Avoid logging private input or credentials.
