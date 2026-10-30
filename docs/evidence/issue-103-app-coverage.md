<!-- 檔案用途：記錄九個 App 程式的統一覆蓋率、重跑入口與驗收限制。所在層：版本固定的工程證據。主要關聯：tests/app-coverage/、TECHNICAL.md 第 8 節、issue #103。 -->
# #103：全 App 覆蓋率與恢復流程

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
