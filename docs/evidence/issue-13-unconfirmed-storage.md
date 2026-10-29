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


## 明確metadata UI保存的真正Stop續修

ba89487／靜態1aa1ae164c31d690已由正常Chrome原生重現save-title取消缺口：metadata put真正成功、交易尚未提交時實際點Stop，255.5ms觀察沒有abort／complete且busy仍true；解除QA自有get hold後才trusted complete、revision11→12，UI稱標題與分類已保存，reload仍為新標題。舊媒體完整bytes與URL保留，所以是取消接線失效，不是媒體遺失，也不能把diagnosticCompleted或negative-confirmed當產品通過。原始負向收據SHA256 `cb50553a0e515f0d77f0f5f0dafd6e792045185c890de3d23fdc958ea8a541c0`保留。

原offline-storage.js已用程式DOM.click涵蓋copy-reference取消；本輪另有ba相同版本的真正按鈕控制，兩trusted put未提交時實點Stop取得原生abort15.5ms／無complete、舊非空筆記／兩片／VS完整bytes與六份實際下載保留，同File重試revision11→12及reload相同。正向收據SHA256 `edf16dbac964eaae9be7eb59c1dbc25d19dea07f8b5a91b823ebb8fa32ec6b8e`只屬ba的copy-reference，不宣稱原先所有產品入口都沒有取消覆蓋，也不代替metadata、私人或VS保存階段Stop。

本次修正只由明確可取消入口傳本輪signal：標題／分類、標記保存／刪除、動作保存、兩側選片beforeCommit、缺示範asset的確認連結，以及預覽／匯出準備的saveCurrentRecipe。saveData不預設active；changeComparison獨立佇列、錄影工作建立／finalize／中斷狀態、chunks保全及成檔後persistExport保持原契約。設計與排除方案見[來源庫 TECHNICAL 第 42 節，需連網](https://github.com/sunpochin/dance-stamp/blob/c0ab39bcf68354cc29d7048a0d81e56d626efcf1/TECHNICAL.md)。

### 修正工作樹的原生回歸

基底ba89487上的工作樹、靜態422c70c3633b8e88、Chrome156.0.8078.49；不是clean-head驗收。可重用metadata-stop.js十案完成：九個可取消入口在native metadata put成功、原生get hold保持未提交時，真正點Stop後14.6–16.6ms取得trusted transaction abort／無complete；完整舊native metadata、產品JSON、revision／keys、Blob全部bytes／SHA及URL不變，busy退出、unknown=false，同輸入重試native complete並reload一致。重選檔／新增動作會由產品重新產生ID，核對同來源bytes／表單語意，不偽造固定ID。

第十案在獨立比較佇列pending時，取得可信Play點按及operation忙碌屏障後實點Stop；舊交易仍pending，解除QA自己的hold才complete，新操作回cancelled且沒有第二份metadata put。原先已排隊的比較設定按自己的owner完成，不因新操作Stop被誤取消；原片／VS bytes及URL保留，reload相同。119份native binary與57份實際下載逐byte／完整SHA核對；九個取消入口各有六份實際下載，第十佇列例外另有三份基準下載，不混寫成六十份。

第一輪刪除案例因QA未接受原生confirm而未進交易，第二輪前九案通過、最後佇列仍無abort／complete，但fieldset的Playwright isDisabled斷言失敗且欠Play／operation屏障；兩輪保持failed，原收據不刪。第三輪接受真正confirm、以原生disabled屬性及前後busy／可信Play屏障核對後，完整重跑十案全過，不拼前兩輪。沒有縮素材、偽造事件或改產品／品質門檻；這些QA缺口不冒稱新產品bug。

第三輪raw SHA256 `045a64c054b59e10a3bde640a1072d82ebdef8c43ae3f250ace19e55fc46833f`，main SHA256 `25f0b175af76f5c4d0c7f375beceb6ce925606f808c0610c9eb924fb6af03b62`、回歸函式SHA256 `779d5b35d8b650ab8ceaed1369f016cde5f51686cf31b8f39e7c155949fbe41c`。20個已知自有PID／程序群組與精確profile退出、十個自有主機停止及nonce相符釋放，擷取API呼叫0。原檔、profiles、raw端點及操作識別不公開。

原capture及capture-drain已在同一修正工作樹通過：取消／編碼error／合成中斷、quota／缺號／壞片保留及連續片段恢復均符合原斷言；尾塊未提交期間仍持take鎖，提交後恢復111,252 bytes、舊片／配方及reload不變。兩個全新合成相機session分別核對10／11個已知自有程序與精確profile退出、服務停止及nonce釋放；沒有真實硬體相機或中斷宣稱。最後原check／hooks與乾淨feature head由PR另綁。新manifest的獨立default更新重驗另綁乾淨新head；原9e6的24＋3、345的Safari十九案及各原失敗保留原版本。該工作樹回歸不宣稱Safari／私人模式保存Stop、產品全Stop、永久保存、真實低磁碟、實體／人工／跨裝置或iPhone通過；未合併、發布或關閉未驗收票。


## 99a2169 同版獨立 Stop 與 manifest 重驗

固定乾淨`99a21696e286bf54f3317087cb4796218be70b98`／靜態`422c70c3633b8e88`、Chrome156.0.8078.49，另一個獨立來源重新建置並執行；trackedChanges為空，14資源與該head正式建置相同。main SHA256仍`25f0b175af76f5c4d0c7f375beceb6ce925606f808c0610c9eb924fb6af03b62`，title使用提交中的metadata-stop函式SHA256`779d5b35d8b650ab8ceaed1369f016cde5f51686cf31b8f39e7c155949fbe41c`。這是title／copy兩個明確入口的clean-head重驗，不把前節工作樹十案改標為clean-head全跑。

| 入口 | 原生屏障與真正Stop | 保存／重試結果 |
| --- | --- | --- |
| title | 單一metadata put真正成功且未提交，實點Stop後15.6ms trusted transaction abort／無complete | revision11與完整舊非空筆記、keys、三份Blob全部bytes／URL保留；同候選重試12、native complete與reload相同，busy退出／unknown=false |
| copy-reference | metadata／media兩個put真正成功且未提交，實點Stop後14.7ms trusted abort／無complete | revision11、舊notes／take／VS全部bytes／URL保留；同File重試12、native complete與reload相同，busy退出／unknown=false |

兩案24份native binary及12份實際下載逐byte／SHA核對相同；title raw SHA256`24296db9ef048abeb9eb47d22661c326b93784d5b385758a7d5670899258815f`，copy raw`053a6d3f363b43afea9c30872f18aa756f675e938848af0311c0fac3fddfabe2`。既有offline-storage的程式觸發Stop、ba原copy控制與title負向仍各保留來源，不宣稱原先全無產品Stop測試。

### 新manifest的原default更新中斷

同一乾淨99沿原forced-install-restart（runner SHA256`6e6eb60bab8e995fd580d4e6fb89842be8847f7ebe25fe64d9fb3c937e7de08b`）真正重跑：422的12份manifest符合正式建置；候選僅1／12、第二CSS回應held且installing時真SIGKILL，同profile新程序在導航前offline，由舊SW取回完整舊殼。before／after原生及產品JSON、revision、keys、sentinel大小／SHA完全相同；1,048,613-byte已知pattern由原runner逐byte allBytesMatch=true，serverProbeHits=0／mediaCalls=0，兩群組退出remaining0。raw未另存sentinel全部bytes，本聊天只讀核對原程式、已知pattern hash與收據，不宣稱另讀原生byte檔。default raw SHA256`f022418ab9542e4fbcd44bfd18bd55c5842c67db3130d1b414a96921408b8430`。

三案的總OS／profile／埠／nonce收據已完成：45個已知自有PID、4群組全退出，三個精確profile無活程序、三個自有埠拒絕、三個nonce釋放，共用鎖不存在、mediaCalls=0。總收據SHA256`07a88cc73fb6b14d12b7ebe2c98a2efa32872925cea7e6e0722db59a46a0ad7a`；原ba helper、負向與兩個工作樹QA失敗保留，沒有清庫或處理無關程序。本輪只核對三案自有程序與服務，不宣稱其他本機預覽或所有瀏覽器程序都已退出。

本次只改UI metadata取消接線與其SW版本／manifest，另12份runtime與ba相同；錄影保全、成檔後persistExport、獨立comparisonSave、storage／schema、時間／編碼／原100ms／250ms／v5不變。原9e6的完整Chrome24＋3與345的Safari十九案保持原來源，本輪沒有重跑大矩陣，也不把這三案當成完整P0、成檔VS保存Stop、真正低磁碟、實體／人工／跨裝置或iPhone驗收。一般Chrome的成檔保存Stop由下節14128c2獨立補驗，Safari／私人模式仍未驗。最終文件head／包另綁，14份runtime須逐byte等於99功能版；不合併、發布或關未驗收票。

## 14128c2 成檔VS保存Stop的保全觀察

2026-10-30 Asia/Taipei，固定乾淨head `14128c2606029f5f11d438965ca001a84be4caed`、靜態 `422c70c3633b8e88`、一般Chrome156.0.8078.49。獨立私有單案例以合成雙片操作正式產品；未改產品、時鐘或品質門檻，未偽造abort，也沒有重跑完整影音矩陣。本聊天只讀核對原收據與完整檔案。

### 真Stop後繼續保存已完成檔案

基準revision12，包含非空筆記、兩側已保存原片與舊VS。匯出準備先有獨立trusted complete13且data不變；目標新VS交易才是metadata／media雙put真正成功、新VS已可下載但尚未commit。QA只用同交易原生get延長pending，不替換產品保存或結束事件。

真正點產品Stop後256.1ms仍pending、無abort／complete，下載連結保持可用；這不是已取消或回滾成功。僅解除QA自己的get hold後才取得trusted complete14；busy=false、unknown=false，reload完整相同。舊metadata除了追加一asset及一export外不變，舊媒體全部保留。符合成檔後persistExport的保全契約，未重現需改runtime的bug，不為要求Stop必abort改動保全。

14份原生快照binary（舊媒體12份、新VS2份）、另1份候選Blob及7份真正下載逐byte與完整SHA核對。新VS83,137 bytes、SHA256 `4b35b02a9f1d4bf8c600dcfe50b22183547dce1dd84393c158f974a69464baea`，Stop前／後與native complete後三次下載均與原生新Blob相同；舊VS由產品庫存清單真正下載，與舊bytes相同，不靠原URL相同推論可取回。

Stop前後recorder均inactive、既有影格訂閱0；原canvas串流音／視tracks在pending仍live，真正complete後才全ended。沒有額外影格訂閱、QA代停tracks、直接AudioContext節點圖觀測或真實硬體相機；不得寫成Stop立即釋放所有資源。

### 原解碼結果與DTS診斷分開記錄

沿原analyze-media.py（SHA256 `3f4aec9788880037a585ff81c6f77a0e56ab456dc835aa4cbe0cb0cbe1cbeaaa`）的fullDecode命令得到exit0；stderr保留兩筆null muxer的DTS碰撞39／87，不能寫stderr乾淨。初版私有QA另加「stderr必空」斷言，該斷言失敗且啟動稽核未完成；failed收據與原命令保留，不改成產品失敗或抹去工具失敗。

後續只讀同一原檔，原生packet／decoded frame的PTS／DTS均嚴格遞增；按原v5解碼方法取得全部91格、2,912灰階bytes。原48000Hz stereo AAC有139frames、每channel142,336samples，解為1,138,688 PCMbytes。由原生timebase 1/30000換算null輸出1001/30000，兩對量化DTS恰為39／87，符合debug log的29.97tbn及decoder 0 errors。檔案SHA不變，沒有重封裝、改PTS或重採樣；這是全解碼及時間戳診斷，不是新增G2–G4、音畫品質矩陣、人工播放或聽感通過。

### 收據指紋與清理界線

- 原生raw SHA256：`2c51a72d0c27dcb840764d0e8411ce13ca09bb8013d76d08197087d1dc5b9cec`。
- 私有單案例函式SHA256：`6eeade99f4dd936a5c75861f6320005b1fd76b1e76bbc0a26c3d5bef195c2890`；runner：`dd90ab095fc527133764e25c46be1703f7b76d389f81cb04cefb6f98553c3cae`，harness base仍為`6e6eb60bab8e995fd580d4e6fb89842be8847f7ebe25fe64d9fb3c937e7de08b`。
- 原fullDecode收據SHA256：`b11c07195efc4e4abcd77435b76cadb6d7f399d96bf0e3a45bbec0fd2f3478c8`。
- 私有QA failed收據SHA256：`9f7a0c10e881711854193de0b1d84623900aa3e86d58a0acafb86452dc06d15b`。
- 時間戳診斷收據SHA256：`74ef978a13dd9afb86db11bd44d26e569e6730735f6a639d579706fe188ddc6c`。

原生輪11個已知自有子PID／1群組，加上failed解碼1／1、原命令解碼1／1、時間戳診斷6／6，共19個已知自有子PID／9群組、4個ownnonce釋放。精確profile無活程序、自有server拒絕連線、共用鎖不存在、mediaCalls=0。較早彙整僅13／3／3，不涵蓋最後時間戳診斷；本段使用完整交叉清理範圍，不宣稱所有瀏覽器或其他預覽已退出。

本次只補匿名文件與包，14份runtime維持14128c2／99a2169相同來源；原工作樹十案、乾淨99三案、9e6 Chrome24＋3及345 Safari十九案不改標新版重跑。一般Chrome的此保存Stop觀察已完成；Safari／私人模式保存Stop、私人新VS保存失敗／未確認救援、永久保存、真低磁碟、實體／五人操作／讀屏聽感／跨裝置及iPhone仍未驗。原始媒體、profiles、raw與操作識別留本機，不入Git或包；不合併、發布或關未驗收票。
