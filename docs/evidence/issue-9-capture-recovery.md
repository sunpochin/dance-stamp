<!-- 檔案用途：記錄 #9 桌面錄影、失敗恢復與真機缺口。所在層：版本驗收證據。主要關聯：capture.js、capture-matrix.js、TECHNICAL.md。 -->
# #9 錄影與中斷恢復

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

## 未完成

真實相機、實體指示燈、前後鏡頭硬體可用性、鎖屏／來電、G1 與錄影相關 G6 真機證據仍未驗證。#8 播放與本票合成相機的真正桌面切分頁 gates 已各自補驗，不能代替硬體或其他裝置。Safari、手機與人工 review 未驗證，不關 #9；依使用者要求以一般 PR 交付供審查，未驗證項目明列。使用者仍指定先做桌面 Web，不因此判 Web 失敗或啟動 iOS；沒有合併、發布或新增外部服務。
