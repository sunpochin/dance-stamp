<!-- 檔案用途：記錄選定筆記分享的版本證據與未驗證傳送途徑。所在層：匿名驗收。主要關聯：DATA_FORMAT.md、ACCEPTANCE.md、tests/browser/share.js。 -->
# #18 選定筆記檔分享

2026-10-28，僅合成資料。基線 main `0a8bbd62035cc90f4498cb82bde1f58de83c447b`；受測 runtime 與本文件同一提交，建置內容版本 `d9f300ade49f1c2a`。PR 的 head／CI 另外綁定提交，不把合併、發布或人工審查視為已通過。

macOS 27.0.1（26A434）、Chrome 156.0.8078.49 無視窗、Playwright CLI 0.1.22、Bun 1.4.4。本聊天專用 clone、localhost 48118、全新隔離 profiles／contexts；未操作桌面視窗，未使用或清除一般瀏覽器資料。主機只服務產品白名單檔案，拒絕寫入並停用相機／麥克風。八秒色條 H.264／AAC 原片與兩秒 VS，無真人／第三方音樂；不是長片效能或媒體品質量測，沒有取得或變更他人媒體測試鎖。

## 已執行

- `share.test.ts`：預設逐欄排除正文、老師、舞風、拍攝日期、原檔名、未選 Marker／take／VS、未來私密 metadata／captureTiming。明確允許才帶出；VS 最小依賴閉包完整。空庫、同來源、不同來源皆重建 ID，來源不變；重匯、子集擴展、內容衝突副本、完整備份恢復後再匯皆冪等。低階 merge 拒絕未規劃 share，錯誤選取、版本、關聯、超限與 abort 不改原資料。
- `share.js`：由正常選片、標記及合成入口建立寄件資料，額外注入合成私人／未來欄位驗證防漏。分享 modal 預設零選取，預覽未寫資料；下載檔 bytes 等於預覽。改選項必須重預覽，關閉後重開清除私密選項。人工檢視 390×844 截圖，原生 modal／取消焦點及長內容無水平溢出；真人讀屏仍未驗證。
- 選單明確允許正文等欄位與一份 VS 描述，只有該 take／recipe／兩側原片閉包。接收者用真正下載的 `.dance-stamp.json` 選檔匯入；即使其原資料具有相同 library／ID 也保留原文、重建所有所需關聯。不把同機 contexts 寫成另一台裝置。
- 匯入預覽取消、metadata put 模擬 quota、交易內取消、壞 JSON、>10 MiB、未來 schema 與孤兒關聯全數不部分寫入。相同分享重匯不增加記錄，改正文／標題時另存衝突副本，再匯該版本仍冪等。
- 無影片時保留筆記、清單顯示 missing。逐側實播 reference／take／VS，再勾人工確認，預設只連本次 session、不暗中落盤。相同檔名的不同內容不自動配對；同名裁切片與兩秒 VS 未涵蓋 B＝3 秒時拒絕，壞檔與取消保留資料。這不是任意影片內容分類器，足夠長度的 VS 仍須使用者辨識並拒絕。
- 確認後從筆記跳到 1 秒標記；老師 1–3 秒／自己起點 0.5 秒的配方重開，共同時間 1 秒定位老師 2 秒、自己 1.5 秒，誤差各 <50ms（播放定位檢查，不是影格同步驗收）。VS 重連未代替原片。實際下載接收者完整 backup，第三個空 context 由該檔還原，再匯相同 share 沒有新增或遺失允許欄位。
- 真正另一分頁更新後，舊預覽的匯入被 revision 拒絕、較新資料保留。HTML 形式的合成正文只顯示文字。三個受測 contexts 無外部網路請求、無非 GET／HEAD、無 pageerror。
- 系統分享測試只用 stub：canShare=false 時下載完整可用；true 時只有明確 click 呼叫 share，payload 等於當次預覽、user activation 保持；成功回傳、AbortError 與 NotAllowedError 都不聲稱送達，取消／失敗仍能下載。另注入下載 click 失敗，來源快照不變。沒有打開真實 OS 分享或傳給任何人。
- 原有 `backup-recipe-copies.js` 通過：衝突 take 可各自重開、已編輯副本不被覆寫、不同校正分開、重匯冪等，還原配方可實際輸出。用本次八秒合成原片放在既有 fixture 路徑，沒有重跑未變的長片矩陣。
- 原有 `storage.js` 僅在本機暫存副本調整 localhost 埠，原斷言不變：0→1 migration 故障回滾／重試、未知版本拒絕／sentinel 保留、真實第二分頁不接管錄影、同 take 並行鎖拒絕與釋放後重用通過。產品儲存 schema／migration 程式未改。

## 重現

準備 `scripts/make-export-fixtures.ts` 的合成八秒片。另在 ignored `output/share18/cut/reference.mp4` 以 FFmpeg `-n -t 2 -c copy` 產生兩秒裁切片；`output/share18/different/reference.mp4` 使用該工具的另一支直式自己片。原片複本放 `output/media-probe/reference.mp4` 供既有短回歸使用，勿覆寫已有素材。

建置後以專用 localhost 主機開啟新無視窗／隔離 browser session，下載允許、禁用真實相機與麥克風。執行 `playwright-cli --session <本輪專用名稱> run-code --filename tests/browser/share.js`，檢查 `### Result` 所有布林值 true、outsideRequests／pageErrors 空且無 `### Error`。再於另一空 profile 跑 `backup-recipe-copies.js` 及既有儲存回歸（只依主機調整測試 port）。測片、完整路徑、下載 JSON／影片、profile、截圖與原始 logs 均只留 ignored／本機工作目錄，不公開附件。

## 品質入口

Bun 1.4.4 `bun run check` 通過：347 tests／681 expects／0 fail、TypeScript checkJs、Biome、公開掃描 168 檔與 build；原始 hooks 維持啟用，執行結果另記 PR。完整 diff／索引檢查通過。代表 VS 48,564 bytes、2.000333 秒、H.264 1280×720／AAC 48kHz，FFmpeg 全片解碼無錯誤；SHA-256 `77f903a0fe2a99a824dd0ab0ce8403fcac052ebdc861e1c251cfa853b19af1c9`。此為分享資料所需的短片驗證，沒有改媒體 runtime 或宣稱 G1–G7。

## 外部傳送與剩餘驗收

| 途徑 | 本次結果 |
| --- | --- |
| 一般本機下載／選檔 | 同機隔離寄件、接收及備份還原通過；真實另一裝置未驗證 |
| Google Drive | 未驗證，未登入／存入／變更權限／寄件或接收 |
| Dropbox | 未驗證，未登入／存入／變更權限／寄件或接收 |
| iCloud Drive | 未驗證，未操作雲端帳號／同步／寄件或接收 |
| AirDrop | 未驗證，未寄件／接收 |
| 真實系統分享 | 未驗證；本次只有 stub 與無能力時的下載替代 |

匿名人工步驟：兩台已獲使用者允許的裝置以同一版本開 App，甲只用合成片，先預設分享一個標記，再明確加入正文／一份練習作第二輪。自行用上述每種途徑傳 JSON；乙有相同原片可只傳筆記，否則分開傳 reference／自己的原片／VS。由乙下載到本機後選檔、預覽、確認匯入、逐側實播核對原片與標記時間，再確認重連與跳片段。各途徑另記裝置、版本、可找到的檔案與結果；不要公開帳號、檔名、分享連結或憑證。若容量、權限或連結失效，改用本機檔案；不要求付費。

分享前須確認影片畫面／聲音／內嵌資訊不受 JSON 篩選保護，已下載副本不能撤回。雲端停用分享不能當作對方副本已刪。另一裝置、Safari、iPhone／Android、真人易用性／讀屏、所有真實外部傳送途徑、Claude Code 或使用者最終審查、#15 與發布仍未驗證／未完成。#18 保持開啟；未合併、發布、建立帳號或必要外部服務。
