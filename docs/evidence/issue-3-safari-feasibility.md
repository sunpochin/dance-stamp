<!-- 檔案用途：保留 #3 真正 Safari 的同步與儲存失敗，避免拿 Chrome 證據代替。所在層：版本化驗收證據。主要關聯：RECORD_COMPARE.md、MEDIA_PROBE.md、#10、#11。 -->
# #3 macOS Safari：前景雙片失敗與有界診斷

狀態：2026-10-28（Asia/Taipei）；**仍需修正／釐清，不能宣稱 Safari P0 可用**。本次交付只有文件；下列七個未通過的 runtime 候選全部還原，資料格式、同步門檻與其他票的候選 PR 均未改動。#3 保持開啟，iPhone 暫緩，未觸發 #16。

## 版本與測試邊界

- 受測 main：`d2f126c239a306af603876eb48d78c559a4f86f7`；靜態內容：`2f1ec6b3335cd790`。
- macOS 27.0.1／26A434；真正 Safari 27.0.1。Safari User-Agent 為 `Version/27.0.1 Safari/605.1.15`，不能從相容性 UA 的 Intel／10_15_7 字樣推斷硬體或實際 OS。
- 原生介面操作、新建私人視窗、專用 loopback origin；取得跨聊天共用媒體／桌面測試鎖。結束後只關本輪視窗、停止本輪 server 並釋放自己的鎖。
- 產品頁沿用原 CSP；本輪 server 額外以 Permissions-Policy 拒絕相機／麥克風，沒有請求相機、改 Safari／macOS 權限或操作一般瀏覽資料。不是 SafariDriver 或 Playwright WebKit。
- 只用既有 `make-comparison-fixtures.ts` 的合成檔：H.264、320×180、30fps、二進位影格碼；老師 660Hz AAC、自己 880Hz AAC。兩片原檔 SHA-256 分別為 `b5405bf60ab0600e7b77f216c7c6310cc52133e82df0f816068ea908e65ebeb0`、`384d749ce2dfe1f2ba18705ae9cc9f401da3ecbd2140ce585dbc6011b86b3ff6`。沒有真人或第三方音樂。

## 正式入口重現

1. 新私人視窗開產品，按「比較已有影片」，用原生選檔介面選 `reference.mp4` 與 `self-1.mp4`。老師載入為 80 秒，自己影片有約 72 秒視訊／75 秒音訊，未請求相機。
2. 設老師 A=12、B=27 秒、自己的 offset=4 秒、r=1。UI 正確顯示共同長度 15.00 秒、老師 12.000／自己 4.000 秒起跳。依既有設計，改 A／B 的中途設定也會留下自己的歷史配方。
3. 直接按「輸出單一 VS 影片」。約起播半秒後出現「兩側偏移超過 250ms，請重新校正／降低負載。原片仍保留，可重試。」測試資訊 `export=null`，沒有 VS 檔，也沒有把拒絕匯出列為成功。兩片原片下載連結、配方與重試控制仍在。
4. 失敗後可新增標記，UI 確認「12.000s · Safari 合成測試」及合成測試筆記已保存。這只驗證本次 metadata 寫入，不等於跨程序持久保存。
5. 明確按「保存示範副本到此瀏覽器」，收到 `Error preparing Blob/File data to be stored in object store`。再按保存自己影片副本，操作持續等待；按停止後仍未恢復控制。其後以現有 storage 模組呼叫 `readLibrary()`／`readMediaKeys()`，獨立 3 秒 timeout 先到。**沒有宣稱第二筆副本已保存、取消成功、資料庫未變或可跨重開恢復。**

第 5 步屬這個 Safari 私人視窗／origin 的實際儲存失敗，尚未證明是一般 Safari 也有的限制，亦未證明與雙片同步同源。關閉等待中的頁面時確認離開，只結束本輪合成資料的 session。沒有刪庫、改存 ArrayBuffer、重置儲存或使用重載冒充恢復。

## 產品外的原生雙片診斷

為避免再猜每格調速或來源可見性，先在同一專用 origin 的獨立診斷頁載入相同兩片。頁面只有兩個可見、`controls playsinline` 的原生 video；右片 muted。沒有產品 timeline、Canvas、MediaRecorder、rAF 調速、硬 seek 或修改原片。seek 到老師 12／自己 4 秒後，兩者 rate=1，`Promise.all([left.play(), right.play()])`，每 50ms 記錄 4 秒後一起 pause。

取樣欄位依序為：相對 `performance.now()`、左 currentTime、右 currentTime、左 paused、右 paused、右 readyState、document.hidden。偏差為 `abs((right-4)-(left-12))*1000`，**只是原生媒體時鐘診斷，不是成檔／光學 G2**。

| 依序執行的路由 | 最大取樣時鐘差 | 約 4 秒時左／右 currentTime | playing 事件（左／右） |
| --- | ---: | --- | --- |
| 純原生，不建立 AudioContext | 336.077ms | 15.667429／8.003478s | 11／11ms |
| 老師接 MediaElementSource → destination 及 MediaStreamDestination，context=running | 356.212ms | 15.641481／7.997678s | 6／7ms |
| 保留前一圖，再將右片接同一 context 的 destination，右片仍 muted | 349.529ms | 15.638736／7.988241s | 8／9ms |

三輪樣本均 document.hidden=false、右 readyState=4、兩片 paused=false。純原生一輪左片在前約 213ms 仍報 12 秒；約 472ms 又有短暫不前進，右片持續前進。左片 playing 事件與 play Promise 已完成仍不足以證明兩側同時呈現。純原生例：

```json
[[62,12,4.055674875,false,false,4,false],
 [213,12,4.206659875,false,false,4,false],
 [420,12.164032458,4.413470917,false,false,4,false],
 [472,12.164032458,4.465462167,false,false,4,false],
 [4010,15.667428916,8.003477667,false,false,4,false]]
```

重現這個診斷可在只服務合成素材的本機頁面使用兩個 video：先等 loadeddata，再等兩側 seeked，按一次明確播放按鈕後依上述順序取樣。三輪之間先 pause／重新 seek，原生輪必須最先做，避免已建立的 MediaElementSource 汙染對照組。原生一輪不需任何產品腳本、Web Inspector、自動化權限或相機。取樣紀錄／合成素材留本機，公開只保留匿名數據。

## 呈現影格、共用時鐘與未採用的修法

後續在同版 Safari 加入被動 `requestVideoFrameCallback` 觀察。純原生 4 秒對照量到最大時鐘差 268.505ms；左右收到 111／119 次影格通知，同一個 4072ms 回呼時刻的來源 mediaTime 為 15.700／7.966667 秒，扣除 12／4 起點仍相差約 267ms。這比只讀 playing 更接近實際呈現，但仍不是外部光學 G2。

再把兩片接同一 AudioContext、右片取消 muted 並透過 gain=0 保持無聲，最大取樣時鐘差降至 8.101ms；兩片卻也曾一起停在相同時間約 200ms。**共同時鐘的數字變好不代表影格、錄影或音訊合格。** 兩輪在同一診斷頁依序執行，第二輪已建立音訊來源圖，不能視為獨立全新環境。

為驗證是否能用於產品，按以下順序在獨立 origin 試驗；每次保留原有 250ms 偏移／1 秒停滯護欄。表中是未提交候選的靜態內容識別，並非 Git commit 或驗收版本。全部 `export=null`，最後恢復 main 靜態 `2f1ec6b3335cd790`。

| 候選靜態識別 | 相對前項的改動 | 實際匯出結果 |
| --- | --- | --- |
| `f44af182676cff6c` | 右片接共用音訊圖，以 gain=0 靜音 | 偏移護欄拒絕 |
| `9ac8c8bf7134edd3` | 將取消 muted 移到 resume／seek 之前 | 偏移護欄拒絕 |
| `fd80154ba0ab9588` | 移除每格微調 rate，固定雙片 rate | 約 3.04 秒時播放停滯 |
| `c71bd9bac3f2fb6c` | 錄影時保留老師監聽 gain=1 | 約 1.66 秒時播放停滯 |
| `8d77356c98a9ad64` | 監聽還原 gain=0，改 Canvas 自動 30fps 擷取 | 約 1.90 秒時播放停滯；固定來源可見仍失敗 |
| `f6a03e847f25eba5` | 只由 rAF 畫圖，影格回呼僅續訂 | 約 1.82 秒時停滯；點輸出後完全不讀介面的對照仍約 1.85 秒停滯 |
| `cbaa7483214bd408` | 再保留老師監聽，對齊獨立錄影頁的音訊路由 | 約 1.59 秒時播放停滯 |

第三項的普通預覽跑完約 15 秒，介面報 elapsed=15465ms、maxDrift=91ms、maxRenderGap=28ms；同候選匯出仍失敗，且先前的 lastError 仍在。這只支持「預覽與錄影路徑表現不同」，不能用預覽完成代替 VS 成檔。原生 Safari 的 CanvasCaptureMediaStreamTrack 與 requestFrame 均存在，未證明缺 API 或停用首條擷取 track 是根因。

## 原版失敗片段的獨立解碼

還原產品後，在新私人 origin 只附加被動事件／影格／MediaRecorder 資料觀察，不更改播放、繪圖、時鐘或護欄。合成 File 與 change 事件由診斷腳本提供，真正輸出按鈕仍由原生介面點擊；執行期間不讀介面。兩片已完整 buffered（老師 0–80／自己 0–75 秒），readyState=4、networkState=1、document.hidden=false；AudioContext 持續 running，另核對系統未鎖屏。

兩側 playing 都在 47ms，824ms 被產品護欄 pause。老師只收到一次影格通知（126ms／mediaTime=12）；自己收到四次，最後 mediaTime=4.1。同期 currentTime 卻已前進到老師 12.775840／自己 4.498182 秒，表示媒體時鐘不能代替畫面內容。

攔取 recorder 的 dataavailable 另存本機，得到 19,442 bytes、0.910000 秒的 H.264/AAC **失敗片段**（SHA-256 `26c89da7ef7a444afe5f1b142f02cceff59315b61d4157490f40f65fa3572a77`）。FFmpeg 全檔解碼為 22 格；依合成片二進位碼解出老師全程 360、右側 360–362（右側使用相同基準碼），老師確實停在第 12 秒同一格。這不是成功 VS、產品下載或 G4，只證明錯誤不只是狀態字串。沒有放寬護欄來取得較長壞片。

## 獨立原生錄影與格式對照

產品外的最小頁用相同兩片、12／4 起點、固定 rate=1、1280×720 Canvas、rAF 繪圖、captureStream(30)，老師音訊送入 recorder，右片以零增益接同一音訊時鐘但不進成檔。每次明確按按鈕，約 5 秒後停止，僅保存合成資料到本機。以下片段全檔解碼均無錯誤；既有 `analyze-comparison.py` 仍拒絕 MP4 影格凍結。

| 原生錄影變項 | 容器長度 | 既有影格分析／限制 |
| --- | ---: | --- |
| HTTP 來源、MP4 | 5.103333s | 凍結 450.000ms，拒絕 |
| 指定 MP4 codecs | 5.105000s | 凍結 448.334ms，拒絕 |
| Blob 來源、MP4 | 5.100000s | 凍結 503.334ms，拒絕 |
| Blob ＋兩側影格回呼 | 5.100000s | 凍結 516.667ms，拒絕 |
| Blob ＋不透明 Canvas | 5.096666s | 凍結 511.667ms，拒絕 |
| Blob ＋WebM（VP8／Opus） | 未取得 format.duration | 可解碼，但既有分析器以 KeyError 中止，品質未驗證 |
| 只錄 Canvas 視訊、MP4 | 3.995000s | 5 秒牆鐘未涵蓋完整成檔長度，未通過 |
| 只錄音訊、MP4 | 5.057333s | AAC 可解碼，沒有視訊，不能驗收 VS |

MP4 的預設與指定 MIME 都回報 `avc1.42000a,mp4a.40.2`，ffprobe 實際為 1280×720 H.264 Constrained Baseline level 31／AAC；未證明指定 codecs 是產品失敗原因。Blob／HTTP、影格回呼、不透明 Canvas 各自都不能單獨解釋原版立即停滯。全檔解碼使用 `-enc_time_base:v 1:90000 -fps_mode:v passthrough`，避免預設 null muxer 的時間基準四捨五入產生重複 DTS 警訊；並未改輸入時間戳或裁去開頭。能解碼、能產生檔案與符合媒體門檻分開判斷。

## 一般 Safari 設定檔的具體前置條件

只讀 Safari「Profiles」設定頁，目前尚未啟用設定檔，只有「Start Using Profiles」。介面明確說啟用時會依現有設定自動建立 Personal profile。為遵守保留日常瀏覽環境的邊界，本次沒有點啟用或新增設定檔。若同意此初始化，下一步才建立專用 `Dance Stamp #3 QA` 一般設定檔，重做最短匯出／副本對照；不能拿私人模式的儲存錯誤直接判定一般模式，也不能假定新設定檔會解決錄影。

## 決策、既有證據與真實剩餘條件

純原生、不調速、不錄影也量到超過 250ms 的時鐘差，而共用時鐘改善不能解除實際成檔凍結，表示**不能認定產品調速是唯一根因**；同時也不能據此判定 Safari 所有環境都不可用。已取得呈現影格與失敗片段證據；下一個環境對照需要上述一般專用設定檔前置。拒絕放寬護欄、只重定位 currentTime、裁去開頭或引入未驗證預熱，避免把相同問題藏到成檔。未提交猜測性 runtime 修正。

- Safari 已實測：原生選片／解碼、比較設定、匯出被同步護欄拒絕、實際失敗片段逐格凍結、原生格式對照、失敗後標記 metadata 可寫；副本保存錯誤及後續等待另列阻礙。
- Safari 未通過／未驗證：成功 VS、成檔逐幀／音訊、下載後產品外回讀、JSON 往返與逐片重連、離線、一般模式／跨程序保存、九組速度／時長與十次 60 秒。同步及儲存前置已失敗，不擴跑完整矩陣。
- 真實相機／LED、光學同步、喇叭／藍牙實聽、硬體熱／電池與記憶體壓力仍需真人設備；手機暫緩。#10／#11 的 Safari 共同比較／匯出缺口保留，#12／#13 的 Safari 備份／副本／離線也沒有補造通過，沒有修改它們的候選 PR。
- Chrome #41：最新交付 head `b162b4db419935d9e826fdd45521fd943e007af6`，2026-10-28 核對 open／一般 PR／mergeable；兩項 review thread 已 resolved，[Harness CI #58](https://github.com/sunpochin/dance-stamp/actions/runs/40645606406) success，仍待 Claude Code 或使用者最終審查。其原受測產品 `e9e154a` 與本輪 main 的 `web/` 相同，靜態仍 `2f1ec6b3335cd790`；Chrome 24 組矩陣保留原版本歸屬，不重跑或移記成 Safari。
- #42／#43／#44 已合併；背景／中斷／20–200 MiB 的既有 Chrome 證據保持各自版本，不代替 Safari、真人、合併或發布核准。

本輪 `bun run check` 通過：342 tests／599 expects／0 fail、checkJs、Biome、公開內容掃描與 build；靜態仍為 `2f1ec6b3335cd790`。文件交付與品質檢查不能代替上述媒體驗收。未合併或發布，沒有因 Safari 失敗而啟動 iOS 備援。
