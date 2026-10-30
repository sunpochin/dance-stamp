<!-- 檔案用途：記錄 VS 系統分享的檔案指紋、失敗保全與覆蓋率續補。所在層：匿名工程證據。主要關聯：tests/browser/vs-share.js、tests/app-coverage/run-app.ts、TECHNICAL.md 第 8 節、issue #103。 -->
# #103：VS 分享的後備、取消與重試

影片做好後，分享被取消或拒絕，都不應讓原片、VS 或筆記不見。這輪像先確認要交給郵差的包裹，再測試「郵差不收、取消寄送、再寄一次」；最後把留在桌上的包裹再拿出來核對，確認仍是同一份。

## 來源與範圍

使用者要求 PR #114 保持開啟待審查，因此不修改其分支或提交 `c3516376982e646097a7700798cf88a0fd438649`。從同步 main `d83755239bf145e9b79d50263208edfad83754e8` 建 `codex/issue-103-vs-share`，以該候選作前置；保留原統一量測與 #113 hook 隔離修正。新增內容只涉及瀏覽器案例、矩陣接線與文件，九份產品 JS、HTML／CSS、儲存格式與發布設定不變。

`tests/browser/vs-share.js` 先透過正式 UI 選兩份既有合成影片，真正合成、保存並下載三秒 VS，再依序驗證：

1. 沒有 VS 時分享停用；不支援影片分享時不呼叫 share，顯示下載後備。
2. 支援時的 canShare 與 share 收到同一個 File；檔名、MIME 容器、大小與完整 SHA-256 對應原生下載，點按資格在呼叫當下仍有效。
3. AbortError 取消、NotAllowedError 拒絕及之後重試；每次完整 library 快照、原片／自拍／VS URL 與下載連結都保持一致，按鈕仍能使用。
4. 最後真正下載的整份指紋、大小與名稱仍等於初次下載。頁面錯誤、對外請求及相機／麥克風／畫面擷取呼叫皆不得出現。

只替換系統分享 API，檔案仍由產品真正成檔；不啟動真實 OS 分享、不發信、不上傳到雲端，也不把 mocked share fulfilled 寫成收件者已收到。這是應用程式的控制流程證據，實際 OS 分享、跨實體裝置接收與播放仍須另驗。

完整 App 入口加入此案例，37→38 項；保留相同九檔分母、位置表與所有原斷言。`share.js` 繼續驗筆記 JSON 分享，不能以其成功替代 VS 控制分支。

## 重跑與目前結果

指定 Bun 1.4.4、既有 FFmpeg／Chrome，沿原入口執行：

```sh
bun --no-env-file tests/app-coverage/prepare-fixtures.ts
bun --no-env-file tests/app-coverage/run-app.ts vs-share
bun run test:coverage:app
bun run check
```

單項回歸已通過：真正 VS、四次 mocked share、下載指紋及來源／筆記保全、重試、點按資格、零頁面錯誤／外部請求／擷取呼叫，均有斷言。完整 38 項亦已通過，詳見下方；本機執行於尚未提交工作樹，不改稱乾淨提交重跑。

首輪在嘗試用 fetch 讀 Blob URL 時，被既有 CSP 正確拒絕，案例因此整輪失敗；未修改產品 CSP。後續改由真正下載建立前後基準，再在 API stub 核對完整 File 指紋，修正後單項重新通過。失敗收據保留於 ignored `coverage/app-BNHlfg/`，成功單項位於 `coverage/app-KGzqZE/`，沒有合併計數或把首輪列為通過。

原生選檔視窗另屬 #89：本聊天的 CUA 選檔僅確認合成 MOV 可載入；真正原生視窗控制因使用者正在操作 Chrome 而停止。測試頁與自有主機／nonce 鎖已收尾，該視窗的灰色檔案呈現仍未驗證，不能由此 VS 分享回歸補勾。

不合併 main、不發布，也不改 PR #114 的待審查狀態。原生 Safari、真正 OS 分享、真人與跨實體裝置、完整影音 G1–G7、VoiceOver 及手機不由本回歸證明；iPhone 繼續暫緩。未達 100% 的函式／分支仍照實列出，#103 不因新增案例而自動結案。

## 同一工作樹完整輪結果（2026-10-31）

macOS arm64、Bun 1.4.4、隔離 Headless Chrome 156.0.8078.76；完整 `coverage/app-hYZJLU/run.json` 為 **passed，38/38，0 page errors**，178 次導覽前快照。收據記錄 parent main `d83755239bf145e9b79d50263208edfad83754e8`、trackedChanges=true；含前置 c351637 候選及本輪測試，不能改稱 main 原版或提交後乾淨重跑。九份產品 JS 逐檔 SHA-256 與 c351637 完全相同；本輪 runner 與案例另記指紋。

| 同輪、同九檔分母 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| 單元／VM 基準 | 758/2,010（37.71%） | 276/674（40.94%） | 811/2,163（37.49%） |
| 加入完整瀏覽器輪 | 1,987/2,010（98.85%） | 640/674（94.95%） | 1,859/2,163（85.94%） |

相對前置候選相同產品來源的37項結果，增加5行、1函式、6分支；這是兩個完整輪各自結果的比較，沒有把計數收據跨輪相加。`main.js` 行數98.13%／函式92.70%／分支79.71%；其餘8檔行數100%。其他仍有未覆蓋函式／分支：library分支95.86%、local-audio分支91.44%、offline函式83.33%、recorder分支94.11%、storage函式95.23%／分支89.28%；beats、sw、timeline三種統計皆100%。原位置表及全部零命中項仍留在 report／app.json，未加忽略規則。

主畫面仍有23行未覆蓋：`555,587,588,616,617,618,750,751,752,980,981,993,994,1309,1310,1311,1613,1622,1632,1633,1634,1635,1698`。這些錯誤／中斷或保護分支需要另有可重現行為才續補，不以形式呼叫灌滿。

- runner SHA-256：`98798a3c87940fa50e90899d236d1ebd491d362e900066f9452e7fb2fabcf09e`。
- VS 分享案例 SHA-256：`44ff87c0182d2b02e4ff0eaa483ebab3ae986ff4470ee271e128148828998580`。
- 完整 run 收據 SHA-256：`c157883271c9283c34979cfd4767c063a3e959a76462aa75b88f0c20157fcf38`。
- VS 案例的4次受控 share 全部核對檔案、當下點按資格、保留與重試，外部請求／媒體擷取呼叫皆0。
- runner 收尾為 browserClosed=true／serverStopped=true／lockRetained=false；這是持有資源的關閉結果，不宣稱完整 OS 子程序清單稽核。

### 離開產品後的檔案驗證

完整輪真正下載的 `vs-share-preserved.mp4`，SHA-256 `b8db94d40d0bc5ed9af696e21a93de45c3d4d68ea8c55649a76fe51218692643`，另由新隔離 Chrome 的 file 播放頁重開：2.964567秒、1280×720、93影格、0 dropped、ended=true、error=0，音訊解碼10906 bytes；FFmpeg 對全部影音軌完整解碼，exit=0、無錯誤診斷。這證明此合成下載可在產品外重播，並非真人聽感、完整同步 G1–G7 或實體接收端驗收。

首次獨立重播因另一個 #9 原生驗收持有共用鎖而以 EEXIST 停止；沒有刪除／接管該鎖。等其自然釋放後才重跑。本輪獨立重播的已知 Chrome PID 集合退出、剩餘清單空白，再核對自有 nonce 後釋放自己的鎖；本機收據為 ignored `output/vs-share-playback.local.json`，不外傳任何真實媒體。

`bun run check` 的單元測試為645 pass／0 fail／3,160 expects，型別、公開內容掃描、lint與build完成，仍有19項既有lint info；最終正常提交hook結果另外記入PR。本輪沒修改產品 CSP、沒有執行合併或正式發布。
