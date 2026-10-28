<!-- 檔案用途：綁定 #11 短片匯出故障、直式全身與單一老師聲源的獨立證據。所在層：媒體驗收。主要關聯：MEDIA_PROBE.md、export-failure.js、analyze-export-failure.py。 -->
# #11 匯出失敗與原片保護

2026-10-28 Asia/Taipei。受測產品 main `d2f126c239a306af603876eb48d78c559a4f86f7`，靜態版本 `2f1ec6b3335cd790`；交付提交由本票 PR 綁定。macOS 27.0.1、Chrome 156.0.8078.49 headless、Bun 1.4.4、FFmpeg 8.1.2。使用新隔離瀏覽器、本票獨立的隨機 loopback 埠、合成八秒素材；相機 API 完全不存在，主機另拒絕相機／麥克風權限。沒有真人、私人影片、第三方音樂、桌面操作或實聽。

## 先核對既有交付

- [#35](https://github.com/sunpochin/dance-stamp/pull/35) 已合併 `cbc5dee3b876ba6c3654c4b8e0dcec27e26f2bb9`，受審 head `9935b0654046316aa5e9cc3548ebde92a70eb2ad`；原保存佇列 P1 已結案，[該 head CI](https://github.com/sunpochin/dance-stamp/actions/runs/40589729482) success。
- [#36](https://github.com/sunpochin/dance-stamp/pull/36) 已合併 `aec1ca0897b4bb2c9986dcb059403924d29d5f37`，受審 head `e44e5675ba963ec6696493b6563346d39b070b22`；開啟 take 失敗混用配方的 P1 已結案，[該 head CI](https://github.com/sunpochin/dance-stamp/actions/runs/40610771235) success。
- 兩條入口、長片、不同起點、無音軌及十輪證據保留在[既有雙片](existing-comparison.md)與[#36 整合](issue-9-comparison-integration.md)，各自綁定原受測版本。本輪不重做或改寫這些數據；#41 的完整 G3 錄影矩陣由 #3 維護。

本輪未發現需要修改的產品缺陷；只補未直接覆蓋的故障與實際直式成檔證據。`web/`、媒體排程、時間映射、音訊路由、儲存格式及編碼程式均未修改。

## 故障後仍可下載與重試

`export-failure.js` 從正式既有影片入口選老師 2–5 秒／自己 1 秒起點，右側直式原片開鏡像，先完成三秒 MP4。隨後同頁依序驗證：

| 情境 | 確實觸發的行為 | 結果 |
| --- | --- | --- |
| 格式均無法啟動 | 五個候選建構均拒絕 | 明示失敗，不寫入半成品 |
| 非同步編碼錯誤 | 原生 recorder 開始後注入 error | 停止、明示編碼失敗 |
| 新檔無法解碼 | dataavailable 換成無效 bytes | 真正解碼器發生一次 error，拒絕新檔 |
| 讀回途中取消 | 攔住新驗證元素的 loadeddata，按產品停止鍵 | 回報取消，不新增輸出 |

四次均核對全庫資料、配方及下載 URL 不變，所有輸出 tracks ended，再真正點舊 VS 連結下載。四份下載完整 SHA256 均與基準相同。最後讓 MP4 宣稱支援但建構拒絕，原生 VP8／Opus WebM 備援在同頁成功；只新增一筆完成輸出，原 take 仍在。老師與自己的原片也各下載前後兩份，逐 bytes 一致。

取消回歸初稿只略過 load()，但設定 src 已開始原生載入，實際在取消前保存成功，因而正確拒絕該輪測試。修正測試以 capture listener 攔住 loadeddata 後才驗取消，產品未改；兩輪未通過的測試產物分別留在本機 ignored 目錄，不算通過。壞檔案例直接使用無效媒體 bytes，不以人工拋例外冒充解碼失敗。

## 實際下載檔獨立解碼

`analyze-export-failure.py` 用 FFprobe 原始影格時間，FFmpeg 以 passthrough 完整解碼，不自行補／丟幀；將 RGB 縮至 640×360 逐格檢查色條，減少測試記憶體。輸出本身仍是 1280×720。每格都驗上下邊界、右側直式留邊與左右鏡像；頭腳色條均保留。

| 檔案 | 真正 codec | 解碼幀數 | 解碼視訊時長 | 老師 660Hz 振幅 | 自己 880Hz 振幅 | 相對原老師增益 |
| --- | --- | --- | --- | --- | --- | --- |
| baseline.mp4 | H.264／AAC，各一軌 | 91 | 3.002200 秒 | 0.061620 | 0.00002350 | 0.985503 |
| retry.webm | VP8／Opus，各一軌 | 91 | 3.007000 秒 | 0.062379 | 0.00002419 | 0.997656 |

兩檔容器均符合副檔名，影格時間嚴格遞增、完整解碼 stderr 空。即時 WebM 沒有容器 duration；以最後解碼影格的 PTS 加該影格 duration 核對三秒片長，未填入預期值或放寬 ±300ms 界線。Chrome 原生 file URL 播放器在另一個乾淨隔離瀏覽器將兩檔播至 ended、error=0、dropped=0，實際音訊解碼 bytes 為 10,704／51,786；未沿用產品的 Blob URL 或 AudioContext，啟動參數 mute-audio，不能宣稱實聽。

音軌數與頻率之外，另將定音量 660Hz 與老師原片比較；0.8–1.2 倍範圍只用來攔截這個已知合成片的重複加總，不是新增音樂或真人的通用音量 gate。負向自查三項均拒絕：實際將右側腳部塗黑、將老師聲音加倍但仍只有一軌、竄改其中一份舊 VS；還原測試檔後完整正向分析再次通過。

SHA256：

- MP4：`6e3d9aaef4c16fd95488472953c4528857ad4d71a335d6108ef858495e5f33c2`
- WebM：`25e164af9d5ca67ea8aa08cb92a4d2d9cee8ab0abef8ab1389d7f46300bc29a3`
- 老師原片及前後下載：`11455ca99a959fd970f1aa8fa01ee33ab317333d3a971105f3d301f404a645f6`
- 自己原片及前後下載：`b7f6393b07df4761ee039d785b225a90e16481a7eb4a2f760a75949b95e7755a`

媒體與完整原始紀錄只留本機 ignored `output/export-failure/` 及聊天工作目錄，不公開上傳。可重現入口見 [MEDIA_PROBE](../MEDIA_PROBE.md#11-匯出失敗與直式全身成檔)。

## 邊界與待辦

這是三秒功能及成檔內容證據，靜態色條不能證明 G2 同步、G3 凍結、長片效能或 G6 錄影穩定性；不重跑、不移植 #41 同版完整矩陣。先前無音軌來源的無聲輸出與未知音軌資訊提示仍沿用原版本證據，不冒稱本輪重測。

實體相機、喇叭／藍牙實聽、手機保存／接收者、Safari、熱／電池／記憶體壓力仍未驗證，iPhone 仍暫緩。重要交付待 Claude Code 或使用者獨立審查；不合併、不發布、不關閉 #11／#1，也不觸發 #16。
