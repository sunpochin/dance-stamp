<!-- 檔案用途：依既有驗收條件核對可結案與尚未實作的 issue，避免重做已交付功能。所在層：版本固定的工程盤點。主要關聯：ROADMAP.md、AGENTS.md、GitHub issue #1。 -->
# 開啟 issues 的工程與驗收盤點

## 2026-10-30：67bd630 基線與後續變動

依使用者指定，以 main `67bd6308854bf8b560ad61bfcbe73babca5db0af`／靜態 `7c728c8a5bd7fa2f` 對照開啟 issue 的原始範圍、現行程式、測試及來源證據。該提交已透過 [PR #88](https://github.com/sunpochin/dance-stamp/pull/88) 整合 #84–#87；[main CI](https://github.com/sunpochin/dance-stamp/actions/runs/41006187933) 的 harness、linux-install-restart 均成功。歷史段落的「尚未合併／尚無證據」不能直接當作今日工程缺口。

盤點期間另有 [PR #90](https://github.com/sunpochin/dance-stamp/pull/90) 合併，遠端 main 前進到 `f3333a0be8546b9626605d55f19c8ecf6005dc49`；其第一父提交正是 67bd630。下表保留指定基線，選片／主機設定的後續差異另列，不把 #90 的結果移記為 67bd630 已驗。本輪文件分支同步至 f3333a0，未修改產品程式或測試。

最後查詢共有 **19 張開啟 issue**：#1、#3、#8–#19、#89、#91、#93–#95；開啟 PR 為 #92。這是版本及查詢時點固定的盤點，不代表後續狀態。

### 指定基線已覆蓋的 Web 工程

「已有工程覆蓋」只表示下列程式與證據已存在；不代表整張票完成、真人／裝置通過，或本輪重新執行了原矩陣。

| Issue | 已有覆蓋與可追查來源 | 本輪判定 |
| --- | --- | --- |
| [#1](https://github.com/sunpochin/dance-stamp/issues/1) | 下列 Web 主流程及四線整合均在基線 | 總覽票，依各子票驗收，不重建功能 |
| [#3](https://github.com/sunpochin/dance-stamp/issues/3) | [Safari 有界音訊](issue-3-bounded-audio.md)、[Chrome／Safari 分版結果](p0-safari-reliability-integration.md) | 一般 Safari 歷史十九案不能替代新版本／私人模式，續驗限制另列 |
| [#8](https://github.com/sunpochin/dance-stamp/issues/8) | [六速、鏡像、循環與真正桌面背景](issue-8-practice-loop.md) | 軟體清單已有覆蓋，仍待指定 Claude Code／使用者最終審查 |
| [#9](https://github.com/sunpochin/dance-stamp/issues/9) | [chunks 寫入中程序中斷及恢復影格守門](issue-9-capture-recovery.md#錄影-chunks-未提交時的真正程序中斷)；#87 已拒絕只有檔頭卻可回報 loadeddata 的片段，含取消、缺能力、play 拒絕及同輸入重試 | 不再補同目的恢復／影格測試 |
| [#10](https://github.com/sunpochin/dance-stamp/issues/10) | [既有雙片正式入口、時間映射、鏡像、重連與失敗保留](existing-comparison.md)；錄影入口另見 [#9 接線](issue-9-comparison-integration.md) | 不重做雙播放器、時間線或普通往返 |
| [#11](https://github.com/sunpochin/dance-stamp/issues/11) | [成檔後保存尾段四案](issue-11-vs-save-tail.md)：Stop 真正提交、原生 ConstraintError 拒絕及明示缺通知的 abort／complete；下載完整 bytes、解碼、離站播放分列 | 不把保存尾段與準備交易取消混為未實作；完整媒體結果維持原來源 |
| [#12](https://github.com/sunpochin/dance-stamp/issues/12) | [完整備份／衝突恢復](issue-12-backup-recovery.md)、[恰好容量上限 UI](issue-12-native-capacity-ui.md)、[#84 大型匯入規劃中 Stop](issue-12-import-planning-stop.md) | 外來源、分享、衝突 hash／ID 規劃、零寫入取消及同檔重試已有證據 |
| [#13](https://github.com/sunpochin/dance-stamp/issues/13) | [實際低空間](issue-13-native-quota.md#2026-10-30小型檔案系統的實際低空間)、[更新／pending-write 程序中斷](issue-13-forced-install.md)、上述 chunks、[未確認保存](issue-13-unconfirmed-storage.md) | 舊表的低空間、寫入中程序中斷已獲後續覆蓋；提交瞬間／斷電仍未驗 |
| [#14](https://github.com/sunpochin/dance-stamp/issues/14) | [Web 可及性](issue-14-web-accessibility.md)、[#85 未確認保存的原生交易、AX、Tab／Enter 與下載保全](issue-14-storage-keyboard.md) | 不重跑普通窄版／modal 來代替真人或讀屏實聽 |
| [#15](https://github.com/sunpochin/dance-stamp/issues/15) | [獨立本機包、來源／路徑／授權保護](issue-15-web-package.md)、[四線包依賴](p0-safari-reliability-integration.md#2026-10-30-四線整合候選) | 工程準備已有；發布及實際主機驗收保留，後續 #91 不算完成 |
| [#16](https://github.com/sunpochin/dance-stamp/issues/16) | 條件式 iOS 備援，尚未啟動 | iPhone 繼續暫緩；不能由桌面或私人模式失敗推定觸發 |
| [#17](https://github.com/sunpochin/dance-stamp/issues/17) | [分類、跨影片動作、歷史、草稿保護、離線與還原](issue-17-moves.md) | 已有實作與有界回歸，不新增同目的功能 |
| [#18](https://github.com/sunpochin/dance-stamp/issues/18) | [分享白名單、ID 重建、人工重連](issue-18-sharing.md)及 #84 的分享規劃取消 | 外部傳送／接收不由匯出成功證明，不新增 OAuth、雲端影片或同步 |
| [#19](https://github.com/sunpochin/dance-stamp/issues/19) | [手動 BPM／第一拍、八拍、秒數後備、三速音訊 samples 與備份](issue-19-manual-beats.md) | 原票未勾項已有對應程式與證據，仍需人工校拍與實聽 |

### 可推進的 Web 工作與既有承接

本輪沒有確認一個可重現、尚未覆蓋且尚無工作線承接的新產品缺陷；不據此宣稱沒有其他 bug。現有工程問題保持原票與既有承接，避免同時改寫選片介面或建立同目的 PR。

| Issue | 實際缺口／狀態 | 接續方式 |
| --- | --- | --- |
| [#89](https://github.com/sunpochin/dance-stamp/issues/89) | 67bd630 的 JSON 匯入容易誤當選片；#90 已增加影片入口及 MOV／MP4 提示，於 f3333a0 整合 | 查 [選片證據](issue-89-video-picker.md)，不重做已合併修正；原生 OS 選檔視窗及使用者實片 codec 仍未驗 |
| [#91](https://github.com/sunpochin/dance-stamp/issues/91) | #90 已加入明確建置產物設定，但其 PR 記錄仍列外部 Workers Builds 失敗、讀 Builds API 403；手動預覽不等於自動建置成功 | 沿原票取得確切建置日誌／可用讀取權限後再診斷；本輪不登入、部署或發布，未重新確認外部建置已恢復 |
| [#93](https://github.com/sunpochin/dance-stamp/issues/93) | 固定預設 4174 已有 [PR #92](https://github.com/sunpochin/dance-stamp/pull/92)，head `7c2c3262fa682845d22260c4720cd5307797d86e`，尚未合併 | 沿既有 PR 審查，避免重做埠號與啟動文件 |
| [#94](https://github.com/sunpochin/dance-stamp/issues/94) | 本機監看、自動重建及有草稿／影片時保留畫面尚待交付；已有獨立工作線 | 此範圍不在 #90 已合併差異中，不能寫成已完成；不重建第二套開發更新機制 |
| [#95](https://github.com/sunpochin/dance-stamp/issues/95) | 盤點期間新開的左右選片與練習／錄影／管理分區問題；已有獨立工作線 | 可用合成影片、無相機、鍵盤及取消／壞檔保留驗證；保留原工作線，不與它同時修改 UI |

原生 Safari 的一般／私人模式保存 Stop、新 VS 保存失敗／未確認救援仍是**瀏覽器軟體驗證缺口**，不全歸類為真人／裝置問題。[先前前置失敗](issue-3-current-protection-audit.md#原生-safari-的操作前置失敗)記錄遠端自動化未開啟，當時沒有建立 Safari 產品 session；本輪沒有重新探測或改設定。後續須在可用且獲授權的原生入口續驗，才能判斷是否需要新工程修正；Chrome 明示缺通知不能填補這格。

### 真人／實體裝置缺口，與工程分開保留

| 類別 | 未完成條件與對應票 |
| --- | --- |
| 真人可用性 | #1／#14：五人中同四人各自無提示完成標記重播、錄影到 VS、既有雙片到 VS；#17–#19 的分類、分享理解、校拍與聽感 |
| 無障礙與觸控 | #14：VoiceOver 實聽、實體觸控、橫直向／安全區與放大文字；AX 或 viewport 回歸不能替代 |
| 真實影音與硬體 | #3／#9–#11：真相機、光學同步、停止後 LED、鎖屏／來電、喇叭／藍牙實聽、硬體 G1／G6、熱／電池／記憶體壓力與完整支援範圍 |
| 實體資料與接收者 | #12／#13／#18：實體飛航、跨實體裝置備份還原／重連、一般檔案及 Drive／Dropbox／iCloud Drive／AirDrop 的實際收發、接收者播放；同機新 profile 不算跨裝置 |
| 暫緩與發布條件 | iPhone／主畫面及 #16 繼續暫緩；#8 等票的指定最終審查、#15 新使用者取得與完成 P0、發布來源／供應商限制及使用者核准各自保留 |

### 本輪驗證與停止條件

讀碼追查 `presentedFrame` 的所有呼叫端後，曾提出「取消後遲到且未滿足暖機條件的通知可能重掛 callback」。直接人工呼叫已取消的 callback 會出現該現象，但不能證明原生瀏覽器會如此送達。另在**未修改的 67bd630**、隔離 Chrome 156、16×16 Canvas 合成串流，以較早註冊的原生影格通知取消同批等待；實際結果 AbortError、只註冊一次、predicate 執行 0 次、待執行 callback 0。未重現產品缺陷，因此沒有修改 helper 或新增該人工情境的回歸。

此探查只涵蓋 Chrome 的指定順序，沒有 Safari／整體媒體矩陣結論。先前 stale dist 與來源不一致被前置檢查拒絕，當時尚未拿鎖或啟動瀏覽器；沿原建置入口重建後才執行探查。自有 Chrome 的已知 PID／群組、server 與同 nonce 共用鎖均已核對收尾；raw、工具與 profile 留 ignored output。文件變更沿原 `bun run check`／提交 hook 驗證，不新增測試或重跑同 bytes 已有的完整原生矩陣。

本輪交付逐票盤點；沒有新的產品修補、合併、部署、發布、改 issue 勾選或關閉未驗收票。若後續新票／可重現錯誤出現，再接續其原票的最小修正；不以保持忙碌為由重做已覆蓋項目。

## 以下為先前盤點的歷史紀錄

## 2026-10-29 實作與關票盤點

盤點基線為遠端 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e`，靜態版本 `adbe8eb1d6acfd09`；GitHub 當時共有 14 張開啟 issue。這是當日快照，後續狀態以各票為準。

## 2026-10-30 續查

遠端 main 已由另一輪審查整合 PR #64–#72，來源為 `c0ab39bcf68354cc29d7048a0d81e56d626efcf1`／靜態 `422c70c3633b8e88`；下表及後面的四張開啟 PR 為 10 月 29 日快照，不再代表目前待整合清單。最新錄影／取消與 Safari 證據依 [P0 整合紀錄](p0-safari-reliability-integration.md) 保留來源；沒有把歷史成功改記為本次重新驗收。

本聊天另核對全部 14 張開啟票：#8 仍待既定 Claude Code／使用者最終審查，#16 仍未滿足啟動條件；其餘已具備實作，剩餘為原票的實體媒體／支援範圍、真人、跨裝置或發布驗收。#13 的低空間缺口另由 [PR #73](https://github.com/sunpochin/dance-stamp/pull/73) 補上有界真實檔案系統測試，具體來源與結果見[低空間證據](issue-13-native-quota.md#2026-10-30小型檔案系統的實際低空間)；仍不代替產品 UI、Safari、飛航模式及其他裝置驗收。此次不關閉尚缺驗收的票，也不重建已實作功能或啟動 iOS。

## 結案判定

依各 issue 原有範圍與 `AGENTS.md` 的獨立審查要求，不能只因 PR 合併或自動檢查通過就關票。#8 的桌面軟體清單已勾完，尚待 Claude Code／使用者最終審查；已請使用者針對既有 PR #42 確認。其餘未滿足條件列於下表，不把桌面合成測試改記成真人或實體裝置驗收。

| Issue | 已有實作／交付 | 關票前剩餘條件 |
| --- | --- | --- |
| [#1](https://github.com/sunpochin/dance-stamp/issues/1) | 常規 Web 與 P1 工程已整合 | 核心子票、至少 4／5 人獨立完成三項任務、支援與發布驗收 |
| [#3](https://github.com/sunpochin/dance-stamp/issues/3) | Web 媒體試驗、有界 Safari 音訊及原生失敗證據 | Safari 啟播／長片／半速覆蓋、原矩陣與實體媒體 gates |
| [#8](https://github.com/sunpochin/dance-stamp/issues/8) | 六種速度、獨立鏡像、循環與真正桌面背景證據，PR #31／#42 已合併 | 票內明列的 Claude Code／使用者最終審查 |
| [#9](https://github.com/sunpochin/dance-stamp/issues/9) | 倒數、合成相機錄影、落盤／恢復、背景與停止鎖修正 | 實體相機、指示燈、G1／G6、獨立審查 |
| [#10](https://github.com/sunpochin/dance-stamp/issues/10) | 正式既有雙片與錄影入口、共同時間線、校正與重連 | 兩條入口的完整真機／光學同步與錄影驗收 |
| [#11](https://github.com/sunpochin/dance-stamp/issues/11) | 單檔帶音訊 VS、Chrome 完整合成矩陣、失敗保留 | Safari 品質、手機保存／接收、實體相機與熱／電池／記憶體壓力等原 gates |
| [#12](https://github.com/sunpochin/dance-stamp/issues/12) | 完整 v1／v2 備份、預覽、衝突副本、媒體清單與重連，PR #56 已整合 | 跨實體裝置／支援範圍驗收與獨立審查 |
| [#13](https://github.com/sunpochin/dance-stamp/issues/13) | 離線副本、容量／更新保護、原生 quota、部分安裝強制終止證據 | 真實低空間、寫入交易中程序中斷、實體離線／支援範圍與獨立審查 |
| [#14](https://github.com/sunpochin/dance-stamp/issues/14) | 鍵盤、窄版、可及名稱、匿名五人操作單 | 真人 4／5、讀屏實聽、實體裝置與完整 P0 缺陷驗收 |
| [#15](https://github.com/sunpochin/dance-stamp/issues/15) | 免費主機／來源邊界規劃、獨立本機包、逐檔校驗與路徑防護 | 實際發布來源／標頭驗證、新使用者完成 P0、支援證據、發布前限制查核及使用者發布核准 |
| [#16](https://github.com/sunpochin/dance-stamp/issues/16) | 尚未實作，條件式 iOS 備援 | 須先有手機 Web 的可重現阻礙與限時修正結果；目前 iPhone 暫緩，不能由桌面 Safari 失敗推定觸發 |
| [#17](https://github.com/sunpochin/dance-stamp/issues/17) | 分類搜尋、跨課程動作、手動狀態／歷史、v2 與草稿保護，PR #54 已整合 | 既定獨立審查、真人可用性／讀屏及跨裝置支援驗收 |
| [#18](https://github.com/sunpochin/dance-stamp/issues/18) | 分享欄位白名單、預覽、匯入重建關聯與人工重連，PR #54 已整合 | 另一實體裝置、一般檔案與各外部傳送途徑的真實收發及獨立審查 |
| [#19](https://github.com/sunpochin/dance-stamp/issues/19) | 手動 BPM／第一拍、八拍、拍數／秒倒數、音訊 samples 與備份，PR #54 已整合 | 既定獨立審查、真人校拍／實聽及實體支援驗收 |

#8 的 `tests/browser/practice.js` 與 `tests/browser/practice-background.js` 相對 QA head `65d3b40751860f2a7e6d3a5628641a82a675a2a6` 無差異。產品 `main.js` 後續已整合其他功能，原背景證據仍屬該受測版本，不能僅由測試來源相同便宣稱本輪重新通過。

## 尚未實作與既有後續候選

唯一整項尚未實作的是條件未觸發的 #16；沒有另外一張可直接啟動且未有實作的 Web 功能票。沿用既有問題與 PR，不重建同目的票、不加入 P2 或自動啟動原生平台。

- [PR #64](https://github.com/sunpochin/dance-stamp/pull/64)，`f88c28d88b6b13c2aad39b9b8541bcd42866d6b2`：Safari 暖機與回起點時等待真正目標影格；單元已交付，原生品質與本候選完整媒體回歸待驗證。它已是 #3／#11 的實作，不能再開相同修正或宣稱已修好 Safari。
- [PR #65](https://github.com/sunpochin/dance-stamp/pull/65)，`f72cb2ff2b500530692c81fadfb8d86ce83aeb36`：原生 quota 獨立重跑收據，非新的資料儲存功能。
- [PR #66](https://github.com/sunpochin/dance-stamp/pull/66)，`b423027ef29d75e3eabb819aafc6cfddda7b0095`：QA 自有程序退出後才釋放鎖，不是產品媒體缺口修正。
- [PR #67](https://github.com/sunpochin/dance-stamp/pull/67)，`98fb5517c0027c4fa9a1b147e75c05ac1bdf7660`：新版原生 Safari 的失敗證據，非新的功能實作。

以上四張在盤點時均開啟；本輪沒有合併或發布。各票舊段落的「規劃／尚未實作／未合併」保留為歷史紀錄，不能蓋過目前已整合的實作。

## 本輪驗證

在本聊天獨立 clone，以 Bun 1.4.4 對上述乾淨 main 執行原 `bun run check`：382 tests／1309 expects／0 fail；來源與公開內容掃描、型別、lint 及 build 通過。第一次受限執行環境無法綁定本機測試埠，僅該 HTTP 案例失敗；允許本機臨時服務後原入口全部通過，沒有修改測試或門檻。

同一產品來源／靜態版另用 macOS 27.0.1、隔離 headless Chrome 156，原四份瀏覽器函式通過，未修改產品程式或測試斷言；瀏覽器執行時工作樹只有本輪文件修改：

- `moves.js`：兩堂課／兩個標記／兩個 take，搜尋、手動狀態、跨影片跳轉、歷史配方、實際離線 reload、全新 context 備份還原、缺片重連及解除關聯／刪動作保留四份原片。390 CSS px 無水平溢出、pageerror=0、外部來源請求=0。
- `moves-storage.js`：v1 只讀不升版、排隊寫入 quota 原子回滾、重試成功升版、真正另一分頁衝突保留草稿、取消與未知版本保留原件。
- `beats.js`：手動保存／取消／非法輸入／移除、三速度來源拍號、A–B／seek、quota／交易取消與真實另一分頁衝突、重開與乾淨 context 備份還原／重連通過。原生 OfflineAudioContext 的 4／8 拍 × 0.5／0.75／1× 六組 samples 皆通過原時間與音頻斷言；這不是真人聽感。
- `move-draft.js`：既有／新增草稿、明確保存取消、quota 與真實分頁衝突保護通過；另真正導航至空白頁、拒絕原生離頁提示後，原函式確認 trusted=true、prevented=true，表單值保留。

保留兩項測試前置失敗：拍點首輪誤用 65 秒素材，使原本 20 秒片尾的非法起點成為合法值；換回既有 20 秒合成片並在全新環境重跑通過。草稿首輪缺少合成環境標記，被原安全前提拒絕；禁用 mediaDevices、設定本輪合成環境標記後才重跑，沒有弱化安全檢查。兩者均不列為產品缺陷或成功案例。

只用合成素材及全新隔離 Chrome，不操作私人媒體、實體相機／麥克風、雲端帳戶或裝置設定。未重跑 Safari、真正桌面背景、拍點錄影、完整媒體矩陣或跨實體裝置；沒有新增支援承諾。
