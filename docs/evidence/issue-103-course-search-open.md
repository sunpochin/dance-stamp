<!-- 檔案用途：記錄分類搜尋的課程按鈕接回真實操作驗證之來源與結果。所在層：#103 品質證據。主要關聯：moves.js、run-app.ts、issue-17-moves.md、TECHNICAL.md。 -->
# 搜尋找到課程後，能直接開啟正確筆記

像在書架找到一本書，還要真的打開，才知道不是只找到一張書名卡。這次在原有搜尋測試中真正按「開啟課程」，確認開到那堂課的筆記；離線有副本能看，只有備份筆記時會清楚提醒重新選片。產品程式沒有改動。

## 固定來源與範圍

2026-10-31，接續 [#103](https://github.com/sunpochin/dance-stamp/issues/103)。從同步main `d83755239bf145e9b79d50263208edfad83754e8` 建新分支，明示承接 [#123](https://github.com/sunpochin/dance-stamp/pull/123) 不可變候選 `a660984336125c7029b10655011f85c573320916`。前置的完整61條、本機／Linux、網站外影片與最終head檢查保持各自來源歸屬，不合併不同輪計數。

原 `moves.js` 已建立兩堂合成課程、兩個片段與take，驗分類搜尋數量、動作片段跳轉及比較歷史；沒有按課程搜尋結果的「開啟課程」。前置完整輪 `coverage/app-D8KSok/app-coverage.json` 中 main.js:1075 的該callback未命中。本次沿用原函式、素材及context，保留全部既有斷言，只補以下實際操作：

| 路徑 | 使用者操作與核對 |
| --- | --- |
| 線上已保存副本 | 先從第二堂切回指定第一堂，再用NFKC關鍵字／舞風／老師／日期篩到第二堂並按課程按鈕；核對ID、標題、老師、筆記與已解碼示範，完整library／revision不變 |
| 同context離線重開 | 原service worker取得控制後真正關網路並重載，篩到老師甲的課程；按課程按鈕，核對正確ID／標題及可解碼保存副本，完整標準化備份相同 |
| 新context只還原JSON | 已確認media keys為0，按指定課程按鈕；核對正確ID／標題／原筆記、明示尚未連結、沒有舊播放器src，完整還原資料不變；再走原本人工重連與比較歷史流程 |

選第一堂時沿可見課名定位，不綁搜尋排序。單一老師篩選回查後恢復原條件，避免新增步驟藏掉原本後段的跨課程解除關聯／刪除按鈕。沒有偽造離線、呼叫內部handler或新增測試框架；本次沒有新影片輸出，不借前置影片重播當新驗收。

## 失敗與選定輪

初輪 `coverage/app-HFasz2/run.json` 失敗：新增離線回查留下老師甲篩選，原後段解除甲的片段關聯後，動作不再符合該篩選，等待「移除動作…」15秒逾時。這是新增測試控制問題；保留失敗收據／日誌與當時案例副本 `output/course-search-open-first-moves.js`（SHA-256 `c58b460da368f0e904ec49b0cf6cdbc2cf351ed53d4434406a8a95b5d7e72e62`），沒有據此修改產品或放寬原斷言。

清回原篩選後，選定 `moves`：`coverage/app-i8wcGh/run.json`，1/1、4,028ms、0頁面錯誤／0外部來源請求、8次導航收集。三種courseSearchOpen均true，原跨課程定位、手動狀態、比較歷史、離線／新context備份恢復、缺片重連、解除關聯／刪除保全與390px窄版檢查均通過。原產品仍未改；本機Bun1.4.4／macOS arm64／隔離Chrome，來源head a660984、trackedChanges=true。

最終案例SHA-256 `9caf037e23e149279dabed7878316badb566468b39188d7c3d8ffb6a7645088e`；runner仍 `b984b8fc7bff558392a1f9a45d85a4b550f07df91c69d5fe10feca1b76e756ef`。選定收據SHA-256 `4db3489ada411275359170a210fd55da1f48c1ae87d930c254e77e4506398f68`；browserClosed／serverStopped均true，lockRetained=false。

## 完整輪與品質檢查

完整輪 `coverage/app-naDUFq/run.json`：61/61、0頁面錯誤、270次導航收集，案例時間合計428,839ms；其中moves為3,943ms，三種課程開啟及全部原結果均true。Bun1.4.4／macOS arm64／Chrome156.0.8078.76，來源a660984、trackedChanges=true；完整輪後只補文件，沒有改稱最終乾淨提交重跑。

| 完整輪模組 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| web/beats.js | 18/18（100%） | 5/5（100%） | 23/23（100%） |
| web/library.js | 266/266（100%） | 124/124（100%） | 348/363（95.86%） |
| web/local-audio.js | 144/144（100%） | 32/32（100%） | 171/187（91.44%） |
| web/main.js | 1236/1236（100%） | 368/385（95.58%） | 1059/1266（83.64%） |
| web/offline.js | 68/68（100%） | 21/24（87.5%） | 50/50（100%） |
| web/recorder.js | 120/120（100%） | 45/45（100%） | 128/136（94.11%） |
| web/storage.js | 104/104（100%） | 40/42（95.23%） | 75/84（89.28%） |
| web/sw.js | 37/37（100%） | 12/12（100%） | 25/25（100%） |
| web/timeline.js | 23/23（100%） | 6/6（100%） | 39/39（100%） |
| **加總** | **2016/2016（100%）** | **653/675（96.74%）** | **1918/2173（88.26%）** |

全部9模組保留同分母，skipped均0。同輪單元基準763/2016行、277/675函式、817/2173分支（37.84%／41.03%／37.59%），不與瀏覽器百分比相加。前置本機61條為652/675函式、1916/2173分支，九份Web來源SHA與本輪相同；本輪實點課程按鈕命中原先main.js:1075未執行的callback，不直接呼叫函式湊數字。

仍未覆蓋22函式／255分支臂：main.js17／207，offline.js3／0，storage.js2／9，library.js0／15，local-audio.js0／16，recorder.js0／8，其餘0／0。未命中函式起始行：main.js `120,209,329,428,541,648,779,783,784,900,991,1007,1165,1241,1494,1632,1700`；offline.js `48,78,81`；storage.js `17,53`。各分支位置與計數保留於同輪app-coverage.json的branchMap／b，不用行數100%代替所有錯誤路徑驗收。

完整run.json SHA-256 `5c071450f02ee9f4df35234ad88ed0abc8cf8c3ff19be9ff61d9e8c4513fe188`；app.json `a4bec07ca2e36085a600d8129a0b68329fb5d7605e4c3a34a280a39100943646`；app-coverage.json `8dab3d67e9cac6a4c5f86d69f16d1380d89790016ef0a3d25b66ebf5d2e4d93e`。九個已記錄自有程序均退出，browserClosed／serverStopped均true、原nonce釋放；收尾原始觀測為 `output/course-search-open-full-processes.json`／`course-search-open-full-cleanup.json`。

正常 `bun run check`：647項測試／3174斷言／0失敗，既有19項lint資訊，靜態版本仍 `d4a2a50194888b79`；首次公開掃描289個已追蹤檔案，新文件尚未stage，提交hook再掃描。

前置a660984的 [CI #213](https://github.com/sunpochin/dance-stamp/actions/runs/41150678868) 此時已終態**失敗60/61**：新增十條保存停止均通過，既有comparison-keyboard等待filechooser15秒逾時；harness與Linux安裝中斷檢查success。失敗輪仍列出100%／96.59%／88.31%計數，不把高覆蓋率當通過；可信Enter／click紀錄與原始日誌保留，#118同類問題根因未確認。本次搜尋補測沒有修正該Linux問題，最終乾淨head的CI另記。

## 重跑與未驗項

使用 `.bun-version` 的Bun1.4.4，先跑 `bun run check`，再以 `bun run test:coverage:app moves` 或完整 `bun run test:coverage:app` 執行。沿用同一原子QA鎖與自有nonce規則，不清除其他聊天的鎖。

這是桌面合成UI／本機資料讀取回歸，不是已修復產品bug聲明。原真人可用性、VoiceOver、原生Safari／私人模式、實體／跨裝置與G1–G7等門檻各自保留，iPhone延後；沒有合併／正式發布授權，#103保持開啟，重要變更仍待獨立人工審查。
