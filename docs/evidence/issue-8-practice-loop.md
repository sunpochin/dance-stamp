<!-- 檔案用途：記錄 #8 練習循環實測與未完成 gate。所在層：版本驗收證據。主要關聯：practice.js、practice-background.js、TECHNICAL.md。 -->
# #8 練習循環驗證

2026-10-28，Asia/Taipei。macOS 27.0.1、Bun 1.4.4；受測靜態內容 `26106b3cf184d603`，提交以 PR head 為準。僅使用既有 65 秒 640×360／30fps H.264 合成片與假相機，沒有真人、私人課程或第三方音樂。

## 修正前後

原版 `e2e4210` 在開始定位的 seeked 晚到時，按停止後再收到事件，仍會播放且按鈕變回「停止 A–B 循環」。相同合成事件延遲步驟在本版停在 1 秒、paused=true、按鈕為「開始 A–B 循環」。這是取消競態回歸，不把事件注入當作裝置背景證據。

## 已驗證

- 完整品質入口 316 tests／0 fail、TypeScript checkJs／Service Worker、Biome、公開掃描與靜態 build 通過，沒有略過 hook 或降低原有門檻。
- 六個速度 0.5／0.75／1／1.25／1.5／2 均實際播放、時間前進，preservesPitch=true；未量測聽感或頻率品質。
- `practice.js` 在片中 1–1.25 秒與片尾 64.75–65 秒，各以 0.5／1／2 倍跑 20 次，共 120 次回捲。量 seek 前媒體時間及獨立原生影格 observer 的 mediaTime，沒有拿 setter 返回值冒充顯示影格。

| 位置 | 速度 | 回捲數 | 最大媒體越界 | 最大顯示影格越界 |
| --- | --- | --- | --- | --- |
| 片中 | 0.5 | 20 | 33.675ms | 50ms |
| 片中 | 1 | 20 | 32.444ms | 50ms |
| 片中 | 2 | 20 | 33.955ms | 83.333ms |
| 片尾 | 0.5 | 20 | 0ms | 0ms |
| 片尾 | 1 | 20 | 0ms | 0ms |
| 片尾 | 2 | 20 | 0ms | 0ms |

片尾數據表示沒有越過檔案終點，不表示無縫音訊或最後一幀停留精準。這些數據符合本票 150ms 目標，只適用受測素材與瀏覽器，不是 G2 聲畫同步證據。

- 六組停止後 pending callback=0、影片暫停且速度維持；整段流程同時最多一個產品 callback，重疊 seek=0。
- 啟動中取消、play Promise 拒絕、手動 seek 停止循環、合成 visibility 停止並明確重啟從 A、倒數錄影控制鎖定、取消後恢復 2× 練習速度、切片與真正 pagehide 的清理通過。pagehide 後 pending=0、paused=true。
- 暫停畫面上的鏡像像素與原圖左右對照差=0；未翻轉對照差=160095，控制與原生 video 的 CSS transform 均為 none。

- 缺少 requestVideoFrameCallback／preservesPitch 的隔離頁，以 RAF 在 2× 跑 20 次；最大媒體越界 29.164ms，最多一個 callback，停止後 pending=0，顯示可能變調的提示。未以此宣稱 RAF 的實際顯示影格精度。初次儀表把 Playwright 自己的 RAF 輪詢算進來；已用呼叫堆疊確認並改成固定時間輪詢，沒有放寬產品單 callback 門檻。
- `media-probe.js`、`review-recovery.js`（12 項）、`markers.js` 回歸通過：15 秒合成相機錄製→帶音訊 MP4 VS、取消保留、相機釋放、既有音訊／自拍配方恢復、筆記 CRUD／重開／衝突保留與 seek 顯示最大 25ms。下載 VS 獨立完整解碼：15.001800 秒、1280×720 H.264／AAC，音訊 mean -15.7dB。這不是完整真機 G1–G7 或外部播放器人工驗收。

## 未完成：真正背景 gate

此自動化環境在切換分頁與最小化隔離瀏覽器視窗後，原頁仍回報 document.hidden=false／visibilityState=visible；使用 headed 與關閉焦點模擬也未取得 hidden。原始嚴格背景檢查與獨立 `practice-background.js` 均等待 30 秒後逾時，沒有算成通過。

`practice-background.js` 保留真正 hidden、停止及回前景不自行播放的嚴格驗收，與 `practice.js` 的合成 handler 驗證分開。需在會實際回報背景的桌面瀏覽器重跑或人工驗收，核對停止、callback 及明確重啟從 A；完成前 #8 維持未完成，不因其他綠燈關票。

Safari、iPhone、真實相機、音高聽感、完整 G1–G7 與人工 review 未驗證。使用者仍指定先做桌面 Web；沒有因缺 iPhone 判定 Web 失敗，也沒有合併、部署或新增外部服務。
