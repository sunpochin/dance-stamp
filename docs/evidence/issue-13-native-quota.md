<!-- 檔案用途：記錄 Chromium 原生配額拒絕、原子保留及重試的匿名證據。所在層：#13 儲存驗收。主要關聯：verify-native-quota.ts、storage.js、MEDIA_PROBE.md。 -->
# #13：原生配額拒絕後保留舊資料

2026-10-29 Asia/Taipei。本輪使用產品儲存函式與真正 IndexedDB，沒有修改產品 runtime、schema 或依賴。原生容量拒絕及解除限制後重試通過；這是儲存層證據，不是產品畫面恢復、實際低磁碟或裝置驗收。

## 版本與固定資料

- 產品基底 `45d1f9525908b981d3dac3ad9f2da1e5b3d1dae6`、靜態 `db129e273cf0039b`，受測storage.js SHA256 `2de40d537d2ab049596acaaf549e9e9d324e7b8ce705b0edfe86af1396dbbd77`，與來源逐byte相同。
- 首次成功時工具尚未提交，以測試SHA256 `01fe0586071a95e9e7c4c33323b4489c435eeff3718f31ebd52040004db20f20` 固定；提交後乾淨重跑結果另由交付PR綁定，不把產品基底commit冒充已包含該工具。
- macOS 27.0.1／Chrome 156.0.8078.49 headless、arm64、Bun 1.4.4、既有Playwright core。使用全新persistent profile與自有動態loopback主機，沒有啟動日常瀏覽器或相機／麥克風／畫面擷取。
- 合成筆記、動作、標記、take、配方與輸出關聯；三份各1,048,613-byte不可播放Blob及257-byte chunk。兩份候選為4,194,341／4,194,363 bytes，整組合成Blob固定11,534,800 bytes，小於32MiB，不填滿磁碟。

## 真正拒絕與資料保留

工具透過[官方CDP配額介面](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Storage.pdl)，只限制這個自有origin；未替換put、人工throw／abort、preventDefault或偽造事件。每輪同時要求產品Promise拒絕，以及原生capture listener收到`isTrusted=true`的IDBTransaction abort／QuotaExceededError。

| 情境 | 真正限制及結果 | 保留與重試 |
| --- | --- | --- |
| 替換已存副本並修改筆記 | overrideActive=true、quota=524,288 bytes；原生及產品均QuotaExceededError | 拒絕後library revision仍3，原生metadata／media／chunks的keys、完整JSON與每一Blob byte均相同；解除限制後同一候選成功，revision=4 |
| 新增副本並修改筆記 | 同一配額及原生拒絕；未留下半份新asset或Blob | 拒絕後revision仍4，全部原件逐byte相同；解除限制後同一候選成功，revision=5，無關原片與chunk不變 |

每次拒絕後立即及再觀察一秒各查一次原生stores；不依狀態字串或抽樣判定。Node另從完整base64 bytes重算SHA，與瀏覽器獨立摘要相同。成功後正常關閉整個自有瀏覽器，再以同一profile的新程序重開，完整JSON、revision、關聯及所有Blob bytes相同，沒有清庫、重新匯入或換空profile。

本輪`navigator.storage.estimate()`仍回較大估計值；它不作拒絕或保存成功的證據。重開時的配額usage查詢也不替代原生IDB內容。解除override後確認overrideActive=false，兩次自有瀏覽器的已知PID全部退出、主機停止、同nonce鎖釋放；媒體API呼叫0。

## 失敗基線與工具取捨

1. 第一輪立即縮小配額，CDP已顯示限制但產品仍成功寫入，因此原測試拒絕，沒有補mock或當成容量失敗通過。
2. 參考[Chromium公開實作的30秒空間快取](https://chromium.googlesource.com/chromium/src/+/c0811f657d5ae8c42a9fb827e7e36e7e58a16bab/content/browser/indexed_db/instance/bucket_context.h)，改以31秒空閒作工具前置。這支持快取機制的推論，不斷言已定位受測版本內部唯一原因；等待本身不算拒絕證據。
3. 第二輪產品已回QuotaExceededError，但DB bubble listener尚未提供足夠原生事件收據，工具仍拒絕。改在capture階段先記真正事件後，才有上表的完整證據；沒有放寬trusted事件及原子保留斷言。
4. 原生保存Promise的20秒觀察期限只讓工具失敗並清理，不冒充產品已回滾。上述失敗raw及profile均保留，未刪除後重算為同一成功輪。

既有`storage.js`的migration／未知版本／跨頁take鎖，以及`moves-storage.js`的升版／quota注入／取消／衝突回歸，另在空白隔離context通過；這些不加進兩項原生配額情境。原check與hooks結果由交付PR記錄。

## 範圍與交付

原生拒絕只改這次測試瀏覽器的origin配額；不宣稱真實磁碟滿、停電、寫入時強制終止、永久保存、Safari、UI取消恢復、可播放影片或跨裝置通過。工具／raw／profile只留原始碼或本機ignored output，測試工具不進產品runtime；匿名證據隨下載包，操作入口見[媒體檢查說明](../MEDIA_PROBE.md#chromium原生配額拒絕)。

#1／#13保持開啟，iPhone暫緩，獨立審查與其他真人／裝置／發布gates保留；未合併main或發布。

## 2026-10-30：小型檔案系統的實際低空間

先前 CDP 配額證據保留原範圍。本輪另在 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e` 的獨立工作樹，以新增 `--low-space` 模式驗證真正檔案系統耗盡；產品 runtime 逐 byte 未改，靜態仍為 `adbe8eb1d6acfd09`。工具與文件尚未提交時執行，不能稱為乾淨 head；工具 SHA256 `1b4d131d995d9da88f2f53ff7c8c15307d64f054f6c0f7a018ca151602818f8f`，storage.js SHA256 仍為 `2de40d537d2ab049596acaaf549e9e9d324e7b8ce705b0edfe86af1396dbbd77`，最終交付由 PR 綁定。

使用 macOS 27.0.1／arm64、Chrome 156.0.8078.49 headless、Bun 1.4.4、既有 Playwright core。每輪建立全新 256 MiB HFS+ 映像及全新 persistent profile；只掛載工具新建映像，拒絕既有磁碟與 profile 參數。原生 IndexedDB 的 LevelDB 與 Blob 目錄均核對位於這個獨立裝置。相機／麥克風／畫面擷取被禁止，沒有私人檔案或填滿宿主磁碟。

沿用三份各 1,048,613-byte 原件、257-byte chunk、非空筆記及完整關聯；兩份候選仍為 4,194,341／4,194,363 bytes。沒有設定 CDP quota override，`overrideActive=false` 全程保持。

| 情境 | 真磁碟拒絕 | 完整保留與重試 |
| --- | --- | --- |
| 替換副本並修改筆記 | 自有 filler 實寫 249,954,304 bytes 後取得 ENOSPC，可用空間 49,152 bytes；原生交易 trusted abort／DataError，產品回相同 `Failed to write blobs (IOError)` | 拒絕後立即及延後讀取，原生 metadata／media／chunks keys、完整 JSON、revision 3 及每一 Blob byte 全相同；只刪自有 filler 後，同一候選與 Blob 重試成功到 revision 4 |
| 新增副本並修改筆記 | 新 filler 實寫 245,432,320 bytes 後 ENOSPC，可用空間 4,096 bytes；同樣 trusted abort／DataError，無配額 override | 舊資料與 revision 4 保留，未留下新 asset／半份 Blob；釋放空間後同候選成功到 revision 5，無關原片及 chunk 不變 |

兩次釋放後都排除 31 秒空間快取再重試；等待本身不作成功證據。關閉完整自有瀏覽器後，以同一 profile 新程序重開，原生全庫、產品內容、關聯、revision 5 及所有 Blob bytes 精確等於提交快照。runner 逐 byte 比較之外，本輪另用獨立讀取核對兩次拒絕的原始完整 JSON／base64 與 SHA，以及重開快照。原 `storage.js`／`moves-storage.js` 瀏覽器回歸另在空 context 通過，不合併成低空間情境數量。

兩個自有瀏覽器的 7／6 個已知 PID 均已退出，臨時服務停止、自有填充檔釋放、映像正常卸載、同 nonce 鎖釋放，媒體 API 呼叫 0。成功原收據 SHA256 `62237537450b2cf5e41e9f4a51be1e7c7f076fd935857546d7d3e40ce378147b`；完整快照、磁碟映像及 profiles 都只留本機 ignored output。

### 保留的失敗輪與判定取捨

最早私有探索在他人持有共用鎖時被 EEXIST 拒絕，未取得鎖或啟動瀏覽器。第一個實際低空間輪已取得 ENOSPC 與 trusted DataError abort，但工具仍套用配額模式的 QuotaExceededError 名稱要求，因此保持 failed；該輪沒有驗證保留／重試，不能拼入成功輪。其收據 SHA256 `ea0e12369e14d5e47f68119d9231622f700262aa0a2d786aec6b5a60661101ba` 與 profile 留存，原生瀏覽器、填充檔、映像與自有鎖已收尾。

修正的是 QA 對兩種拒絕的判定：預設配額模式仍要求 QuotaExceededError；只有新建小磁碟的低空間模式可接受精確 Blob IOError 的 DataError，且仍須與真正原生錯誤一致及 trusted transaction abort。其餘完整資料、延後保留、同候選重試、重開與清理斷言不變。沒有修改產品、mock throw／abort 或降低資料保護門檻。

同一工具 SHA 另從頭重跑預設 CDP 配額模式：替換／新增各取得真正 QuotaExceededError／trusted abort，完整保留、同候選重試到 revision 4／5、同 profile 新程序重開及兩份原 storage 回歸通過；7／6 個已知自有 PID 退出、override 解除、主機停止及鎖釋放。該輪收據 SHA256 `476c70e1a49cdc2164f9a28bd4e3196989c590f5907d9c89a5d75e040e8879e1`，不當作另一份真低空間數據。無效額外參數亦在映像／瀏覽器建立前拒絕。

本輪原 `bun run check` 通過：382 tests／1309 expects／0 fail、17 份 harness 指紋、公開掃描、checkJs、原 lint 與 build；工具另以 Bun 保留外部引用的語法建置通過。第一次受限環境僅 HTTP 測試無法綁定本機臨時埠，允許本機測試服務後沿原入口重跑通過，未改測試或品質門檻。提交／推送仍執行原 hooks。

這填補的是 Chrome 儲存函式在小型真實檔案系統 ENOSPC 下的證據；不是整台電腦磁碟滿、產品 UI／草稿、Safari、實體裝置、飛航模式、斷電、永久儲存或影片可播放性驗收。#13／#1、既定獨立審查、其他裝置及發布 gates 保持開啟；iPhone 暫緩。

### 整合目前 main 後的同版重驗

開 PR 時遠端 main 已由另一輪審查更新為 `c0ab39bcf68354cc29d7048a0d81e56d626efcf1`，本 PR 因此同步來源並重跑。最新受測產品 bytes 精確等於該 main，靜態 `422c70c3633b8e88`、storage.js SHA256 `d470fecd1c030878ae2e1750f68d3ad130e84d8393bdfaafb99dbd68a98b2e8a`；不把上面舊 runtime 的成功直接轉移。最終工具 SHA256 `b75796b83826d2564c8324529345804f4bddc0ecda53aadafa6afba9ca489d4f`，原生執行時為同步後分支的工作樹，並非最終提交的乾淨 head。

最新低空間模式在獨立新映像完整從頭通過替換／新增兩案，兩次 filler bytes／ENOSPC 後可用空間與上表相同；真正 trusted DataError abort、原生全部欄位／Blob bytes 保留、同候選重試 revision 3→4→5、跨程序重開及兩份原 storage 回歸均通過。另以獨立讀取核對該輪原生完整快照與所有 bytes／SHA，不依舊輪結果推定。兩個自有瀏覽器的 7／6 個已知 PID、服務、映像及 nonce 均收尾。該輪原收據 SHA256 `fbeb7057bf487b614c5759b16a20385aa0d719417cde7d87fc6eda1cec60247b`。

同一最終工具與產品版本再獨立重跑預設配額模式，替換／新增皆為 QuotaExceededError／trusted abort，完整保留、重試 revision 4／5、同 profile 跨程序重開及兩份 storage 回歸通過；7／6 個已知自有 PID、override、服務及 nonce 全數收尾。該輪原收據 SHA256 `0ff9b294a99babeb1457f05a1747883a7644eb277d39bada2d1f54e8a2c600a4`；不混入真低空間案數。

整合時原 VM 收尾測試缺少新映像狀態，三案因 ReferenceError 失敗；補齊測試狀態並執行真正 release／close／finally，原斷言保留。另新增正常卸載、卸載失敗、啟動不明、程序稽核失敗四案，只替換 OS 邊界；只有確認收尾的一案可卸載及放鎖。該檔 16 tests／93 expects／0 fail；最新完整 `bun run check` 為 412 tests／1575 expects／0 fail，型別、原 lint、公開掃描及 build 通過。先前 382 項與舊 source head 的原生結果仍保留各自來源。

### 獨立收尾錯誤邊界審查

2026-10-30 Asia/Taipei，獨立 clone 審查 PR #73 最新 `27d72ef122ae82531d7cdebd085c52c0f7561eae`，base main `c0ab39bcf68354cc29d7048a0d81e56d626efcf1`。原收尾回歸 16 tests／93 expects 通過，確實以 VM 執行原工具的函式及 finally，沒有只比對字串；但掛載前置及 ps 的另一種錯誤回覆未被涵蓋。

新增負向案例、尚未修工具時，在補齊 VM 的 context 狀態後得到 18 pass／3 fail：

- `hdiutil attach` 直接失敗及已建立裝置才失敗，都因 `attached` 只在成功回傳後設 true 而誤放自有鎖；未嘗試卸載，不能推論沒有殘留裝置。
- 自有 PID 的 ps 查詢回 1、stdout 空、stderr 為權限錯誤時，原工具仍將 `browserClosed`、`passed` 及 `lockReleased` 設為 true；空結果不是成功稽核。

修正只增加 attach 未確認狀態、raw 欄位與放鎖守門，以及 ps 必須無 stderr 診斷。create 失敗／留下部分映像但從未 attach 時，保留原始檔即可放本輪鎖；attach 失敗則保留鎖及映像，不能自動推論或強制卸載。成功掛載後仍只正常 detach 本輪 mountpoint；filler unlink 失敗記失敗，已確認退出且映像成功卸載時可放鎖，但不宣稱填充檔已釋放。

擴充回歸直接執行原工具的 mount、fill／fsync／close、release、launch、closeOwnedBrowser 與 finally；只有檔案系統、hdiutil、Playwright、CDP／ps 邊界使用替身。涵蓋 create 失敗／部分成功、attach 失敗／部分成功／成功、write 回報 ENOSPC、fsync ENOSPC、其他寫入／close 失敗、既有 filler 拒絕、宿主／過大裝置拒絕、filler unlink 失敗、launch 未交回 handle、handle 返回後設定失敗、context.close 失敗、CDP／ps 錯誤、正常與失敗卸載。收尾檔在 Bun 1.4.4 為 34 tests／198 expects／0 fail；本輪全程沒有啟動原生 Chrome／Safari、建立或掛載實際映像，也沒有取得、刪除或接管共用媒體鎖。

本輪完整 `bun run check` 通過 430 tests／1680 expects／0 fail、17 份 harness 指紋、236 檔公開掃描、型別、原 lint 及 build，靜態仍 `422c70c3633b8e88`；19 項既有 lint info 保留。首次受限環境只有既有 HTTP 測試不能綁本機臨時埠，之後允許本機測試服務、沿原入口全數通過，沒有更改或跳過測試。工具以保留外部引用的 Bun 語法建置亦通過。

產品 runtime、storage.js、schema、依賴及媒體門檻未改。上面的原生成功仍只歸屬舊工具 SHA；本次只提供收尾邏輯的故障注入證據，不宣稱修改後工具已重跑真正低空間／配額矩陣。既定 Claude Code／使用者最終審查、產品 UI／Safari／實體／跨裝置驗收與 #13／#1 均保持開啟；iPhone 暫緩，未合併、部署或發布。
