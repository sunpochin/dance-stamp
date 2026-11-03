<!-- 用途：保存逐PTS本機匯出原型、第一份Chrome成品與未驗邊界；所在層：匿名工程證據；關聯：TECHNICAL.md、RECORD_COMPARE.md、scripts/qa/explicit-pts、#11／#229。 -->
# 逐 PTS 三秒匯出原型：Chrome 首檔通過，尚未替換產品

## 白話結果

先把兩支影片拆成有時間的照片，再把同一個輸出時間的照片合起來，聲音也從同一區間取出；不用等播放器一邊跑、一邊猜現在到哪裡。第一份三秒合成原型真正產生90格，兩路沿原分析器量到三組提示音最大差0ms。這是10ms音訊區塊量尺的結果，不是次毫秒或真人聽感證明。

這個原型只處理固定合成片、A0/B3/C0、1倍、無偏移與鏡像的並排，不是產品功能完成。Safari、其他速度／起點／負偏移、疊影、跟隨裁切、任意格式、長片記憶體與取消仍未驗；#11／#229／#13保持開啟，17張既有完成票不重開。

## 為何另查這條路

前一個d09候選在原版面有真下載，但原v5量到音早136ms而拒採，見[原三案證據](issue-13-unconfirmed-storage.md#2026-11-03-捲回來源與初始影格策略的原版面成品)。原100ms guard比較PCM時鐘與影片getter，並沒有直接驗編入檔案的像素；維持數字不變不足以證明成品同步。

也未採「等正式play的影格才開始錄影」：來源可能越過A，回seek又進入原轉換；以PCM值代替elapsed再與PCM比較會削弱護欄。舊[0.75倍60秒診斷](issue-11-vs-native-diagnostic.md#各階段能分清什麼)的150ms相位在paint後已可觀察，不能全稱編碼延遲，但不能把它移記成今次136ms的唯一原因。沒有固定補償、縮片或重跑舊失敗挑成功。

本輪評估按來源PTS明確選格／指定成品時間，沿原規格驗真檔，而非再改即時播放器參數。此為新的受限引擎原型；不把另一容器能產檔當成原MediaRecorder問題已修復。

## 固定來源與實作

從同步main `9af33dba809f02c4b26cf0044c87683c6ccc27df` 建新分支。Mediabunny固定1.65.0，官方tag指向 `cd6612380c7e3f1261d74b9b550e6fc3b65a53bc`；安裝用Bun1.4.4與ignore-scripts，只用本機bundle／BlobSource，沒有API帳號、CDN或外部媒體傳送。[授權及傳遞依賴](../LICENSING_AND_COST.md#逐-pts-qa-原型的固定依賴2026-11-03)另列，依賴原碼未修改。

兩個輸入均為既有65秒640×360／30fps coded-flash片，各1,789,027B／SHA `3fb42ffb14678b8c944d605cab684a1919801de7908c1f540f7fbfc29ea26548`。來源先完整核1,950格ID0–1949、PTS=n/30及65個每秒pulse；兩側同檔不能驗來源身分，不能把65秒來源改稱只需三秒。只匯出[0,3)，不改原檔或音軌。

| 階段 | 本輪實際行為 |
| --- | --- |
| 取格 | 兩個Input／VideoSampleSink，逐個i/30取覆蓋該時間的sample；非空、來源尺寸／rotation／flip、持續區間及B尾覆蓋均核對 |
| 合成 | 1280×720；兩個640×672半框的640×360 contain影像top204，沿原v5碼區幾何；無產品標題文字 |
| 影格時間 | 90次CanvasSource.add(i/30,1/30)，每次await反壓，最後一格結束於3秒，不加第91格；每輪finally close兩sample |
| 音訊 | reference AudioSampleSink依來源timestamp裁拷貝，不丟負時間首塊；mono48k／144000格bitmap全覆蓋[0,3)，重疊／缺口／非有限值拒絕，不靠預設零補未知 |
| 編碼 | AVC5Mbps、AAC128kbps；庫AudioBufferSource從0編檔，沒有live AudioContext／BufferSource播放；兩producer並行而各軌內await，避免mux等待另一軌死鎖 |
| 封裝 | Output／MP4／BufferTarget；finalize成功與各項清理返回後才交候選Blob，沒有自造muxer |

庫在首次AAC加入時會自行用本機impulse做encoder priming encode→decode校正，WebKit另有AAC前置處理；這是依賴內部行為，能力true不代表它已成功，不另加人工延遲。Output.cancel在finalizing不能立即打斷；取消只可在真正終態後拒絕發布，不用Promise.race冒充資源已釋放。BufferTarget保整檔，不能宣稱長片常數記憶體。

## Chrome 唯一首匯出的實檔結果

隔離、無登入的headless Chrome，UA `HeadlessChrome/156.0.0.0`，Playwright CLI0.1.23。原型localhost主機在執行前固定五檔與bundle bytes，兩路靜態審查無剩餘finding；公開API、固定720p30 AVC5Mbps及mono48k AAC128kbps能力皆支持，capability一次、export一次、零匯出重試／零codec回退。

| 受測原暫存檔 | SHA-256 |
| --- | --- |
| spike.js | `cc1e71f0d0f68d6ada5ad5dfdc969be7717f29518d7856d15dc4c063d9e9b567` |
| probe.js | `2e4b94ecb3029c9bb2c067cac85be8bc1ead3782f4ba5a1fdd3cf512a50b884e` |
| index.html | `0229069a084dd116c8794b8dfed05b4d35aba0ab4fa9448c2a37eb2db452b8f7` |
| serve.ts | `03b4e1ec447c8c97b89bc20cae024db71de5caf4e53220664f619580e1339ac9` |
| 執行前9項manifest | `31552bf817c4e2f7b4083eb572d727fd68db48796a9ec3a483445248969beef7` |
| Mediabunny原bundle | `65a111aadcb9a8b45e585f128d11daf3c972289bf6c58b2e795ba6073ee13363` |

首檔 **239,590B／SHA `da1d305159cf095e908127157203964790596a58a168e0e136b9e09ab71e79f0`**，MP4／H264＋AAC，等頁面Blob指紋。此處是同機nonce POST保全成品，**不是瀏覽器原生下載、產品保存或離站播放**。沒有相機／麥克風呼叫、真人素材或IDB操作。

兩路沿未改的v5分析器SHA `3f4aec9788880037a585ff81c6f77a0e56ab456dc835aa4cbe0cb0cbe1cbeaaa`，record保留seconds65／selfDuration65000、end3000，均exit0／withinSyntheticTargets=true；獨立RGB碼另解完整影格，並非只信提交metadata。

| 真檔觀察 | 結果 |
| --- | --- |
| 完整解碼 | 影音成功、stderr空；90格兩側碼均0→89，與來源取樣逐格一致 |
| 時間與fps | 視訊3.000秒／30fps，容器3.028秒／整檔平均29.723fps；AAC28ms尾端保留未裁切 |
| 配方／內容 | 首中尾左右差及全段最大差0ms；起末兩側覆蓋誤差皆0，完整來源交集true |
| 停格 | 原量尺兩側最大33.334ms；若保守延至容器尾端則末格61.333ms，仍依原250ms標準 |
| 聲畫 | 3flash／3pulse；0／0、1／1、2／2秒配對，10ms RMS量尺最大差0ms；不是次毫秒或物理相機驗收 |
| 音訊來源 | 實際141個decoded samples裁成144000 PCM格，0→3秒完整覆蓋；沒有捏造即時observedMaxDrift=0 |
| 耗時 | wrapper實測482.7ms；CLI呼叫前至首次完整收據觀察的保守上界13,773.983ms，不稱產品ready精確耗時或原生完整SLA |

首檔保全後，分析沒有再重編碼、重封裝、去重／修PTS、扣來源一格或新增門檻。原型本身確實透過WebCodecs編碼及庫封裝；這份三秒原型與先前136ms失敗是不同引擎，失敗原檔及不採d09的結論保持。

原始程式、執行前manifest、capability／result／首MP4、CLI前置錯誤、兩路分析及收尾紀錄共58項已逐檔封存，final manifest SHA `550cd76be6bc22e8b5fa34819844e02c6711142de30125f928a0ded763d06880`，summary SHA `9d403a67224d6bd48ea6a749ff04fb4db7b6bba7d199b8171a679dbc967d9217`。raw媒體、nonce、實際port／PID與本機識別不進Git；公開摘要不把沒有儲存的inode原值補成新測量。

## 工具前置與收尾限制

最初CLI控制器在任何按鈕／capability／export之前已消失，唯讀連線兩次報not-open，PID與session metadata不存在；原因未證。後續保持前景控制終端，才完成一次capability及首匯出，不把此工具恢復稱產品重試。另有一次run-code格式SyntaxError，原log保留，改用工具要求的async function作唯讀process查詢；兩次favicon403及庫Output already finalized警告保留，不能寫全程0錯誤／0警告。

引擎記錄Input.dispose、iterator.return及Output.cancel返回且cleanupErrors=[]，但這不等於瀏覽器內部資源已獨立停止。Chrome自己的daemon與前後CDP取得的七個process，在close後皆確認不存在。主機10分鐘期限先於finish-safe輸入到達，exit1、停止server但保留自己的nonce鎖，原失敗收據不覆寫。之後只在九個成功執行期間已知host／browser PID皆不存在、原port拒連，且nonce／PID／cwd／inode所有權檢查通過，才釋放自己的鎖；未清理他人程序、頁面或鎖。原inode數值未另存JSON，所有權assert執行結果與raw工具收據分開保存，不造欄位補證。

## 保存回 repo 與接續

[QA工具與命令](../../scripts/qa/explicit-pts/README.md)已納repo，固定dev依賴及鎖檔；不進產品白名單或修改原匯出入口。core／probe／HTML只改檔頭，去首註解後與受測Chrome版逐byte相同；新主機改為repo相對來源、全新output收據資料夾、來源與主機指紋，**不冒稱新repo adapter已執行Chrome媒體或Safari**。主機HTTP-only檢查與本分支正常check／提交hook另綁結果。

新repo主機SHA `c6c644fe5e2602e653ffcd1a49dfca9ba43203cf0016c25a840228b0f7a576db` 實際完成15個HTTP-only檢查：固定六路asset及config指紋、錯Origin拒絕、錯nonce拒絕、首次JSON保留／重送拒絕、壞JSON首錯封住後不接受補寫、未知路徑與非支援method拒絕。注入的JSON明標host selftest，不是瀏覽器能力收據；沒有起browser／codec或產生media。另兩個程序驗已存在output及outside-output皆exit1，首收據與共用鎖未改；正常finish-safe後host exit0、已知PID不存在、原port拒連、鎖已釋放。這些只證主機協定與路徑，不能代替原生媒體驗收。

本分支第一次正常check為760 pass／1 fail：隨包授權文件新增相對研究頁連結，但該頁不在產品白名單，實際封裝連結檢查正確拒絕。獨立審查亦指出同一問題；改為外部repo技術索引，沒有把QA／dev工具加入產品包或弱化checker。原失敗日誌保留，修正後與正常提交hook結果另綁最終來源。

主線後續由別工作合併#258至9af，保留本輪先前#256的兩份證據；a749主線CI41608373438因同main concurrency更新而cancelled，沒有重跑它挑綠。實際9af自己的CI41609308015 attempt1五項全成功，App原log83不同頂層PASS／0FAIL及12真下載全解碼／自然播放已另核。這是主線工程結果，不是這個新增QA工具或Safari已驗證。

下一步先驗同引擎在原生Safari的固定配置與第一份三秒檔；不支援或首失敗就保留，不換codec挑綠。之後才把既有comparison／positions與純繪製接回完整產品，驗三速度、正負offset、非零A、疊影／mirror／follow、格式／rotation／VFR、無音軌、長片／記憶體與取消／舊VS保全。完整P0、真人／裝置、儲存救援和發布仍各依原票，不能以本原型縮小目標或補勾。
