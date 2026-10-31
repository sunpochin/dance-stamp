<!-- 檔案用途：記錄單側跟隨結果的 Safari 供聲分支回歸。所在層：匿名工程證據。主要關聯：tests/browser/follow-results.js、tests/app-coverage/run-app.ts、issue-170-follow-results.md。 -->
# #103 單側跟隨結果的兩條供聲路徑

老師和自己的影片各有自己的聲音。這次把同一張檢查表再走一遍：明確選用 Safari 專用的取聲方法，確認下載仍帶正確的聲音，按停止或遇到製片失敗也保留上次成品。Chrome 原本的檢查繼續保留。

這是 Chromium 裡選取 Safari 程式分支的合成回歸，不能當作原生 Safari、真人聽感或手機已驗收。產品沒有新增操作，也沒有修改影片或上傳資料。

## 缺口與做法

完整 CI #325 的來源為文件候選 `079a1b71`，其十四份產品 JS 與固定 main `51420754a3b60ec37237cd85540d44993488502f` 相同。原始報表列出十四個產品模組、七十六個情境；`follow-export.js` 的第28、29行未執行。這兩行是有界 AAC 解碼與 AudioBufferSource 供聲，原 `follow-results` 則走 Chrome 的 MediaElementSource。

新增第77個 `webkit-follow-results`，只在新的隔離 Chromium context 明確指定 Safari UA；原76個情境的名稱及順序保留。新情境直接讀取原 `follow-results.js`，不複製第二套案例。案例開頭另外核對 `safariAudio()` 必須符合指定分支，防止只有情境名稱不同、實際卻測同一條路徑。

兩條路徑共用原有全部斷言及期限：

- 真正本機模型分析兩側合成移動人物，製作三秒原速結果。
- 原生播放、定位、停止、人物位置、尺寸與片長，預覽與下載必須是同一成品。
- 實際下載後解碼音軌；老師660Hz、自己880Hz，各自相對另一頻率的能量比須大於原20倍。
- 逐側鏡像更新、停止與音訊啟動取消、編碼失敗、壞檔及成功換片後的舊成品保全。
- 原片 URL、位置與完整 library 資料不變，窄版不溢出，請求不得上傳或走站外。

十四份產品 JS、覆蓋率計數器、分母與忽略規則不改。不把 UA 當成瀏覽器引擎切換，也不以分支覆蓋取代原生媒體品質。

## 重跑

使用指定 Bun 1.4.4、已安裝 Chromium、FFmpeg 與 repo 內固定模型：

```sh
bun --no-env-file tests/app-coverage/prepare-fixtures.ts
bun --no-env-file tests/app-coverage/run-app.ts webkit-audio-branch follow-results webkit-follow-results
bun run check
```

沿原入口原子取得共用影音測試鎖，使用自有瀏覽器及合成檔案，收尾只釋放自己的 nonce。完整入口 `bun run test:coverage:app` 另含全部77個情境；選定三案不能稱完整輪或全 App 100%。

## 實測與限制

本機 macOS／arm64、Bun 1.4.4、已安裝 Chromium 156.0.8078.76，來源為 main `51420754` 加本 PR 的未提交測試；收據如實記錄 `trackedChanges=true`，不能改稱乾淨新提交重跑。十四份產品 JS 逐一 SHA 與該 main 相同。

選定三案 **3/3 通過、0頁面例外**：原 WebKit 供聲基線3,893ms、原 Chrome 單側結果19,809ms、新 WebKit 單側結果20,314ms。兩個單側案例均走真正預設介面、原模型與原生編碼，分支旗標分別為 false／true。原片、完整 library 與舊成品保全斷言全部通過。

同來源、同位置表的 `follow-export.js`：舊完整 CI #325 為行68/70、函式15/21、分支51/80；本輪選定三案為行 **70/70**、函式 **15/21**、分支 **59/80**。第28、29行已執行，沒有新增函式覆蓋；另6個函式及21個分支臂仍未覆蓋。這是單模組的選定輪結果，不代表完整77案、全 App 100% 或產品品質驗收。

本輪產品瀏覽器與主機停止、原鎖釋放後，重新取得自有鎖，用全新 Chromium context 在導航前設為離線，沿原 `download-playback.js` 逐一開啟六份真正下載的 `file:`。每份皆自然 ended、error0、掉格0、有正數解碼音訊 bytes；全程無 HTTP 請求。FFmpeg 另完整解碼全部影音軌，六份均 exit0、stderr空；重播前後檔案長度及完整 SHA 相同。鏡像檔也獨立核對原660Hz聲源，六份的期望頻率相對另一頻率能量比皆超過500,000，沿原20倍門檻。

| 路徑／成品 | bytes | 原生片長（秒） | 聲源 |
| --- | ---: | ---: | ---: |
| Chrome／老師 | 419,767 | 3.013567 | 660Hz |
| Chrome／自己 | 338,969 | 2.979600 | 880Hz |
| Chrome／老師鏡像 | 411,765 | 3.012333 | 660Hz |
| WebKit 分支／老師 | 431,409 | 3.018542 | 660Hz |
| WebKit 分支／自己 | 370,705 | 3.000368 | 880Hz |
| WebKit 分支／老師鏡像 | 420,098 | 3.000602 | 660Hz |

重播的已知自有程序均退出、nonce核對釋鎖；不操作其他聊天或日常瀏覽器。原始選定輪、六份影片、完整指紋、聲源與播放收據留本機 ignored 證據目錄，未上傳媒體。首次額外聲源分析使用 `.3` 時被 FFmpeg 拒絕，已保留錯誤；改為原案例使用的 `0.3` 參數分析原檔，沒有重製、重播或改門檻。完整檢查首次在本機 HTTP 測試保留連接埠時失敗（690 pass／1 fail、EADDRINUSE）；以允許本機主機的方式重跑同一檢查，產品及測試不因該失敗修改。

允許本機主機後，原完整 `bun run check` 通過：**691 pass／0 fail／3665 expects**，公開掃描、型別、lint與建置通過；原19項lint資訊保留，靜態版本仍為 `15c42b365938118a`。正常提交 hook 與精確提交的遠端 CI 另記最終結果。

原生 Safari、真人聽感、實體手機、長片及完整 G1–G7 保持未驗證；#103 的其他函式與分支缺口仍需各自證據。沒有合併、發布或關閉 issue。
