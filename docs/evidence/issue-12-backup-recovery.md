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

## 2026-10-29：整合 main 的資料保留稽核

受查基線為 main `918d8d7`（PR #54 已合併）。本輪只修改純資料回歸與本節，沒有改 `web/`、交換格式、儲存交易或媒體流程；精確測試提交由本節所屬 PR head 綁定。使用 Bun 1.4.4、專用全新 clone 及合成 metadata，沒有操作相機、麥克風、私人影片或其他聊天的資料。

本輪沿 `main.js` 的選檔／`parseBackup` → `planBackupImport` 預覽 → 確認／`writeLibrary` 檢查資料流。以下是程式碼與既有測試的覆蓋盤點，不代表本輪重跑瀏覽器：

| 資料保留條件 | 既有保護與可重現入口 |
| --- | --- |
| 未知版本、壞 JSON、超限、危險鍵與孤兒關聯 | `validateBackup` 逐欄重建；預覽前驗證，`library.test.ts`、`backupImport.test.ts` 與 `backup-conflicts.js` |
| 同 ID 衝突、不同來源、已編輯副本、重匯 | `planBackupImport` 計算 typed 關聯閉包及穩定 ID；`backupImport.test.ts`、`backup-conflicts.js`、`backup-recipe-copies.js` |
| 預覽取消、容量不足、交易內取消、另一分頁 revision | 預覽不寫入；確認才以原 revision 執行單一交易，失敗不替換頁面 state；`backup-conflicts.js`、`moves-storage.js` |
| JSON 缺片與逐側重連 | `mergeBackup` 將新增 asset 標為 missing，不寫媒體；`backup-recovery.js` 與 `backup-drill.js` 含逐檔缺片、取消、重開及下載 bytes 核對 |
| v1→v2 讀取與失敗重試 | `migrateLibrary` 只改記憶體，成功交易才落盤；`moves.test.ts` 與 `moves-storage.js` 含舊版保留、quota 回滾、重試與跨頁衝突 |

在此有界範圍內沒有重現需要修改 runtime 的資料保留問題。發現一個測試覆蓋缺口：`backupImport.test.ts` 的空庫案例原標示 v1，但 fixture 沿用 `newLibrary()`，目前實際產生 v2。修正該測試名稱，另加明確 `schemaVersion: 1` 的完整 Video／reference／take／recipe／VS 備份案例：

- 還原到空庫時升為 v2、保留來源 ID、筆記、12／4 秒映射及鏡像，媒體描述全為 missing；再匯不新增。
- 匯回同來源但已新增分類、Move→Marker、Video／take 獨立拍點的 v2 庫時，逐表核對所有原有列及本機媒體狀態完整保留；舊版內容另存完整關聯副本，新 VS 不借用舊媒體。
- 原始 v1 與正規化後 v2 內容重匯都不新增；兩份輸入保持不變。這是 metadata／狀態測試，沒有以此宣稱實際影片 bytes、IndexedDB 或跨裝置已重新驗證。

本輪相關回歸（`backupImport.test.ts`、`library.test.ts`、`moves.test.ts`、`beats.test.ts`）為 **26 tests／363 expects／0 fail**。完整 `bun run check` 及提交 hooks 的結果由交付 PR 記錄；不沿用前節的 24 組、恢復下載雜湊或 PR #54 的矩陣數字當成本 head 新測結果。

共用媒體／桌面／效能鎖由主聊天持有，本輪未取得或變更鎖，未執行瀏覽器、Safari、媒體或效能矩陣。跨裝置／完整支援範圍、Claude Code 或使用者獨立審查仍未完成；iPhone 依指示暫緩，#12 保持開啟，未合併或發布。不新增後續票或擴張 #18 分享範圍。

## 2026-10-30：備份容量邊界修正

本輪從最新 main `c0ab39bcf68354cc29d7048a0d81e56d626efcf1` 的獨立 clone，沿實際 `validateBackup`／`planBackupImport` → UI 確認 → `writeLibrary`、動作／拍點保存與取消、未確認狀態 → `downloadBackup` 追查資料流。#17／#18／#19 已有實作；有界程式稽核與下列單元測試未重現新的關聯、白名單、ID 冪等或取消接線缺陷，不重寫功能。精確最終來源由本節所屬 PR 的 head 綁定，不把 main 或舊瀏覽器收據當成新來源已測。

找到並先重現 #12 的容量邊界缺陷：530 個合成標記，每筆 note 仍 ≤20,000 字，完整原始 metadata 為 10 MiB 減 128 bytes，通過原驗證；實際 `downloadBackup` 加縮排後產生 **10,521,284 bytes**，超過 `parseBackup` 的 **10,485,760 bytes** 上限，因此無法還原。反例在修正前失敗，沒有改上限或刪短內容換取通過。

修正只讓共用下載函式先驗證新 exportedAt，輸出不加縮排的 JSON。正常備份與保存未確認的救援使用同一路徑；schema、分享白名單、匯入 ID、原生交易、Blob 與草稿保護不變。新回歸直接執行產品下載函式，只替換 DOM／URL 出口，實際 Blob bytes 不超限且可經 `parseBackup` 再匯入：逐表保留 Video／Move→Marker／take／recipe／VS 描述、獨立拍點快照、來源 ID，重匯不新增且原始 state 不變。救援仍只含最後確認的筆記，不含未保存草稿或影片。

Bun 1.4.4 的六份相關單元（backupImport、library、moves、share、beats、storageCompletion）**41 tests／582 expects／0 fail**；原完整 `bun run check` **409 tests／1581 expects／0 fail**，包含公開掃描、型別、原 lint 與 build，靜態版本 `9ef2b8488982695f`。原 19 項 lint info 保留。首次受限執行環境的完整檢查在既有 HTTP 單元開啟本機主機時失敗；允許 loopback 後從頭執行相同 check 全過，未修改測試或品質門檻。其餘證據屬修正工作樹；原 hooks、最終乾淨 head／CI 的結果由 PR 綁定。

本輪沒有啟動瀏覽器、相機、媒體或效能量測，也沒有取得／變更共用媒體鎖。這是純資料及實際控制器函式的證據，不能代替原生 IndexedDB／quota／Stop、下載落盤、媒體 bytes、Safari／私人模式、真人／跨實體裝置或發布驗收；既有相關瀏覽器函式只作流程核對，未在本輪重跑。iPhone 暫緩，#12／#17／#18／#19 保持開啟，Claude Code 或使用者最終審查待完成。完整檢查、受測來源與結果另由 PR 記錄。

### 日期與零餘裕 UTF-8 續審

續審來源為 PR #75 原 head `1dc8aef343f6aa961b90b7a3d7b2a5c157b8829b`；本次只補測試與文件，產品 `web/` 與靜態 `9ef2b8488982695f` 不變。原先保留 128 bytes 的案例不足以證明零餘裕；因此移除此餘裕並改用漢字及 emoji（`舞💃`，UTF-8 為 7 bytes、JS 為 3 個字元），仍逐筆遵守 20,000 字上限。

實際可達性核對：

- `validateBackup`／`parseBackup` 接受並保留 `2026-10-30`（10 字元）及 `2026-10-30T00:00:00Z`（20 字元）；但 UI 匯入不是把此物件直接存入。本機初始值由 `newLibrary` 建立，最初 v1 來源 `814312c` 與目前都用 24 字元的 `new Date().toISOString()`；`mergeBackup` 複製本機封裝，`planBackupImport` 空庫只採來源 library ID，沒有複製匯入時間。正常編輯、讀回與 v1→v2 migration 保留本機時間。
- v1／v2 × 上述兩個短日期共四案，經產品 `parseBackup` → `planBackupImport` → `writeLibrary` → `readLibrary` → 實際 `saveData` → 再讀回。匯入檔分別為 **10,485,746／10,485,756 bytes**，匯入後與後續保存快照都恰好 **10,485,760 bytes**，本機日期保持原 24 字元。正常及救援共用 `downloadBackup` 的八次 Blob 都恰好到上限，可 `parseBackup`、空庫重建、逐表比對及重匯冪等，不改 state、不另讀寫 DB。交易使用既有事件測試後端，並非原生 IndexedDB／真正 UI 點擊或未知事件驗收。
- 另將短日期原檔補到整整 10 MiB：外部 parser 接受，但既有合併封裝增加 14／4 bytes，使 `planBackupImport` 在預覽前拒絕；測試確認尚無 metadata 寫入。這是既有匯入容量界線，並非本次新增拒絕或成功恢復，不以此假裝短日期已進入本機。未在目前產品入口重現「短日期被保存後，匯出改 24 字元而超限」，因此沒有新增日期 fallback 或修改匯入政策。

零餘裕首輪另揭露原共用 `graph()` 簡化 fixture 省略 `mediaIncluded:false`，白名單補欄後會額外增加 24 bytes，造成測試失敗；該失敗收據保留。核對所有目前 asset 建立 owner、外部 parser 與最初 v1 owner 都必定填此欄後，邊界 fixture 明確帶入相同欄位，再從頭執行，沒有改產品或放寬斷言來掩蓋失敗。合法零餘裕產品形狀的完整 v2 關聯案例亦通過。最終檢查、head／CI 由 PR 綁定，不把這些函式回歸升格為裝置或原生瀏覽器驗收。

### 讀回狀態與可攜容量的獨立續審

2026-10-30 Asia/Taipei，另一個作者在獨立 clone 核對 PR #75 最新 `87e04e85813bbf02452ee57bfba71910b4904cb6`，沿實際 `parseBackup` → `planBackupImport` → `writeLibrary` → `readLibrary` → `saveData`／共用 `downloadBackup` 追查。沒有重做已完成的短日期結論，也沒有啟動瀏覽器或碰共用媒體鎖。

先建立完整 Video／Move→Marker／reference／take／recipe／VS 關聯，包含合法 interrupted take、影片拍點及 `mediaIncluded:false`；以真正合併後的大小填入 UTF-8 漢字／emoji 筆記，每筆仍 ≤20,000 字元。外部檔小於上限，經原 parser 與合併 owner 後 metadata 恰好 **10,485,760 bytes**，成功保存。讀回沒有媒體副本時，原 owner 把該 take 的 asset 從 missing 改為 interrupted，完整 state 變成 **10,485,764 bytes**。在未修產品時，直接執行原 `downloadBackup` 因 `validateBackup` 白名單前的大小檢查拋錯，得到 **1 fail／4 expects**；沒有下載，也沒有人工塞入不可能的短日期或 runtime 狀態。這是 #75 尚未解決的既有容量缺口，不是縮排修正新增的資料遺失。

修正僅把共用 `validateBackup` 的 10 MiB 檢查移到白名單重建之後，檢查真正可攜內容。`parseBackup` 的原始 UTF-8 檔案檢查及 UI file.size 檢查完全保留；沒有提高外部上限、刪減筆記、移除本機狀態、改 schema 或重寫交易。所有允許欄位／關聯／危險鍵仍逐項驗證，分享白名單不變。只在下載排除狀態不能處理讀回後的初始化、保存與重匯，因此改在所有呼叫者共用的驗證 owner。

新回歸沿相同可達匯入／保存／讀回後，再執行產品 `saveData` 將可攜內容補到恰好 10 MiB，重讀超過該大小的本機 runtime state，確認狀態完整保留。正常／未確認救援兩次產品 `downloadBackup` 的實際 Blob 均恰好 10 MiB，包含新的 exportedAt；逐表、來源 ID、空庫還原與同庫重匯冪等均成立，下載不修改 state 或開交易。另確認允許內容多 1 byte 時驗證／保存拒絕且不開交易；即使超出的只是未知欄位，超大外部原檔仍由 parser 先拒絕。此單一完整關聯案例 **1 test／51 expects／0 fail**；DOM／URL 與交易事件仍用既有替身，不宣稱原生 UI、IndexedDB、下載落盤或 Safari 驗收。

修正工作樹的原完整 `bun run check` 通過 **411 tests／1833 expects／0 fail**、公開掃描 236 檔、型別、原 lint 與 build，靜態 **0e9c7c7af09286e2**；19 項原 lint info 保留。提交／推送 hooks 與最終 head／CI 另由交付 PR 綁定。本輪工程審查與純邏輯回歸不代替 Claude Code／使用者最終審查，也不承接其他聊天的原生備份 UI 結果；產品 UI／真實傳檔、真人／跨實體裝置與發布驗收仍保留，iPhone 暫緩，未合併、部署、發布或關閉未驗收票。

### c46f0b5 原生正常／注入救援的獨立補驗

2026-10-30 Asia/Taipei。固定乾淨 [PR #78](https://github.com/sunpochin/dance-stamp/pull/78) `c46f0b537b501d1d5e1c9cf9da93f9fdbfddc38f`、靜態 `0e9c7c7af09286e2`、來源 CI #151 success；此來源已含 #75 的 87e04e8，沒有重複合入 #75。[PR #79](https://github.com/sunpochin/dance-stamp/pull/79) 的舊 87e04e8／8 KiB 餘裕結果保持原版本，本輪從頭重跑，不移記或合併次數。這次沒有重現新產品缺陷，之後只補本節匿名文件。

macOS 27.0.1／Chrome 156.0.8078.49 headless、Bun 1.4.4，獨立 clone、全新 profiles 與隨機 loopback origin，SW 禁用。受測 14 份建置資源各留 SHA256，產品程式、CSP、parser／UI 上限與交易未改；測試開始 trackedChanges 為空，相機／麥克風／畫面擷取呼叫 0。影音鎖只原子取得自己的 nonce，不操作 Safari 設定或日常瀏覽器。

本線負責正常／注入救援、既有資料／媒體保留；整合包的恰好 10 MiB 普通下載由第四線另驗，外部信任邊界由第三線另審，不能把那些結果加進本輪。

| 本線實際產品流程 | c46f0b5 的結果 |
| --- | --- |
| 8 KiB 餘裕正常及救援 | 使用同一個完整 v2 合成形狀：1 video、3 asset、260 marker、1 take、1 recipe、1 export、1 move，含漢字、emoji、換行、分類與獨立拍點。真正點產品按鈕，兩份磁碟下載各 **10,477,568 UTF-8 bytes／4,229,598 UTF-16 code units**，全部 canonical 欄位及來源身分等於預期，沒有截斷或提高上限。 |
| 實際下載檔還原 | 兩份檔各經產品 file input → 預覽 → 確認保存至獨立 persistent profile；預覽及取消不寫入，重匯冪等。reload 及同 profile 新 Chrome 程序重開後，完整原生 metadata 相同；JSON 沒有媒體，三類副本仍 missing。 |
| 已存在筆記／原片 | 先經產品匯入小型完整資料、預覽重連並保存兩片，再匯入大檔。舊記錄與 **1,789,027／1,630,207-byte** 原片逐 byte 保留；獨立逐欄比對全部 268 筆新記錄、重建後 typed 關聯、時間／鏡像／拍點。取消、重匯及 reload 皆保留。VS 只有描述、未提供媒體，不宣稱驗了 VS 成檔。 |
| 滿額 interrupted take 的救援 | 另建原始 UTF-8 JSON 恰好 **10,485,760 bytes**，經產品預覽／確認及 reload，take 保持 interrupted，缺片 asset 讀回也為 interrupted。只點注入後的救援入口，真正下載 **10,485,760 bytes／4,237,790 UTF-16 code units**；七張表與來源 ID 完整相同，未保存的新標題不混入。 |
| 滿額救援的取回 | 救援後明確同頁重開，原生 metadata 完整相同；實際救援檔再經新 profile 的產品預覽／確認、重匯、reload 及同 profile 新程序重開，完整保存相同，media keys=[]。本線沒有執行滿額普通下載或第四線整合候選的瀏覽器測試。 |

本輪滿額 fixture 的三種大小分開記錄：原生 metadata.data 為 **10,485,889 bytes**（包含 129 bytes 本機副本欄位），`readLibrary` 再把 missing 改為 interrupted，runtime 變成 **10,485,893 bytes**，可攜白名單內容仍恰好 **10,485,760 bytes**。這證明本輪可達的滿額可攜資料及讀回 +4 bytes；與上節原工程反例「metadata 本身恰好滿額再 +4」是不同 fixture，不替換原反例數字。滿額 UI 的未保存標題只換同 UTF-8 大小的一字，確實到達 metadata put，沒有讓超額預驗證誤當注入成功。

兩個救援案例都明示注入：對真正 metadata 交易拋同步 UnknownError，並抑制產品 complete／abort listener；QA 原生 listener 仍收到 isTrusted=true 的真正 abort。產品因缺收據進入 StorageUnconfirmedError 並顯示救援，實際下載只含最後確認資料；下載前後交易計數各維持 1，沒有重新讀寫 DB。接受產品同頁重開的原生確認／離頁提示後，unknown=false、完整舊值及原片 bytes 保留。Chrome 在這些注入案實際已 abort，不能當成 Safari 真正沒有結束通知、自然 UnknownError 或未知交易當下已證明回滾。

三份真正下載 SHA256：正常 `4c504742396581905156a83daf15d58a9a97eea2972adee91b019c121bc802ad`；8 KiB 餘裕救援 `dd3b044da022279f380dbfbf23b8bf3bb9d6888edb0c0f8824fcf7af9e4c3b46`；滿額救援 `64f0cabbd8576b6a4ac24da29305d9a0f4eab1eb9b36e8ac896e368c9911d104`。

56 份完整原生 metadata／keys／Blob 快照、14 次產品預覽與所有原片 binary 另以獨立讀取逐欄／逐 byte 核對，未清庫或替換下載函式。原始總收據 SHA256 `fac9bc3452da2876a6d63702c7174e13eecf670207d9025a8fd9aa5e1ec666ad`，獨立核對 `7c9b7eff64ef2ce029e33ed42deac678cc9f2d6d10c8c305dec62da13e97e9a4`，私有 runner `646855690fa404e59c9d04642bf5a366b54ea5a8d6733a9af56b11f809212dc2`。raw、合成媒體、profiles 及私有 QA 只留本聊天 ignored output。

九次 browser 關閉、65 個已知自有 PID／六個精確 profiles 核對無殘留；程序查詢 stderr 必須為空，自己的 server 回 connection refused，僅按自有 nonce 釋鎖。交叉清理收據 SHA256 `abe83ab1746cb59e94aba76bc252e7ba7c686bde34194155f1c5d74526342bae`。沒有停止其他聊天或日常瀏覽器。原 `bun run check` 同版通過 **411 tests／1833 expects／0 fail**、公開掃描、型別、原 lint 與 build；19 項原 lint info 保留，文件 head／hooks／CI 與包另由交付 PR 綁定，14 份 runtime 須逐 byte 等於受測 c46f0b5。

本輪不代替外部超限／未知欄位的獨立審查、零餘裕普通下載／整合包、Safari／私人模式、真正未結束交易、永久保存／低磁碟、真人／實體／跨裝置或 Claude Code／使用者最終審查。Web 優先、iPhone 暫緩；未合併 main、部署、發布或關閉未驗收票。

## 限制

這是桌面 Chrome 合成資料的還原演練，不是手機／Safari、真實相機、永久儲存或全 G1–G7 證據。清空測試使用新的隔離瀏覽器資料，沒有清除使用者儲存。JSON 不含影片，手動重連不能憑檔名／大小／時長證明原檔身分。跨裝置、完整發布與重要變更人工審查仍待完成；iPhone 依使用者要求暫緩。沒有合併或發布。
