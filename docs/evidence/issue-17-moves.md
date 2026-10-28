<!-- 檔案用途：記錄 #17 桌面候選的合成驗證與剩餘門檻。所在層：版本證據。主要關聯：DATA_FORMAT.md、moves.js、moves-storage.js。 -->
# #17 分類、動作庫與練習歷史

2026-10-28 Asia/Taipei；基線 main `0a8bbd62035cc90f4498cb82bde1f58de83c447b`，分支 `feature/issue-17-move-library`；提交由本交付 PR head 綁定。macOS 27.0.1（26A434）、Chrome 156.0.8078.49 headless、Bun 1.4.4。專用 localhost port 48117、獨立 profile／全新 contexts；沒有操作桌面 Safari、其他聊天或實體相機／麥克風。

## 實作範圍與前置

同動作跨課程標記、分類搜尋、手動想練／練習中／會了、涵蓋片段的 take 歷史、既有比較配方／指定片段入口、完整 v2 備份及 v1 相容。沿用 main 已合併的儲存／重連／播放器，不引入未合併候選。

開工及提交前 main 均為 `0a8bbd6`，其 Harness CI success；開工時 #17 無既有交付或留言。#15 的一般 PR #40 head `ef55576cb0e3f5abf8e025aa662d39ed857fcaf8`、#12 補充驗證 PR #48 head `f9667db718f89d02c80c2962d2a19d7459dd5970` 仍未合併；#48 當時無 review 提交或未結討論。這些候選不作本票依賴，也未搬入本分支。當次使用者明確授權獨立 P1 工程，不代表 #15、完整 P0、真機或發布門檻通過。

## 可重跑檢查

- `bun run check`：完整 harness、公開掃描、unit、TypeScript、Biome 與 build；347 tests／655 expects／0 fail；最終靜態版本 `78931c1f15c9d795`，四組瀏覽器回歸也使用此版本。原始 pre-commit／pre-push hooks 保持啟用，未弱化或跳過。
- `tests/unit/moves.test.ts`：v1 記憶體升版不改原件；v2 白名單／非法日期、狀態、孤兒、重複 ID；NFKC、多關鍵字及分類 AND；歷史半開邊界、去重排序；刪動作保留共用資料；Move 衝突、外來來源與重匯冪等。既有備份測試一併通過。
- `tests/browser/moves.js`：兩堂合成課，各一 marker 與 take，同一 Move；舞風／老師／日期／關鍵字／狀態搜尋、跨影片 seek 到 2 秒、歷史重開正確配方；錄影紀錄不自動改狀態。以 Enter 提交動作；筆記 HTML 只顯示文字。新 context 還原，缺片可讀筆記，老師／自己逐側人工確認重連。解除關聯與刪動作（含取消及取消焦點）保留全部 marker、take、recipe 和四份原片 Blob。390 CSS px 無水平溢出；0 pageerror、0 外部來源請求。
- `tests/browser/moves-storage.js`：真實 IndexedDB v1 讀取不寫入；metadata 已排隊後模擬 quota，version／revision／筆記全數回滾、草稿保留；重試一次原子升 v2。另一分頁舊 revision 拒絕且保留草稿。AbortSignal、未知 schema 99 拒絕；原 Blob 與 chunks 完整文字 sentinel 不變。這是合成交易失敗，不代表真正磁碟耗盡或瀏覽器程序崩潰。
- 既有 `workspace.js`：時間取樣、純文字、缺片重連、本機副本重開、跨分頁 revision、quota 回滾、離線重開通過。既有 `storage.js`：IndexedDB store upgrade 失敗回滾、未知結構拒絕、另一頁不改錄影狀態、take lock 排他與釋放後復用通過。各在新 context，僅將硬編碼 4173 改成本票 48117，不改斷言。

## 備份、離線及完整重啟

使用本票專用 FFmpeg testsrc2／440 Hz sine 合成 12 秒、320×240、15 fps H.264／AAC MP4；同 bytes 分別作老師與自己，沒有真人、第三方曲目或私人檔名。素材 SHA256 `abc3d8da239205d6f491c799167cf00ef2528d1ec39487fcf6189a314d0c8a2c`。不測同步／輸出品質，沒有為本票重跑長片媒體矩陣。

完整 UI 建立 2 Video、2 Marker、1 Move、2 Take、2 Recipe、4 原片副本。v2 JSON 還原到全新 context，canonical 欄位除 exportedAt 外完全相同；媒體 keys 為 0，證明 JSON 不含影片。明確重連後 seek 與比較可用。已備妥 SW 資源後斷網 reload，兩片段、兩歷史及手動狀態一致。

另以專用 persistent profile 匯入同一備份，完全關閉該瀏覽器再以同一 profile 啟動、斷網 reload；schema 2、1 動作／practicing、2 markers、2 takes 保留，關鍵字＋狀態仍找到 2 片段／2 歷史。這是同機隔離 profile，不是跨裝置或手機飛航模式。合成影片、JSON、截圖與原始 logs 只留本機 ignored output，沒有上傳。

## 相容與回復

v1→v2 不改 ID、原 take／recipe 或搬動媒體，IndexedDB store version 仍為 1；讀取不持久化，第一次成功編輯才提交。舊程式拒絕 v2，不能直接降版；需保留升版前以舊版下載的 v1 備份及另存原片，在另一環境還原，現有 v2 保留。不輸出會丟動作的 v1 備份，不清庫修復。詳細契約見 [資料格式第 10 節](../DATA_FORMAT.md#10-17-v2-分類與動作庫)。

## 未驗證／未授權

Claude Code 或使用者對本 head 的最終獨立審查、真人可用性、讀屏實聽、真實跨裝置、Safari／手機、實體媒體／相機、完整 G1–G7、磁碟真耗盡／程序崩潰、大資料效能及公開發布均未完成；iPhone 仍暫緩。沒有合併、部署、公開 Release、付費服務、帳號／雲端操作、#18 分享 UI 或 #19 拍點。#17 保持開啟，不能用本票合成驗證替代 #15 或整體 P0 驗收。
