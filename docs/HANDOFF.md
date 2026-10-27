<!-- 檔案用途：關機前保存可接手的 Web 工作節點。所在層：交接文件。主要關聯：WEB_PREVIEW.md、MEDIA_PROBE.md、evidence/web-preview.md。 -->
# 關機交接 · 2026-10-27

使用者要求實作 #1，後改為「先做 Web，不要管 iPhone」，最後要求關機前告一段落。此節點是桌面 Web 預覽，整體 P0 未完成。

已實作：選片、IndexedDB 筆記／revision／媒體／錄影 chunks、明確重連、時間標記 CRUD、變速／A–B／鏡像、倒數相機、共同時間線／offset、單一帶音訊 VS、保存／下載、JSON 備份／原子匯入、靜態離線資源。無 runtime 套件、付費 API、帳號或媒體上傳。

分支 `codex/web-media-probe`，從 main `fe4daf4` 建立，使用獨立 worktree，原 checkout 不動。PR／完整 commit 以此聊天最後交付及遠端分支為準。程式與重現腳本均會進同一提交，不依賴暫存目錄。

接手順序：

1. 核對遠端 PR 最新 head、review，讀 AGENTS.md、TECHNICAL.md 第 10 節及此文件；不直接合併或部署。
2. Bun 1.4.4：`bun run check`；`bun run dev` 在本機 4173 開預覽；靜態產物為 `dist/web/`。
3. 按 MEDIA_PROBE.md 用合成測片重現三支 browser 函式。產物都在 ignored output，不放真人媒體。
4. 優先複核交易／恢復及時間映射，再補 15／30／60 秒、三速度、真正輸出同步及十次長錄影。G1–G7 不降低，JS 時鐘不代替成檔量測。
5. 對照 #5–#13 補驗收，尤其衝突備份另存副本、完整資料管理、migration／quota／恢復矩陣；此版只有部分能力，不一併關 issues。

限制／授權：

- iPhone／iOS 已由使用者移出本次範圍，不再要求先準備手機入口。
- #4 已保留原生 JavaScript 並新增 TypeScript checkJs／Biome；僅開發依賴，runtime 無套件。
- JSON 不含影片；同 ID 衝突整份拒絕，尚無另存副本選項。
- 瀏覽器儲存不是永久保存。中斷 chunks 不一定能解碼，讀回失敗不能改 ready；仍需下載原片與 JSON。
- 真實相機、完整同步／穩定性、Safari、5 位測試者與正式發布尚未完成，無獨立人工審查。
- 合併、部署與新增必要外部服務仍需明確核准，本次未獲授權。
- 主分支已由 #23 啟用 CI；本次讓 CI 安裝鎖定工具後跑同一 check。具體遠端結果須查看最新 PR，不以本機成功代替。

測試狀態見 evidence/web-preview.md。後續若失敗先重現，不弱化 hook、不重置儲存、不隱瞞未驗證。

## 續作進度

#2 已在 main 核對並結案；#4 交付 PR #26，CI 與全新 checkout 通過，#25 已由 #26 取代。#5 接著補 native migration 回滾／重試、明確媒體狀態、同名短片重連保護、Web Locks 互斥；精確 head 與測試結果看各票 PR。仍不自動合併或部署。

#6 接續補播放器兩階段換片、失敗恢復位置、自拍原配方保留，以及媒體啟動 Promise／事件的共同清理。桌面方向／格式矩陣及錯誤、取消、十次換片均有可重現測試；見 evidence/issue-6-local-player.md。
2026-10-27 續作：#4 已由 PR #26 合併到 main `9e99ae6`，包含一般／循環音訊恢復與編輯歸屬保護。#5 同步此基線，保留兩邊儲存與審查回歸腳本；#5／#6 仍需各自審查，#7 接著補時間標記的完整驗收。

#7 完成桌面時間標記驗收：草稿保護、共用毫秒邊界、點／區間 CRUD、重開與衝突恢復；合成 H.264 三次實際顯示 seek 最大約 25ms。316 tests 與相關 browser 回歸通過；見 evidence/issue-7-time-markers.md。#5／#6 已同步 main 審查修正且 CI 成功；仍依序等待獨立 review／合併，沒有發布。下一張 #8 補完整循環與 callback 清理。

## 2026-10-28 續作

#5／#6 已由 PR #28／#29 合併，main 為 `6be83d1`；#7 PR #30 尚待審查。原始 checkout 的 Git 資料夾已不在原路徑，保留舊 worktree 檔案，從遠端建立本聊天專屬 clone 接續 #8，沒有重建或覆寫原資料夾。

#8 已修啟動取消競態、單一回捲、callback 清理、速度恢復、鏡像靜態更新與能力提示。120 次合成循環顯示越界最大約 83.333ms，停止後 callback=0；但此自動化環境不能產生真正 hidden，原生背景 gate 保持未驗證，不能關 #8。見 evidence/issue-8-practice-loop.md 與三支 practice browser 驗收。後續需補實際桌面背景驗收；同時仍可在另一張票接續 #9 的軟體與合成錄影矩陣，不能用那些結果代替本票 gate。整體 #1／G1–G7、人工 review、發布與真機證據仍未完成。

## 2026-10-28 使用者要求暫停

使用者說「先休息一下吧告段落我要當 dj 了」，因此停止開發，不開始下一張票。整體目標暫停，#9 尚未結案；此提交是可接手的草稿節點，沒有合併或發布。

- 實際有效 Git 工作位置是本聊天新建的 `dance-stamp-issue-8` clone，完整本機位置由聊天交付。分支 `codex/issue-9-capture-recovery`，基線 main `6be83d1`，包含未合併 PR #30／#31 的前置內容。不要在已失去 Git 來源的舊 worktree 提交，也不要重建或覆寫原 checkout。
- #9 已補倒數取消歸屬、相機方向／預覽／停止清理、原生 start 觀測、編碼錯誤後尾塊排空、chunks 完整性、quota 原片保留及 interrupted 恢復。受測靜態版本 `b52e552869eb154c`；完整證據見 `evidence/issue-9-capture-recovery.md`。
- 321 tests、型別／lint／公開掃描／build 通過；最終版本九種速度／時長合成錄影皆可下載並由 FFmpeg 全片解碼，12 支既有 browser 回歸通過。真人相機、LED、真正背景／鎖屏／來電、G1／G6、Safari 與人工 review 仍未驗證；#8／#9 均不可直接關票。
- 暫停前關閉本次測試瀏覽器與本聊天 4175 服務；不動其他工作的 4173。合成原片在 ignored `output/media-probe/captures-final/`，不進 Git。暫存 log 非必要來源；重現腳本已進版控。
- 續作先核對此分支與草稿 PR、執行原本檢查，再獨立完整解碼本輪 VS 並確認音訊。Bun 需 1.4.4；目前可用執行檔在舊 worktree 的 ignored `output/tooling/bun-1.4.4/bun-darwin-aarch64/bun`，新機依鎖檔與專案安裝說明準備。
- 後續 #10 已由人類確認新增「比較已有影片」正式 P0，兩支影片匯入不必等 #9 真機門檻；它與邊播邊錄皆須完成，不能用現有自拍測試入口算完成。先重讀最新 #1／#10 及規劃 PR #32（尚未合併），避免把兩個流程互相取代。iPhone 仍依使用者要求暫不處理。
