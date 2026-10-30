<!-- 檔案用途：固定四張待整合 PR 的來源、共同回歸與未驗項。所在層：匿名工程證據。主要關聯：TECHNICAL.md 第 8 節、tests/app-coverage/run-app.ts、issue #112。 -->
# #112：四張候選的共同驗證

把已各自測過的零件裝在一起，還要確認它們不會互相影響。本候選讓疊影大小／位置、自動檢查新版與完整 App 測試入口一起運作；使用者調好的位置、草稿與筆記，仍須在換片失敗或新版等待時保留。這份證據記錄共同版本，不把舊測試的成功直接加總成新版本已通過。

## 固定來源與實作

從同步 main `d83755239bf145e9b79d50263208edfad83754e8` 建 `codex/backlog-integration-20261030`，以保留來源父提交的單次整合納入：

| PR | 固定 head | 內容 |
| --- | --- | --- |
| #108 | `51760a696b7733640ab52d5614b1bc6485695b68` | 九個 Web JS 的統一覆蓋率、35 項原矩陣與 CI |
| #109 | `8a56878648f0e547ccd43f8ea7b4d4266220d4ef` | 疊影兩側大小／位置與重設 |
| #110 | `7884023817fcec36b47c4e9588e6e384316c900e` | 前景／連線／定時檢查新版，保留 waiting |
| #111 | `aab7fdcd20969246a2543cdd20677a6496c260ac` | #13 原生寫入中斷的既有匿名證據 |

產品 `main.js`／`style.css` 保持 #109，`offline.js` 保持 #110；HTML 同時保留 main #106 的選片文案與 #109 的新控制，並非宣稱整份等於 #109。#111 文件 bytes 完整保留；其中的原生測試仍歸屬它自己記載的版本。本輪不重跑或代簽該 SIGKILL 結果。

本輪只追加共同測試接線與 schema 升級失敗單元案例：

- 完整 App 矩陣加入既有疊影大小／位置與雙舊頁自動更新，35→37 項。每輪仍用同一份九檔來源與 Istanbul 位置表，不混合四個分支的覆蓋率。
- 更新測試主機使用真正資源 manifest；只在雙頁案例開放 current／next 切換，切換只改合成 worker 的版號。其他流程不可使用控制路由，每項前復原 current。
- schema 單元模型讓建立 store 拒絕或未知升版先觸發 abort，再收到 AbortError；驗證保留真正原因、沒有寫入筆記／原片，之後可重新開庫。讀回可攜內容按相同標準化規則比較，另核對原始儲存值不變。這不是原生 IndexedDB quota 或回滾驗收。

## 重跑

使用 Bun 1.4.4、已安裝的 FFmpeg 與 Chrome，執行：

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run test:coverage
bun run test:coverage:app
bun run package:web
bun run check:package
```

合成素材、完整下載、覆蓋率位置表與收據留 ignored `coverage/`、`output/`；不公開 profiles、媒體、裝置識別或私人資料。完整 App 入口原子取得共用媒體鎖，已有其他持有人就停止，不接管或刪鎖。

## 結果與限制

2026-10-31（Asia/Taipei），Bun 1.4.4／macOS arm64／Chrome 156.0.8078.76 headless。受測來源為上述 main 加四線整合與本輪追加測試的工作樹，`trackedChanges=true`；不改稱乾淨提交實測。產品建置靜態版本 `b55f6595864e728d`，插樁測試主機則明示使用 `coverage-synthetic`／`coverage-synthetic-next`，不是正式建置的媒體驗收。

- 原 `bun run check`：**645 tests／3,154 expects／0 fail**，公開掃描、型別、lint 及 build 通過；保留原有 19 項 lint info。
- 原單元 `test:coverage` 同批 645 tests 通過；LCOV 加總行數 2,135/2,244（95.14%）、函式 536/545（98.35%）。此入口的範圍與下表九檔 App 分母不同，不混算。
- 同一完整 App 輪的單元／VM 亦為 **645 tests／3,154 expects／0 fail**，**37/37 瀏覽器流程全過、page errors=0**，收集 175 份導航快照。疊影的兩層像素、縮放／位移／鏡像、壞檔／取消保留、匯出不改原左右配置與鍵盤／窄版通過；雙頁案例沒有手動呼叫 update，而由 pageshow 觸發產品自動檢查，真正候選保持 waiting、草稿與完整資料保留，最後舊頁關閉後才啟用，擷取 API 呼叫 0。
- 本機包建立及 `check:package` 通過，63 檔、靜態 `b55f6595864e728d`。此時仍是工作樹包；提交後的乾淨包與 CI 另由 PR 綁定，不能以本輪包冒稱最終 sourceRevision。
- 本輪真正下載的 `layout-vs.mp4`／`overlay-vs.mp4`，在沒有產品程式的原生 file 播放頁都到 ended、error=0、1280×720、90 個播放影格、dropped=0，音訊解碼 bytes 各 10,297／10,130；FFmpeg 另完整解碼 exit 0、stderr 空。檔案 SHA-256 各為 `5ac763a68114e03e0eb69831da487dd5fdd5707cff2145ad011103f12f86488e`／`b6049c62f299a8554f539a3bda9b3807da287c04f531e1a52588871e462de0c9`。這是兩份三秒成檔的獨立重開，不升格為完整品質矩陣。此獨立播放輪的已知 PID 子集確認退出、自有 nonce 鎖釋放；與完整覆蓋率 runner 的 handle 收尾收據分開。

同一來源、同一九檔分母，先合併本輪單元／VM，再加入同輪瀏覽器；左欄不是舊 main 的歷史基準，也不與 #108 的不同產品來源百分比直接比較：

| 指標 | 同輪單元／VM | 加入瀏覽器後 |
| --- | --- | --- |
| 行數 | 758 / 2,010 = 37.71% | **1,982 / 2,010 = 98.60%** |
| 函式 | 276 / 674 = 40.94% | **639 / 674 = 94.80%** |
| 分支 | 811 / 2,163 = 37.49% | **1,853 / 2,163 = 85.66%** |

| 檔案 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| `web/beats.js` | 100% | 100% | 100% |
| `web/library.js` | 100% | 100% | 95.86% |
| `web/local-audio.js` | 100% | 100% | 91.44% |
| `web/main.js` | 97.73% | 92.44% | 79.23% |
| `web/offline.js` | 100% | 83.33% | 100% |
| `web/recorder.js` | 100% | 100% | 94.11% |
| `web/storage.js` | 100% | 95.23% | 89.28% |
| `web/sw.js` | 100% | 100% | 100% |
| `web/timeline.js` | 100% | 100% | 100% |

仍有 28 行主畫面及其他函式／分支未覆蓋，包括部分相機／VS 保存失敗、影片系統分享與生命週期錯誤；沒有把未執行的防護刪掉、忽略低分檔案或宣稱達 100%。完整位置表與缺漏在 `coverage/app-bp2PCJ/` 的 `app.json`、`app-coverage.json` 與 `report.html`。

完整輪 runner SHA-256 `eedac9fa1870a51202a0979c2fd2412418c0d060eeb46896855082f73e015ecf`；`run.json` SHA-256 `cec9051ccefb73be8e7be8d8cd759dd622c9007535e36d7ea587e149bd7c30cb`。收尾收據為 browserClosed=true、serverStopped=true、lockRetained=false；這是 Playwright／Bun handle 的成功回覆，沒有另記逐個 OS PID 的原生退出證據。

先前兩次前置拒絕保留：第一次插樁在版號賦值加入計數器，舊宣告語法的替換沒有生效，被防護拒絕；改為替換明確合成字串，保留「無變更就拒絕」檢查。第二次其他離線驗收持有共用鎖，入口在啟動瀏覽器前停止；使用者要求保留該鎖，沒有接管或刪除。schema 案例初稿曾將讀回補上的合法欄位誤當成資料改變，改成雙側標準化比較並保留原始儲存值斷言；這些測試草稿失敗不列為產品缺陷或成功案例。

### #113：真正提交 hook 發現的測試環境污染

37 項瀏覽器全過後，第一次正常提交的 pre-commit 仍明確失敗：打包 CLI 的測試 fixture 沿用了 hook 匯出的本機 Git 環境，`git init` 沒有隔離在候選資料夾，導致外層共用 Git config 的 `core.bare=true`，後續合成 commit exit 128。沒有來源、分支或暫存內容遺失；只復原該錯誤設定，未重置或移動資料。此為可重現的測試工具缺陷，已另列 #113，不跳過 hook。

修正只在 `releasePackage.test.ts` 的 fixture 子程序使用 Git 原生 `--local-env-vars` 清單；保留其他環境與原全部封裝斷言。額外建立自己的外層倉庫與 staged sentinel，模擬 GIT_DIR／GIT_COMMON_DIR／GIT_WORK_TREE／GIT_INDEX_FILE／GIT_PREFIX，核對測後 config／index bytes 精確不變。單獨打包回歸全過；真正 pre-commit 及最終 CI 另綁提交結果。

此續修沒有改九份產品 JS、37 項瀏覽器函式或完整 App runner；前述來源 hash、完整輪與離站播放保留原工作樹歸屬。後續單元計數會增加環境邊界斷言，不將新的斷言數改貼到舊的完整輪收據。

本輪工程驗證不代替原生 Safari／私人模式、完整影音 G1–G7、真相機／指示燈、真人聽感／VoiceOver、五人操作、實體離線或跨裝置接收。iPhone 繼續暫緩。#103 尚未達 100% 的缺漏照實保留；其他仍需人工／裝置驗收的票不因本候選通過而結案。沒有合併 main、發布或改正式流量；Claude Code／使用者最終審查另計。
