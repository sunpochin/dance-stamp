<!-- 檔案用途：記錄既有雙片流程與實際下載檔的桌面證據。所在層：媒體驗收。主要關聯：RECORD_COMPARE.md、MEDIA_PROBE.md、#10／#11／#12。 -->
# 既有影片比較：桌面實測

日期：2026-10-28，Asia/Taipei。基線 main `1d8ed7fe50ae556b2db1f161b50c4544cfe955bc`；首輪 20 檔矩陣綁定提交 `6f2d50b08d469ea6ed7863af741c3c7fe15401a3`、靜態建置內容 `308d306aac09e1bf`；審查後的修正與補驗見下節，最新提交及 CI 見本功能 PR。macOS 27.0.1、Chrome 156.0.0.0、Bun 1.4.4、FFmpeg 8.1.2。本次使用全新隔離 Chrome、本機 HTTP 與合成素材；未使用真人、私人課程或第三方音樂，產物留在 ignored `output/`。

## 可操作結果

「比較已有影片」不要求相機／麥克風。選老師與自己的已錄影片，各自選起點、老師結尾，以同一配方預覽、一起暫停、共同拖曳、獨立鏡像與輸出單一 VS。微調支援正負 10／50ms；新配對預設 1×。修改區間／比例建立新 take，原片及舊輸出保留；舊版 VS 顯示設定差異。

外部 File 預設只在本次頁面，不暗中寫入 Blob；明確保存兩側副本後可重開。v1 JSON 維持相容且不含媒體，另一個乾淨瀏覽器可還原、逐側預覽確認重連及取回配方。原片長於 60 秒仍可選取，每次比較／輸出片段維持既有護欄。

## 成檔獨立量測

`make-comparison-fixtures.ts` 產生 80 秒老師片，畫面逐格編二進位碼；自己的三種比例素材保留同一畫面碼，讓老師 12 秒對自己 4 秒。老師聲源 660Hz、自己 880Hz，另有無音軌老師片與左右色條。全矩陣禁止相機呼叫。

`comparison-matrix.js` 實際操作及下載，`analyze-comparison.py` 透過 FFmpeg 完整解碼下載檔，保留原始 VFR 時間而不自行補／丟幀。從兩側像素讀碼量測開頭／中間／尾端差距、首格起點及每側最長重複畫面（含檔尾），並獨立分析聲源；JS `observedMaxDriftMs`／繪製間隔只作診斷。門檻沿用 [RECORD_COMPARE.md](../RECORD_COMPARE.md)，沒有放寬。

| 固定比例 r | 輸出秒數 | 成功次數 | 最低平均 fps | 最長重複畫面 ms | 三點最大絕對差 ms | 最大新增漂移 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 15 | 1 | 30.04 | 77.33 | 33.33 | 0 |
| 1 | 30 | 1 | 30.02 | 77.93 | 66.67 | 33.33 |
| 1 | 60 | 10 | 30.01 | 100.77 | 66.67 | 66.67 |
| 0.75 | 15 | 1 | 30.11 | 100.43 | 0 | 0 |
| 0.75 | 30 | 1 | 30.02 | 101.00 | 44.44 | 0 |
| 0.75 | 60 | 1 | 33.66 | 117.20 | 44.44 | 44.44 |
| 0.5 | 15 | 1 | 30.04 | 111.80 | 66.67 | 66.67 |
| 0.5 | 30 | 1 | 30.02 | 111.07 | 66.67 | 33.33 |
| 0.5 | 60 | 1 | 30.01 | 110.17 | 66.67 | 66.67 |

另有 5 秒無音軌來源及 5 秒雙鏡像，各一次；共 20 份成檔全部完整解碼。1280×720、H.264／AAC MP4；全體最低平均 29.99fps、最長重複 117.20ms、三點最大絕對差及新增漂移各 66.67ms。所有有聲來源只含老師聲源，無音軌來源 RMS=0；自己的 880Hz 未被混入。全部成檔長度在所選片段 ±300ms 內，首格符合老師所選 12 秒起點。

同一 Chrome 連續十次重新選片、校正及 60 秒輸出成功；原片仍可另存。另以不改變行為的 click／狀態觀察器量測這十次「按輸出至顯示已成檔」：60,009.5–60,043.2ms，全部低於既有 90 秒目標。腳本現在也直接記錄並檢查完整匯出耗時；本次數值來自獨立觀察器，不能把 recorder 內部 elapsed 當完整匯出時間。

初次慢速實測曾出現約 267ms 重複舊畫面，雖然 JS 繪製間隔約 20ms。僅手動 canvas 擷取或 CPU 畫布未消除；最後用兩側真正影格通知配合共同時鐘、繪製後擷取，才通過重新執行的完整矩陣。失敗與中間實驗留在 ignored 子目錄，不混入上述 20 份結果。

## 操作與資料回歸

`bun run check`：316 tests、421 expects、0 fail；harness／公開內容掃描、checkJs、Biome 及建置通過。原生 Git hook 於提交時再驗證。

首輪提交的 13 組瀏覽器回歸全部通過：既有 media-probe、media-persistence、self-failure、workspace、edges、storage、relink、player、review-recovery，以及 existing-comparison、comparison-recovery、comparison-capture-fallback、comparison-appearance。

- 不開相機、老師 12／自己 4 秒起點、不可變舊區間、共同暫停／拖曳、空交集阻擋、壞檔保留原片及舊 VS；offset 編輯後直接點播放不會被 blur 保存吃掉。
- JSON 在全新 context 還原、重匯冪等、未知版本整份拒絕、兩側人工確認重連、明確保存副本後重開。
- 真正 IndexedDB media put 模擬 quota 與兩個真實分頁 revision 衝突，metadata／Blob 原子回滾，保留舊檔與較新資料。
- 四種獨立鏡像組合以左右色條像素確認，文字維持原位置，390px 無水平溢出。
- 缺少 `requestFrame` 時退回自動 30fps，棄用及輸出 stream 全部停止；兩側影片 callback 完成後無殘留。
- 原有合成相機 15 秒 capture→export、取消與資源釋放仍通過。

本機原始紀錄：`output/comparison/accepted-matrix.log`、`accepted-analysis.jsonl`、`environment.json`、13 份 `accepted-*.log`；下載檔 `vs-*.mp4`。重現方法見 [MEDIA_PROBE.md](../MEDIA_PROBE.md)。這些是合成驗收資料，不隨 Git 上傳。

## 審查後：設定保存失敗的恢復

PR #35 的 P1 意見指出：單次設定保存／seek 拒絕後，rejected 佇列會擋住所有 `operation`，連不需寫入的備份也不能執行。先在首輪版本以真正 metadata put 模擬 quota，證明備份下載逾時；修正後靜態內容為 `9396010483a03587`。僅將「等待佇列結束」與「回報單次錯誤」分開，繪製、同步、音訊及編碼程式未改；不繞過實際交易或 revision 檢查。

新增 `comparison-save-failure.js` 的三個乾淨 context 均通過：metadata quota、seek 拋錯、真實雙分頁 revision 衝突。失敗後不重載、不再修改設定，即可下載 JSON 和兩側原片，保留 File URL 與目前輸入。quota／seek 故障解除後可保存副本、重新匯出及換片；真正版本衝突仍拒絕寫入、不覆寫較新資料。

修正版重跑 `bun run check`：316 tests、421 expects、checkJs、Biome、公開掃描、建置通過。另重跑七組受影響回歸：existing-comparison、comparison-recovery、self-failure、review-recovery、media-probe、comparison-capture-fallback、comparison-appearance 全通過；加上新失敗測試共八組。禁用相機的比較測試與假相機錄影測試使用隔離 session，避免 init script 互相影響。

修正版另從原矩陣取三個代表案例，實際下載後使用同一獨立分析工具，結果如下；首輪 20 檔的數據仍只歸屬前述 `6f2d50b`，沒有冒充修正版重新完成全部矩陣。

| r／輸出秒數 | 完整匯出 ms | 平均 fps | 最長重複畫面 ms | 三點最大絕對差 ms | 新增漂移絕對值 ms |
| --- | --- | --- | --- | --- | --- |
| 1／15 | 15,081 | 30.04 | 78.57 | 33.33 | 33.33 |
| 0.75／30 | 30,100 | 30.02 | 100.63 | 0 | 0 |
| 0.5／60 | 60,100 | 30.03 | 112.97 | 33.33 | 33.33 |

三檔均 1280×720 MP4，首格、長度、聲源及完整解碼通過原門檻。本機證據為 `review-save-before.log`、`review-save-after.log`、七份 `review-save-*.log`、`review-save-matrix.log`、`review-save-analysis.jsonl`，下載另存 `output/comparison/review-save/`；未覆寫首輪 20 檔。

## 結論邊界

本次證明桌面 Chrome 的既有雙片路徑及資料恢復。G1 對此入口不適用；G2–G4 有上述合成成檔證據，G7 有時間證據，熱、電池與記憶體峰值未量測。十次既有片輸出不是原本 G6 真實相機 capture→export 驗收。G5 iPhone 保存、Safari、Android、真實相機完整矩陣、HEVC／HDR、5 人易用性、完整資料管理及衝突另存副本仍未驗證／實作。

重要變更仍需 Claude Code 或使用者審查；PR 合併與公開發布另記錄。本次不關閉 #1／#10／#11／#12，也不宣稱整體 P0、手機或部署完成。

## 2026-10-30：新版選片入口的鍵盤回歸

本輪從 main `5078401dd1dea60050a9961e34cb499a274e3183` 建獨立 clone／分支。產品靜態版本 `6f0a13e613ca634d`；macOS 27.0.1、Chrome 156.0.8078.76（headless）、Bun 1.4.4、Playwright CLI 0.1.22。只用原合成素材，禁止實體相機／麥克風。產品程式與建置資源未改；首次瀏覽器測試工作樹乾淨，修正後工作樹僅變更 `comparison-keyboard.js`，本段文件於測試後追加，不冒稱提交後重跑。

乾淨基線的 `comparison-keyboard.js` 在入口斷言失敗：測試仍期待焦點落在 `reference-file`，但 #95 後的原生檔案欄位已隱藏，產品正確地聚焦可見 `select-video` 按鈕。只更新此目標及原因註解，保留其餘原斷言；沒有修改產品焦點或再做一套選片介面。

- 修正後原鍵盤回歸通過：Enter 啟用正式入口、共同播放／暫停、原生 ArrowUp＋Tab 將 offset 以 4010ms 保存、微調按鈕回到 4000ms、390px 無水平溢出與停止鍵可見。截圖已檢視。
- 原 `existing-no-camera.js` 通過：完全移除相機 API，正式入口選雙片、預設 1×、老師 12 秒／自己 4 秒起點、共同預覽／暫停與五秒 VS 實際下載；沒有外部請求或假的 captureTiming。產品讀回 4999ms，下載 142,047 bytes，SHA256 前 16 碼 `cedb002884036003e`。
- 使用未修改的 `analyze-comparison.py` 完整解碼該下載：150 格、4.9988 秒、30.01fps；起中末最大絕對差 66.667ms，三點新增漂移 33.333ms，首末差變化 −33.333ms，最長重複畫面 66ms；來源 660Hz 保留、自己 880Hz 未混入，原斷言全過。這是單一五秒功能案例，不是 60 秒漂移、十輪穩定性或完整 G1–G7。
- 基線原 `bun run check` 通過 632 tests／3050 expects／0 fail，公開掃描、型別、lint、build 通過，保留原 19 項 lint info。最初 Bun 1.4.2 被原入口拒絕；改用已安裝 1.4.4 後，首次受限環境仍因 HTTP 測試無法綁埠失敗；允許本機臨時網站後原樣通過，未放寬檢查。

文件初稿的盤點相對連結不在下載包內，被原封裝測試拒絕；改引用固定提交的線上來源，沒有擴充包內容或更改檢查。

raw、失敗及下載留在 ignored `output/issue10/` 與 `output/comparison/`；兩輪各自沿共用媒體鎖，結束後核對已知自有瀏覽器 PID 全數退出、主機停止且同 nonce 鎖釋放。獨立分析另取得及釋放同一鎖，不接管其他測試。

#10 的正負 offset、0.5／0.75／1、空交集／尾端、原片／舊輸出保留與配方重開沿用各自版本的既有證據及未變的時間映射；本輪不重標為完整重驗。錄影入口仍依 [#9 接線證據](issue-9-comparison-integration.md)，最新工程／未驗收界線參照[既有盤點（需連網）](https://github.com/sunpochin/dance-stamp/blob/5078401dd1dea60050a9961e34cb499a274e3183/docs/evidence/issue-completion-audit.md)。兩條入口的實體相機／光學同步、原生 Safari 完整品質及人工／裝置驗收仍未完成；iPhone 繼續暫緩。本輪只修測試並補本案例證據，#10 保持開啟，不合併或發布。
