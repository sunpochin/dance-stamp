<!-- 檔案用途：記錄 VS 保全、啟動拒絕及原生權限／播放邊界的覆蓋率續補。所在層：匿名工程證據。主要關聯：tests/browser/vs-share.js、vs-save-tail.js、vs-live-delete.js、storage-startup-failure.js、tests/app-coverage/run-app.ts、TECHNICAL.md 第 8 節、issue #103。 -->
# #103：VS 保全與原生播放／權限回歸

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

## 保存尾段、目前 VS 刪除與啟動失敗續補

影片已做好，保存失敗也要能帶走；使用者明確刪掉目前 VS 後，舊連結則必須失效，但原片與筆記仍在。遇到比程式更新的資料庫，也不能為了開啟畫面而清空它。

延續同一張 #103 與 PR #116，從原 head `692741fe9dedb8aa8bf325b5362e496217cd1931` 接續，產品九份 JS、HTML／CSS、Cloudflare設定及CSP仍不改，#114保持原head待審查。原38項證據保持上方的來源歸屬；本輪完整矩陣改為44項，另記同輪結果。

- `vs-save-tail-stop-complete`／`native-reject`／`unknown-abort`／`unknown-complete`：直接呼叫既有 `vs-save-tail.js`，保留真正成檔、兩次原生put成功後的pending、真正Stop、trusted ConstraintError／complete／abort、完整舊筆記與Blob bytes、下載指紋、重試及同頁讀回斷言。兩個unknown案例明示遮住產品結束通知，不能寫成Safari自然故障。只接入瀏覽器case；`verify-vs-save-tail.ts` 的獨立分析及離站播放另驗，不因插樁案例通過就補勾原生影音矩陣。
- `vs-live-delete`：真正保存兩側原片、非空標記及VS；取消與原生交易abort均保留完整metadata、三份影片指紋和URL。成功後只刪目前VS，原片／配方／筆記仍在；畫面與下載控制隱藏、分享停用、原生URL撤銷，新分頁載入舊URL得到ERR_FILE_NOT_FOUND。上方移除副本入口的範圍與取消亦核對，最後真正重做並下載新VS。
- `storage-startup-failure`：在空白自有context由原生IndexedDB建立v2，再讓產品的v1開啟得到trusted VersionError；核對清楚的未清庫提示。較新版本、未知object store／欄位、metadata、chunks及完整Blob bytes，在同頁重開後均相同。這是拒絕較新格式的保全，並非支援v2原生資料庫或跨程序／實體裝置。

重跑原入口，或先選新增六項：

```sh
bun --no-env-file tests/app-coverage/run-app.ts vs-live-delete storage-startup-failure vs-save-tail-stop-complete vs-save-tail-native-reject vs-save-tail-unknown-abort vs-save-tail-unknown-complete
bun run test:coverage:app
```

分項與完整44項均已通過，本輪精確覆蓋率與來源階段見下方。所有錄製來源為既有合成影片／canvas，沒有操作實體相機、麥克風或私有檔案；不合併、不正式發布，#103仍按剩餘缺漏與人工門檻保持開啟。

### 此輪失敗與修正範圍

首次 `coverage/app-tj4xSb/` 在隱藏的備份按鈕逾時：舊案例尚未展開新的次要工具。只為該下載入口補真正summary點按，原資料與原生事件斷言保留；後續四個保存尾段案例均通過。`app-Btvgv0/`、`app-b6z7S6/` 的刪除斷言曾額外要求href屬性消失，但產品契約是隱藏控制並撤銷底層URL；改以新分頁真正無法載入驗證，沒有修改產品。

`app-A3pEhS/` 的啟動斷言曾額外要求整個選片區disabled；既有契約是錯誤提示與不清庫，未承諾這種版面狀態。移除該額外期望，仍保留trusted VersionError、所有未知資料／bytes及重開一致；成功單項為 `app-WZwYA0/`。上述失敗輪不當作完整通過，不把不同輪的計數合併。


### 本輪完整結果與來源階段

macOS arm64／Bun1.4.4／隔離Chrome156.0.8078.76；`coverage/app-qqF87Y/run.json` 為 **passed、44/44、0 page errors**，203次導覽快照。parent為692741f、trackedChanges=true；九份產品JS的SHA-256執行後仍完全吻合，產品來源與c351637相同。

| 同輪、同九檔分母 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| 單元／VM基準 | 758/2,010（37.71%） | 276/674（40.94%） | 811/2,163（37.49%） |
| 加入完整44項 | 1,996/2,010（99.30%） | 646/674（95.84%） | 1,871/2,163（86.50%） |

相對前述38項本機輪，增加9行、6函式、12分支；這是兩個完整輪各自結果的比較，沒有跨輪加總收據。main.js為98.86%／94.27%／80.66%；其他8檔行數100%，其餘函式／分支百分比與前述本機38項輪相同。仍未達100%，沒有刪除防護或加忽略規則。

主畫面剩14行未覆蓋：`555,587,588,616,617,618,980,981,1613,1622,1632,1633,1634,1635`，包含原生相機／錄影中斷、救援原片刪除、播放失敗與片尾回復等保護；不能從此輪補勾它們或其他平台。

- runner SHA256：`0bd47624b42deb8441aa88ab121962d07a379cd37ffb5c833f56db6dee32926a`。
- 完整run收據SHA256：`5ad0619895f93ede8244005aab91e9eb84b060016df6405129709a87b3d4b4a8`。
- 保存尾段案例SHA256：`03e99274d723dbf922bc97d85b67d842af2031eb4bd6186e460c2985e296e895`；刪除案例：`ac9ec09a37303095814c776f6479c7632cac15772263a07e9c324c1c08490fdc`。

完整本機輪執行啟動案例時，版本為`68760cb8e3d6a7829d970608e8d479bea38d9924a33b0217556e4ea3473782c1`。該案例完成後，另加強「第一次讀回即須逐值等於預置資料」，避免只比較兩次錯誤後快照而漏掉首次損壞；最終案例指紋為`68377f65568f54adf145682bb74deac1e02c1be35aeee7690d77c4fc960d78e5`，獨立重跑`coverage/app-p4CDAv/`通過。這個host斷言不改產品JS／位置表／runner；本機完整輪仍保留原案例階段，不能改稱最後提交的乾淨完整重跑。最終head的CI完整輪結果另外列於PR。

原品質入口645 tests／3160 expects／0fail；281檔公開掃描、型別、lint及build通過，仍有19項既有lint info。正常提交hook再核對最終暫存內容；來源與結果不由舊head的review代替。

### 十份下載的獨立驗證

四個保存尾段案例的舊VS、新VS及原生拒絕後重做，共9份，沿原`analyze-export-failure.py`的片長、左右／鏡像／留邊、660Hz示範聲源與880Hz自拍排除／音量門檻全部通過，沒有另定較寬門檻。刪除目前VS後重新成檔的第10份，只宣稱本輪完整解碼與離站播放，不移記為相同鏡像分析設定或完整G1–G7。

全部10份都在新隔離Chrome的file頁播到ended、error=0，1280×720、音訊有解碼；FFmpeg對所有影音軌完整解碼無錯誤診斷。9份尾段檔的原生播放器dropped=0；刪除後重做的檔案為1，保留實際結果，不改寫成全部零掉幀。這是合成短片的可播放性與指定分析，真人聽感、完整同步／穩定性、Safari及實體裝置仍另計。

獨立播放收據SHA256：`2dac5ba5d2d9122081ed327fa9ab9eb74377dbe2891f4046b93535dccc68c610`；每檔指紋、播放器數據與9份原分析結果保留在本機`output/vs-protection-playback.local.json`。完整runner的browserClosed／serverStopped為true、lockRetained=false；獨立播放另確認自有已知Chrome PID集合退出，再核對nonce釋放自己的鎖。未使用他人測試程序或鎖來補收尾證據。


## 原生相機拒絕與自然播完續補

相機被擋住，不該連舊影片一起弄丟；解除限制後，仍要能再試。練習片自然播完時，也應回到 A 繼續；按停止後就保持停止。

本輪繼續同票、同分支與 #114 前置，parent 為 `aa268aacfc484c4fcc067f6837fac4254c7af04c`。新增兩份瀏覽器案例及完整入口接線，44→46 項；九份產品 JS、HTML／CSS、CSP、儲存格式與發布設定仍和 c351637 前置相同。沒有為覆蓋率修改產品、注入假 ended 或改播放時鐘。

- `camera-policy-denial`：只在獨立測試 context 的首頁回應加 `camera=()`，由真正的 getUserMedia 拒絕兩次。核對原生 DOMException／NotAllowedError、trusted 點按、零串流、可理解提示、原片 URL、完整 library／revision 及每份影片 SHA-256。移除測試標頭後重開，資料仍相等；重新從保存筆記開片後，真正的合成裝置可預覽、沒有音軌，停止釋放全部 tracks，資料維持相等。該 context 停用 SW 是為了不混入快取舊政策，產品 SW 沒有修改；真正 OS 權限視窗與硬體仍未驗。
- `practice-natural-end`：使用既有三秒合成 MOV，A=0.4、B=原片 duration、練習速度2。真正播放到尾端至少兩次，核對 trusted ended、尾端位置、回 A 後的原生 playing；不另訂閱影格，只觀察產品自己的 callback。停止時 pending=0、同時最多一個 callback，再等過下一輪應播完的時間，確認沒有晚到工作自行重啟，library 前後相等。

重跑沿用現有入口：

```sh
bun --no-env-file tests/app-coverage/run-app.ts camera-policy-denial practice-natural-end
bun run test:coverage:app
bun run check
```

首輪單項 `coverage/app-KoVZaO` 失敗：重開筆記按鈕 selector 用錯名稱；結尾觀察器又在產品 handler 回捲後才讀時間。改用現有 `open-library`，並在 capture 階段先記原生尾端，再交給產品 handler；原本的原生結尾、B 點、回 A、停止與資料保全斷言全部保留，產品未改。失敗收據保留，不混入成功計數。

修正後單項 `coverage/app-HIzruY` 通過兩項、0 page errors，browserClosed／serverStopped=true，lockRetained=false；兩次原生拒絕、解除後一條無音軌合成串流，兩次原生 ended 均 at=3／ended=true，回 A 的 playing 約0.400秒、所有觀察事件 trusted；最大 callback=1，停止後 pending=0。

### 同輪完整46項結果（2026-10-31）

`coverage/app-24OJcY/run.json` 為 **passed，46/46，0 page errors**，211次導覽前快照；macOS arm64、Bun 1.4.4、隔離 Headless Chrome 156.0.8078.76。來源 parent 為 `aa268aacfc484c4fcc067f6837fac4254c7af04c`、trackedChanges=true；這是提交前完整輪，並非乾淨最終 head 重跑。

| 同輪、同九檔分母 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| 單元／VM 基準 | 758/2,010（37.71%） | 276/674（40.94%） | 811/2,163（37.49%） |
| 完整46項 | 1,999/2,010（99.45%） | 647/674（95.99%） | 1,877/2,163（86.77%） |

對照前一完整44項，增加3行、1函式與6分支；各完整輪獨立計算，沒有混加。main.js 行數99.1%、函式94.53%、分支81.14%；尚有11行未覆蓋：`555,587,588,616,617,618,980,981,1613,1622,1635`。其餘8檔行數100%，函式／分支仍有缺漏，#103保持開啟。

- runner SHA-256：`53fd39a7e8e41b713c9014306549ffc201a24a36177729161a315db59adeee67`。
- 相機政策案例 SHA-256：`54b16969c398f30e3d70b024a3fa5aa6c4fe0c9f77d6e186a7b65c52ac684060`。
- 自然播完案例 SHA-256：`adeebd4cb42a650c9bc95ddf693f1b67187cda47cb5395ed770449637af82e57`。
- 完整 run 收據 SHA-256：`28c0f06b6d71f7f75fefaf46cf445cdf39dbc51c35e8bcb02aebfd13e0781b22`。
- 新兩項在完整輪亦通過，原生錯誤／結尾與資料保全斷言保留；收尾 browserClosed／serverStopped=true、lockRetained=false。
- 正常 `bun run check`：645 tests／3,160 expects／0 fail，型別、公開掃描、lint、build完成，19項既有lint info；最終正常hook與精確head CI另記PR。

本輪不新增媒體編碼或產品外傳能力；前次10份下載的離站播放仍綁原收據，不能換標成這輪輸出的獨立驗收。原生Safari、硬體相機／OS權限視窗、真人、實體裝置與完整G1–G7仍各自保留，iPhone暫緩。#114仍保持 c351637 開啟待審查，本輪不合併或正式發布。
