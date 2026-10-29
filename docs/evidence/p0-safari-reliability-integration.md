<!-- 檔案用途：綁定 Safari 與資料保護整合的來源、逐檔比對及未過 gates。所在層：匿名工程證據。主要關聯：TECHNICAL.md 第34節、MEDIA_PROBE.md、RELEASE.md。 -->
# #1 Safari 與可靠性整合候選

## 2026-10-29 最終 Web 候選整合續作

本輪從同步 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e` 建立本聊天專用 `chore/p0-web-final-candidate`，以一般 PR 供後續審查；不修改來源分支、不合併 main、發布或關票。下方早期 #58／#62 整合數據保留歷史來源，不能當本輪新測。iPhone 持續暫緩。

| 已保留的來源 | 固定提交與範圍 |
| --- | --- |
| PR #64 | `1bbfd5b92d566a29a39f4a588f7c78d4ce6afd0b`，產品 runtime 仍為41b3023的正式起點等待與相容音訊 VS 單次 WebM選項；納入三項原聲路與失敗工程分支證據，沒有納入私有啟動對照 |
| PR #65 | `f72cb2ff2b500530692c81fadfb8d86ce83aeb36`，獨立配額重跑的匿名收據，原生數據仍屬舊 runtime |
| PR #66 | `b8dd611333f95bb4d75d8192bac2e186900a7b60`，保留未確認程序的自有鎖、只釋放已確認未啟動的 spawn error |
| PR #67 | `72aed830b60f595794d178b715fae78e60ff0b09`，保留 e0acf88／f88c28d／eb21064 及三份私有對照的實際結果 |
| PR #70 | `d597e4ad5f23d8cc9c813b745df934c32d362ad3`，runtime 等於已獨立重審的99e862d，含未確認救援、排隊動作再檢查及真正取消 API／原生 abort 單輪收據 |

TECHNICAL 同位置追加衝突保留配額歷史及未確認契約兩邊內容；整合 #70 的 merge `811d86a` 當時產品逐 byte 等於 PR #70，經原 check／hooks：401 tests／1477 expects／0 fail。之後納入正式41b3023；main.js 合併兩邊互不重疊的控制器修改，storage.js／index.html／types維持#70，recorder.js及呈現等待維持#64。這是中途非媒體檢查，最終 runtime、乾淨包及 CI 由後續交付另綁。

[最新未確認保存證據](issue-13-unconfirmed-storage.md)中的原生 Safari 私人／一般結果只屬99e862d；[獨立 quota 重跑](issue-13-native-quota-repeat.md)仍屬其原 runtime。指南新增記憶體筆記救援與原頁重開步驟，兩份匿名證據明列入包；沿用既有指南連結回歸，不新增遞迴收集或影片附件。

整合16bd7ca的Chrome原24組、網站外Chrome檔案播放與兩項原生儲存／更新工具已補驗，見下節；Safari正式41b的完整原生矩陣／十輪、整合版Safari、新VS未確認救援、產品Stop／私人UI取消及人工／實體／跨裝置仍待各自證據。工程 Chrome 模擬 UA 分支的 WebM native start互等失敗另保留，不偽造start、不省略格式回歸，也不由該工程輪斷定真正Safari失敗。私有 WebM 1×30秒單輪不能移記正式或整合 head；後續根聊天持鎖驗證，這一整合步驟未啟動媒體或取得共用鎖。

儲存原生取消收據另屬81bd2c9的五份原樣儲存模組：真正 trusted abort 後1ms回AbortError、unknown=false，完整舊metadata／sentinel bytes保留，正常重試complete。只涵蓋儲存API，不代替本整合head、產品Stop、新VS或私人取消。

正式41b3023的Safari半速15秒已有自己的原v5單輪通過：VP8／Opus15.026秒、454格、聲畫80ms、完整覆蓋true、完整匯出15,399ms，產品下載2,221,513 bytes等於native chunks。最大逐格配方差100ms、內容時鐘差133.333ms仍完整保留；此結果只屬41b來源，不移記為本整合head、新檔網站外播放或矩陣／十輪通過。整合產品組成固定，靜態為fe23327aa3da26c5，與文件／QA續補前相同；精確最後head、check與包由交付PR綁定。

Safari QA 指紋續審：9151ce4已避免被 CSP 拒絕的 fetch(blob:)，但成檔後讀 input.files 仍會取不到來源。隔離 Chrome 真 FileList 配合原 chooseFile 直接重現1→0件；於原生 change 擷取階段保留 File 後，完整原 bytes 仍可讀。這一修正只改測試工具，不改產品或 CSP；原工程分支仍有 native start 互等失敗，沒有宣稱完整回歸已因此通過。

### 16bd7ca 同版補驗

2026-10-29，根聊天在乾淨 `16bd7ca64f797c937fb4cf5153fce688e8ea8602`／靜態 `fe23327aa3da26c5` 真正重跑。本聊天只讀核對原始案例、原分析、完整下載、儲存快照及清理收據，沒有代跑或修改原測試。後續只補文件；受測head保持16bd7ca，新的文件head及乾淨包另由PR綁定，不能寫成新版重新跑過影音。

#### Chrome 24組與48份下載

macOS27.0.1／原生安裝Chrome156.0.8078.49 headless、一般UA、Bun1.4.4、FFmpeg8.1.2。真正程序參數已核對只用自製假相機，沒有真人相機／麥克風；14份受測資源與本候選逐檔相同。沿用未改的 `media-feasibility.js`、`run-media-feasibility.py` 與分析器v5：矩陣9、穩定性10、WebM1、正負校正2、恢復1、長輸出1，共24組全過。24份原始紀錄均sourceDirty=false，所有fullDecode／完整覆蓋／合成目標／完整耗時驗證為true，影格訂閱pending=0。

| 原24組量測（只屬16bd7ca） | 結果 |
| --- | ---: |
| 最大聲畫差 | 60ms |
| 最大配方差 | 71.533ms |
| 新增漂移最大絕對值 | 63.234ms |
| 最長重複畫面 | 71.567ms |
| 最低平均fps | 29.984 |
| 完整匯出最高上界 | 64,076ms |

48份實際原片／VS都由原流程完整解碼並留指紋；本聊天另重算全部202,261,876 bytes的下載SHA，與收據相同。最後24份take／24份export，預期48份媒體均存在可讀、missing=0。這是原案例的存在／可讀檢查及下載指紋，**不是新增一次逐份最終IndexedDB全bytes比對**。十輪使用同context／IndexedDB，但原腳本每輪仍導航；不宣稱無重載生命週期、實體裝置或無資源洩漏。

原瀏覽器函式SHA256 `cf8f8f02bb6cacb7e6d894b40c2a7dd7064bd9b931cb74e76228585e83ea1c03`；原run-media腳本 `8de3caec2a246c0fb40df52431515f59e7b876b4277439a5591070fe492af881`；原v5 `3f4aec9788880037a585ff81c6f77a0e56ab456dc835aa4cbe0cb0cbe1cbeaaa`。最終收據SHA256 `0ff3d0d95775c350eff1e64df24757925b6f2c8b315462fa4494b242f379831e`，verified-results為 `5471c72d181039a3b5b5b9a6b9ed8fd2bb7869ee0e8611ce1b3672b8e6ad7dfa`；raw與媒體留根聊天本機，不進包或公開附件。

#### 網站外真正檔案播放

產品主機及原瀏覽器先停止，再以全新隔離Chrome156、`file:`入口執行原 `download-playback.js`。下列三份均為上述24組的實際下載，完整bytes／SHA相同，原生play到ended、error=0、mediaCalls=0：

| 檔案 | bytes | 呈現frames／dropped | 已解碼audio bytes |
| --- | ---: | --- | ---: |
| 正常MP4 | 2,322,713 | 449／9 | 22,667 |
| WebM | 3,435,488 | 450／0 | 163,402 |
| 校正MP4 | 2,297,167 | 444／0 | 20,171 |

這是靜音headless Chrome的原生播放／解碼收據，不代表Safari、人工聽感、Files／相簿或跨裝置保存。原播放函式未改，SHA256 `737e4be2d69c9f6c60da1c20c73754558b8d4b2416793bfaa989bc5a2c7c2ba1`。

#### 新整合版原生配額與更新中斷

同一乾淨16bd7ca以原 `verify-native-quota.ts`（SHA256 `1489d1e546587eceee7373458a82aa8834900915df28c57b5a8a6e889e66cdbb`）及storage.js（`d470fecd1c030878ae2e1750f68d3ad130e84d8393bdfaafb99dbd68a98b2e8a`）真正重跑。512KiB origin配額下，新增／替換皆有trusted readwrite交易abort／QuotaExceededError，產品拒絕；非空video／marker／move／take／recipe／export、三份media及chunks全保留。11份完整快照逐物件相等關係、47筆Blob記錄的完整base64／長度／SHA均獨立重算，拒絕後再等1秒仍相同。解除override後同候選重試revision3→4→5，原生metadata與完整Blob匹配；正常關閉後同profile新程序讀回完整相同。此工具直接旁聽error／abort，不另宣稱捕捉到trusted complete事件。兩次自有程序清理各核對7／6個PID歸零，override已解除、主機及自有nonce鎖收尾通過。result收據SHA256 `1e61ab51f3d5449e9b6f8aa0ade5ed5aa173b7ea6227980db9948e10638bbf11`。

原 `forced-install-restart.ts`（SHA256 `f4c8eb229e55dca2e62f00f7c3f5b80d66e1aee278ac83060358382dccaa9953`）亦在16bd7ca／fe23327aa3da26c5重跑：完整舊cache12份，候選僅1／12且CSS真正HTTP回應未完成時，向自有群組SIGKILL。確認群組為0後，同profile新程序在導航前離線，取回舊完整shell／manifest、全部筆記與原生metadata、keys及1,048,613-byte sentinel，每byte／SHA相同。重新導航的主機probe=0、nativeOnline=false、fromServiceWorker=true，mediaCalls=0；兩個自有群組最終皆0，自有鎖釋放。worker SHA256 `18df1e0d6794df412b491f8d9c09208316e5b1b0c6897a1b1292ac682157df18`，收據SHA256 `da567e3a8fac7fe81e78978b71b7b874cdd55939dc071a37855104d9b9cd515c`。

配額與強制中斷使用不可播放的合成sentinel，不是新VS、真低磁碟、停電、寫入提交中強殺或永久保存驗收。兩個工具的新結果屬16bd7ca，先前#65／#66及舊worker收據仍各自保留，不相互移記。

#### G7稀疏觀測與剩餘界線

只有一筆活躍G7取樣：自有QA daemon＋Chrome的RSS加總1,359,088KiB，可能重複計shared pages，不是app獨占footprint、峰值、最低或無洩漏證明。AC供電；同時系統工具回報整體記憶體free50%，不能歸因於此程式。熱狀態原文為「No thermal warning level has been recorded／No performance warning level has been recorded／No CPU power status has been recorded」，不代表實際溫度或無降頻。關瀏覽器後RSS=0及free53%僅支持清理，不納入活躍最低值。溫度、電池消耗、低記憶體／熱壓力、手機與長時間常駐仍未量測；原G7收據SHA256 `3b59c13d0caf287916f7cf3159c85c219e652d0a7f5e2a7dbf705d8177d57725`。

捕捉流程的自有瀏覽器／主機／nonce及網站外播放器的6個已知程序／nonce均已收尾；沒有清理其他聊天的程序。正式41b／99組成未變，16bd7ca的Chrome WebKit-UA分支原native-start等待失敗仍單列。後續私有no-start-gate（5b）雖由根聊天回報完整Chrome工程／clock／錯誤重試通過，仍未採用；真正Safari兩個短配方因桌面鎖定尚未執行，不由本輪Chrome或先前Safari半速單輪推定通過。

完整整合版Safari矩陣／十輪、新VS未確認救援、產品Stop／私人取消、真人五人／讀屏／聽感、實體相機／跨裝置及Claude Code／使用者最終審查繼續保留。Web優先、iPhone暫緩；不關票、合併、部署或發布。

## 以下為先前整合的歷史紀錄

2026-10-29（Asia/Taipei）。使用本聊天專用全新 clone，從同步 main 建新 feature branch，保留兩張來源 PR 的完整提交；來源 PR 與 main 均未合併，未部署、發布或關票。重要變更仍須 Claude Code 或使用者最終審查，iPhone 暫緩。

## 來源與整合範圍

| 身分 | SHA／歸屬 |
| --- | --- |
| 開工 main | `918d8d7aa814533823522e3d4e0ab18df75cb212` |
| #58 可靠性來源 | `2d313027c28ebc1d4f7cfd03177fbb8141fd7d23`，保留其 #55／#56／#57／#59／#60／#61 提交及作者 |
| #62 Safari 來源 | `13976bb83e259be699f7c822cc125850e776f81e`，保留 eb8f10d、05099e5、c211c94、85dde00、13976bb 及作者；交付前新增文件 head `676ba501914f278ab1aa0d2c40990f9a0bff23ae` 亦已保留 |
| 整合 head | 本文件所屬合併提交；精確 SHA 由交付 PR head 綁定，不把任一來源 SHA 當整合 SHA |
| 初輪瀏覽器檢查的未提交狀態 | 基於 #58、合併 #62 的工作樹；提交後同版檢查與乾淨包另在 PR 綁實際測試 head |

主機每次 GET／HEAD 的完整路徑連結防護、完整 v1 備份／v2 保留、編碼器先停止後收尾、部分更新回滾、強制中斷及原生 quota 工具全部保留。Safari 有界 AAC、空 edit 靜音、100ms 獨立音訊偏移拒絕原樣整合，不重新設計時間線，不改 G2／G3／v5、schema 或資料交換格式。

`local-audio.js` 繼續由同一 `webFiles` 加入建置、主機、SW 與下載包。打包清單合併兩邊匿名證據，另補 MEDIA_PROBE 實際引用的9份既有匿名文件與本文件；從所有隨包操作指南推導證據依賴，不遞迴打包 output 或 QA 工具。原版媒體、私有輸入與服務紀錄不上傳。

交付前來源查核發現 #62 新增 `676ba50`：只在三份文件加入30行原24組的完成證據，Web／建置／主機／測試皆未改。後續合併提交保留該提交及較新文字，不覆蓋；本候選資源仍逐byte符合13976bb，原媒體數據不移記為新測。最終check／包來源與SHA由交付PR綁定，原b43851f的CI與舊包只屬初輪，不冒充最新head。

## 驗證與版本界線

初輪整合（`b43851f`）Bun 1.4.4 原 `bun run check` 通過：**382 tests／1307 expects／0 fail**、228檔公開掃描、checkJs／SW 型別、Biome（原19項info）及 build 全過，原 hooks 保留。首輪擴大指南測試誤將尚未建置的 notice 副本當來源指南，因 ENOENT 正確失敗；改為只讀隨包的來源操作指南，沒有預先建置來掩蓋順序問題，也沒有減少指南覆蓋。原失敗日誌留在本聊天 work。

候選 `package:web`／`check:package`、原生 tar 解到 Git／node_modules 外及56檔原生 SHA256SUMS 皆通過；正式乾淨包的來源 head／bytes／SHA在提交後交付PR另記，不沿用本次未提交包校驗。來源續補後全部操作指南的38個本機證據引用、21份不同證據均在明列白名單。

真正裸包 HTTP 啟動後，13個公開資源的完整 bytes／SHA／安全標頭、local-audio.js 的 HEAD 空body、四條禁止路徑及POST拒絕通過；#58 的原單元另驗啟動後換檔／父目錄連結、硬連結與缺檔，不放寬。

既有 `offline-multi-tab.js`（SHA256 `2c939dfb4f38f204c91080ac6f4762da72b76e514caf6c32cc473b184c6166e1`）在隔離 Chrome156.0.8078.49 headless 上通過：兩個舊控制頁、候選waiting、第一頁關閉後第二頁仍可保存同一動作、第三頁導航仍用舊active、全關才換版；完整筆記／revision及無關cache保留，媒體API呼叫0。受測工作樹 git HEAD 為2d31302、trackedChanges=true，包含本次#62整合，不冒充乾淨2d31302原版。四個已知自有Chrome PID全部退出、兩個自有主機停止，nonce鎖釋放。

含 notices、_headers、SW 的14份 Web 建置資源，與 #62 提交內容重建的確定 bytes 逐一相等，亦符合允許讀取的主回歸 `state.json` 及其包驗證紀錄指紋；靜態仍 `adbe8eb1d6acfd09`。下表列本候選 bytes／SHA256；沒有直接讀取其他聊天的產品檔案。#58的storage／recorder／SW原碼、主機、quota／強制中斷／多頁工具另與來源逐byte相同，但編譯SW因manifest新增音訊模組而不同。

| 資源 | bytes | SHA256 |
| --- | ---: | --- |
| index.html | 19296 | `1ae8198da59a5497a09f807d90719b5a314c6bc00cdc131083e3af01c112efa4` |
| style.css | 6318 | `e4770b8986042bbf7f356a0243f8afd164d31aad29d32c69bebc95c29efdf0c0` |
| main.js | 114382 | `c0d092f7ed322e924ca3a43d79b6c6696d1032f08001759b4e0f3e539f055689` |
| timeline.js | 2876 | `8b8552cc3c754c053844e849c78423d85e8189e55cdc25da8ea6ca67f9017429` |
| local-audio.js | 14125 | `456d0d080e395574160f547554bd224933dff8d3ebc6f7898f467776dd996ea3` |
| beats.js | 2853 | `d25c6893043db7456cb32c4b64c1dbee982b33c3bb94a41966bfabe0bd0bcf9c` |
| recorder.js | 10189 | `82fa334d95d669e2483f29af64ea6e18e489114ba6c1902b68216d7ea27e269a` |
| library.js | 30662 | `1e718fc3c7afcda2cb62d643223b37d5489386e65d0b45b138ff1bf68b51911c` |
| storage.js | 8287 | `2de40d537d2ab049596acaaf549e9e9d324e7b8ce705b0edfe86af1396dbbd77` |
| offline.js | 5252 | `28a3d275e323658f697f2cd4abf123b42f25c0e280d31a3a5046e1b0c8f71da5` |
| sw.js | 4349 | `e8bffdacb06b2f7cc5b27749325c0c9a9cea4d4fd33ba21bc21b5e1c26b7741f` |
| LICENSE | 4563 | `c0ea4a896d2c8c394b29f9427589996db826cd501c512279ff0ed3ef48fabbe5` |
| THIRD_PARTY_NOTICES.md | 1502 | `79253f8dbced1f4184173360078eead5d7291bd8f85f285b0dbd734f3fe162f8` |
| _headers | 456 | `874bd98b3d71cdd3979fffa831a68cfd4986d0a25e9688ba4a94657f98f83453` |

#58 的原生 quota 證據綁乾淨 `2d31302`；其 storage.js 與本候選的 byte 身分另核對，不把這項歷史原生測試改寫為本整合 head 重跑。強制中斷的舊 worker 為 `db129e273cf0039b`，與新增音訊後的 manifest 不同；主聊天後續已在自己的乾淨 `9d483e0484a5781c7e93dbd36213431bcbde85dc`，以未修改的原工具重跑新 worker `adbe8eb1d6acfd09`：12份完整舊資源、1／12份候選且CSS回應未完成時真正SIGKILL，同profile新程序離線取回舊殼、完整筆記與sentinel全部bytes／SHA。原生狀態、PID／signal、零主機重開請求及自有程序／鎖收尾均直接記錄，exit0；兩輪識別與限制見[強制中斷證據](issue-13-forced-install.md#整合候選新增音訊模組後的重跑)。這是新manifest的實測，不將雙頁更新、quota或媒體矩陣移記為9d483e0重跑。

主24組由另一聊天在乾淨 `13976bb83e259be699f7c822cc125850e776f81e`／`adbe8eb1d6acfd09` 執行，本聊天沒有重跑同byte矩陣。開工時尚未完成；交付前已核對允許的 `state.json`、`verified-results.json` 以及主聊天實際terminal：最後performance案例quality pass，`collect-results.py` exit0，24／24組成功，原自有PID／主機／鎖均已清理。原矩陣9組、同context／IndexedDB十輪、WebM1、正負校正2、恢復1、長輸出1；全部原v5 fullDecode／完整來源覆蓋通過，保存檢查missing=0。48份下載有實際檔案指紋；這不是本輪新做live IndexedDB逐byte比較，十輪每輪仍有原腳本導航，不能稱無重載生命週期或裝置資源量測。

| 原主回歸量測（只屬13976bb） | 結果 |
| --- | --- |
| 最大聲畫差 | 88.333ms |
| 最大配方誤差／新增漂移絕對值 | 48.911／42.511ms |
| 最長重複畫面 | 70.966ms |
| 最低平均fps | 29.943 |
| 完整匯出最高上界 | 64,003ms |

來源、整合、測試與包識別分開，媒體數據只由逐檔相同的runtime承接原歸屬；本整合head的提交後check／乾淨包在交付PR綁定。沒有讀寫主聊天其他檔案，亦未操作其服務或程序。

主聊天補齊新manifest重跑後，只續補四份文件；原check再次通過382 tests／1309 expects／0 fail，公開掃描228檔、型別／原lint／build通過。新增的強制中斷證據連結使操作指南引用由38增為39、不同文件由21增為22；包內本來已有該文件，這次補上指南的直接引用。第一輪受限執行在本機port 0 listen被拒而失敗，未調整測試；以允許本機測試連線的相同原入口重跑通過，兩份日誌均保留。最新提交後的乾淨包／CI識別由PR另綁。

## Safari 與剩餘 gates

一般新視窗已可測，不需建立 Profiles 或更改日常設定；一般保存／關窗取回的歷史成功不代表完整 VS 品質。早期原生結果仍綁 `eb8f10d`／`cbf341585240931f`：1×及0.75×15秒曾過原 v5，0.5×15秒完整覆蓋／漂移失敗、1×30秒被原250ms同步護欄拒絕。空 edit／音訊時鐘修正版尚未完成原生完整矩陣；私人儲存另有原生 Blob 失敗。主聊天已在解鎖後續測e0acf88與後續f88c28d，半速護欄／原生等待逾時及未採用原型的完整失敗界線見[最新原生續測](issue-3-bounded-audio.md#整合版續測與起點等待候選)；不是仍待解鎖，也沒有宣告Safari通過。

Chrome 合成結果、程式／包相同、CI 及測試替身都不能代替 Safari、真人五人／讀屏／聽感、實體相機／音訊／背景／跨裝置、完整 G1–G7 或獨立審查。免費主機比較仍屬2026-10-28查核，發布前須重查，未藉本次整合更新價格或支援承諾。所有未驗收子票與 #1 保持開啟。


## 最新 head 的審查續修（2026-10-29）

本輪審查從當時最新 `e0acf88391c31ce75a5419d80a1e77691b316eb3` 開始；期間來源更新為 `ebdbe5c`，PR #63 於2026-10-29 06:55:42（Asia/Taipei）由其他操作合併為 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e`。本聊天未執行合併；原 PR 已無法接收續修，因此從同步 main 建 `fix/pr-63-media-probe-cleanup` 後續分支，保留最新平台暫存目錄變更。已核對這項來源更新未修正下列兩個缺陷。較早自動 review 只綁 `b43851f`，不視為本輪或最新 head 的獨立審查章。已逐項檢查本 PR 的產品、主機、打包、備份／更新回歸與 QA 工具，確認兩個 P2 QA 收尾缺陷：

- `forced-install-restart.ts` 在程序查核或停止失敗後仍會刪掉自有鎖；若主程序先退出，原程式甚至略過群組查核。修正後保留未確認退出的 handle／鎖並標失敗；只有整個群組為空且 owner nonce 相同才釋放。owner 讀取失敗也會留下錯誤並完成自有主機收尾。
- `verify-native-quota.ts` 在主流程正常 close context 後，CDP 或 ps 核對若失敗，context 已清空，finally 原本可能漏掉失敗標記而放鎖。現在進入 close 時先標收尾未驗證，唯有全部已知 PID 退出才清標記，任何中途錯誤均留鎖。

故障回歸直接取用實際工具的 stop／close／finally 程式；用合成邊界重現，不向任何 OS 程序送訊號、不讀寫真實鎖。以本聊天 work 保存的未修改 e0acf88 工具快照跑同一組故障回歸：2 pass／7 fail，直接重現提早刪鎖、未查群組與 owner 讀取失敗跳過後續清理；修正後9 pass／52 expects／0 fail。兩輪均只在記憶體執行，沒有瀏覽器、主機或真正共用鎖操作。原始失敗／修正後完整檢查及提交後實測結果由交付 PR 綁定，不把測試替身當成新的原生媒體或 Safari 驗收。

這次只改兩個 QA 工具、其單元回歸與技術證據；14份產品 Web 資源仍須與13976bb逐byte相同，下載包仍只明列匿名指南／證據，不加入 QA 工具。Safari 未過項目、真人／實體／跨裝置與最終獨立審查繼續保留，iPhone 暫緩；不合併、發布或關票。

本輪原check於 main38e6cf9 上的修正工作樹通過：391 tests／1361 expects／0 fail、229檔公開掃描、原型別／lint／build通過。修正後強制中斷工具另在相同工作樹真正執行成功，仍為adbe8eb1d6acfd09：候選部分安裝、SIGKILL、自有群組退出、同profile離線重啟與已提交資料保留通過，媒體API呼叫0、自有nonce鎖釋放。首次碰到另一輪quota工具持鎖時正確EEXIST拒絕，未啟動瀏覽器或更動原鎖；原拒絕及成功紀錄都保留。原生quota收尾的正常／故障分支由上述真正程式碼回歸涵蓋，本輪未重跑其完整原生配額實驗；舊2d31302容量證據維持原歸屬。測試工具SHA、最終提交與CI由後續PR綁定，不將未提交工作樹來源冒充乾淨main的新測。

## PR #66 續審的啟動失敗邊界（2026-10-29）

審查固定於當時最新 head `b423027ef29d75e3eabb819aafc6cfddda7b0095`；確認一項 P2 QA 邊界：OS 以 EACCES 拒絕 spawn、ChildProcess 從未取得 PID 時，原先收尾仍認為有未確認程序，留下自有鎖，阻擋後續測試。既有自動 code review 的零 findings 只是一份原 head 收據，不取代這輪直接重現。

用不可執行的自有合成文字檔實際核對 Bun1.4.4 的 EACCES／pid undefined／close code −13；沒有瀏覽器、HTTP 主機、相機／麥克風或真正媒體鎖操作。新增無 PID error 單元在修正前失敗，修正後連同原回歸12 tests／73 expects／0 fail。兩個保護情境另驗：error 已有 PID 而群組未確認時，以及只有無 PID、未收到 error 時，都仍保留鎖，不向未確認群組送訊號。

另直接執行完整原工具的 EACCES 路徑，來源為 b423027 上的修正工作樹，工具 SHA-256 `f4c8eb229e55dca2e62f00f7c3f5b80d66e1aee278ac83060358382dccaa9953`、靜態 adbe8eb1d6acfd09：實際取得共用鎖後未產生瀏覽器 PID，保持 failed／exit 1，無 signal／connected 事件，自有 nonce 鎖釋放，原本機 HTTP 入口停止接收連線。此案例沒有啟動瀏覽器或媒體，不能當作正常強制中斷／重啟新測。修正工作樹完整原check亦通過394 tests／1382 expects／0 fail、229檔公開掃描、型別／原lint／build；最終提交與CI由PR綁定。

修正先保留本次 spawn error 與固定 child，再只對「明確 error、無 PID、仍是本次 handle」清除已確認不存在的程序；主循環回傳原錯誤，finally 沿既有 nonce 檢查釋放自己的鎖，測試仍標失敗。正常 Chrome 強制中斷／原生 quota 的歷史證據維持原版本歸屬，本輪只做非媒體檢查，未重跑原生瀏覽器或影音矩陣；最終提交／完整check／CI由PR另綁。

原生 Safari 的最新直接證據另屬 [PR #67 的98fb551](https://github.com/sunpochin/dance-stamp/pull/67)：一般視窗已解鎖續測，半速啟播、尾端長度及起點等待候選仍有原門檻拒絕／逾時，私人儲存恢復仍待驗。不要覆蓋為「等待 Mac 解鎖」，也不將本工具收尾修正視為產品或 Safari 品質通過。Web 優先、iPhone 暫緩；不合併、不發布、不關未驗收票。
