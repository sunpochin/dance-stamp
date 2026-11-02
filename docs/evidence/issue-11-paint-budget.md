<!-- 檔案用途：記錄 #11 共用繪圖預算的重現、最小修正及驗證邊界。所在層：匿名工程證據。主要關聯：TECHNICAL.md、RECORD_COMPARE.md、web/timeline.js、tests/unit/paintBudget.test.ts。 -->
# #11：一個拍點用過就不能再用

## 白話用法與效果

操作維持選兩片、各選起點、預覽、輸出 VS。原本兩支影片與畫面更新可能同時敲門；有時第一個敲門者已經畫了一張，卻沒有把那個拍點標成用過，後面兩個就又畫一次。現在用過的拍點會往前走；如果中間等很久，只畫現在這張，不補一串舊畫面。

這只修正重複花繪圖預算的缺陷。是否改善實際下載影片的聲畫品質，要另外讀回成檔；不是原 130ms 聲畫失敗或診斷片尾 PTS 的唯一根因證明，也沒有加入固定音訊補償。

## 來源與執行式重現

2026-11-02 從遠端同步 main `7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca` 建立專用工作樹及 `codex/issue11-paint-budget`。未帶入未合併的 #206／#208／#212／#215 診斷文件鏈，沒有修改其他聊天的來源或輸出。

直接執行該 main 的 `paint` 原閉包，只把 `render`／`captureFrame` 換成計數器。原片段 SHA-256：`36c2fa9b548c6fbe02026810334dce00479e16b3a14d881672c538782a43f511`。原碼與最小候選的失敗日誌留在 ignored output；可公開重跑的行為回歸為 `tests/unit/paintBudget.test.ts`。

| 事件時間（ms） | 原碼擷取序列 | 修正後擷取序列 |
| --- | --- | --- |
| 0, 33, 33, 34 | 0, 33, 33, 34 | 0, 33 |
| 0, 32.5, 33, 33.4 | 0, 32.5, 33, 33.4 | 0, 32.5 |
| 0, 100, 100, 100.1 | 0, 100, 100, 100.1 | 0, 100 |
| 0, 33, 66, 100 | 0, 33, 66, 100 | 0, 33, 66, 100 |
| 0, 120, 120, 121 | 0, 120 | 0, 120 |

六項回歸直接從當前產品讀取並執行 `paint` 閉包，注入真正的純時間 helper；斷言實際 render／capture 次數、完整擷取序列及每次預算確實前進。包含同時 rAF／兩側 rVFC、原容差內外、浮點整格、1,801 個正常一分鐘拍點的三重回呼，以及長 gap 單次追趕。原缺陷閉包保留為執行式負例，不靠字串相等或 coverage 百分比驗收。原碼先跑六項全部失敗；最終六項通過／32 個斷言。

## 技術原理與取捨

原判斷 `now - lastCaptureAt >= 1000 / 30 - 1` 保留。原取餘數更新在提前進入 1ms 容差時可能回到同一 anchor；浮點整格與長 gap 也可能把 anchor 留在前一格。

只用 `Math.max(lastCaptureAt + frameMs, now - remainder)` 的候選可修前兩組，但實際測試在 100ms 整格及 10,000ms 長 gap 仍重複擷取，失敗沒有刪除或改標。因此 `advanceCaptureBudget` 先至少前進一格，再以**相同原容差**檢查最後的已到期格；若仍可擷取，就消耗該格。只更新 anchor，沒有第二次 render／capture，也沒有迴圈追趕。晚到 120ms 的 anchor 仍為 100ms，不把相位重置為 120ms。

helper 放在既有純時間 `web/timeline.js`，主閉包只更換預算更新；預覽與合成、左右並排與疊影及三種回呼仍共用原時鐘。不新增 scheduler、App module 或依賴。不改來源映射、30fps、1ms、100ms／250ms、片長、90秒、取消／停止／資料保全；不丟首末格、不改 PTS 或重採樣。原數值與品質標準仍以 [錄影比較](../RECORD_COMPARE.md) 為準。

## 驗證與未驗證

固定 Bun 1.4.4。正常完整 `bun run check` 通過：710 pass／0 fail／3,836 個斷言，型別／lint／build 通過，19 項既有 lint info 保留。正常 pre-commit 同樣通過，公開掃描 427 檔、51 份來源指紋；正常 pre-push 後立即推送 [產品提交 f8621e8](https://github.com/sunpochin/dance-stamp/commit/f8621e8987dedcb4ad9ac8809e5c39b77ace14b2)，[PR #219](https://github.com/sunpochin/dance-stamp/pull/219) 保持開啟。

同一乾淨產品提交的 12 項既有瀏覽器回歸全部通過：`existing-comparison`、`comparison-overlay`、`comparison-recovery`、`comparison-save-failure`、`export-failure`、`comparison-capture-fallback`、`vs-save-tail-stop-complete`、`vs-save-tail-native-reject`、`vs-save-tail-unknown-abort`、`vs-save-tail-unknown-complete`、`metadata-stop-export-prepare`、`export-ready`。沿原斷言及期限，未弱化取消、停止、舊成品／原片保留、故障與同頁重試。Bun 1.4.4／隔離 Chromium 156.0.8078.76，來源乾淨、未處理例外 0；自有瀏覽器／主機關閉並按 nonce 釋鎖。這是選定 12 案，不冒充完整 App 矩陣或原生 Safari。

## 一次正常原生 Safari 0.75×／60 秒（2026-11-02）

白話說：先把這版程式和兩支合成影片固定，真的按一次輸出、用 Safari 另存檔案。量完整檔案，再關掉產品與主機，到另一個只讀本機檔案的播放器從頭自然播到尾；不能用畫面顯示「完成」代替拿到真正成品。

受測程式固定乾淨 `f8621e8987dedcb4ad9ac8809e5c39b77ace14b2`／靜態 `7011a0893c5b4779`；下述文件提交不改產品或重跑媒體。macOS 27.2（26B123）、普通原生 Safari 27.2、Bun 1.4.4、FFmpeg 8.1.2。只操作自有一般視窗及專用 loopback origin，不接觸使用者日常產品或私人模式。該 origin 的初始媒體為空，**沒有重置或刪除任何庫，也不是原 39 份歷史媒體的重開驗收**。

沿原配方：示範 12–57 秒、0.75×，練習起點 4 秒，左右並排、無鏡像／人物跟隨。原合成示範 SHA `d4bf3ab496d9b148e0e58a5f9644a2d8c91a783e1fea72597f0d6e9252838efd`；原練習片 SHA `c786a691d299c8c3af89ceceab0e2c49a609f502526a7ce11b2a5b5e5e9f49a0`，逐 byte 複製後核對相同。原生選片、速度及數字欄位設定；原生滑桿 setValue／鍵盤未生效的操作保留，最後用既有 ＋50ms 按鈕 80 次設成精確 4 秒，才核對配方、保存基線並按唯一一次輸出。沒有匯出失敗後重跑挑成功。

來源／建置／helper／fixture 事前凍結。主機固定供應 bytes，13 份實際載入 JS（含 SW）指紋逐一相符，兩次收據的 controller 都是 null。只注入禁止硬體、100ms 被動時鐘／可見性與明確按鈕保存的旁聽；`requestFrame` 只存時間／計數並保留 track receiver。沒有額外畫面診斷碼、第二個解碼播放器、逐格 PNG 或錄影中的像素分析；原產品 canvas、解碼與錄製流程不變。QA 旁聽本身仍可能影響排程，這不是零觀察負載證明。

| 原下載的獨立量測 | 結果 |
| --- | --- |
| 真正 Safari Save As 原下載 | 4,040,290 bytes，完整 bytes 等於新增 ready VS 的 IDB Blob |
| SHA-256 | `d6b53e9c93d8b445cca99c0fdda2c650864e9e4b0a5d1e6be0ae3f296c3d31dd` |
| 完整全軌解碼 | exit 0、stderr 空；VP8／Opus、1280×720、1,801 格，PTS 嚴格遞增 |
| 獨立片長／平均 fps | 60.015 秒／30.01fps；原生讀回 60.016 秒另列，不代填或重取整 |
| 兩側起／中／末差、全片最大差 | 0／44.444／22.222ms；全片 44.444ms，新增漂移 22.222ms |
| 最長停格／來源對輸出時鐘最大差 | 112ms／112.222ms；起末來源覆蓋差至多 44.444ms |
| 45 組像素秒界線與音訊事件 | 按序數量相符，最大聲畫差 78ms，原 100ms 判斷通過 |
| 單一老師聲源 | 自然變調 495Hz，自己 880Hz 未混入；音訊完整解碼，不等於人工聽感 |
| 按輸出至完整 ready | 60,725ms；原 90 秒上界不變 |

雙片量尺 SHA `bfc00a8e9a0ab3a654d7903e68725cf8d17db643fa3420b6213e09eeea76a4e6`，像素／聲音量尺 SHA `5399df7f10f9f2c8876a64a9953523fbc66a3f89b22a2bd9284cb9851fcd09ba`，皆與原量尺逐 byte 相同。獨立量測在成檔後執行；不丟首末格、不調 PTS、不重採樣輸出或放寬門檻。舊正負控制保留既有來源歸屬，本輪沒有再製控制檔。

輕量旁聽共 1,801 次原生 requestFrame，時間相同的相鄰呼叫 0，間隔最小 14ms／最大 52ms／平均 33.3339ms。這只是呼叫節奏；即使與本檔解碼格數相同，也**不能按呼叫序號推定擷取像素或編碼延遲**。578 個工作中樣本都在前景／有焦點，兩個來源元素都不在 viewport；保留正常點輸出後捲至輸出區的條件，不宣稱整分鐘來源可見。產品診斷 drift 30ms 與 render gap 36ms 另存，不代替上表的下載檔量測。

保存後再閒置讀回，整份 library（含 revision）與完整媒體描述精確相同；所有原資料列保留、只有一份新 ready VS。硬體呼叫、未知儲存、讀回及頁面未處理錯誤均 0。只關閉本輪產品視窗，主機程序退出、原埠拒連後，開新的獨立 file 播放頁，按一次原生 Play，之後沒有 seek、暫停或恢復操作，自然 `ended`：currentTime＝duration＝60.016、1,801 格、error 0、dropped 0、corrupted 0。`audioDecodedBytes` 的原型別為 `undefined`／值不提供，保留不補零；音軌另獨立解碼，不能代聽感。播放頁禁止網路，但 `navigator.onLine=true`，不當 OS 斷網／PWA 離線驗收。

播放後原下載 SHA 不變；原埠仍拒連。兩個自有視窗關閉、原 Safari 視窗保留；自有主機與播放鎖程序皆退出，nonce 相符才釋鎖。Safari 的 WebContent pool 仍有程序保留，未強殺共享 Safari，也不宣稱所有瀏覽器程序歸零。完整來源、原失敗、量尺、原下載、原型別指標與 12 案回歸共 **352 檔／103,966,309 bytes** 獨立封存，逐檔重讀相符，manifest SHA `918809f81abd7d95c986e5640d0df5b435cd0931a0630ca20c15f141d4a42434`。raw／媒體／本機識別留在 ignored output，不公開附件。

可重跑的程式缺陷入口為 `bun --no-env-file test tests/unit/paintBudget.test.ts`。既有瀏覽器入口為 `tests/app-coverage/prepare-fixtures.ts` 後以 `tests/app-coverage/run-app.ts` 明列上面 12 個名稱；原生操作與素材指紋、條件、原量尺和所有本機 helper 已凍結，不以更新文件移記媒體版本。

原 130ms、加註診斷及末端 PTS 各自保留來源歸屬。本輪不同 Safari／來源提交、操作次序及資料集，**不是能證明品質改善因果的同條件 A/B**。本 fix 保證接受的繪圖預算會消耗；單次正常合成通過不代表原 130ms 唯一根因已定位、原失敗已修好或完整 P0 通過。完整 G1–G7、20 組／十輪、真實相機／麥克風、實體裝置保存、人工聽感與指定 Claude Code／使用者審查仍未完成，iPhone 延後。沒有合併 main、正式發布或關閉 #11。
