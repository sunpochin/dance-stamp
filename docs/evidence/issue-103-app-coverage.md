<!-- 檔案用途：記錄九個 App 程式的統一覆蓋率、重跑入口與驗收限制。所在層：版本固定的工程證據。主要關聯：tests/app-coverage/、TECHNICAL.md 第 8 節、issue #103。 -->
# #103：全 App 覆蓋率與恢復流程


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

## 2026-11-03 最終候選完整 CI 收據與接手條件

白話：整合版的 83 項檢查及 12 份下載影片都通過。這張收據只屬於下面那一版；還要完成指定審查，才能合併並逐票結案。這段把最後結果留在專案裡，避免換聊天後只看到先前「待 CI」的紀錄。

[PR #240](https://github.com/sunpochin/dance-stamp/pull/240) 受測 head 為 `36c79e34b6e676e73cecfea76971270c94529846`，正常 merge parents 為 `5fb34aeb1e49e6cbede4b45bc21641a77f80c9aa`、`2e37703d2dd2c352763ce4d39f95d75f306c8dd9`。產品、測試與前置提交均保留；本段是後續文件收據，不把結果移記為文件分支重新實測。

[完整 CI 41507321339](https://github.com/sunpochin/dance-stamp/actions/runs/41507321339) 的 harness、linux-install-restart、app-coverage 與 Workers Builds 成功；badge 依 PR 條件略過。83 個不同頂層情境、0 FAIL，原 82 案順序保持；原 follow-runtime 另含第 12 個原生影格傳輸拒絕子情境。同輪 2 份 storage-version 加 10 份 follow 下載，在關站後由 file 自然播至 ended，media error／dropped 均 0，音軌及全檔解碼通過，自有 PID 與 nonce 完成清理。這些 CI helper 沒有另明確斷網，不稱為自然離線驗收。

[完整報告 artifact 13172424688](https://github.com/sunpochin/dance-stamp/actions/runs/41507321339/artifacts/13172424688) ZIP SHA-256：`18be99b0e6458bd1b5ff6208d47fa5b43c3df5e849fce92b2293642a8a7c52e7`。協調者重新計算 ZIP digest，核對 summary 的來源／83 案及全部 24 個產品 JS 雜湊均吻合精確 git 來源；80 案與 83 案的 24 份產品雜湊逐份相同，完整同分母前後如下，skipped 均 0：

| 完整情境／來源 | 行 | 函式 | 分支臂 |
| --- | --- | --- | --- |
| 80 案，`671a5b3bc94e636a724a5bf778fc92ee7e266de9` | 3298/3357（98.24%） | 1068/1127（94.76%） | 3199/3713（86.15%） |
| 83 案，`36c79e34b6e676e73cecfea76971270c94529846` | 3335/3357（99.34%） | 1084/1127（96.18%） | 3226/3713（86.88%） |

剩餘 22 行、43 函式與 487 分支臂，逐檔缺漏仍完整列在報告。原 #103 要求完整分母、前後基準、逐檔缺漏與有意義行為驗證，沒有新增所有數字 100% 的結案條件；不混入 21 模組或局部案例計數。#234 原 81 案雖完成量測及成品，整場仍因 25 分鐘取消，原失敗紀錄保留；本次成功不改寫該次結論。

指定重要產品審查仍待使用者：Claude Code 的 OAuth 已過期，本輪未取得其審查；Codex 已完成來源與證據審查，但沒有自行取代指定審查。接手先核對 #240 最新 head、checks 與未解意見，取得使用者審查或明確同意替代方式後，才依原合併授權整合，並對原票逐一判定。#209 依使用者答覆暫緩；#229 的下一個原生 Safari cohort 因 Mac 鎖定而未開始，待手動解鎖。真人、Safari／實體裝置與 G1–G7 各按原範圍保留，不由這次 CI 代簽；沒有發布。
