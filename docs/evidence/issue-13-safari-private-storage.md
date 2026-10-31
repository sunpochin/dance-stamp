<!-- 檔案用途：隔離 Safari 私人影片寫入與缺交易結束通知，說明安全另存與未採用的修正。所在層：#13 固定來源工程證據。主要關聯：START_HERE.md、storage.js、PR #143。 -->
# Safari 私人視窗：影片保存限制的原生對照

## 怎麼用、為什麼有效

這一版 Safari 的私人視窗能保存本輪測試的簡單資料，但不能透過目前的影片保存方式寫入原片。若看到「保存狀態未確認」，先留著原分頁，下載原片、可下載的 VS 及已保存筆記備份，確認檔案確實已另存後，再按產品的原頁讀回入口。要改到一般視窗，另開一般視窗匯入 JSON、逐份選回影片並確認；資料不會自動跨視窗搬家。

像搬家前先把紙和影片分開裝好：備份 JSON 只有筆記，原片與 VS 仍要另外保存。這份調查沒有讓私人模式變成可存影片，也沒有修好私人 VS 或連續長輪的同步失敗。

## 來源與方法

2026-10-31，macOS 27.0.1／Safari 27.0.1，原生普通與明確顯示 Private Browsing 的新視窗；沒有改 Profiles、偏好、隱私或自動化設定。產品來源固定 main `e6f0300aa9ce1c882ec1887f5f792ee8fe6b63de`，靜態 `4525b1293b89a584`。本輪不改產品 JS、格式、儲存 schema 或任何期限。

沿 [PR #143 的失敗紀錄](https://github.com/sunpochin/dance-stamp/blob/26479366afa5fa6282da9b312243bf971da51bee/docs/evidence/safari-practice-validation-2026-10-31.md)，先將儲存與媒體合成分開。三組調查各用新 loopback origin、自有原子 QA 鎖及具名前綴合成資料庫；只選同一份 175,911-byte／8 秒合成 MP4，完整 SHA-256 `b7f6393b07df4761ee039d785b225a90e16481a7eb4a2f760a75949b95e7755a`。沒有讀真人素材、開相機／麥克風或傳送影片；HTTP 權限政策禁止硬體擷取。

第一組只用原生 IndexedDB；第二組在原生控制後，載入逐 byte 保持原樣的 `storage.js` 與相依模組，九份來源指紋均核對；第三組只測原生中止時機。輸入與開始按鈕均由原生 UI 操作，收據保留 trusted 通知；未派送假事件、preventDefault 或改寫成功／回滾結果。這些是隔離調查，不計入 App 覆蓋率或完整 P0。

## 一、相同內容的三種表示方式

| 原生單表寫入 | 普通視窗 | 私人視窗 |
| --- | --- | --- |
| ArrayBuffer（純 bytes） | trusted success／complete；讀回一致 | trusted success／complete；讀回一致 |
| 同 bytes 重建 Blob | trusted success／complete；讀回一致 | trusted UnknownError／abort |
| 原選取 File | trusted success／complete；讀回一致 | trusted UnknownError／abort |

兩個私人失敗的訊息均為 `Error preparing Blob/File data to be stored in object store`。同一普通分頁重開後三種內容、同一私人分頁重開後已成功提交的 ArrayBuffer，大小與完整 SHA 均相同；只讀取已確認成功的項目。沒有把私人視窗關閉後的保留、長片、quota 或任意資料類型一併判通過。

## 二、原生雙表／雙寫與產品模組

原生控制先在 `metadata` 寫簡單物件，再在 `media` 寫同一 File，兩者同一交易；之後才載入產品模組並建立合成筆記基準。兩種視窗均以相同順序操作，沒有先跑 VS 或錄影。

| 路徑 | 普通視窗 | 私人視窗 |
| --- | --- | --- |
| 原生雙表、兩次 put | trusted complete | trusted request UnknownError、defaultPrevented=false；4 秒觀察未見 complete／abort |
| 產品筆記基準 | trusted complete，revision 1 | trusted complete，revision 1 |
| 產品 `writeLibrary` 保存 File | 4ms 完成，revision 2；保存原片完整 SHA 一致 | 1,006ms 拒絕為 StorageUnconfirmedError；unknown=true，未讀取結果不明的 DB |

另在原產品等待結束後 1.5 秒旁聽通知，私人兩條失敗交易仍只見原錯誤，未知旗標仍為 true；這個檔名雖含 `reopen`，內容明示 `late-events-only-no-db-read`，**不是重開資料驗證**。第二組的未確認狀態沒有另讀 DB、重試寫入或宣稱回滾。

所以缺結束通知可以在載入產品前的原生控制重現；它不需要產品合成或產品交易監聽才能出現。但本輪同時變動了交易中的表數、寫入數及要求監聽方式，尚未證明是哪個因素單獨觸發 WebKit 行為，也未定位引擎內部根因。

## 三、原生中止時機的反例

在另一新私人 origin，先保存各案例自己的非空合成筆記與 bytes sentinel，再於雙表交易改筆記並嘗試寫 File。三案都收到 trusted UnknownError：

| 策略 | 原生呼叫結果 | 結束觀察與處置 |
| --- | --- | --- |
| 被動等通知 | 不另呼叫 abort | 4 秒未見 complete／abort，不讀 DB |
| 錯誤當下立即 abort | 呼叫正常返回 | 4 秒仍未見 complete／abort，不把返回當作回滾 |
| 一秒後 abort | 原生 InvalidStateError：交易已非作用中或已結束 | 4 秒仍未見 complete／abort，不據此猜測資料狀態 |

「提早 abort 就能解除未確認」的候選因此不採用。原產品一秒未確認護欄、禁止再寫及明確同頁讀回契約保留，不延長／縮短期限換結果。純 bytes 單次可用也不足以替換產品 Blob 格式：舊頁／舊資料讀取、長片、chunks、migration、容量、取消與恢復尚無對應驗證，本輪未新增第二種媒體格式或自動重寫資料。

## 原始收據與清理

收據、原生畫面、工具快照及全部指紋留本機 ignored output，另作白名單持久副本；不公開影片、profile、origin、window ID 或測試 nonce。

| 本機收據 | SHA-256 |
| --- | --- |
| `output/safari-storage-probe/normal-write.local.json` | `52117e77d36de6325f893f559087ad3b9ea6e45d9f3978a7cd3dc0b511376b43` |
| `output/safari-storage-probe/private-write.local.json` | `8685eadf7c6700619c702f68cd08d13c9aaaf7426a01ff4fc3b4da101d839b44` |
| `output/safari-storage-probe/normal-reopen.local.json` | `77c076e5cde860ce6d3d63f49a9b493e296046e030061980c7397995d5afc0d2` |
| `output/safari-storage-probe/private-reopen.local.json` | `8b4a041273b4b81d4185738d7fc855df976268fe692b410926577956e0b36917` |
| `output/safari-storage-product-probe/normal-write.local.json` | `a658a3683ffdae5b48fc26c18951883df5e14d6597bb62a424c931959a71a62d` |
| `output/safari-storage-product-probe/private-write.local.json` | `768db05d1fe109bd08945c73c0ad0b1c2d09fc7fb905a0f5a5e7b5ea3924d4d2` |
| `output/safari-storage-abort-probe/private-write.local.json` | `92ad79c0970b5374332cd0f5ee499e4e05670dc3bda3454d5e1467c095a08746` |

三個自有主機均正常退出，原埠拒絕連線，自有 nonce 核對後才釋鎖；只關閉本輪視窗，已回到原來的普通 Start Page。未清除網站資料或刪除產品資料庫，也未退出日常 Safari。第一組工具的部分 HTML 標籤因 String.raw 顯示為 Unicode escape；量測腳本、原生型別與收據不受影響，原工具與畫面照原樣保留；後兩組以正常模板顯示標籤，沒有重跑追綠。

相同錯誤字串另見 [WebKit 歷史紀錄 188438](https://bugs.webkit.org/show_bug.cgi?id=188438)；該票標示已修復，不能拿它證明本機版本已修好，也未推定為同一根因。此頁結論以本輪原生收據為準。

正常 `bun run check`：648 tests／3,179 expects／0 fail，304 檔公開掃描、型別／lint／build 通過，19 項既有 lint 資訊保留。首輪為 647 pass／1 fail，原封裝測試抓到使用指南新增的相對連結沒有隨包；已在唯一 `packageInputs` 白名單加入這份匿名文件，沒有放寬測試、夾帶 raw 或跳過 hook。最終乾淨提交的實際封裝與 CI 另記交付結果，不由專案檢查通過替上述私人寫入失敗改標結果。

#13 仍開啟：實體離線、跨裝置、真實相機、長片容量、人工最終審查及原有驗收不由這些小型對照代簽；Safari 第五輪／私人 VS 的同步失敗另查，iPhone 繼續暫緩。本輪只補使用說明與工程證據，未合併或正式發布。
