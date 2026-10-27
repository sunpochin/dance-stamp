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

## 2026-10-28 · #3 媒體驗證續作

使用者本次要求先確認 #3 進度、完成可做的媒體可行性驗證，並列出手機人工操作；因此已準備可信本機 HTTPS 入口及 [手機清單](PHONE_MEDIA_CHECK.md)，不再沿用上方「不準備手機入口」的舊範圍。實際手機操作仍由使用者完成。

基線為 main `1d8ed7fe50ae556b2db1f161b50c4544cfe955bc`，分支 `codex/issue-3-media-feasibility`。#4／#5／#6 已合併；#9／PR #33 仍是未合併草稿，本輪不帶入它的 runtime 改動，也不借用其舊測試當作 main 證據。原生媒體靜態內容仍為 `9fd3c39cd617733a`。

接手先看 [本輪證據](evidence/issue-3-media-feasibility.md) 與 [重現工具](MEDIA_PROBE.md)。24 組全部成檔，但 20 組因右側約 264–268ms 停格而 G3 fail；減少播放速率更新的短片實驗沒有穩定改善，已撤回 runtime 修改。合成配方三點誤差與真正相機 G2 分開，不能因三點通過而略過停格。Web 需修正，#3 保持開啟；手機先做 15 秒與保存，完整長測暫緩，未觸發 iOS fallback 或發布。手機 CA 及私鑰只留本機 ignored output，不安裝系統信任、不隨 PR 傳送。
