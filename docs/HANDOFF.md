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

## 2026-10-28 使用者返回，接續 #9

使用者明確要求從 #9 接著做，維持 Web 優先，iPhone 暫不處理。本回合補完桌面合成資料的原生離頁恢復與產品之外的磁碟檔重播；未更動靜態版本 `b52e552869eb154c`。原生 pagehide 在來源 8.376 秒時釋放相機，取回 6.730733 秒已落盤部分，舊自拍保留且新片仍標 interrupted。最終單一 VS 為 1280×720 H.264／AAC、15.000200 秒，FFmpeg 全片解碼與 Chrome 原生檔案播放器完整重播通過。

新增 `capture-navigation.js` 的兩階段原生離頁驗收、`download-playback.js`，並補強既有 self-failure／media-probe 的保存與診斷等待。操作順序與結果見 MEDIA_PROBE.md 及 #9 證據；不能把 async predicate 的 Promise 或 CLI 退出碼當成通過。#33 仍為草稿，真實相機／LED、真正背景／鎖屏／來電、G1／G6、Safari、獨立人工 review 等仍未完成，#9 不結案；也沒有合併或發布。

後續核對遠端：規劃 PR #32 已由另一次使用者授權合併至 main `1d8ed7f`。此分支同步該八份正式規格，保留 #9 程式與受測靜態版本；不是重新授權合併產品 PR。#10 以這份已確認規格接續，仍不啟動 iPhone 工作。

## 2026-10-28 #9 與正式既有雙片入口整合

核對遠端時，另一個使用者聊天已交付 #35（`9935b06`），包含正式既有雙片入口、保存失敗恢復與完整輸出矩陣。本聊天先將自己已測的 dialog 原型及證據保存至 `codex/issue-10-existing-comparison` 的 `7e74663`，不另開重複實作 PR，不改他人的分支；正式整合沿用 #35。

本聊天新建專屬 `dance-stamp-issue-9-integration` clone，從同步 main `1d8ed7f` 建 `codex/issue-9-comparison-integration`，包含 #33 `f77a8bf` 及 #35 `9935b06` 的完整歷史。錄影 stop／chunks／中斷與循環 owner 保留，外部 take 仍 session-only。使用獨立 4177 預覽與資料；#9 的 4175、原型 4176 及其他聊天 4173 均不覆寫。靜態版本 `0daa65c36a468383` 的測試及精確限制見 `evidence/issue-9-comparison-integration.md`；其他 head 的數據不自動算整合版通過。後續仍先 Web，不啟動 iPhone、合併或發布。

整合版最終 323 tests／479 expects／0 fail、22 組 browser 函式通過。20 檔矩陣與無相機 API 檔共 21 份逐格／音訊分析通過，最大差距及新增漂移各 66.667ms、最長重複畫面 133.77ms；十次 60 秒完整輸出 60,052–60,086ms。七份代表檔在產品外完整重播，真正離頁可取回 6.726467 秒已落盤原片且保留 interrupted。原型／整合的合成媒體全部留 ignored output，不進 Git。後續 Web 缺口為 #12 的衝突另存副本與完整媒體清單；全 P0、人工 review、實體相機／背景與裝置驗收仍保持未完成。

## 2026-10-28 #12 備份續作

使用本聊天新建的 `dance-stamp-issue-12-backup` clone，分支 `codex/issue-12-backup-conflicts`，從同步 main `1d8ed7f` 接續 #36 `2145f42`；4177 整合預覽不改，#12 使用獨立 4178 與測試資料。新增匯入預覽／衝突閉包副本、跨來源穩定 ID、實際媒體保存清單與三類缺片人工重連，v1 JSON 不含媒體，副本須明確保存。規則／取捨見 TECHNICAL.md 第 18 節，證據見 `evidence/issue-12-backup-recovery.md`。精確提交／PR、原有檢查及最終回歸由本聊天交付綁定；沒有合併或發布，iPhone 仍暫緩。

#12 受測靜態內容 `cf115ed1d23085b6`：333 tests／540 expects、24 組 browser 函式通過。全新 context 使用實際 JSON 下載還原，逐側連結三類媒體；quota／metadata 交易中取消／真實雙分頁衝突均保留原資料。還原後下載的 VS 與原檔 SHA256 一致，完整解碼及產品外重播通過；原有兩份錄影路徑 VS 也獨立播畢。後續接 #13 的離線、容量與更新安全，仍不合併／發布，裝置驗收與人工審查分開。

## 2026-10-28 #13 桌面離線與資料管理續作

#12 已交付草稿 PR #37，head `9165204975042e763f48b127c16a9e925d336248`，CI 通過，尚未合併。本聊天從同步 main `1d8ed7f` 建新 clone `dance-stamp-issue-13-offline`／分支 `codex/issue-13-offline-safety`，接續 #37；保留先前 4178，#13 用 4179。4180 僅合成更新測試主機，不是產品發布入口。

已補實際資源雜湊檢查、離線／容量／persist 結果、等待更新、個別副本／take／輸出／整份筆記刪除。資料仍為 schema 1，沒有重置或搬移原片；重要取捨在 TECHNICAL.md 第 19 節，精確最終內容與測試在 `evidence/issue-13-offline-storage.md`。原有 gate 與回歸通過後依規則 commit／push／草稿 PR 到 main；人工審查及裝置驗收不能被工具結果取代。

後續先完成 #14 可做的 Web 無障礙／易用性準備；5 人獨立測試與真正裝置結果須由實測提供，不造證。#15 先備妥可審查發布包、來源／同 origin 邊界及回復方案，發布仍需使用者明確核准。iPhone 仍暫緩，沒有合併或部署。

#13 最終靜態內容 `0f75e031af971bc4`：340 tests／589 expects、28 組瀏覽器函式與公開掃描 152 檔通過。離線雙片、離線錄影及等待更新的三份 VS 均 FFmpeg 全片解碼無錯誤，產品外原生播放器完整播完並有音訊；不宣告長片／三速度完整 G2–G7 或真機通過。最新精確提交與 CI 由交付 PR 綁定。


## 2026-10-28 #14 Web 可及性續作

本聊天專用 `dance-stamp-issue-14-accessibility`／`codex/issue-14-web-accessibility` 已整合 main `e9e154a` 的前置審查修正；相對 main 僅本票 13 檔。保留循環重新定位、中斷原片保存同意與可選備份校正副本。修正停用／重繪後焦點、長訊息遮焦、320px／放大文字溢出，補播放器名稱、busy 與診斷分類；取捨見 TECHNICAL.md 第 20 節，證據在 `evidence/issue-14-web-accessibility.md`。

使用者要求完成的 Web PR 使用一般 PR，已將 #31／#33／#36／#37／#38 轉為 Ready for review；狀態轉換未改程式或驗收門檻。後續前置 PR 已在遠端 main，由本聊天核對並保留，沒有代為合併。本票一般 PR #39 更新後的精確 head／CI 以該 PR 為準；真人／真機待驗寫在說明，不一律保留 Draft。

最終靜態內容 `0382343a0a0f73ff`：342 tests／599 expects、18 組受影響 browser 函式、公開掃描 161 檔通過。前一輪 main `80604e7` 的 `47eb899dd15552b9` 為完整 33 組通過，分別記錄，不冒充最終版全套。最終四份代表 VS 來源時間嚴格遞增，全片高精度解碼數與原始影格一致；產品外全數播畢、有音訊解碼且 dropped=0。十組 viewport／文字尺寸、44px 主要目標、焦點及可及性樹通過。

五人匿名空表在 `WEB_USABILITY_CHECK.md`，對齊 #1 三項任務；真人、讀屏實聽及裝置結果未驗證，iPhone 暫緩。下一張 #15 先準備可審查發布包、來源／同 origin 邊界及回復方案；合併與發布需要使用者明確授權。#13 的 4179 保留，本票預覽 4181；沒有搬移或重置舊 origin 的使用者資料。本次專用 4180 更新測試主機已關閉，隔離測試視窗已關閉。
