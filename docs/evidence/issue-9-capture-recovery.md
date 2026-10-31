<!-- 檔案用途：記錄 #9 桌面錄影、失敗恢復與真機缺口。所在層：版本驗收證據。主要關聯：capture.js、capture-matrix.js、TECHNICAL.md。 -->
# #9 錄影與中斷恢復

2026-10-30：目前 main `c0ab39b` 的原 capture-integrity／capture-drain 已獨立重跑；早停、真短片拒絕、同頁重試、救援刪除及尾塊鎖保護通過，五份實際下載在網站停止後由新 Chrome/file 播至 ended。完整來源、時間戳訊息及 Safari 操作前置限制見[本輪有界稽核](issue-3-current-protection-audit.md)，不改標下方歷史來源或宣稱 Safari／實體相機驗收。

2026-10-28，Asia/Taipei。macOS 27.0.1、Chrome 156（UA）、Bun 1.4.4。受測靜態內容 `b52e552869eb154c`，精確提交見 PR。只用合成 H.264 示範、Y4M 假相機與模擬失敗；沒有真人相機／私人音樂。

## 已重現並修正

原版 #8 在倒數取消後，原自拍的 offset 保持 0，新建立但未錄影的 take 卻被改成 100ms，狀態仍 recording。修正版相同步驟為原配方 100ms、取消配方 0、新工作 failed，沒有覆寫舊自拍。

## 已驗證

- 321 tests／0 fail，TypeScript DOM／Service Worker checkJs、Biome、公開掃描與 build 通過。新增時長邊界、chunks 完整性、中文相機錯誤、觀測白名單及 error 後最後 dataavailable／stop 順序測試，未略過 hook。
- `capture.js`：權限拒絕／占用有中文提示可重試；切換方向不自動存取相機；後鏡頭用 exact，缺少時不偷換前鏡頭。假相機預覽顯示全身框，麥克風未開。
- 重錄／準備下一段的確認框取消會關閉預覽相機；倒數取消保留原自拍關聯，準備下一段不刪舊 take；新錄影短於 15 秒拒絕且不建立假工作。中斷原片重新開啟仍 interrupted。
- 合成 ended／mute、旋轉、freeze、visibility、預覽尺寸改變及編碼 error 皆停止、釋放 tracks 並保留 interrupted 狀態。這些事件注入不算實體來電、鎖屏或切背景證據。
- chunks 與 media 分別模擬 quota，原片下載與中斷狀態保留。原生 IndexedDB 重複 index 拒絕覆寫；連續有效 chunks 恢復為可播放的中斷片段後才清掉；缺號與不可解碼 chunks 各兩塊仍保留，未標 ready。

## 合成錄影矩陣與完整解碼

同一隔離資料庫累積九個 take，逐例重開筆記再錄影／保存／播放；新原片 Blob 大小與 metadata 相符，舊 take 與原片均仍可取回。設定固定、麥克風未請求、結束後 tracks 全部 ended，練習速度恢復 2×；3／5／10 秒倒數皆涵蓋。

| 速度 | 倒數 | 規劃秒數 | 下載容器時長（秒） | 全片解碼 |
| --- | --- | --- | --- | --- |
| 0.5 | 3 | 15 | 15.061400 | 通過 |
| 0.5 | 3 | 30 | 30.061333 | 通過 |
| 0.5 | 3 | 60 | 60.036533 | 通過 |
| 0.75 | 5 | 15 | 15.059100 | 通過 |
| 0.75 | 5 | 30 | 30.029867 | 通過 |
| 0.75 | 5 | 60 | 60.025933 | 通過 |
| 1 | 10 | 15 | 14.999967 | 通過 |
| 1 | 10 | 30 | 29.994833 | 通過 |
| 1 | 10 | 60 | 59.996033 | 通過 |

九段皆由產品下載、FFmpeg 獨立完整解碼無錯誤，為 640×360 H.264 視訊、無音軌；這是合成相機實際輸入尺寸，沒有把請求 720p 當成已取得。平均影格率約 29.99–30.05fps；容器時長與規劃差最大約 61.400ms，這不是 G2 同步誤差或真機 G3 品質聲明。

實測 captureTiming 出現 play Promise 先完成、原生 recorder start 事件較晚到的順序，兩者如實保存，不以 JS 時點假裝畫面同步。最終原片留在 ignored output/media-probe/captures-final/，不進 Git 或公開附件。

最終版本的既有 12 支媒體、儲存與練習回歸均通過：media-probe、media-persistence、self-failure、review-recovery、workspace、storage、relink、edges、player、markers、practice、practice-fallback。120 次循環實際顯示越界最大 116.667ms，fallback 20 次最大 37.152ms；停止後 callback=0、最多同時一個 callback、原生 seeking 期間沒有重疊 seek。practice 改為等待實際呈現影格，並讀原生 seeking 判斷重疊，避免固定睡眠與已過期的測試旗標誤判；150ms 與零重疊門檻均保留。真正背景 gate 仍獨立未驗證。

暫停前的 VS 已補獨立解碼：15.003233 秒、1280×720 H.264／AAC、2,128,997 bytes、音訊 mean -15.7dB，FFmpeg 完整解碼成功。續作再由相同靜態版本產生下節的最終檔案，沒有把暫停前檔案當作後續輸出的證據。

## 續作：真正離頁與獨立成檔

2026-10-28，提交基線 `b4a99f0`、靜態版本仍為 `b52e552869eb154c`，未改 runtime；新增／加強驗收腳本，精確提交見 PR #33。

- `capture-navigation.js`：確認兩塊原生 chunks 確實落盤，再導覽到 about:blank、接受原生 beforeunload 確認並返回；沒有注入 pagehide。原生事件 trusted=true、persisted=false，離頁時來源位置 8.376 秒，尚未到 B=15 秒；tracks 同步釋放，返回後不重開相機。取回可解碼的 6.730733 秒中斷原片、實際播放並下載；舊 take metadata 與原片 bytes 均未變，狀態仍 interrupted。這只保證已落盤部分，不保證卸載前最後尚未保存的影格，也不代表 BFCache 或整個瀏覽器被強制關閉。
- 初版離頁測試的 async predicate 曾在 count 尚未達標時先返回；未把那些空片段結果算作通過或產品資料遺失。改成逐次 await 原生 count 並 assert 至少兩塊後重測。既有 self-failure 也改成操作完成後實際讀回並 assert 原配方 offset=50ms，結果通過。media-probe 等整個操作完成後才讀診斷，避免下載連結先出現而讀到舊的 export=null。
- 最終 media-probe 通過：原片 15.003 秒、VS 瀏覽器解碼 15.000 秒；單一輸出完成後取消第二次合成，原片與前次輸出仍保留。JS drift 最大 6ms、合成經過 14.986 秒僅為診斷，不是 G2 或整體效能 gate。

| 最終下載檔 | bytes | 容器秒數 | 視訊／音訊 | SHA256 前 16 字元 |
| --- | --- | --- | --- | --- |
| navigation-recovered.mp4 | 174594 | 6.730733 | H.264 640×360／無音軌 | e3a02bd611f05169 |
| dance-vs.mp4 | 2077165 | 15.000200 | H.264 1280×720／AAC 48kHz stereo | e829969064d60f1a |

兩檔以 FFmpeg 保留 demux 時間基準完整解碼，exit=0、stderr 為空。最終 VS 的 446 幀時間嚴格遞增，最大相鄰時間差 168.834ms；原片 202 幀亦全遞增。預設 null 輸出的時間基準量化曾出現重複 DTS 警告；逐幀檢查來源並使用 `-fps_mode passthrough -enc_time_base:v demux` 後確認沒有來源時間倒退，沒有改影片、補影格或忽略解碼錯誤。這是本次檔案數據，不延伸為全部 G3 矩陣通過。

`download-playback.js` 在產品之外由 file URL 開啟 Chrome 原生播放器，兩檔均完整播到 ended、error=0；最終 VS 解碼 22,508 audio bytes，FFmpeg 音訊 mean -15.7dB。另抽取最終 VS 中段畫面，核對左右兩側與直立標籤。沒有拿 Blob URL 的產品預覽代替磁碟檔，也未宣稱喇叭／藍牙實聽或 G2 校正已完成。輸出與數據留在 ignored output，不上傳媒體。

## 續作：真正切分頁的錄影背景 gate

2026-10-28；來源 main `e9e154a`、靜態 `2f1ec6b3335cd790`，沿用 PR #42 的原生 Chrome launcher。本輪僅新增 QA／文件，未改產品程式。

新增 `capture-background.js` 與 launcher `--capture` 模式，計畫驗證預覽／倒數／錄影三階段 trusted visibility、中斷片下載／VS、完整重錄到 B 及重開後三份原片的 metadata／配方／SHA256 保留。下載檔仍須額外完整解碼與產品外重播，不能只依 native completed 訊息算成功。

首輪在等待真正前景的 10 秒前置檢查逾時，桌面工具確認 Mac 再次鎖定；尚未進入三階段測試，結果是**未驗證**，不是錄影失敗或通過。已詢問使用者解鎖，並關閉本輪自建 Chrome／控制端；沒有注入可見性或修改產品來繞過。缺合成素材與無效 Chrome 路徑的啟動檢查皆在建立瀏覽器／輸出前拒絕。既有 `bun run check` 為 342 tests／599 expects／0 fail；新增腳本語法通過，這些不代替上述瀏覽器 gate。

### 鎖定期間的無視窗診斷（不算桌面 gate）

為檢查腳本本身，另以相同 Chrome 156.0.8078.49 的 `--headless=new`、全新 profile、合成相機執行同一份函式；User-Agent 明確包含 `HeadlessChrome/156.0.0.0`。沒有改斷言、注入事件或覆寫可見性。這能驗證 headless 分頁生命週期及媒體流程，**不能代替真正桌面切分頁、鎖屏或硬體相機**；待解鎖後仍須用正常 launcher 重跑。

初次診斷遇到腳本嘗試 `fetch(blob:)` 被產品 CSP 拒絕，未列通過；改為讀取已保存的 IndexedDB Blob 作為下載比對基準，產品 CSP 不變。修正後新 profile 完整通過：

- 預覽／倒數／錄影的原生 hidden／visible 事件皆 trusted，背景同步釋放 tracks、關閉預覽及暫停示範，回前景 500ms 不自動重啟。倒數工作為 failed、沒有 Blob 或 MediaRecorder。錄影確認兩塊 chunks 已提交才切走，來源位置 6.761115 秒，中斷片 6,826ms、狀態 interrupted。
- 中斷片重開後仍 interrupted，可播放並合成單一 VS；明確重錄到 B=15 秒自停，另存 15,008ms 新片為 ready，相機釋放。重新載入後依次開啟舊片、中斷片、新片，三者 metadata／配方／完整 Blob SHA256 均一致，沒有自動請求相機／麥克風。
- 三次均實際點產品下載連結；原生下載完成後，再從磁碟核對 bytes 及完整 SHA256 與保存副本一致。FFmpeg 全片解碼 exit=0、stderr 空；Chrome 產品外的 file URL 播放皆至 ended、error=0。VS 為 AAC 48kHz stereo，原生播放器解碼 9,635 audio bytes。播放器 dropped frames 為原片 0、VS 1、重錄 9，未把這次診斷當成效能／G2–G3 通過。

| headless 診斷下載 | bytes | 容器秒數 | 視訊／音訊 | SHA256 前 16 字元 |
| --- | --- | --- | --- | --- |
| 中斷原片 | 182273 | 6.826267 | H.264 640×360／無音軌 | a65aa6c25ef9f3a2 |
| 中斷片 VS | 848782 | 6.835233 | H.264 1280×720／AAC | 2e63e13df520ae20 |
| 明確重錄原片 | 398427 | 15.008167 | H.264 640×360／無音軌 | 4db3fff2717bf013 |

本輪資料留 ignored `output/native-capture-headless-results.json` 與該檔記錄的下載目錄；不進 Git 或公開附件。launcher 另回報 User-Agent，避免日後把無視窗結果誤認桌面實測。共用工具的原有練習模式另以 headless 新 profile 回歸通過：停止 callback=0、最多 1、明確重啟 A=1 秒；不重算 #8 的桌面證據。公開掃描含新腳本共 158 檔；檢查及 hook 仍使用原品質入口。

### 解鎖後：真正桌面三階段與獨立重播通過

使用者再次確認解鎖後，以正常 `launch-native-browser.ts --capture`、新 profile、現有 default context／noDefaults 重跑提交 `6317d097630373760bb33bc7c426cb153c47ac96` 的原始函式。沒有改測試斷言、產品回應或 SW；受測產品仍是 `2f1ec6b3335cd790`。桌面工具確認可存取視窗，Chrome 156.0.8078.49 的 User-Agent 不含 HeadlessChrome；控制端 headless，受測端有實際視窗。

- 預覽／倒數／錄影三階段各取得 trusted hidden=true／false；背景事件後同步暫停示範、關閉預覽及釋放 tracks，原生 recorder stop 完成，回前景不自動重啟。倒數中斷為 failed、沒有原片或 MediaRecorder；錄影中斷前已提交兩塊 chunks，來源位置 6.880 秒、未到 B=15 秒。
- 取回 6,863ms 的可播放中斷片，狀態維持 interrupted；合成 VS 後明確重錄，新片到 B 自停、解碼 14,993ms、狀態 ready。重新載入後三份原片的 metadata／配方／完整 Blob SHA256 均未變；沒有自動開相機或請求麥克風。
- 三份真正下載檔的磁碟 bytes／完整 SHA256 與保存副本相同；FFmpeg 全片解碼 exit=0、stderr 空。再在同一專用有視窗 Chrome 離開產品，以 file URL 原生播放器各播至 ended、error=0。原片／VS／重錄的 frames 為 211／209／455，dropped 為 1／0／1；VS 解碼 10,435 audio bytes。未把這些數據擴大為 G2–G3 或實聽通過。

| 本輪真正桌面下載 | bytes | 容器秒數 | 視訊／音訊 | SHA256 前 16 字元 |
| --- | --- | --- | --- | --- |
| 中斷原片 | 183068 | 6.863267 | H.264 640×360／無音軌 | df065255cdd6c9af |
| 中斷片 VS | 854880 | 6.868033 | H.264 1280×720／AAC 48kHz stereo | 4ff5dcc9680ebfb2 |
| 明確重錄原片 | 398427 | 14.992933 | H.264 640×360／無音軌 | 4daae2eef7275f21 |

紀錄留 ignored `output/native-capture-headed-results.json` 與其下載目錄，不上傳媒體。專用 Chrome 與控制端已關閉。這一節完成受測桌面 Chrome＋合成相機的分頁背景 gate，前面鎖定／headless 結果保留各自歸屬，不替換成當時已通過。

## 續作：失敗後尾塊落盤與恢復鎖

2026-10-28；從 main `d2f126c239a306af603876eb48d78c559a4f86f7` 的專用 clone 分支查核。#33（合併 `8d133081`）、#36（合併 `aec1ca08`）、#43（合併 `d2f126c2`）均已合併，三者最後 head 的 harness CI 皆 success；#36 的配方切換 review 已 resolved，#33／#43 無 inline review threads。#43 head `ee7535b5756fc04ca9e4fdb15979aa94b4163bae` 與本次基線的 `web/`、背景函式無差異，先前桌面背景結果維持原版本歸屬，不重跑未變的長片矩陣。開工後 main 新增的 #47 僅測試／文件，未改本票的 runtime。

`capture-drain.js` 在專用 headless Chrome 156.0.8078.49＋合成相機，保持真正 chunks readwrite transaction 未提交，收到原生 stop 且 tracks ended 後，從另一分頁嘗試取得同一 take 的 Web Lock。基線靜態 `2f1ec6b3335cd790` 如預期失敗：**「編碼失敗後尾塊仍未提交，另一分頁卻已可取得恢復鎖」**。這證明外層 finally 雖等待 queue，跨分頁鎖卻已提早釋放；沒有宣稱已發生真實資料遺失。

修正把失敗收尾的 queue 等待放回持鎖範圍，先釋放相機、再等尾塊。未改 schema、正常錄影／匯出、校正或背景 handler。測試不改 Web Locks、不改 Blob／索引，也不固定睡幾秒冒充交易完成。基線在共用互斥目錄內執行；修正後是短片 headless 時序回歸，不涉及長片／效能量測、真正背景或桌面操作，沒有佔用其他票的桌面測試鎖。

修正版靜態 `3ae0e7be493841e0` 在同一環境的新隔離 session 通過：原生 stop 後相機 tracks 全 ended，chunks 交易仍 pending 時另一分頁取得鎖被拒，controls 維持忙碌。放行交易後鎖可取得、chunks 組回 91,874 bytes，明確恢復讀回成功才保存；take 持續 interrupted。重新載入後，舊片與恢復片的 take／recipe／完整 Blob SHA256 均維持原值。只用合成相機，未請求麥克風。結果留 ignored `output/drain-fixed.log`，原始失敗留 `output/drain-baseline.log`。

實際點產品下載的 `drain-recovered.mp4` 為 H.264 640×360、無音軌、3.435433 秒、91,874 bytes；SHA256 `773d5edaf04fb062ecbb956d0db41cf877cc2157897d5cc7b241b03046345d3d`。FFmpeg 逐幀完整解碼 exit=0、stderr 空，沒有修補或轉碼原檔；不以這份短片聲稱 G1／G6、聲畫校正或硬體通過。素材與下載均留本機 ignored output，不公開。

同版 `capture.js` 在另一個全新隔離 session 通過：拒絕／占用／後鏡頭重試、取消倒數、停止後 tracks 釋放、編碼 error、五種合成中斷，以及 chunks／media quota 均保留原片或可恢復資料。連續兩塊恢復後才清除；缺號／壞檔仍各保留兩塊，take 皆不標 ready。合成旋轉／visibility 等只驗 handler，不是鎖屏／來電或真正分頁背景證據。結果留 ignored `output/capture-regression.log`。

本機預設 Bun 1.4.2 被原版本 gate 正確拒絕，切換已存在的 Bun 1.4.4 後原 `bun run check` 通過：342 tests／599 expects／0 fail、TypeScript、Biome、公開內容掃描及 build 通過；未改版本要求或略過 hook。本輪只修正持鎖等候時序，#43 的真正有視窗背景與歷史長片證據沒有重新冒用為新版本全矩陣通過。

## 2026-10-29：整合 main 的有界覆蓋稽核

基線為已合併 PR #54 的 main `918d8d7aa814533823522e3d4e0ab18df75cb212`。本輪使用專用全新 clone，只追 #9 的倒數、take 關聯、chunks、停止與明確恢復；沒有重現需要修改產品 runtime 的資料保留缺陷。新增一個純事件回歸與本節盤點，`web/`、schema、時間映射、編碼策略與 SW 均未改。交付 head 以本次 PR 為準。

### 稽核路徑與證據歸屬

| 路徑 | 目前保護與失敗結果 | 可檢查的證據 |
| --- | --- | --- |
| `beginTake` → 倒數 | 新 take／asset／recipe 使用新 ID；不先改 `activeTakeId`。倒數取消才把新工作標 failed，舊自拍與校正仍屬原 take。 | 既有 `capture.js` 的倒數取消與舊 offset 斷言；本輪讀碼，未重跑瀏覽器。 |
| `record` → chunk queue → `saveChunk` | dataavailable 依序寫入；`add` 拒絕相同索引覆寫。單塊失敗記錄 chunkError 並停止本次操作；不拿缺號片段冒充完整原片。 | 本輪重跑 `capture.test.ts` 的連續／缺號／重複／空塊／容器邊界。原生 IndexedDB 重複索引與 quota 仍屬上節的歷史 `capture.js` 證據。 |
| 錄製 error／候選讀回失敗 → 鎖內 finally | 相機先釋放，原生停止與已排入的尾塊寫入完成後才離開 take lock。外層 operation 在收尾後才解除忙碌。 | 本輪確認已含尾塊修正；真正 pending 交易與另一分頁 Web Lock 證據仍屬上節 `3ae0e7be493841e0`，沒有算成本 head 新實測。 |
| `finalizeTake` → `saveData`／`writeLibrary` | metadata 與 media 在同一 revision 交易成功後才替換頁面 state；之後才清 chunks。quota／revision／解碼失敗不清原 chunks，狀態更新失敗也不重置儲存。 | 本輪讀碼；先前 `capture.js` 的 chunks／media quota、壞檔與保留舊 take／recipe 證據不變。 |
| 明確恢復 `openTake` → `openTakeUnlocked` | 當前名稱沒有 `recoverPending`；恢復入口在 take lock 內。優先讀 session／已存原片，缺片才組 chunks；解碼成功才切配方與 finalize，恢復後仍 interrupted。人工重連及已存中斷片不因標籤自動複製。 | 本輪讀碼與重跑 chunks 純邏輯；既有 `capture.js`、`take-open-failure.js`、`comparison-recovery.js` 保留其原版本歸屬。 |
| 停止／背景／離頁 → owner 清理 | `stop` 取消當次操作並立即釋放相機；非 BFCache 離頁清 URL／session File，BFCache 沿用並 suspend 原音訊 owner。回站不自動開相機。 | #43 的真正桌面背景及 #54 的正式離頁結果為歷史證據，本輪未操作桌面、瀏覽器或媒體。 |

PR #55 的 Safari、#56 的 v1 備份、#57 的隨包主機及 #58 的整合交付已先核對，沒有將其問題重報或把未合併變更帶入本分支。#54 的正式媒體 24 組／十輪仍只屬 `587689d`／`db129e273cf0039b`。

### 新增與實際重跑

`recordStop.test.ts` 原本已測 owner 先要求 stop，再收到 error 路徑的尾塊。本輪補另一個必要順序：先有前塊，編碼器自行送尾塊及 stop，owner 之後才重複要求停止。分正常／error 兩種情況，核對兩塊原始 bytes 與順序、重複停止不呼叫已 inactive 的 recorder、error 不變成功，以及完成後遲到事件不再觸發落盤 callback。另核對空 dataavailable／空停止拒絕成功。使用 mock MediaRecorder／EventTarget 與合成 Blob，沒有實體裝置、固定睡眠或編碼／解碼宣稱。這些情況在未修改的產品程式即通過，故沒有為測試改寫產品行為。

- Bun 1.4.4，相關三檔 `recordStop.test.ts`、`capture.test.ts`、`mediaAction.test.ts`：9 tests／75 expects／0 fail。
- 原 `bun run check`：367 tests／1033 expects／0 fail，17 份 harness 指紋、211 檔公開掃描、TypeScript checkJs、Biome 與 build 通過；既有 19 項 lint info，不降低門檻。
- 靜態建置版本仍為 `db129e273cf0039b`。人工檢查完整 diff；原 hooks 保留，提交與推送結果見本次 PR。

限制：本輪沒有原生 IndexedDB、跨分頁鎖或瀏覽器／相機驗證，也沒有取得共用媒體／桌面／效能鎖。mock 的事件順序通過不證明瀏覽器會以此順序送事件、影片可解碼、實體指示燈熄滅或強制關閉前最後影格已落盤。完整媒體、Safari、硬體及跨裝置仍按各自 gate；iPhone 暫緩。#9 保持開啟，待 Claude Code 或使用者獨立審查，未合併或發布。

## 未完成

真實相機、實體指示燈、前後鏡頭硬體可用性、鎖屏／來電、G1 與錄影相關 G6 真機證據仍未驗證。#8 播放與本票合成相機的真正桌面切分頁 gates 已各自補驗，不能代替硬體或其他裝置。Safari、手機與人工 review 未驗證，不關 #9；依使用者要求以一般 PR 交付供審查，未驗證項目明列。使用者仍指定先做桌面 Web，不因此判 Web 失敗或啟動 iOS；本輪尾塊互斥修正未合併、發布或新增外部服務，前面各 PR 的實際合併狀態見本輪查核。


## 擷取完整性續審

2026-10-29，固定345b2d1的原Chrome重跑：矩陣9／9、穩定前5輪通過，第6輪原take只有28.030933秒／841格，在原save檢查停止，後續四輪、WebM、校正、恢復、performance與獨立三檔未執行。失敗原片SHA256 4fe0f800b842995ca8d7a0de6799d4cabec74574b67012cc5c0b2e49a84a2257；14組成功28份下載及失敗紀錄全部保留。不能把單輪後續60秒控制的成功湊成十輪。

另以舊345作原生early-stop負向控制，15秒配方原生只錄1.197秒，仍顯示已錄好、metadata take ready。真下載41,141 bytes／SHA256 924ecfd97d831f202401cc7fccab2090ead2e51804d5825895f14c933fe29d65。這是有意故障證明owner／讀回保護不足，不是原平台截斷根因的重現；原失敗事件未被原工具收齊，根因仍未知。

本次修正新增新擷取成功done提前停止保護，及beforeCommit的既有500ms片長下限；拒絕不finalize、不清chunks，原片另存連結與舊take／VS分開，明確刪除對應take或video才撤銷該連結。工作樹針對性回歸與既有測試結果如下；當時固定乾淨head的完整24／離站三檔仍待執行；後續9e6f0ef結果另見下節，不把工作樹回歸冒充正式24組。Safari345一般十九案／正常重載保持原來源，私人新VS救援仍未驗；pending-write後續9e6f0ef同版通過另見[原生中斷證據](issue-13-forced-install.md#9e6f0ef-兩情境原生同版重跑)。Web優先、iPhone暫緩，不合併、部署或關票。


### 本次工作樹回歸結果

產品main.js SHA256 `cb530301f6d159190bfa11dbd85535d4dc31c0ba720f2b2ba3f30bd882be2f54`，靜態`1aa1ae164c31d690`；Chrome 156.0.8078.49 原生UA、隔離profile、明確核對合成相機旗標，未開麥克風。這是345b2d1之上的未提交修正測試，不冒充乾淨head的正式24組。

- 新`capture-integrity.js`：原生early-stop及真正短bytes兩案均標interrupted，未finalize、chunks與救援Blob全bytes／SHA256相同；舊筆記／take／recipe／VS完整指紋、播放器及下載URL不變。同頁重試15.001秒／471,413 bytes完成，舊VS保留。取消刪除、刪無關take均保留救援；刪對應take或video才撤銷救援URL。
- 下載證據曾有QA命名碰撞：同run第二次early覆蓋首early實際檔；原responses及碰撞狀態保留，不能用short檔冒充首early下載。已改每take唯一檔名並只重跑受影響targeted case。新輪四份實際下載每次saveAs後立即以Node核對完整檔案bytes／SHA256等於頁內Blob，再以ffmpeg完整解碼全過；兩次early分別1.200／1.197秒，短bytes1.200秒，正常重試15.001秒。這是QA保存修正，不是新平台故障或原截斷根因證明。
- 未修改的`capture.js`通過：權限／占用／後鏡頭失敗重試、確認框及倒數取消、mute／編碼error／五種合成中斷、chunks／media quota保留原片、連續片段恢復、缺號與壞片保留；恢復take皆不標ready。合成事件不等於真實鎖屏／來電或硬體驗收。
- 未修改的`capture-drain.js`通過：真正chunks交易未提交時收到stop且tracks ended，另一分頁仍拿不到take鎖；提交後才釋放並恢復111,353 bytes，舊片／配方與重載後資料不變。各session核對全部已知自有PID與精確profile程序退出、server停止及nonce相符後釋鎖。

原`bun run check`已通過408 tests／1551 expects／0 fail、型別、公開掃描、lint及build（原19項lint info保留）；最終提交仍走原hooks。上述是合成桌面Web回歸，沒有實體相機、人工音樂聽感、Safari／私人新VS救援或手機驗收；#9、G1／G6及原失敗繼續保留。協作只讀review不代替Claude Code或使用者最終審查。


### 9e6f0ef乾淨同版重跑

9e6f0ef／1aa1ae164c31d690由原media-feasibility、run-media及v5從第一案完整重跑24／24通過，48份實際下載完整解碼；舊345第六輪28.030933秒失敗、未取得其VS與根因未知的界線保留。產品程序停止後，原download-playback在全新Chrome/file入口把本輪三份實際MP4／WebM／校正檔播至ended，指紋相同、mediaCalls=0，自有程序／profile、server／nonce收尾確認。詳細量測、狀態保存範圍及來源見[同版再驗證](p0-safari-reliability-integration.md#9e6f0ef-擷取完整性與同版-chrome-再驗證)。合成Chrome通過不代表Safari真實相機、人工聽感、手機或G6真機驗收，也不證明舊版平台截斷根因已消除。

## 錄影 chunks 未提交時的真正程序中斷

2026-10-30 Asia/Taipei，從遠端 main `6862501d3cfaaa7cf3916d875fd06dd8dfdd13ec` 建本聊天專用 clone／新分支，核對 #9／#13 仍開啟。既有 `--pending-write` 不含 chunks；`capture-drain` 會原生 stop 後等尾塊提交，`capture.js` 的 valid／gap／corrupt 是人工建立前置資料，三者都沒有覆蓋「原生錄影片段寫入未提交時 SIGKILL，同 profile 新程序讀回」。本輪擴充原 `forced-install-restart.ts --chunk-write`，只新增情境模組，沿用原程序群組／PID／profile／spawn-error／nonce／共用鎖，沒有新建通用程序管理器。

### 真正缺陷及最小修正

未改產品的基線 `4651fae419d8d9c8`，完整 UI 負向收據確認：只有 **752 bytes、0 個可解碼影格**的原生 MP4 首塊，Chrome 仍回報 loadeddata、尺寸與約 112ms 時長。`openTakeUnlocked` 因而將其保存到 media、asset ready 並清 chunks，take 雖 interrupted，影片實際沒有影格。這是本輪實際重現的產品缺陷，不能拿正常錄影長度保護或「仍 interrupted」當成已排除。

最小修正只在 chunks 恢復的 `loadCandidate` beforeCommit，沿既有 `presentedFrame` 訂閱原生影格並靜音實播；確認前不撤舊 URL、不建立下載／media、不 clearChunks。失敗／取消先暫停並撤銷等待，再由原候選流程還原舊播放器。缺影格確認能力時明確拒絕並保留 chunks；不使用檔頭 byte 數、任意最短秒數或假事件猜可播放性。已存原片／選片與正常相機完成流程不新增此步驟。

### 修正版同一入口的原生結果

受測為上述 main 上的**修正工作樹**，不是乾淨最終 commit；產品靜態 `7c728c8a5bd7fa2f`。Chrome **156.0.8078.76 headless**、macOS arm64／Darwin 27.0.0，只用原 `make-sync-fixtures.py` 的合成來源及明確假相機，麥克風關閉。工具 SHA256 `a569b592b3f67718f25b6351b6c61c174747415bf27178f863be3e6a53b1ec04`；情境模組 `e6166d5678e940dedafede483edbd1c7ee17b2629534cd1bbe698ae311e9b8a9`。收據同時保存受測 base、tracked changes、SW／storage 與情境指紋，後續文件不改標成 clean-head 實測。

- UI 先保存舊老師片、自己片與真正產生的 VS，另存非空標記。基準 revision **7**，三份舊媒體為 **1,789,027／1,789,027／2,270,473 bytes**。錄影建立 take 後 revision **8**，持同一 take 鎖。
- 真正原生 chunks **752／209,248／105,721 bytes**。前兩個 add 的 trusted success／complete 已收到，第三個 add 的 trusted success key 為本次 asset／index 2；交易內看見候選 key，兩次 barrier 的 keep-alive ticks **79→17,398**，第三次 complete／abort 均 false。此時錄影仍 busy、原生 start=1／stop=0、唯一假相機 track live、audio=false；另一分頁不能取得 take 鎖，才對自有群組真正 **SIGKILL**，沒有正常 close 或 stop。
- 同 profile 新程序只剩 index **0、1**，每一 byte 與終止前的原生片段相同，第三塊不存在；native metadata／revision 與建立 take 後相同，完整舊資料／三份 Blob 保留，take 鎖可重新取得。讀取仍保留 recording 標籤，與原「只在明確恢復且取得鎖後改 interrupted」契約相同，沒有誤標 ready。
- 產品 `recoverChunks` 組裝前兩塊，透過 QA 專用下載連結真正下載 **210,000 bytes／6.727867 秒／202 格 H.264**，逐 byte 等於兩塊串接；這一步測儲存組裝與實際下載，沒有假稱已走 UI finalize。第三塊以**完全相同 asset／index 2／bytes**重試，index 0 重複寫入拒絕，原三塊順序與 bytes 全部相同；這是儲存重試，不是接續被殺掉的 recorder。
- 另建一份只含本輪真實首塊的自有 take 作負向前置資料，明示不是第二個 SIGKILL 案例。UI 恢復被拒絕，take interrupted、752-byte chunk 原樣保留、沒有建立 media，舊播放器 URL 保留。原目標 take 由 UI 明確恢復，真正呈現影格後保存 **315,721 bytes／10.098800 秒／303 格 H.264**，仍 interrupted，只清自己的三塊；檔頭專用 take 的壞片段保留。
- 兩份實際下載的 SHA256 分別為 `5b0ae02833c87c6bb3cccf9419e5da8f949a2e5ae9f7a35de2abfb927a6f3791`、`7856b40bd21eef1731485a75867438f5d185e0d94a2e0faabf49d8c718bdb9c3`；逐 byte 等於已提交／重試後的原生 bytes。FFmpeg `-v error -xerror ... -f null -` 都 exit 0，另在無產品程式的空頁從下載 bytes 建來源，兩份都實播到 ended，640px 寬，沒有把產品 ready 當成播放證據。
- 正常停止第二個程序，再以**同 profile 第三個程序**重開，完整 native／產品 JSON、keys、revisions 與所有 media／殘留 chunks 快照 equality 通過，revision **12**。六個快照階段另存完整二進位，獨立核對 **31 份**快照檔與全部舊 Blob；第三份 snapshot 也已序列化並逐 byte 比對，沒有沿用 #83 未另存第三 snapshot 的限制。兩個 take 鎖皆可重新取得。

### 解碼訊息、原模式與收尾界線

解碼 stderr 非空，原訊息完整留 ignored output，不能寫成「全片無訊息」：兩份 null 輸出分別有 **3／12** 筆 non-monotonic DTS 訊息，但原檔 packet PTS／DTS 及解碼 frame PTS 全部嚴格遞增，獨立 FFprobe 為 202／303 格；在 null 輸出 `30000/1001` 時基量化後的碰撞值逐筆精確符合訊息。這是對原始下載檔的診斷推論，沒有改檔、重封裝、轉碼或調寬原門檻，不宣稱新 G2–G4／完整影音矩陣通過。

修改後原 default 與 `--pending-write` 各沿原入口重跑一次，皆 status passed／exit 0；保留原離線舊殼／完整資料及同候選重試／第三程序斷言，沒有弱化門檻。新增 chunks 正向輪的三群組為 **12／8／8** 個已知自有程序。另獨立核對本輪所有成功／失敗收據：**15 群組、143 個已知自有 PID**無殘留，精確 profiles 無 Chrome、所有自有 origin 埠拒絕連線；原工具與補充解碼核對均以同 nonce 才放鎖。沒有刪除或接管其他聊天的鎖、profile、程序或設定。

完整暫存內容的原 `bun run check` 通過 **436 tests／2,047 expects／0 fail**，含空 DevTools 檔案回歸；公開掃描 **239 檔**、harness 指紋／本機文件連結、TypeScript、lint 與原 build 通過。原有 19 項 lint info 保留，沒有關閉或降低規則。

正向 chunks 原收據 SHA256 `41135f586e43bc15f9c2cb2aa967cd6566db6506e47807110ddaa4cd1fd9e3f3`；修改後 default／pending-write 收據分別 `8ff48d92ee0c86deec1cb02f1d16f03a23749da9066018d7e0799ba999f55d2d`／`19913fbacd102641ba981e0047a2461e54ba444d06b90dbfa48bf954550cc849`，獨立 bytes／時間戳／收尾核對收據 `46e54c2fd274d22e95e3bfda9bfb1ed191fd7614d06001829c8423e14c0843e0`。raw／完整 bytes／下載／profiles／日誌／操作識別全留 ignored output，不進 Git 或公開附件；固定來源與原檢查結果由本 PR 綁定。

保留的先前失敗包括：三次 EEXIST 原子取鎖拒絕（未啟動瀏覽器）；首塊不可播放卻被測試誤假定可恢復的斷言失敗；新增負向 take 後未重載 UI 的前置錯誤；完整負向輪真正重現檔頭誤存 ready；修正版啟動時 DevTools 檔案先出現而 port 尚未寫完的前置失敗。最後一項只補原 launch 等有效 port 的條件，並以執行真正 launch 的空檔→有效內容單元回歸保護；失敗群組均已確認退出。初次 Bun 子程序 PATH／缺建置拒絕及受限環境本機監聽失敗也保留，未改測試門檻換綠燈。

本輪補 #9／#13 的 chunks 程序中斷與一個確切恢復缺陷；keep-alive 是明示的交易時序控制，檔頭負向是新建前置資料，均不是 Safari 自然故障。未驗證提交瞬間、斷電、Safari／私人模式、真人相機／麥克風／LED、實體飛航／跨裝置、人工聽感、讀屏／五人操作或整體 P0；iPhone 仍暫緩。重要工程仍待 Claude Code 或使用者最終審查，#9／#13 保持開啟；未合併、部署或發布。

### 5a90f35 新影格守門的失敗分支補驗

PR #87 review 指定只補新守門的失敗接線。原 `take-open-failure.js` 的 Stop 是暫扣 loadeddata；`mediaAction.test.ts` 的 play 拒絕／取消覆蓋共用 helper，沒有走本次 `openTakeUnlocked` beforeCommit 的新 AbortController＋presentedFrame／play／finally。因而新增原程序工具的 `--recovery-frame` 選項與 `recovery-frame-guard.ts`，直接跑三個有界案例；**沒有在本機重跑 chunk-write、default、pending-write 三套中斷**，其成功 raw 保持上節 `5a90f35` 原 runner 指紋。

受測產品是乾淨已交付 `5a90f357cd979765c01b5c4bced1d27b614b49ec` 的 bytes，靜態仍 **`7c728c8a5bd7fa2f`**；測試工具是新工作樹，沒有新增產品修正。Chrome 156.0.8078.76 headless／專用 profile／自有動態 origin，原工具原子取鎖，禁止所有相機／麥克風／畫面擷取，blockedMediaCalls=0。原合成來源只複製 4 秒短段，**113,521 bytes**／SHA256 `b711bb2b4d67c9c9602057e0f91cb64d8dd5675802627b7ec0838f55e35e5e5c`；每個候選由產品 `saveChunk` 分兩塊真正提交，前置 take 已標 interrupted，避免把狀態初始化寫入混成取消後變動。舊老師片／自己片、真 UI 產生的 VS、非空標記與不同的配方先保存。

- **loadeddata 之後實點 Stop**：只延遲送達真正原生 `requestVideoFrameCallback` 結果，同一份 now／metadata 保留，不偽造影格或 duration。barrier 已收到 trusted loadeddata、真 play Promise 已完成，原生結果為 mediaTime=0／presentedFrames=1；產品仍忙碌，原訊號與等待訊號均未 aborted，守門有 2 個關注的 abort 監聽、1 個原 15 秒計時器，另一分頁拿不到 take 鎖。實點 Stop 後原訊號／等待訊號都 aborted，callback 已 cancel、timer 1 次建立／1 次 clear／0 次執行，相關 listener／timer 均 0。候選 URL 撤銷，舊播放器、原片／VS 下載 URL、時間與鏡像／offset 設定相同；完整 native／產品 JSON、revision、media／chunks keys 與所有 bytes 精確不變。
- **遲到原生結果**：工作已退出忙碌且 take 鎖可取得後，再將暫扣的同一份原生參數真正送入產品 callback 一次。沒有新訂閱／計時器／提交，整份快照與完整 bytes 仍等於停止前；不是正常播放完成來冒充取消。
- **缺影格能力**：只在自有候選元素受控移除 `requestVideoFrameCallback`，走產品新增的明示拒絕訊息。frame 註冊／播放／守門 timer 均 0，原操作訊號未 aborted，沒有建立等待訊號；候選 URL 撤銷、listener／timer 0，所有舊資料、兩塊 chunks、舊畫面與下載／配方精確保留。這是能力注入，不是 Safari 實測。
- **play 拒絕**：只將自有候選的 play 改為明示 `NotAllowedError` Promise 拒絕，沒有偽造媒體事件。原操作訊號未 aborted、等待訊號由 finally aborted；frame 被 cancel，timer 1 次建立／1 次 clear／0 次執行，相關 listener／timer 0，候選 URL 釋放。完整快照與舊 UI 保留，沒有 media ready 或 chunks 清理。
- **同輸入重試**：每個分支移除自己的控制後，以同一 asset／chunks 正常重試；原生 callback 真正送達，完整 113,521 bytes 保存到 media，take 仍 interrupted，只清目標的兩塊。舊影片／筆記／VS／配方，以及所有非目標 take／asset 全欄位保持；每次重試的 bytes 都與原 fixture 直接逐 byte 相同，守門 listener／timer 收尾均 0。

獨立核對 **78 份**完整二進位快照，失敗前後及遲到通知後另有 **33 組直接逐 byte 比較**；兩次有界原生執行合計 **24 個已知自有 PID／2 群組**均退出，兩個精確 profiles 無 Chrome、自有 origin 埠拒絕連線，原 nonce 放鎖。首次三案例也通過；其後補充純資料 audit 對非目標 asset 的檢查，指出前置 fixture 把「只有 chunks、尚無 media」的 storageKind 寫成 indexeddb，正常保存會沿 `readLibrary` 投影正規化成 external。該前置差異與 audit 失敗保留；修正 fixture 為正確 external 並新增非目標 take／asset 全欄位斷言後，同入口三案及獨立 audit 全過，**沒有修改產品或降低門檻**。

新 runner SHA256 `263155ae73e41925f201e244ed7e3432d892556895e772d63729190562dbda29`；情境模組 `4072da8335312c32da7669733a4e4d43bcac476ec56af1585d0f42f545be9fb3`；正向 raw `495a78dafdab8843ce1b33ae8ba8c6d60a69d4b6ea8f80863c9a60321e7e3039`；獨立 bytes／收尾 audit `cc813c44c8c092d24800b604e9a1bfcad30e24a233b80bf252c4a10824f2aad7`。原始資料只留 ignored output，未公開媒體或識別。原 check／hooks 與本次新 head CI 另由同一 PR 綁定；既有 Linux job 仍只跑原 default，不冒稱 Linux 已驗本新增三分支。

本次原 `bun run check` 為 **436 pass／2,048 expects／0 fail**，公開掃描 **240 檔**，harness／文件連結、型別、lint 與原 build 全過，原 19 項 lint info 保留；提交仍執行原 hooks。

本次只補守門接線與資料保全，沒有自然卡頓、Safari／私人模式、真人／裝置、背景／來電或整體 P0 證據；不新增合併、發布或關票授權，#9／#13 仍開啟。

## 2026-10-31 原生 Safari 恢復原片

使用者已手動啟用 Safari 遠端自動化。本輪在專用 clone，以 macOS 27.0.1 arm64、Safari／safaridriver 27.0.1（22625.1.29.11.28）接續 #9。基線為乾淨 `d83755239bf145e9b79d50263208edfad83754e8`／靜態 `6f07212fe275ae3c`；沒有切換或改寫其他聊天的 checkout。

### 真正缺陷與最小修正

以既有產生器的合成 H.264／AAC 檔建立獨立 Blob chunks，明示這是恢復前置資料，不是真正錄影中斷、SIGKILL 或斷電。原生 Safari 的 UI 恢復成功後，take 為 interrupted、asset 為 ready、media 為 175,911 bytes，目標 chunks 已清空；但重新讀取新 media 的 `arrayBuffer()` 回 **NotFoundError**。同一輪舊示範 106,103 bytes／舊自己片 175,911 bytes 均仍可讀。只看當頁播放器、ready 或 Blob.size 會漏掉這個缺陷。

修正集中在 `storage.recoverChunks`：沿用原片段順序／容器檢查，組合後先讀成獨立 ArrayBuffer，核對長度，再建立保留 MIME 的獨立 Blob。原本 finalize／revision 交易、影格確認及成功後才清 chunks 的順序不變；讀回失敗或長度不符就拒絕，片段仍在。這以一份完整原片的記憶體讀回換取 backing 資料獨立，不引入新儲存後端、UA 分支、重置或轉碼。沒有為取得綠燈放寬錄影片長斷言。

### 同一入口的原生結果

受測為上述基線上的修正工作樹，並非乾淨提交的原生重跑。候選靜態 **`45be4c18fbf4f56a`**；產品 `storage.js` SHA256 **`b14256f96279e73f4f5632d908a8713287c599d5073a8da45d725afe0912466b`**。`main.js` 未改，SHA256 `4f0124877c504346ca2225fb570f044dc1b9fe9664acd1f64b7a0815f57adada`。最後文件與提交不會把工作樹收據改標為 clean-head 實測。

QA 沿用產品主機白名單及 CSP，僅在專用 loopback HTML 前載入禁止擷取的測試腳本，另收緊 Permissions-Policy，禁止 camera／microphone／display-capture。只由自製檔案建立 chunks，擷取嘗試為 0；恢復階段七次原生點擊的 isTrusted 均為 true。沒有相機、私人影片或日常 Safari 資料操作。

| 案例 | 實際結果 |
| --- | --- |
| 有效兩塊 | 真正呈現影格後保存完整 175,911 bytes，逐 byte 等於原 fixture 與兩塊串接；take 仍 interrupted，只清自己的兩塊 |
| 缺號 0／2 | 不建立成功 media，兩塊完整 bytes 與 keys 保留，狀態 interrupted |
| 不可解碼兩塊 | 不建立成功 media，兩塊完整 bytes 保留，原播放器及下載 URL 不變 |
| 真正重新載入頁面 | 所有原片／恢復片的完整 bytes、筆記、take／recipe／asset 與殘留 chunks 都與重開前相同 |

另獨立核對 **10 階段、67 份完整二進位檔案**的大小、SHA256 及直接 bytes；所有舊 media 每階段都相同，缺號／壞片段保持原樣。恢復原片 SHA256 **`b7f6393b07df4761ee039d785b225a90e16481a7eb4a2f760a75949b95e7755a`**。由儲存 Blob 經 WebDriver 取回到磁碟，不冒稱 OS 下載成功。FFmpeg 全片解碼 exit 0、stderr 空；產品頁／主機停止後，原生 Safari 的 `file:` 播放器透過 trusted 點擊從 0 秒播到 ended，8.000 秒、180×320、error=0。這不是 720p、聲畫同步、喇叭實聽或完整錄影矩陣的通過證明。

基線負向 raw SHA256 `2c7a373a0662bb100eb3636bd0b74573386114fad1399a04465a4cff2e81a396`；修正與重開 raw `fbc56f7eed4c771c716ff972e40e95b3f5f7f221042a943cd49569293a3fef1f`；獨立 bytes／播放 raw `bd693d38692b228c98e00e3623f62f9fec7d70b593718dff6d239e9541150d22`。每輪 driver／自有主機的已知程序群組均退出，確認後才按同 nonce 放鎖。raw、工具、完整二進位及合成媒體留本聊天固定副本的 ignored output，不進 Git 或公開附件。

既有 `capture.js` 補上同一資料保全回歸：測試前置每塊使用獨立 Blob；成功清 chunks 後真正 reload，讀回舊原片及恢復片並比較全部 bytes。此處原生 Safari 使用上述專用 WebDriver 入口，沒有冒稱已執行完整 Chrome `capture.js` 或其他平台矩陣。原 `bun run check`／提交 hooks 的最終結果由本 PR 綁定。

### 保留的失敗與未驗證

- 前輪對話曾觀察 Canvas 1×／15 秒保存與離站播放成功；半速／15 秒為 15.140／15.113333 秒，超過既有 ±100ms 斷言，九案矩陣在第一案停止。原暫存目錄現已不存在，這些數據只保留為前輪觀察，不能重新核對 raw 或當成本次整體通過。此次儲存修正沒有重跑或修好該時序問題，也不由此推定 G2 同步失敗的根因。
- 前輪未證實相機替身的首案排除；先前外部 HTML 播放前置逾時、誤讀上一個 recorder 的 QA 時序、未完成恢復檢查的 selector 失敗均不算產品通過。本輪等待 option 的引號錯誤及檔案播放器自動播放搶先起播也保留，未降低最終斷言。
- Safari 對持久化 `Blob.slice` 的診斷曾出現 size 10／11 卻讀回 21 bytes，以及半片卻讀回母片；FileReader 與 arrayBuffer 都曾出現，沒有把這個獨立切片問題宣稱已修好。最終前置是逐塊獨立 bytes 的 Blob，貼近 MediaRecorder 的輸出形態；其清理後的新 media NotFoundError 才是本次修正目標。
- 真實相機／LED、鎖屏／來電、Safari 私人模式、完整速度／時長與十輪 capture→export、真機 G1／錄影 G6、人工最終審查仍未驗收。iPhone 繼續暫緩；不啟動 iOS、不關閉 #9、不合併或發布。

## 2026-10-31 半速錄影起播延遲

### 先核對 PR #115

[PR #115](https://github.com/sunpochin/dance-stamp/pull/115) head `076c3936184e0aec681fdbd95f985f3afeabc310` 的 [Harness CI](https://github.com/sunpochin/dance-stamp/actions/runs/41101534690) success；自動程式審查完成、沒有 findings／未解決審查串。security review 的 findings 欄為 null，不另宣稱安全審查無問題；沒有正式人工 review，仍待 Claude Code／使用者最終審查。PR 未合併。本輪從 main `d83755239bf145e9b79d50263208edfad83754e8` 新分支處理時序，沒有帶入 #115 的儲存修正或承接其恢復測試結果。

### 原生失敗與單變因對照

macOS 27.0.1、Safari／safaridriver 27.0.1（22625.1.29.11.28）、Bun 1.4.4。使用 `make-sync-fixtures.py` 的 65 秒自製圖樣／660Hz 示範 MP4，1,789,027 bytes，SHA256 `3fb42ffb14678b8c944d605cab684a1919801de7908c1f540f7fbfc29ea26548`；相機是正常同源 script 在 main 載入前提供的已知 Canvas stream（640×360、請求 30fps），沒有呼叫或保留實體 getUserMedia。預覽必須等於該 stream，MediaRecorder 建構亦只接受它。測試主機額外回 `Permissions-Policy: camera=(), microphone=(), display-capture=(), geolocation=()`；非相機格式／時鐘／duration 模擬。

固定 A=0、B=7.5、0.5×、倒數 3 秒、一般練習 2×。保留 native recorder、示範 playing／pause／play resolve 事件與每 10ms 來源時鐘讀值；觀察器不訂閱額外 rVFC、不更動來源時間。沿用原 `capture-matrix.js` 的 ±100ms，另直接檢查原始浮點時長 `abs(duration−15) <= 0.1`，沒有放寬或四捨五入規避。

| 乾淨 main／靜態 `6f07212fe275ae3c` | 實際秒數 | 誤差 | 原門檻 |
| --- | --- | --- | --- |
| 原設定，首輪 | 15.131667 | +131.667ms | 失敗 |
| 只在 play 前設 `preservesPitch=false`，獨立新 session | 15.051667 | +51.667ms | 通過（診斷控制） |
| 再開獨立新 session、原設定 | 15.110000 | +110.000ms | 失敗 |

對照的自然變調時鐘起播等待約 70ms，原設定約 133ms（以 `performance.now − currentTime/r×1000` 的穩定段相對 play 呼叫估計）；`play()` resolve 與 recorder start 時來源均仍為 0。這是有界原生觀測，沒有聲稱 `play()`／JS 事件等於第一格呈現或硬體取樣同步。原設定兩片及控制片都保留完整 raw、SHA256 與 FFmpeg 全片解碼成功結果。

首輪想在同 session 接跑診斷控制時，等待 capture enabled 逾時；當時 QA 只等 controls，未等比較保存佇列，逾時原因尚未確認。該輪第二例沒有錄影，不能算控制通過或已確認的產品缺陷。後續兩個診斷用獨立 session，候選矩陣的 idle 同時等待 controls 與 comparison busy 結束。前輪暫存 raw 已遺失的 15.140／15.113333 秒觀察不計本輪證據。

基線首輪／獨立控制／獨立再現 raw 收據 SHA256 依序為 `da866cd595839400cbf876900692bd3696efbad4d5bc0d4b9abd97105a2a6bbc`、`cbdeae56aec785cdaf9758a33f399739419bf07fbb807c401106a33ae8adef86`、`6b8e9dd7a6090507e416a8f963afc5e7c2642cf594c6b43ba0fc626995c247f6`。完整工具、原始檔案與收據只留本聊天 ignored `output/issue9-timing-20261031/`，不公開媒體。

### 最小修正與候選驗證

錄影設定速度後、倒數前關閉示範音高保持；完成／取消／失敗沿原 `operation` 收尾恢復一般練習音高與速度。介面明示錄影時聲音隨速度變調。沒有延後開錄、提早在 B 前停止、裁片、補影格、改 raw bytes 或改時間門檻；取捨見 TECHNICAL 第 49 節。

受測來源為 `d837552` 上明示修改工作樹，靜態 **`9d1a66df3f6c05c0`**；沒有改標成提交後乾淨 head 重跑。`main.js` SHA256 `f48474b8257a16ba99189c4293a1d5b0d6bbc3d82ede379f782bc4bcd1d978c0`。同一原生 Safari session／資料庫的下列五案通過，沒有強制 pitch override：

| 0.5×／倒數 3 秒 | 實際原片秒數 | 誤差 | 原片 bytes | 保留舊原片數 |
| --- | --- | --- | --- | --- |
| 15 秒重測 1 | 15.070000 | +70.000ms | 283583 | 0 |
| 15 秒重測 2 | 15.081667 | +81.667ms | 280696 | 1 |
| 15 秒矩陣案例 | 15.088333 | +88.333ms | 280670 | 2 |
| 30 秒矩陣案例 | 30.073333 | +73.333ms | 554402 | 3 |
| 60 秒矩陣案例 | 60.058333 | +58.333ms | 1106262 | 4 |

五案均為 native ready take，示範到 B 才停、track ended、無麥克風請求、練習 2×／音高保持恢復、原片實播前進且 error=0。每案逐一讀回所有舊原片 SHA256，沒有覆寫。五份完整原 Blob 經 WebDriver 取回本機，皆 FFmpeg 全片解碼 exit 0／stderr 空；獨立第二入口重新讀五份本機檔，完整 bytes／SHA256 逐份相符。關閉產品主機後，在新原生 Safari session 用 `file:` 播放 15.088333 秒原片；trusted 點按從 0 到 ended、error=0、640×360。這是原 Blob 取回檔，**不是 OS 下載動作、真相機或 G2–G7 驗收**。

原生同頁矩陣在轉到 0.75× 前，開錄前等待 capture enabled 逾時而停止。另用新 session 的 0.75×／15 秒診斷，時長 15.075 秒合格、原生 pause 位置 11.260520 秒已過 B=11.25，但收尾讀到 `currentTime=8.333333`，**原停止位置斷言失敗**；保留失敗，不改成檢查 pause 事件來取得綠燈。該檔另獨立完整解碼成功；收尾後時鐘倒退原因尚未確認。本輪不宣稱三速度九案或同頁完整矩陣通過，0.75／1× 的完整驗證仍缺。先前第一個 0.75× 診斷也在相同保全斷言失敗，僅保留 raw，未儲存完整 case，不能補成通過。

五案後中斷的原生收據 SHA256 `b8899f5d21558b837715fddf76bcc26dc4917da366e93da548be72c80c7e31f5`；獨立 bytes／離站播放 `72d4dbfe671ccd259d6c50baee919525e649bf83484c0c53b415aa544fe48875`；0.75× 停止位置失敗 `9a9366f9f37c46ebe43184de206f0392da2e6da6dc6d5a4477712d1f00eb19f4`。候選 runner SHA256 `8b1c57b8ca40ee8c42336a42c433d039d94072e4a32c6332245b6fc7d77fd5b7`、合成相機／時鐘觀察器 `7639e4ad6920fc610560f3c64ee9de8e35b392ee5faf2b975269788518fcf964`。各輪 session 正常刪除、自有 driver／server 群組確認退出、按同 nonce 釋放自己的共用鎖；沒有停止他人工作。

完整 `bun run check` 通過 **632 tests／3,052 expects／0 fail**，型別、lint、建置及公開掃描通過，原 19 項 lint info 保留。初跑兩失敗保留：本機服務測試需獲准綁定 loopback；新增規格連結曾指向未隨包帶出的根 TECHNICAL，已改指隨包證據，原封裝連結測試未變。改正後以原權限需求完整重跑通過。

另以獨立 headless Chrome／明確 fake-camera flags 執行實際修改的兩支既有回歸：`capture-matrix.js` 半速 15 秒為 15.033 秒，錄影時自然變調、到 B 自停、完成後恢復 2×／音高均通過；完整 `practice.js` 的六速度實播、120 次循環、取消、失敗、換片及離頁回歸全過，最大呈現越界 83.333ms／150ms 原門檻、同時 callback 最大 1、重疊 seek 0，倒數取消後音高保持已恢復。Chrome 收據 SHA256 `9d4ed963f4776d27a062dfb396ec596d00ce15e12d83e77c4d0a739e32ae7a6a`；這些不是 Safari／實體背景證據。此後只更新文件，產品資源仍與上述原生候選相同；提交 hook 仍跑原入口，不略過檢查。

#9 保持開啟，原驗收勾選不變；真相機／LED、音樂聽感、鎖屏／來電、Safari 私人模式、真機 G1／連續十輪 capture→export G6 與最終獨立審查仍缺。iPhone 繼續暫緩。本輪未合併、部署或發布。
