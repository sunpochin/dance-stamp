<!-- 檔案用途：把介面檢查落在操作與失敗恢復。所在層：skill 內參考。主要關聯：../SKILL.md。 -->
# Check behavior around the screen

像第一次使用的人一樣，從開始操作到拿到結果，再試一次取消和失敗。畫面好看還不夠，使用者也要知道現在發生什麼、下一步能做什麼。

| Area | What to observe |
| --- | --- |
| Main task | Clear entry point, understandable primary action, completion and return path |
| State | Empty, loading, success, failure and retry; read errors distinct from write errors |
| Layout | Narrow/wide view, zoom, long labels and errors, essential actions remain reachable |
| Input | Keyboard sequence, visible focus, native controls where suitable, no hover-only task |
| Meaning | Useful labels and messages; status does not rely on color or an unexplained icon alone |
| Recovery | Input and previous output survive relevant failure/cancellation; repeat operation works |

For example, canceling a file chooser should not clear a previously selected file. A failed save should not clear an edited form or display success. Confirm the established product behavior before reporting a finding; some operations intentionally complete despite a UI wait being canceled.

Record the revision, dimensions, input method, browser/environment, steps, expected and actual result. A screenshot establishes appearance at that moment; it does not establish keyboard reachability or persistence. If no real device or assistive technology was used, leave that acceptance unverified.
