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
