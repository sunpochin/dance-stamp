<!-- 檔案用途：記錄合成相機來源自行耗盡時的原生中斷與資料保全。所在層：#103 工程證據。主要關聯：camera-preview-cancel.js、main.js、TECHNICAL.md。 -->
# #103：相機影像來源自行結束，內容仍可帶走

## 怎麼用、為什麼有效

相機影像突然結束時，先保存或下載已錄到的原片。重新開啟同一個瀏覽器，再選原來的筆記與「開啟自拍／恢復」，仍可取回中斷片段。它像寫到一半的紙：雖然沒有寫完，已寫的內容還在；不能把這張紙標成已完成的十五秒錄影。

本輪用會自行播完的合成影片當影像來源，驗證瀏覽器真正送出中斷通知後，預覽與錄影都會收尾，舊影片、筆記及已完成 VS 保留。沒有更改產品處理方式，也沒有碰真人相機或麥克風。

## 範圍與來源

- Issue：[#103](https://github.com/sunpochin/dance-stamp/issues/103)，仍開啟；本輪不宣稱全 App 已到 100%。
- 從同步 main `e6f0300aa9ce1c882ec1887f5f792ee8fe6b63de` 建 `codex/issue-103-native-camera-end`。只追加原 `camera-preview-cancel` 最後的驗證，以及本文件／技術索引；原 67 項名稱、順序、runner、素材產生器與期限不改。
- 既有受控 loadeddata 取消、同頁重試、舊資料及真正 VS 下載斷言全部保留。本輪不借用其他候選 #137／#141／#142 的測試或結果。
- 九份產品 JS 保持此 main 的內容，分母仍為 2,048 行／678 函式／2,207 分支臂；靜態版本 `4525b1293b89a584`。
- 本機原生情境：Bun 1.4.4、Chrome 156.0.8078.76、macOS arm64；來源為上述 parent 加測試工作樹，`trackedChanges=true`，不是最終乾淨提交重跑。
- 受測測試 SHA-256：`a8cc42ac6358837c30f1ec074707c1e933138dece1ced38c67c4115dbb86ed50`。

## 原生來源與保全契約

依 [W3C Media Capture from DOM Elements](https://www.w3.org/TR/mediacapture-fromelement/)，媒體播放結束會終止被擷取的 track。本輪公開相機按鈕仍呼叫 getUserMedia，但隔離頁的明示測試 adapter 只回傳原八秒合成檔 `captureStream()` 的影像；檔案音軌立即停止且不交給 App，沒有呼叫硬體擷取。沒有派送假的 ended／mute，沒有直接停止影像 track、錄影器、改時鐘或時間門檻。

瀏覽器先送出 trusted track mute，產品即停止並清理監聽；之後收到 trusted 來源 ended，保留的原 track 狀態為 ended。故不要求已清除的 track ended 監聽再收到事件，也不把來源 ended 混稱 track ended。

1. 公開建立並保存兩側合成原片、非空筆記及真正 VS。預覽來源自然結束後，完整舊記錄、revision、每份舊媒體 SHA／大小與既有 URL 均不變，預覽釋放、錄影入口停用。
2. 按公開「準備下一段」，原八秒示範取 0–7.5 秒、0.5×，仍遵守十五秒錄影契約與原三秒倒數。相機來源在八秒自然結束，原生編碼器 start／非空 dataavailable／stop 全部 trusted、沒有 error；得到 4,930ms／5,174 bytes 原片，take 為 interrupted、資產為 ready，不當作完整錄影。
3. 所有既有資料表記錄與媒體完整指紋不變，只新增一段，revision 恰為原基準 +2。真正下載中斷原片及原 VS，完整 bytes／SHA 等於各自已保存資料。
4. 同 profile 重開後，完整保存記錄與媒體不變。公開開啟此中斷原片、再次真正下載，SHA 相同且沒有重寫記錄；兩次來源的原影像 track 均 ended，預覽釋放，沒有螢幕擷取。

## 本機結果與產品外播放

原案例加上述尾段 **1/1 passed、0 頁面例外、21,110ms**。`coverage/app-giXbzp/run.json` 保留來源與正常收尾；原瀏覽器／測試主機停止、自有 nonce 釋放後，另開未載入 App 的 Chrome 原生 file 播放器，沿原 `download-playback.js` 真正 Space 手勢驗證三份下載。

| 下載 | bytes | 時長秒 | 畫面 | 音軌 | ended／error | 播放 dropped | 全軌解碼 |
| --- | ---: | ---: | --- | ---: | --- | ---: | --- |
| 中斷原片 | 5,174 | 4.930100 | 180×320 | 0 | true／0 | 1 | exit 0 |
| 原 VS | 62,358 | 2.984396 | 1280×720 | 1 | true／0 | 0 | exit 0 |
| 重開後原片 | 5,174 | 4.930100 | 180×320 | 0 | true／0 | 1 | exit 0 |

原片兩份 SHA-256 都為 `45b0063739f3bef53c1e425939b651b8fb2472e6605de2de6794e486e2728fcd`；VS 為 `32a5f12e66990d0190da81e1c5957eca00391859227549a65182bb46ff1c21a2`。原片沒有音軌、音訊解碼 bytes 為 0；原 VS 單一音軌、解碼 bytes 為 9,800。所有影音軌 FFmpeg 完整解碼 3/3、stderr 空；掉格原值保留，不重播追零，不當作 G1–G7 通過。獨立入口確認所有已知自有 PID 退出、nonce 相符才釋放鎖。

## 前置失敗與限制

原生能力調查第一次從 file 頁擷取，瀏覽器因不透明 origin 拒絕 captureStream；改同源 localhost 合成頁後確認真正 mute／ended。未放寬瀏覽器安全旗標，原失敗收據保留。

App 初次選錯既有八十秒 silent 素材，十五秒原等待逾時（`app-lETcY4`，19,422ms）；改用原八秒檔，第二次忘先按「準備下一段」，舊 take 的範圍依產品規則鎖住而 fill 逾時（`app-zDBKVF`，27,438ms）。確認實際時長及公開操作順序後修正測試前置，沒有修改產品、解鎖 disabled 或增加等待期限。兩個失敗均保留、各 0 頁面例外及正常收尾；第二輪十個已知自有 PID 之後均已退出。

正常 `bun run check` 通過：648 tests／3,179 expects／0 fail、公開內容掃描、型別／lint／build完成，保留19項既有lint資訊。第一次受限執行在既有HTTP測試的原生port 0監聽失敗（647 pass／1 fail），保留日誌；改用允許本機監聽的正常主機環境後，全套原檢查通過，沒有改測試或繞過hook。

本輪僅選定案例及上述三份實際下載通過；最終乾淨提交的完整 67 項與 CI 另記，不能用單項百分比替完整 App 背書。實體相機斷線、Safari、真人聽感、實體／跨裝置、OS 中斷與 G1–G7 未由此證明，iPhone 繼續暫緩。待 Claude Code／使用者最終審查，不合併、不正式發布。測片、真下載、失敗及原始收據留本機 ignored output／coverage，不公開附件。
