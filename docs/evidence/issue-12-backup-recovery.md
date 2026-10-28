<!-- 檔案用途：綁定備份預覽、衝突副本及三類媒體恢復證據。所在層：Web 資料驗收。主要關聯：DATA_FORMAT.md、MEDIA_PROBE.md、backup-conflicts.js、backup-recovery.js。 -->
# #12 Web 備份與恢復

2026-10-28 Asia/Taipei。基線 main `1d8ed7f`＋Web 整合 #36 `2145f42`，分支 `codex/issue-12-backup-conflicts`；精確提交由交付 PR 綁定。macOS 27.0.1、Chrome 156、Bun 1.4.4，只用合成測片與隔離瀏覽器資料，不上傳影片。

## 本輪結果

受測靜態版本 `cf115ed1d23085b6`。完整原有檢查為 333 tests／540 expects／0 fail，TypeScript checkJs、Service Worker 型別、Biome 與 build 通過；公開掃描與原始 hooks 會在提交時再次檢查。以下結果不代表手機或整體 P0。

- 衝突副本的純資料案例涵蓋整個 Video／asset／take／recipe／export 關聯、不同來源、編輯過的副本、canonical 重匯、陣列次序與 exportedAt、取消、未來版本、孤兒與超限；不接管另一分頁 recording。實際 key／session 與 metadata ready 分開判斷，同名筆記顯示序號但原文不變。
- 瀏覽器從正式雙片入口建立 12／4 秒映射及獨立鏡像，產生真實 VS 與 JSON。預覽未寫入，Escape 保留原配對；確認才另存衝突閉包，新 VS 描述不誤取本機舊輸出，重匯不新增或增加 revision。
- quota 及 metadata put 中按取消均原子回滾；另一份原片的重連預覽／交易中取消保留當下舊配對與輸出。不同來源同 ID 會分開且重匯冪等；真正另一分頁先寫後，舊預覽匯入被 revision 拒絕，較新資料保留。未來版本、壞 JSON、危險鍵及 10 MiB 超限均未部分寫入，筆記 HTML 以純文字呈現。
- 全新 context 先確認 metadata／media 空白，再使用真正下載的 JSON 還原；所有媒體 missing，JSON 無 bytes。示範、自己與 VS 逐側實播／確認；同名裁切老師片因不涵蓋 B 無法確認。原片預設 session-only，不自動保存；VS 保存遭 media quota 時整份回滾且候選可重試，舊比較畫面不變。明確保存三類副本後重開，12／4 映射、鏡像、原筆記、take／recipe 與媒體描述均一致。

三支新增函式 backup-conflicts、backup-recovery、backup-keyboard 與既有 21 支非完整矩陣函式，共 24 組 browser 回歸通過：existing-comparison、comparison-recovery、comparison-capture-fallback、comparison-appearance、comparison-save-failure、media-probe、media-persistence、self-failure、review-recovery、workspace、storage、relink、edges、player、markers、practice、practice-fallback、capture、capture-comparison、existing-no-camera、comparison-keyboard。

鍵盤實測原生 modal、預設取消焦點、頁面持有焦點時 Tab 留在 modal、Escape 取消、Enter 匯入／重連與 Space 確認。500 字無空格長標題與 390×844 版面通過 dialog 及 document clientWidth 的嚴格水平溢出檢查；候選 URL 在完成時全部撤銷，preview src 清除。三張本機截圖已人工檢視，沒有公開媒體附件。

實際 `backup12-generated-vs.mp4` 與 `backup12-restored-vs.mp4` 均為 140894 bytes、4.999367 秒、1280×720 H.264／48kHz AAC，完整 SHA256 同為 `8999b85e9d7282bdf40d0cd6f209c776cce91d9040ecff1c078484ffdf9d9d37`。兩者均 FFmpeg 全片解碼且 stderr 空；還原下載另由 Chrome 原生 file 播放器完整到 ended、error=0、audioBytes=21615，沒有重新轉碼或把 JSON 當成影片。

另取本版本原錄影匯出的 15.002733 秒 VS、同頁切換案例錄影匯出的 15.001200 秒 VS，均在產品外完整播到 ended、error=0、實際有音訊解碼；沒有只看 metadata／下載按鈕。這是本次備份與舊路徑回歸，沒有重新執行三速度／長片完整 G2–G7 矩陣，不引用原 #36 的數據當作本 head 通過。

## 2026-10-28 補驗：完整數量恢復與逐檔缺片

前述 24 組與舊檔案數據保留原版本歸屬。本輪 runtime 基線為 main `d2f126c239a306af603876eb48d78c559a4f86f7`、靜態內容 `2f1ec6b3335cd790`；未改 `web/`、schema 或驗收門檻。新函式 `tests/browser/backup-drill.js` 由本節所屬 PR head 綁定，SHA-256 為 `f77837aefd3cee6db3cebe03bdb66a07feb14edd736b24c695519e3d8d645a67`。

macOS 27.0.1、Chrome 156.0.8078.49 **無視窗**（User-Agent 含 HeadlessChrome）、Playwright CLI 0.1.22、Bun 1.4.4、FFmpeg 8.1.2。全為六秒自製色相／提示音測片；相機與麥克風入口在測試 context 停用。本輪是短片資料恢復驗收，沒有量測長片效能、操作桌面或有視窗背景；沒有清除／接管其他聊天的測試鎖。

- 從產品選片、標記與合成入口建立 **3 份影片筆記、10 個標記、2 個 take、2 個配方、1 個真正 VS**；六份媒體描述為三份示範、兩份自己原片與一份 VS。透過產品實際下載 JSON 及六份媒體後，清除本函式自己新建 context 的測試 origin 資料（IndexedDB、cache、worker），再確認 metadata／media 都為空白。
- 使用剛下載的 JSON 還原；預覽前沒有寫入，匯入後媒體仍全缺片，自動操作逐檔實播、勾選與確認按鈕後才連結；不是實際使用者驗收。明確保存六份副本後重新載入，三份筆記、十標記、兩個配對及獨立鏡像均可由正常入口開啟；老師 1–3 秒、自己起點 0.5 秒，拖到共同時間 1 秒後實際位置為老師 2 秒、自己 1.5 秒。原片的重新下載 bytes／SHA-256 均相同。
- 再以 **6 個獨立 context** 逐一缺少每份媒體，連同完整恢復共 **7 個情境全部通過**。缺片尚未補回時，其他筆記及可用 take 正常；所有 canonical metadata、ID 關聯、時間與鏡像保持原樣，筆記 HTML 字串仍是純文字。取消候選不改其他副本；缺片預設只在本次重連，重新載入後再次顯示 missing，未暗中寫入媒體。
- 原 VS 及七份恢復 VS 均為 **669952 bytes**，完整 SHA-256 相同：`b7bfcbc57ee6e5ce5e5fe79c188c7e62db1c1c9d5e6e3189177f3468f7df38a7`。1280×720 H.264、48 kHz AAC、2.000033 秒；來源六檔、完整恢復原片五檔與七份恢復 VS，共 **18 檔**由 FFmpeg 全片解碼成功且 stderr 空。這是短片下載／恢復證據，不冒充光學同步、長片或其他 G1–G7 gate。

`bun run check` 的固定 Bun 1.4.4 檢查通過：342 tests／599 expects／0 fail、checkJs、Biome、公開掃描與建置；提交時仍執行原 hooks。重現方式見 [MEDIA_PROBE.md](../MEDIA_PROBE.md) 的 `backup-drill.js` 段。沒有新增 runtime 依賴或服務，沒有更動產品 CSP 來方便驗收；下載校驗從真正的下載串流讀回。

本輪未找出需要改 runtime 的缺陷，補的是原共用演練數量及每份媒體各自缺失的可重跑證據。重要變更／PR 仍交 Claude Code 或使用者最終審查；真實跨裝置、手機及完整支援範圍不由這七個桌面情境代替。已知 Safari 儲存／比較阻礙由 [#3 的 PR #46](https://github.com/sunpochin/dance-stamp/pull/46) 記錄，沒有在本票推測修正或操作真正 Safari。

## 限制

這是桌面 Chrome 合成資料的還原演練，不是手機／Safari、真實相機、永久儲存或全 G1–G7 證據。清空測試使用新的隔離瀏覽器資料，沒有清除使用者儲存。JSON 不含影片，手動重連不能憑檔名／大小／時長證明原檔身分。跨裝置、完整發布與重要變更人工審查仍待完成；iPhone 依使用者要求暫緩。沒有合併或發布。
