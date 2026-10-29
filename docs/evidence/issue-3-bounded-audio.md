<!-- 檔案用途：綁定 Safari 有界音訊候選的匿名驗證與缺口。所在層：工程證據。主要關聯：TECHNICAL.md、RECORD_COMPARE.md、local-audio.js。 -->
# #3／#11 Safari 本機有界音訊候選

最新345b2d1一般Safari九案／十輪、原生檔播放／正常VS重載與私人四次護欄拒絕見[整合原生證據](p0-safari-reliability-integration.md#345b2d1-原生-safari-的同版證據)；私人新VS失敗／未確認救援仍未到達，不宣稱Safari P0或裝置通過。#62／#63由其他流程合併，主聊天未執行；以下各輪原始來源、失敗與當時狀態保留，iPhone暫緩。

原工程輪狀態：2026-10-29，尚待 Claude Code／使用者獨立審查；當時不合併／發布，不關閉 #1／#3／#11。來源基線 main `918d8d7aa814533823522e3d4e0ab18df75cb212`。

本輪把已知能保留來源起點的 AudioBufferSource 原型轉成有界 AAC 封包解碼。規格、索引／PCM／queue 預算與拒絕行為見 [TECHNICAL 第 33 節](../../TECHNICAL.md)。Chrome 原路徑不變；Safari 不支援的來源明確拒絕，不默默回退已知漏音的元素來源，也不重置資料。

## 探索結果，不算乾淨 head 的正式矩陣

真正 macOS 27.0.1／Safari 27.0.1，一般新視窗、全新自有 origin、controller=null、頁面執行標記 `bounded-aac-v1`、初始筆記數 0。僅自製 65 秒雙片，沒有真人媒體、實體相機、麥克風或外部服務；每輪真正下載後以未改動 v5 完整解碼。

| 靜態版（sourceDirty=true） | 15 秒／1× 結果 |
| --- | --- |
| `97846b1a0b0d3704` | 50ms 排程前置；449 格、29.893fps、來源覆蓋成立；聲畫最大差 116.667ms，原門檻拒絕，未擴大矩陣 |
| `24b229fb35bd7cd3` | 10ms 排程前置；449 格、29.874fps、聲畫最大差 35ms、三點 33.333／0／0ms、新漂移 -33.333ms、兩側重複最長 56.666／110ms、來源覆蓋成立；人工收集完整耗時上界 94,159ms，v5 整體仍拒絕，不能記為正式通過 |

第一輪之後隔離比對兩種真正 native PCM：48kHz，零點可辨訊號皆在來源 2/48000 秒；有界解碼第一包 timestamp=-21,333µs，第二包 0µs。表示未重現來源零點漏失，沒有靠平移解碼內容修聲音。10ms 是給音訊排程的正向前置，並非減去裝置補償。正式耗時需自按匯出至本輪讀回／保存成功自動記錄，不能以 JS timeline 的 14.9 秒替代完整時間。

raw、下載檔、PCM 診斷與失敗分析都只留本機 ignored output；不公開本機網址、原始檔名或媒體。後續數據須綁定乾淨 head、靜態版本、實際執行標記及 controller，不能只憑 server hash。

## 正式同版桌面 Safari 結果

受測乾淨 head [`eb8f10dc49e8a44aa7f5ef4c2c7f604569c3527e`](https://github.com/sunpochin/dance-stamp/commit/eb8f10dc49e8a44aa7f5ef4c2c7f604569c3527e)，靜態 `cbf341585240931f`，macOS 27.0.1／26A434，真正 Safari 27.0.1。兩批都從全新自有 origin、一般新視窗、初始筆記數 0、controller=none 開始；頁面可見 `RUN cbf341585240931f / executed=bounded-aac-v1`，不是只有 HTTP 主機版本。每批內重新選片、不清庫、不重載，產品 JS 原樣載入；QA 控制不進產品。

受測產品 main.js SHA256=`2d633b80e9a4ad361278b4d29e881eeccf3985f27b63ceb0e8db354b2d071e0f`，local-audio.js=`a13d9bdeb2bcdf8298cd2258a1f1444b143003f2ff6c4c2e7e2e24fa6f6cdcd2`。後續文件提交若保留相同執行資源，仍以這個 head／靜態版歸屬數據。

只用 65 秒自製 H.264／單聲道 48kHz AAC 老師片與無音軌自己片，A=0、offset=0、獨立鏡像皆 false；不延伸成其他 AAC 格式、雙聲道、MOV、WebM 或實體媒體通過。每輪按產品匯出，到本輪驗證讀回及保存完成才自動記錄完整耗時。真正觸發產品下載連結，再從瀏覽器下載檔核對 bytes／SHA256 與保存 Blob 相同，最後交原版 analyze-media.py v5 獨立完整解碼；不改分析器、時間戳、起訖或門檻。

| 比例／輸出長度 | v5 結果 | fps／格數 | 聲畫最大差 | 起／中／末誤差；新漂移 | 兩側最長重複 | 完整匯出上界 |
| --- | --- | --- | --- | --- | --- | --- |
| 1×／15秒 | 通過，完整來源覆蓋 | 29.927／450 | 33.333ms | 33.333／0／0ms；-33.333ms | 58.333／115ms | 15,231ms |
| 1×／30秒 | 約26秒被產品原250ms同步護欄拒絕，矩陣停止 | 未成檔量測 | 未量測 | 未量測 | 未量測 | 未完成 |
| 0.75×／15秒（獨立補驗） | 通過，完整來源覆蓋 | 29.900／449 | 66.667ms | 44.444／-33.333／-33.334ms；-77.778ms | 73.333／111.667ms | 15,206ms |
| 0.5×／15秒（獨立補驗） | **失敗**：completeRecipeCoverage=false，原v5拒絕 | 29.860／447 | 65ms | 66.667／-33.333／-33.334ms；-100.001ms | 105／83.334ms | 15,186ms |

三份真正下載檔都是 1280×720 H.264／單軌 AAC，可完整解碼；提示音數／配對分別 15／12／8，聲畫差均在原 100ms 內。這只能支持所測音訊改善：0.5× 的最大內容時鐘誤差仍 116.666ms、解碼視訊跨度約14.891667秒，完整覆蓋及漂移未過，不能因容器14.97秒或音訊正常就寫成功。1×／30秒沒有本輪新保存 VS，前次成功 VS 下載連結及診斷保留；該輪未裝被動 recorder 收集，沒有失敗片段可供逐格分析，不能補造 fps／音訊數據。

**結論：有界音訊工程候選已可審查；Safari 畫面／長片同步仍阻擋正式 P0。** 不再把這批補成完整九組，也未執行十輪60秒穩定性；剩餘矩陣、G6／G7保留。沒有以重試挑成功、提高250ms／100ms門檻、移動時間戳或截首尾消除失敗。

## 單元、Chrome 工程與原能力回歸

Bun 1.4.4 的原 check／pre-commit／pre-push 通過：372 tests／1060 expects／0 fail，包含 checkJs、Biome、公開內容掃描及建置。[受測 head 的 Harness CI #94](https://github.com/sunpochin/dance-stamp/actions/runs/40744292069) success；最終文件 head 的 CI 另在 PR 核對，不把 CI 當媒體驗收。

單元涵蓋 edit list／來源零點、讀取前 metadata／索引／封包上限、拒絕錯誤 offset／碎片／codec、固定 PCM 片段、八包 queue、AudioData close、預先及解碼中取消、原生解碼錯誤、不同來源重試及無音軌。

同一乾淨 `eb8f10d`／`cbf341585240931f`，隔離 headless Chrome 156.0.8078.49：

- `local-audio.js` 工程回歸以 UA 選 WebKit 分支，實際仍由 Chrome 原生 WebCodecs 解碼，不冒充 Safari 證據。來源零點 50ms 內 PCM peak=1.012708、3秒配置144000 frames，另測12秒起點。格式拒絕、準備取消、合成取消不破壞前次 VS、不新增假完成，同頁重試與換無音軌老師片成功；5個decoder全部close、觀察到618次AudioData.close、所有buffer引用清空、目的端tracks ended。
- 原 `comparison-pitch.js` 三速度實際下載並獨立完整解碼：330／495／660Hz符合自然變調，自己880Hz未混入；比較暫停及繪製失敗恢復一般練習音高，前次輸出保留。
- 原 `existing-no-camera.js` 在相機API完全不存在時，正式入口、老師12秒／自己4秒、5秒輸出與保存成功，無對外請求。
- 原 `export-failure.js` 真正注入所有格式無法建構、編碼錯誤、新檔解碼錯誤、讀回取消；原片、配方、前次VS及tracks清理通過。同頁改用真正 VP8／Opus WebM 成功。原分析工具完整解碼 MP4／WebM 各90格，fit／鏡像及單一老師聲源通過；四份失敗後重新下載的舊VS bytes／SHA256相同，兩側原片指紋前後相同。

這些回歸不取代新的 Chrome 完整24組、Safari真正背景／路由或物理相機驗收；本次沒有放寬 Chrome 原本長來源／無音軌／WebM 能力，也沒有新增套件、服務、schema或資料遷移。

## 審查續修：空 edit 與獨立音訊時鐘

從 `05099e5` 接續兩項審查。先以兩秒空 edit、正常 edit 略過來源一秒的合成 MP4 重現：舊版會把已丟棄的聲音寫入兩秒前應靜音的區間；新增單元在修正前失敗。現在另外保留正常 edit 的呈現下界，解碼暖機封包仍送入 decoder，但 PCM 複製不能越界。完整片段及從空白中途開始的片段，雙聲道在界線前皆為零、界線起有聲，且 decoder／AudioData 全部釋放。這是容器／PCM 邏輯回歸，單元使用合成解碼器，非 Safari 原生媒體證據。

另在真正 Chrome 的工程用 WebKit 分支重現正式 `play()` 延遲 180ms：舊版仍保存音訊領先的輸出，新增 `local-audio-clock.js` 在修正前失敗。修正後比較 AudioContext 排程起點與老師的共同經過時間，沿用 G2 上限；延遲啟播及非 paused 的短暫減速 180ms 都拒絕成檔，前次 VS／export 數不變，buffer／tracks 釋放，之後重試成功。短暫減速使用瀏覽器實際接受的 0.0625×；最初不支援的測試速率紀錄保留，不計為產品故障。

受測修正版靜態 `adbe8eb1d6acfd09`，`main.js` SHA256=`c0d092f7ed322e924ca3a43d79b6c6696d1032f08001759b4e0f3e539f055689`、`local-audio.js`=`456d0d080e395574160f547554bd224933dff8d3ebc6f7898f467776dd996ea3`。原 check 為373 tests／1074 expects／0 fail；公開掃描與 hooks 在提交時另核對。既有有界音訊瀏覽器回歸通過：真實 WebCodecs 零點／12秒片段、格式拒絕、準備／輸出取消、重試與換無聲來源；5個decoder全部close、618次AudioData.close，buffer引用與目的端tracks釋放。這是 Chrome 的實際解碼與 UA 分支選擇，不冒充原生 Safari。

正常 Chrome 聲路另跑原有無相機入口及三速度音高回歸，只有下載目的檔名改到新的本機資料夾，保留舊檔與全部斷言。老師12秒／自己4秒的五秒輸出實際成檔；三份三秒輸出完整解碼，330／495／660Hz符合0.5／0.75／1×，排除自己880Hz與錯誤保留原音高。四份下載全片解碼無錯，取消／繪製失敗保留舊片並恢復一般練習音高；不宣稱新完整24組。

這兩項修正選擇保留正確靜音、拒絕錯位輸出，沒有增加新的時鐘控制器或更改首尾、offset、G2／G3／v5門檻。上方原生 Safari 的通過／失敗仍只屬 `eb8f10d`；修正版尚未完成原生 Safari 品質矩陣，0.5×覆蓋與長片仍待處理。

## 後續逐格追查：開始畫面與實際視訊時間

2026-10-29 重新讀取三份已保留原生下載檔，以原 v5 的 `frames`／`probe`／`run` 函式逐格解碼；沒有改讀取位置、門檻或原媒體。每份實檔 SHA256 另與其原始 JSON 的 downloadSha256 相同，均屬 `eb8f10d`／`cbf341585240931f`，不是新 head 的原生測試。

三份 15 秒片（1×／0.75×／0.5×）最早視訊 PTS 都是43.333ms，老師時間碼為第1格、自己為第0格。0.5×片的第一組因此已有66.667ms配方誤差，末端為−33.334ms；原 v5 的新增漂移仍是−100.001ms，不因接近邊界而放寬。該片447格，最後PTS14.900秒、末格老師224／自己449，對應的來源尾部覆蓋仍到合法交集末端；但整段實際視訊跨度只有14.891667秒，比15秒少108.333ms，原完整覆蓋檢查仍拒絕。容器14.970秒與來源末格看似正確，不足以證明完整視訊時間。

這些觀察把下一輪收斂到「第一次擷取是否先保留已校正、尚未啟播的畫面」及啟播／停止時鐘；尚不能只憑時間碼斷定瀏覽器內部原因，也未提交猜測修正。已備妥固定 c211c94 執行資源的私有觀測頁，僅旁聽產品既有 rAF／requestFrame 與原生編碼事件，不新增影格訂閱或擷取，並能保留被護欄拒絕的編碼片段供分析。因 Mac 鎖定，這份觀測頁尚未完成原生執行；不把服務啟動、Chrome 回歸或歷史結果記成新的 Safari 通過。

觀測工具另經隔離 Chrome 的工程用 WebKit 分支核對，原有延遲啟播／短暫停滯拒絕、前次 VS 保留、資源釋放及重試全部通過。實際下載一份被拒絕的14,225-byte H.264／AAC編碼片段並完整解碼，只供診斷，不是成功 VS 或品質通過。工具第一版曾在下載時讀到後一次重試的狀態；已保留該工具失敗並改在每輪操作結束時固定快照，核對同一份 JSON 同時保留當輪偏移拒絕及後來重試成功的不同狀態，不沿用前一輪音訊時鐘。修正後工具來源另留 SHA，未改產品來源，也未以這個 Chrome 工程對照替代 Safari 原生結果。

## 提交後 Chrome 原24組完整回歸（2026-10-29）

受測來源 `13976bb83e259be699f7c822cc125850e776f81e`，各 raw 均為 sourceDirty=false，靜態 `adbe8eb1d6acfd09`；14份Web資源與 c211c94 相同。macOS27.0.1、實際安裝 Chrome156.0.8078.49 的 headless 模式、Bun1.4.4、FFmpeg8.1.2。使用原合成相機旗標與既有測片，啟動後另核對自有程序樹確實含假裝置、假權限及指定合成視訊檔；沒有 UA 覆寫或實體相機／麥克風存取。

原 `run-media-feasibility.py` 六模式與原v5逐段分析全部通過：三速度×15／30／60秒9組、同資料庫10輪60秒、WebM1組、正負偏移與獨立鏡像2組、失敗恢復1組、額外60秒完整耗時1組，共24組。這輪驗證合成相機錄影→VS；既有雙片的短流程與三速度音高仍保留 c211c94 的原證據歸屬。

| 指標 | 本來源結果 |
| --- | --- |
| 最大老師提示音／畫面差 | 88.333ms |
| 最大逐格配方差／新增漂移絕對值 | 48.911／42.511ms |
| 最長非預期重複畫面 | 70.966ms |
| 最低平均影格率 | 29.943fps |
| 最長完整匯出上界 | 64,003ms |

48份實際下載的原片／VS皆經原分析流程全片解碼，另保留每份bytes與SHA256清單。資料庫逐例檢查所有預期媒體可讀且非空，最後24份take與24份export對應48份媒體、missing=0；本輪下載指紋不冒充新的逐份IndexedDB bytes比對。恢復負向控制包含預覽／匯出取消、拒播／影格拒絕、quota導致當次未保存的輸出，以及偵測缺失Blob後還原；結束時影格訂閱pending=0。沒有清庫、改門檻、裁首尾或換來源片段求通過。

十輪維持同一瀏覽器context／IndexedDB，每輪依原腳本重新導航；常駐不重載的記憶體、熱、電池與實體G7仍保留。這是Chrome合成資料的工程回歸，Safari新runtime、真實相機光學／聽感、真實前景／背景與跨裝置仍須各自驗證。自有CLI／Chrome已退出，主機停止、本輪nonce鎖已釋放；其他已授權工作之後取得新鎖，不屬於本輪資源。

本機逐例raw、v5報告與48份指紋彙整保留於ignored output，媒體不進Git或公開附件。可重現入口仍是[媒體驗證](../MEDIA_PROBE.md)的原腳本，依序跑 matrix、stability、webm、alignment、recovery、performance；此次label為candidate-13976bb。後續文件提交與打包另記來源及校驗，不把舊head結果改寫成新head重跑。

## 清理與未驗證

所有自有一般 Safari 視窗、隔離 Chrome sessions、測試服務與 nonce 媒體鎖已結束；僅關自己的資源，未清他人的 SW／DB、接管既有私人視窗、改 Profiles／遠端自動化或啟動真人相機／麥克風。原片、raw、下載檔、分析及本機測試入口留在本機 ignored output／本聊天工作目錄。

實體相機 G1／光學 G2、iPhone／Files／分享 G5、相機 capture→export G6、完整三速度／三長度與十輪60秒、私人模式、其他來源格式／取樣率／雙聲道、低記憶體壓力、熱／電池、藍牙／來電及發布仍未驗證。#1／#3／#11 保持開啟，候選待 Claude Code／使用者獨立審查；無設備不視為平台失敗，不啟動 iOS fallback。


## 整合版續測與起點等待候選

2026-10-29（Asia/Taipei），Mac 解鎖後由主聊天在自有一般新視窗直接操作真正 Safari 27.0.1／macOS 27.0.1；不改 Profiles、瀏覽器設定或啟用自動化權限。每份觀測頁有不同執行識別／全新 loopback origin、controller=none、initialVideos=0。僅用同一對65秒合成老師／無聲自己片，A=0、offset=0、鏡像皆false；選片由原生檔案選擇器完成，不開相機／麥克風。

產品與私有原型分開：產品提交先重建14份資源並逐檔綁SHA；只有HTML載入額外QA，產品程式原樣。QA旁聽既有rAF／requestFrame、原生編碼片段；後續原型及f88觀測另包住既有play／影格回呼及原生事件，不新增診斷影格訂閱或擷取。原型修改則逐份標示，不移記為產品修好。`requestVideoFrameCallback`是提交合成畫面的通知，並非精確同步保證，詳見[WICG原始說明](https://wicg.github.io/video-rvfc/)；本輪結論仍由實際原生事件及完整下載檔判斷。

### 乾淨整合來源 e0acf88

受測 `e0acf88391c31ce75a5419d80a1e77691b316eb3`／`adbe8eb1d6acfd09`，執行 `visual-c62f04ca1513`，產品main SHA `c0d092f7ed322e924ca3a43d79b6c6696d1032f08001759b4e0f3e539f055689`。三次依序在同一頁執行，不重載、不清庫：

| 次序／配方 | 實際結果 |
| --- | --- |
| 1／0.5×、15秒 | 新100ms獨立音訊護欄拒絕，未保存新VS；第一個手動requestFrame前即失敗。原生拒絕片段14,843 bytes、容器0.095秒完整保留，不當成完整15秒輸出。 |
| 2／1×、30秒 | 產品成檔及保存成功，下載2,418,974 bytes；產品檔與旁聽到的原生chunks逐byte相同。原v5完整解碼、完整配方覆蓋true，900格、29.980fps、聲畫最大43.333ms、三點33.333／-33.333／-33.334ms、新漂移-66.667ms。容器30.020秒、視訊跨度29.953334秒；本輪沒有完整點按至讀回／保存的計時，performanceVerified=false，故整體withinSyntheticTargets仍false，不補造G7通過。 |
| 3／0.5×、15秒同頁重試 | 再被100ms護欄拒絕，仍在第一個手動requestFrame前；前次30秒VS連結保留，失敗後真正重新下載的完整bytes／SHA仍相同。 |

前次VS SHA256 `b85405466f3fd7c8814d6bcf74fdb7c2842d07ba6a77090463164fe403a3de91`。第一次半速的recorder start到stop為216ms，參考片時間約52ms；第三次則31ms、參考片約58ms。這只定位到啟播邊界與不同原生時鐘，停止事件中的數值亦可能在清理後才讀取；不能拿stop快照反推護欄當下的精確差，或當成瀏覽器內部根因已確定。

### 三份未採用的私有對照

以相同e0acf88資源另建新origin，只改等待／時鐘假說；都沒有寫回產品。完整耗時由點按捕捉階段至產品操作結束的MutationObserver量測，包含準備、讀回及保存；原v5、輸入片段、首尾與門檻不變。

| 私有修改／執行識別 | 0.5×、15秒原v5結果 |
| --- | --- |
| 跳轉前訂閱一次影格並等待seeked＋呈現，`seek-frame-dcefc4131cd8` 第1輪 | 能成檔，首格覆蓋誤差0；聲畫最大71.667ms、三點0／-33.333／-66.666ms、視訊跨度15.018334秒。但容器15.105秒，超出原長度容差，completeRecipeCoverage=false；完整耗時15,325ms。 |
| 同一原型第2輪 | 能成檔，首格誤差0、聲畫81.667ms、視訊跨度15.020秒；容器15.103333秒仍未過完整覆蓋，完整耗時15,354ms。兩輪失敗均保留，未挑成功輪代替。 |
| 另以BufferSource音訊時鐘作同一進度／結尾來源，`audio-clock-b6a99fd0e1a7` | 能成檔，聲畫71.667ms、視訊跨度15.020001秒；容器仍15.105秒、完整覆蓋false，完整耗時15,321ms。這個假說未改善尾端，因此未採用。 |

三檔均1280×720 H.264／單軌AAC，全片解碼、8次音訊／閃光配對；首中末同步及視訊跨度改善不代表容器長度通過。尾端超標3.333–5ms仍是失敗，不四捨五入成100ms、不裁掉檔案、不平移時間戳，也未由此判定一定是AAC padding。原型的影格metadata也曾在currentTime=0時回報自己的舊0.1秒；不能只用這個metadata推斷Canvas實際像素。

### PR #64 的原生起點等待逾時

另直接驗證已提交的[後續候選 PR #64](https://github.com/sunpochin/dance-stamp/pull/64)，乾淨來源 `f88c28d88b6b13c2aad39b9b8541bcd42866d6b2`、靜態 `0379406c3618c580`、執行 `native-f88-324a21d3d2`。14份產品資源逐檔綁SHA，沒有使用上述私有修改；觀測JSON SHA256 `fbab2256a99e4c99cfd46cb3ebe63cfee5babbf25c45e70f3cb764f2d0416cfe`。

相同0.5×／15秒配方中，兩側暖機均回報前進到mediaTime=1/30秒，再暫停並定位到零。相對頁面單調時間54,747ms，兩側seeked完成且currentTime皆0；54,760ms的原生影格回呼，老師mediaTime=0，自己卻回報0.1秒、currentTime仍0。候選只接受mediaTime≤目標，故重訂閱自己；暫停期間沒有下一個回呼，15秒後產品回報「等待比較畫面逾時」。沒有建立MediaRecorder、沒有新輸出；export診斷為null。這是直接原生失敗，不能由該候選的單元結果宣告啟播已修復。

下一步須依這個原生事件順序重做目標畫面的等待判斷，保留取消、錯誤及影格／seeked先後顛倒的清理；另獨立處理原型尾端長度，不採取固定裝置延遲或修改分析門檻。尚未做新來源的九組矩陣或十輪60秒、實體相機／聽感／跨裝置、私人模式交易恢復及最終獨立審查；iPhone仍暫緩。

raw、下載檔與原型只留本機ignored output。四輪自有主機及nonce鎖已釋放，只關閉本輪自有一般視窗，原有私人視窗未動；其他工作串持鎖時的啟動被原子拒絕，沒有刪除或搶用其鎖。#62／#63由其他流程合併的事實與以上實測分開記錄，主聊天未執行合併或發布，本輪不關#1／#3／#11。

### eb21064 續測與三份私有收尾對照

同日依使用者授權與 Safari／容量／整合三個既有聊天同步結果及協調媒體鎖。PR #64 修正暫停回零時把舊 metadata 當像素證據的等待條件後，以乾淨來源 [`eb21064eacca4d4161a71c46c84a4bfe4da646f3`](https://github.com/sunpochin/dance-stamp/commit/eb21064eacca4d4161a71c46c84a4bfe4da646f3)／靜態 `52f9c2ff7d12abd1` 原樣建置14份產品資源；執行 `native-eb-ebc167f0f5`。main SHA256=`6ed3e9f6452e345e3104ef6f890ec1f679b5fa0a8fe28dd5a2d8609e3b52b8aa`，recorder=`d15569a28b39e13cdaddbefa15c3607be0f1c407d782222d2191a1558665e539`，被動QA=`bdc841f2f96c7e72811729541b2d9ab67a48fdc356bd54f9dc8c33b1580d3edc`。仍是真正一般模式 Safari、新自有origin、controller=none、initialVideos=0；沿用上節合成雙片與配方，沒有相機、麥克風或真人資料。

兩輪在同一頁依序執行，不重載、不清庫。完整耗時由點按匯出至當輪準備／讀回／保存完成自動固定；真正產品下載檔與被動收集的原生chunks逐byte／SHA相同，再由未修改v5完整解碼。

| 配方 | 原v5結果 | 成檔與同步 | 完整匯出上界 |
| --- | --- | --- | --- |
| 0.5×／15秒 | **通過此單輪**，完整來源覆蓋成立 | 容器15.100秒、視訊跨度15.016667秒、451格／29.868fps；音訊／閃光8／8、最大聲畫76.667ms；三點−100／−33.333／−100ms、新漂移0。兩側起點覆蓋0／100ms，仍在原門檻邊緣，不能宣稱穩定。 | 15,427ms |
| 1×／30秒 | **失敗**，只有容器長度未過原覆蓋條件 | 容器30.105秒，比原±100ms多5ms；視訊跨度30.020秒、901格／29.929fps；音訊／閃光30／30、最大聲畫40ms；三點0／−33.334／0ms、新漂移0，兩側來源覆蓋及其他原條件成立。 | 30,482ms |

15秒產品檔1,072,230 bytes，SHA256=`7c5ecb5507397a29d9655774b4370272f033d165f957c247143f9a49e9863d7a`；30秒產品檔2,442,234 bytes，SHA256=`0173498214e1262fb61f6a8a267e1b351d803c995ce223e6e545474c36499f97`。這次解除了所測啟播逾時，沒有完成九組矩陣、十輪60秒或新檔在網站外的原生完整播放；v5全片解碼不能代替後者。長度失敗未四捨五入成通過，矩陣在此停止。

接著各從相同eb21064資源建立私有新origin，只改一項時序假說，維持原配方、音訊、編碼候選、v5與門檻；三份都未寫回產品：

| 私有修改／執行識別 | 1×／30秒實際結果與決定 |
| --- | --- |
| 時間線結束後先停止自己的輸出軌，再等待recorder停止；`stop-input-de791685e9` | 容器仍30.105秒，視訊跨度30.020秒、901格，原v5失敗；最大聲畫40ms、完整上界30,482ms。沒有改善，否決。 |
| `start()`不傳每秒timeslice；`single-output-8909a70bbb` | 容器30.103333秒，實際解碼視訊跨度只有15.985秒、481格／15.978fps；音訊30次但閃光只有16次，兩側尾部來源覆蓋各少約14.067秒，原v5失敗。否決；不能只看30秒容器就認為成檔完整。 |
| recorder呼叫start後、等待原生start前，立即重畫並requestFrame；`initial-frame-9d0c28ca2c` | 呼叫時兩側currentTime皆0，早於原生start約7ms；但實檔最早視訊PTS仍43.333ms、容器仍30.105秒、視訊跨度30.020秒／901格，最大聲畫106.667ms也超標。完整上界30,539ms，原v5失敗，否決。 |

最後一份另被動記錄start呼叫／原生start、dataavailable、stop呼叫／最後chunk／原生stop；沒有新增影格訂閱。提早呼叫requestFrame沒有完成回執，不能以呼叫順序冒充首個編碼影格已提早。上述實檔、失敗raw及精確原型SHA均只留本機；各自有主機停止後才依nonce釋放鎖，沒有搶用其他聊天的測試。下一步仍須找有原生證據的首尾修正；不裁片、不平移時間戳、不加固定毫秒補償，也不更動原分析器取得綠燈。iPhone持續暫緩，#1／#3／#11與獨立審查保留。

## 起點呈現等待的後續候選（原提交時狀態）

先從 `676ba50` 接續；推送前核對到 #62 已由另一個流程合併並刪除分支，因此本輪移到同步 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e` 的後續分支，不重建舊分支。這個聊天沒有執行合併或部署。舊原生下載檔與所有失敗報告保留，沒有重新歸屬其媒體結果。本輪以可控媒體事件重現：只收到 seeked 時舊 seek 會提早完成；第一張暖機影格仍在起點時舊 presentedFrame 也會提早完成，兩個新增回歸在修改前失敗。候選讓 Safari 暖機先收到實際前進的影格，再在回零時等待目標影格及 seeked 都完成；暖機舊格不能解鎖，兩種事件順序均可，取消及原生 seek／訂閱錯誤會移除待完成訂閱。沒有改門檻、首尾、時間戳或分析器，沒有加固定延遲或片尾補長。

這是待瀏覽器驗證的等待契約修正，不能宣稱 Safari 30 秒與 0.5× 已修好。本輪聊天沒有上一輪的原生桌面操作工具，且共用媒體鎖由另一個仍在進行的原生觀測持有；沒有搶鎖、停他人程序或改 Safari 設定。完整 Safari 九組、十輪60秒與本候選的 Chrome 媒體回歸尚未執行，應在原生入口恢復並取得自有 nonce 鎖後先跑短片、再依原門檻擴大。這些阻礙是未驗證，不能寫成新版平台失敗或通過。


### PR #64 原生啟播逾時續修（2026-10-29）

主聊天的真實 Safari 27.0.1／macOS 27.0.1 續測綁定乾淨 f88c28d88b6b13c2aad39b9b8541bcd42866d6b2／靜態 0379406c3618c580，執行 native-f88-324a21d3d2、controller=none、初始影片零筆。`verified-start-timeout.json` 記錄兩側 seeked 於 54747，下一次呈現通知於 54760：reference.mediaTime=0、self.mediaTime=0.1，但兩側 currentTime 均為0。self 嚴格條件不接受該通知，暫停後沒有下一格，15秒逾時且 MediaRecorder 尚未建立。原 observation SHA256 fbab2256a99e4c99cfd46cb3ebe63cfee5babbf25c45e70f3cb764f2d0416cfe 及原始失敗均由主聊天保留；[PR #67](https://github.com/sunpochin/dance-stamp/pull/67) 記錄來源，不將其歸為本聊天操作或新修正通過。

PR #64 續修只移除回零時對 metadata.mediaTime 的精確條件，仍需 seeked 與呈現通知兩者完成後重畫 Canvas。暖機、取消、原生例外清理保留；呈現通知不是首格像素正確的證明。新增同原生事件順序的回歸，修正前兩種順序均失敗，修正後通過；保留 ignored output 的 before／after 紀錄。原 v5 與100ms／250ms、覆蓋、片長、完整矩陣／十輪門檻均未更動，未裁切、移動時間戳或補長。

主聊天另保留私有「只等一次呈現」原型的半速15秒成檔：首格來源誤差0，容器15.105秒及15.103333秒，完整覆蓋仍被原 v5 拒絕。這些不是本次正式版本的媒體驗收，也沒有轉記為通過；音訊時鐘原型仍失敗，未採用。本聊天確認當次媒體鎖不存在、桌面操作工具未提供；依主聊天協調不啟動 Safari／Chrome 媒體測試，由主聊天統一取得鎖及做最後矩陣。iPhone 暫緩，不合併或部署。


## PR #64 WebM 專用候選與原生原型來源（2026-10-29）

主聊天對乾淨 eb21064／靜態52f9c2ff7d12abd1的原生續測：半速15秒通過原 v5，但容器15.100秒、三點配方[-100, -33.333, -100]ms與起點self覆蓋100ms均接近門檻，不能從單例宣稱穩定。1×／30秒聲畫40ms、901格、三點[0, -33.334, 0]ms、新漂移0，實際視訊跨度30.020秒；容器30.105秒仍使完整覆蓋失敗，整例維持原 exit1。

三個獨立私有假說均保留完整檔／raw／原v5並否決，沒有混入正式 runtime：

| 私有改動 | 原生結果與否決原因 |
| --- | --- |
| timeline結束先停本輪輸入軌 | 容器仍30.105秒、視訊跨度30.020秒，完整覆蓋仍失敗 |
| 僅VS取消1秒timeslice | 容器30.103333秒，但僅481格／15.978fps、視訊跨度15.985秒；30音僅16閃，尾部缺14.066667秒 |
| recorder建立後立即重畫／requestFrame | 首個請求在start-call後1ms、native start前7ms，實檔仍從43.333ms開始、容器30.105秒；聲畫106.667ms也被原門檻拒絕 |

下一個私有對照 `webm-eb21064-f6458c357387` 僅把既有候選限制為 `video/webm;codecs=vp8,opus`；start(1000)、原停止、音訊、配方、起訖及分析器完全相同。基底來源仍為 eb21064，不是新正式提交。靜態副本payload SHA256=`4d16a64ee9fb2984550b5c794d782be3801dd14f49cba3ff2edafc500368bb47`、manifest SHA256=`7c0e6528e6f9840c00ca6346a1f609f6dd83fc38c0c558a7c77a267335521e72`，原14份資源逐檔核對；只有recorder候選與載入被動QA的index變動，未改main／音訊／時間線。一般新origin、controller=none及實際頁面execution由主聊天核對，沒有真人相機／麥克風。

真正 Safari27.0.1、同一65秒合成雙片、1×／30秒單例的原v5 exit0：

| 指標 | 私有單例結果 |
| --- | --- |
| 真實輸出 | VP8／Opus WebM，4,784,845 bytes |
| 全片解碼末端／視訊跨度 | 30.0175／30.0175秒；WebM未提供容器duration，沿原v5既有解碼末端規則 |
| 解碼影格／平均fps | 901／30.016 |
| 提示音／閃光與最大聲畫差 | 30／30，40ms |
| 三點配方／新增漂移 | [0, 0, 0]ms／0ms |
| 來源起末覆蓋差 | [0, -33.333, 0, -33.334]ms |
| 最大內容時鐘差／完整匯出上界 | 98.667／30,550ms |
| 原完整覆蓋／全部合成目標 | true／true |

產品實際下載 `dance-vs.webm` 與原生chunks組成檔逐byte相同，SHA256=`8a593e06a33a86e40389c1e3fb98509ebb8ed3c41d306145c4581afdfc315ba7`。raw、analysis與下載指紋保留於主聊天的該execution輸出目錄；本聊天沒有操作此輪Safari。這不是相機capture、產品外原生重播、半速、新正式head、完整九組或十輪60秒通過。若後續結果不同，仍按原門檻記錄，不重新定義成功。

正式候選只讓localAudio的VS透過record的單次選項使用此明確WebM組合；Chrome、相機及復原維持原格式序列。支援查詢、建構或start失敗均拒絕，不回退MP4；原音訊／編碼／取消／stop尾塊清理沿用。單元包含專用選項不影響下次普通錄影、原一般格式退回、三種拒絕與error後完整尾塊／重試；擴充原local-audio瀏覽器回歸核對拒絕後原片／舊VS指紋及資源釋放。此次依協調先不啟server、取影音鎖或操作UI，相關Chrome媒體回歸與正式新head的Safari完整矩陣／十輪交由持鎖工作串安排，不能寫成已重跑。iPhone暫緩，不合併或部署。


## 41b3023 的實際 Chrome 短回歸與工程分支失敗（2026-10-29）

受測乾淨來源41b3023916ac3cfa330708fb6a53eae12cf9cba7、靜態f81d1c69861fa21e、真正Chrome156.0.8078.49 headless／靜音輸出。自有隨機loopback入口固定13份回應資源指紋，controller=none；相機／麥克風由主機政策禁止，未操作Safari或更改瀏覽器設定。所有下載使用新的ignored output目的地，只調下載路徑，不改原測試斷言或來源素材。此處不是新的完整24組或原生Safari證據。

Chrome原聲路（無UA覆寫）三項通過：

- `existing-no-camera.js`：完全沒有相機API，正式雙片入口、共同預覽及五秒真正成檔，無對外請求。
- `comparison-pitch.js`：三份三秒實檔完整解碼，0.5／0.75／1×分別330／495／660Hz，排除自己880Hz；取消、成檔及繪製失敗後恢復一般練習。原音高分析只在記憶體中改下載輸入路徑，原檔與全部分析邏輯／門檻未改。
- `export-failure.js`：真正無法建構、非同步編碼error、原生讀回解碼失敗、讀回途中取消均保留舊VS、原資料及停止tracks；四份重下載舊VS與基準SHA256相同。之後同頁讓MP4建構失敗，走原格式退回到真正VP8／Opus WebM，90格、視訊跨度3.0秒；基準H.264／AAC MP4為91格、3.032533秒。原分析器全格fit／鏡像／留邊、單一老師聲源與音訊增益均通過，原片before／after與來源逐byte相同。

14份實際新下載（1份無相機VS＋3份音高VS＋10份失敗／重試流程檔）每份均經FFmpeg全片解碼無錯，另保留bytes／SHA256／真容器／codec清單。此輪WebM重試是正常Chrome原格式備援，不冒充Safari專用候選的矩陣；聽感、低階裝置及G7仍未驗證。

同版在真正Chrome用UA明確選WebKit工程分支，原`local-audio.js`基準輸出失敗，產品訊息為音訊準備逾時；唯讀原生觀測：start-call=731.8、stop-call=10733、native start=10733.9、dataavailable／stop=10734，相機／兩側原片均未啟播。只送首格、只先排音訊、同時prime兩者的私有對照仍未通過。最後移除native start gate的私有對照能基準成檔（JS讀回VP8／Opus、888,693bytes、2998ms），但接著指紋工具fetch(blob:)被既有`connect-src 'self'`明確阻擋，整項仍未全過，亦未取得可供獨立品質分析的該基準下載檔。各輪錯誤、metadata、事件及console紀錄皆保留，不把它們寫成Safari原生壞掉、媒體品質通過或正式修正。

沒有把任何prime／移除gate改動納入正式web/；目前產品仍是41b3023的原生WebM選項與原start順序。後續測試工具改用已選File與IndexedDB已保存VS Blob做原bytes／URL比較，修正CSP不相容的讀法，原政策／產品／門檻不變；該工程分支完整瀏覽器流程仍未通過，不宣稱因工具修正已全綠。`local-audio-clock.js`未繼續跑，因工程分支基準已失敗；原單元的100ms拒絕仍保留。

全部自有具名Chrome已有關閉回執，最後主機pid4226及nonce a74fe7b6-d315-47cd-b09d-d3a2602d6d8c正常退出／釋放，檢查當下共用鎖不存在；沒有清掉別人的鎖或程序。raw、原私有失敗、14份下載及分析留在本聊天ignored output。Web原生矩陣／十輪60秒交回主聊天；iPhone暫緩，不合併或部署。


## 正式41b3023原生Safari半速15秒單輪（2026-10-29）

主聊天操作真正Safari27.0.1／macOS27.0.1，受測乾淨來源[41b3023916ac3cfa330708fb6a53eae12cf9cba7](https://github.com/sunpochin/dance-stamp/commit/41b3023916ac3cfa330708fb6a53eae12cf9cba7)、靜態f81d1c69861fa21e、execution `native-41b-8d9e9f9c66`，prototype=false。一般新origin、頁面controller=none、initialVideos=0由主聊天核對；產品模組原樣，QA只旁聽，沒有真人相機／麥克風、設定變更或新增影格請求。本聊天唯讀核對manifest的14份資源SHA256皆與目前建置相同，並直接比對實際產品下載與原生chunks組成檔bytes完全相同。

來源為同一65秒自製雙片，A=0、end=7500ms、r=0.5、selfDuration=65000ms、offset=0、兩側mirror=false；這次只做半速15秒單例。未修改`analyze-media.py` v5，原全片解碼與全部既有門檻exit0：

| 指標 | 正式來源單輪結果 |
| --- | --- |
| 真實輸出／產品下載 | VP8／Opus WebM，`dance-vs-2.webm`，2,221,513 bytes |
| 全片解碼末端／視訊跨度 | 15.026／15.026秒；durationSource=decoded audio/video end，沿原v5既有WebM規則 |
| 解碼影格／平均fps | 454／30.214 |
| 提示音／閃光與最大聲畫差 | 8／8，80ms |
| 三點配方／新增漂移 | [0, -33.333, 0]ms／0ms |
| 來源起末覆蓋差 | [0, 0, 0, -33.334]ms |
| 最長重複老師／自己畫面 | 154／125ms |
| 最大逐格配方差／內容時鐘差 | 100／133.333ms |
| 完整匯出上界 | 15,399ms |
| completeRecipeCoverage／withinSyntheticTargets | true／true |

下載與native chunks相同的SHA256為`4d26004fbf9bdc817baac13eca71894407d891b73a0a38bcc492470d794b5f3a`。原record、raw、完整WebM、原v5報告、manifest及產品下載收據均留於主聊天`output/safari-native-41b3023`；本聊天沒有操作該原生輪次或重跑影音測試。133.333ms內容時鐘差仍按原v5的250ms限制判定，不能擴寫成每一格誤差均小於100ms，亦不隱去100ms逐格配方差的邊界觀察。

這是正式來源的單輪半速通過，與eb21064私有1×／30秒原型、舊MP4失敗和Chrome工程分支失敗各自歸屬，不混成整體通過。本新檔尚未做網站外原生播放／聽感、正式完整九組與十輪60秒；先前原型30秒的網站外UI播放不能轉記到此檔。原100ms／250ms、完整覆蓋、90秒耗時及全部品質門檻保持原樣，runtime仍凍結41b3023，不納入未全過的Chrome UA私有啟動改動。既有Chrome原聲路三項／14份全解碼及所有失敗證據保留。完整原生矩陣由主聊天在整合候選凍結後續跑；iPhone暫緩，不合併、部署或關閉P0 gates。


## 非同步 start 閘門續修來源（2026-10-29）

本段接續先前工程分支失敗，不更改其原始結果。私有main SHA256 `5b75942873f8202663badab32dabd4889243f8223d000131c9611aff720a568c` 只移除native start等待，基底41b3023，其餘產品資源不變。修正QA的File capture Map後，真正Chrome156.0.8078.49的工程分支已跑完原本機音訊／格式拒絕／取消重試、獨立非同步編碼error／恢復，以及原時鐘延遲／短停頓拒絕／恢復；7份成功原生輸出全片解碼，其中6份有聲沿原v5通過、1份原本無音軌全片解碼且仍無音軌。實際產品重試下載與native chunks逐byte相同，失敗後舊VS bytes／URL保留，所有原生stream停止、無unhandled rejection。第一版補充工具有語法錯，原負向紀錄保留，修正補充工具後另跑，沒有寫成首次全過。這是真正Chrome引擎明確選WebKit分支，不是Safari證據。

主聊天另以真正Safari27.0.1／macOS27.0.1，一般新origin、controller=none、initialVideos=0、同一65秒合成雙片，在同頁依序完成兩個精確私有5b案例，execution native-nogate-004c67c079；中間沒有重載或清庫。未改原v5或任何門檻：

| 指標 | 1×30秒 | 0.5×15秒 |
| --- | --- | --- |
| 全片解碼末端／影格／fps | 30.018秒／902／30.049 | 15.019秒／451／30.029 |
| 音／閃與最大聲畫差 | 30／30；40ms | 8／8；78ms |
| 三點配方／新增漂移ms | [0, 0, -33.334]／-33.334 | [0, -66.667, -66.666]／-66.666 |
| 起末覆蓋差ms | [0, -33.333, 0, 0] | [0, -66.667, 0, -33.334] |
| 最長重複老師／自己畫面ms | 80／112 | 152／120 |
| 最大內容時鐘差／完整匯出上界ms | 83.667／30,510 | 125／15,410 |
| 原v5覆蓋／合成目標 | true／true | true／true |

兩個產品下載與native chunks逐byte相同，分別4,795,278 bytes／SHA256 `e0701efdde1ed1d01c94323ff1860cdfb749dfd38553c92c4c3f990cdf95fa0d`，2,197,853 bytes／`7fa0f0dbd7a45c15789bd1948517e712e7bd42b4417996f32dd6228753a21065`。原檔、record、raw、analysis、下載收據與verified-native-two-cases.json由主聊天保留在ignored output/safari-no-start-gate-41b；本聊天唯讀核對歸屬，沒有操作Safari。半速最大逐格配方100ms、內容時鐘125ms仍完整保留，不能寫成每格均低於100ms。

兩個引擎短例滿足採用條件，正式版本僅移除localAudio VS的start等待，清理main unused import及過時註解；原recorder、10ms音訊排程、時間戳、來源邊界與所有分析器不變。QA帶入PR #72的change擷取Map並補真正start延後通知的資料流回歸。正式新版本的原check／hooks與短Chrome回歸另記；完整原生矩陣、十輪及新檔產品外重播仍由主聊天續驗，不能從本段私有結果宣稱完成。所有原始MP4／逾時／工具失敗均保留，iPhone暫緩，不合併、部署或關閉P0。


## 正式6f7f89a的實際Chrome啟播／失敗恢復短回歸（2026-10-29）

受測乾淨來源 `6f7f89a54b0914ebf9d93250d39c18e21b75bc0c`、靜態 `14f503e0971a9ab8`、main SHA256 `8f88d8469a9e339855f6e2ae3707d92e351958bf0f052e21492bc0a5fa6df4cc`；比精確私有5b只再移除unused import及修正過時註解。原Bun1.4.4 check及提交／推送hooks通過389 tests／1377 expects／0 failures，同head CI #130成功。

真正Chrome156.0.8078.49隔離新context、無SW controller，固定本輪13份回應資源指紋；相機／麥克風禁止。工程分支明確用QA UA選取，不冒充Safari。正式 `local-audio.js` 基準延後真正native start通知交付一秒，start-call=1209.1、BufferSource.start=1209.2、reference playing=1213.7、真正native start=1271、延後交付=2272.3ms；兩份延後通知及playing的isTrusted均true。音畫已先供給資料，完整3秒成檔，沒有補假start或額外影格請求。

四項完整短回歸通過：

- local-audio：真實有界AAC解碼／12秒來源片段、延後通知基準、WebM不支援／建構／start同步拒絕、解碼拒絕、準備及合成取消、舊原片／VS bytes與URL保留、重試、交換成無音軌來源；解碼器、AudioData、buffers及tracks釋放。
- 獨立非同步編碼error：保留舊VS與保存筆數、不新增假成功、停止本輪資源，同頁重試真正VP8／Opus WebM。
- 原local-audio-clock：延後play與180ms短停頓均由原100ms護欄拒絕，舊VS保留且資源清理，再重試成檔。
- 普通Chrome原聲路existing-no-camera：相機API完全不存在時仍可走正式選雙片／共同預覽／5秒真實輸出；無外部請求，沿原MP4選序。只把下載目的地改為本輪新檔，不改原斷言。

8份成功原生輸出全部FFmpeg全片解碼：工程分支6份有聲WebM沿未修改原v5全部通過覆蓋／漂移／聲畫，最大聲畫50ms、完整匯出上界3562ms；另1份預期無音軌來源全片解碼且audio tracks=0；普通Chrome5秒成檔亦全解碼。實際產品WebM重試下載、普通Chrome下載均與各自native chunks逐byte相同。三份故意拒絕的raw另留，不列為品質通過；各輪無unhandled rejection、舊VS連結仍可見且未撤銷，所有本輪stream已停止。

本機ignored `output/chrome-nogate-formal-6f7f89a-941c` 保留原生chunks、實際下載、操作／事件、原v5報告、全部成功與負向原檔、complete-analysis.json。關閉後按程序樹核對36個自有PID及4個精確profile均無殘留，再停止自有server16362並釋放nonce 49518c3a-620e-447e-b68e-f9113f1d9de0；process-cleanup.json與cleanup.json記錄來源乾淨及當刻無鎖。本輪未操作Safari。

這是新正式來源的Chrome短回歸，並非完整矩陣或十輪。真正Safari完整九組、十輪60秒及新檔產品外重播由主聊天以凍結整合候選續跑；不得借用私有5b、舊41b或整合PR其他head結果。原失敗、門檻、iPhone暫緩、獨立審查及不合併／部署的界線保持原樣。


## 正式整合矩陣第七案缺尾與單塊WebM續修來源（2026-10-29）

主聊天的正式整合ef11498882c62c71874c94f9185dff1683a2329b／靜態c895264、execution native-final-05416e156a50，同頁依序0.5×15／30／60及0.75×15／30／60六案原v5均通過。第7案1×15秒產品顯示成功並保存，但下載2,333,655 bytes（SHA256 58bcf03d9300ec3dd15852fd851f52711a507e6c9ea41d1aecf0a09f4f9e0bad）與native chunks相同且共同缺尾：422格、14.055秒，尾部覆蓋-1033.333／-1000ms，15音14閃，原v5 exit1。timeline約15.024秒／451次requestFrame，最後有效塊約native start後14.022秒，stop後尾事件0 bytes；load讀回14056ms仍被產品保存，確定缺少對照共同片長的守門。矩陣立即停下，8／9及十輪未跑。第1／4案也有空尾塊但完整通過，不把空事件或timecode當成片長判定。

正式七案、下載收據與停止摘要由主聊天留在ignored output/safari-final-ef11498-v2；本聊天只讀核對，沒有操作該Safari或刪改失敗。主聊天自有服務／nonce已釋放，之後私有對照另用新origin及execution，不能沿用六案或覆蓋第七案。

精確私有recorder SHA256 0e463ca1020e201aeaf13bed36473c22a8b5cccb866f75e84671f397fb0d8824只在webmOnly改成start()、default仍start(1000)，沒有requestData、停止延遲、補償或改來源。真正Safari同頁1×15→30→60秒，execution84534500816f，原v5三案全過：

| 指標 | 15秒 | 30秒 | 60秒 |
| --- | --- | --- | --- |
| 全片解碼末端／影格 | 15.023／452 | 30.020／901 | 60.026／1801 |
| 音／閃、最大聲畫差ms | 15／15、43 | 30／30、46 | 60／60、48 |
| 三點配方ms | [0, 0, 33.333] | [0, 0, 0] | [0, 0, 0] |
| 原覆蓋／合成目標 | true／true | true／true | true／true |
| 完整匯出上界ms | 15467 | 30551 | 60802 |

產品下載與native chunks逐byte相同，SHA256分別83a6ab9b6146eb4f06e8cfe9e4fb6c0b896d03c17c60928e45f00acf0152dc95、f1766a8452b8848818bc6c91970459edb5830899d466c737ebdd389b31051652、112c0df31f40206d7105ae4e07f17b3757df08e49248f125d17d5aa517530681；原檔／報告／verified-native-singleblob-three-cases.json保留在主聊天ignored output/safari-webm-singleblob-ef11498。這是WebM私有三案，先前MP4 no-timeslice失敗仍保留，也不是正式矩陣或十輪。

採用前，本聊天在乾淨4bd48ca的私有精確兩檔候選以真正Chrome156.0.8078.49驗證：WebM專用start無參數、每份至多一次有效dataavailable；原本機AAC／格式拒絕／取消／重試，以及新「4秒配方注入先前真正3.017秒WebM」回歸全過。原生播放器成功讀出3017ms，片長守門拒絕後兩側原片與舊VS完整bytes／URL、保存筆數保留，buffer／tracks釋放，同頁4秒重試成功。4份成功輸出全片解碼，其中3份有聲沿未改原v5通過、最大聲畫60ms，1份預期無音軌仍無音軌。合成Canvas stream在每次start前強制確認，真實相機／麥克風要求禁止；9個自有程序與1個profile退出，私有服務19308及nonce1d5c808e已釋放。原始回歸、raw與分析留在本聊天ignored output/chrome-singleblob-private-4bd48ca-b2f4，來源仍標私有，不冒充正式新head。

正式候選只採專用VS不帶timeslice，及load後／替換或保存前的原100ms未取整片長守門，非有限值也拒絕；不變更共用停止政策、時間戳、邊界、聲音或分析器。新增格式呼叫參數回歸在改動前失敗，改動後與原check／hooks及必要Chrome回歸另記。新正式完整原生矩陣與十輪仍由主聊天在整合凍結後重跑；iPhone暫緩，不合併、部署或關閉P0。


### 正式9bb26d0的單塊WebM與片長拒絕回歸

乾淨來源9bb26d001a956d7bdf95819464c46dbcfcad1a99／靜態16a65c24d89bb5df，main SHA256 93ebd1ec25507df453a97e954da0e72dcb5afe6e2ce75cb3c038ecce67654ac4、recorder SHA256 7bce4af8beb23882124bba31ed0b99d13b020a6ec695e6550b235059fafbbf6f。原check及提交／推送hooks389 tests／1377 expects／0 failures，該head CI #133成功。格式參數回歸修改前為1 fail／1 pass，修正後通過；負向log保留。

真正Chrome156.0.8078.49四個全新隔離context依序跑正式local-audio、獨立非同步encoder error／retry、原local-audio-clock、普通Chrome existing-no-camera，全部通過。工程分支使用明確QA UA，controller=none，camera／microphone禁止；每次Native start前均強制確認__danceSyntheticCameraOnly、零真實媒體要求與受控Canvas captureStream。被動記錄顯示工程分支所有start參數為空、每輪至多一個有效dataavailable；普通Chrome仍start(1000)，相機／一般WebM備援的原參數另由格式單元保護。

新短片回歸沒有偽造duration：前次真正3.016秒成功WebM，609,753 bytes／SHA256 09ca9341c5cb0c06b1ef45b3f5511736ab4e0f9700bbea8a7a6c5c3c6251a5fe，作為本輪4秒配方的注入bytes；原生load成功讀回3016ms後由新片長守門拒絕。拒絕後兩側原片與舊VS全bytes SHA256／URL、保存筆數、paused與buffer／tracks清理斷言均通過；同頁真正4秒重試只新增一份VS。三種格式拒絕、解碼拒絕、準備／合成取消及靜音來源交換均保留；100ms時鐘測試的延後play與短停頓仍拒絕且重試成功，編碼error仍保留舊片並釋放本輪資源。

9份成功原生輸出全部FFmpeg全片解碼，其中7份有聲工程WebM沿未改原v5通過（最大聲畫60ms、完整匯出上界4206ms），1份預期無音軌WebM仍無音軌，普通Chrome5秒MP4亦全解碼。實際產品WebM重試與普通Chrome下載均與native chunks逐byte相同；5份故意拒絕raw另留，不列為品質通過。新短片故障僅在QA把本輪原生event資料換為前次短WebM，原始本輪native chunks與實際注入bytes分開保留；不把其差異誤寫成瀏覽器成檔缺尾。

本聊天ignored output/chrome-singleblob-formal-9bb26d0-2f4b保存完整原生／下載／record／v5／complete-analysis.json。無unhandled rejection、舊VS連結可見且未撤銷、所有自有stream停止；36個精確自有PID及4個profiles核對均退出後，服務20386停止並釋放nonced1d85ac6，cleanup.json確認來源乾淨及當刻無鎖。本輪沒有操作Safari。最初私有準備把缺TC註解的等價改動拿去比對含註解的native完整hash而在啟服務前失敗，另以preparation-assertion-failure.json保留，唯讀diff確認後才按分開記錄的新hash續測，沒有改門檻或重分類產品失敗。

正式完整原生矩陣／十輪仍由主聊天整合凍結後從頭重跑；ef114988第7案失敗、私有原生三案及本Chrome正式短回歸各自保留版本，不承接成新整合head的全平台通過。iPhone暫緩，不合併、部署或關閉P0，重要變更仍待獨立Claude Code／使用者審查。
