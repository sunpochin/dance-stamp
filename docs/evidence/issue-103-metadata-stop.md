<!-- 檔案用途：固定保存中按停止的既有回歸接入完整量測之來源與證據。所在層：#103 品質證據。主要關聯：metadata-stop.js、run-app.ts、issue-13-unconfirmed-storage.md、TECHNICAL.md。 -->
# 保存中按停止：舊資料留下，同樣操作能再試

像寫字寫到一半按取消，原本的筆記與影片不能被擦掉；再次按保存也要能成功。這次把原有十條測試接進每天使用的完整檢查，讓這些保護不會漏測。產品程式沒有改動。

## 固定來源與方法

2026-10-31，接續 [#103](https://github.com/sunpochin/dance-stamp/issues/103)。從同步 main `d83755239bf145e9b79d50263208edfad83754e8` 建新分支，明示承接 [#122](https://github.com/sunpochin/dance-stamp/pull/122) 不可變候選 `b13677ff81a710a044fb05958377cb3ce6e84adf`。該候選 [CI #212](https://github.com/sunpochin/dance-stamp/actions/runs/41146426007) 三項 success、51 PASS／0 FAIL；Linux 行數100%／函式96.44%／分支88.26%，保留原來源歸屬。

`tests/browser/metadata-stop.js` 已有十條原生交易回歸，先前未接入完整量測。本次直接 import 同一份 `metadataStopCases` 並呼叫原函式，預設51→61條，選定案例模式仍只執行指定項目。原模組 SHA-256 `779d5b35d8b650ab8ceaed1369f016cde5f51686cf31b8f39e7c155949fbe41c` 未變；runner SHA-256 `b984b8fc7bff558392a1f9a45d85a4b550f07df91c69d5fe10feca1b76e756ef`。沒有另抄案例、改寫原斷言或新增產品依賴。

沿用既有合成 `export-failure/reference.mp4`（8秒、106,103 bytes）及 `self.mp4`（8秒、175,911 bytes），每輪自己的目錄、context、資料庫及實際下載。先從公開 UI 建立非空筆記、保存兩側原片、真正合成及保存基準 VS，再透過原生 get 延長真正 metadata put 成功但尚未提交的交易。這是受控等待時點，不是自然慢磁碟；實際點 Stop，核對可信原生事件，不手動派送 abort／complete。

| 原有案例 | Stop 後原生契約 |
| --- | --- |
| title、marker-edit、marker-delete、move-create | 本次交易 abort，舊資料與下載逐 byte 相同；同輸入重試 complete，重載一致 |
| reference-select、self-select、confirm-link | 同上；重試以來源 bytes／表單語意核對，不把新 ID 當成資料遺失 |
| preview-prepare、export-prepare | 同上；停止發生在 metadata 準備，不冒充已成檔 VS 的保存尾段 |
| comparison-queue | 新操作等待時按 Stop，先前獨立交易仍 pending；解除測試 hold 才 complete，新操作回取消，只有一次 metadata put |

保全包括完整 native library／revision／keys、所有舊 Blob 完整 bytes 與 SHA-256、原播放器／下載 URL、實際下載、同輸入重試及重載回查。九條可取消操作各下載六檔；獨立佇列三檔，每輪57次。硬體擷取 API 禁用，必須0次呼叫。

## 本機結果

選定十條：`coverage/app-jt0ntD/run.json`，10/10、0頁面錯誤、40次導航收集，案例時間合計50,095ms；57次實際下載、119份二進位快照。九條可信原生 abort、獨立佇列可信 complete，所有原函式斷言通過。來源 head 為上述 b13677f，trackedChanges=true；九個 Web 模組指紋與原候選相同。原始收據 SHA-256 `0f790e5311cb53917913b7a20fd107067e4fc0f43de835e6bf4c6eeca82a8758`。

完整輪：`coverage/app-D8KSok/run.json`，61/61、0頁面錯誤、270次導航收集，案例時間合計428,336ms。十條 metadata 案例52,974ms，另一次57次實際下載、119份二進位快照，九條 abort／一條獨立 complete 契約全部通過。Bun 1.4.4／macOS arm64／Chrome 156.0.8078.76；來源仍為 b13677f、trackedChanges=true，runner及九個 Web 模組 SHA 與上述選定輪相同。

| 完整輪模組 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| web/beats.js | 18/18（100%） | 5/5（100%） | 23/23（100%） |
| web/library.js | 266/266（100%） | 124/124（100%） | 348/363（95.86%） |
| web/local-audio.js | 144/144（100%） | 32/32（100%） | 171/187（91.44%） |
| web/main.js | 1236/1236（100%） | 367/385（95.32%） | 1057/1266（83.49%） |
| web/offline.js | 68/68（100%） | 21/24（87.5%） | 50/50（100%） |
| web/recorder.js | 120/120（100%） | 45/45（100%） | 128/136（94.11%） |
| web/storage.js | 104/104（100%） | 40/42（95.23%） | 75/84（89.28%） |
| web/sw.js | 37/37（100%） | 12/12（100%） | 25/25（100%） |
| web/timeline.js | 23/23（100%） | 6/6（100%） | 39/39（100%） |
| **加總** | **2016/2016（100%）** | **652/675（96.59%）** | **1916/2173（88.17%）** |

同輪單元基準為763/2016行、277/675函式、817/2173分支（37.84%／41.03%／37.59%），不是與瀏覽器百分比相加。全部九模組保留分母，skipped均0；相較原51條，新增命中 main.js:1294 原生重連保存 callback。未覆蓋仍有23函式、257分支臂：main.js18函式／209臂，offline.js3／0，storage.js2／9，library.js0／15，local-audio.js0／16，recorder.js0／8，其餘0／0。

未命中函式起始行：main.js `120,209,329,428,541,648,779,783,784,900,991,1007,1075,1165,1241,1494,1632,1700`；offline.js `48,78,81`；storage.js `17,53`。分支臂位置及計數完整保留於原 `app-coverage.json` 的 `branchMap`／`b`，包含沒有獨立位置的隱含 else；不能把行數100%當成所有取消／錯誤組合皆已驗證。

完整輪 `run.json` SHA-256 `57b1810ed3e09d14765e9a183021579b12eb5ea3cf3032666341018ef9003eda`；`app.json` `d009fd5359776a6eeaecf7140c5656f1a8c065c1ecda237f1c2e0cad365434c6`；`app-coverage.json` `c9c975ca9318d0d1d2a953bebd7e7f18fc87110e8a00f9b9eb11f83aa2cce776`。原始收據／HTML 與本機媒體保持在各自目錄，最終乾淨 head 的遠端 CI 另記，不改標本機來源。

`bun run check` 通過：647項測試、3174斷言、0失敗，既有19項 lint資訊；首次公開掃描288個已追蹤檔案，新證據文件尚未stage，提交hook再掃描。產品靜態版本仍 `d4a2a50194888b79`。完整輪11個已記錄自有程序識別均退出，主機停止、原nonce釋放；原始觀測為 `output/metadata-stop-coverage-full-processes.json`／`metadata-stop-coverage-full-cleanup.json`。

## 網站外影片回查

完整輪的網站與瀏覽器停止後，以新隔離 Chrome 156.0.8078.76 的原生 `file:` 播放器及真正 Space 按鍵重開檔案，不借產品 Blob URL／AudioContext。兩輪114次實際下載、238份二進位快照的完整 bytes／SHA重新核對，依相同 SHA 去重為24檔：兩支8秒原片、20支基準VS下載，以及兩支重試後新VS。後兩支只有原生保存快照，沿原MIME複製相同bytes／副檔名供播放，**不算實際下載**，沒有轉碼。

24/24原生播放器播至 ended、error=0、總掉格0，全部有解碼影格與正音訊解碼bytes；22支VS各一條音軌。再以 FFmpeg 完整解碼每檔全部音視訊，24/24 exit0、stderr空。實際時長範圍2.963967–8秒；這是短片可用性／音軌解碼證據，headless音效靜音，沒有真人聽音，也沒有替代G1–G7的長片／同步品質量測。

原始回查為 `output/metadata-stop-coverage-playback.local.json`，SHA-256 `7b510a1308aac70b41340c428eebdd836a1679ae5ac9c1f818416a4e54700e4f`；本機控制器 `output/metadata-stop-coverage-playback.ts` 直接沿用原 `download-playback.js`。八個已記錄自有瀏覽器程序退出後才核對nonce並釋放鎖；無失敗／剩餘已知程序。合成檔與原始收據只留本機，不加入公開Git或附件。

## 重跑與界線

使用 `.bun-version` 指定 Bun 1.4.4，先執行 `bun run check`，再執行 `bun run test:coverage:app`；單獨案例例如 `bun run test:coverage:app metadata-stop-title`。使用同一把原子 QA 鎖；只在自有程序收尾、nonce相符後釋放，不移除其他聊天的鎖。

原生保存停止、網站外檔案可播放與品質矩陣各自記錄；短片／插樁 Chromium 不替代 [RECORD_COMPARE G1–G7](../RECORD_COMPARE.md)、原生 Safari／私人模式、相機／麥克風、實體手機、真人聽音或接收者送達驗收。iPhone 延後；不調整時間映射、媒體門檻、CI期限或產品資料格式。本次沒有合併／發布授權，#103仍開啟，重要變更留待獨立審查。
