<!-- 檔案用途：#19 手動拍點的版本綁定合成證據與限制。所在層：驗收紀錄。主要關聯：RECORD_COMPARE.md、DATA_FORMAT.md、MEDIA_PROBE.md。 -->
# #19 手動拍點與倒數：桌面合成驗證

2026-10-28；以 main `0a8bbd62035cc90f4498cb82bde1f58de83c447b` 建立本票分支。使用者當次授權先做 P1 手動能力並交一般 PR；#15 仍開啟，PR #40 是未合併發行候選，沒有把它或其他 P1 分支併入。P0、發布及真人門檻不因此通過。

## 受測版本與環境

受測靜態 build `8c73cb1fbac965b6`。以下 SHA256 綁定實際受測產品 bytes；最終 commit 及 CI 連結另記在 PR／#19，不用文件自行引用自身提交。

| 來源 | SHA256 |
| --- | --- |
| web/beats.js | `d25c6893043db7456cb32c4b64c1dbee982b33c3bb94a41966bfabe0bd0bcf9c` |
| web/main.js | `c241f63800564e20d1a85aaac3b4af433995f96fdeb57f596c9fc28155e7db4a` |
| web/library.js | `d0ff2190382f73df7af373639e0214bbd6ff610674a334e7f2fac13a2110ae72` |
| web/index.html | `ae39bc3e17b9c3452e5747373f4f096a14bae6916e3e931a01e69b8d24d44936` |
| web/types.d.ts | `fc516f93e6e68ce5fef27d31edd63c0e2b9b58fff55dd8dc011e1b62527a3ae6` |

macOS 27.0.1（26A434）、Chrome 156.0.8078.49 headless、Bun 1.4.4、FFmpeg 8.1.2。專用 clone、獨立 Chrome context/profile 與隨機 localhost port；靜音，不取用實體相機、麥克風或私人影片。新測片只長 20 秒，三輪錄影各 15 秒，未做長片／效能／有視窗操作，沒有占用 P0 的原生桌面測試。

## 資料、時間與音訊

- `bun run check`：345 tests、786 expects、0 fail，TypeScript、Biome、建置、文件與公開內容檢查通過；新測試涵蓋三速度來源映射、八拍／第一拍邊界、分數 BPM、極端值、舊 v1、take 快照、白名單、重匯及衝突副本關聯。
- `tests/browser/beats.js`：設定、目前畫面定位第一拍、保存／取消、輸入空值／0／301／巨大 BPM、負小數 offset／片尾／巨大 offset 全部保護舊資料。三速度真正播放、暫停、seek、A–B 回捲及標記八拍通過。
- 真正 IndexedDB metadata put 注入 quota 後，revision 與舊拍點不變、草稿保留且同頁重試成功。metadata put 後中止交易原子回滾；同 origin 另一頁先更新時拒絕舊 revision，不吃掉草稿。JSON 匯入取消不寫入，同備份重匯不新增；全新 context 還原後缺片如實顯示，再人工點確認重連合成原片，拍點仍一致。
- 自製原片 120 BPM、第一拍 350ms；獨立解碼音軌共 40 個 burst，首個 `0.350020833s`、末個 `19.850020833s`，與每拍 0.5 秒／offset 相符。第一拍前不猜負拍；3.85 秒是第 1 組第 8 拍，4.35 秒是第 2 組第 1 拍。
- OfflineAudioContext 直接渲染產品 `scheduleCountIn`，4／8 拍乘三速度共六組：samples 的起點在排程後約 0.104ms，間隔分別為 1000／666.667／500ms。以零交越獨立估計首拍約 881Hz、其餘約 667Hz，符合 880／660Hz 的短窗誤差；不是只檢查排程參數，也沒有實體喇叭實聽。
- 實際點下載老師原片，修改拍點／備份還原前後與合成原檔 bytes 完全一致：477035 bytes，完整 SHA256 均 `db9f26bc22fe7a8c0f1a97f81f8025a7d29056df3293c713f61e31d78c6c0ea6`。拍點只在 metadata，不改原片。

## 三速度錄影與取消

`tests/browser/beats-capture.js` 完全以頁內 canvas 建立 MediaStream，getUserMedia 不轉呼叫原生 API；每個請求 audio=false。錄影速度刻意與練習速度 2× 分開，以 4 拍／120 BPM 量測第一聲到原生 recorder.start 呼叫：

| 錄影速度 | 預期倒數 | 實測倒數 | 讀回自拍長度 | bytes |
| --- | --- | --- | --- | --- |
| 0.5× | 4000ms | 4008.667ms | 15026.700ms | 263888 |
| 0.75× | 2666.667ms | 2686.000ms | 15060.233ms | 261995 |
| 1× | 2000ms | 2014.000ms | 15043.567ms | 261806 |

每輪 ready take 保存拍點快照、原片可讀回，全部聲音節點 stop/disconnect、相機 tracks ended，結束後還原練習速度 2×。倒數與錄影中 BPM、第一拍、倒數、A／B、速度都鎖定。三速度分別取消倒數時不啟動 recorder，不留未來提示音，已存原片不刪。

倒數後模擬 freeze 中斷，take 保持 interrupted、tracks 釋放；移除拍點後實際進入原秒倒數且沒有新增提示音。既有 `tests/browser/storage.js` 僅替換測試 origin 後執行：migration 失敗重試、未知升版回滾且 sentinel 保留、另一頁不改 recording 狀態、恢復鎖拒絕並可釋放後重用均通過。沒有資料庫升版或重置。

## 畫面與實際範圍

1280px 桌面與 390px 窄版均已檢視，控制與文字可讀、無水平溢出。曾有一個驗收輔助腳本嘗試 fetch Blob URL，被既有 connect-src 規則拒絕；改由同一合成資料的儲存 API 讀回後解碼通過，未放寬 CSP。測片、備份、截圖及 logs 均只留本機，未公開上傳媒體。

此為工程自我驗證，不是 Claude Code／使用者的獨立最終審查，也不是完整 G1–G7 或發布驗收。真人 BPM 校正／易用性、實體相機、喇叭／藍牙實聽、Safari、跨實體裝置與 iPhone 未驗證；iPhone 暫緩。未合併、未部署、未新增付費服務、自動辨識或商用音樂。#19 保持開啟，等待審查與真人驗收。
