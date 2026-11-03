<!-- 用途：保存逐PTS本機匯出原型、第一份Chrome成品與未驗邊界；所在層：匿名工程證據；關聯：TECHNICAL.md、RECORD_COMPARE.md、scripts/qa/explicit-pts、#11／#229。 -->
# 逐 PTS 三秒匯出原型：Chrome／Safari 首檔與產品界線

## 白話結果

先把兩支影片拆成有時間的照片，再把同一個輸出時間的照片合起來，聲音也從同一區間取出；不用等播放器一邊跑、一邊猜現在到哪裡。第一份三秒合成原型真正產生90格，兩路沿原分析器量到三組提示音最大差0ms。這是10ms音訊區塊量尺的結果，不是次毫秒或真人聽感證明。

這個原型只處理固定合成片、A0/B3/C0、1倍、無偏移與鏡像的並排，不是產品功能完成。下方追加原生Safari同一限制的首檔；Safari完整功能、其他速度／起點／負偏移、疊影、跟隨裁切、任意格式、長片記憶體與取消仍未驗。#11／#229／#13保持開啟，17張既有完成票不重開。

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

## 原生 Safari 首檔：同引擎固定三秒通過（2026-11-03）

白話：Safari也把同一組有編號的照片和提示音排對了。這次是新私人視窗中的第一次成品，不是一直重試到成功；但還沒有把這個方法接進產品，所以不能據此關掉#11／#229或補勾完整驗收。

受測來源為[QA工具提交](https://github.com/sunpochin/dance-stamp/commit/3ed5fee7d2917d1aa4ff6561a1689a913e267da6)，乾淨工作樹；受測repo core SHA `1cead5a39ac56454613df6f397c204fb76843f52b5c589530435d2337ff0dcd8`、probe `08a848f1176aa736b8b9945f458f9ed0b20e23b2f4c548650a125441f0585fdd`、HTML `d5926061421116be89c3315cd7e50557a8cd9530f1bc34c405349df6eb313b24`、host `c6c644fe5e2602e653ffcd1a49dfca9ba43203cf0016c25a840228b0f7a576db`，與3ed5fee檔案及本次preflight一致；core／probe／HTML僅去首註解後body等於Chrome版，不稱全檔hash相同。bundle仍為65a，兩份來源仍為完整65秒／3fb合成片。精確head獨立Codex審查無阻擋finding後，才另授權此唯一原生案例。原生Safari27.2、獨立新私人視窗／新loopback origin，沒有相機、麥克風、IDB或live播放器呼叫，也未變更瀏覽器設定。

固定AVC720p30／5Mbps、AAC mono48k／128kbps，七項API與兩codec能力皆true；能力按鈕一次，首匯出一次，零重試／零codec回退。實際頁面顯示encoded、exportAttempts1；公開清理呼叫已返回、cleanupErrors=[]。能力true本身沒有拿來代替後續真檔品質。

首檔 **193,981B／SHA `9ab893a9cbfa55c485abb9a268867300eb78b4d5809a7b0f4b9117387b47910b`**，MP4／H264＋AAC，與頁面結果bytes／SHA相符。保全方式仍是同機nonce POST；沒有點原生下載、執行產品保存或離站播放，不能移記為這些驗收。

| 同一首檔的兩路分析 | 實際結果 |
| --- | --- |
| 原未改v5 | root與獨立分析皆exit0／withinSyntheticTargets=true，來源seconds65／selfDuration65000與輸出[0,3)分開保留 |
| 完整解碼／RGB | 影音完整解碼成功、stderr空；獨立RGB核90格兩側碼0→89、逐格符合所取來源；PTS無倒退或重複 |
| 時間 | 視訊3.000秒／30fps；容器3.006667秒／整檔平均29.933fps，未後裁AAC尾端 |
| 配方／覆蓋 | 首中尾誤差、兩側全段與內容時鐘最大誤差0ms，完整來源交集true |
| 停格 | 原量尺最大33.334ms；保守延伸至容器尾端的末格40ms，仍沿原250ms標準 |
| 聲畫 | 三flash／三pulse，0／0、1／1、2／2秒配對；原10ms RMS量尺最大0ms，不是次毫秒或真人聽感證明 |
| 音訊 | 輸入141個decoded samples裁成144000 PCM格覆蓋[0,3)；成檔AAC解碼144320格，6.667ms尾端保留 |
| 耗時 | wrapper3385ms；原生click開始至首完整收據觀察的保守上界17675ms；不是完整產品／保存／下載SLA |

原型取格、編碼與封裝之外，分析沒有再改原檔、修PTS、重封裝、調補償、裁來源或改門檻。先前d09的136ms失敗和舊130／150ms證據保持原歸屬，不把另一引擎的三秒成功改寫成它們已修好。

### 原生視窗與主機收尾的精確範圍

開頁前的第一個身分防護讀到差異AX文字，缺少UUID而拒絕輸入；完整AX隨後確認仍是原本新建的自有視窗，才導航，沒有重跑能力或匯出。能力與結果完整JSON由主機收據保全，不依AX截斷的文字猜測。首檔及結果確認後，只在再次核對自有UUID＋origin＋encoded終態後關該視窗；畫面回到原本的未知私人視窗，未操作其頁面。

共用Safari app保持執行，不能宣稱它的PID或內部codec資源已獨立停止。為不把自己的context關閉虛報成整個browserStopped，主機走SIGINT留鎖路徑：原收據exit1、serverStopped=true、browserStopped=false、lockReleased=false完整保留。之後另核nonce／PID／cwd／原inode、encoded公開清理返回、自己的context已關與已知host不存在，才只釋放自己的閒置測試鎖。第一個受限socket回1只記工具限制；另行實際socket核為拒連61，沒有把1冒充拒連，也未改原收據。沒有關閉共享Safari或處理未知PID。

來源、bundle、原片、首MP4、能力／結果／首次觀察、原SIGINT／後續scope audit、兩路分析共42項逐檔bytes／SHA經獨立核對，manifest SHA `f5d13524ff827ca67f19b8b3c2e4d189ae90cde6caa4181e63a4b908cb9e6462`，summary SHA `dde75da9d5261c9f27c1f9663511c20bc00e94936954f4a33a55c33ec9c648cd`。原本42項封存不補寫；raw媒體、nonce、port／PID／inode與本機路徑不公開入Git。

下一步為完整產品接入：沿既有comparison／positions映射與同一繪製邏輯處理三速度、非零A／正負offset、疊影／mirror／follow及兩種輸入，補格式／rotation／VFR／無音軌、五分鐘記憶體、取消與舊VS保全。這些仍未驗，不把研究原型直接替換產品或縮小#11／#229／#13原驗收。

## 原生Safari Module Worker唯一首檔（2026-11-03）

白話：接著把同樣三秒製片工作放進只屬於本次操作的Worker，Safari第一次也做出合格檔案；成功後已呼叫終止自己的Worker。但這次沒有在製片途中按取消，不能因此說產品取消已驗收。

這是另一個明確架構前提，非重跑先前window首檔挑成功。以3ed5fee的QA核心作基底，固定取格／PCM覆蓋兩區塊逐byte不變；只將DOM canvas改OffscreenCanvas、AudioBuffer改144000格raw f32-planar＋AudioSampleSource，caller在await add後finally close自己的AudioSample，保留add首錯。原Mediabunny1.65.0／65a bundle、65秒／3fb合成來源、90格與AVC／AAC配置皆不改，沒有live AudioContext、camera／mic或產品保存操作。

實際受測暫存core SHA `5d07ca17fbb27c3deab711efb4318dc00e666cd1fc844f261424b3f87864b601`、Worker入口 `b3c322f76c4b0383eb9df7cd771b66518168385fe2725b10de678cb4ce22efda`、頁面控制 `400eb40dc51c4b44f0be8d280fdffdc83d4dd85f86baf24a246785ee2f013a6c`、主機 `9d239606aff2c5af0032dd078ba16df5fa606772ff4abf8339ec8abc37cc3e5a`；執行前13項manifest SHA `9e5567cb703c8c4bf9870ce87a31cd32c767edf5e2314e0d861a1e8b4d2dc4c9`。兩路靜態審查後才授權首案；審查發現的「terminate失敗仍可發布Blob」與metadata清理門檻已在凍結前修正，不把尚未執行的版本叫成媒體通過。runtime主機記乾淨repo481889bb、baseEngine3ed，與實際assets指紋分列。

真正同一Module Worker能力收據：Safari27.2／workerGlobal=true、document與AudioBuffer均undefined，七項API與AVC720p30 5Mbps／AAC mono48k128kbps皆支持；一次能力＋一次首run，零回退／零重試。原生CUA在導航Return前回user-changed警告，完整AX確認仍是自有新UUID且位址已輸入，才完成導航；原因未證，警告保留，能力／匯出尚未發生前沒有拿工具恢復當產品重試。

首MP4 **195,333B／SHA `957456e3c7285295af8800bd3908ae0c954cd8f3744c0cf451a61ccbff3c572b`**，與頁面result指紋一致；仍是本機nonce POST，沒有原生下載／產品IDB／離站播放。兩路原v5均exit0／withinSyntheticTargets=true；另一方獨立RGB逐格核兩側ID0→89與90筆取樣metadata，PTS無倒退／重複，最大格線量化誤差0.000333ms。完整map0影音xerror解碼成功、所有stderr空；視訊3.000秒／30fps、容器3.006667秒／平均29.933fps，首中尾／來源覆蓋／內容時鐘誤差皆0ms，原停格33.334ms（保守末格至容器尾40ms）。三flash／三pulse沿10ms RMS量尺最大差0ms，非次毫秒或聽感證明。

公開引擎清理calls返回且cleanupErrors=[]，自己的Worker terminate確實called／returned；主頁先完成這兩道門才保全Blob，終止失敗時禁止成功發布。記錄terminalClaim4381ms、artifact回應完成4386ms、含SHA／本機保全且結果POST前的wrapper4387ms；原生click開始至首完整收據觀察上界20491ms。這些不是純codec耗時或完整產品SLA，metadata沒有捏造觀察drift=0。

首檔保全及encoded終態核對後只關自有私人視窗，共用Safari保持。主機仍走SIGINT留鎖exit1／browserStopped=false原收據，另核自身nonce／PID／cwd／inode、known host消失與原port真正拒連61，才釋自己的閒置鎖。Worker.terminate回傳、context關閉與公開清理各有收據，不等於實體codec資源已獨立驗證退出，也沒有執行途中取消的成功收據。

原13來源凍結未變，首檔、固定來源／bundle、兩路分析及收尾共55項逐檔封存，final manifest SHA `abdc6cf491a37c1f82544d672161cf51bd4618cee639dbb56b7ef09d34289f93`、summary SHA `c6c05afc8ffcc059d71a96afe6d1447d88fd0f117a98b743482ada1e062d44e9`；獨立分析自身23項manifest SHA `8ba39cd75faaaabb7edbc98c7e235713677160089bcfdddf03c3062f0133ad66`。raw只留本機，不把nonce／PID／port／inode或實際路徑公開入Git。repo接回共用QA主機後另綁來源與HTTP-only結果；四個Worker資產僅去首檔頭後body相同，不能稱新repo host已重跑原生媒體。

### 接續實作接縫：仍是待驗設計

白話：先讓舊播放器與新製片器使用同一張畫圖說明，再把製片工作放進只屬於本次操作的小房間；按取消就能關掉自己的房間，上一支影片要等新檔真的合格才換掉。這些是接續方式，不表示新引擎已接入。

技術上保留main的operation、following.assertCoverage、saveCurrentRecipe與獨立成品load／100ms片長驗證，通過後才交換outputBlob並沿原persistExport／unknown-storage救援；原相機先錄take，兩種輸入再共用匯出。renderer以顯示尺寸、明確來源時間與九參數draw介面適配video及VideoSample.draw，重用cropAt／contain／鏡像與現有標籤，不複製兩套幾何或重新分析人物。逐輸出t只呼叫既有positions；非整格末尾保留真duration，不靠30fps snapping改交集。

音訊候選為裁reference PCM後，以raw AudioSample的Fs×rate與映射timestamp交固定庫AudioSampleSource.transform.sampleRate48000，沿庫跨塊resampler自然變調，不自造另一個resampler或一次留滿300秒PCM；小數Fs×rate、stereo與首尾rounding仍須實測。新Worker候選需另驗WebCodecs／OffscreenCanvas／AAC priming；只在自己的Worker執行，取消終止自己的handle並保留首錯，不能把主畫面解鎖說成實體codec已停。長片輸出需量峰值，fragmented MP4／AppendOnlyStreamTarget只是待相容性驗證的選項，Blob parts仍佔整檔記憶體。

產品導入時才擴同源白名單、建置hash、SW manifest與下載包／MPL notice；當前Bun.build只作驗證、實際資源仍由web-assets複製，不能使用未被打包的bare npm import。上述設計不省略MP4／MOV／WebM、rotation／flip／VFR／edit-list或無音軌，庫不支援的情況須明確拒絕並保留原片／舊VS，不能忽略warning當相容。

## 本輪repo接回與主機檢查

白話：把兩種原型收進同一個本機測試入口，保留原頁面模式為預設。新工具仍只用合成片，不會把原型塞進產品下載包；真正原生結果綁上面的受測檔案，這次主機檢查沒有重新製片。

共用serve主機SHA `6a4a6c94e271c91498e8c45a645931fb9b5d918b0b5970894a0ee4e2ce1ac76b` 新增明確`--variant worker|window`，原預設window資產／CSP／nonce／一次寫入／鎖協定保持；worker使用同源四資產、worker-src self及固定65a bundle拒絕界線。新core／entry／probe／HTML去首註解後分別與原生受測四檔逐byte相同，功能體hash為01047bbb／d7d1a3da／533324a3／d220ce04；實際全檔指紋由主機metadata保存，不把body等價稱全檔hash相同。

Worker模式17個HTTP-only請求、預設window16個請求通過，涵蓋config／全部asset bytes與SHA、CSP選擇、硬體政策、錯Origin／錯nonce、首JSON保全與重送拒絕、壞result首錯封住、互斥入口／未知路由／錯method拒絕。兩個無效variant程序exit1且沒有建立output／鎖。注入能力JSON明列hostSelftest及notMediaCapabilityEvidence，不是瀏覽器能力收據；沒有起browser／Worker／codec，也沒有假MP4。兩自有主機finish-safe exit0、known PID不存在、實際socket拒連61、own nonce鎖釋放；因本次沒有browser，不能把這些標籤拿去改寫上面共用Safari的SIGINT false收據。

搬入第一步曾因工作樹權限拒絕、尚無部分source修改；精確授權寫入約定scripts範圍後完成，沒有把這個工具前置失敗叫媒體失敗。原13／42／55來源與實檔封存未改，原型仍未接產品；正常check／正常提交hook與本次最終來源另綁，不以HTTP檢查代替媒體或取消驗收。

本次完整正常check已通過：Bun1.4.4、761 pass／0 fail／4404 expects，公開掃描511個tracked檔、19項既有lint info、build58cb019df383c129；無產品web bytes變更。正常提交hook仍沿原入口執行，結果與精確commit另在PR核對，不跳過hook。


## 產品接線候選（#11／#229）

白話：把每格和老師的聲音排在同一把尺上的程式，已做出第一份三秒產品影片。Safari 也真的另存了新影片、兩支原片和完整筆記，關站後首次開檔可自然播到畫面顯示片尾；但私人保存狀態仍未確認，短靜態片也不能證明完整聲畫品質，原問題尚未結案；#229原三秒合成缺陷已有同fixture產品首匯出、真下載、離站解碼與取消資料保全回歸證據；待最終精確commit獨立review、CI與merge後，可依該窄範圍判斷結案。#11完整驗收與#13保存問題仍開，這次提交不預稱已merge或closed。

- 基線 main `9cf6db7960bbdcd5c8b560e32b68a49f225c5c2a`；共用 renderer 來自已合併 PR263。隔離靜態 v1 manifest `c4b2f64880ea3aecdb20f779e1fc31ab0004b26ba024b90dce5bafb546ec7346` 與 v2 `06ff4fb9b86158e90535997d472ca9454deaf0cfdba5198c84645d16768be125` 原封保留本機。前兩個 QA 原生成檔、首次失敗及原量尺各綁原版本，不移記到產品候選。
- v1 static review 找到合法60fps尾格／VFR age誤拒、錯層mvhd改寫timescale、finally close掩首錯、未旁聽source.close非同步失敗與整輪錯套D+10秒。v2已補純反例。port再修60秒取消時誤標正向G7：只記owner interval／是否超過90秒，不宣稱失敗或取消性能通過。
- 後端保留完整原 positions／300秒、最後短格、兩片不同尺寸／旋轉／VFR覆蓋與可解碼檢查。跟隨用配方來源時間，畫面仍共用並排／疊影／鏡像／標籤；VideoSample.draw處理庫的rotation/flip，不另拷貝一份假video。選樣age只診斷，編碼後聲畫與非預期freeze仍需原G2/G3實檔量尺。
- PCM格線以真解碼相位錨定，裁邊／跨包覆蓋完整，已核track首前尾後可靜音，未知gap/overlap拒絕。8MiB elst／有界header審核僅補固定庫會略過的edit範圍，不寫第二套demux；canonical owner／唯一ID拒錯層或重複metadata。庫resampler處理Fs×r自然變調與48kHz輸出，不建即時AudioContext，不留整段300秒PCM；整個輸出Blob與BufferTarget仍全檔留記憶體，峰值未驗。
- 只Safari比較輸出接新Worker，saveRecipe仍先做。主頁保留新後端首錯metadata；沒有取得／驗證新Blob前不換舊VS，之後沿原load驗片長±100ms／persistExport。private unknown／pending只用原memory救援連結，不重讀DB、不強abort、不把pending當rollback。Chrome、一般／共同預覽、相機錄製與單側跟隨成果路徑不改。
- Worker只自己所有，abort/background/pagehide先佔終態、terminate、自動移除自己的timer/listener，晚訊息不能發布。close privatePromise是固定1.65的薄seam，失配拒絕；called/returned不代表實體codec退出。自有模組均進App覆蓋分母，pure fakeWorker僅驗決策，不冒充真codec。
- 前置階段先做正常check／strict types／unit與完整diff審查，當時未啟browser／codec；之後實際首案分開記於下方，不把早期靜態結果移記成媒體成功。型別沿上游類別宣告薄轉接，避開舊ambient WebCodecs與TS7 DOM重複；不使用skipLibCheck，不改套件。
- 下列第一個原生產品案已使用原#229兩個不同來源：reference 41736 bytes／SHA256 `4899551b4cec878137bca1e1d510cfbea00d5de1ae62799275cdcf04d8c689ae`，320×180；self 67209 bytes／`ae6db98e328a05a1a0cff319e30ee4651607af84b8b0bcf0d4204cd55777af9f`，180×320。A0/B3/C0/r1/offset0/SBS/no mirror；不轉碼、不以65秒同片雙側冒充。原素材不是coded flash，本首案不代替碼表聲畫量尺；人工聽感／實體裝置仍分開。
- 本節僅記下方已完成的首次結果。三速、非零A／偏移／短尾、layout/mirror/follow、其他格式、取消／背景／舊VS與五分鐘峰值仍不得由三秒首案代勾；沒有新增byte上限縮小原要求，也沒有宣稱唯一WebKit原因或完整G1–G7通過。原#11／#229及私人保存#13保持未結案。


Port 前置檢查紀錄：首次嚴格型別發現上游舊 ambient WebCodecs 與 TS7 DOM 重複，改引用固定上游類別宣告並只補 track-kind 細分，沒有 skipLibCheck；完整 typecheck 已通過。第一次正常 check 保留779 pass／1 fail／4640 assertions：真正 build 回歸揭露相對 external 無法解析同源庫別名。修為只在建置時將該唯一 URL 解析到固定官方套件，仍真正驗套件，不是假略過依賴；單獨 build 已通過。這些不是原生媒體失敗，也沒有因此啟動瀏覽器或放寬測試。

### 產品首次結果：Chrome直接引擎、原生Safari產品介面

受測來源是 base main 9cf6db7960bbdcd5c8b560e32b68a49f225c5c2a 加 reviewed staged tree 4be2085ccb0d32d9166c5cfa4a9c9d0d24fef657，**trackedChanges=true**，build a3c4cccb8c9bb59e；不是乾淨HEAD或最終提交。原24檔port封存 e550925cf8e615ba37c17de3d3386317723ef18a681dbfde987feec6165c3014 維持原樣，受測產品主要模組：

| 模組 | SHA256 |
| --- | --- |
| main.js | 13b7ed2083829ffe526095cfd3d534eb972c658e8b44b62ba18a5833a6a78a6a |
| export-pts-core.js | fef46189bb05966cfd46aeb9ace130a2d00b6b63c1d56270ccacdd84f8c42e48 |
| export-pts.js | 9ec85faecd76d4f5fd72374cb1c742932e6501e0b5c4adfd3d76e50f78bbf6ad |
| export-pts-worker.js | 29aa399934442d4b31cbe0affb68882fae32576b6c3c0dedab19e3dd4ef6c289 |

- **Chrome直接引擎首案**：46項manifest db7a023225a51be43114cae121467767ba5248fa60cb66f59527fc03042c9703，原兩份不同素材、A0/B3/C0／1×／offset0／SBS／不鏡像；一次真Worker能力檢查、一次產品owner匯出。首檔84,341B／SHA256 e807d9e08b7a140471e4ad5dd8d7528468c2796060086e113c4d06d75ed096be，以本機POST保全，**不是原生下載、產品保存或Safari**。既有FFmpeg原log完整解碼exit0／stderr空；90格、視訊3秒、AAC／容器3.028秒、PTS嚴格遞增。來源PCM144,000與輸出48k duration_ts145,344分記；owner570.2ms、含素材hash與artifact POST的QA593.1ms、真正click→首觀察保守上界5,014ms不互換。403 favicon及already-finalized warning原封保留。隔離browser八個已知PID皆不存在、主機exit0／實際port拒連61／own nonce釋放，不把Worker terminate回傳叫物理codec退出。
- **Safari27.2產品首案**：99項manifest db4532ee4e0d125033bd41589b0aa96030583bc9928526434da9eae6739ba308，與上案相同原兩份不同素材／三秒配方；原產品按鈕唯一trusted export。首MP4 65,204B／SHA256 fcc9a95dd2860b1082f0628bd9b6362d4670fef60fd10e074000efac05dd0a1c；新VS、兩側原片及完整筆記四項救援均真正原生另存，下載bytes／hash對應頁內Blob。90格／視訊3秒／容器3.006667秒、原完整decode exit0／stderr空、PTS嚴格遞增。來源PCM144,000、AAC48k duration_ts144,320與重採樣8k的24,054樣本分開，不能把後者乘六捏成精確48k計數。首中尾靜態幾何及持續測試音只支持描述性檢查，不是光學／脈衝AV量尺或人耳。core3,391ms／owner3,423ms／主頁讀回3,007ms，真正click→首AX保守上界14,610ms；指定quiet5,005ms不是實測首次觀察時刻，也不證60秒G7。
- **私人保存仍unknown**：最後媒體request為trusted UnknownError，快照沒有該transaction的complete／abort；after unknown=true、native=null，之後沒有DB交易、reopen或force-abort。不能稱保存成功、已rollback或native DB after不變。非空合成筆記與全部最後確認資料經原產品memory備份救援；最初直接拿raw native assets比可攜備份失敗，原紀錄保留。依原validateBackup白名單去除state／storageKind等runtime欄位、只換generated exportedAt後完整deep-equal，兩路唯讀核對相符；原片URL／hash及舊retained subset保留，不把新validation／output URL誤報成毀損。這仍屬#13未確認保存界線，不改寫舊失敗。
- **操作與收尾限制**：匯出前自拍選擇曾載入老師片，已在0export時走原UI修正並以不同SHA確認；不算匯出重試。原一般備份入口在預設比較UI隱藏，before完整資料改由原QA JSON原生下載，after則走可見的原memory救援備份，不改CSS／產品。四項救援檔核對完成後才另准普通離頁，僅關自有視窗；native transaction結果仍unknown。主機原收據browserStopped=false／留鎖，之後實際PID／port61與own nonce稽核才釋鎖，共用Safari與未知視窗保持。本輪未變更設定或接受降低防護；其他隱私組合與預設組合未完整驗證。
- **離站首次原生播放**：先確認產品頁／主機已停，再於新的自有私人視窗第一次開原下載檔；原生開檔自行播放，AX由Pause／0秒走到Play／3秒、進度1，未seek／重播／手動啟停。這只支持自然走到可見片尾；JS ended／error code／dropped未觀察、人耳未驗。自己的檔案視窗正常關閉，shared Safari仍在，不推實體資源全退。
- 協調者與獨立Codex lane已分別唯讀核對46／99項全部bytes／SHA、原收據、資料救援、分析紀錄與限制；第二路沒有重播／重編碼。這不取代後續最終commit獨立review／CI或完整產品驗收。以上都仍是原靜態色條／持續音素材，不能從currentTime、selectedPresentationLagMs=0、90格或自然片尾推定完整G2／G3；未新增結案。

### 首輪三個選定App情境：1 PASS／2 FAIL，保留原結果

8項manifest 4d663361e3387aec5357fbb21979c70cdd1103f968f7d627328f92a5667243ad，run收據7d5facda46fb95676b4b98a578cc75cf1b94048e13586e2a75481550faf4ceec；測試適配後整個staged tree為5752b055b5b6330b9e57593abacfe3a5615ec915，產品原24檔仍對4be封存、32個App來源SHA相符。這是三個選定Chromium情境、exit1，不能叫完整84案或原生Safari驗收。

WebKit匯出支援故障／保全／解除後恢復一案PASS。owner準備中Stop的斷言已過，但headless沒有建立真正hidden／visibility事件，於環境前提等待FAIL；晚Blob／後續retry子案未到，不可當產品背景取消通過或失敗。錄影暖機取消在聲音資源斷言FAIL，原紀錄nodes／recorders空且未dump gain，因此不能由缺欄認定或排除實漏。兩個首失敗與原log完整保留；pageErrors為0、browser.close／server.stop返回及lock未留，該輪未另做物理PID獨立退出稽核。此首輪紀錄不移記後續探針、修正或另輪結果；新版選定情境另列下段。

### 同來源四個原生coded配方首案：三速、偏移、鏡像與一分鐘

白話：再用原本帶格碼和提示音的假影片，一次只做一張已授權測試單。四份第一次成品都通過原量尺，包含半速、四分之三速度與一分鐘；這比只看靜態色條多了實際聲畫證據，但仍不能跳過尚未通過的產品回歸。

四案都由Safari27.2直接呼叫同一產品owner／真module Worker；原產品46資源固定在同一4be／a3 snapshot，未隨後續測試適配漂移。每案只有一次cap與一次export，沒有自動矩陣、codec fallback或失敗重做。兩roles用既有完整65秒coded／flash素材（1,789,027B／SHA256 3fb42ffb14678b8c944d605cab684a1919801de7908c1f540f7fbfc29ea26548），selfDuration65000與seconds65保留；這些是本機POST實檔，**不是產品介面保存或原生下載**，亦不取代前述兩份不同來源的真正產品首案。

| 首案 | A／B ms；速度／偏移；鏡像 | 視訊／容器秒；格數 | bytes | flash／pulse；最大AV差ms | 最大配方／內容差ms；最大hold ms | owner／QA／真ready上界ms |
| --- | --- | --- | ---: | --- | --- | --- |
| coded1 | 0／3000；1×／0；無 | 3／3.006667；90 | 205,019 | 3／3；20 | 0／0；33.334 | 3,413／3,427／13,919 |
| codedHalf | 12000／15000；0.5×／+400；兩側鏡像 | 6／6.022667；180 | 534,921 | 3／3；20 | 33.334／33.334；66.667 | 6,850／6,864／23,797 |
| codedThreeQuarter | 12000／15000；0.75×／−400；無 | 3.6／3.604021；108 | 239,260 | 2／2；6.667 | 33.334／33.334；66.667 | 4,090／4,103／13,559 |
| coded60 | 2000／62000；1×／0；無 | 60／60.012；1,800 | 9,022,755 | 60／60；20 | 0／0；33.334 | 66,742／66,773／75,731 |

原analyzer v5 SHA256 3f4aec9788880037a585ff81c6f77a0e56ab456dc835aa4cbe0cb0cbe1cbeaaa不改，仍用10ms音訊RMS步長與原來源格點，四案均exit0／withinSyntheticTargets=true、完整共同配方覆蓋true，平均FPS分別29.933／29.887／29.967／29.994。各另存PTS符合原i/30格線、嚴格遞增，及全軌decode exit0／stderr空；沒有去重、重排、補償或remux。AV數字是本次原量尺結果，不能移成舊prototype的0ms。Half的ref12→15／self.4→6.4對應6秒；ThreeQuarter負偏移連老師音訊裁共同頭，ref12.3→15／self0→3.6，沒有補回名義4秒。半速參考格的66.667ms hold與33.334ms配方量化照實保留，不改原100ms／250ms或FPS門檻。

四份獨立seal與成品SHA256各自保留（entry數包含重複來源／收據，不當unique檔案數）：

- coded1：15項manifest 3e189c589a32a87c2911f8ee2908b0bf0a35f77eb4dc379b7583cef3c0c7eb8d；成品 de1b21921ccc21c4c292d1891aa2808d78131e2ee0a87d51bbe615642e94b0af。
- codedHalf：17項manifest a0b934569e8633cead7f1e4e4445757017962465f7daa19cad0aa5008b094f5a；成品 59e9ed10433bc3dbba0a67e8fb6bec98f125417738f7bb4a9bf57acbfe05b32f。
- codedThreeQuarter：17項manifest 7383fe3ccc0afa7f17f9d49e3f4cf2c168c58e2b1b0483bc5573730f44a45b9a；成品 9db2c6f7a65d89474eeffae1cb21b7688b2361aaaa03f14f5b2c98fd31e4f415。
- coded60：16項manifest 34fa23be1d8684e00dad598e5020887200f7bb79da839ffb56a02812a2b5143f；成品 6817c2c39b0ddfc56b07def8ab91d545eb3e9905d77cf2045049e686af841d90。

半速首提示音既有PCM的.04–.10秒Hann小窗峰近330Hz；0.75×的.97–1.00秒峰近495Hz，支持這些合成小窗的自然變調描述，不等於人耳或整段聲音驗收。四案均由協調者和獨立Codex lane逐項核seal／raw／配方與分析資料；第二路只重算已存PTS／PCM小窗，沒有再解碼、重播或重做成品。

時間欄三種範圍分開：owner只到自己的Worker終態／terminate回傳，QA含素材讀取／hash／artifact POST但不含result POST，真正ready上界才用實際export click→首ready AX回傳。Half與60的quiet sleep被agent訊息提前結束後補一段，原時點及零native UI輸入照錄，不把指定5,005ms當實測首次觀察；60先見非終態AX，另有本機result檔被動觀察，後者不充原生AX ready。只有**這個直接引擎原生60秒合成案**以真上界75,731ms達原v5的90秒目標，不能推成完整產品UI／保存／原生下載／cold-start G7或300秒效能通過。60秒來源PCM／covered為2,880,000；進度日誌200筆上限後2,797筆未保留，不是輸出掉幀，實檔解碼為1,800格。

四案原SIGINT exit1／browserStopped=false／留鎖都保留；另外確認自有context、host PID不存在、實際port拒連61及own nonce才釋鎖，共用Safari與未知視窗保持。Worker公開清理／terminate呼叫回傳不冒稱物理codec資源退出；未獨立蒐集的原生console不以toolErrors空當「無console訊息」。

本表原始整理時產品候選尚未最終commit／merge，原App首輪1PASS／2FAIL不能因四份品質檔通過而變綠，沒有預填後續ENV／App／CI。300秒記憶體、其他格式／rotation／VFR、follow／overlay、完整取消與資料／舊VS保全、真機與人耳，以及完整G1–G7仍未驗證；#11／#229／#13不由本表結案。

### 新進度介面的原生產品首案：來源與舊品質表分開

新版產品實際首案仍用原#229兩份不同素材／A0/B3/C0／1×／offset0／SBS／不鏡像，沒有錯選、重匯出或換codec。凍結來源base9cf6db7960bbdcd5c8b560e32b68a49f225c5c2a＋staged tree51e278eca955b9462352bb75bfad9677e0e7fd21、trackedChanges=true／buildd956f301dd2cce5d，main SHA256 0a6d99a60cd9013b492775d04eb219d53233c3fc1cf3051012ec2d799de6204e；不是最終提交。相對舊4be產品盒子只有main／重建SW變動，十個codec／renderer／timeline／follow模組逐byte相同；四coded品質結果仍各綁原4be直接引擎案，只能沿用這些相同後端的已測範圍，不能移記為新版main跑過coded矩陣。

進度程式不再把audio局部百分比寫入總進度，input／encoding最多.99、finalizing才滿格。本次原UI首案只記終態progress=1，沒有連續採樣去證明整段單調。94項最終manifest ed3e1cf9606249b6adb77564ac8659a9e01ac7bad0ddde34076e86c1335d6e92，summary f5f700bf1be97c9bab7fda01b888747f2f0c78459dcd4df98e3419305ac124db；協調者與獨立Codex lane分別唯讀全項bytes／SHA與原始收據，第二路未重播或重新解碼。

原產品唯一trusted click產生63,809B MP4／SHA256 ea303dba3ecc058d4c8d64a09da1c440c45d286cc9312993bc118ef28d05725d，VS／兩側原片／筆記四項真正原生下載，指紋均核對。原FFmpeg完整全軌decode exit0／stderr空；H264 Baseline 1280×720、90格／3秒，PTS嚴格遞增並符i/30（最大量化差0.333微秒），AAC48k mono／容器3.006667秒／duration_ts144,320，8k解碼24,054樣本另記、不能乘六冒充精確48k數。既有首中尾三PNG核幾何，660／660／660Hz僅描述性測試聲源，不是coded光學AV或人耳。core3,387ms／owner3,416ms／原元素decodedDuration3,007ms，click-end→首AX回傳真上界16,077ms；指定quiet5,005ms不是實測首觀察時刻，不代G7。

私人保存最後request仍trusted media UnknownError，沒有transaction complete／abort；after unknown=true／native=null且沒有之後DB交易，不reopen或force-abort。原validateBackup契約正規化後，真正下載的完整筆記與before完整資料deep-equal；一筆非空合成marker、原片URL／hash及舊retained四項subset都保留（新增validation／output後共六項）。救援介面讓原片連結由隱藏變可見是預期UI改變，不誤稱整個link物件相同。四檔核對完成後才普通Leave／關自己的產品視窗，未知transaction結果仍未知；shared Safari與未知視窗保持。

站點和host停止後，真正另存檔在新自有private視窗首次開啟，自然由0秒／Pause／滑桿.019到3秒／Play／1；無seek／重播，未見可見錯誤。JS ended／error／drops未觀測、人耳未驗，不能寫error0或零掉幀。只關自己的fileplay視窗。原host收據exit0／browserStopped=false／留鎖與其後own context／PID不存在／實際port拒連61／匹配nonce稽核釋鎖分開保存，不宣稱物理codec退出。本輪未變更設定或接受降低防護；其他隱私組合與預設組合未完整驗證。

### 修改測試範圍後的三個選定App情境：新輪3PASS不覆寫首失敗

原首輪1PASS／2FAIL及8項封存永久保留。後續取消測試把真正hidden驗證另留native模式，headless選定情境改測可建立的setup Stop及停止後晚交付真結果；錄影資源斷言則區分冷AudioContext的全頁shared monitor與每次capture gain。新輪是Chromium156的三個選定情境，不是完整App矩陣或Safari真背景驗收；nativeBackgroundRequested／Verified都false。

新run SHA256 77da68b1a6fd908b082f7e1ea1b89390be2b7f9abc94a2da3ab3f7a35f31bcc7，base9cf＋測試適配staged tree3a6b196cbb1c1f7b1aa754f67c31590efbd94ee5（31檔）、trackedChanges=true；32個App來源指紋包含main0a6與原相同後端。webkit-audio-branch／explicit-pts-owner／webkit-capture-branch分別PASS，1,187／1,548／30,632ms；run errors空，browserClosed／serverStopped true、lockRetained false，不冒稱獨立物理程序退出。

真Worker能力邊界拒絕後解除恢復、setup Stop，以及停止後晚交付原生52,005B Blob均核完整資料／原片／舊VS保全；晚訊息trusted、target／request id／handler匹配，仍不接納，之後另次retry能產真MP4。owner共四個自有Worker的terminate呼叫返回，未證物理編碼器退出；此晚交付不是證明編碼器在terminate後才完成。原route清理的already-handled訊息亦保留，不把頂層errors空當沒有任何工具訊息。

capture從真冷context開始：全頁shared monitor一個、connect0／disconnect0，不聲稱每輪釋放；兩輪capture gain各connect1／disconnect1，context末態suspended。原2000ms暖機期限、取消與失敗保全斷言保持；四份實際下載列於原收據，這裡沒有新增播放／解碼結果。這一headless輪沒有驗真正背景，後續完整原生Chrome情境另列下段；此3PASS不可改標舊前提失敗，也不替代完整84案／CI。300秒僅靜態準備後暫停，沒有新增長片成功或RSS證明。

正常check在這次native首案前已實際exit0：781 pass／0 fail／4669 expects、typecheck、19既有lint infos、buildd956。早先受限環境774 pass／7 fail照留：六處listen port0回EADDRINUSE，另一build子程序exit1未擷取子stderr、原因不能逕定相同；不弱化或跳測。此處不預勾尚未完成的最終hook／commit／CI／merge；原#11／#13與未驗格式／rotation／VFR／follow／overlay／300秒峰值／人耳／完整G1–G7仍依原驗收保留。

### 真背景事件的完整owner情境：Chrome原生視窗，並非Safari裝置

後續僅一次完整owner原生情境已PASS，20項seal 9c7b07f7f3fba1595f8a8328cf1e174482b18d6144fb4386e267d36a053bffa3；來源仍tree3a6b／buildd956，scenario SHA256 1748ff07afded348d735e4d72e26e063accd656f88ff6acfee1c5ba88f36e8fa。實際engine是Chrome156.0.8078.80 defaultContext，只用UA選Safari產品分支，不能稱Safari真機；亦有retained-full-interface初始化轉接、只阻擋自有origin的SW註冊，非預設首頁或離線驗收。

setup-stop、setup-background、held-native-result-after-stop三階段完整資料／舊VS bytes及來源均保留，真visibility事件為hidden:true／trusted:true後hidden:false／trusted:true，不是假送事件或改getter。五個自有Worker各terminate1／return1；晚交付真52,005B Blob的trusted／own target／request id／handler均核對，Stop後不接納，同頁retry從一份舊export成兩份且舊筆記／來源／VS不變。這是攔住原native MessageEvent再晚交付，不證編碼器在terminate後才自然完成；沒有把terminate返回稱物理資源退出。case observationErrors／cleanupErrors空，原首輪hidden前提失敗仍不改標。

CLI close exit0、launcher exit0，server143是自己的SIGTERM，已記自有PID不存在及匹配nonce釋放；最後port探針在受限環境回PermissionError／errno1，**沒有證明port拒連**，不能移用Safari主機的實際61。未獨立核全部descendants／物理codec退出。三個選定App成功輪另有8項seal c7b9a65697831ddf83f9b88c8d1125f418ee34d4e3c2711db20dad21bfbca2dd；兩路逐項SHA／原收據核對，但沒有因此宣稱完整84案、CI、Safari背景、其他格式／300秒RSS／人耳或完整G1–G7通過。

重現沿用[MEDIA_PROBE的「#8 練習循環」原生背景流程](../MEDIA_PROBE.md#8-練習循環)，不用新增工具。先依共用媒體鎖串行準備既有合成素材與建置，開一個專用產品主機：

```sh
bun --no-env-file tests/app-coverage/prepare-fixtures.ts
bun --no-env-file scripts/build-web.ts
bun --no-env-file scripts/serve-web.ts 4174
```

另一終端只把原launcher換成PTS模式（每輪fresh profile，不能同時跑其他媒體）：

```sh
bun --no-env-file scripts/launch-native-browser.ts --pts-export
```

第三個終端沿同一份原生defaultContext設定與三個CLI步驟；session名稱每輪另取、前次只關自己的session／launcher後才啟下一輪：

```sh
npx --package @playwright/cli@0.1.22 playwright-cli --session dance-pts-native open http://127.0.0.1:4174 --config output/native-controller.json
npx --package @playwright/cli@0.1.22 playwright-cli --session dance-pts-native run-code --filename output/native-background-run.js
npx --package @playwright/cli@0.1.22 playwright-cli --session dance-pts-native close
```

核真正`### Result`的`status:passed`與`nativeBackgroundVerified:true`，出現`### Error`或failed就保留本輪log，不以退出碼或重跑覆蓋。關自己的CLI session後回launcher終端Ctrl+C，只停自己的Chrome；產品主機亦單獨停止，保存原stdout／stderr／Result與清理稽核。此入口仍是真Chrome＋Safari UA分支、retained adapter與自有origin SW阻擋；上述Safari、預設首頁、離線與物理退出限制全保留。


## PR265 首輪CI與平台能力分工候選（2026-11-03）

原精確head `5dec532ad4d058b3bf595e24846a66ed81f2fb23`／run41656988618：Harness與Linux安裝驗證成功，Ubuntu App首輪81PASS／3FAIL。原webkit-audio／capture的PTS基準被真正AAC encoder能力拒絕；owner後續missing retained Blob是尚未成檔就讀snapshot的症狀，不是新資料遺失證明。原2+10下載離站驗證、badge與報表上傳因App失敗skipped，沒有raw run.json artifact，不能補稱已驗；首次完整CI log保留本機，失敗不rerun挑綠。

白話：某台機器沒有這個製片零件，就在那台驗證「清楚拒絕且資料不丟」；真正做片、取消和重試仍要到有零件的機器完整驗證。這是測試平台分工候選，不改產品codec／PCM／時間／保存護欄、不加軟體encoder，也沒有聲稱新版已通過。

技術：原84案catalog抽到單一來源；Linux無參數／CI明選linux-full完整計畫為原其餘81案＋native-aac-refusal=82，實際原生AudioEncoder配置false才接受其原拒絕，真Chrome產品舊VS與筆記／原片保全另核。該負例直接呼叫產品owner／真Worker，非Safari產品UI成功或整個Linux永遠不支援。原三個成功／能力故障恢復／取消與冷context capture案例放固定macos-15必要工作，Mac無參數仍full84，Mac CI明選三案且無skip；VM實際能力與首次結果待驗。三份Mac counters不併Linux badge；32自有模組仍全分母，Linux badge明示完整平台計畫。always硬gate與badge publish皆要求Linux與Mac成功，不能以Mac失敗後skipped當pass。

兩個原下載verifier只在自動搜尋或full/linux-full收據核完整catalog；原顯式argv指定selected輪仍保留原source／目標scenario／bytes／cleanup／自然播放等嚴格檢查，selected不得出badge。每平台精確unique名稱／原順序／全部PASS；失敗另上傳匿名run.json與unit-errors，不傳profile或媒體。owner基準先檢查原成檔status，再讀snapshot保留真首因。

[Mediabunny官方能力界線](https://mediabunny.dev/guide/supported-formats-and-codecs)：庫不能保證各browser的WebCodecs codec；固定1.65.0仍轉交原生isConfigSupported。[固定Mac15 ARM64官方映像](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md)是選runner依據，既有Chrome與FFmpeg命令仍在該輪實際核對，缺FFmpeg才安裝brew formula；不以映像清單預填AAC成功。重現預定用既有prepare-fixtures後Linux `bun --no-env-file tests/app-coverage/run-app.ts --linux-platform`，Mac `--mac-pts-platform`；一般開發入口Linux無參數自選82、Mac無參數原84。此節記錄靜態準備階段，當時尚未port或執行新版unit／瀏覽器；後續已套入測試與CI修正，最終實測／commit／CI另綁，不預稱通過。
