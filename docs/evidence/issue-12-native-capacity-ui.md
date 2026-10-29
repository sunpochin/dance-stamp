<!-- 檔案用途：記錄 #75 近 10 MiB 備份的真正產品下載、匯入及救援驗證。所在層：匿名 Chrome 工程證據。主要關聯：issue-12-backup-recovery.md、web/main.js、library.js、storage.js。 -->
# #12／#75：近上限 JSON 的產品下載與原生還原

2026-10-30 Asia/Taipei。固定 [PR #75](https://github.com/sunpochin/dance-stamp/pull/75) 已續審來源 `87e04e85813bbf02452ee57bfba71910b4904cb6`、靜態 `9ef2b8488982695f`，來源 CI #149 success。獨立 clone 開新分支，測試開始時 trackedChanges 為空；本輪沒有變更產品、schema、依賴或容量門檻，沒有重現新缺陷。之後只補匿名文件，不能把來源版本的實測改記為文件 head 重新執行。

macOS 27.0.1／Chrome 156.0.8078.49 headless、Bun 1.4.4，原子取得共用影音鎖。新建四個專用 profiles、隨機 loopback origin、SW 禁用，14 份建置資源留完整 SHA256。產品沿原樣資源及 CSP 執行，相機／麥克風／畫面擷取明確禁止，相關呼叫為 0；不是 Safari、真人操作或新的影音品質矩陣。

## 合成資料與容量

- 完整 v2：1 video、3 asset、260 marker、1 take、1 recipe、1 export、1 move；包含 Move→Marker、老師 12–32 秒、自己 offset 4 秒、獨立鏡像、老師／take 各自的拍點，以及課程分類。每筆 note 仍在原 20,000 UTF-16 code units 限制內。
- 筆記含繁體中文、emoji、換行及純文字 HTML 字串；實際 JSON 為 **10,477,568 UTF-8 bytes／4,229,598 UTF-16 code units**。距 10,485,760-byte 上限保留 8 KiB，讓「已有另一份筆記」的合併及本機媒體狀態欄位仍有空間。本輪不宣稱零餘裕原生 UI 通過；來源的零餘裕函式測試保持其原證據。
- 同一下載內容若用舊縮排編碼，計算為 **10,497,480 bytes**，超過上限 11,720 bytes；這只是保留相同內容的編碼計算，沒有冒充重新操作舊版瀏覽器。
- 使用既有自製 65 秒 MP4 與移除音軌的同來源檔，實際大小 **1,789,027／1,630,207 bytes**；經產品「選片並預覽重連」及明確保存副本。VS 只有格式描述，沒有提供 VS 媒體，保存清單仍為 missing；不把單側原片或 JSON 冒稱 VS 成檔／影片備份。

## 真正下載檔 → 產品預覽 → 保存／重開

來源先用產品 restore 選檔／預覽／確認匯入合成資料，再透過正式重連入口保存兩側原片；沒有把下載控制器、DOM 或 Blob URL 換成 stub。

| 情境 | 實際產品結果 |
| --- | --- |
| 正常備份 | 真正點「下載筆記備份」，收到瀏覽器 Download 並 saveAs 成檔。磁碟檔恰為 10,477,568 bytes，可由 parseBackup 讀取；七張表、來源身分、每段多位元文字全部等於預期，原生 metadata／兩片完整 bytes 不變。 |
| 來源自己重匯／取消 | 把剛下載的實際檔交給產品 file input；預覽不寫入，取消後完整保留。再次預覽並確認為冪等：revision、完整 metadata／media keys／Blob 指紋均不變。 |
| 新環境還原正常下載 | 另一個新 persistent profile，經同一 file input／確認入口保存；全部 canonical 欄位與原關聯相同，三類媒體仍 missing。重匯冪等、同頁 reload、關閉並以同 profile **新 Chrome 程序**開啟後，完整原生 metadata 相同。 |
| 新環境還原救援下載 | 再用獨立 persistent profile，以真正救援下載檔重做上述預覽／確認、重匯、reload 及跨程序重開，完整資料相同。 |
| 已有另一份筆記與原片 | 先用產品匯入小型完整資料並保存兩片，再選正常下載大檔。取消預覽不改舊值；確認後保留全部舊記錄及每個媒體 byte，新來源依原策略重建 ID。獨立逐欄核對全部 268 筆新記錄及 typed 關聯、拍點／時間／鏡像，沒有覆寫本機；再匯一次與 reload 仍一致。 |

兩份實際檔都為緊湊完整 JSON，沒有截斷文字、減少表格或調高上限。正常 SHA256 `da20565836f1d8926f08152ec18708d0a5e6ff43d324299920379f753202c083`；救援 SHA256 `75814884543af5660e3fb9f0191702f2be420ae67b51605a7eeaf5b4cc81d641`。兩檔僅 exportedAt 更新，所有 canonical 資料／來源身分均一致；asset 的 state／storageKind 不外流，mediaIncluded 均為 false。

## 救援為明確注入，不是 Safari 原生卡住

來源已有非空筆記與兩片時，先在真 UI 填寫未保存的新標題。只對這輪真正 metadata 交易注入同步 UnknownError，並抑制產品 complete／abort listener 的交付；QA 的原生 listener 仍收到 **isTrusted=true 的真正 abort**。產品因缺少收據進入 StorageUnconfirmedError、顯示救援並封鎖保存；這個注入案的 Chrome 實際已 abort，不能當作 Safari 沒有結束事件、真實 UnknownError 或未確認時已證明回滾。

真正點「另存本頁筆記備份」取得上述救援檔。產品只輸出最後確認的完整資料，新標題草稿未被混入；救援前後交易計數保持 1，沒有重新讀／寫 DB。再點產品「已另存，重新開啟同一頁讀回」，接受原生確認及離頁提示；reload 後 unknown=false，原生完整 metadata、原片 bytes 與故障前完全相同。這證明本注入序列的產品救援入口，不是 Safari／真正不明交易的完成收據。

## 收據、檢查及清理

43 份完整原生 metadata／keys／Blob 快照、11 次產品匯入預覽均保留在 ignored output。另以獨立讀取核對全部快照 SHA、原片 binary 的每個 byte、兩份真正 JSON 下載及所有匯入後 typed 關聯。沒有清庫、接管舊 profile 或為測試關閉容量檢查。

- 原始總收據 SHA256 `d2f9fca745e40ab12f699ac45f01e72ddcbeaff00b453eebdeb10b38d89668cd`；獨立逐欄／byte 核對 `8ea3b7641f03c75f24c1ee3222893a4f5c163c286356d386a6ac5519b8fb422f`。
- 私有 runner SHA256 `4abe6745ecf8cb7f97c1dd344d3d0d3c868c1f75ddcb37bbab368c09e8e7a808`；純合成 fixture 工具 `3fff60a9e7b46e41f4692cb6b1c440ccf4dd742e2653aa332367a81fead72b3b`。兩者只留本機，不加入產品或下載包；受測產品保持乾淨 87e04e8。
- 六次 browser 關閉、44 個已知自有 PID／四個精確 profiles 均核對無殘留，程序稽核 stderr 必須為空；自有 server 回 connection refused，核對自有 nonce 才釋鎖。交叉清理收據 SHA256 `2b2ef4acbff4b17efdd29f06df82d3ed5342b71584363448da44615719720439`。沒有停止其他聊天或日常瀏覽器。
- 同版原 `bun run check` 通過 **410 tests／1782 expects／0 fail**、公開掃描、型別、原 lint、build；19 項既有 lint info 保留。原 hooks、文件 head／CI 另由交付 PR 綁定，14 份 runtime 必須逐 byte 與本受測版相同。

本輪只補 v2 近上限產品 UI；原生零餘裕／短日期／v1、真實 quota／磁碟、永久保存、Safari／私人模式、真正未結束交易、聽感／實體媒體與跨實體裝置仍未由此完成。Claude Code／使用者最終審查保留，Web 優先、iPhone 暫緩；未合併 main、部署、發布或關閉未驗收票。
