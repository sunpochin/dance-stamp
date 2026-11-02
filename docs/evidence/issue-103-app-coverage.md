<!-- 檔案用途：記錄九個 App 程式的統一覆蓋率、重跑入口與驗收限制。所在層：版本固定的工程證據。主要關聯：tests/app-coverage/、TECHNICAL.md 第 8 節、issue #103。 -->
# #103：全 App 覆蓋率與恢復流程



## 2026-11-03 節拍器與真正 Worklet 量測（#226）

白話：節拍器也是產品的一部分，因此檢查表真的選片、找速度、播放和取消；負責算音量的小工具另外直接跑原程式，確認取消不交出半份結果，超過二十秒也不繼續長大。兩邊共用原檢查，不另寫一套節拍器。

前置為 #224 `c9558ff5c01035ad7379d2df425f17c365bca74f`、#225 `ec5106a0a43be97de82792bd48a51669f51ad4a5` 及 #230 `496af41a258c603d056e11ac718e1cab7ef5bd96`，均以正常 Git 來源保留。#227 的準備中取消缺陷先獨立修正，不混在本票純測試接線；設計與紅綠紀錄見 [TECHNICAL #227](../../TECHNICAL.md#227-分析準備期間的媒體取消)。本機選定輪產品來源為正常整合 `ad941dc8eee3ba4019249f38589d3d67f93db78e` 加未提交測試，`trackedChanges=true`。後續同步已合併 #224 的 main 到 `59d1bb287d141ae4df0751886f762ddf9be6203d`，全部 **24 個 `web/*.js`** SHA-256 與受測輪逐一相同；不把來源相同改稱提交後乾淨重跑。

技術：`verify-metronome.ts` 抽出 `runMetronomeScenario`，瀏覽器與來源由建立者提供；明確以 `newContext().newPage()` 建頁，彈出工具及獨立直開頁也經原收集器。原 CLI 仍建立自己的瀏覽器／主機；匯入共用函式不啟動它們。原 79 案名稱與順序保留，尾端新增 `metronome-integration` 第 80 案，沿同一份原生二十秒 120 BPM、工作台雙片保全、noopener、直開、控制、背景處理、320px、取消重試及 #227 八案。後者收據包含真正原生 promise 的 settlement，不把短暫等待當舊工作已結束。

`tempo-worklet.js` 位於獨立 AudioWorklet 全域，不能拿頁面計數替它作證。本票沿現有 `sourceForVm`／`vmCoverageContext` 執行真正註冊的 `TempoEnvelope` 類別，僅提供訊息埠與固定合成 sampleRate；核對雙聲道原聲通過、缺聲道／無輸入、RMS、stop 只交付一次、cancel 不交付、重開不沿用前次 requestId／半桶樣本，以及 2,000 包絡上限後原聲仍通過且不再累積。三個既有 BPM 單元加三個 Worklet 邊界單元共 6／6、212 斷言。這是 VM 邏輯證據，原生 worklet 能力另由瀏覽器真正解碼／分析確認，不宣稱已擷取 AudioWorklet 原生 scope 計數。

Bun 1.4.4／macOS arm64／Chrome 156.0.8078.76：原 `bun run check` 通過 **760 tests／4,383 expects／0 fail**，公開掃描、型別、lint、build，原 19 項 lint info保留，產品靜態仍 `07cdd7b66289af39`。選定 `run-app.ts metronome-integration` **1／1、26,262ms、0 page errors**，六個延遲等待全部真 fulfilled 後仍保持取消；兩個合法初始化與原完整功能皆通過。收據 `browserClosed=true`、`serverStopped=true`、`lockRetained=false`，自有 nonce 已釋放。

同一選定輪的 24 檔同來源、同位置表數字如下；左欄是本輪單元／VM，右欄才加入單一節拍器情境，**不是完整 80 案結果**：

| 範圍 | 單元／VM | 加入節拍器公開流程 |
| --- | --- | --- |
| 全 App 行 | 1,231／3,357（36.66%） | 1,982／3,357（59.04%） |
| 全 App 函式 | 418／1,127（37.08%） | 572／1,127（50.75%） |
| 全 App 分支 | 1,386／3,713（37.32%） | 1,825／3,713（49.15%） |
| metronome.js 行 | 0／129 | 125／129（96.89%） |
| tempo-worklet.js 行／函式／分支（VM） | 16／16、4／4、19／19 | 同樣 100%，不當原生 scope 收據 |
| tempo.js 行／函式／分支 | 30／30、15／15、41／45 | 100%／100%／91.11% |

原獨立 `bun --no-env-file scripts/verify-metronome.ts` 在抽取後亦完整通過，六份 startup 原生等待皆 fulfilled、兩正例及原二十秒分析／工作台保全全部通過，零頁面錯誤；自有測試子程序 exit0 後依 nonce 釋鎖。其日誌 SHA-256 `71d2d48da1830d22f77b50c7a32894182fe9c4691ae90a17ba716e4830a5f100`；不與插樁輪混成另一個完整 80 案結果。

原始選定收據 SHA-256 `d23ad7f63d0ddc9d0a9027113880a09ffbb8b0934496777abc2da786826f1d3b`，完整計數器收據 SHA-256 `07c2968d1c3ccf1aeafb5c863c7e3869f04e8f3764db3b8c31d9c0e053ae1bf9`。合成素材、raw 與截圖留 ignored 目錄，不公開音訊或私人媒體。重跑先原 `bun run check`，局部用 `bun --no-env-file tests/app-coverage/run-app.ts metronome-integration`，完整用原 `bun run test:coverage:app`；原下載、badge 的完整矩陣／乾淨來源守門保持。原生 Safari、手機、真人聽感、完整 G1–G7 未驗證，#103／#209 的原完整目標不結案。

### #224 的 21 模組完整 CI 收尾（與上表分開）

[CI 41488467616](https://github.com/sunpochin/dance-stamp/actions/runs/41488467616) 固定 head `c9558ff5c01035ad7379d2df425f17c365bca74f`，原 78 案加最後 cloud-integration 共 79 個不同名稱全部成功，全部 21 份產品 SHA 對上來源；行 **3,127／3,182（98.27%）**、函式 **1,014／1,066（95.12%）**、分支 **3,034／3,506（86.53%）**，skipped=0。協調者另下載 ZIP 並核對 GitHub digest `a5013d429107a9b6a584a2324eec6f2bf1299ea862eb5c18413ee125e5dd73e5`，逐項核對精確 head、完整矩陣、下載與必要 checks 後合併 #224 為 main `4e52e604deeb89b73abafcd2d28aaacaa4fc0c2b`，#222 自動結案。這個 21 模組來源的 before／after 是 92.89%→98.27% 行、86.30%→95.12% 函式、83.45%→86.53% 分支；不能與新增節拍器後 24 模組的選定輪混算或代簽完整 80 案。


## 2026-11-03 雲端公開流程接入同一 App 量測（#222）

白話：雲端功能已經加入產品，檢查表也要真的點過保存、接續與分享。這次把原本獨立跑的同一份檢查接回總檢查，不另寫一套流程，也不把沒有測到的檔案拿掉來提高數字。

固定基線為 main `83220edabd90cab274532900763c4ff696dffdc5`。[該版完整 CI](https://github.com/sunpochin/dance-stamp/actions/runs/41473945359) 已包含全部 **21 個 `web/*.js`**：行 2,956／3,182（92.89%）、函式 920／1,066（86.30%）、分支 2,926／3,506（83.45%）。取得其 `app-coverage-report` 的 `summary.json`／HTML 後，逐一比對本輪全部 21 份產品 SHA-256 相同；GitHub artifact metadata 的 digest 為 `a8c4342ab6cf3559b7abdf508e335392f4c60415468adfbb7c52d1f7f5ebfe2e`，本輪未另下載原 ZIP 重算該 digest。原報表可見雲端 UI 大量未覆蓋，原因是原 `scripts/verify-cloud.ts` 尚未進同一輪插樁，並非分母遺漏。

技術：原腳本抽出 `runCloudScenario(browser, origin, out, buildVersion?)`，獨立 CLI 仍建立自己的瀏覽器／靜態主機；完整量測則注入原插樁瀏覽器及來源，在原 78 個情境之後追加第 79 個 `cloud-integration`。新建 context 經原 `newContext` 包裝，關閉前仍收集 coverage；原 statement／function／branch 位置表、來源核對與完整分母全部保留。共用情境只關閉自己建立的 contexts，瀏覽器／主機由各入口收尾；匯入共用函式本身不啟動瀏覽器或主機。完整量測使用插樁資源，未提供實際 buildVersion，不把缺省值當正式建置識別。

原公開 UI 斷言完整沿用：合成供應商授權／背景往返、雙片保存與讀回、session-only 原片在新頁真正從 IndexedDB 讀回 SHA、另一隔離 context 預覽／下載／原子接續、父版本與缺片、切換版本清除舊確認、獨立成品分享與確認、permission 收據 PATCH 未送達後重試補送／撤銷、390px 及 Escape 回焦點。供應商端點全部為受控合成回應；沒有真實 OAuth、帳號或私人影片。

本機 Bun 1.4.4／macOS arm64／Chrome 156.0.8078.76：

- 原 `bun run check`：754 pass／0 fail／4,141 expects，公開掃描、型別、lint、build 通過，保留原 19 項 lint info，靜態仍 `83a29a61027b205d`。
- `bun --no-env-file tests/app-coverage/run-app.ts cloud-integration`：選定 1／1，6,906ms、0 page errors；`browserClosed=true`、`serverStopped=true`、`lockRetained=false`。來源如實為上述基線加未提交測試修改，不冒稱乾淨提交重跑。21 份產品 SHA 與基線完全相同。
- 此選定輪共用單元基準後，cloud-ui／cloud-practice-ui／cloud-share-ui／cloud-auth 行數分別為 77.21%／88.07%／86.66%／96.42%；整體為 2,173／3,182（68.29%），**這是一個情境，不能與原 78 案的 92.89% 比成整體退步或提高，也不拼加報表**。完整第 79 案後數字以確切提交的 CI 另記。
- 原 `bun --no-env-file scripts/verify-cloud.ts` 亦完整通過、0 page errors；獨立 CLI 收據有真建置 `83a29a61027b205d`，不與插樁輪混用。所有既有公開操作／資料保全斷言保持，兩路只共用同一函式。
- 插樁收據 `run.json` SHA-256 `b42868a90284ea1fb2d6490b59188edef8fed884acf364027f11854f106ea7e9`、完整計數器收據 SHA-256 `5738f878b9c7e55d52e50759847a234e90bbd7e87718bee6dbab10dff990798f`；原始合成素材、截圖與收據只留 ignored 目錄。

重跑先 `bun run check`，局部用上述選定命令，完整用原 `bun run test:coverage:app`；原下載離站驗證與 badge 的乾淨來源／完整矩陣守門照舊。尚未達 100%，且此接線不新增原生 Safari、真 Google、匿名實播、實體裝置、真人聽感或完整 G1–G7 證據，#103／#209 等原驗收保持開啟。後續若納入節拍器等新產品檔，必須自然加入新分母、重新量測，不能移用這份 21 檔數字。

以下為 2026-10-30 的九檔歷史來源，數字與當時環境保持原歸屬。

2026-10-30，從 main `5078401dd1dea60050a9961e34cb499a274e3183` 建專用分支，承接既有未提交的量測工作。受測為該基線加本輪測試／工具的工作樹，`trackedChanges=true`；九份產品 `web/*.js` 與該 main 完全相同。後續只補文件、CI 及授權索引，不將本機工作樹結果改稱乾淨提交實測。Bun 1.4.4、macOS arm64、Chrome 156.0.8078.76 headless；只使用合成影片、假相機及獨立瀏覽器 context。

完整輪後納入既有 [PR #105](https://github.com/sunpochin/dance-stamp/pull/105) `d491917052d8fb7b4c5bc8bafa937af5208ab1df` 作前置，沿用其鍵盤焦點修正與原始證據；本輪只在該案例增加可見性與真正 Enter→FileChooser 的檢查。納入後的九份產品程式及本輪實際執行的瀏覽器案例與受測工作樹相同，不把 #105 自己的媒體數字移記為覆蓋率證據。遠端 CI 另綁提交後 head。

## 口徑與結果

原 #99 的 Bun／LCOV 只統計其載入模組，不能與本表直接比較。以下兩欄來自**同一候選、相同九檔、同一套 Istanbul 位置表**：先合併本輪補測後的單元／VM，再合併同輪 35 項瀏覽器流程；左欄不是原 main 的歷史覆蓋率。加總各檔 covered／total，不平均檔案百分比，也不混入 harness 或不同引擎的計數。

| 指標 | 同輪單元／VM 基準 | 加入瀏覽器後 |
| --- | --- | --- |
| 行數 | 742 / 1,982 = 37.43% | **1,953 / 1,982 = 98.53%** |
| 函式 | 272 / 670 = 40.59% | **635 / 670 = 94.77%** |
| 分支 | 798 / 2,146 = 37.18% | **1,836 / 2,146 = 85.55%** |

| 檔案 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| `web/beats.js` | 100% | 100% | 100% |
| `web/library.js` | 100% | 100% | 95.86% |
| `web/local-audio.js` | 100% | 100% | 91.44% |
| `web/main.js` | 97.7% | 92.38% | 79.09% |
| `web/offline.js` | 100% | 82.6% | 100% |
| `web/recorder.js` | 100% | 100% | 94.11% |
| `web/storage.js` | 99.03% | 95.23% | 89.28% |
| `web/sw.js` | 100% | 100% | 100% |
| `web/timeline.js` | 100% | 100% | 100% |

未達 100%。主畫面尚缺相機錯誤、VS 系統分享、特定刪除／失敗與 owner 時序等路徑；儲存尚缺升版失敗分支，離線模組仍有未執行函式。JSON 同時保留每檔未覆蓋行／函式與完整分支位置、各分支計數，沒有忽略低分檔案、刪除護欄、改分母或設低門檻來宣稱完成。

## 工具與有意義的驗證

- `test:coverage:app` 先準備缺少的合成素材，再以相同插樁合併單元 import、VM 的 storage／SW 及隔離 Chromium。列舉全部 `web/*.js`，未載入者仍留在分母且為零分；每輪獨立目錄，下載只寫入本輪副本。
- 收據固定九檔 SHA-256，另核對 statement／function／branch 位置表與非負整數計數；拒絕其他版本、未知檔案、錯位或負數收據。空的新頁面計數不能清掉舊頁面已執行的內容。
- 真正的頁內重載前收集 beforeunload／pagehide；重載回歸確認舊頁曾執行鏡像繪製、新頁該處計數為零，而合併報表仍保留它。本輪共收 165 份導航快照。
- 新增真實 IndexedDB 的非法 revision／chunk、重複鍵保留、順序恢復、只清指定媒體與 chunks、不完整 schema 保留、原生 VersionError 後重開；補有拍數倒數的完整假相機錄影、落盤／原片下載及 track 釋放。
- 原操作、動作庫、拍點、分享／備份、取消／錯誤恢復與未確認保存的 Tab／Enter 救援仍使用既有案例。加上最新左右選片與疊影回歸；新版鍵盤入口實際按 Enter 開啟 FileChooser，不要求焦點停在已隱藏的檔案欄位。
- WebKit 音訊條件案明確以 Chromium 選擇該分支，驗真正 AudioDecoder、WebM、能力拒絕保留前次 VS 及重試；它不是原生 Safari。逾時／原生通知缺失的單元案只壓縮等待，不偽造成功通知。

完整輪：**642 tests／3,109 expects／0 fail；35/35 瀏覽器案例，0 page errors**。正常品質入口、原單元覆蓋率、打包校驗及提交 hooks 另外執行；遠端結果以 PR 同一 head 的 Checks 為準。本機 Playwright close、自有主機 stop 均成功回傳，自有 nonce 鎖已移除；不將這個收尾觀測冒稱逐個 OS PID 的原生退出證據。

## 重跑與來源

先依根文件安裝指定 Bun，執行 `bun install --frozen-lockfile --ignore-scripts`。本機須有 FFmpeg 與 Chrome；可用 `DANCE_STAMP_CHROMIUM` 指定已安裝瀏覽器，不自動下載。一般入口：

```sh
bun run check
bun run test:coverage
bun run test:coverage:app
bun run package:web
bun run check:package
```

每輪 `coverage/app-*/` 產出 `run.json`、`baseline.json`、`app.json`、含原始位置表的 coverage 收據及 `report.html`。HTML 可直接看總表與紅色未覆蓋行；raw、下載、合成素材及導航快照留 ignored 目錄，不公開附件。CI 保留原兩個 job，另以相同入口執行完整 App job；任何案例或未處理例外失敗均回非零，高覆蓋率不能抵銷失敗。

本輪 runner SHA-256：`7c2c687dc01de9d93df8784771ea9acbc91f467848d745756a662b6a8b8b5c01`；成功 `run.json` SHA-256：`181a459c2fe901a1d3c3b5d76536dfb52fb5e39bb5e03c446263b5403b45e378`。收據包含完整產品 SHA、執行環境、單元基準、各案例與收尾狀態。

首輪受限執行環境的本機 listen 被拒絕，未修改測試放行；取得本機測試服務權限後原 check 通過。第一次完整輪 34/35，舊鍵盤焦點斷言使整輪明確失敗；修正為新版真正選檔操作後，單案與上述完整重跑通過。失敗 raw 保留，不與成功輪混記。

遠端首輪 CI 的 harness 與 linux-install-restart 已成功；新 App job 因 Ubuntu image 缺少 FFmpeg，在啟動測試前被工具前置檢查拒絕。後續只在該 job 安裝合成素材所需的發行版 FFmpeg，不跳過檢查、不將編碼器或測片放進產品下載包；完整結果依新 head 的 Checks 續驗。

## 驗收界線

此數字僅涵蓋九份 App JavaScript 的插樁工程測試，未涵蓋 HTML／CSS、產生器、主機或全 repo 的覆蓋率。原 Bun 報表繼續獨立產出，新增量測 helper 後也不可沿用 #99 的舊分母數字。

未重跑原生 Safari／私人模式、完整影音 G1–G7、產品外媒體品質、自然低空間／斷電、真人相機／聽感、VoiceOver、五人操作、觸控或跨實體裝置。iPhone 與真人／實體裝置驗收繼續暫緩；不因行數接近 100% 關閉 #103、其他未驗收票或代替獨立審查／發布核准。
