<!-- 檔案用途：綁定 Safari 有界音訊候選的匿名驗證與缺口。所在層：工程證據。主要關聯：TECHNICAL.md、RECORD_COMPARE.md、local-audio.js。 -->
# #3／#11 Safari 本機有界音訊候選

狀態：2026-10-29，工程候選，尚待 Claude Code／使用者獨立審查；不合併／發布，不關閉 #1／#3／#11，iPhone 暫緩。來源基線 main `918d8d7aa814533823522e3d4e0ab18df75cb212`。

本輪把已知能保留來源起點的 AudioBufferSource 原型轉成有界 AAC 封包解碼。規格、索引／PCM／queue 預算與拒絕行為見 [TECHNICAL 第 31 節](../../TECHNICAL.md)。Chrome 原路徑不變；Safari 不支援的來源明確拒絕，不默默回退已知漏音的元素來源，也不重置資料。

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

## 清理與未驗證

所有自有一般 Safari 視窗、隔離 Chrome sessions、測試服務與 nonce 媒體鎖已結束；僅關自己的資源，未清他人的 SW／DB、接管既有私人視窗、改 Profiles／遠端自動化或啟動真人相機／麥克風。原片、raw、下載檔、分析及本機測試入口留在本機 ignored output／本聊天工作目錄。

實體相機 G1／光學 G2、iPhone／Files／分享 G5、相機 capture→export G6、完整三速度／三長度與十輪60秒、私人模式、其他來源格式／取樣率／雙聲道、低記憶體壓力、熱／電池、藍牙／來電及發布仍未驗證。#1／#3／#11 保持開啟，候選待 Claude Code／使用者獨立審查；無設備不視為平台失敗，不啟動 iOS fallback。
