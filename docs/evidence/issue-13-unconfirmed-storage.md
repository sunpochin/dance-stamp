<!-- 檔案用途：記錄 #13 缺失交易結束事件的修正候選與驗收界線。所在層：匿名工程證據。主要關聯：web/storage.js、main.js、storageCompletion.test.ts、TECHNICAL.md。 -->
# #13：保存錯誤後沒有交易結束通知

2026-10-29，工程候選，已補受測 `99e862d` 的原生 Safari 私人／一般儲存對照；未完成全部 #13／P0 驗收。這是產品修正的後續 PR，不修改 #65 的歷史 quota 數據。

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

這些是單元與無瀏覽器的控制器回歸，不代表真正 DOM、觸控／鍵盤／讀屏或原生儲存已通過。工程回歸輪沒有啟動瀏覽器、相機、麥克風或畫面擷取，未取得共用媒體鎖，未上傳任何媒體。精確 head／完整 check／CI 由交付 PR 綁定；後續主聊天的原生證據另列如下。

`782790a` 的原生取樣只屬該提交；加入佇列修正後的新 head 必須另行核對，不能承接舊 head 的原生通過結論。

## `99e862d` 的原生 Safari 儲存對照

主聊天在 Safari 27.0.1／macOS 27.0.1，以新私人視窗與另一個一般模式 origin 操作真正產品介面；受測 head `99e862dfa036197425302d879baab2a140dd65c3`、靜態版本 `ba8397999a6d08f4`，兩邊 controller=none。不是裸 IDB probe，也未替換 put 結果、注入 error／abort 或以清庫重試。

本聊天只讀核對主聊天的收據、manifest 與原始觀測：manifest 的 14 份來源雜湊均等於受測候選建置；QA 主機的 index.html 只額外載入 qa.js，其餘 13 份原樣提供。觀測器旁聽原生交易生命週期、原始 metadata put payload 與原生 object URL；呼叫原方法、不改參數或事件預設行為。原片只用合成 MP4；診斷與影片留本機，不加入產品或公開附件。

- main.js SHA256：`c82bbc7f5ad336a624b5955eca1780e1e8929f3918a2c0b58543e47b2d32a758`。
- storage.js SHA256：`d470fecd1c030878ae2e1750f68d3ad130e84d8393bdfaafb99dbd68a98b2e8a`。
- 私有 QA 觀測器 SHA256：`4df2d8dede7d3638194cdf1ddb2b3ebd3f9515e22fb5da3cb2b8b3b6727f0d09`；核對收據 SHA256：`97b857566c6494341be1885afaba085420c55cd4b312e96eb7ed3e5a56b9fd7f`。

| 原生流程 | 結果與證據界線 |
| --- | --- |
| 私人模式保存示範副本 | 先有非空影片標題、revision 2、media keys=[]。真正 Blob put 發出 UnknownError（Error preparing Blob/File data to be stored in object store），同筆交易未見 abort／complete；error 後 1006ms 顯示未確認，controls／compare 的 aria-busy=false，寫入／換片控制停用、救援可見。後續產品讀取回 StorageUnconfirmedError，沒有建立新交易。這不表示已證明當時回滾。 |
| 私人模式救援與同頁重開 | 原片 object URL 前後相同，QA 別名與真正產品下載的原片 bytes 均匹配合成檔。產品救援另存最後確認的筆記，保留備份白名單內容；不帶本機 asset.state／storageKind 或影片。點產品重開並確認，再通過 Safari 離頁提示，在原分頁重開；兩次原生 metadata JSON 精確等於原快照及最後真正 complete 的 payload，revision 2／keys=[]，兩次讀取一致。只支持原分頁重開後保留。 |
| 一般模式正常保存與重開 | 另一個新 origin 以相同合成檔真正保存，收到 native complete，revision 到 3。原生讀回 MP4 1,789,027 bytes，SHA256 `3fb42ffb14678b8c944d605cab684a1919801de7908c1f540f7fbfc29ea26548`；重載後兩次完整狀態、原生 keys 與 Blob SHA 均與重載前相同，未確認旗標為 false。 |

這一輪沒有產生 VS，不能宣稱新 VS 保留已經原生通過；當輪未驗原生在途取消／abort，後續單獨儲存 API 輪見下節。其他分頁／程序、私人 partition 關窗後持續性、真實相機／麥克風、真人素材或聽感仍未驗。舊 `782790a` 的 QA artifact 失敗與過早 export 拒絕另存為失敗來源，不移記為本輪通過。Chrome quota 的歷史輪不代替這份 Safari 對照。

## 同版原生在途取消：僅儲存 API／交易

主聊天另以真正一般模式 Safari 27.0.1、新 origin、controller=none 點按私有 QA 的單輪按鈕（isTrusted=true）。來源文件 head `81bd2c9c512082968ff83a0aeab03412e89c5898`，產品 storage.js／library.js／recorder.js／timeline.js／beats.js 與受測 runtime `99e862d` 的五份來源逐 byte 相同；沒有載入 main.js 或操作產品 Stop。QA SHA256 `9cacc134980a3ccd805804c62645fb7945a0537600c9d582a668a0351ead3257`，原始 JSON 收據 SHA256 `2d35b8ae761e4a35e16936a1b921e32549806d543fef7f7d37d4b4feb3ce48e0`；本聊天只讀核對 manifest、原生事件與完整快照，不重啟測試。

1. 空 origin 正常寫入非空合成標題／標記正文與不可播放的 application/octet-stream sentinel，收到真正 trusted complete，revision 1。先只讀記錄原生 metadata JSON、產品完整資料、media keys、全部 bytes 與 SHA。
2. 同一產品 writeLibrary 交易更新 metadata 並替換 media；原生 media.put 已成功回傳真正 pending IDBRequest 後，包裝器在同一呼叫堆疊只發一次 AbortController.abort()。參數、回傳與 error 預設動作保持原生，產品自己的取消 handler 呼叫 tx.abort()，未偽造事件或配額。
3. 該交易收到 isTrusted=true、target=transaction 的真正 abort，沒有 complete（tx.error=null）；產品以取消 signal 的 AbortError 在 1ms settle，storageUnconfirmed=false。後續只讀快照與基準完整相同：metadata／revision 1／keys、非空筆記及 sentinel 每個 byte／SHA 全部保留。
4. 只有確認真正 abort 與完整保留後才正常重試同一候選；收到 trusted complete、revision 2，新 metadata、原生 keys、完整替換 bytes／SHA 均匹配。12 項驗收條件全部為 true，未因取消將本頁誤封為未確認。

基準 sentinel 71 bytes／SHA256 `7ab1e33dbb7966a923d5aa2841dc317143f88cd59c34ff0615e17fc6b71209db`；正常重試後替換 sentinel 72 bytes／SHA256 `d5d7ccf42196153ae5c6cfa2b654391c36f20d1394363510e3a62eda3fe8ddb4`。兩者都不是可播放媒體。本輪只證明該一般模式的取消 API／原生交易及後續重試，不代表產品 Stop 按鈕、VS／播放、真低磁碟、跨分頁或私人模式取消驗收；不擴大先前的媒體證據。

本次後續只補匿名文件，產品 runtime 與 `99e862d` 相同，沒有重新啟動瀏覽器或取得媒體鎖。仍需獨立審查及剩餘原生／主 P0 gates；無 error／取消訊號的任意永久 pending 亦不屬已驗證範圍。iPhone 暫緩，#13／#1 保持開啟，不合併、部署或發布。
