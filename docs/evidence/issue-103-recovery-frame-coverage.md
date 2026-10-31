<!-- 檔案用途：記錄既有恢復影格守門接入完整量測、原入口相容及網站外成檔驗證。所在層：#103 品質證據。主要關聯：recovery-frame-guard.ts、run-app.ts、make-sync-fixtures.py、issue-9-capture-recovery.md、TECHNICAL.md。 -->
# 恢復片段先看到真影格，停止後不能偷偷換片

中斷的錄影片段重新打開時，不能只看到尺寸就當作可用；要真的解出畫面，才保存並清理暫存片段。中途按停止，舊筆記和影片都要留下，之後還能再試。這次把原有守門回歸接進完整檢查，產品程式沒有改動。

## 固定來源與範圍

2026-10-31，接續 [#103](https://github.com/sunpochin/dance-stamp/issues/103)。從同步main `d83755239bf145e9b79d50263208edfad83754e8` 建獨立分支，承接 [#125](https://github.com/sunpochin/dance-stamp/pull/125) 固定候選 `3db8de6b54fa63767d1dbfedba9d3fe775eac455`；前置 [CI #215](https://github.com/sunpochin/dance-stamp/actions/runs/41155103715) 三項success、精確head的Linux完整61/61，行數100%／函式96.74%／分支88.26%，鍵盤DOM24／driver37筆未截斷。這是成功基線，不視為修復#123的自然Linux逾時，與本次各自記錄。#114仍保持c351637開啟待審，沒有合併或正式發布。

既有 [恢復守門證據](issue-9-capture-recovery.md#5a90f35-新影格守門的失敗分支補驗) 與 `recoveryFrameGuard` 已涵蓋原生影格到達前的真正Stop、遲到通知、能力缺失及播放拒絕；完整入口先前未呼叫該函式，main.js:1241的恢復取消callback未命中。本次直接import原函式，預設61→62，前51條順序不動，保留既有鍵盤故障前置；沒有重寫一套守門測試。main.js:329是另一條timeline啟動取消，不挪用本次結果。

## 同一合成來源與原入口

原 `scripts/make-sync-fixtures.py` 的65秒、640×360／30fps逐幀編號、色條、閃光及660Hz提示音配方與FFmpeg參數不變。新增 `--reference-only` 只在產生reference後結束，省去未使用的65秒相機Y4M及瀏覽器設定；原無參數入口仍保留完整流程與 `-n` 不覆寫護欄。完整準備器只在缺檔時呼叫此選項，再把同一來源複製到當輪media目錄。

本機準備前該資料夾沒有檔案，後來只有reference.mp4：65秒、1,789,027 bytes，影片與音訊軌均存在，SHA-256 `3fb42ffb14678b8c944d605cab684a1919801de7908c1f540f7fbfc29ea26548`；未產生camera.y4m、browser.json或synthetic-only.js。原準備器／FFprobe紀錄見 `output/recovery-frame-fixture-source.local.json` 與選定日誌。

原函式新增明示的fixtureSource路徑選項；省略時仍讀原output/media-feasibility/reference.mp4。原4秒copy切片與15秒影格守門不變。選定入口與原獨立入口均得到113,521-byte同一切片，SHA-256 `b711bb2b4d67c9c9602057e0f91cb64d8dd5675802627b7ec0838f55e35e5e5c`。沒有另換較短圖樣；4秒是原守門測試範圍，不代表長片品質矩陣。

基準VS成檔後新增真正download／saveAs，三個case的基準native Blob皆與下載檔完整逐byte相同。沒有用fetch Blob URL或可見連結代替下載。這加強原入口的證據，原有失敗／保全斷言全部保留。

## 原生與受控部分

| 情境 | 保留的原斷言及證據 |
| --- | --- |
| Stop | 已有trusted loadeddata、真play完成及原生rVFC結果，僅延遲交付同一now／metadata；實點Stop，原訊號與等待訊號取消，候選URL撤銷，timer／listener均0；放行遲到原生結果仍不提交 |
| 缺影格能力 | 明示移除候選的requestVideoFrameCallback，拒絕換片、沒有新增timer／frame，保留chunks及舊資料；恢復原能力後同輸入重試 |
| 播放拒絕 | 明示單次NotAllowedError Promise拒絕，等待影格取消並清timer／listener，保留原資料；移除覆寫後真正原生play及影格重試 |

三個中斷take由合成資料與原MP4的兩段完整bytes建立，不是這輪真正殺程序或自然錄影中斷。每次失敗比較完整native／library、revision、media／chunks keys與完整bytes指紋，以及self／take下載／VS下載URL及時間／鏡像／offset欄位。另一頁當下拿不到take鎖，完成後可重新取得。重試才保存原媒體並清目標chunks；take仍標interrupted，非目標資料與舊媒體保留。

## 選定與原獨立入口

選定 `coverage/app-vHcqdL/run.json`：1/1、14,243ms、0頁面錯誤、5次導航收集，硬體擷取0次。原Stop／能力缺失／播放拒絕及三次重試全部通過；main.js:1241 callback從前置完整輪0變為實際命中，沒有把timeline:329算入。來源3db8de6加測試改動、trackedChanges=true，browserClosed／serverStopped均true、lockRetained=false。收據SHA-256 `983102fc65876004704e50a3b34b4dea56d0dde2ec6e52ba2f13435124e13e43`。

原 `forced-install-restart.ts --recovery-frame` 未傳fixtureSource，沿原預設路徑及原SW等待，亦passed；`output/recovery-frame-Sjl74Y/evidence.local.json` SHA-256 `d2e24fb9f86e3bf35a18ee7bfac1ff62f87f72f1bfd5c2683403f456604b0963`。產品靜態d4a2a50194888b79、Bun1.4.4／macOS arm64／Chrome156.0.8078.76，禁止硬體擷取且0次呼叫；守門驗證完成後原工具收尾自有程序群組，exit0、remainingGroupMembers=0，nonce鎖釋放。這輪沒有跑default／pending-write／chunk-write程序中斷情境。

選定真正VS下載179,627 bytes，SHA-256 `8549f69e5cd09e60c42e4cb3f20b3a06409be74102e64ade6db042ff83aa1024`；原獨立入口亦179,627 bytes，SHA-256 `13c8f43c9b9ac3a997cf9d8deebbe95b9f4913c26eabe9c83d95787f406ac899`，各自保存，不混稱同一成檔。

runner SHA-256 `bd848d49cf31de6b3af0e1943b9c048e3c75d3df6c6e8c7262a11112bcd0ee5d`；原函式加入路徑／下載核對後 `7cea7b749d1b963c58a04315d378680a8e18a2f7d1758ece1fd6350c62a7dd3f`；準備器 `178cda1d9be200ff149a4d591fc2903291fca8cdc52bfba67f765ad22b960606`；原配方加來源選項 `bb1e6525b9ec265d8f1825207a0cdfdb49052db78f47a158f107bdc5a0e526c0`。

## 完整輪、正常檢查與網站外重播

完整輪 `coverage/app-7BwE2Z/run.json`：62/62、0頁面錯誤、275次導航收集，案例時間合計445,729ms；新增守門14,931ms，原三種失敗／重試及全部既有斷言通過，硬體擷取0次。原65秒來源及4秒切片SHA與選定／原入口相同。完整輪真正VS下載179,245 bytes、SHA-256 `ce8b6b4a90eea27691d6a68dae9c3a4c4eb8d035413e83f49d2896241abc97f6`，獨立保存。

| 完整輪模組 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| web/beats.js | 18/18（100%） | 5/5（100%） | 23/23（100%） |
| web/library.js | 266/266（100%） | 124/124（100%） | 348/363（95.86%） |
| web/local-audio.js | 144/144（100%） | 32/32（100%） | 171/187（91.44%） |
| web/main.js | 1236/1236（100%） | 369/385（95.84%） | 1060/1266（83.72%） |
| web/offline.js | 68/68（100%） | 21/24（87.5%） | 50/50（100%） |
| web/recorder.js | 120/120（100%） | 45/45（100%） | 129/136（94.85%） |
| web/storage.js | 104/104（100%） | 40/42（95.23%） | 75/84（89.28%） |
| web/sw.js | 37/37（100%） | 12/12（100%） | 25/25（100%） |
| web/timeline.js | 23/23（100%） | 6/6（100%） | 39/39（100%） |
| **加總** | **2016/2016（100%）** | **654/675（96.88%）** | **1920/2173（88.35%）** |

全部9模組保留同一分母，skipped均0。同輪單元基準763/2016行、277/675函式、817/2173分支（37.84%／41.03%／37.59%），不與瀏覽器百分比相加。九份Web來源SHA與前置#125本機61條相同，前置653/675函式、1915/2173分支；本輪由真正Stop命中原恢復取消callback，不移除防護或人工呼叫函式灌數字。

剩21函式／253分支臂：main.js16／206、offline.js3／0、storage.js2／9、library.js0／15、local-audio.js0／16、recorder.js0／7，其餘0／0。未命中函式起始行：main.js `120,209,329,428,541,648,779,783,784,900,991,1007,1165,1494,1632,1700`；offline.js `48,78,81`；storage.js `17,53`。完整branchMap／b位置與計數保留於同輪app-coverage.json，不把行數100%當成所有錯誤／裝置路徑已驗收。

完整run.json SHA-256 `4703a7528dc5e3a663e85bfdebf59da04c2c4c8bde91cfaa3dba0cf8960fc086`；app.json `66abb1b569821fa8f7553b689a5d07d060ec148cf91d92b0677d0590f38ffa12`；app-coverage.json `e56f9fde92d2cefe2ffc3c0dddfd8e523ddfb10d13857229cf1c66eb818cb85a`。來源3db8de6加測試／文件改動，完整輪後只補文件；最終乾淨head遠端CI另記，不改標舊收據。

正常 `bun run check` 通過：647項／3174斷言／0失敗，既有19項lint資訊、靜態仍d4a2a50194888b79。首次公開掃描293個已追蹤檔案，新本文未stage，最終提交hook再掃描。完整輪10個已記錄自有程序識別均退出，browserClosed／serverStopped均true、原nonce釋放；觀測為 `output/recovery-frame-coverage-full-processes.json`／`recovery-frame-coverage-full-cleanup.json`。

### 網站停止後的檔案回查

選定、原預設入口與完整輪共三份實際VS下載，加上126份原生media與108份chunks二進位快照，完整大小／SHA逐一回查。完整媒體按相同SHA去重為4檔：三份VS下載、同一份4秒原生媒體快照。快照只複製原bytes並沿MIME加副檔名，不轉碼，也不冒充實際take下載；原始chunks是部分資料，只核對bytes，不當作可獨立播放影片。

產品主機與測試瀏覽器停止後，用新隔離Chrome156.0.8078.76的原生file播放器及真正Space按鍵，4/4播到ended、error0、總掉格0，有解碼影格及正音訊解碼bytes；各一條音軌。FFmpeg8.1.2完整解碼全部音視訊，4/4 exit0且stderr空。四檔時長分別2.001733／4.01／2.001033／1.9997秒；headless音效靜音，這不是真人聽音、同步／鏡像品質或G1–G7的長片驗收。

原始回查 `output/recovery-frame-coverage-playback.local.json` SHA-256 `6880a4bec6e6b703da13bf173238233e1009890df712867faa94830170a21e34`；控制器 `output/recovery-frame-coverage-playback.ts` 沿原download-playback.js。八個已記錄自有瀏覽器程序退出後才核對nonce釋鎖，沒有剩餘已知程序。所有合成原始資料只留本機，不放入Git或公開附件。

## 重跑與未驗項

使用固定Bun1.4.4，執行 `bun run check`、`bun run test:coverage:app recovery-frame-guard` 及完整 `bun run test:coverage:app`。完整準備會依缺檔狀態產生原reference；單獨原模式仍按 [媒體工具說明](../MEDIA_PROBE.md) 傳入已安裝Chrome與Playwright模組路徑。所有輸入為合成資料，鎖只由自有程序／nonce收尾釋放。

這是原守門取消／失敗恢復整合，不是新增產品修正或自然Safari／磁碟故障證據。原G1–G7、真人聽音、原生Safari／私人模式、實體／跨裝置與人工審查各自保留，iPhone延後；短片及插樁Chromium不能代簽。#103仍開啟，合併／正式發布授權仍待；原鍵盤Linux逾時也保持未解。
