<!-- 檔案用途：記錄 #14／#13 保存狀態未知時的鍵盤保全與證據界線。所在層：匿名工程證據。主要關聯：storage-recovery-keyboard.js、issue-13-unconfirmed-storage.md、TECHNICAL.md。 -->
# 保存狀態未知時的鍵盤保全

## 驗證範圍與重現入口

`tests/browser/storage-recovery-keyboard.js` 匯出 `storageRecoveryKeyboard(page, fixtures, folder, report, kind)`，`kind` 為 `title` 或 `import`。呼叫者先原子取得共用媒體鎖、啟動隔離 loopback 主機與全新 Chrome profile；完成後必須核對自己的瀏覽器程序、主機及 nonce，再釋放自己的鎖。不得使用既有庫；測試發現非零 revision 就拒絕，不會清庫。

`fixtures` 包含 `origin` 與 `reference`、`self`、`vs` 三份既有合成檔的絕對路徑；`folder` 是 ignored output 內本輪專用目錄；`report(stage, result)` 將收據留在本機。測試不生成新 VS、不啟動相機／麥克風、不用一般 viewport 或容量矩陣補數。

1. 透過真正 `writeLibrary` 種入合成筆記、非空標記及三份媒體，再重載同頁，由產品開啟已存老師片、自己片與既有 VS。檔案／筆記種入及 fixture 選取屬前置準備，不列為鍵盤驗收。
2. 正式匯入預覽的 Escape 與取消按鈕都不提交，完整 metadata／revision／媒體 keys／三份 Blob bytes 必須不變。
3. `title` 從標題保存觸發，`import` 從原生 modal 的確認匯入觸發。QA 在真正 metadata put 後額外執行重複 key 的原生 add，讓瀏覽器真正產生 ConstraintError 及 abort。觀測器用原生監聽保留 trusted error／abort；只抑制產品的 complete／abort listener，讓真正 storage.js 依既有寬限進入未確認。
4. 不偽造事件、不替換產品儲存結果、不縮短寬限、不把注入稱作 Safari 自然失敗。必須觀察 trusted error／abort、無 complete、busy=false、寫入入口停用、modal 關閉、焦點位於可見的救援備份按鈕，以及可及樹的 alert／live 與控制名稱。
5. 救援後只以 Tab／Enter 到達備份與三份原片／VS 下載連結，核對真正下載串流的全部 bytes。備份只含最後確認資料，不含未確認候選；唯讀原生播放器仍能以鍵盤播放／暫停，Escape 及拒絕重開不能寫入或移除資料。
6. 確認產品「重新開啟同一頁」後，仍在同一 context／profile／origin 讀回舊庫；完整原生 metadata、revision、keys、chunks keys 及 Blob bytes 必須等於基準。另以隔離空 context 走真正產品匯入，確認救援備份的七張資料表可還原；此新 context 只驗備份，不用來推論舊資料持續性。

未知狀態的完整內容核對使用 QA 自己的唯讀原生連線；產品封鎖旗標保持原狀，不用替代連線繞過封鎖。正常鍵盤／匯入測試見 `backup-keyboard.js`、`accessibility-focus.js`；未知狀態的共同封鎖與 Promise 行為見 `storageCompletion.test.ts`，本輪只補真正 DOM／Tab／下載／AX 的交集。

## 本輪版本與結果

2026-10-30 Asia/Taipei，macOS 27.0.1／Chrome 156.0.8078.76 headless／Bun 1.4.4。產品來源為乾淨 main `6862501d3cfaaa7cf3916d875fd06dd8dfdd13ec`，靜態版本 `4651fae419d8d9c8`；執行時只有本回歸與文件未提交，Web 來源未修改，收據的十三份 Web／授權資源逐 byte 等於當次建置。這是本輪工作樹測試，不能改稱提交後另跑一次。

- 最終回歸 SHA256：`a950159b43961cd4f9de173bfa196032a46a344dd09dd755e725dfcdefd9f794`。
- 最終本機 raw 收據 SHA256：`d5bba8998df75c5b5a4fd26d9f509bf98458b052144bcc1dcd2e25b3e58f9f54`。包含兩案的原生事件、metadata／keys、AX 文字、下載指紋與收尾；三十份原生 binary 快照及真正下載檔另外留在 ignored output，未公開資料庫 ID／origin／profile／nonce。

| 查核 | title | import |
| --- | --- | --- |
| 原生錯誤／結束事件 | trusted ConstraintError／abort，無 complete | trusted ConstraintError／abort，無 complete |
| 未確認後的焦點／忙碌／modal | storage-backup；四區 aria-busy=false；無 modal | 相同；原確認匯入 modal 關閉 |
| 寫入／換片／刪除／匯入入口 | 真 DOM 停用，後續無新增 readwrite 交易 | 相同 |
| AX／鍵盤 | assertive alert 的實際文字子節點可讀；Tab／Enter 下載；原生播放器 Space 播放／暫停 | 相同 |
| 筆記備份 | 真正下載 1,701 bytes；最後確認七表等值；不含候選新標題 | 真正下載 1,701 bytes；最後確認七表等值；不含候選匯入 |
| 舊庫保留 | 基準／Escape／取消／未確認／同頁 reload 的 revision 3、metadata、keys、空 chunks keys 及完整三份 Blob 相同 | 相同 |
| 實際還原 | 隔離空 context 走產品 import-confirm，revision 1、七表相同 | 相同 |

兩案各自的三份真正媒體下載與對應 fixture／原生 Blob 全部 bytes 相同：老師原片 1,789,027 bytes，SHA256 `3fb42ffb14678b8c944d605cab684a1919801de7908c1f540f7fbfc29ea26548`；自己原片 1,630,207 bytes，`a4d1a7add319661dfd76ae77c51c263ab2bf8a6f1eecbe6ded73accda071fb70`；既有 VS 287,536 bytes，`945721d43d36bd0e489715b78e54131204442f5bb78314dd6d770e8c31dca7ce`。沿用既有合成 fixture，沒有重跑成檔或影音品質矩陣。另一次只讀核對逐一重讀三十份 native binary 與六份真正媒體下載，仍相同。

救援備份及媒體下載完全由 Tab／Enter 觸發，沒有用 focus()／滑鼠直達救援入口。原生匯入 modal 的 Escape／取消由鍵盤操作；瀏覽器 JS 重開 confirm 與 beforeunload 對話框則由 Playwright dialog 協定拒絕／接受，不冒稱實體系統對話框的鍵盤驗收。拒絕重開仍保留未確認旗標；接受後才在同 profile／origin／分頁 reload 讀回。讀回與隔離備份匯入分開記錄。

兩案媒體擷取 API 呼叫為 0；兩個自有瀏覽器及其中隔離還原 context 已關閉，十四個已知自有 PID 均確認退出，兩個自有主機不再回應，僅在 nonce 相符後釋放自有鎖。沒有刪除／接管別人的鎖、profile、程序或資料。

沒有重現需要改產品的缺陷；只新增這支回歸與匿名證據，既有 `showStorageRecovery`／`operation`／`updateControls`、儲存寬限、資料格式與產品 bytes 不變。當前來源沒有 `withBusy`／`renderCapabilities` 名稱，對應流程位於上述實際控制器。完整原 `bun run check` 通過 435 tests／2,042 expects／0 fail，以及型別、Biome、公開掃描與建置；提交 hooks／最新 head 的 CI 另由 PR 綁定。

### 保留的前置失敗

兩次鎖忙均於啟動瀏覽器前 EEXIST 拒絕，後續有界等待自然釋放才原子取得，沒有推斷原持有人已失效。另兩輪停在合成資料前置的原生 select 操作，尚未觸發未知情境；收尾均已確認。後續使用 fixture 選取 API 做前置，救援階段仍完全走鍵盤，未放寬產品或救援門檻。首次完整 check 受限於環境無法啟動 loopback 測試埠，434 pass／1 fail 保留；允許本機監聽後沿原入口全過，沒有改測試。Bun bundling 的語法預檢無法解析瀏覽器內的 `/storage.js` import，改以 `node --check` 確認語法；真正來源已在上述瀏覽器執行。

首輪兩案通過後，補強 AX 斷言：空 alert 節點不足，必須有可讀的實際文字子節點。最終同兩案重新從頭通過，以上數據只歸屬此最終收據；先前收據不覆寫。

## 未驗證

這是 Chrome、合成資料與明示通知抑制。原生 ConstraintError／abort 只證明本案例的真實回滾，不代表 Safari 的 UnknownError 已自然復現，也不能證明任意未知交易當下已回滾。此輪不驗新 VS 的成檔／持久化、程序中斷、容量矩陣、實際低磁碟、私人模式、真 VoiceOver 聽感、觸控、實體手機或真人五人觀察。iPhone 暫緩；#14／#13 保持開啟，Claude Code／使用者最終審查與發布核准分開處理。
