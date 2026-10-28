<!-- 檔案用途：綁定 Safari 與資料保護整合的來源、逐檔比對及未過 gates。所在層：匿名工程證據。主要關聯：TECHNICAL.md 第34節、MEDIA_PROBE.md、RELEASE.md。 -->
# #1 Safari 與可靠性整合候選

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

一般新視窗已可測，不需建立 Profiles 或更改日常設定；一般保存／關窗取回的歷史成功不代表完整 VS 品質。原生結果仍綁 `eb8f10d`／`cbf341585240931f`：1×及0.75×15秒曾過原 v5，0.5×15秒完整覆蓋／漂移失敗、1×30秒被原250ms同步護欄拒絕。空 edit／音訊時鐘修正版尚未完成原生完整矩陣；私人儲存另有原生 Blob 失敗，目前原生續測等待 Mac 解鎖，無須使用者再決定設定。

Chrome 合成結果、程式／包相同、CI 及測試替身都不能代替 Safari、真人五人／讀屏／聽感、實體相機／音訊／背景／跨裝置、完整 G1–G7 或獨立審查。免費主機比較仍屬2026-10-28查核，發布前須重查，未藉本次整合更新價格或支援承諾。所有未驗收子票與 #1 保持開啟。


## 最新 head 的審查續修（2026-10-29）

本輪審查從當時最新 `e0acf88391c31ce75a5419d80a1e77691b316eb3` 開始；期間來源更新為 `ebdbe5c`，PR #63 於2026-10-29 06:55:42（Asia/Taipei）由其他操作合併為 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e`。本聊天未執行合併；原 PR 已無法接收續修，因此從同步 main 建 `fix/pr-63-media-probe-cleanup` 後續分支，保留最新平台暫存目錄變更。已核對這項來源更新未修正下列兩個缺陷。較早自動 review 只綁 `b43851f`，不視為本輪或最新 head 的獨立審查章。已逐項檢查本 PR 的產品、主機、打包、備份／更新回歸與 QA 工具，確認兩個 P2 QA 收尾缺陷：

- `forced-install-restart.ts` 在程序查核或停止失敗後仍會刪掉自有鎖；若主程序先退出，原程式甚至略過群組查核。修正後保留未確認退出的 handle／鎖並標失敗；只有整個群組為空且 owner nonce 相同才釋放。owner 讀取失敗也會留下錯誤並完成自有主機收尾。
- `verify-native-quota.ts` 在主流程正常 close context 後，CDP 或 ps 核對若失敗，context 已清空，finally 原本可能漏掉失敗標記而放鎖。現在進入 close 時先標收尾未驗證，唯有全部已知 PID 退出才清標記，任何中途錯誤均留鎖。

故障回歸直接取用實際工具的 stop／close／finally 程式；用合成邊界重現，不向任何 OS 程序送訊號、不讀寫真實鎖。以本聊天 work 保存的未修改 e0acf88 工具快照跑同一組故障回歸：2 pass／7 fail，直接重現提早刪鎖、未查群組與 owner 讀取失敗跳過後續清理；修正後9 pass／52 expects／0 fail。兩輪均只在記憶體執行，沒有瀏覽器、主機或真正共用鎖操作。原始失敗／修正後完整檢查及提交後實測結果由交付 PR 綁定，不把測試替身當成新的原生媒體或 Safari 驗收。

這次只改兩個 QA 工具、其單元回歸與技術證據；14份產品 Web 資源仍須與13976bb逐byte相同，下載包仍只明列匿名指南／證據，不加入 QA 工具。Safari 未過項目、真人／實體／跨裝置與最終獨立審查繼續保留，iPhone 暫緩；不合併、發布或關票。

本輪原check於 main38e6cf9 上的修正工作樹通過：391 tests／1361 expects／0 fail、229檔公開掃描、原型別／lint／build通過。修正後強制中斷工具另在相同工作樹真正執行成功，仍為adbe8eb1d6acfd09：候選部分安裝、SIGKILL、自有群組退出、同profile離線重啟與已提交資料保留通過，媒體API呼叫0、自有nonce鎖釋放。首次碰到另一輪quota工具持鎖時正確EEXIST拒絕，未啟動瀏覽器或更動原鎖；原拒絕及成功紀錄都保留。原生quota收尾的正常／故障分支由上述真正程式碼回歸涵蓋，本輪未重跑其完整原生配額實驗；舊2d31302容量證據維持原歸屬。測試工具SHA、最終提交與CI由後續PR綁定，不將未提交工作樹來源冒充乾淨main的新測。
