<!-- 檔案用途：記錄目前 Web 候選在真正 Safari 的一般／私人模式差異與實際壞片。所在層：版本化驗收證據。主要關聯：MEDIA_PROBE.md、analyze-media.py、safari-storage-probe、#3／#11／#13。 -->
# #3 當前 Safari：可保存不等於合成合格

狀態：2026-10-28（Asia/Taipei）。真正 macOS 27.0.1／Safari 27.0.1，受測乾淨來源 `85b1ba6e5cf431902d7814f74fd1032c17352bd5`、靜態 `db129e273cf0039b`。這是 [一般 PR #54](https://github.com/sunpochin/dance-stamp/pull/54) 的 P0＋P1 候選；P0 獨立靜態 `22c187ea10e457c2` 未在 Safari 重測。舊 `2f1ec6b3335cd790` 的七個失敗試驗仍見[歷史證據](issue-3-safari-feasibility.md)，不混記為本版結果。

原生介面、新建自己的 loopback 測試視窗、合成時間碼／閃光／660Hz 提示音，沒有相機、麥克風、私人影片、外部傳送或瀏覽器設定變更。測試持有跨聊天媒體鎖；完成後只關自己視窗、停自己測試服務並釋放鎖。一般模式使用普通新視窗與原本無筆記的專用測試 origin，**不需要啟用 Safari Profiles**；這更新了歷史紀錄的環境前置判斷，沒有操作 Personal profile 初始化或清除日常資料。

## 一般模式：成檔與品質分開

用 `make-sync-fixtures.py` 的 65 秒老師合成片，另以 `ffmpeg -n -i reference.mp4 -c:v copy -an self-silent.mp4` 建立無音軌的自己影片。兩片由原生檔案選擇器選取；A=0、B=15 秒、rate=1、offset=0、兩側不鏡像。不是 capture→export，也不代表實體相機 G2。

產品顯示「VS 影片已成檔並保存在此瀏覽器」，原生連結另存取得 1,220,846 bytes MP4；SHA256 `0b0f04e6f1ccb702b2626d5d7dbfb6fca235d301d910fec82ea6f7eb51237374`。診斷 elapsed=15,241ms、observedMaxDrift=220ms、maxRenderGap=30ms、decodedDuration=15,273ms。從按匯出到首次觀察成功的保守上界 34,753ms 包含輪詢等待，不能當成精確匯出速度。

原有 `analyze-media.py` v5 **完整解碼但回傳失敗**，未改門檻、時間戳或裁去首末：

| 實際成檔量測 | 結果 |
| --- | --- |
| 容器／影音 | 15.340 秒、1280×720 H.264／一軌 AAC、460 格、29.987fps；自拍原片無音軌 |
| 起／中／末配方誤差 | 0／−33.333／−33.333ms；新增漂移 −33.333ms |
| 最大逐幀配方誤差／內容時鐘誤差 | 266.667／356.667ms |
| 老師／自拍最長重複畫面 | **351.667／120ms**；老師超過既有 250ms |
| 閃光／提示音配對 | 各 15 個；原分析器最大差 **1006.667ms**，超過既有 100ms |
| 完整合法區間覆蓋 | **失敗**；容器比要求長 340ms，decoded video span=15.255 秒 |

產品的 JS 偏移／繪圖間隔及成功提示均不能推翻成檔量測。保留壞片與原 raw／analysis 在本機 ignored output，未把它當作 Safari G3/G4 成功，也不重跑完整九組／十次長片矩陣來掩蓋已知短片失敗。

## 一般模式：同 origin 關窗後取回

透過產品按鈕保存老師與自己原片；關閉自己的視窗，再開普通新視窗回同 origin。產品仍列 1 份筆記，開啟筆記→恢復自拍配方→取回已存 VS。三份下載皆逐 byte／SHA256 相同：

| 檔案 | bytes | SHA256 |
| --- | ---: | --- |
| 合成老師原片 | 1789027 | `3fb42ffb14678b8c944d605cab684a1919801de7908c1f540f7fbfc29ea26548` |
| 合成無聲自拍原片 | 1630207 | `a4d1a7add319661dfd76ae77c51c263ab2bf8a6f1eecbe6ded73accda071fb70` |
| VS | 1220846 | `0b0f04e6f1ccb702b2626d5d7dbfb6fca235d301d910fec82ea6f7eb51237374` |

這只證明一般模式本輪副本與壞片 VS 的同瀏覽器關窗恢復。WebContent PID 相同，沒有退出 Safari、重新開機、跨程序／實體裝置、容量壓力或離線驗收；也未把保存成功當作匯出品質合格。沒有清庫、重設儲存或刪原片。

## 私人模式及原生最小儲存對照

同候選、相同兩片與 15 秒設定，私人視窗匯出被「兩側偏移超過 250ms」護欄拒絕，`diagnostics.export=null`；沒有可量測成功輸出。按保存示範副本後持續等待，Stop 顯示要求保留資料但未恢復可操作，最後只關自己的測試視窗。未證明 abort／回滾或重開資料完整，不能標示恢復通過。

另以完全不載入產品程式的原生 IndexedDB 頁，在兩種模式各跑一次。每次使用隨機診斷 DB，先文字 write/read，再寫入並讀回 8 KiB、全 byte=83 的記憶體 Blob：

| 原生模式 | 文字往返 | Blob 結果 |
| --- | --- | --- |
| 私人 | 通過 | 3ms，`UnknownError`：`Error preparing Blob/File data to be stored in object store`，stage=blob-write |
| 一般 | 通過 | 23ms，8192 bytes 全部相符 |

此對照縮小到本機原生私人模式 Blob 路徑，不能由單次結果推論所有 Safari／OS。診斷每步五秒有界，timeout／abort 呼叫不當作瀏覽器已回滾；**未改產品儲存 timeout 或交付猜測 workaround**。同頁一般模式成功足以反駁「一般 Safari 一律不能存 Blob」，無須改使用者設定或強迫改用外部服務。

## 重現與接手

1. 先取得媒體鎖，以乾淨候選啟動自己的 loopback 產品測試服務；保留來源 revision／靜態識別。不要使用別人的 preview 或測試 DB。
2. 建立上述合成雙片；一般新視窗與私人新視窗分開選片，以同一設定匯出。下載檔、產品診斷與包含保存成本的時間上界分別記錄，再用原 v5 全片分析；沒有成功檔案就明寫未量測。
3. 最小儲存頁：`bun --no-env-file tests/browser/safari-storage-probe/serve.ts 42847`。只綁 loopback、僅兩條讀取路徑、禁止相機／麥克風；正常與私人模式各明確按一次執行。JS／HTML 與本輪已測檔案逐 byte 相同，主機只做路徑白名單，不依賴產品 storage.js。
4. 一般模式保存兩支原片、關自己的視窗再開同 origin，從產品恢復並下載三份檔案逐 byte 比對；不要以狀態字串、單一首幀或清庫後重建代替恢復。

決策：桌面 Chrome 的既有 24 組證據維持原版本；一般 Safari 保存前置在本輪可用，但即時 VS 仍需修正，支援文字維持 Chrome 預覽版。未放寬 G2/G3、未另建時間映射、未啟動 iOS，iPhone 持續暫緩。人工／光學／聲音／跨裝置／發佈 gates 仍保留，#1／#3 保持開啟。
