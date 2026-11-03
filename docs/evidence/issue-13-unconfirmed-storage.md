<!-- 檔案用途：記錄 #13 缺失交易結束事件的修正候選與驗收界線。所在層：匿名工程證據。主要關聯：web/storage.js、main.js、storageCompletion.test.ts、TECHNICAL.md。 -->
# #13：保存錯誤後沒有交易結束通知

2026-10-29，工程候選，已補受測 `99e862d` 的原生 Safari 私人／一般儲存對照；未完成全部 #13／P0 驗收。這是產品修正的後續 PR，不修改 #65 的歷史 quota 數據。

普通 Safari 的成檔保存 Stop 最新直接觀察見[本頁 7dede9f 續驗](#7dede9f-普通-safari-成檔保存-stop)；私人模式仍未驗。下方歷史結果保留原來源。

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


## 7dede9f 普通 Safari 成檔保存 Stop

2026-11-02 Asia/Taipei，乾淨 main `7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca`、靜態 `80faff7573fa1d79`、Bun 1.4.4；macOS **27.2／26B123**、真正普通 Safari **27.2**。版本由本機系統、Safari bundle 與頁面 UA 核對，不沿用舊證據的 27.0.1。只補一個「3 秒、1×、成檔保存中按停止」情境；不跑私人、實體斷網／斷電、相機或其他票，不納入 PR #198。

白話結果：影片已做好、可以下載時，按停止仍讓正在安全保存的成品完成保存。原片、舊 VS 與非空筆記保留；這是完成檔的保全，不是取消回滾。沒有發現需要改產品的問題，`persistExport` 仍不接 `active.signal`。

### 來源、預置與首輪工具失敗

在本聊天 managed worktree 建置；共用入口及協調工作樹只讀，既有 4193 使用者離線包／profile 未開啟或變更。普通 Safari 原視窗保留，另開專用普通視窗及全新 loopback origin。原 HTML 只加 QA script，產品資源沿建置白名單逐份記 SHA；未改產品程式、CSS、`data-deferred`、schema、100ms／250ms 護欄、保存期限或取消契約，未啟用 SafariDriver／修改偏好。

合成片沿 `make-export-fixtures.ts` 的 8 秒色條／660Hz／880Hz 原片，只讀複製到自己的 output，以 FFmpeg copy 取 3 秒，沒有真人或第三方音樂。兩支實際輸入為 41,736／67,209 bytes，完整 SHA256 分別 `4899551b4cec878137bca1e1d510cfbea00d5de1ae62799275cdcf04d8c689ae`、`ae6db98e328a05a1a0cff319e30ee4651607af84b8b0bcf0d4204cd55777af9f`。

先從可見選片／匯出介面真正建立舊 VS，191,811 bytes，SHA256 `bae3912b242c392328e77f05429c580fa65fc4b652cce63089d3ac4367434d6e`；再由明示 QA 設定階段，以產品 `writeLibrary`／原 schema 預置非空標記筆記及兩側副本，完整 bytes／SHA 讀回核對。沒有點隱藏的筆記／副本按鈕，也不稱真人建立筆記或正常 UI 可用性驗收。

首輪新 VS 已成檔，雙 put 成功後真正 Stop，解除自有 hold 才 trusted complete；但 QA 按鈕直接向 pending 交易排入讀取，Safari 拒絕 `TransactionInactiveError`，所以首輪缺少 Stop 前後完整快照，不列為完整通過。原失敗、196,301-byte 下載及 complete 收據保留，沒有清庫、改檔或掩蓋。修正的是 QA：讀取改由既有 keep-alive 原生 get 的 success 回呼排入，因為「pending」不代表在任意事件裡都是 active。之後在另一個全新 origin 預置上述已核對的舊 VS／雙片／筆記，再由可見介面選雙片，只重驗同一情境的一次新 VS；沒有重跑產品護欄失敗或擴跑矩陣。

### 修正輪的真正 Stop 與提交

旁聽 `transaction` 的原生 success／complete／abort；**不替換 put、不偽造事件、不取消其他交易**。只有新 VS 的 media put 成功才開始同一 readwrite 交易的原生 get 循環，避開匯出前 metadata-only 配方保存。沒有以 timeout 推測回滾。

| 時點（頁內單調 ms） | 真正收據與資料 |
| --- | --- |
| 基準 | revision 5，非空筆記，舊雙片／VS 共 3 個持久媒體 key。 |
| 匯出準備 | metadata-only trusted complete，revision 6，data 不變。 |
| 21,519／21,520 | 目標 metadata／media 兩個 trusted success；候選 revision 7，尚無 complete／abort。錄製器 inactive，成品已可下載。 |
| 65,724 | 可見停止按鈕的一次 trusted click。原生 SaveAs 已取得本次新 VS。 |
| Stop 後 24,296ms | 仍 hold／busy=true、unknown=false；沒有 complete／abort。完整 metadata／media 及候選 bytes 指紋和 Stop 前相同，下載連結仍可真正另存。這不是已取消。 |
| 130,898 | 只解除 QA 自己的 get hold 後，才得到 trusted complete，沒有 abort。busy=false、unknown=false，UI 顯示已成檔保存；沒有未確認／救援說明。 |
| 同 origin 完整 reload | metadata、全部 keys／非空筆記、4 份持久媒體的完整 bytes SHA 與 complete 快照相同。比較區此時尚未選片，aria-busy 原值為 null，不改寫成 false。 |

除了新增本次一個 asset／export，逐欄舊 data 全相同；舊 VS 與兩原片每次完整原生讀回／SHA 均保留。舊 VS 的持久層讀回與先前真正 SaveAs 相同；隱藏庫存 UI 的真人取回沒有驗證。chunks 在基準／complete／reload 都空且完全相同；pending 目標 scope 只有 metadata／media，**沒有直接另讀 pending chunks**，不把不相交或排隊讀取冒充當時快照。

Stop 前後 recorder 皆 inactive、影格訂閱 0；被觀察的 1 video／2 audio tracks 仍 live，AudioContext running。真正 complete 後才全 ended、Context suspended；沒有 QA 代停 tracks、額外影格訂閱或直接驗 AudioContext 節點圖，不能說 Stop 立即釋放所有資源。

新 VS 194,114 bytes、`video/webm; codecs=vp8,opus`，SHA256 **`3abbbf46cf1906110c0c8666ecfdd2ebe86b9d3a3da44948055058de6a173973`**。候選、原生 media 讀回與 Stop 前／後／complete 後三份真正 Safari「Download Linked File As」檔逐 byte 相同。產品原護欄得到 3,019ms 解碼長度，配方為 0–3,000ms、1×、offset 0，非鏡像；JS drift 26ms／render gap 28ms 只作旁聽，不取代成檔同步量尺。

### 關站後原始檔播放與音訊限制

先關閉本案產品視窗、自有主機，證實原埠拒連、主機 PID 退出，再於專用 `file:` 播放器自然播放實際 complete SaveAs 原檔到 trusted ended，沒有 seeking／seeked／重播。原始 quality：totalVideoFrames **92**、droppedVideoFrames **0**、corruptedVideoFrames **0**、error **null**；舊式解碼計數未提供的欄位保留 null，沒有補 0。

播放器 Web Audio 分析保留 **183 筆 RMS／peak 全 0**，原因未定，因此**未驗證原生有聲播放／人耳聽感**。另外原檔全軌解碼 exit 0，通用 null muxer 原 stderr 有 **32 條音訊 DTS 訊息**，原樣保留，不宣稱 stderr 乾淨或已定位原因。獨立全影像 framehash 解碼 **91 格**、原 48,000Hz stereo 音訊解為 **144,840 samples/channel**／1,158,720 PCM bytes，兩項 exit 0、stderr 空；PCM RMS 0.0885276587。影像 framehash 收據 SHA256 `cdd90cd8c11e0dcef342c613eca364e48872d9ab80065a80b52670600543c27b`、PCM SHA256 `d15be81e154956990dd57ea3271ada36f540c61397686daeeda46f5d4a924646`。沒有重封裝、修 PTS／DTS、重採樣或修改原檔；解碼、自然播放、音訊取樣三者分開記錄，不能升格 G2–G4／完整品質通過。

### 工具、收據與收尾

受測旁聽程式原 bytes 隨本 PR 收入 [safari-save-stop-observer.js，需連網](https://github.com/sunpochin/dance-stamp/blob/codex/issue13-safari-save-stop/tests/browser/safari-save-stop-observer.js)，SHA256 `2d26bc8bf55d9305e02e55ec44cfcf26e692ac1f0dec7cdb6da6f7d164673403`；[只讀核對器，需連網](https://github.com/sunpochin/dance-stamp/blob/codex/issue13-safari-save-stop/scripts/check-safari-save-stop.py)以完整本機收據核對先後、舊欄位／完整媒體 SHA、三份下載 bytes 及 reload。主機／明示設定／file 播放工具的原始來源與設定指紋均留本機；重現契約見[媒體指南](../MEDIA_PROBE.md#普通-safari-成檔保存-stop)。

- 修正輪 Stop 前 pending 收據 SHA256：`d6b0175a8ca1f49c2e936d9e7196ef32ab1033e7f72d273b2c99a29b7ac1db69`。
- Stop 後 pending：`2e4a1a6cfb853c7a65fe2668300a375b05583f1e5204396d484758cfd1d6f6f4`；真正 complete：`7e41aba4c6616088e9ef63e071b5250ec476c23852a046a06d5332498ee4653c`。
- 完整 reload：`5e31631be6f5ecc5181abc5dbfd65ceaacff7cc2ea63ad993f8251eafb482d31`；逐欄核對結論：`32663f61e46559a2b42e5d09e83c57b9b083514146590c967acb62313b1f7560`。
- 解碼收據：`f277da57af112d11270cfc5db2d660232195c7f235a020f901411b59b746d4dc`；真正 file 播放另存收據：`d6dc34107a749b079ab088ffa4c4d206251870cddffe532e613e1bdd23df4f2a`。
- 本機 raw／工具／媒體清單指紋：`a8c24af0d170416f3ad9f738bdf7e40e02819d36d4f106e213004c5d3ea2b6bb`；該清單在最終 cleanup 結論與公開核對器結果寫入前封存，不冒稱包含其後檔案。

共用鎖曾忙，僅讀 PID／cwd 並等原持有人自然釋放。自有 nonce 分別核對釋鎖；三個主機與兩個 holder 共 **5 個已知自有 PID** 皆退出、三個自有埠拒連、最後鎖不存在。首個離站 holder 因非互動 stdin EOF 走 finally 釋鎖的工具失敗保留；第二個互動 holder 正常收尾。一次電腦操作呼叫逾時後，先查原生 clicks 證明 Stop 已送出，沒有重按。只關自己的兩個產品視窗／一個 file 視窗，日常 Safari 視窗保留；不宣稱整個 Safari 程序退出。

本次只交付匿名文件與 QA 工具，產品 runtime／schema／靜態版本不變。普通 Safari 的這筆成檔保存 Stop 已有直接保全觀察；**私人模式、pending chunks 直接快照、原生出聲／真人聽感、實體離線／斷電、裝置／iPhone、完整 G1–G7 及指定最終審查仍未驗**。#13／#3 保持開啟，沒有合併、發布或變更服務／帳務／權限。文件 head／正常 check 與 PR CI 另由本 PR 綁定，不把文件提交稱作重跑媒體。

正常 `bun run check` 通過 **704 tests／3,806 expects／0 fail**、公開掃描、型別、原 lint 與 build；原 19 項 lint info 保留。首輪 703／1 的失敗是隨包指南指向未封裝 QA 原始碼，已改需連網來源連結，沒有擴充使用者包或弱化測試。只讀核對器正控制通過，將原片誤當舊 VS 的負控制會拒絕。正常 commit hooks 與最終 head CI 另綁。

## 7dede9f 私人 Safari 新 VS 保存前的首次拒絕

2026-11-02 Asia/Taipei，macOS **27.2／26B123**、原生 Safari **27.2**、Bun **1.4.4**。本輪重新 fetch 的 main 仍為 `7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca`。專用 managed worktree 從依賴 PR #214 的精確 head `14cdaefd8159b0b1939d1304df1033f08edded0e` 建自己的分支；其差異只有普通輪文件／QA，產品資源逐份等於 main，靜態 **80faff7573fa1d79**。不是重跑普通保存 Stop 或舊 Blob／ArrayBuffer 矩陣，也不改寫既有歷史來源的結果。

白話結果：**影片還沒做好，就被原有同步保護擋下。因此還沒走到「新影片存不進去時，從本頁救出」那一步。** 只記首次失敗並停止產品重跑，沒有縮片、改起點或調寬門檻。本輪沒有產品修正，也不能宣稱私人影片保存或新 VS 救援通過。

### 凍結來源與工具首錯

只讀複製普通 PR #214 已用的兩份三秒色條／660Hz、880Hz 合成片：示範 **41,736 bytes**／SHA256 `4899551b4cec878137bca1e1d510cfbea00d5de1ae62799275cdcf04d8c689ae`，練習 **67,209 bytes**／`ae6db98e328a05a1a0cff319e30ee4651607af84b8b0bcf0d4204cd55777af9f`。配方從該輪原生基準收據取得：老師 **0–3000ms**、練習起點 **0**、**1×**、offset **0**、左右並排、兩側不鏡像。原配方、兩片 SHA 與全部產品資源均相符；沒有憑文件猜 A/B 或 offset。合成原始配方仍為 `make-export-fixtures.ts` 的八秒色條／音調，再由普通輪以 copy 取三秒；本輪只複製已核對的三秒檔，沒有另裁片。

共用媒體鎖忙時只讀核對持有人 PID／cwd，等其自然釋放才原子取自己的鎖。透過 Safari **File → New Private Window** 建立自己的私人視窗，AX 與畫面均有 Private Browsing；只用全新 loopback origin，保留日常視窗、4193 使用者離線包／profile 及全部偏好。沒有呼叫相機、麥克風或畫面擷取。

QA 準備輪先遇到可重現的選擇器錯誤：旁聽器用了不存在的 `select-reference-video`，真正 ID 是 `select-video`，`getComputedStyle` 因此報 TypeError。當時只有 metadata-only 預置，尚未選片或匯出。首錯工具、畫面與同頁讀回的 revision 1 筆記收據保留；修正後逐項核對所有觀察 ID 都在原 HTML，語法檢查通過。先另存準備輪資料、正常結束自有主機，再以修正工具及另一全新 origin 凍結本輪；沒有把工具首錯當產品失敗，也沒有重試任何產品匯出。

受測旁聽器 SHA256 **`c66f766e8a0c37c85a9b5789e99f09709e3e1cf1811ae39047a7099c4f030508`**，本機主機 **`ee049d5d9cc6932b07e2bf967273571fadf0a7e7c7a626eb1b3e272af7ca532d`**。主機只提供原建置資源與 QA 腳本，不接受任何媒體／資料上傳；兩次自動審查拒絕的 Blob POST 方案沒有執行，改用可見 QA JSON 收據下載。媒體只在頁內算完整 SHA，不另造 QA 媒體下載冒充產品救援。

### 唯一一次產品匯出

| 時點 | 原生收據與實際結果 |
| --- | --- |
| QA 非空筆記基準 | 明示以原 storage API／schema 預置一則合成標記，真正 trusted metadata success／transaction complete，revision **1**、media keys／chunks 均空；不含舊 VS 或原片副本。 |
| 正常可見選片 | 兩側以原生檔案選擇器選上述素材，兩筆 metadata-only trusted complete，revision **2→3**。原片 File 留本頁；沒有 Blob 保存。 |
| 匯出準備 | 一次真正 trusted 輸出點按；原 `saveCurrentRecipe` metadata-only success／trusted complete，revision **3→4**，完整 data 與匯出前逐欄相同。這不是新 VS 保存。 |
| 首次產品失敗 | 顯示「兩側偏移超過 250ms，請重新校正／降低負載。原片仍保留，可重試。」隨即停止產品重跑。`diagnostics.export=null`，VS 連結仍 hidden、沒有候選 Blob；exports／media keys／chunks 均空。沒有到 `persistExport` 的新 VS 交易，也未重現本版私人 Blob UnknownError。 |
| 失敗後保全 | busy=false、unknown=false，原生三筆產品寫入皆只有 metadata success／trusted complete，沒有 abort／error。原片 URL、完整 bytes 指紋及非空筆記／配方相同；recorder inactive，觀察到的 video／audio tracks 全 ended，硬體 API 呼叫 0。 |

旁聽只呼叫原生 transaction 並保留原回傳，在 metadata success 的 active 回呼加一次同交易 metadata 快照 get；**沒有 get hold**、put 替換、錯誤預設動作阻擋或偽造 complete／abort。這次是帶觀察器的首次失敗，不由它推定同步唯一根因。所有寫入均已真正 complete、unknown=false，才另做 readonly 收據；未知交易時不讀 DB 的規則保留。

### 收據、界線與收尾

只讀核對器確認：原生筆記／配方完整相同、revision 3→4、一次 trusted 匯出、空 keys／chunks／exports、兩份原片實檔與 URL 指紋相同。兩個負控制分別放入 media success 或 unknown=true，皆被拒絕，不能改標成保存前拒絕或救援通過。工具只讀本機合成收據，不啟動產品、瀏覽器或媒體鎖。

| 本機原始收據 | SHA256 |
| --- | --- |
| QA metadata trusted complete | `ba4cf93d57c26011edb2aa0af226800dc8ac3a7d10f1f4da3ea8b0a200454d5b` |
| 匯出前完整基準 | `f8ff8fead6fa68607eca4bf008aaf80147ab6971e24d9ad5b1eb2ff6392c6e68` |
| 首次產品護欄失敗 | `dc8c08c3f363e89d94595826387a3d5c6737dff74d3d519af28d99679db0f16d` |
| 逐檔核對結果 | `46e15665f7faf67d79d6c709facaf481265423e2237420816aa9874a83e82622` |
| 負控制 | `ef9833702fe65df4de5a5f985a51410e8d31b68d0423561b62f264c8b3113424` |
| 最終清理 | `4506b177d918121516b52ffe793ccad316206fc34c5350c056628488d971f9bb` |

原片連結因尚未進入未確認救援而仍受一般介面簡化隱藏；沒有點隱藏工具、修改 CSS／data-deferred、另造下載或觸發不存在的可見救援入口。**新 VS 原生保存失敗／未確認、真正產品原片／新 VS／筆記救援下載、救援後同私人頁面讀回，以及真正新 VS 的離站播放／全軌解碼／音訊均未驗證**。沒有成功新檔，因此沒有啟動獨立播放器、拿普通輪檔案補驗或代簽聽感。非空筆記另封存的完整 QA JSON 明列為 QA 複本，不冒稱產品備份；不存在的舊 VS／媒體基準也不稱已驗保留。

全部實際 JSON、合成輸入、工具來源與 AX／畫面均留本聊天 ignored output 逐檔讀回封存，不公開 raw、媒體或操作識別。資料另存並核對後才關本輪私人視窗。準備／正式兩個自有主機皆正常 exit 0、PID 已退出、原埠拒連，兩個 cleanup nonce 與 owner 相同且自己的鎖已釋放；原 Safari 視窗保留。

本輪遵守首次護欄失敗即停的範圍，不改 runtime／schema／Blob 格式、時間映射、100ms／250ms 或任何期限。既有普通 #214、舊 Safari 27.0.1 Blob／雙表問題、原 130ms、實體離線／斷電、iPhone、人工聽感與 G1–G7 均各自保留來源與未驗範圍；不把本次 27.2 的保存前失敗當作舊引擎缺陷重現。#13／#3 保持開啟，待 Claude Code／使用者指定最終審查，未合併或發布。

## 原下載離站音訊對照（2026-11-02）

白話結果：原下載不是全零音訊檔。Chrome 的獨立播放器有解碼音訊；Safari 能量到合成 WAV，卻仍量不到這份 WebM 的播放音訊。原因尚未定位，不能把「播到結尾」當作 Safari 有聲通過。這輪只補 QA 工具與證據，沒有修改產品、保存 Stop 契約或任何品質／期限護欄。

來源固定 [PR #214](https://github.com/sunpochin/dance-stamp/pull/214) head `14cdaefd8159b0b1939d1304df1033f08edded0e`；從該 head 建本聊天 managed worktree／依賴分支，未寫共享入口、原工作樹或原分支。產品來源仍為 `7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca`／靜態 `80faff7573fa1d79`。原生 Safari **27.2**／macOS **27.2（26B123）**，檢查與 hooks 使用固定 Bun **1.4.4**。沒有重開產品、製作新 VS、重驗保存 Stop／私人／寫入中斷。

### 原檔與原失敗保持不變

只讀複製前段原三份 SaveAs、候選 Blob、原播放／解碼／交易收據及必要分析來源，逐 byte 核對：每份 **194,114 bytes**，SHA256 **`3abbbf46cf1906110c0c8666ecfdd2ebe86b9d3a3da44948055058de6a173973`**。本輪結束再核對原檔相同；只用合成內容，沒有相機、麥克風或畫面擷取。

原播放收據 `d6dc34107a749b079ab088ffa4c4d206251870cddffe532e613e1bdd23df4f2a` 的 **183 筆 RMS／peak 全零**不改標通過。原 PCM `d15be81e154956990dd57ea3271ada36f540c61397686daeeda46f5d4a924646` 重算仍為 289,680 個 f32 樣本、非零 288,480、peak 0.2491246015、RMS 0.08852765875；這是既有全 PCM 解碼，並非本輪 Safari 播放出聲證據。原 fullAV null 的 **32 條音訊 DTS 訊息**與完整 stderr（SHA `7675f5b1c78849e62a15f096b973290ee838ad3ade35d420f02e929a556eaf93`）保留，沒有改檔、重封裝、修 PTS／DTS 或重採樣，也未以時間量尺抹除訊息。

### 有界控制與一次 QA 修正

先記計畫與 helper／原下載 SHA，才取得共用鎖、開自有普通 Safari 窗口。工具頁只讀本機媒體；CSP `connect-src 'none'`、沒有外部資源，產品／主機全程未啟動。這是頁面網路限制，**不是實體斷網**。

首輪 helper SHA `723edccfea27516e96b6843b675a2d7471d68156dcb4d64e57eb65abd7482347`：oscillator 660Hz／gain 0.1 正控制有訊號，49 筆 running 樣本，clock 0→0.802667 秒、peak 0.1000000015，靜音尾段 peak 0。直接 file 原下載一次自然 trusted ended，185 筆全零；running clock 0.026667→3.082667 秒，muted=false／volume=1，duration=3.019 秒、quality 92／dropped 0／corrupted 0、error=null；同一 video 的像素讀取 `SecurityError`。可排除該次懸停時鐘／靜音，不能由像素拒絕斷言音訊唯一根因。

首輪同檔 File→Blob 的完整 SHA 相同、像素可讀、自然 ended、20 筆仍全零；取樣時間有大空隙，且讀碼發現 helper 跨 context 重用影片元素。該案原值／工具保留，不用於單獨定位。最小 QA 修正：每案建立全新 video；把正控制改成 **76,844-byte** 純合成 WAV 經相同 MediaElementSource 聲路，避免只測 oscillator 而漏測元素聲路。修正後 helper SHA **`51605af81de15d027699c2d51b5d8df5e129fc98b72c6c5183b500e460c8c866`**。只補 WAV 與新元素的同一原下載 Blob，一次，不重跑直接 file 或挑 dropped=0。

| 修正輪 | 合成 WAV | 選取同一原下載 File→Blob |
| --- | --- | --- |
| 原生結果 | trusted playing／ended，0.8 秒，error=null | trusted playing／ended，3.019 秒，error=null；無 seeking／seeked |
| 音訊原值 | 70 筆，28 筆非零；peak 0.09997558594、max RMS 0.07086271742；0.65 秒後靜音樣本全零 | **185 筆 RMS／peak 全零，未解** |
| context | 全部樣本 running，clock 0.034667→1.181333 秒 | 全部樣本 running，clock 0.032→3.090667 秒 |
| 最大取樣間隔 | 21ms | 25ms |
| 元素／影格 | muted=false、volume=1；純音訊無影片影格 | muted=false、volume=1；92 frames、dropped 0、corrupted 0；像素可讀 |
| 可用舊式 audioDecodedBytes | null（未提供） | null（未提供，不補 0） |
| 收尾 | 原播放末態 running；斷節點後 closed | 原播放末態 running；斷節點後 closed，撤銷 Blob URL／清除 src |

兩案頁面可見 errors／console warn/error 均空；沒有讀取 WebKit 內部 console 或聲卡輸出。修正只改善 QA 可判讀性，**沒有證據把原 WebM 零值歸因這個工具重用問題**，也未宣稱修正後音訊通過。

[W3C 安全規則](https://www.w3.org/TR/webaudio-1.0/#MediaElementAudioSourceNode-security)要求被 fetch 標為 CORS-cross-origin 的 MediaElementAudioSource 輸出靜音；[固定 WebKit 來源](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/Modules/webaudio/MediaElementAudioSourceNode.cpp)另有 wouldTaintOrigin、未初始化格式、provider 不可用等輸出零的路徑。這是候選解釋的依據，**不是安裝中 Safari binary 的對應證明**。選檔 Blob 像素可讀仍全零，使「只要換掉直接 file URL 就會恢復」不成立；剩餘音訊聲路／格式原因未定位，停止擴跑矩陣。沒有改 Safari 安全／隱私偏好、CSP、弱化來源旗標或新增產品修補。

### Chrome 補充與收據

沿用既有 `download-playback.js` 原 bytes（SHA `737e4be2d69c9f6c60da1c20c73754558b8d4b2416793bfaa989bc5a2c7c2ba1`），專用 **Chrome 156.0.8078.76 headless**、全新隔離 profile；context offline=true、navigator.onLine=false，未快取探針 `net::ERR_INTERNET_DISCONNECTED`，預期 console 錯誤保留。僅本機 file document／media 讀取，沒有產品／HTTP 主機。首輪探針導航失敗後的 error-page 導航與 file 導航競爭，尚未完成播放；失敗原 log 保留。只把探針改成空頁 fetch，另開乾淨分頁重驗。

同一下載自然 trusted ended，**3.008 秒、1280×720、92 frames、dropped=1、error=0、audioBytes=66,366**。原 helper 的初始化 pause／currentTime=0 造成原生 seeking／seeked 與兩個 playing，照錄；之後不拖曳、不為 dropped 重播。這是下載本身可獨立播放及音訊解碼的補充軟體證據，**不能代簽 Safari analyser、人耳／喇叭聽感、實體斷網或 G1–G7**；也不增加「軟體核對一定要人耳實聽」的新門檻。

可重建工具及核對方式見[媒體指南](../MEDIA_PROBE.md#離站音訊取樣對照13)。只讀 checker 對本輪收據有效，但明列 WebM `zero-unresolved`；受控改成 suspended、錯 SHA 或正控制全零的三個負控制均 exit 1，避免收據有效被誤當音訊通過。

- 首輪直接 file 收據 SHA `d709a025c2aa232395b462ce6d324e2d3fe002af3a40fa57482c1d03d5fe0f8f`；首輪含重用元素案的完整原值留獨立 raw 封存。
- 修正輪完整收據（177,964 bytes）SHA **`f79a67aad86382a3db08569e5ec646a2c1a63eb82cc2de1797e144b28b5ecc9e`**；只讀核對結果 `88c89f44dc58c9fc81f2ccc67530c960d43b44bd9399505d0ee76fb63cbbee8c`。
- 修正前計畫 `f6f25c0605b36a442bcb8bec1bc25bb6ab909bfc441d2d2464831bc0701e5e6f`；修正理由／新計畫 `ecfbaf252f325bcbf359a501dc75c80cb7c8bfdaf143dfc1aa66a3d9e960a9a5`。
- Chrome 讀回 JSON `39ce3f28fa1a926cf6be17f8faba81eb21bf006614cb3af4ff24c44c2b94f894`；三個負控制收據 `56d2c22087440fa0a2fbd4718e611e3cf33db1ab795bfd8e99ca4c1db0ece84e`。
- 收尾收據 `c73acae6aa260273dccf7adbf72b88ba52856cb1dd3d337712499b4d6c6e3905`：兩個自有 Safari 窗口正常關閉，專用 Chrome 關閉、共 11 個已知自有 PID 全退出，兩輪只核對自有 nonce 釋鎖，觀察鎖不存在。日常 Safari、他人工作樹與 4193 使用者包／profile 未更動。

raw／媒體／本機識別留 ignored output 與獨立本機封存，不放 Git。普通 Safari 此檔的音訊取樣原因仍未解；真人聲畫／聽感、實體離線／私人／裝置／iPhone、完整 G1–G7 及指定 Claude Code／使用者審查各自保留。#13／#3 不關閉；未合併、發布或變更服務／帳務／權限。正常 check／hooks 與交付 head 的結果另記，文件提交不冒充再跑媒體。

正常 `bun run check` 通過 **704 tests／3,808 expects／0 fail**，公開掃描、型別、原 lint 與 build 通過，原 19 項 lint info 保留；建置靜態仍為 `80faff7573fa1d79`。原生控制與三個 checker 負控制按上述原收據綁定，正常 commit hooks／遠端 CI 另綁交付 head。

## 2026-11-03：#229 私人 Safari 首次三秒音畫拒絕與有限診斷

白話說：這次影片還沒做好，聲音已經往前走，畫面卻短暫停住，產品因此拒絕交付錯位影片。筆記和兩支原片仍保留。這不是「成品已做好但保存失敗」；尚無足夠根因證據，沒有更改產品或放寬護欄。

### 固定來源與首錯

原生 Safari 27.2／macOS、Bun 1.4.4；產品來源固定 `83220edabd90cab274532900763c4ff696dffdc5`／乾淨建置 `83a29a61027b205d`。每案新專用私人視窗與 loopback origin，非空合成 metadata 基準完成後同頁重開；未改日常視窗、Safari 設定或防護。相機／麥克風與媒體上傳皆不使用。

原 reference 41,736 bytes／SHA-256 `4899551b4cec878137bca1e1d510cfbea00d5de1ae62799275cdcf04d8c689ae`，self 67,209 bytes／SHA-256 `ae6db98e328a05a1a0cff319e30ee4651607af84b8b0bcf0d4204cd55777af9f`；均為原三秒合成 MP4。A=0／B=3／C=0、1×、offset=0、並排、無鏡像，不縮短片段或挑選重跑成功。

首次自然案只有一次 trusted 匯出點按，立即顯示「音訊與畫面偏移超過 100ms，未完成合成；請降低負載後重試。原片仍保留，可重試。」進度最後為 0.213691；首錯保存後 **0 重試**。`timeline` 在正式錄製／play 後，比較 AudioContext 與老師 `currentTime`，於候選 Blob 驗證及 `persistExport` 前拒絕。原旁聽沒有時鐘樣本，不能替首錯補出未觀察的唯一根因。

完整 library data 匯出前後相同，revision 3→4，原一筆非空筆記、配方和兩原片 URL／完整指紋不變。全部三筆 readwrite 交易只有 metadata library put，且為真正 trusted complete。`saveCurrentRecipe` 這筆 metadata-only 寫入不是 VS 雙 put；沒有 VS Blob／下載、exports／media keys／chunks 均空。unknown=false／busy=false，recorder inactive、兩 tracks ended、hardwareCalls=0、旁聽 error 0。

這與舊 `7dede9f` 的 250ms 雙片 drift 首錯分開保留，沒有移記、改稱儲存救援成功或抹除舊結果。原未修改 `check-safari-private-guard.py` 的 250ms 前提對本案不適用，實際拒絕 exit 1 已保留；本輪只作「沿原保全斷言的局部診斷核對，將本新階段文案精確綁100ms」，不是原 checker 未改且全過。

### 有限診斷與反證

所有以下 cohort 仍固定原 source／build／素材／配方，每案只有一次首匯出、0 同案重試，最多240筆，其時鐘／影格旁聽只轉交原 rAF／影格回呼；不新增 callback、暖機、像素讀取或產品顯示。讀值、wrapper 與 Promise 旁聽仍有觀察效應，不能宣稱零負載。

| 案 | 首結果與可支持的觀察 |
| --- | --- |
| 只讀時鐘，53筆／0丟棄 | 仍100ms拒絕。正式雙 play 約40ms完成，初相位30ms，之後約29.5–31.7ms；reference 後來停在0.631559秒，context仍running，偏差30.93→65.11→105.11ms。不是觀察到的初始>100ms，也不是context先停。 |
| 原 setter／既有影格 metadata，108筆／0丟棄 | 仍100ms拒絕。正式 play 後無 JS currentTime setter；self 第一次微調1→1.000177333後回近0，之後亦重現。reference停在0.636535秒；正式首個原生影格回呼延後至拒絕附近，mediaTime僅0.033333／presentedFrames3。這是候選關係，不直接宣布因果。 |
| **受控行為變體**：正式輸出期間忽略 self 非1速率寫入，112筆／0丟棄 | 19次寫入確實抑制、原生 self rate保持1，self不再回零、兩側約差0.38ms；仍一起停在0.671892／0.671513秒，音訊偏差33.19→70.11→104.78ms，首錯仍100ms。故這個候選改動沒有修好本票，沒有據此修改產品。 |
| 同observer／未抑制，匯出後5秒不再AX／snapshot／操作，108筆／0丟棄 | native click工具0.1085秒後，5.007秒完全不讀畫面；仍100ms首錯。reference停0.620834秒，偏差31.19→67.83→102.50ms；此案不支持「立即AX讀取」是必要原因，仍保留點按工具與旁聽本身的可能影響。 |
| viewport嘗試，112筆／0丟棄 | 原click後只按原生Cmd+Home（合計0.1404秒），再5.0035秒不讀AX或操作，仍100ms首錯。但最後原生截圖仍在輸出／QA區，來源不在畫面；沒有rect觀察器，亦沒有追加時間旁聽。**曝光差異未建立，這不是有效viewport負對照，可見性假設未判定**；首錯後不改鍵重試。 |

受控變體 main.js 仍為原 bytes，但旁聽刻意改了 setter 行為，不能標為產品原碼；common observer SHA-256 `35cb98045e71329375951c1f073b433c88252698a0e061f75c5b7e1ec5833768`，variant為`hold-self-rate-one`。原音訊排程、初始 rate／seek、100ms／250ms及片長門檻未變。

上述六個 cohort（原首錯及五個有限診斷／對照）均無 VS 可下載／播放；各案資料保全與資源釋放另核對，並只關自有私人視窗、正常停止自有主機及釋放匹配 nonce 鎖。原首錯 receipt／fixture bytes 未變。

### 本機封存核對

原生素材與收據留在本機 ignored output，沒有公開媒體附件。以下是加入本輪核對收據後的最終 manifest SHA-256；早先 checkpoint不作最終封存hash，所有首錯receipt與fixture bytes維持不變。後續補項使用新版本manifest，不覆寫這些封存。

| Cohort | 最終 manifest SHA-256 |
| --- | --- |
| `private-current-cohort` | `071f687df544854d9c9f6168b59e3a61e13a2ca0a80c05249671ee7e1a47bdef` |
| `private-clock-cohort` | `59429bcd81a5c2be5a69a6c87eacc229e571e136ca0ae90d8bf358477c9b2501` |
| `private-setter-cohort` | `358eab5464b137f55d0848cc78da70ceabeede3ea4ef934463f8c575cfc1cc7b` |
| `private-rate-control-cohort` | `38e41596fc858d8540fb4546b62d68ed62be5fe180c7bc25ca62fbfa85f0f769` |
| `private-observation-control-cohort` | `45e457770092ad83366944db6e053609e1c45d12fb03277d6d18cab5ae1b5ea5` |
| `private-viewport-control-cohort` | `202cbf9019e7648c3806d3f276acf94f7e793029012fe38ab3338776bf3041fc` |

### 尚待完成

#229 仍開啟。下一步先用單變量分辨呈現停滯與觀察效應，充分定位後才改產品。修後仍需相同合成 fixture 的實際下載、離站自然播放／完整全軌解碼及原資料保全回歸；所有 G1–G7引用 [錄影比較](../RECORD_COMPARE.md)，不另訂門檻。#11／#13 的完整矩陣、保存雙 put／未知保存救援、真機與人工聽感仍未由本輪驗收，亦未發布。

文件分支從當時同步 main `26d3f25152335c73e037dd0d75034497fa2e658a` 建立，保留 #194 新證據；這不是原生受測來源。正常 `bun run check` 通過：754 pass／0 fail／4,142 expects，公開掃描、型別、lint與build通過，19項既有lint info保留；建置仍 `83a29a61027b205d`。正常hooks與遠端CI另綁交付head。

## 2026-11-03 #229 解鎖後的實際可見區域對照

白話：兩支影片都在畫面內時，再做一次比較影片，仍然因聲音走在畫面前面而停止。這次沒有做出新成品，但原片與筆記都留下；不能只把失敗歸因於影片捲出畫面，也還沒找到可採用的修正。

使用者明確回覆Mac已解鎖後，另開自有私人Safari視窗、全新測試位置，原日常視窗保留。受測仍為乾淨 `83220edabd90cab274532900763c4ff696dffdc5`／build `83a29a61027b205d`，Safari27.2／macOS27.2；相同兩份合成fixture與A0/B3/C0、1×、offset0、並排／無鏡像及非空筆記基準，產品與原100ms守門不變。後續main `8ef7f009644d2e86460805aedbf9f9bd7bdaf17a` 的原21份產品JS逐byte相同，但此輪不移記為該main重新實測。

新觀察器 SHA-256 `97fbdf8b5b050eaf60b517475863be228a6e5919c3956a84041a1d70214b66cd` 在原正式rAF加入rect／computed style，並記錄原生scroll；沒有改play、BufferSource、Recorder或速率setter行為。原生點按短暫捲到底，真正wheel在暖機play前返回來源；點按＋wheel共175ms，之後5,005ms不讀AX／輸入。兩側原生畫面在匯出前後均可見，正式19筆rAF的兩側rect比率全1、visible／opacity1、focused=true／hidden=false，AudioContext running；114筆clock／0丟棄，exposure亦0丟棄。

唯一首匯出仍被原100ms守門拒絕、0重試。reference停在 `0.587988458` 秒，正式尾段音畫差 `34.224→71.345→106.012ms`；rAF前後觀測span為0–3ms，沒有觀察到整個JS callback停住100ms。`timeline`先檢查音畫差、之後才檢查paused／較長停滯，所以錯誤文字本身不是根因。正式可見幾何不足以避免這次失敗；幾何不等於逐像素遮擋或持續呈現證明，先前短暫離屏、原生管線與觀察效應仍不能全部排除。

原片URL及完整hash、既有資料保留；三筆metadata原生complete、revision3→4為預期配方保存。沒有candidate VS Blob、VS下載、media keys／chunks或保存雙put；故新VS保存／未確認救援仍未驗證。recorder inactive、全部tracks ended、硬體呼叫與頁面錯誤0，自有主機exit0、匹配nonce釋放，只關本輪視窗。

`private-wheel-visible-resumed-cohort` manifest SHA-256 `305fd4a610f477bddae01df97493a3d98300b1993a650d4e32b2fcbf5d85c9b8`，12項（含2合成fixture）的bytes／SHA均經協調者獨立重算相符；匿名summary SHA `64bf3311a3f0defe447d1a561a9bb1287ea8b848b68247ae3bdc189a590bc748`，首錯receipt SHA `99cfcbf7e59c0bb52aaaac73f3fb1fca881981ecf13062358fa53bde7ddf41c7`。原250ms checker仍因前提不同exit1，另沿原保全斷言精確綁100ms作局部核對，沒有改稱原checker全過。raw與影片只留本機；rect讀取、既有wrapper及wheel均可能影響時間，不宣稱無旁聽的原版或唯一根因。

### 同來源、同觀察器的一般Safari首案

白話：在另開的一般視窗，相同影片這次做出了VS，也真的另存並播完；私人視窗的失敗沒有消失。兩輪操作的細微時間仍不同，因此還不能說一定是私人模式造成。

只將目標改為自有全新一般Safari視窗；83220ed／83a29a、兩fixture、配方、非空筆記及觀察器97fb bytes保持相同，不改產品、CSP、play／BufferSource／Recorder／原護欄。唯一首匯出0重試，頁面回「VS影片已成檔並保存在此瀏覽器」；原資料完整保留，僅新增1個VS asset／1 export。revision3→5為配方及VS保存；三筆metadata-only原生complete後，第4筆readwrite真正metadata＋media雙put complete，原片URL／hash不變，recorder inactive／tracks ended，硬體0／頁面錯誤0。

原生click＋wheel230ms，指定5,005ms不讀AX／輸入、實際等待5,010ms；但暖機play發生在最後wheel前，最後wheel在正式play前恢復來源可見，與私人輪的自然操作時序不同。240筆原上限滿後丟703筆，**只有最初43個正式rAF**（reference 0.004013→0.678635秒）記錄兩側rect全1，音畫差1.158–28.080ms、rAF間距15–18ms。此區段涵蓋私人0.587988秒停滯窗口；後段曝光未記錄，前後原生截圖不能補造中間資料。這是模式／新窗／自然操作時序關聯，並非只改模式且所有時間完全相同的因果證明。

真正原生另存WebM **195,938bytes**，SHA-256 `9ee54d18c62668d74a7fa5b0d54223b0f92a97129ee2bf17b6f55fc0f9b87fc2` 與頁內Blob逐byte相同。網站及主機關閉後，沿既有下載播放器以file首播自然ended，time＝duration **3.008秒**、1280×720、97frames、error0、audioBytes71,756，**播放器dropped1**。本機額外包裝的zero-drop assert因此exit1，原helper未改、沒有重播補綠；該包裝未走到FFmpeg，另只補同檔未完成的全軌解碼，exit0／stderr空，VP8 92影格、Opus 1,207音訊frames。精確區分播放完成、額外斷言失敗與解碼通過，不稱全部離站檢查全過；RECORD_COMPARE G3未另訂播放器dropped必0，也不藉此新增關票門檻或代簽整體G1–G7／人耳品質。

下載後QA收尾按鈕出現AX `-10005 elementHasNoFrame`，原工具錯誤保留；以匹配自有nonce／Origin的空POST200正常停主機，再原生File→Close Window關自有視窗。原日常視窗保留，主機exit0、離站播放程序全退出，browserClosed及nonce不存在確認。沒有因收尾工具失敗重做產品匯出。

`ordinary-wheel-control-cohort` manifest SHA-256 `d721e649b0e20c7772b5cc33b6a4b99fa7661291f16bf30939d9aaf8ac9a79a4`；15項含2fixture及真正下載VS的bytes／SHA經協調者獨立重算全符。匿名summary SHA `0320cbfed5124d6173ad30ec6de6865e4437514c9fd992c092cd84f887e70365`。不公開raw、影片、測試位置或視窗ID；本輪沒有產品修正，#229保持open，私人新VS保存／救援仍未驗證。

### 私人視窗固定原匯出按鈕：點按後不捲動仍拒絕

白話：再讓原本的匯出按鈕一開始就在畫面上，點了以後完全不捲動，仍然遇到相同拒絕。這個介面安排沒有解決問題，所以沒有把它放進產品當修正。

同83220ed／83a29a／兩fixture／配方／非空基準／觀察器97fb及240筆上限，新自有私人視窗，只增加同源QA CSS `39216281636a1e4c142fbf903d484f4b541085c94152be70c758e3ae4db85ab3`：把唯一原`#export`元素固定左上、與兩來源不相交；沒有clone、proxy或DOM.click。移除QA注入後的HTML逐byte等於原版，原產品JS／style、module／deferred flags及CSP保持；仍須明列為**UI配置診斷變體**，不是未修改介面的證明。

匯出前trusted checkpoint與原生畫面確認來源全露出；唯一原生點按88ms後，指定5,005ms（實際5,009ms）沒有wheel／shortcut／AX／snapshot／其他輸入。export至buffer.stop間零scroll；唯一後續scroll在保存QA收據時。110rows／0drop、exposure0drop、20筆正式rAF兩來源rect全1，hidden=false／focused=true／context running。reference停0.620573667秒，音畫差36.736→73.426→110.760ms，仍100ms首錯、0重試；沒有VS Blob／下載／雙put。

三筆metadata complete、revision3→4及全部原資料／兩來源URL／hash保持，recorder inactive／tracks ended，硬體與頁面錯誤0。自有視窗關閉、主機exit0、匹配nonce不存在，原日常視窗保留。14項封存（含2fixture）經協調者全部重算相符，manifest SHA `282afdf9a768657028265558bafbb6589e0dda66a441424b38ec0a7cdf5b8e97`，summary SHA `60504edcef4e22e5bffcd5bdfaa02fe07da5fe39c6c859a06c44e889258d650a`。原250ms checker前提拒絕保留、100ms局部保全另記；不宣稱完整品質或私人保存通過。這個案例不需要點按後捲動也能失敗，停止以此UI配置作修正候選，未據此修改Recorder／PCM或放寬守門。

### 私人視窗原公開雙片預覽：完成但不等於匯出

白話：相同私人視窗條件下，先只播放兩支影片，這次能走到片尾；因此接著檢查播放與匯出不同的環節，不能把預覽完成當成比較影片已做好。

同83220ed／83a29a／fixture／配方／非空資料與觀察器97fb，新自有私人視窗；同源QA CSS `6832c2275737b1937f486f63820fbfef0c4595278558eca598b406488ac132ea` 固定唯一原`#play`，沒有proxy／clone或改產品。原生click一次88ms，0重試；指定5,005ms、實際5,012ms無AX／wheel／shortcut／其他輸入。匯出點按數0，原產品診斷精確為 **elapsedMs3,087／observedMaxDriftMs74／maxRenderGapMs28**，status「預覽結束」。完整資料與非空標記、四個retained及兩原片URL／hash保持，revision3→4、三筆metadata-only complete，沒有VS／media keys／雙put／下載，recorders／tracks空，硬體與頁面錯誤0；自有視窗、主機exit0及匹配nonce清理完成。

97fb只對export armed、只由BufferSource設定clock.context，原click清單也不包含play；本輪僅2筆exposure／0drop，沒有formal-clock或DOM play isTrusted收據是原觀察範圍，不補造相位、逐格或全程曝光。原生操作回執及產品診斷保存，前後畫面來源可見；唯一scroll在首結果後QA快照，沒有用前後畫面填補中間觀測。

這是整組階段差異：preview仍用原recipe保存、prepareAudio／align、共同timeline、微rate修正與1秒stall，但沒有export暖機前進／回零／第二次play、PCM解碼／BufferSource／captureStream／Recorder；reference走原聲，額外預覽繪圖不同，export-only100ms／250ms守門亦未執行。完成字樣與74ms診斷只屬這次preview，不證明VS或完整聲畫品質通過；尚不能唯一歸PCM、Recorder或靜音。

13項封存含2fixture經協調者全部重算相符；manifest SHA `e8f1a41df6cbb23b4ce5f01f5b716aff50cfb8b7b16c9519afdf549dce10b96c`，summary SHA `6ff6cf0df65a54a057f428702758279868639d0e99a27616946b23246244bc3f`，原產品diagnostics SHA `e894410083e885bad1e104739cb8bef3d50ccebc73dfd4db3e79ca810c91a95a`。raw留本機，先前匯出首錯不改標；本輪沒有產品修改。

### 完整匯出只保留reference原聲：250ms先拒絕，尚未走到舊停滯點

白話：只在測試副本保留示範片原聲，仍沒做出VS。這次練習片時間反覆接近零，先被另一項同步檢查停止；不是原問題已修好。

同固定原export的私人前提、83220ed基底／83a29a原建置標記、fixture／配方／97fb／QA CSS39216281，僅served `main.js` **原第880行** `reference.muted = true` 改為false。原檔SHA `728ef88512d7402ba5a1e014c70c11312e27742115c05807541ebac6b3e746f2` 與git832逐byte相同，變體 `14b7481b775d15d59ff0edd5a2276e195d6b516e799ca948ae4ab05460753ede` 經協調者逐行核對只有此行；未改repo／dist產品。PCM目的端／BufferSource、capture／真Recorder、暖機回零／第二play、微rate／100ms／250ms／片長仍原樣。這是受控runtime變體，83a29a只識別基底，不能稱served產品全bytes原樣。97fb未另觀察muted getter或人工實聽，聲音配置由精確served差異及實際路徑確認，不改系統音量。

唯一原生click86ms後指定5,005ms（實際5,009ms）無輸入，0重試；91rows／0drop、15正式rAF來源全rect1，context running、正式區間無scroll。音畫相位36.959–39.391ms，但最後reference0.514963375秒／self0.000002003秒，原生微速率setter未忽略且self反覆近零。原250ms守門在500ms後先拒絕，尚未到較早私人約0.62秒停滯窗口，不能宣稱避免後續100ms。原250ms checker不改即可exit0僅證明該守門／保全適用，並非VS成功或靜音唯一因果。

全部舊資料與兩來源URL／hash保持，revision3→4／三metadata complete，無VS Blob／下載／雙put，硬體0／頁錯0，recorder inactive／tracks ended。自有視窗關閉、主機exit0與nonce釋放。16項封存含2fixture全部bytes／SHA經協調者重算相符，manifest SHA `955af0e18eb46176965db4fed6e81f27a1da43c6e9002049a05d2e717907a23f`，summary SHA `0baf8eca2a4c4fcf1f2f6fcdd9900d40adfc7fcc2915b33eb629b5434eb32068`。沒有正式取消靜音的產品修正；可聽行為變化也需另評估。

### 原聲再搭配既有原速控制：仍250ms，不能稱所有setter都被阻止

白話：再把已做過的原速控制加在這個測試副本，仍沒做出VS。這次練習片先正常前進、之後停住；不把兩個測試變化合在一起就當成修正。

同上一案served main14b748／97fb／固定原export CSS39216281與其他條件，只啟用97fb既有`hold-self-rate-one`配置。首匯出前實際config與native baseline均核對生效，observer bytes未改。這個旗標僅於BufferSource開始後忽略self的非1速率寫入，**仍轉交value===1**；不是原產品或全部setter停止的證明，也不把不同觀測版本／操作條件的舊案硬算成嚴格因果矩陣。

唯一首匯出0重試、原生click89ms後指定5,005ms（實際5,009ms）無任何輸入；144rows／0drop、27正式rAF兩來源全rect1、正式區間無scroll。81768 buffer.start→82770 stop間27筆rate before/after逐pair核對：26非1請求ignored，1筆1→1於81820真正轉交native setter，getter after均1。初始rate設定及stop後restore另列，不混進formal統計。

self最初與reference約差0.24ms，後停0.693125333秒；reference繼續至0.948687333秒，差255.562ms觸發原250ms，PCM／reference相位42.407–44.793ms。原生self正式首rVFC在buffer.start約819ms後才回mediaTime0.033333，後至0.233333；這與`currentTime`估計不同，不能把時鐘前進當成像素已正確播放，也沒有完整成品證據。沒有VS Blob／下載／雙put，舊資料及原片URL／hash保持、revision3→4／三metadata complete，硬體0／頁錯0，recorder inactive／tracks ended；自有視窗、主機exit0及匹配nonce清理完成。

18項封存含2fixture全部bytes／SHA經協調者重算相符，manifest SHA `683ea3e6c727f3128f1b4dfdc8b213e08e4b699c0dc513679d25871c1e742e28`，summary SHA `54cf370b9ca947f2266b15516be6e2d2dfa669082b70cf20f12fc4248e525d86`，逐筆formal-rate ledger獨立保留。原250ms checker不改exit0仍僅屬guard／保全；沒有解除100ms或成功匯出的結論，這個組合也不是可採用產品修正。接手須先重新核對warmup→seek回起點→正式play的呈現邊界，勿繼續疊未證實的靜音／速率補丁；原100ms／250ms與首尾／取消保全契約維持。

本輪證據交接分支從同步main `8ef7f009644d2e86460805aedbf9f9bd7bdaf17a` 建立，僅修改本文件與既有結案盤點，沒有產品／測試修改。正常 `bun run check` **760 pass／0 fail／4,384 expects**，公開掃描、型別、lint／build通過，原19項lint info及靜態 `07cdd7b66289af39` 保持；提交仍走正常hook，遠端結果另綁交付head。本段是文件檢查，不把上述受控失敗或一般案額外wrapper失敗改標成功。

## 2026-11-03 #229 準備階段與擷取方式的後續對照

白話：多等一張暖機畫面、改用自動擷取，都沒有做出比較影片；只把預覽靜音，則仍能播到片尾。這些結果幫助縮小排查範圍，還沒有找到可放進產品的修正。原片與筆記保留，失敗不改寫成通過。

以下各用新自有私人Safari視窗、原83220ed／83a29a基底、同兩份三秒合成素材、A0/B3/C0／1×／offset0／並排無鏡像及非空資料基準。每案只做第一次操作，0重試；原日常視窗及Safari設定不變。served變體與QA樣式只屬本機診斷，沒有改repo產品／測試。原100ms／250ms／片長守門均保留；各列是不同流程，不能把較早250ms拒絕當成已避開後段100ms問題。

| 有界控制 | 實際結果與適用限制 |
| --- | --- |
| 每側暖機等兩個嚴格遞增的真rVFC時間 | 兩側確實由0.033333→0.066667秒，沿原每側單次15秒期限，回零及正式播放保持；112rows／0drop、20正式rAF兩側rect全1、無正式scroll。reference仍停0.632225875秒，音畫差35.882→72.441→109.774ms，原100ms拒絕。增加暖機影格不足以修好，沒有繼續疊等待影格數。 |
| 原公開preview只增加reference.muted=true | 原生一次播放後5,005ms無輸入，原產品diagnostics為elapsed3,062ms／最大雙側差57ms／最大render gap36ms，狀態預覽結束。原生畫面顯示兩側可取消靜音；單純靜音在本次preview不足以重現停滯。沒有PCM／擷取／Recorder／VS，原observer只對export armed，不能補造formal-clock／全程曝光或當作輸出驗收。 |
| 原manual capture改為原生captureStream(30)，同時不呼叫手動requestFrame | 保留原回零／首張前進暖機、靜音／微速率、PCM／真Recorder及繪圖預算；91rows／0drop、15正式rAF兩側rect全1、無正式scroll。reference0.519136875／self0.000002003秒，原250ms先拒絕，所觀測PCM／reference相位32.018–33.983ms。沒有Blob或成品，不能證明30fps或舊100ms已避免。 |

第三案served main僅把timeline的captureFrame參數改為undefined（沿既有空callback），以及主captureStream(0)改成30，避免同時自動與手動擷取；原能力檢查及fallback原樣。由原97fb衍生的observer只在結果後既有snapshot tracks map增加唯讀`typeof t.requestFrame`，正式callback／arm／240筆上限不改。baseline tracks空；結果後影片軌ended且requestFrameType=function，音軌ended／undefined；沒有假造方法缺失或聲稱fallback觸發，30只是要求值。此能力讀取不是編碼影格證據。

| 控制 | served main SHA-256 | manifest SHA-256（entry數） | summary SHA-256 |
| --- | --- | --- | --- |
| 兩張前進暖機 | `6366f2920fba6ad4f44257b0841b1892d3007ce640aeeb5016ac9dec9ac6fa5e` | `5c572937e36478fd9a37567d59d97bac15c8960b6c4c2af17e26344d6d6a0688`（21） | `6859d8ecec8ed8af1e22f874f1e8310237349e0bd78119ee26b62048ca5d09db` |
| 靜音preview | `8398f3d20a3193d5f820c982d63fd319fe795fa19c4c46644d6a5863bd0da301` | `81688513505d9d4738c60c5a587e0edd274b678d784acb9000998b22dd19f3f3`（20） | `35ebced8456dd0744f3f1feac2e4e366a719defb0bfbafeec075d5cb77c4eb17` |
| auto30 | `402b02731103740714469cd052a6655ac49ec7504d226cd4bdae0d565442845c` | `67a8b1ffc5a394c088c5a77435d168d3d8cdf827500c51071b10dc71713f22c2`（23） | `7847fc1db5da7f3331d68bde44b9884e5fa2d9e04584b92c8c17d9d72accdbe2` |

原main SHA仍728ef885；前兩案observer97fb，auto30衍生observer SHA `afa491734bfeb3fb0a752fdc84a4d88a24612f073bfb5772a92a9d61d43b787a`。匯出沿固定原按鈕CSS39216281，preview沿CSS6832c227；完整原hash及來源限制見上一節。64項manifest entry（含各案兩素材）由協調者全部重算bytes／SHA相符。靜音preview在首結果後、auto30在匯出前的QA收據另存曾有工具app-change警告，以重新讀取同自有視窗後的新索引完成；沒有重播／重匯出，測量區間未插入操作。auto30 preflight檢查曾誤替換fallback再反向比對，當時未開原生case／未寫變體；修正QA檢查後實際GET核對才執行，準備錯誤原封保留。

三案舊資料／筆記／配方、retained及兩原片URL／完整hash保持，revision3→4、三筆metadata-only原生complete；沒有VS Blob／下載／media雙put。輸出案recorder inactive／tracks ended，preview資源清單空；硬體呼叫與頁面錯誤0。自有視窗關閉、主機exit0及匹配nonce釋放均完成，raw／素材／本機識別只留本機。兩張暖機案原250ms checker因前提不同仍exit1、100ms局部保全另列；auto30原250ms checker不改exit0仍只證明該guard／保全，preview不套匯出checker。沒有完整G1–G7、私人VS保存／救援或發布結論，#229仍開啟。

### 單次啟播變體：準備完成，尚未執行匯出

白話：另一個測試副本準備比較「不先播放再倒回，而是正式播放一次」，但畫面操作的前提變得不確定，因此沒有按匯出；這不是新的產品成功或失敗。

served main `1ec122320d014b31443ffda270179618e9b5981680ffe926b66ac40cbe03c0e0` 僅替換原timeline443–447：preview原第一組play保持，export略過前進暖機／第一組play／內層回零；原outer align、abort→startOutput→abort→唯一正式bothplay與其他產品碼逐byte不變。這明確移除了export-ready呈現屏障及該處15秒等待，首張Canvas可能尚未準備，不能稱等價取消／初格契約或可採用修正。既有export-ready暖機Stop／兩次拒播及local-audio-clock第2play故障的前置也不同，不沿用舊綠燈。preflight manifest `f9f7e2d6a86caa9329f74573ccb1cd5017a9eac79831a88e97d0ce27ab70dd0f` 九項含兩素材經root全部重算，第二路只讀核對唯一差異，原observer97fb／CSS392及無hold配置保持。

本案實際GET已核對，非空metadata基準及兩素材載入、匯出前收據保存完成，**0 export／0 play**；trusted可見checkpoint尚未完成，沒有完整曝光前提。前置多次出現工具app-change警告，並觀察到原測試視窗新增來源不明分頁，不能宣稱全程獨占視窗；未切換／讀取／關閉未知分頁。協調者已詢問是否有其他Safari操作，沒有把等待回覆當作原生測試。暫停新畫面輸入，僅以匹配自有nonce正常停止主機（POST200／exit0、程序退出／鎖不存在），保留分頁，待確認操作前提後才決定如何續驗；不從此案推論任何同步／成品結果，也沒有重建case挑成功。最終19項manifest `6a9378037d668fc5129005ef3e5e2cf5fd649589b14113080980114bde155d9f` 由root全部重算相符，summary SHA `fbb1ef31ee3bdc5d37c6757659e554a097d54798c15ac9c2f7fdce72a68da0cd`；本機check只在沒有播放／匯出的前置期執行，未與原生計時媒體重疊。

本文件分支從同步main `ff83c11c2f2a835b31afb4dd80a71353e54b6d93` 建立，沒有產品／測試／格式／CSP變更。首次本機check因子命令取得Bun1.4.2而在版本前置停止；固定PATH後的受限環境又有6個loopback listen失敗（754 pass／6 fail），沒有改測試。在固定Bun1.4.4、可建立本機連線的環境重跑原完整check，760 pass／0 fail／4,384 expects，公開掃描、型別、lint／build通過，原19項info與靜態07cdd7b66289af39保持。正常hook及遠端CI另綁最後提交；上述環境失敗及原生前置停止不改記為產品已修好。

## 2026-11-03 恢復畫面操作後：單次啟播與無效的雙側原聲對照

白話：使用者確認現在能繼續操作Safari後，先前只準備好的「正式播放一次」測試真正執行了，仍因兩片錯位而停止。另一輪在準備時誤觸匯出，沒有完成原定檢查，因此保留失誤、不拿來判斷原因。原片與筆記都有保留，尚無可放進產品的修正。

受測仍固定乾淨 `83220edabd90cab274532900763c4ff696dffdc5`／基底build `83a29a61027b205d`，Safari27.2（22625.2.8.11.9）／macOS27.2（26B123），新自有私人視窗及新origin；沿前節相同三秒雙片、配方及固定原匯出按鈕CSS39216281。這不是當前main `acea4b9d52ad1b7aaa7db2ba1e5b8c070a567b74` 的原生驗收：六份核心JS與原style逐byte相同，但HTML已增加節拍器連結，另有新頁面檔案，不能稱整包相同。未改設定、音量、原門檻或真人資料，無相機／麥克風。

### 單次啟播真正執行：仍被原250ms拒絕

沿前節 `1ec12232` 變體、原observer97fb及非hold配置，實際GET核對固定資源後只按一次原生匯出，0重試。trusted曝光checkpoint在匯出前，15筆正式rAF雙來源rect均1、focused=true／hidden=false／AudioContext running，正式期無scroll；79rows／0drop。click123ms，指定5,005ms靜默等待，首次AX實際在click完成12,890ms後呼叫；不把要求等待當作實際五秒觀察。兩側各一次正式play-call皆在`BufferSource.start()`呼叫後，當時尚未到排程音訊起點，沒有暖機play。

reference到0.523182958秒、self近0，原250ms守門拒絕，PCM／reference相位26.817–29.110ms。首個非1速率寫入後的後續樣本self近0，但時間先後不是唯一根因證明；15筆正式rate寫入全部轉交，包括1筆同值1。僅一筆正式self rVFC回mediaTime0，不代表像素已正確跟上。未到舊reference約0.63秒停滯窗，不能說100ms問題已避免。移除暖機／回零不足以修好，且移除了原export-ready屏障，仍不可採為產品修正。

沒有VS Blob／下載／media雙put；原完整data、retained、原片URL及hash相同，revision3→4、三筆metadata-only原生complete。原250ms checker exit0只支持guard／保全；recorder inactive、tracks ended、硬體0／頁錯0，自有視窗／主機exit0／匹配nonce均收尾，舊及未知分頁保留。28項manifest含兩素材由協調者全部重算相符：manifest `f1ede1d1e571c329e787e52eff40342d3eeb93c454fd7bba6d00288043401f7e`，summary `b0cc8e2a93ec92b3827e5ffa46afddc103495751561799c7bf5b6368daf4ff0f`。

### 雙側原聲準備時誤觸：程序無效，不列因果對照

此served變體 `1d1230e961e628bae9878fbf8e7b3bb35c1f49dd8fede879eb189063cbc93498` 相對原聲C（14b7481b）只多改self.muted=false及原因註解；相對stock則兩側mute值皆不同。原暖機／回零／兩次play、PCM、manual0／Recorder、微調與100／250ms／片長守門全部保留。衍生observer `0d6c52577da5372ff42d6f2225f004da14c904b15ec6b359d16472199902192d` 僅在既有snapshot多讀兩側muted／volume四值；正式callback、clock／240上限及未知保存保護均未改，反向可完整還原97fb。快照不代表全程可聽或人工聽感。

操作工具的截圖像素被誤當原生點按座標，準備取得焦點時誤中原export。唯一trusted匯出後144ms才做checkpoint、161ms後scroll，38筆正式rAF兩來源rect全部0；184rows／0drop，指定5,005ms靜默流程未執行。`procedureValid=false`：匯出後的rect1不能補作匯出前提，這輪不判斷雙側原聲是否消除失敗。原250ms拒絕時reference1.376915秒／self近0，也不能以超過舊窗口就宣稱100ms已解。

無VS／下載／雙put；完整舊資料、retained與原片URL／hash保持，revision3→4、三metadata complete；原250ms checker exit0仍只支持guard／保全，原checker的`--help`工具誤用exit1亦保留。資源inactive／ended、硬體0／頁錯0，自有主機與匹配nonce正常停止，只關本輪自有分頁。隱私提示未點降低保護或重新載入；未改Safari設定。31項manifest含兩素材由協調者及獨立審查者全數重算相符：manifest `acde1957770947cf924ee22e5a62ae3344c1afb70111472b7536b320ada5d90a`，summary `b98fa55778d4c35f950ec7b72aad09db9d2dc465d50227edde01aee2ce142de2`。

下一次須使用新cohort並明列「QA操作方法修正」，保存本次失誤。原生AX按鈕名稱／fresh index代替手填座標；所有收據保存、回到頁面及捲動先完成，最後trusted checkpoint確認雙rect1，再用fresh AX唯一原匯出按鈕點按，接著獨立靜默階段並分記實際時間。前提不符即停止，不以同輪重試挑成功。上述靜態色條／連續音素材沒有影格碼或閃光／提示音配對，不能量首中尾G2、動態停格或完整G1–G7；#229／#13仍開啟，raw與素材只留本機。

### 修正操作方法後的獨立新案：仍未建立全程曝光

白話：改用按鈕名稱能避免誤按，但Safari接著把頁面捲到下面，來源畫面又不在可見範圍；這仍不是合格的原因對照，因此停止追加，不挑一輪成功蓋過失敗。

全新cohort保持上一案main1d1230／observer0d6c／CSS392及兩素材逐byte相同，實際34個GET核對相符。所有保存先完成，以原skip-link取得頁面焦點；最後trusted checkpoint雙rect1，同call fresh AX確認唯一原匯出並原生index click，93ms後獨立指定5,005ms靜默（工具回報5,008.6ms），首次AX實際於click完成13,858ms後呼叫，期間無AX／輸入／wheel／快捷鍵。

原始事件排序卻是checkpoint69,889→scroll69,891（雙rect0）→scroll70,320→trusted export-click70,409→scroll70,437→BufferSource70,705；第一scroll在checkpoint後2ms、匯出click前518ms。不能以先完成checkpoint就推定點按時或播放時仍可見，也未從這個順序判定AX、點按、keydown或狀態更新的唯一捲動機制。38筆正式rAF兩側全部rect0，187rows／0drop；`operationOrderComplied=true`，但`procedureValid=false`。兩次不同操作缺陷各自保留，沒有完成有效雙側原聲控制。

原250ms拒絕時reference1.366555秒／self近0，PCM／reference相位34.844–37.158ms。無VS／下載／雙put；完整data、retained、原片URL／hash保持，revision3→4／三metadata-only complete。原250ms checker exit0僅支持守門／保全，recorder inactive／tracks ended、硬體0／頁錯0；自有主機exit0／origin拒絕／匹配nonce釋放，只關本輪自有分頁。新視窗起始頁已有跨站追蹤防護關閉訊息，沒有按開啟或改設定；先前設定未留指紋，不宣稱中斷前後環境完全相同。30項manifest含兩素材經協調者全部重算相符：manifest `b7696220f5f0d022c0948d4c4af6b8b638bc2e13d5ba9c1e0fd538f52bb0c144`，summary `bfc99ef75edc3162c9a3986a0caae904ca6badf055e817e3b674af6ded943a23`。

### 下一步的來源線索與邊界

先解決QA曝光前提，再選單一可分辨控制，不直接採用上述任何變體。固定公開WebKit提交 `49e831c38e05d4099861ea284b017a4a5603ad38` 的[速率設定](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/html/HTMLMediaElement.cpp#L4471)在requested-rate相等判斷前仍轉交native；故舊hold控制保留的同值1寫入不能假定無作用。[音高選擇器](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/platform/audio/cocoa/MediaSessionManagerCocoa.mm#L250)在不保持音高、0或1×時選Varispeed，其他速率按設定選Spectral／TimeDomain；[AVFoundation速率路徑](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/platform/graphics/avfoundation/objc/MediaPlayerPrivateAVFoundationObjC.mm#L1716)會先指定音高演算法再設速率。產品align只將reference.preservesPitch=false，沒有設定self；self首個非1微調與之後近0讀值可作新候選線索，但舊raw未讀self音高getter，這份公開來源亦未對應本機Safari binary。

可評估回原mute／暖機／PCM／manual0／微速率流程、只在play前讓self保持自然變調的單變量診斷；目前僅只讀審查，尚未準備或執行，更不是已採用修正。它不能單獨解釋已自然變調的reference約0.63秒停滯，或D案沒有非1微調仍後期plateau；舊27.0.1 reference音高回跳亦不能代簽27.2 self根因。不刪速率修正、不補固定延遲、不換codec或放寬守門。公開[可聽性路徑](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/platform/graphics/avfoundation/objc/MediaPlayerPrivateAVFoundationObjC.mm#L2334)也把volume0視為不可聽，故不能把音量歸零當作原聲開啟的安靜等價控制；沒有新增聲路或產品依賴。

本次兩份文件交接從同步main acea4b9建立，原生全部收尾後才執行正常`bun run check`：Bun1.4.4、760 pass／0 fail／4,385 expects，公開掃描、型別、lint／build通過，原19項lint info與靜態07cdd7b66289af39保持。獨立來源／收據審查已修正「BufferSource開始」為實際start()呼叫與未到排程起點；正常提交hook及遠端CI另綁交付head，不把文件檢查當原生產品通過。

## 2026-11-03 固定來源版面的基準與設定對照

白話：原生點按會把頁面捲走，因此這次只在測試版面把原有兩支影片也固定在畫面內，先重新測原版。兩片確實都可見，但原版、只改右片音高、暫停轉交右片速度設定，以及讓兩片播放原聲，都沒有做出VS；這些設定尚不能放進產品。每案只做第一次匯出，失敗、原片與筆記都保留。

四案均固定原83220ed／83a29a基底、Safari27.2／macOS27.2、相同三秒合成素材與配方，以新自有私人視窗／origin執行，不冒稱本輪交接基線main `cba924ef2893d0809b4f68eda6eb0e0a5ac8aa2d` 已原生受測。QA CSS `0acf3c350902ceaa6eb459dc13df3b0dc4c01c5b31246eb81397c57b9a5486ea` 保留原export392定位，再將原reference／self固定為436×300、top160、left416.5／904.5；沒有新增播放器或代理按鈕。文件仍自動捲動，以下正式樣本在1774×882視窗內雙rect均1、visible／opacity1、focused=true／hidden=false／AudioContext running。這改變normal flow、繪圖及合成層，只建立這個QA版面的對照，不是原介面或與舊C的嚴格2×2比較，幾何亦不等於逐像素遮擋證明。

共用QA HTML SHA `78e228c28e675e0e09712498bc382ee31cacc23bb4ab1d718c012fe98c4a858a` 只在原HTML加同源CSS／observer，原CSP與模組不變。前兩案observer `64a022760f8f72feee3eaf1d462c918a0c65c0c670488d6ec9042f53b937dde1` 相對97fb僅在既有snapshot增加兩側muted／volume／preservesPitch六個唯讀getter及why，反向可完整還原；正式callbacks／240筆上限與未知保存保護不變。初始快照實量self preservesPitch=true；快照不是正式全程音高或本機演算法測量。

| 首次0重試控制 | 正式收據與首結果 | 能支持的結論 |
| --- | --- | --- |
| stock main728ef885逐byte等git832 | 114rows／0drop，20正式rAF雙rect1；reference0.624402542／self近0，PCM相位29.221–104.264ms，原100ms拒絕 | 固定來源幾何不足以修好；仍重現首個非1微速率寫入後下一樣本self近0。 |
| main `d537fb0cab5041d4ac4026aab3fde49b59fc51f1dc7eace0602eadc71b27b3c4` 僅在align原reference設定旁加self.preservesPitch=false與why | 94rows／0drop，15正式rAF雙rect1；reference0.515458875／self0.042928375，PCM相位29.208–31.845ms，原250ms拒絕 | self快照true→false，但首非1後下一樣本仍近0，之後才回0.042928並停住；不稱回零已避免。較早拒絕、未到基準100ms窗口，不是改善或100ms修復。 |
| stock main728，明示抑制全部BufferSource期間self速度setter | 121rows／0drop，22正式rAF雙rect1；21次請求全ignored（同值1一筆、非1二十筆），實際getter均1。reference0.714827833／self0.750813958，相位27.854–101.839ms，原100ms拒絕 | 本輪self未早期回近0，但完整抑制仍未成檔；不能直接刪除產品漂移修正，亦非唯一根因證明。 |
| main1d1230僅兩側mute=false，原微速率全部轉交 | 179rows／0drop，36正式rAF雙rect1；36次self速度請求均原生forward（同值1一筆、非1三十五筆），ignored0。reference1.290162375／self近0，相位37.561–40.048ms，原250ms拒絕 | reference在這一案越過基準0.624秒窗口，仍因self偏差拒絕且無VS；不稱100ms已修、同步改善或唯一可聽性根因。 |

第三案observer `07f6d3e70b3dc70a126f3aa357907fc11fcfe96ddfa4ea0424c1a716d5f77909` 相對64a僅將明示flag改為`hold-all-self-rate-writes`、刪除原`value!==1`例外及改why註解，反向全文相同。原微速率計算、100／250ms／片長守門、暖機／回零兩次play、manual0擷取、PCM／真Recorder全保留；這是行為抑制，不是純旁聽或產品修正。生命週期仍為原wrapper先設定startedAt再轉交native start，至buffer.stop wrapper設定ended；不是實際音訊起點或成功start證明。成功路徑pause後但buffer.stop前的同值1尾段也可能被抑制；本次錯誤路徑實際尾段self及stop後self寫入皆0筆，不稱測過。開始前兩側各一筆1原生forward，stop後只觀察到reference一筆1 forward；每次requested／previous／getter／ignored及row-order ledger完整保留。舊D僅抑制非1，與本案分開。

第四案全文為前節已核 `1d1230`，observer回到相同64a、config明示NONHOLD；沒有疊07f6、自然變調或其他變體。直接比較本節stock基準38項封存，不把全抑制案或前兩次曝光失敗當作直接negative control。這是兩個mute值的可聽性介入包，不是只改self一值；before ref false／self true、結果both false，兩volume均1／音高快照true，編碼聲路仍只取原reference PCM。沒有新聲路或音量／系統設定改動，亦不以快照證明正式全程可聽或演算法選擇。

四案原生click分別115／106／99／126ms，均在事前trusted checkpoint後只按一次原export；之後獨立要求5,005ms無輸入，工具實際等待5,009.4／5,010.2／5,009.8／5,009.7ms，首AX距click完成實際為14,848／18,572／13,010／15,101ms。期間無AX／其他輸入，不把指定等待當作實際五秒觀察，也不延長任何產品期限。基準前置曾因舊helper閉包與不可能成立的sheet UUID斷言停止，均在0export／0clock時；核對本cohort頁面與自己剛開的原生panel歸屬後修正helper，原錯誤保存，不算產品失敗或匯出重試。後三案沒有工具錯誤。

| 控制 | 最終manifest SHA-256（entry數） | summary SHA-256 |
| --- | --- | --- |
| 新版面stock基準 | `27a5f07cbfeca3f54e8a389f5275d0600e15aa2fb1cbe91c25d10a15203b52b4`（38） | `d324b291751b00cca7def8e3928aa40e3252c58186fbe576463e7e10fc11d34d` |
| self自然變調 | `48a95b24e262f0e914fdbd028da9abf989f4c6ee5960ce4cadab7ed984fa9fb6`（36） | `9ee327edefee68259298ebee1f69aa0b020a0379ea62e8f9290a991319782508` |
| 全部self速度寫入抑制 | `a5e45f2885a06143604f1a962674beee218058c3dba60e2cd9bd49fc592ef5f6`（40） | `a25bd8daf669d5c781baf2074c77cf26916cc81bbd938fdd27712a6012e5e555` |
| 雙側原聲、原微速率 | `0e7a6380d86db55f3a37f2d08195d8b19402ff3d1eef5d171040bc72f8c1cb4c`（37） | `d9589f1e324ca8e66708cd95dbee638ebb16113669203f3961d9d012e716bff5` |

151項entry含各案兩素材，協調者及獨立審查者逐一重算bytes／SHA相符。每案實際34個GET核對原白名單與QA資源：31個原路徑含已修改root，加observer／CSS／config三路；若分列四件QA產物，root是重疊項，不能聲稱35個獨立GET。四案完整data、retained、原片URL／完整hash保持，revision3→4／三metadata-only原生complete；無VS Blob／下載／media雙put／keys／chunks，硬體呼叫與頁錯0、Recorder inactive／tracks ended。自有視窗／主機exit0／origin拒絕／匹配nonce釋放均收尾，舊及未知分頁、Safari設定與音量保留；raw及素材只留本機。

原250ms checker在基準與全抑制案皆因status前提不同exit1，原錯誤保留；只改status字串精確綁100ms的局部保全copy另exit0，其餘斷言不變。自然變調與雙側原聲案原250ms checker未改exit0；四者都不代表同步品質或私人新VS保存／救援。固定色條與連續音仍不能量首中尾G2／動態停格或完整G1–G7；rVFC metadata／currentTime亦不能代替成品像素。

### 補足組合缺格：仍100ms，超出紀錄上限後的首錯時間未知

白話：兩個設定一起試，仍沒有成品。像筆記本寫滿後就沒再記，不能拿最後一行當作最後發生的事；失敗文案與資料保全有收據，尾段時鐘則維持未驗證。

最後組合保持有效雙側原聲案的main1d／CSS0acf／HTML78e／素材，只換已核observer07及精確`hold-all-self-rate-writes`配置；直接對照前述雙側原聲37項，全抑制40項僅輔助比較可聽性介入包。原微速率仍計算，100／250ms／片長守門與其他流程不改，沒有新增音路、自然變調或其他旗標。這是在已各自測過的兩因素補一個有界組合，不是嚴格自然時序2×2、兩個唯一根因或可採產品修正。

唯一trusted原export click82ms，指定5,005ms靜默（實際5,009.7ms），首AX於click完成17,921ms後，期間無AX／其他輸入。首結果原100ms拒絕、無VS。clock到原240筆上限、28dropped／exposureDropped0；53筆已記正式rAF雙rect1、focused／visible／context running，已記PCM相位35.333–38.104ms。最後已記rAF reference1.898757250／self1.898744542秒；buffer.stop、首100ms當時時鐘與尾段restore已超cap，**不能用約1.899秒或38ms當作首錯位置／相位**。全程曝光與完整gate ledger未驗證，沒有提高cap、補測或由結果畫面補造尾段。

已記gate內53次self速度請求全ignored（同值1一筆／非1五十二筆），實際getter均1，開始前兩側各一筆1原生forward；cap後尾段／stop後實際請求皆未知，不能寫成0或已測。原250ms checker因status前提exit1保留，only-status100ms局部保全copy另exit0。完整data、retained與原片URL／hash保持、revision3→4／三metadata-only complete，無VS／雙put／keys／chunks、硬體與頁錯0，post-result Recorder inactive／tracks ended；自有主機exit0／origin拒絕／nonce釋放，只關本案自有分頁，舊及未知分頁不動。

43項manifest含素材由協調者全部重算bytes／SHA相符：manifest `8be1d0e36f7c9d7028240810f3a1fe44770d748ec67a552cb0e08264980d3d94`，summary `fa8e09fac67e04e0854e803857eb3f37ec14f004f898d3a61e37db44463ed5be`。開主機前兩個舊文件glob未匹配exit1，以及收尾組裝manifest時bytes helper的AttributeError皆保存；後者發生raw／summary寫妥之後、manifest產生之前，只修正封存組裝，沒有改原收據、重啟測量或變更產品結果。仍無成品可下載／解碼，也沒有#229／#13結案或發布結論。

### 單筆首錯收據：新案在約2.009秒超過100ms

白話：不加大筆記本，只在原本已判定失敗的那一刻多留一張小紙條。這次知道影片走到約2.009秒時，聲音時鐘已到2.118秒，差約108.6ms；不是影片做完了，也還沒有找出可採用修正。這張紙條只屬於新的一次，不能替前一案填空。

新自有私人cohort維持上述組合、CSS0acf／HTML78e／素材／配方／精確allhold配置；served main `d73707ad0a2f558b348c0ba45db5cfdfd07c10912971f1d0a4c4003d8c5cfd56` 相對1d只把原100ms條件展成block，條件完全相同且已求值true後，才try保存原判定用elapsedMs／audioElapsedMs／durationMs等12個固定scalar。八個數值依number|string保存非有限值，避免JSON將Infinity悄轉null；catch僅留固定qaRecordError，連診斷寫入再失敗也由finally執行原finish／原錯誤文案。沒有新AudioClock、callback、timer、rAF、listener、停止策略、門檻或補償。

observer `3200214a7c13edea399168aa51a947db831fc713e24aee94dcb2ca30718f61ef` 相對07僅在既有snapshot複製這個小收據及why；兩檔反向可全文還原1d／07，原240cap、allhold及未知保存保護不變。前置18項封存兩路核對後才開始；這是新QA原始碼hash，不能仍稱原1d／07逐byte相同，也不能拿這次的後置記錄回推前一案。診斷成本與自然時序差明列，不是重試挑成功或產品修正。

唯一首匯出仍原100ms拒絕、無VS。before小收據為null；原決定用elapsedMs＝2009.3952083261684、audioElapsedMs＝2118、durationMs＝3000、rate＝1、兩來源起點0；兩者差108.60479167383164ms。其餘讀值為self.currentTime＝1.971334250003565秒、兩側ended／paused四旗標全false；八數值本案皆finite number、無qaRecordError。at＝74014是判定後performance.now，self時間與旗標亦是判定後非原子快照，不是硬體PTS或全程像素證據；非有限值與診斷失敗fallback本次未實際觸發。

clock仍240筆／27dropped，53已記正式rAF雙rect1；已記53次self setter全held（同值1一筆／非1五十二筆）、getter均1，初始兩筆forward。最後clock at73831至小收據相差183ms，中間時鐘／末段曝光、buffer.stop與完整尾段ledger仍未驗，不能由這一張收據補回。原生click112ms，指定5,005ms靜默（實際5,009.3ms），首AX距click完成14,373ms，期間無AX／其他輸入，0重試／工具錯誤；實際34個GET精確核對新main／observer與其他固定資源。

原250ms checker前提exit1保留，only-status100ms局部保全copy另exit0；完整data、retained與原片URL／hash保持、revision3→4／三metadata-only complete，無VS／雙put／keys／chunks／硬體／頁錯，Recorder inactive／tracks ended；自有主機exit0／origin拒絕／nonce釋放，只關新自有分頁，舊及未知分頁、音量與設定不動。42項manifest含素材由協調者全數重算bytes／SHA相符：manifest `00e34d785587705a2cd175b687de2d46e9041214eee978edb9f40f20e35b40ff`，summary `f3b5ad1ea204af9ad111830029c7dba1d4af0edcf279f728311741dbd9dbabf8`，獨立first100-decision SHA `b224cf4cba3d08e9a1ef98d0cd5cf4edd21923812f260605bd3b80d4bcebab89`。舊43項及其封存工具錯誤原hash保持；raw、合成素材與本機識別不公開。

本次只補原守門的失敗輸入與位置；不能從108.6ms、缺callback或靜態圖樣判定編碼器、音高、可聽性或速率API的唯一根因。下一步回查此精確局部值所對應的來源時鐘與原生播放邊界，尚未選定新的產品修正；不放寬原門檻、不補固定延遲、不裁片，成品品質與私人VS保存／救援仍各自未驗。

本分支僅更新既有兩份交接文件，未改產品／測試／格式／CSP。首錯觀測前、無原生播放時的正常`bun run check`為Bun1.4.4、760 pass／0 fail／4,385 expects，公開掃描／型別／lint／build通過，原19項info與build07cdd7b66289af39保持；其退出後才做最後觀測，全部原生收尾後才走正常提交hook。兩路獨立來源／收據審查與六案236項封存分開，hook及遠端CI另綁最終head；基線main cba自己的push CI41573086864 attempt1五項全成功，也只屬該文件版本工程檢查，不能代簽上述失敗案或新版本原生品質。

### 移除連續時鐘探針的原流程控制：仍在100ms守門停止

白話：量測工具本身也可能影響影片，所以這次拿掉一直讀時間、速度和影格的探針，只在原本已判定失敗後留一張收據。仍沒有成品，原片與筆記都有保留；拿掉這批探針不足以解決這一次失敗，不能因此說已找到原因或產品已修好。

先回查固定公開[WebKit來源49e831c](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/platform/graphics/avfoundation/objc/MediaPlayerPrivateAVFoundationObjC.mm#L1585)：`currentTime()`可能以快取時間加牆鐘差推算；rate設定會使快取失效，下一次讀值可能回到AVPlayerItem時間。同值rate也可能轉交原生。因此setter後getter近0不等於畫面像素倒退；全部抑制setter後getter平順也不證明解碼前進。這是公開原碼的可能機制，未對應本機Safari binary、實際快取狀態或證明唯一根因，不據此採補丁。

本新案仍固定83220ed／83a29a、Safari27.2／macOS27.2與同三秒合成素材／配方、CSS0acf／HTML78e。main `3870cfbd3de432b9bc91378de5dc383048c881a331b2559dc41ce67baf0bd717` 相對stock728只加前節同一個失敗後12scalar收據；恢復原mute、音高、全部微速率轉交、暖機與PCM／Recorder，並非前案雙側原聲＋allhold組合。原100／250ms、片長、停滯與取消護欄皆保留，沒有音訊補償或延遲。

observer `c927cbd9c5676c8b4929a46eb22e576b4be1b3c7c8fccfa967421dda6dc5053d` 從320整段刪除4,949-byte連續clock區塊（SHA `262dd4c1949535e725c7765843275ed69fd1175c180a9d693062012a99cad9f5`）及export click arming；刪除內容含AudioContext/createBufferSource、play/currentTime/playbackRate wrapper、rAF/rVFC／曝光／scroll／keydown，沒有no-op替身或新timer，反向可完整還原。保留原硬體禁止、URL／IDB／Recorder／stream資源旁聽、錯誤與trusted click、六旗標與手動非busy快照，故仍非完全零觀察。`clock=null`及observationMode明示未觀測，不能記為零callback、零setter、零drop或全程可見；不送已移除listener的CtrlShiftP。

事前18項來源封存與兩路靜態核對後，只做一次fresh AX索引的原export click（91ms）；指定5,005ms靜默，實際工具等待5,010.6ms，首AX距click完成11,117ms，期間無AX／其他輸入。首次原100ms拒絕、無VS；receipt elapsedMs＝638.8983749784529、audioElapsedMs＝742、durationMs＝3000、rate＝1、兩起點0，差103.10162502154708ms。self判定後讀值約0.000001244秒，四個ended／paused皆false；這些非原子DOM讀值與at仍不是硬體PTS、呈現像素或成品品質。

前後來源固定436×300且雙側ratio1，viewport實際1774×835→1774×882；沒有正式曝光取樣，不由兩張快照補全程。原測試範圍未要求高度必為882；兩片與export在835高時已完整且不重疊，沒有因差異改CSS、點防護提示或更改Safari設定。三個0export QA錯誤（AX diff索引解析、字串codegen不支援、額外882斷言）原樣保存；改用明確inline helper，沒有繞過codegen限制，也沒有產品重試。

完整data、原片URL／完整hash及retained相同，revision3→4／三筆metadata-only complete；無VS Blob／下載／media雙put，硬體與頁錯0，Recorder inactive／tracks ended。原250ms checker前提exit1保留，僅精確100ms status局部copy另exit0，只核對守門／保全。自有主機exit0、PID退出、origin拒絕、匹配nonce釋放、只關本案自有視窗，舊及未知分頁保留；沒有encoder／player測量仍在執行。

本案42項manifest entry含素材，由協調者與獨立審查者逐一重算bytes／SHA且核對原始收據，無finding：manifest `44b4bf9642752a3443697e7db1ee6c0bf01336196fccd5bea3c8660cae880a63`，summary `7676d78240a2c4e529fcdc5c915e9cc6bf263ac17facbb11133c7900dd62b07e`，decision `240501d2a57b8296a74b92b8acbb3a8de84d69ca5a44deb62027aa90bbd6558c`；前置manifest `23aac54d20a3535921f42e059f6ea50415cda6f04ef7c02325fbfaa2be675b99`另存。只支持「移除這批連續探針仍未消除此新案失敗」，不回填前案、判定快取唯一因果或宣稱新主線已原生受測。原始收據／素材／本機識別不公開，靜態色條仍不能量動態停格或完整G2／G3。

來源續查確認`updateSourceTimelines`在active的timeupdate／seeked仍讀兩側currentTime並刷新DOM；`renderBeatPosition`亦另讀reference。它們不寫seek／rate／play，正式匯出時練習繪圖已有active保護。略過這些UI更新會同時改讀值與DOM工作，且timeline自身仍每rAF讀時鐘／寫self速率，無法單獨證快取機制；目前未採這個猜測或再開原生變體。下一個有效診斷須先補可區分實際呈現與推算時鐘的證據，避免繼續堆疊未證實旗標。#229／#13維持open，尚無產品修正、成品保存救援或完整G1–G7結論。
