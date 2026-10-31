<!-- 檔案用途：記錄既有匯出暖機停止回歸接入完整 App 量測。所在層：#103 品質證據。主要關聯：export-ready.js、run-app.ts、MEDIA_PROBE.md、TECHNICAL.md。 -->
# 準備匯出時，按停止仍能留下上次的影片

準備匯出一段 Salsa 八拍時，如果改變主意按「停止」，上次成功的影片和筆記應該留下；再按匯出，仍能完成下載。這次把原有的準備停止與播放拒絕回歸接進完整檢查，沒有改產品程式。

## 固定來源與原有契約

2026-10-31，接續 [#103](https://github.com/sunpochin/dance-stamp/issues/103)。從同步 main `d83755239bf145e9b79d50263208edfad83754e8` 建立獨立分支，承接 [#126](https://github.com/sunpochin/dance-stamp/pull/126) 固定候選 `c6f7325a2e037b71b62873fded864134a69a2b2a`。前置 [CI #216](https://github.com/sunpochin/dance-stamp/actions/runs/41157638939) 三項成功、精確 head 的 Linux 完整 62/62，九模組行數100%／函式96.88%／分支88.21%；與前置本機88.35%分支各自保留。

原 `tests/browser/export-ready.js` 已有暖機原生影格暫緩交付、真正 Stop、同頁成檔下載，以及準備／正式播放各一次拒絕；先前完整入口沒有納入。本次直接加到原62條之後，完整預設62→63，不改前62條順序。原案例完整內容、合成比較素材、12–14秒／offset4秒配方、等待期限和所有斷言均保留，沒有另抄流程。

原案例 SHA-256 `1f2cb839060c80d20abb43a9e86552626495e7dc724683f81c852acc306773c3`。兩側 rVFC 仍由原生 API 請求，測試僅暫不交付已到達的回呼；按停止後，pending／held 皆須清空且未建立編碼器。這是受控停止時機，並非自然 Safari 解碼故障。移除暫緩後同頁真正成檔及 download／saveAs；兩次拒播為明示單次 Promise 拒絕，不冒稱原生自發拒播。

保留原 metadata 全體比較、舊輸出 URL、待處理影格、所有擷取 tracks 結束及兩側 paused 斷言。這個案例沒有逐 byte 比對原有全部媒體，也未插樁計時器／listener 數量；不把既有斷言擴大成這些證據。硬體相機 API 在案例中停用，只讀合成既有雙片。

## 驗證紀錄

選定 `coverage/app-WXOzOj/run.json`：1/1、5,431ms、0頁面例外、3次導航收集，暖機Stop／兩次拒播與同頁下載全部通過。來源為c6f7325加runner改動、trackedChanges=true，不改稱最終提交乾淨來源。九份產品來源SHA與前置完整輪相同，runner SHA-256 `b061f04be7c439736d2b0ad39eceee9b3bab2e70d2aabb0fe81315a83d59e1fe`；原完整輪main.js:329計數0，本次選定計數2。browserClosed／serverStopped均true、lockRetained=false。

選定收據SHA-256 `bccd360520806025e38cfcb9964755424d0f71fdadc5e7fba00d78c03aea6905`。原來源副本reference.mp4為80秒、1,221,863 bytes、SHA-256 `b5405bf60ab0600e7b77f216c7c6310cc52133e82df0f816068ea908e65ebeb0`；self-1.mp4為75秒、1,146,992 bytes、SHA-256 `384d749ce2dfe1f2ba18705ae9cc9f401da3ecbd2140ce585dbc6011b86b3ff6`，均320×180且含音軌，未縮短原來源。真正VS重試下載57,533 bytes、SHA-256 `7a2294fa38d8bce3dc4739baf019d34fe646f9480f8a270f9fe8f72231499511`，原`download/saveAs`保存在該輪media/comparison/ready-retry.mp4。

正常`bun run check`通過：647項／3174斷言／0失敗，公開掃描294個已追蹤檔案，保留19項既有lint資訊，建置靜態仍d4a2a50194888b79。新本文於提交暫存後由正常hook再掃描，最終hook與乾淨head的遠端結果另記於PR；不把這輪工作樹收據改標成最終提交重跑。

### 完整同輪結果

`coverage/app-aUbuXu/run.json`：63/63、0頁面例外、278次導航收集，案例時間合計450,244ms，新增暖機案例5,230ms。原62條順序與全部斷言保留；新案例仍實際命中main.js:329兩次，沒有直接呼叫內部handler。來源c6f7325加測試／文件改動、trackedChanges=true；完整輪後僅整理文件，不改標成最終乾淨提交重跑。

| 模組 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| web/beats.js | 18/18（100%） | 5/5（100%） | 23/23（100%） |
| web/library.js | 266/266（100%） | 124/124（100%） | 348/363（95.86%） |
| web/local-audio.js | 144/144（100%） | 32/32（100%） | 171/187（91.44%） |
| web/main.js | 1236/1236（100%） | 370/385（96.1%） | 1058/1266（83.57%） |
| web/offline.js | 68/68（100%） | 21/24（87.5%） | 50/50（100%） |
| web/recorder.js | 120/120（100%） | 45/45（100%） | 129/136（94.85%） |
| web/storage.js | 104/104（100%） | 40/42（95.23%） | 75/84（89.28%） |
| web/sw.js | 37/37（100%） | 12/12（100%） | 25/25（100%） |
| web/timeline.js | 23/23（100%） | 6/6（100%） | 39/39（100%） |
| **合計** | **2016/2016（100%）** | **655/675（97.03%）** | **1918/2173（88.26%）** |

全部9模組分母及skipped0保留，同輪單元／VM基準為763/2016行、277/675函式、817/2173分支（37.84%／41.03%／37.59%），不與瀏覽器百分比相加。九份產品來源SHA與前置完整輪相同。前置完整輪函式654/675，本輪655/675；分支1920→1918，差異只有main.js:293／309的readyState<2分支本輪未自然出現（原計數6／2，本輪0／0），沒有新增未覆蓋產品程式或刪除保護，也不為追高百分比重跑。函式與分支分開判讀，行數100%不當作所有路徑已驗收。

剩20個函式／255個分支臂。未命中函式起始行：main.js `120,209,428,541,648,779,783,784,900,991,1007,1165,1494,1632,1700`；offline.js `48,78,81`；storage.js `17,53`。分支缺漏分布：main.js208、library.js15、local-audio.js16、recorder.js7、storage.js9，其餘0；完整branchMap與計數保留於同輪app-coverage.json。

完整收據SHA-256 `8df3db62186a88cf946484c7cae566853a28300fb9741e02e14557dc8d61903c`；app.json `bbdc41cff6e85f0da6f84cd8085de5b067dd8f0e0c6687c468c72915b8641135`；app-coverage.json `ee28e2220387999876be62e6f2f2921c4982ad56a97f41a06dabef67b35794fb`。完整輪真正VS下載58,274 bytes、SHA-256 `5003d497276ecfa3464df19274a83d4996b6675ae019023f577308b3bf8c3e55`，與選定下載各自保存。

browserClosed／serverStopped均true、lockRetained=false；另比對9個已記錄自有PID的啟動時間與命令，原識別全部退出，自有nonce已釋放。後續其他聊天取得自己的新鎖，不接管或刪除；本機觀測為`output/export-ready-coverage-full-processes.local.json`與`export-ready-coverage-full-cleanup.local.json`。

### 網站外實際播放

選定與完整輪均已停止產品主機／瀏覽器，再沿原`download-playback.js`，於全新隔離Chrome156.0.8078.76的原生file播放器，以真正Space按鍵從零播到ended。兩份真正VS下載的完整大小／SHA在播放前後一致；2/2 ended、error0、1280×720、各一條音軌、總掉格0，音訊解碼bytes皆正值。原生時長分別1.966／1.999433秒；照實記錄，不裁切、補幀或調整時鐘。

FFmpeg8.1.2完整解碼全部影音軌，2/2 exit0且stderr空。headless音效靜音，這是可解碼／可播放證據，不是真人聽音、同步／鏡像品質或完整G1–G7。沒有替原案例新增全部舊媒體的逐byte保全聲明。

原始收據`output/export-ready-coverage-playback.local.json` SHA-256 `ec75ef4e0ba43846a96a314c7f620556346e4212182afed1104a6ed419f7fc8a`，本機控制器SHA-256 `3786cb8d52e002356fb854ccc76ee4af578e482e1d8cda3d3d0eacfa26169afc`。8個已記錄自有瀏覽器程序全部退出後才核對nonce釋鎖；鎖忙碌時先查證另一條Safari程序仍執行並等候，沒有接管。合成輸入、實際下載與完整原始收據只留本機，不放入Git或公開附件。

## 重跑與界線

使用固定 Bun1.4.4、已安裝的 Chrome／FFmpeg，執行 `bun run check`、`bun run test:coverage:app export-ready` 與完整 `bun run test:coverage:app`。沿完整入口自己的合成副本、隔離 profile 與原子共用 QA 鎖；只由自有 nonce 收尾，不接管其他聊天的程序。

恢復片段的取消 callback（main.js:1241）與本次 timeline 暖機取消（main.js:329）各自量測，不挪用覆蓋結果。短片、插樁 Chromium、受控拒播與檔案解碼不能替代 G1–G7、真人聽音、原生 Safari／私人模式或實體／跨裝置驗收，iPhone 延後。#103保持開啟，#123鍵盤自然逾時仍未解，#114保持開啟待審；未合併或正式發布，仍待人工最終審查。
