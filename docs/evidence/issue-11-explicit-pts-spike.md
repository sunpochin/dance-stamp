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
