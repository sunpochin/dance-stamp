<!-- 檔案用途：依既有驗收條件核對可結案與尚未實作的 issue，避免重做已交付功能。所在層：版本固定的工程盤點。主要關聯：ROADMAP.md、AGENTS.md、GitHub issue #1。 -->
# 2026-10-29 實作與關票盤點

盤點基線為遠端 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e`，靜態版本 `adbe8eb1d6acfd09`；GitHub 當時共有 14 張開啟 issue。這是當日快照，後續狀態以各票為準。

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
