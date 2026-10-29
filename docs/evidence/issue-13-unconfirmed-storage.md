<!-- 檔案用途：記錄 #13 缺失交易結束事件的修正候選與驗收界線。所在層：匿名工程證據。主要關聯：web/storage.js、main.js、storageCompletion.test.ts、TECHNICAL.md。 -->
# #13：保存錯誤後沒有交易結束通知

2026-10-29，工程候選，尚未完成修正後原生 Safari 驗收。這是產品修正的後續 PR，不修改 #65 的歷史 quota 數據。

## 已知原生缺陷

使用者提供的只讀 Safari 私人模式取樣，來源 head `98fb5517c0027c4fa9a1b147e75c05ac1bdf7660`、原 `storage.js` SHA256 `2de40d537d2ab049596acaaf549e9e9d324e7b8ce705b0edfe86af1396dbbd77`：真正 Blob put 發出 UnknownError 後，沒有 abort／complete；3 秒要求取消，9 秒時產品 writeLibrary 仍 pending。另一次在真 error 後 12ms 呼叫原生 tx.abort() 雖返回，仍缺結束事件且 9 秒 pending。沒有替換 put 或偽造事件。

同一原分頁重新導航後兩次只讀（間隔 1 秒），原 revision 1、非空筆記／原生 metadata／keys 完整相同。這只能支持重開後保留；不能證明先前交易當下已回滾。另一私人分頁回空庫，無法確立相同 storage partition，排除於資料遺失／恢復判定。File 模式該輪未測。這些是本次修正的失敗來源，並非本 PR 已重跑原生驗收。

## 最小修正與誠實狀態

`writeLibrary`、`saveChunk`、`clearChunks` 共用原生 complete／abort 觀察。只有真 error 或明確要求 abort 後，才開始 1 秒等待結束通知的寬限；正常保存不因大小或耗時被這個寬限中止。缺收據就回報 `StorageUnconfirmedError`，保守維持本頁不可再使用此 DB，所有本頁待處理儲存 Promise 退出等待，盡力 abort／close 連線。close、計時經過與 Promise 拒絕都不代表回滾證明。

只有 complete 才回傳新 revision。真正 quota／其他 abort、正常取消保留既有回覆；一旦狀態未確認，即使取消或遲到 complete 也不改稱已停止成功／已保存。重新導航前不自動重試、清庫或建立替代連線。讀取也暫停，避免同一未知交易後排隊的讀取再次鎖住救援。

介面退出忙碌並顯示「保存狀態未確認」，暫停新保存／換片；當次原片與已成檔 VS 下載連結仍可用。救援筆記備份只從本頁最後確認的資料匯出，不含未保存表單草稿或任何影片；保持本分頁、另存完成後，由使用者明確確認重開同一頁讀回。BFCache 返回仍保持限制，不把新私人分頁空庫當資料消失。後續遲到的交易無法更新本頁已拒絕的保存結果。

## 回歸與限制

`tests/unit/storageCompletion.test.ts` 使用可控制的合成交易事件，執行真正 storage.js 來源；每例隔離模組狀態。修正前已重現 error→取消→無 abort／complete 的 pending，修正後驗證：

- error 後取消、單獨取消、沒有取消三種缺收據序列皆回未確認；後續寫入／chunks 清理被阻擋，不重新 open。
- 同頁其他排隊保存及讀取也退出等待；正常 complete、QuotaExceededError abort、正常取消仍保留原結果，可在確定中止後重試，且清除監聽／期限。
- 刻意讓假後端在未確認後遲到提交，前端結果與封鎖狀態仍不變。此例明確不宣稱後端已回滾。
- 執行 main.js 真正的 operation／saveData／persistExport／updateControls／備份控制器：退出 aria-busy、保留原片／VS URL 與 Blob、舊 state／revision 不提前增加、救援備份不碰 DB，新操作不再執行。
- PR #70 的 `782790a` 獨立審查重現：操作入口通過後，等待中的比較保存才轉為未確認，已排隊的「準備下一段」仍清掉自拍。新增回歸直接觸發真正 new-take handler，修正前得到 takeBlob=null；修正後分別覆蓋等待 ready／comparisonSave 期間失敗，確認不詢問清片、不變更影片來源、不撤銷 URL，自拍 Blob／ID／長度完整保留，並結束忙碌及記錄未確認狀態。執行動作前的第二次檢查共用既有錯誤收尾。

這些是單元與無瀏覽器的控制器回歸，不代表真正 DOM、觸控／鍵盤／讀屏、原生 Safari 私密或一般模式已通過。沒有啟動瀏覽器、相機、麥克風或畫面擷取，未取得共用媒體鎖，未上傳任何媒體。精確 head／完整 check／CI 由交付 PR 綁定。

`782790a` 的原生取樣只屬該提交；加入佇列修正後的新 head 必須另行核對，不能承接舊 head 的原生通過結論。

仍待主聊天以受測候選做 Safari 私密與一般對照：原生 error→產品有界退出、未知狀態提示、當次原片／VS 真正下載、禁止再次寫入、同頁導航後原生 metadata／keys／Blob 讀回，以及正常保存／原生 abort／取消。不能以 Chrome quota 歷史輪或計時結果代替這些證據。其他永久 pending 且沒有 error／取消訊號的來源仍不屬此修正已驗證範圍。iPhone 暫緩，#13／#1 保持開啟，待獨立審查，不合併或發布。
