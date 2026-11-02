<!-- 檔案用途：記錄九個 App 程式的統一覆蓋率、重跑入口與驗收限制。所在層：版本固定的工程證據。主要關聯：tests/app-coverage/、TECHNICAL.md 第 8 節、issue #103。 -->
# #103：全 App 覆蓋率與恢復流程



## 2026-11-03 最終整合候選（#240，待完整CI及指定終審）

白話：把本機節拍器、另開工具仍保留雙片、分析準備時取消，以及雲端待傳／分享恢復放在同一版檢查。人物影格真的傳不出去時，也要停妥、留下舊成品並能同頁重試；最後下載的成品須離開網站播放與解碼，整場仍有30分鐘有限上限。

來源是原#240 `5fb34aeb1e49e6cbede4b45bc21641a77f80c9aa` 正常merge已審#243 `2e37703d2dd2c352763ce4d39f95d75f306c8dd9`，後者含#242純infra `ca757acadf4795a2401825a80bfa938d14c58a9b` 與main e3d的#236證據；全部原commit保留，沒有rebase或提前merge main。整合後24份web JS逐byte等同5fb／#237 c7；兩份239測試與其worker-load證據逐byte等同2e，#236的37行完整保留。原83頂層runner與5fb完全相同，只由原follow-runtime既有入口追加第12子情境；各個案／品質期限、分母、順序不變。新bitmap邊界及十份成品證據沿[239原來源](issue-103-worker-load.md)，不拿其21模組局部百分比拼入本版24模組。

原#103驗收對照仍是全部web JS分母、同源前後基準、每檔缺漏及有意義公開瀏覽器／真IndexedDB與SW恢復；既有單元／VM、LCOV與正常品質入口保留，沒有新增「所有數字100%才可結案」門檻。最近成功的完整82案是[#237 c7／run41500340701](https://github.com/sunpochin/dance-stamp/actions/runs/41500340701)：同24份產品行3329／3357、函式1082／1127、分支3221／3713、skipped0；原#234的81案量測／成品通過但整場25分鐘取消仍依[HARNESS原紀錄](../ai/HARNESS.md#完整-app-ci-的整場時間預算)保留。兩者不改稱本整合head結果；本次不因runtime相同重跑已過本機長矩陣，完整83案＋第12子情境以此最終head CI另驗，未預勾。

本機正常整合check：760 pass／0 fail／4,384 expects，公開掃描／型別／lint／build通過，原19項lint info保留，靜態07cdd7b66289af39；提交仍走正常hook，沒有略過檢查。

產品鏈的重要指定終審仍待使用者答覆，完整CI通過也不代簽最終審查、main合併、#103／#8／#161／#194關票或發布。真Google仍未設定，真人／Safari／實體及原G1–G7驗收邊界照原文件。本輪只補整合交接，不再開coverage子票或擴測。

## 2026-11-03 新頁恢復分享與停止失敗待確認（#238）

白話：分享傳到一半失敗，新頁仍能選回同一件工作；錯一個byte的成品會拒絕，重新確認並選原成品才完成。停止連結若出錯，畫面說「待確認」；重新查到仍公開後，使用者再按停止才移除原權限，影片留著。首次既有流程即通過，本票只有測試／證據，未發現或修正產品缺陷。

範圍先對照 [原雲端規格](../CLOUD_SYNC_SHARING.md) 的分享回應遺失／失敗恢復與停止不得誤報私人契約。#231固定完整80案報告的cloud-share-ui未覆蓋61–64、71；原core只是同頁PATCH收據遺失後重按publish，遠端影片已存在，不能替新頁recover或停止DELETE錯誤作證。經協調者先確認有界scope後建#238，只加第83案；沒有remote-only、剪貼簿、額外服務或其他擴張。

本輪整合來源 `ccf922136834590955edf0505988ab80b32877d6`：正常保留 #237 `c7a75860414d725c09a136cfb798952ee0bcdc30` 及 #230／#231／#234 前置，再正常merge main `3cccbd27cec87bfafc23175e880e114fe8677222` 的純#13證據。受測為該來源加未提交測試，`trackedChanges=true`；全部 **24份web JS** SHA-256逐一相同，runtime零修改，CLI靜態仍 `07cdd7b66289af39`。沿237共用cloudWorkspace建立真雙片、1 take／1 recipe／1 export及舊VS；原片Blob SHA等於實際輸入，已存VS的完整bytes／SHA等於真下載。

公開操作與請求邊界：

- 首次publish在真正shared-video upload POST只回一次明示503，不轉交合成供應商；遠端files／bytes／grants全0。request method/path/id/operation/status與產品「分享狀態待確認」錯誤分階段落盤；不把錯誤當已交付，不宣稱真Google故障或自然斷網。
- 保留原頁僅核對原片保全，另新頁有獨立全域且沒有兩側src、分享preview、draft或可選本頁成品。它讀同localStorage工作清單、明選同ID；公開確認預設false。選入實際下載VS的同name/size/MIME複本，只有最後1byte翻轉，再明確確認／按recover；精確內容錯誤拒絕，0新upload、遠端仍空，原工作及完整本機資料不變。沒有缺片、長度或MIME不同的混淆。
- 換真正原下載VS，重新取消／勾選公開確認，再按recover；同id/operation/hashes只建立一成品副本及一grant，遠端完整bytes的SHA等於原VS。原片與筆記未傳送，未建立私人root或其他檔。
- 真正DELETE `/files/<same-id>/permissions/<same-permission>` 只回一次503且不轉交供應商。UI明確「停止分享結果待確認」，沒有私人／權限已移除的文字；該非空grant、遠端metadata／全部bytes、同工作與完整本機資料保持。公開重新讀權限仍顯示同觀看連結，再明確retry才成功撤銷原permission；供應商只接到一個成功DELETE，沒有新upload，成品檔與bytes不刪。權限失敗收據另存，不以隱藏連結當作已私人。
- 全程完整library、全部媒體鍵／SHA、原頁兩側真Blob URL／時間／paused／速率及舊VS連結不變，新頁持久資料也不變；結束再從原頁真下載舊VS，前後相同。沒有直接呼叫產品handler或為覆蓋率改產品判斷。

正常 `bun run check`：**760 pass／0 fail／4,384 expects**，公開掃描／型別／lint／build通過，原19項lint info保留。獨立 `bun --no-env-file scripts/verify-cloud.ts share-recovery` 首次通過、0頁錯、自有程序exit0並依nonce釋鎖；獨立輪前後下載各36,699bytes／SHA `104cf4ad821ea23139e7df4a56655f841e23ae4e9c505357d1b02931ae38f9d5`，與插樁輪分開。

Bun1.4.4／macOS arm64／Chrome156.0.8078.76 headless，原App runner選定83案 **1／1、4,917ms、0頁錯**，browserClosed／serverStopped=true、lockRetained=false。原82案名稱／順序與門檻保留，完整分母／來源／位置表守門不變。`coverage/app-nzEWPR/` 同來源單元／VM→加一公開案為行 **1,231／3,357（36.66%）→2,087／3,357（62.16%）**、函式 **418／1,127（37.08%）→621／1,127（55.10%）**、分支 **1,386／3,713（37.32%）→1,890／3,713（50.90%）**；這是選定單案，**不是完整83結果**，不與先前完整80案或其他局部案拼算。cloud-share-ui本輪57／60行、25／29函式、23／42分支，61–64／71已執行，原始報告仍列74–76等未覆蓋位置。

新插樁輪前後真下載各 **36,990bytes**，同SHA `d28eb24c0bca946b85867d3cb8590a396e0db89d04e7c5fe369d74742b9ba4c7`。產品頁／主機已關閉後另做兩份FFmpeg -xerror全檔解碼，各exit0，H2641280×720／61 video frames、AAC93 audio frames；另建離線context拒絕HTTP，file:各播至 **2.033633秒 ended**、61frames／0dropped／0media error，0頁錯，正常關閉瀏覽器與nonce釋鎖。只證明本輪合成成品可讀且保留，不外推真人聽感或整套音畫矩陣。

來源重跑：先原 `bun run check`，CLI如上；局部 `bun --no-env-file tests/app-coverage/run-app.ts cloud-share-recovery`，完整原 `bun run test:coverage:app`。run.json SHA `35e5622a817a81f9d126d296b2e0180351bc08237ddae68403f2db734a992b2d`、完整計數器 `66a92bbf6f2ee006a8cfd4916439b8a290073960a43dac19491b0be7f25edbcb`、入口 `fb674d5a0308926bcdde1f78f190e486cd9382d290d3f17f4941507abf9a8222`、helper `599083677f759213d7feb76b8c8d4d2053ef660bff3932fe2ca9233116d7b5aa`、離站收據 `7b796fddad9052b705b35386d5697f03db77e648120277adf2975f6272e0086c`。raw合成素材／request錯誤收據留ignored，不公開帳號或私人媒體；完整CI依本票提交head另記，不預勾。真OAuth／Google／匿名觀看、自然離線、Safari私人模式、實體跨裝置、人耳與完整G1–G7未驗證；前置產品指定終審／合併另依既有gate。

本輪交接校正：#103原驗收是以有意義行為斷言朝100%補測、報前後基準及每檔缺漏，**不是自加「所有數字100%才可關票」**。本票及另一工作線當前任務交付後，先由協調者依原範圍、完整CI與實際剩餘風險／指定審查整體核對，不再逐行追分無限開票；#209真Google仍因未設定暫緩。本票的局部通過本身不代簽#103關票、真機或發布。

### #240 獨立審查補強：正確成品但沒有公開同意仍拒絕

白話：選對影片不代表同意公開。審查指出前輪只檢查預設未勾、之後都先勾才按，因此尚不能單獨證明同意守門。現在新頁先提供完全正確的實際VS，保持unchecked，真正按recover；必須精確回「完成分享仍會公開這份副本，請重新確認公開範圍。」。upload及所有fixture API呼叫數都不增加，remote仍空、localjob及兩頁完整snapshot保持，再接原本單byte錯檔→明確確認→正確原檔／DELETE503全部流程。只補這一次公開拒絕，沒有產品修改或擴scope；未確認不得公開採本段新證據。

新來源為原交付 `739b53170acc17208372687da802631dd3bb3a6d` 加未提交補強，trackedChanges=true、全部24份產品SHA相同；新helper SHA `f8c569f9fc783b16ec1a8330b1553e9d292be49ba7a852a6cf62e02eadbd3bcb`。正常check **760 pass／0 fail／4,384 expects**、原19項lint info及07cdd7b66289af39保留；獨立CLI亦通過，raw與前輪分開。選定 `coverage/app-8MkaXx/` **1／1、5,181ms、0頁錯**，browserClosed／serverStopped=true、lockRetained=false。同輪基準仍1,231／3,357行、418／1,127函式、1,386／3,713分支；加入新83案為 **2,087／3,357行、621／1,127函式、1,892／3,713分支（50.95%）**，不是完整83結果。

新插樁輪真下載前後各 **36,990bytes**，同SHA `e5fe4db7819e3ac9289aa62650b52b5534fc42d1afeacc833f1126893984b077`。兩份全檔FFmpeg -xerror解碼各exit0，H2641280×720／61video frames、AAC93audio frames；file:離線各播至 **2.032367秒 ended**、61frames／0dropped／0media error，0頁錯，正常browser／nonce收尾，不沿用前段舊成品hash。

新run.json SHA `7685a08d48344a6434dcfec4195550184f7a26497d0c578b8632a6b3ba681cf8`、完整計數器 `a8d5441a7154af39e9443c8b2e3643c5390c5b88806d4acca1d41aa8eac621de`、未同意拒絕收據 `bacb894b112867748bbf86aff197b927267989957b4c1c03dbcc5aab008896d9`、離站收據 `ce64df5f736fc1bccc4c26029a252c91d25df83c35f9b40ede2bf2cc02d679a3`。完整CI綁正常追加後新head另記；原非真Google／非真機及#103原驗收邊界保持。此補強交付後只讀整體驗收對照，不另開新票或文件PR。

## 2026-11-03 合成小檔、斷開及同位置重連（#235）

白話：先用工具產生的小文字檔檢查傳輸，再按中斷連接。之後重新按連接、選回原位置，仍能讀回同一份檔，再按上傳也不會多一份；原本練舞資料、兩支影片與比較成品都留下。既有流程首次即通過，本票只補回歸，沒有產品修正。

原契約沿 [雲端隱私與設定邊界](../CLOUD_SYNC_SHARING.md#7-免費隱私與設定邊界) 及第11節A：中斷連接停止工作並清除當次授權，與撤銷供應商授權、刪雲端檔、停止分享分開。先讀 `cloud-ui.js` 70–97 的 owning source，再沿真正公開probe／disconnect／connect／讀位置及小檔按鈕驗證；沒有新增服務、直接呼叫產品handler或假造產品缺陷，也不為追分擴開無關錯誤案。

基底為已審查補強的 #234 `6984861bc9cd4a911bf7ecfd79771c9b54a50236`，正常保留 #230／#231 等前置；新分支先同步 main 並保留依賴。受測為該基底加未提交本票測試，`trackedChanges=true`，全部 **24 個web JS** SHA-256逐份相同；本票runtime零修改，CLI靜態仍 `07cdd7b66289af39`。`cloudWorkspace` 只共用原有選雙片→匯出／真下載→完整snapshot核對；原第81案的單byte錯檔與恢復斷言完全保持。共用connect新增明確同頁重連參數，沿已載入設定但仍真正點連接、再經同一合成授權生命週期；原首次連接與core模式不變。

公開操作的可核對結果：

- 基準有1 take、1 recipe、1 export；兩側未撤銷Blob URL的完整SHA等於實際輸入，已存舊VS的bytes/SHA等於真下載。完整library、全部媒體鍵／SHA、來源／播放器狀態及成品連結，從probe前到斷開、重連後逐項相同。
- 上傳一份工具產生的文字probe，供應商真正接收bytes且內容／SHA吻合operation；公開「讀回」成功。遠端完整metadata、全部bytes/SHA與permission清單作獨立基準，整段不變；本案permission清單為空，沒有代驗已公開連結。
- 中斷後公開帳號顯示未連接、root選項清空、傳輸／讀回／位置及中斷按鈕停用，連接按鈕可用。重新明確連線後root仍空，必須重讀並明選原root；再讀回同probe成功。
- 再按probe，localStorage工作account/root/id/operation/hash等完整相同，遠端仍僅同一小檔，upload POST數保持1，不新增副本。這是合成供應商同頁重授權，不是實體跨裝置或真Google憑證驗收。

正常 `bun run check` **760 pass／0 fail／4,383 expects**，公開掃描／型別／lint／build通過，原19項lint info保留。獨立 `scripts/verify-cloud.ts probe-reconnect` 首次通過，0頁錯、原CLI仍有core／pending-recovery模式，自有程序正常exit0並按nonce釋鎖。獨立輪前後下載各36,667bytes／SHA `bc1b254fb11651cc008d8fefa6384e06b4bfe27e0ce872b8294e1acc66b835d6`，不與插樁輪拼成同一對。

本機Bun1.4.4／macOS arm64／Chrome156.0.8078.76 headless，原runner同輪選第81及82案 **2／2**：pending-recovery **4,997ms**，新probe-reconnect **3,835ms**，0頁錯；browserClosed／serverStopped=true、lockRetained=false。原81名稱／順序保持，新案只加最後第82。`coverage/app-hyqzc4/` 同來源單元／VM→加入兩個公開案為行 **1,231／3,357（36.66%）→2,118／3,357（63.09%）**、函式 **418／1,127（37.08%）→639／1,127（56.69%）**、分支 **1,386／3,713（37.32%）→1,917／3,713（51.62%）**。這是選定兩案，不是完整82after。cloud-ui本輪行79／79、函式29／32、分支42／57；函式／分支未全覆蓋，不能把行100%冒稱全App已完成。

新第82案實際前後下載各 **36,667bytes**，同SHA `7f57a210d1e16fc8bd28be013d768586eebd9cb6933a980bfb67bf5c8d27f044`。關閉產品頁與主機後，另以FFmpeg -xerror全檔解碼兩份各exit0（H2641280×720／60 video frames、AAC93 audio frames）；離線context拒絕HTTP，從file:各播到 **1.999967秒 ended**、60frames／0dropped／0media error，0頁錯，瀏覽器與nonce正常收尾。離站收據SHA `c7bf3974c6728d3241cfe6b1a61c58f11d75d8c57360688fc3c5bdf3d1c796ca`，不是人耳或整套同步矩陣驗收。

重跑：先原 `bun run check`，CLI `bun --no-env-file scripts/verify-cloud.ts probe-reconnect`；選定 `bun --no-env-file tests/app-coverage/run-app.ts cloud-pending-recovery cloud-probe-reconnect`；完整原 `bun run test:coverage:app`。run.json SHA `ce86e183c2b51df39c00da52de8855d628babc1e9953419856c773c868b6b1d3`、完整計數器 `a7019c27df366a4c7589e66b5671cd6905492947fd0fe5e04d29f253ed31c7c5`；共用入口 `20422f153068a42016aeef38e9047ae99ecc0ef7949a8fd6a014abd11ef4006c`、workspace／pending helper `8587b41e2eab853017f6962b37ef2a415dbc9a6e8027659a84ca061ca9059535`、probe helper `bc00444f2f52d65642f21ae7d9e2e8010d9b5bba686a92fd0176dd8bd780a325`。raw、合成媒體留ignored，完整CI依本票提交head另記，不預勾；前置審查／合併另依既有gate，不修改已交付head。真OAuth／Google、自然離線、Safari／私人模式、實體跨裝置、真人聽感及完整G1–G7未驗證，#103／#209不結案。

### #231 的24模組完整80案CI收尾（與本票選定兩案分開）

[CI41493583378](https://github.com/sunpochin/dance-stamp/actions/runs/41493583378) 固定 #231 head `671a5b3bc94e636a724a5bf778fc92ee7e266de9`。協調者核對原80案／80個不同名稱、0FAIL及所有必要checks成功；本票另只讀其report ZIP核對digest `ebb64137ddcea21704c95985d5b4fbd35111d42a44c1eee97c2d1cae7803a362`、summary來源／80案／24份SHA，並與本輪24份產品SHA逐一相同。完整行 **3,298／3,357（98.24%）**、函式 **1,068／1,127（94.76%）**、分支 **3,199／3,713（86.15%）**，skipped0，仍缺59行／59函式／514分支。這是完整80案來源的結果，與前面局部兩案、舊21模組結果各自保留，不把CI成功或來源相同代簽合併／真機／指定終審。

## 2026-11-03 待傳工作在新頁重新選檔恢復（#232）

白話：練舞影片傳到一半遇到錯誤，關頁後仍能找到同一件待辦。選錯影片不能繼續；選回原來兩支片後會接著完成，不多存一份。這次確認原有流程已正確，再加上自動回歸，沒有修改產品或宣稱修到產品缺陷。

來源為正常保留 #231 `671a5b3bc94e636a724a5bf778fc92ee7e266de9` 前置，再同步 main 的 #228 原生音訊證據到 `a5114d91c57f351b4a3d1a8e4884e7c4d4ed9e41`，加本票未提交測試，`trackedChanges=true`。全部 **24 份 `web/*.js`** SHA-256 與此來源逐一相同，靜態 CLI 建置仍 `07cdd7b66289af39`。前置 #230 含產品修正，合併及指定獨立終審仍各自依授權處理，不把這次通過寫成已核准合併。

技術：沿同一個 `runCloudScenario` 的隔離 context、合成供應商與公開 UI，新增 `pending-recovery` 模式；原 core 模式與 CLI 保留。真正頁面 fetch 已完成兩份媒體上傳，快照 manifest 的 POST 傳輸邊界只回一次受控 HTTP 503，尚未建立 manifest。這是合成供應商錯誤回應，**不是實際斷網或真 Google 故障證據**。URL 觀察器只轉交原生 createObjectURL／revokeObjectURL，保留真正 Blob 供讀取 SHA；不放寬原 CSP 的 connect-src。

公開流程及保全斷言：

- 選雙片並產生舊 VS，再預覽雲端保存；基準有 1 take、1 recipe、1 export（不宣稱有手寫筆記）。兩側實際 Blob URL 未撤銷，原片雜湊等於輸入；已保存 VS 的非空 Blob 等於真正下載檔。
- 503 後本機完整 library、全部媒體 SHA、兩側來源／時間／暫停／速率及舊成品連結與基準完全相同；再次點下載取回相同 bytes／SHA。
- 真正關閉原頁，在同 context 開新頁：IndexedDB 資料保留，兩側 session 原片 src 已不存在。重新連線同一合成根目錄，點「中斷工作的恢復」→「列出待傳工作」→選唯一原工作。
- 同名錯內容從真正檔案欄位選入，按重試遭拒；本機資料及遠端 ID 均不變。重新選回兩份原檔後，以同 operation、dataset、snapshot、manifest ID 及 media fileId 完成，遠端僅原兩份媒體與一份快照。再按一次重試不新增遠端項目或 upload POST。
- 待傳 work 的診斷以現有 openStore 加原生 readonly IDB transaction 讀取，避免測試自行呼叫待驗證的 readCloudWork。最終插樁收據該函式由單元基準 **0 次→公開流程 6 次**；來源與完整位置表不變。

Bun 1.4.4／macOS arm64／Chrome 156.0.8078.76 headless，原 `bun run check` **760 pass／0 fail／4,383 expects**，型別、公開掃描、lint／build 通過，原 19 項 lint info 保留。獨立 `bun --no-env-file scripts/verify-cloud.ts pending-recovery` 通過，0 page errors；自有測試程序 exit0 後按 nonce 釋鎖。其下載前後均 **36,752 bytes**，SHA-256 `dc296fdd92bcbd71c11be65ff88607cce5be6605ad07cdb068cf0e1bad460056`。

同一最終選定輪 `coverage/app-fu8z11/`：`cloud-pending-recovery` **1／1、5,060ms、0 page errors**，`browserClosed=true`、`serverStopped=true`、`lockRetained=false`。原 80 案名稱與順序保留，新案只追加第 81；完整所有檔案、門檻、來源校驗與下載守門均保留。同輪單元／VM→加這一案的行數 **1,231／3,357（36.66%）→2,100／3,357（62.55%）**，函式 **418／1,127（37.08%）→633／1,127（56.16%）**，分支 **1,386／3,713（37.32%）→1,907／3,713（51.36%）**。這是選定單案，**不是完整 81 案結果，不與舊 21 模組完整百分比混算**。本輪真正下載前後各 **36,678 bytes**，同 SHA-256 `8eaa37dd0f7754db8fd8dabde2c2fb663bbf424045ee22f043f50254b548d52d`；不同輪的編碼 bytes 不拼成同一對。

取得第一路正常收尾交還的 nonce 鎖後，只讀上述插樁輪兩份真下載另行離站檢查：各為 H.264 1280×720、60 video frames、AAC 93 audio frames，FFmpeg `-xerror` 全檔解碼各 exit0。另建離線 Chromium context、拒絕 HTTP，從 `file:` 頁各播至 **2.0006 秒 ended**，60 frames／0 dropped／0 media error；無產品頁、0 page errors，瀏覽器正常關閉並釋鎖。這是兩秒合成成品的可讀／保全證據，不冒稱真人聽感或整套同步矩陣。離站收據 SHA-256 `741fcf103be9a64cb4173af9e8a1e08a7b26fd9743864d726f18acfa77d924df`；只讀核對腳本 SHA-256 `d633d69c6cc7852434150724f3dbd33cd2831d955a65d20872f64d9e3adc6f74`，均留本機 ignored／暫存。

失敗歷史保留：第一輪診斷誤用 fetch(blob:)，在原 CSP 先被拒，尚未注入傳輸錯誤；改為轉交原生 URL 的 Blob 觀察。第二輪預期過於具體的錯誤文案，實際 503 回到原 GoogleDrive.request 的「雲端操作未完成，原工作可重試。」；核對 owning source 後改成精確既有文案，未改產品或降低時間／保全門檻。兩個是測試前提／斷言問題，不冒稱產品先紅後綠；raw 日誌及第二輪合成目錄留本機 ignored／暫存。

來源重跑：先 `bun run check`，局部 `bun --no-env-file tests/app-coverage/run-app.ts cloud-pending-recovery`，完整原 `bun run test:coverage:app`。最後 run.json SHA-256 `ec8db1bd7284f75d54bb4c537c958fa3ba7260fc2d2db83d627cb84bb93ffbc6`、完整計數器 `f678b63e166cfa656fe3ebf72ae7592c18bc7b6ca341bb5e0f16fafe011f0352`、共用腳本 `eb717b1302095221f6394fc09ea42461236bcad59f9830e55aecb3a209dfec0a`、新 helper `15b29fe489096d031228956c2b377cda4255838409946c95ac5f211a25cf3bda`。完整 CI 要以本票提交 head 另記，不能預勾成功；#103／#209 不因單案關閉。真 OAuth、真 Google、自然離線、Safari／私人模式、實體跨裝置、真人相機與聽感、完整 G1–G7 未驗證；不登入帳號或讀私人媒體。

### #234 獨立審查後補強：兩片齊全且僅一 byte 不同

白話：先前測試同時有「選錯內容」與「少選另一片」，無法單獨證明產品認內容。現在兩片都選好，老師片保持原名稱、大小與 MIME，只把原 bytes 複本最後一個 byte 翻轉；自己片提供完全正確原檔。這是審查後把檢查變精準，不是產品缺陷或產品修正；上一輪只當作複合錯誤拒絕，內容校驗採本段新證據。

受測來源為已交付 `5ea89b6369be1c89a3f887fbd8b97784a084cb51` 加未提交補強，`trackedChanges=true`；原24份產品SHA及位置表完全相同。公開重試仍拒絕，遠端ID、upload POST數與整個新頁snapshot（完整library、全部媒體SHA、來源／成品狀態）均不變；之後選回兩份正確原檔，原同工作／資料集／遠端ID流程成功，再次重試不重複上傳。真正 readCloudWork 單元0→公開6次。

新選定輪 `coverage/app-bbBSXL/` **1／1、5,037ms、0頁面錯誤**，browserClosed／serverStopped=true、lockRetained=false。單案行2,100／3,357、函式633／1,127、分支1,907／3,713，分母／原80案與第81序列不變，並非完整81結果。正常 `bun run check` 及提交hook仍沿原入口，760 pass／0 fail／4,383 expects、原19項lint info保留；產品靜態07cdd7b66289af39。

獨立CLI亦通過，兩份下載各36,792bytes／SHA `0ea3738bf1c21c7b7fb94d78ede8eb4c881c96b1bbbdff2632bcedfc417735b6`，與插樁輪分開。新插樁輪真下載前後各 **36,679bytes**／同SHA `25389a3f80f8bf5c73240f6630508923ce0cdaa174838f766d96748c0004fd91`；兩份另以FFmpeg -xerror全檔解碼exit0（H264 1280×720／60 video frames、AAC93 audio frames），file:離線各播至 **1.998967秒 ended**、60frames／0dropped／0media error，0頁錯，正常關閉與nonce釋鎖。這些是新輪結果，不沿用前段舊成品hash。

新helper SHA-256 `6e82f93ed239a5e0dc2b772cfa3b20aa177c7ec31861cfc04f11703ac47278a3`；run.json `9baed55d98ba035f1c625ac542ad6b745cbaec4aa8598f29b342f3c1934af41c`；完整計數器 `039e72b06d34a0cffb6fc4fbdc09466dcb9b125352422cfa3eda3f72d8cf86e4`；離站收據 `3c589941217e22cc3b89e5e732045877012f28789f2e529232e6966f98025a08`。原始資料留ignored／本機暫存，來源、原生／真Google／跨裝置未驗證限制仍照前段。完整CI綁追加提交後head另記，未預勾。

## 2026-11-03 節拍器與真正 Worklet 量測（#226）

白話：節拍器也是產品的一部分，因此檢查表真的選片、找速度、播放和取消；負責算音量的小工具另外直接跑原程式，確認取消不交出半份結果，超過二十秒也不繼續長大。兩邊共用原檢查，不另寫一套節拍器。

前置為 #224 `c9558ff5c01035ad7379d2df425f17c365bca74f`、#225 `ec5106a0a43be97de82792bd48a51669f51ad4a5` 及 #230 `496af41a258c603d056e11ac718e1cab7ef5bd96`，均以正常 Git 來源保留。#227 的準備中取消缺陷先獨立修正，不混在本票純測試接線；設計與紅綠紀錄見 [TECHNICAL #227](../../TECHNICAL.md#227-分析準備期間的媒體取消)。本機選定輪產品來源為正常整合 `ad941dc8eee3ba4019249f38589d3d67f93db78e` 加未提交測試，`trackedChanges=true`。後續同步已合併 #224 的 main 到 `59d1bb287d141ae4df0751886f762ddf9be6203d`，全部 **24 個 `web/*.js`** SHA-256 與受測輪逐一相同；不把來源相同改稱提交後乾淨重跑。

技術：`verify-metronome.ts` 抽出 `runMetronomeScenario`，瀏覽器與來源由建立者提供；明確以 `newContext().newPage()` 建頁，彈出工具及獨立直開頁也經原收集器。原 CLI 仍建立自己的瀏覽器／主機；匯入共用函式不啟動它們。原 79 案名稱與順序保留，尾端新增 `metronome-integration` 第 80 案，沿同一份原生二十秒 120 BPM、工作台雙片保全、noopener、直開、控制、背景處理、320px、取消重試及 #227 八案。後者收據包含真正原生 promise 的 settlement，不把短暫等待當舊工作已結束。

`tempo-worklet.js` 位於獨立 AudioWorklet 全域，不能拿頁面計數替它作證。本票沿現有 `sourceForVm`／`vmCoverageContext` 執行真正註冊的 `TempoEnvelope` 類別，僅提供訊息埠與固定合成 sampleRate；核對雙聲道原聲通過、缺聲道／無輸入、RMS、stop 只交付一次、cancel 不交付、重開不沿用前次 requestId／半桶樣本，以及 2,000 包絡上限後原聲仍通過且不再累積。三個既有 BPM 單元加三個 Worklet 邊界單元共 6／6、212 斷言。這是 VM 邏輯證據，原生 worklet 能力另由瀏覽器真正解碼／分析確認，不宣稱已擷取 AudioWorklet 原生 scope 計數。

Bun 1.4.4／macOS arm64／Chrome 156.0.8078.76：原 `bun run check` 通過 **760 tests／4,383 expects／0 fail**，公開掃描、型別、lint、build，原 19 項 lint info保留，產品靜態仍 `07cdd7b66289af39`。選定 `run-app.ts metronome-integration` **1／1、26,262ms、0 page errors**，六個延遲等待全部真 fulfilled 後仍保持取消；兩個合法初始化與原完整功能皆通過。收據 `browserClosed=true`、`serverStopped=true`、`lockRetained=false`，自有 nonce 已釋放。

同一選定輪的 24 檔同來源、同位置表數字如下；左欄是本輪單元／VM，右欄才加入單一節拍器情境，**不是完整 80 案結果**：

| 範圍 | 單元／VM | 加入節拍器公開流程 |
| --- | --- | --- |
| 全 App 行 | 1,231／3,357（36.66%） | 1,982／3,357（59.04%） |
| 全 App 函式 | 418／1,127（37.08%） | 572／1,127（50.75%） |
| 全 App 分支 | 1,386／3,713（37.32%） | 1,825／3,713（49.15%） |
| metronome.js 行 | 0／129 | 125／129（96.89%） |
| tempo-worklet.js 行／函式／分支（VM） | 16／16、4／4、19／19 | 同樣 100%，不當原生 scope 收據 |
| tempo.js 行／函式／分支 | 30／30、15／15、41／45 | 100%／100%／91.11% |

原獨立 `bun --no-env-file scripts/verify-metronome.ts` 在抽取後亦完整通過，六份 startup 原生等待皆 fulfilled、兩正例及原二十秒分析／工作台保全全部通過，零頁面錯誤；自有測試子程序 exit0 後依 nonce 釋鎖。其日誌 SHA-256 `71d2d48da1830d22f77b50c7a32894182fe9c4691ae90a17ba716e4830a5f100`；不與插樁輪混成另一個完整 80 案結果。

原始選定收據 SHA-256 `d23ad7f63d0ddc9d0a9027113880a09ffbb8b0934496777abc2da786826f1d3b`，完整計數器收據 SHA-256 `07c2968d1c3ccf1aeafb5c863c7e3869f04e8f3764db3b8c31d9c0e053ae1bf9`。合成素材、raw 與截圖留 ignored 目錄，不公開音訊或私人媒體。重跑先原 `bun run check`，局部用 `bun --no-env-file tests/app-coverage/run-app.ts metronome-integration`，完整用原 `bun run test:coverage:app`；原下載、badge 的完整矩陣／乾淨來源守門保持。原生 Safari、手機、真人聽感、完整 G1–G7 未驗證，#103／#209 的原完整目標不結案。

### #224 的 21 模組完整 CI 收尾（與上表分開）

[CI 41488467616](https://github.com/sunpochin/dance-stamp/actions/runs/41488467616) 固定 head `c9558ff5c01035ad7379d2df425f17c365bca74f`，原 78 案加最後 cloud-integration 共 79 個不同名稱全部成功，全部 21 份產品 SHA 對上來源；行 **3,127／3,182（98.27%）**、函式 **1,014／1,066（95.12%）**、分支 **3,034／3,506（86.53%）**，skipped=0。協調者另下載 ZIP 並核對 GitHub digest `a5013d429107a9b6a584a2324eec6f2bf1299ea862eb5c18413ee125e5dd73e5`，逐項核對精確 head、完整矩陣、下載與必要 checks 後合併 #224 為 main `4e52e604deeb89b73abafcd2d28aaacaa4fc0c2b`，#222 自動結案。這個 21 模組來源的 before／after 是 92.89%→98.27% 行、86.30%→95.12% 函式、83.45%→86.53% 分支；不能與新增節拍器後 24 模組的選定輪混算或代簽完整 80 案。


## 2026-11-03 雲端公開流程接入同一 App 量測（#222）

白話：雲端功能已經加入產品，檢查表也要真的點過保存、接續與分享。這次把原本獨立跑的同一份檢查接回總檢查，不另寫一套流程，也不把沒有測到的檔案拿掉來提高數字。

固定基線為 main `83220edabd90cab274532900763c4ff696dffdc5`。[該版完整 CI](https://github.com/sunpochin/dance-stamp/actions/runs/41473945359) 已包含全部 **21 個 `web/*.js`**：行 2,956／3,182（92.89%）、函式 920／1,066（86.30%）、分支 2,926／3,506（83.45%）。取得其 `app-coverage-report` 的 `summary.json`／HTML 後，逐一比對本輪全部 21 份產品 SHA-256 相同；GitHub artifact metadata 的 digest 為 `a8c4342ab6cf3559b7abdf508e335392f4c60415468adfbb7c52d1f7f5ebfe2e`，本輪未另下載原 ZIP 重算該 digest。原報表可見雲端 UI 大量未覆蓋，原因是原 `scripts/verify-cloud.ts` 尚未進同一輪插樁，並非分母遺漏。

技術：原腳本抽出 `runCloudScenario(browser, origin, out, buildVersion?)`，獨立 CLI 仍建立自己的瀏覽器／靜態主機；完整量測則注入原插樁瀏覽器及來源，在原 78 個情境之後追加第 79 個 `cloud-integration`。新建 context 經原 `newContext` 包裝，關閉前仍收集 coverage；原 statement／function／branch 位置表、來源核對與完整分母全部保留。共用情境只關閉自己建立的 contexts，瀏覽器／主機由各入口收尾；匯入共用函式本身不啟動瀏覽器或主機。完整量測使用插樁資源，未提供實際 buildVersion，不把缺省值當正式建置識別。

原公開 UI 斷言完整沿用：合成供應商授權／背景往返、雙片保存與讀回、session-only 原片在新頁真正從 IndexedDB 讀回 SHA、另一隔離 context 預覽／下載／原子接續、父版本與缺片、切換版本清除舊確認、獨立成品分享與確認、permission 收據 PATCH 未送達後重試補送／撤銷、390px 及 Escape 回焦點。供應商端點全部為受控合成回應；沒有真實 OAuth、帳號或私人影片。

本機 Bun 1.4.4／macOS arm64／Chrome 156.0.8078.76：

- 原 `bun run check`：754 pass／0 fail／4,141 expects，公開掃描、型別、lint、build 通過，保留原 19 項 lint info，靜態仍 `83a29a61027b205d`。
- `bun --no-env-file tests/app-coverage/run-app.ts cloud-integration`：選定 1／1，6,906ms、0 page errors；`browserClosed=true`、`serverStopped=true`、`lockRetained=false`。來源如實為上述基線加未提交測試修改，不冒稱乾淨提交重跑。21 份產品 SHA 與基線完全相同。
- 此選定輪共用單元基準後，cloud-ui／cloud-practice-ui／cloud-share-ui／cloud-auth 行數分別為 77.21%／88.07%／86.66%／96.42%；整體為 2,173／3,182（68.29%），**這是一個情境，不能與原 78 案的 92.89% 比成整體退步或提高，也不拼加報表**。完整第 79 案後數字以確切提交的 CI 另記。
- 原 `bun --no-env-file scripts/verify-cloud.ts` 亦完整通過、0 page errors；獨立 CLI 收據有真建置 `83a29a61027b205d`，不與插樁輪混用。所有既有公開操作／資料保全斷言保持，兩路只共用同一函式。
- 插樁收據 `run.json` SHA-256 `b42868a90284ea1fb2d6490b59188edef8fed884acf364027f11854f106ea7e9`、完整計數器收據 SHA-256 `5738f878b9c7e55d52e50759847a234e90bbd7e87718bee6dbab10dff990798f`；原始合成素材、截圖與收據只留 ignored 目錄。

重跑先 `bun run check`，局部用上述選定命令，完整用原 `bun run test:coverage:app`；原下載離站驗證與 badge 的乾淨來源／完整矩陣守門照舊。尚未達 100%，且此接線不新增原生 Safari、真 Google、匿名實播、實體裝置、真人聽感或完整 G1–G7 證據，#103／#209 等原驗收保持開啟。後續若納入節拍器等新產品檔，必須自然加入新分母、重新量測，不能移用這份 21 檔數字。

以下為 2026-10-30 的九檔歷史來源，數字與當時環境保持原歸屬。

2026-10-30，從 main `5078401dd1dea60050a9961e34cb499a274e3183` 建專用分支，承接既有未提交的量測工作。受測為該基線加本輪測試／工具的工作樹，`trackedChanges=true`；九份產品 `web/*.js` 與該 main 完全相同。後續只補文件、CI 及授權索引，不將本機工作樹結果改稱乾淨提交實測。Bun 1.4.4、macOS arm64、Chrome 156.0.8078.76 headless；只使用合成影片、假相機及獨立瀏覽器 context。

完整輪後納入既有 [PR #105](https://github.com/sunpochin/dance-stamp/pull/105) `d491917052d8fb7b4c5bc8bafa937af5208ab1df` 作前置，沿用其鍵盤焦點修正與原始證據；本輪只在該案例增加可見性與真正 Enter→FileChooser 的檢查。納入後的九份產品程式及本輪實際執行的瀏覽器案例與受測工作樹相同，不把 #105 自己的媒體數字移記為覆蓋率證據。遠端 CI 另綁提交後 head。

## 口徑與結果

原 #99 的 Bun／LCOV 只統計其載入模組，不能與本表直接比較。以下兩欄來自**同一候選、相同九檔、同一套 Istanbul 位置表**：先合併本輪補測後的單元／VM，再合併同輪 35 項瀏覽器流程；左欄不是原 main 的歷史覆蓋率。加總各檔 covered／total，不平均檔案百分比，也不混入 harness 或不同引擎的計數。

| 指標 | 同輪單元／VM 基準 | 加入瀏覽器後 |
| --- | --- | --- |
| 行數 | 742 / 1,982 = 37.43% | **1,953 / 1,982 = 98.53%** |
| 函式 | 272 / 670 = 40.59% | **635 / 670 = 94.77%** |
| 分支 | 798 / 2,146 = 37.18% | **1,836 / 2,146 = 85.55%** |

| 檔案 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| `web/beats.js` | 100% | 100% | 100% |
| `web/library.js` | 100% | 100% | 95.86% |
| `web/local-audio.js` | 100% | 100% | 91.44% |
| `web/main.js` | 97.7% | 92.38% | 79.09% |
| `web/offline.js` | 100% | 82.6% | 100% |
| `web/recorder.js` | 100% | 100% | 94.11% |
| `web/storage.js` | 99.03% | 95.23% | 89.28% |
| `web/sw.js` | 100% | 100% | 100% |
| `web/timeline.js` | 100% | 100% | 100% |

未達 100%。主畫面尚缺相機錯誤、VS 系統分享、特定刪除／失敗與 owner 時序等路徑；儲存尚缺升版失敗分支，離線模組仍有未執行函式。JSON 同時保留每檔未覆蓋行／函式與完整分支位置、各分支計數，沒有忽略低分檔案、刪除護欄、改分母或設低門檻來宣稱完成。

## 工具與有意義的驗證

- `test:coverage:app` 先準備缺少的合成素材，再以相同插樁合併單元 import、VM 的 storage／SW 及隔離 Chromium。列舉全部 `web/*.js`，未載入者仍留在分母且為零分；每輪獨立目錄，下載只寫入本輪副本。
- 收據固定九檔 SHA-256，另核對 statement／function／branch 位置表與非負整數計數；拒絕其他版本、未知檔案、錯位或負數收據。空的新頁面計數不能清掉舊頁面已執行的內容。
- 真正的頁內重載前收集 beforeunload／pagehide；重載回歸確認舊頁曾執行鏡像繪製、新頁該處計數為零，而合併報表仍保留它。本輪共收 165 份導航快照。
- 新增真實 IndexedDB 的非法 revision／chunk、重複鍵保留、順序恢復、只清指定媒體與 chunks、不完整 schema 保留、原生 VersionError 後重開；補有拍數倒數的完整假相機錄影、落盤／原片下載及 track 釋放。
- 原操作、動作庫、拍點、分享／備份、取消／錯誤恢復與未確認保存的 Tab／Enter 救援仍使用既有案例。加上最新左右選片與疊影回歸；新版鍵盤入口實際按 Enter 開啟 FileChooser，不要求焦點停在已隱藏的檔案欄位。
- WebKit 音訊條件案明確以 Chromium 選擇該分支，驗真正 AudioDecoder、WebM、能力拒絕保留前次 VS 及重試；它不是原生 Safari。逾時／原生通知缺失的單元案只壓縮等待，不偽造成功通知。

完整輪：**642 tests／3,109 expects／0 fail；35/35 瀏覽器案例，0 page errors**。正常品質入口、原單元覆蓋率、打包校驗及提交 hooks 另外執行；遠端結果以 PR 同一 head 的 Checks 為準。本機 Playwright close、自有主機 stop 均成功回傳，自有 nonce 鎖已移除；不將這個收尾觀測冒稱逐個 OS PID 的原生退出證據。

## 重跑與來源

先依根文件安裝指定 Bun，執行 `bun install --frozen-lockfile --ignore-scripts`。本機須有 FFmpeg 與 Chrome；可用 `DANCE_STAMP_CHROMIUM` 指定已安裝瀏覽器，不自動下載。一般入口：

```sh
bun run check
bun run test:coverage
bun run test:coverage:app
bun run package:web
bun run check:package
```

每輪 `coverage/app-*/` 產出 `run.json`、`baseline.json`、`app.json`、含原始位置表的 coverage 收據及 `report.html`。HTML 可直接看總表與紅色未覆蓋行；raw、下載、合成素材及導航快照留 ignored 目錄，不公開附件。CI 保留原兩個 job，另以相同入口執行完整 App job；任何案例或未處理例外失敗均回非零，高覆蓋率不能抵銷失敗。

本輪 runner SHA-256：`7c2c687dc01de9d93df8784771ea9acbc91f467848d745756a662b6a8b8b5c01`；成功 `run.json` SHA-256：`181a459c2fe901a1d3c3b5d76536dfb52fb5e39bb5e03c446263b5403b45e378`。收據包含完整產品 SHA、執行環境、單元基準、各案例與收尾狀態。

首輪受限執行環境的本機 listen 被拒絕，未修改測試放行；取得本機測試服務權限後原 check 通過。第一次完整輪 34/35，舊鍵盤焦點斷言使整輪明確失敗；修正為新版真正選檔操作後，單案與上述完整重跑通過。失敗 raw 保留，不與成功輪混記。

遠端首輪 CI 的 harness 與 linux-install-restart 已成功；新 App job 因 Ubuntu image 缺少 FFmpeg，在啟動測試前被工具前置檢查拒絕。後續只在該 job 安裝合成素材所需的發行版 FFmpeg，不跳過檢查、不將編碼器或測片放進產品下載包；完整結果依新 head 的 Checks 續驗。

## 驗收界線

此數字僅涵蓋九份 App JavaScript 的插樁工程測試，未涵蓋 HTML／CSS、產生器、主機或全 repo 的覆蓋率。原 Bun 報表繼續獨立產出，新增量測 helper 後也不可沿用 #99 的舊分母數字。

未重跑原生 Safari／私人模式、完整影音 G1–G7、產品外媒體品質、自然低空間／斷電、真人相機／聽感、VoiceOver、五人操作、觸控或跨實體裝置。iPhone 與真人／實體裝置驗收繼續暫緩；不因行數接近 100% 關閉 #103、其他未驗收票或代替獨立審查／發布核准。

## 2026-11-03 最終候選完整 CI 收據與接手條件

白話：整合版的 83 項檢查及 12 份下載影片都通過。這張收據只屬於下面那一版；還要完成指定審查，才能合併並逐票結案。這段把最後結果留在專案裡，避免換聊天後只看到先前「待 CI」的紀錄。

[PR #240](https://github.com/sunpochin/dance-stamp/pull/240) 受測 head 為 `36c79e34b6e676e73cecfea76971270c94529846`，正常 merge parents 為 `5fb34aeb1e49e6cbede4b45bc21641a77f80c9aa`、`2e37703d2dd2c352763ce4d39f95d75f306c8dd9`。產品、測試與前置提交均保留；本段是後續文件收據，不把結果移記為文件分支重新實測。

[完整 CI 41507321339](https://github.com/sunpochin/dance-stamp/actions/runs/41507321339) 的 harness、linux-install-restart、app-coverage 與 Workers Builds 成功；badge 依 PR 條件略過。83 個不同頂層情境、0 FAIL，原 82 案順序保持；原 follow-runtime 另含第 12 個原生影格傳輸拒絕子情境。同輪 2 份 storage-version 加 10 份 follow 下載，在關站後由 file 自然播至 ended，media error／dropped 均 0，音軌及全檔解碼通過，自有 PID 與 nonce 完成清理。這些 CI helper 沒有另明確斷網，不稱為自然離線驗收。

[完整報告 artifact 13172424688](https://github.com/sunpochin/dance-stamp/actions/runs/41507321339/artifacts/13172424688) ZIP SHA-256：`18be99b0e6458bd1b5ff6208d47fa5b43c3df5e849fce92b2293642a8a7c52e7`。協調者重新計算 ZIP digest，核對 summary 的來源／83 案及全部 24 個產品 JS 雜湊均吻合精確 git 來源；80 案與 83 案的 24 份產品雜湊逐份相同，完整同分母前後如下，skipped 均 0：

| 完整情境／來源 | 行 | 函式 | 分支臂 |
| --- | --- | --- | --- |
| 80 案，`671a5b3bc94e636a724a5bf778fc92ee7e266de9` | 3298/3357（98.24%） | 1068/1127（94.76%） | 3199/3713（86.15%） |
| 83 案，`36c79e34b6e676e73cecfea76971270c94529846` | 3335/3357（99.34%） | 1084/1127（96.18%） | 3226/3713（86.88%） |

剩餘 22 行、43 函式與 487 分支臂，逐檔缺漏仍完整列在報告。原 #103 要求完整分母、前後基準、逐檔缺漏與有意義行為驗證，沒有新增所有數字 100% 的結案條件；不混入 21 模組或局部案例計數。#234 原 81 案雖完成量測及成品，整場仍因 25 分鐘取消，原失敗紀錄保留；本次成功不改寫該次結論。

指定重要產品審查仍待使用者：Claude Code 的 OAuth 已過期，本輪未取得其審查；Codex 已完成來源與證據審查，但沒有自行取代指定審查。接手先核對 #240 最新 head、checks 與未解意見，取得使用者審查或明確同意替代方式後，才依原合併授權整合，並對原票逐一判定。#209 依使用者答覆暫緩；#229 的下一個原生 Safari cohort 因 Mac 鎖定而未開始，待手動解鎖。真人、Safari／實體裝置與 G1–G7 各按原範圍保留，不由這次 CI 代簽；沒有發布。
