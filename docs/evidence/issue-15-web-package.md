<!-- 檔案用途：記錄獨立下載包與本機使用流程的實測，不當成已發布或真人驗收。所在層：#15 工程證據。主要關聯：RELEASE.md、START_HERE.md。 -->
# #15 Web 下載包候選

2026-10-28 Asia/Taipei，macOS 27.0.1／Chrome 156／Bun 1.4.4。main `e9e154a` 加前置 #39 `7bb96a6`，本票 `codex/issue-15-web-package`；精確提交及最終壓縮檔 SHA256 由交付 PR 綁定。沒有合併、公開發布、建立主機帳戶、DNS 或帳務變更；iPhone 仍暫緩。

## 包與來源

靜態版本 `5bc414f1b847bf47`。八份 HTML／CSS／JS 的實際 HTTP 內容與前置 `7bb96a6` 來源逐 bytes 相同；媒體、資料格式及時序算法未改，只有 SW 的版本隨共用標頭政策重新建立。不得移用 #39 或更早 head 的全 G2–G7 作本版通過。

來源完整 check 為 344 tests／612 expects／0 fail，checkJs、SW 型別、Biome、build 及公開掃描 168 檔通過；原有 hooks 與下載包校驗照常執行，CI 由 PR 記錄。白名單包為 35 檔，包括應用、獨立本機主機、開始說明、資料／媒體契約與必要 LICENSE／NOTICE；沒有 Git、node_modules、影片、筆記資料庫或備份。原生 tar 盤點全是一般檔案、uid/gid=0、無本機帳號欄位。每檔內容、release.json、SHA256SUMS 及整包雜湊分開記錄，不宣稱簽章或 bit-for-bit 可重現 archive。

測試先將真正壓縮檔解到來源 repo 之外的全新資料夾，不安裝任何套件，僅按 START_HERE 使用 Bun 執行隨包主機在 127.0.0.1:4182。原生 shasum 全部通過；故意改壞實際 main.js 時原生校驗失敗，恢復原 bytes 後再次通過。另在建置目錄放合成額外檔案，真正 package CLI 拒絕且舊 archive 雜湊不變，隨後只移除此合成測試檔；沒有清理或重置使用者資料。

原生 Archive roundtrip、未知／缺少／竄改、格式錯誤、公開掃描命中、排序、符號／硬連結與未知目錄另有可重現單元回歸。建置寫入前共用同一檢查；實際放合成連結後執行 package:web，確認拒絕、連結另一端 sentinel 與原有 Web bytes 全部不變，隨後只移除此測試檔。包內資料不作產品備份，checksum 不能讓不可信任來源變可信任。

## 實際入口與核心流程

21 個實際 HTTP 檢查：11 份可讀資源的 bytes 與解壓檔一致，具正確 MIME、no-store、CSP 及 Permissions-Policy；HEAD 空內容。內部檔案、.env／Git、測試控制路由及 POST／PUT／DELETE 均 404。沒有相機／影片上傳 API。

九組隔離 browser 函式通過：package-entry、markers、existing-comparison、media-probe＋media-persistence、backup-conflicts、backup-recovery、capture-comparison、offline-storage。實際開啟來源是獨立包，非 repo dev server。package-entry 核對 secure context、空資料環境、實際回應、唯讀白名單及 SW 資源完整；其餘完成標記重播、兩條 VS 路徑、同頁切換／重開、衝突副本、跨頁失敗恢復、全新 context 匯入與逐片重連，以及 context 斷網後重開。無真人／實體相機，使用既有合成影片與合成相機設定；工具退出碼之外亦核對 ### Result 且無 ### Error。

## 獨立成檔

四份真正下載檔均 1280×720 H.264／48kHz AAC，來源影格時間嚴格前進。ffprobe 逐格盤點與 FFmpeg 1:90000 高精度／passthrough 全片解碼，全部 exit 0、stderr 空、解出影格數等於原始影格。備份前及全新 context 還原後的 VS SHA256 相同。

| 案例 | bytes | 秒 | 原始／解出影格 |
| --- | ---: | ---: | ---: |
| 錄影到 VS | 2015219 | 15.000400 | 450／450 |
| 已有雙片到 VS | 517341 | 4.969292 | 150／150 |
| 備份還原後的 VS | 140802 | 5.000033 | 150／150 |
| 同頁整合錄影 VS | 2060057 | 15.001467 | 450／450 |

SHA256 依表順序：`023dcb9fb6929c5ee98881bae15210705e573dbbde495060fb032c23fff6b1eb`、`f522da05c958b8c91c411667c07ff24326b227d01c10d4e6a797de65c84a43f2`、`aed3974193bc88decfc33fe99ea697779b8af1b5ed049009d40f5a0cb88619db`、`5704dead9c3974b203c9ad12a339e2e5411f6639e6653e4ed8cd32148abfd541`。全部在產品外原生 file 播放器完整到 ended，error=0、dropped=0，有音訊解碼；依順序 audio bytes 21358／5746／21615／20832。不把原生播放計數當成原始影格數，也不把音訊解碼當成喇叭／藍牙實聽。

## 邊界及待驗

公開來源盤點與免費方案均記在 RELEASE.md；公開 API 只能確認 72 個公開 repo／5 個 Pages 旗標，未證明完整同 origin 可信，因此不選共用 github.io origin。本輪專用 localhost，pages.dev 只是待核准候選，沒有實際公開主機的標頭／隔離／P0 驗收結果。發布前須重新核對供應商規則與實際 hostname。

工程結果不代替 5 位舞者、實體相機／手機、讀屏實聽、音訊路由、真實背景／鎖屏／來電、全 G1–G7 或人工審查。#15／#14／#1 保持開啟；這是可取得的本機候選交付，沒有正式 beta、公開下載站或已完成裝置支援的宣告。最終 archive 需在提交後乾淨來源重建，確認 sourceRevision 與 trackedChanges=false；已測主機／應用 bytes 再與交付包核對，結果由 PR 綁定。

## 2026-10-28 外層輸出連結補查

本聊天專用 clone，從當時 main `d2f126c` 的新分支整合 #40 `eead3a1`；只補 #15 打包保護，不改 #39 分支。main 新增的 #8／#9／#13 QA 與歷史證據保留原版本歸屬，未重做或擴大其驗收。最終來源 commit、乾淨重建的 archive SHA256 及 CI 由同一 PR #40 新 head 綁定。

Bun 1.4.4 的實際完整 CLI 回歸在修正前失敗：archive 是連到合成 sentinel 的符號連結時，打包仍以 exit 0 完成。修正後兩個外層輸出各測符號連結、懸空連結、硬連結及目錄，八種都在打包寫入前拒絕，sentinel 與另一份舊產物 bytes 不變；之後移除本測試建立的異常路徑，正常完整建包與 manifest 校驗通過。沒有讀取私人媒體或操作他人目錄。

完整 `bun run check`：345 tests／648 expects／0 fail、checkJs、SW 型別、Biome、建置與公開掃描通過；`package:web`／`check:package` 通過，仍為 35 檔、靜態 `5bc414f1b847bf47`。`web/`、本機主機、資源政策與開始指南對 `eead3a1` 無差異，因此本輪不重跑既有九組 browser、21 HTTP 或媒體矩陣，上述實測仍綁舊 head，不宣稱本輪重新驗收。沒有發布、部署或更動供應商決策，免費方案仍須實際發布前重查。

## 2026-10-29 隨包主機讀檔連結補查

本輪從最新 main `918d8d7aa814533823522e3d4e0ab18df75cb212` 建獨立 clone／新分支，只處理 #15。已讀 PR #55 `2372aa4` 的 Safari 文件與包白名單增量，沒有把尚未合併的已知增量另報為 bug；未操作 Safari、瀏覽器、媒體鎖、相機／麥克風或私人檔案。使用 Bun 1.4.4，無新增依賴。

既有打包／建置的連結拒絕測試仍通過，但沒有測到啟動後的 HTTP 路徑：合成候選的 `dist/web/main.js` 換成指向候選目錄外 sentinel 的符號連結，舊主機實際 GET 回 200、body 等於 `synthetic outside candidate`。此回歸先在未改主機時明確失敗，再修正每次讀取前的完整路徑 lstat；保留原網址、Bun.file 傳輸與回應政策。

`tests/unit/serveWeb.test.ts` 真正啟動自己的 loopback 子程序，以系統分配的 port 避開既有主機；不靠 HTTP mock。12 份白名單資源的內容／政策、正常 HEAD、五條禁止路徑與三種寫入方法維持原行為。主機啟動後，合法檔名逐一換成符號連結、懸空連結、硬連結及目錄；GET／HEAD 都 404、沒有 sentinel 原文，sentinel bytes 不變，還原一般檔案後可再讀。另將包根目錄、dist、web 各換成連結，均 404。既有 releasePackage 回歸照常驗 manifest／checksum、夾帶、缺檔、竄改與外層輸出保護。

完整 `bun run check`、`package:web`、`check:package` 通過；靜態版本仍 `db129e273cf0039b`，`web/`／授權／共用政策／開始指南未改。真正 40 檔壓縮包解到本任務 repo、Git 與 node_modules 之外，不安裝套件即可按隨包入口啟動；本輪另跑自己的 21 項 HTTP 檢查，逐檔 bytes、MIME／政策、HEAD、禁止路徑／方法均通過。實際解壓包在啟動後換 main.js 連結也拒絕；還原後原生逐檔 SHA256 再通過，整包校驗與原生 archive 讀回通過。預檢不宣稱抵禦其他本機程式同時競態換檔；仍須使用可信任且專用的目錄。

上述實測先在有修改的候選完成，精確測試數、最終提交、提交後乾淨包的 sourceRevision／trackedChanges=false、整包 SHA256 及與受測執行資源逐檔相同的結果由交付 PR 綁定，避免把測試中來源 main 識別誤寫成最終 head。沒有重跑或承接舊版 24 組／十輪媒體數據，不宣稱本 head 有新媒體或 Safari 驗收。#15 保持開啟；人工最終審查、真人／實體裝置、完整媒體、公開主機隔離／HTTPS／標頭與發布核准仍未完成，iPhone 暫緩。未合併、部署或建立公開下載／Release。

## 2026-10-30 裸包文件連結與 #14 有界複查

本輪基線 `c0ab39bcf68354cc29d7048a0d81e56d626efcf1`，Bun 1.4.4、macOS 27.0.1、Chrome 156；在本聊天全新 clone 的 `fix/issue-15-package-document-links` 工作。實際 HTTP／browser 來源是該基線加文件與測試修正的工作樹包，`trackedChanges=true`，不是乾淨最終 head；靜態仍 `422c70c3633b8e88`。Web、主機、政策、白名單與 SW manifest 沒有變更。最終提交與乾淨包由 PR 綁定，不把後補文件當重新跑媒體。

### 重現與最小修正

原回歸只檢查操作指南的 `docs/evidence/*.md` 連結，漏過八個包外相對目標：MEDIA_PROBE 與歷史媒體證據的手機清單兩處、RECORD_COMPARE／儲存救援／有界音訊證據的 TECHNICAL 四處、更新證據的原始碼兩處。這些完整來源庫檔案沒有進發布白名單，裸包開啟時會斷鏈。擴充既有測試後先在未改文件時失敗，首個缺檔為 `docs/PHONE_MEDIA_CHECK.md`；修正後 35 份隨包指南、證據與根授權 Markdown 的 114 個本機相對連結通過。

八處改為明示「需連網」的固定基線 GitHub 連結。需要完整來源庫的開發／手機命令不偽裝成裸包操作；離線使用、資料恢復及匿名支援證據仍隨包。未遞迴打包來源庫、擴大白名單、增加依賴或改寫歷史驗收結果。純文字 HTTP notice 副本仍由根授權文件產生；其來源授權檔隨根文件保存，不新增 HTTP 路由。

### 實際裸包與介面檢查

受測工作樹 archive 為 **58 檔／278,214 bytes**，SHA256 `ff813dc4de3c98c5d19a64a94d69ce2e92a468f6638d8594150887d6f074d044`。真正解到來源 repo、Git 與 node_modules 之外的新資料夾，不安裝套件，只用隨包主機啟動；原生 tar、57 份 SHA256SUMS、56 份 payload 內容與官方 checker 都通過。

- **43 項 HTTP 檢查**：13 個公開資源逐一 GET／HEAD，核對 body SHA256、空 HEAD、MIME 及四份共用政策；六個非公開路徑逐一 GET／HEAD 回 404，POST／PUT／DELETE／PATCH／OPTIONS 回 404。`release.json`、Git、環境檔、設定與測片沒有變成可讀路由。
- 同一裸包依序執行原 `package-entry.js`、`accessibility-focus.js`、`accessibility-layout.js`、`accessibility-media.js`，四份都有真正 `### Result` 且無 `### Error`。初始資料空白、secure context、SW 全部資源完整；本輪沒有重跑離線斷網／多頁換版或完整資料救援矩陣。
- 保存／編輯／清單重繪、modal 返回、quota 失敗焦點、停止不被搶焦及 busy 收尾通過。五組 viewport 各以 100%／200% 根字級共十組，未見水平溢出或小於 44px 的可用目標；停止鍵及 Tab 焦點可見。長狀態原生鍵盤捲動、重連預設不保存及取消返回通過；兩份本機截圖已目視核對。
- 瀏覽器原生 AX tree 的老師／相機／自己／VS 名稱、禮貌完整狀態與進度名稱通過。合成相機第一次拒絕、明確重試共兩次，麥克風請求為零，所有測試 tracks 結束、preview 清空、產品外請求為零；診斷及 JSON 未含注入的合成敏感字串。錄影至合成共 8 次狀態更新，沒有逐影格洗版。
- 代表 VS 下載 **2,079,764 bytes**，SHA256 `caf06b1c66426495d6f72b743e4a7bc5f790d66a8c10f0b95342731f53d268eb`；FFmpeg 全片解碼 exit 0，保留 null 輸出兩筆 DTS 訊息（401／442），不宣稱 stderr 空或新增 G2–G4 通過。本輪沒有產品外完整播放、聽感或同步品質量測。

測試前以 `wx` 原子取得共用媒體鎖；使用新自有 profile、合成素材與動態 loopback port。結束核對 10 個已知自有 Chrome PID 全部退出，自己的主機停止，nonce 相符才放鎖；raw、影片、profile 與 private runner 僅留 ignored `output/`，沒有上傳。最初受限環境不允許 HTTP listen 的失敗與後續允許本機連線後成功分開記錄，未弱化原回歸。

### 界線

這是特定 Chrome／裸包／既有可及性函式的有界工程複查，沒有在該範圍重現需改產品介面的新缺陷。工具綠燈不代表五位真人或其中 4/5 已完成；讀屏實聽、實體觸控／safe area、真人相機／音訊、Safari／私人模式、跨實體裝置、完整媒體 gates、獨立 Claude Code／使用者最終審查與發布核准均保持原未驗條件。iPhone 暫緩。沒有修改 #73、Safari 演算法、合併、部署、發布或關閉 #14／#15。

## f95a256 實際 Markdown 產物的獨立審查

2026-10-30 Asia/Taipei，另一個作者在獨立 clone 核對 PR #76 最新 `f95a2564a06d6d7f2e5dd0a9dd785a83e300e3ca`，先保持既有交付分支乾淨，再開本聊天審查／修正分支。沒有啟動瀏覽器、相機或操作共用媒體鎖；沒有進行裸包 HTTP 驗收，完整 check 的既有 HTTP 單元仍會啟動自己的測試服務。

以原 `package:web`／`check:package` 分別建立乾淨基線 `c0ab39b` 與乾淨 #76 包，兩者都通過當時的官方 checker。獨立直接讀 archive 的實際 bytes：基線 36 份 Markdown／127 個本機連結有 13 處缺目標，含 #76 所述的八處與授權副本五處；#76 的 36 份／119 個本機連結仍有五處缺目標。八個改成固定 `c0ab39b` 的來源連結均標示「需連網」，對應來源檔存在；所有操作／恢復指南本身的本機連結已修好，沒有重改這八個連結或擴大白名單。

漏檢來自 `dist/web/THIRD_PARTY_NOTICES.md`：根文件的五個 vendor／docs 相對連結原樣複製到 dist/web，Markdown 從新位置解析會落到不存在的 dist/web/vendor 或 dist/web/docs。HTTP 仍以純文字提供，但副本本身是包內 Markdown，現有來源測試明確排除 dist，封裝及 checker 也沒有檢查其連結。新增負向案例在修正前以真實授權原文重現 seal 未拒絕，**1 fail／1 expect**；不是新增 Markdown／URL 格式的假想案例。

最小修正讓建置只在 Markdown 授權副本的既有 inline 本機連結加回包根目錄路徑；根授權、授權原文、網址與本機附帶目標仍保留。版本、SW manifest 與實際輸出共用同一份轉換後 bytes，因此靜態版本改為 `86a9d6394a6bd31a`，授權副本及衍生 SW bytes 有變；`web/` 媒體／儲存／UI 原始碼、HTTP 路由／標頭、打包白名單及授權條款不變。不能把 #76 的舊 HTTP／瀏覽器收據轉移到此新版本。

seal／verify 的共用 owner 現在直接核對傳入包內所有 Markdown bytes 的既有 inline 本機連結。回歸包含原五處漏檢、真正建置的授權副本與 SW manifest 全 bytes hash 相同、完整 Markdown payload 的實際 archive 往返與 checker，保留原路徑／完整性／公開掃描負向測試；此檔 **6 tests／176 expects／0 fail**。真正 CLI 亦會以文件連結缺目標拒絕原基線包，而非讀 repo 的已修文件取得假成功。

修正工作樹重新沿原入口打包與校驗後，獨立查核實際包的 **36 份 Markdown／119 個本機連結，0 斷鏈**。原完整 `bun run check` 通過 **410 tests／1631 expects／0 fail**、236 檔公開掃描、型別、原 lint 與 build；19 項原 lint info 保留。提交／推送 hooks、最終乾淨 head／包的 sourceRevision、checksum 與 CI 由交付 PR 綁定；工作樹包不冒稱乾淨最終提交。這是檔案與既有連結格式的工程證據，不含新 HTTP／原生瀏覽器、媒體或裝置驗收；Claude Code／使用者最終審查及所有原未驗收條件保留，iPhone 暫緩，未合併、部署、發布或關票。
