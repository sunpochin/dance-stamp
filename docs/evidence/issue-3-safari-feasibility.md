<!-- 檔案用途：保留 #3 真正 Safari 的同步與儲存失敗，避免拿 Chrome 證據代替。所在層：版本化驗收證據。主要關聯：RECORD_COMPARE.md、MEDIA_PROBE.md、#10、#11。 -->
# #3 macOS Safari：前景雙片失敗與有界診斷

狀態：2026-10-28（Asia/Taipei）；**仍需修正／釐清，不能宣稱 Safari P0 可用**。本輪沒有改產品 runtime、資料格式、同步門檻或其他票的候選 PR。#3 保持開啟，iPhone 暫緩，未觸發 #16。

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

先前交接另記同版產品右片停在 4 秒；「禁止微調 playbackRate」與「固定兩片可見」兩次有界試驗都未解除匯出拒絕。本輪未重做那兩次試驗。上表是進一步隔離，三輪都不是修復，也沒有採用雙音訊來源圖到產品。

## 決策、既有證據與真實剩餘條件

純原生、不調速、不錄影也量到超過 250ms 的時鐘差，表示**不能認定產品調速是唯一根因**；同時也不能據此判定 Safari 所有環境都不可用。還需能隔離一般／私人環境的專用 Safari 測試環境，量真正呈現影格與原生起播，再判斷產品相容性修法。拒絕先放寬護欄、只重定位 currentTime、裁去開頭或引入未驗證預熱，避免把相同問題藏到成檔。未提交猜測性 runtime 修正。

- Safari 已實測：原生選片／解碼、比較設定、匯出被同步護欄拒絕、失敗後標記 metadata 可寫；副本保存錯誤及後續等待另列阻礙。
- Safari 未通過／未驗證：成功 VS、成檔逐幀／音訊、下載後產品外回讀、JSON 往返與逐片重連、離線、一般模式／跨程序保存、九組速度／時長與十次 60 秒。同步及儲存前置已失敗，不擴跑完整矩陣。
- 真實相機／LED、光學同步、喇叭／藍牙實聽、硬體熱／電池與記憶體壓力仍需真人設備；手機暫緩。#10／#11 的 Safari 共同比較／匯出缺口保留，#12／#13 的 Safari 備份／副本／離線也沒有補造通過，沒有修改它們的候選 PR。
- Chrome #41：最新交付 head `b162b4db419935d9e826fdd45521fd943e007af6`，2026-10-28 核對 open／一般 PR／mergeable；兩項 review thread 已 resolved，[Harness CI #58](https://github.com/sunpochin/dance-stamp/actions/runs/40645606406) success，仍待 Claude Code 或使用者最終審查。其原受測產品 `e9e154a` 與本輪 main 的 `web/` 相同，靜態仍 `2f1ec6b3335cd790`；Chrome 24 組矩陣保留原版本歸屬，不重跑或移記成 Safari。
- #42／#43／#44 已合併；背景／中斷／20–200 MiB 的既有 Chrome 證據保持各自版本，不代替 Safari、真人、合併或發布核准。

本輪 `bun run check` 通過：342 tests／599 expects／0 fail、checkJs、Biome、公開內容掃描與 build；靜態仍為 `2f1ec6b3335cd790`。文件交付與品質檢查不能代替上述媒體驗收。未合併或發布，沒有因 Safari 失敗而啟動 iOS 備援。
