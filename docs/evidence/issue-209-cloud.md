<!-- 檔案用途：保存 #209 Google 工程候選的合成驗證與未驗證界線。所在層：公開匿名證據。主要關聯：CLOUD_SYNC_SHARING.md、scripts/verify-cloud.ts。 -->
# #209 Google 雲端工程候選

日期：2026-11-02（Asia/Taipei）。追蹤 [#209](https://github.com/sunpochin/dance-stamp/issues/209)，實作 [PR #213](https://github.com/sunpochin/dance-stamp/pull/213)。未合併、未部署，不關閉完整驗收。

## 版本與環境

- 起點 main `7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca`；納入 #210 兩個文件提交作依賴，原 PR 未合併。
- A：`09a6ec79a53050860ffb056f583aafdff2de8967`，B：`c58e5c142858c6891a8210bffd599bf2de9916fb`。
- C 的精確程式來源為本文件所在的功能提交；測試另產生每個產品模組的 SHA-256 收據。後續程式變更不得承接此版本的結果。
- 最終瀏覽器受測靜態建置：`be70711da6efea65`（包含 JS／HTML／CSS／CSP 與離線白名單的建置指紋），來源基線為上述 B 提交加本次 C diff。
- Bun 1.4.4；macOS arm64 上已安裝的 Chrome 156.0.8078.76，隔離 context，Service Worker 在供應商模擬測試中停用。
- 測試素材由 FFmpeg 產生兩秒紅／藍畫面與 440 Hz 合成音，不含真人、私人課程或第三方音樂。沒有使用真實 OAuth app／帳號、連接器 token 或私人雲端資料。

## 已執行的證據

| 檢查 | 結果及界線 |
| --- | --- |
| A 原提交 hook | 713 tests、3864 expects、0 fail；型別、lint、build 通過 |
| B 原提交 hook | 719 tests、3920 expects、0 fail；型別、lint、build 及裸包文件引用通過 |
| C 完整 check | 724 tests、3967 expects、0 fail；公開掃描、型別、lint（原有 19 項 info）、build 與封裝文件引用通過 |
| C 單元 | 獨立副本先核對後公開、intent／permission 收據、建立／撤銷回應遺失、精確撤銷與保留其他讀者、繼承／外部修改／切帳號／端點與檔名拒絕通過 |
| Chrome 真正首頁＋合成供應商 | 保存目前兩片，另一隔離 context 下載／校驗／解碼／預覽、同一交易匯入 1 take＋1 recipe＋2 media，再重開雙片通過 |
| Chrome 本機 VS 成檔 | 從兩支合成原片走原有匯出流程，取得可下載的單一 VS，作為分享來源；沒有改編碼器或音畫門檻 |
| 成品分享與停止 | 預設不選成品、未確認不傳送、獨立副本不在私人資料夾、模擬唯讀權限重讀與精確撤銷、檔案保留通過；沒有匿名實播 |
| 下一版與缺片 | 第二 context 另存時保留同一父版本、媒體勾選預設空、缺片選項保持停用通過 |
| UI／生命週期 | 未載入雲端前零外部資源請求、390×844 無橫向溢出、Escape 回到入口、模擬授權視窗造成 hidden 不誤取消通過 |

初次瀏覽器回歸抓到原生 fetch 的 this 綁定，以及接續需先開示範再開 take 的順序，已修正。模擬端點另補跨來源預檢及 Location／Range 可讀標頭。提交前封裝測試抓到新增資料指南引用的雲端文件未隨包，已補白名單；原檢查均保留，沒有調低門檻。

## 重跑

使用 repo 指定 Bun 與既有依賴，先跑 `bun run check`，再跑 `bun --no-env-file scripts/verify-cloud.ts`。瀏覽器回歸需本機 FFmpeg 與 Chrome，可用 `DANCE_STAMP_CHROMIUM` 指定已安裝瀏覽器，不自動下載。它建立專用隨機 localhost port、隔離瀏覽器與合成端點，結束關閉自有資源。收據與合成截圖在 `output/playwright/cloud/`；本文件保留關鍵結果與版本，聊天及暫存檔不是唯一交接來源。

## 尚未驗證

真實 GIS popup／Google Console 設定、Drive CORS／傳輸／配額與政策、到期後真實重授權、供應商影片處理、全新未登入環境播放到結尾／音訊／seek、撤銷後匿名拒絕、兩台實體裝置來回、Safari／手機／觸控與人耳全部**未驗證**。SW 與離線雲端工作沒有在此模擬瀏覽器流程驗收，既有 unit 檢查另有範圍。這不是 G1–G7、#12／#18 或正式發布簽收。

擁有者已表示尚未設定，先完成程式與設定說明。下一步依 [設定交接](../CLOUD_SYNC_SHARING.md#11-google-實作進度與設定) 準備擁有者的 client ID、精確 origin、consent／隱私頁與明確獲准測試帳號，僅用合成素材驗證 A→B／C。Google 路徑穩定前，Dropbox 與前景自動同步不進入實作；iOS App 不做。合併與正式發布仍須使用者明確授權。

## 2026-11-02 本次 PR 整合審查

白話：讓已審過的聲音、繪圖及雲端入口放在同一版檢查，避免各自正常、合在一起卻互相干擾。原規劃 #210、繪圖修正 #219、私人 Safari 證據 #218 與已修觀察器 #217 納入真正的 Git 依賴；不把它們的舊媒體結果移記成這版已重跑。文件衝突保留各自來源與限制，規劃與實作狀態衝突採已實作且仍未驗收的現況。

產品受測來源 `ffdece57710cb5d8ff283b12a5dcac0acbbf72b4`、建置 `7bac167aa0837b27`，Chrome 156.0.8078.76／Bun 1.4.4。先逐 bytes 核對 main、follow-ui、follow-export、timeline 原碼與建置相同，再跑原 `scripts/verify-cloud.ts`：本機 VS 成檔、合成端點保存／另一隔離 context 下載預覽與原子接續（1 take／1 recipe／2 media）、父版本、缺片停用、明確分享確認、獨立副本及撤銷、390px 無溢出與 Escape 回焦點通過，頁面錯誤 0。後續 #218／#217 只加 QA／文件，產品 bytes 保持同一版。

首次提前執行讀到舊建置 `10efdd30c718c94e`，該份完整收據與輸出另存，只視為舊建置結果，不能替繪圖修正版背書。上述固定建置重跑的合成收據 SHA-256：`19e6f74e20aa63067ae25ccd350ed4d053ffb5dbaa6102f61d849493b9a55cce`；原始 JSON、截圖與合成媒體留本機 ignored output，不公開帳號／origin／媒體。這不是額外原生媒體矩陣或下載後獨立音畫品質驗收。

審查追查 GIS 的使用者手勢、Drive 分段傳輸、帳號切換與私有／公開權限邊界；未發現本次變更新增的 P0／P1。#217 的兩則 P2 已核對修正：隔離主機 fixture 與缺少 requestFrame 時保留原生能力判斷。整合提交照常跑完整 check 與 hook；最新 CI 與合併狀態以 PR 的精確 head 記錄。真實 OAuth、Google 端點、匿名觀看、實體跨裝置、Safari／手機及 G1–G7 仍未驗證，#209 不因合併而關票。
