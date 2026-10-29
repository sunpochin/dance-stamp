<!-- 檔案用途：記錄大型匯入在 hash／ID 規劃中取消的精確覆蓋及重跑入口。所在層：#12／#18 桌面資料證據。主要關聯：library.js、backupPlanningStop.test.ts、backup-planning-stop.ts。 -->
# 大型外來源匯入在規劃中停止

2026-10-30 Asia/Taipei，從最新遠端 main `6862501d3cfaaa7cf3916d875fd06dd8dfdd13ec` 建立專用 clone／`test/large-import-planning-stop`。本次只新增測試、合成 fixture 與文件，產品 `web/` 沒有改動，靜態版本維持 `4651fae419d8d9c8`。最終提交由所屬 PR 固定；原生執行收據包含 base head、工作樹差異、runner／fixture／產品指紋，不能稱為原 main 的乾淨提交驗收。

## 既有覆蓋與資料流

- `tests/browser/notes-scale.js` 量大庫開啟／搜尋；`metadata-stop.js` 主要在原生 metadata 交易已開始、未提交時 Stop；`backup-conflicts.js` 包含預覽取消及交易內注入取消。它們沒有證明大檔在規劃 hash await 期間由產品 Stop 取消。
- `main.js` 的 restore change 先讀檔、`parseBackup`，再將 `operation` 的 signal 傳給 `planBackupImport`；規劃完成且 signal 未取消才配置 `importDraft`／打開預覽。真正確認後才 `writeLibrary`。
- `library.js` 先驗證兩份資料，外來源／share 使用 typed 表 ID 的穩定 hash；同來源衝突計算關聯閉包，先動作再其他表配置副本，處理 reference 身分及 take／recipe 可開啟關聯。`backupUUID` 在原生 SHA-256 await 前後檢查 signal；規劃末端也檢查，沒有在規劃函式建立儲存交易。
- `stop()` 取消當前 controller 並關閉匯入草稿；原生 digest 本身沒有取消 API，已開始的 hash 可以完成，其結果回來後仍須拒絕，不得建立預覽或寫入。本次沒有重現新的產品缺陷，因此沒有重寫匯入、提高容量或增加 Worker。

## 純邏輯：三個進行中關卡

`tests/fixtures/backup-planning.js` 預設有 32 videos、96 assets、1,536 markers、各 32 takes／recipes／exports／moves；每個 marker 有非空長筆記及完整影片／動作關聯。每份原始 JSON 大於 3 MiB、低於 10 MiB，逐表也未超限；輸入及最終合併均經原 validator，不刪關聯迴避容量。

`tests/unit/backupPlanningStop.test.ts` 三案：

| 路徑 | 明確的進行中 barrier | 取消後與重試 |
| --- | --- | --- |
| foreign backup | 第一個 `dance-stamp-import-v1` hash 已用於 ID，第二個原生 hash 已完成但結果被測試暫扣 | 拒絕 AbortError；沒有回傳 plan；local／source 逐表與完整原物件不變 |
| share | 同上，使用 `dance-stamp-share-v1`，保留分享本身的 ID 規則 | 同上；測試 fixture 是合法 share 輸入，不是本次重新驗收分享匯出白名單 |
| 大量同來源衝突 | `origin → copy → origin → copy`，第一份影片副本 ID 已配置，第四個 hash 結果被暫扣 | 同上；保留影片→筆記／reference→take→recipe→VS 的完整閉包 |

三案都先確認 signal 尚未取消、Promise 未 settled、原生 hash 真正完成，才呼叫 abort 並解除測試關卡。取消後 hash 次數不再增加；以同一原始 JSON 重新 parse／規劃成功，全部舊列的前綴逐表相同，validator 核對全部外鍵，每個新增 take 有可開啟 recipe 與輸出，再匯 added=0 且完整結果不變。這是純資料測試，不宣稱原生交易或 UI 點按。

## 單一有界 Chrome UI 案

使用已安裝 Chrome `156.0.8078.76`、Bun `1.4.4`、本次全新 localhost origin／profile；先原子取得共用媒體鎖。runner 在拿鎖前檢查程序表可讀，只釋放自己 nonce 的鎖，不掃殺其他程序或清除任何既有資料。

本節最終成功收據的 runner SHA-256 為 `f58fd4f5bbac0cbdc1bb9b9e4a196fcff6c0baf9ce1e5c8596840f875facf077`，fixture SHA-256 為 `f7e30d2f9ee43df0fd95bcaea3e19f4bd7a5768917dadd7809ce78bb25f349e6`，均等於提交檔案；更早成功收據保留自身版本，不移記。產品來源仍為上述 base main／靜態版本，最終 runner 也核對建置 manifest 與產品來源 bytes。

- 以儲存 API seed 一份完整舊圖及三個 16-byte 合成 Blob、一段合成 chunk；重開後建立 baseline。Blob 明確為不可播放的 `application/octet-stream`，本案只證明保留 bytes，不當成原片／VS 解碼或媒體品質證據。
- 產品選檔入口使用 **3,727,381 bytes** 的合法 foreign JSON，含上述 1,792 列。先用產品規劃函式另算完整預期結果，實際 Stop 案明示暫扣第二個原生 hash 的結果；此刻兩次 SHA-256 都真正完成、第一次 ID 已配置，UI busy=true、signal.aborted=false、預覽未開，原生交易清單為空。
- Playwright 真正點 `#stop`，收到 `isTrusted=true` 的 click；同一規劃 signal 立即 aborted。解除測試關卡後，產品的 `throwIfAborted` 拒絕，沒有第三個 hash，busy=false、預覽仍未開、檔案欄位已清、診斷為 cancelled。從選檔到停止收尾的 **readwrite 交易數為 0**。
- 原生 metadata（含 revision）、產品 `readLibrary`、media／chunks 所有 keys、MIME 與全部 bytes 均等於 baseline，storageUnconfirmed=false。沒有半份 plan 變成可確認預覽，也沒有媒體或 metadata 寫入。
- **同一個未修改的檔案** 重新選取可預覽，確認前資料仍相同；真正點確認後只有一個 readwrite 交易，收到 trusted complete、沒有 abort。原生完整 metadata 等於先前算出的計畫、revision 僅 +1，舊 Blob／chunks 完全相同。
- 同檔重匯顯示「完成，沒有新資料」，確認不新增寫入交易；完整 snapshot 相同，reload 後仍相同。沒有相機／麥克風呼叫、對外請求或 pageerror。收尾核對自有 profile 程序為零、server port 已關閉，再釋放鎖。

這個人工延長 hash await 的關卡是明示測試注入；不代表自然瀏覽器卡頓、Safari 故障、計算本身被中斷，亦不提供毫秒效能 pass/fail 門檻。真正 Stop 的 UI 證據只有 foreign 路徑，share／大量衝突的本次取消證據屬上述純邏輯測試。

## 重跑與品質檢查

先使用專案固定 Bun 1.4.4 及既有安裝的 Chrome／playwright-core，不購買或下載瀏覽器服務：

```sh
bun --no-env-file test --isolate ./tests/unit/backupPlanningStop.test.ts
bun run check
bun --no-env-file tests/browser/backup-planning-stop.ts "$CHROME_EXECUTABLE" "$PLAYWRIGHT_CORE_MODULE"
```

`CHROME_EXECUTABLE` 是已安裝 Chrome 執行檔完整路徑，`PLAYWRIGHT_CORE_MODULE` 是已安裝 `playwright-core/index.mjs` 的完整路徑。原 check 包含 build；單跑 UI 前需先 `bun run build`。runner 自建 localhost port、新 profile、共用鎖與失敗收據；鎖忙直接保留前置失敗，不接管、繞鎖或刪別人的資料。所有 JSON／profile／原始收據與檔案雜湊留 ignored `output/backup-planning-stop-*`，不公開 UUID／origin／profile 識別。

本輪原 check 通過 **438 tests／2,310 expects／0 fail**，並通過原 typecheck、lint、build、harness／公開內容掃描；lint 原有 19 個 info 不改寫成警告或本次缺陷。新增三案自身為 **3 tests／268 expects**。首次受限環境的完整 check 在既有 `serveWeb` 本機 listen 前置失敗（437 pass／1 fail），首次 UI 也未能綁定本機 server，瀏覽器根本尚未啟動；失敗原收據保留。確認該 runner PID 已退出、profile 未建立、server 未綁定後，只釋放本聊天 nonce 的鎖，再以允許本機 listen／程序檢查的權限跑原入口，未弱化測試。

最終 runner 的首次補驗因另一工作線持有共用鎖而 EEXIST，保留為前置失敗，沒有啟動 server／瀏覽器或改動別人的鎖。自然釋放後才重新原子取鎖，完成上述最終版本成功案例及自有資源收尾。

本線只補 #12／#18 的進行中規劃取消。沒有另跑既有近 10 MiB 原生容量矩陣、外檔白名單、媒體品質矩陣、普通跨 context 往返或低空間／quota；原完整 unit 入口照常執行既有測試。沒有私人媒體、真實相機／麥克風、登入雲端、跨實體裝置、Safari、iPhone、部署、發布或關票。Claude Code／使用者獨立審查與原有真人／裝置／傳檔驗收仍待完成。
