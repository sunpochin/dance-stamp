<!-- 檔案用途：記錄整合後桌面 Safari 可自主完成的媒體／保存驗證與真人缺口。所在層：固定版本的匿名驗收證據。主要關聯：RECORD_COMPARE.md、ACCEPTANCE.md、issues #3／#9／#11／#13／#14。 -->
# 2026-10-31 桌面 Safari 自主驗證

先確認 Safari 能把錄下的影片完整留下、做成左右比較片，再由舞者確認全身是否清楚、聲音是否好跟拍。本輪不用你的私人影片或實體鏡頭；用知道正確時間和聲音的測片，量出工具自身的誤差。真人操作、聽感與裝置結果仍分開記錄。

一般模式九種錄影、九種雙片合成及四種保存尾段保全通過；但連續十輪在第五輪合成中止，私人模式也沒有成功合成 VS。這兩項未通過；另保留前景操作的準備逾時。原片與筆記保全成功不能替這些失敗簽收，整體 Safari／P0 尚未驗收。

## 來源與方法

- 產品來源固定 main `e6f0300aa9ce1c882ec1887f5f792ee8fe6b63de`，靜態 `4525b1293b89a584`；Mac16,11／arm64、Safari 27.0.1／macOS 27.0.1、Bun 1.4.4。產品檔案保持此版原樣，沒有合併、發布、重置資料或改驗收門檻。
- 原生 SafariDriver 已成功建立及刪除自己的 session，沒有更改遠端自動化、Profiles、隱私或日常瀏覽器設定。每組獨立測試使用新 loopback origin、自己的視窗及原子共用媒體鎖；只在核對自有 nonce／程序群組退出後放鎖。
- 沿用既有原生產品／生命週期 QA 的本聊天副本；產品 HTML 只在測試回應加前置觀察器，產品 JS／CSS bytes 逐檔核對。錄影只替換為 Canvas 合成相機；HTTP Permissions-Policy 禁止實體相機／麥克風／畫面擷取，getUserMedia 只接受 audio=false，非相機流程全部拒絕擷取。
- 素材使用本版 `make-sync-fixtures.py --reference-only` 的 65 秒逐幀碼／閃光／660Hz 音訊；雙片的自己一側由相同原片按固定比例建立，音軌換為 880Hz。無真人、私人課程或第三方音樂，原始資料／影片／完整收據僅留 ignored output。
- 同步、音訊、完整首尾、停格、fps、成檔和效能仍用 [RECORD_COMPARE.md](../RECORD_COMPARE.md) 與未修改的 `scripts/analyze-media.py` v5。合成相機不是實體光學時間校正；v5 也明示不是實體相機 G2。

## 錄影九案：pass

同一 session／資料庫，三速度 × 15／30／60 秒全通過。每次保留完整原片並獨立解碼，核對到 B 才停、所有 tracks ended、無麥克風請求、一般練習 2×／音高／非靜音恢復，以及下一次播放沒有回跳；每輪舊資料與全部舊媒體完整 bytes／SHA 保留。±100ms 原門檻不變。

| 速度 | 實際錄影秒數 | 原片長度誤差 ms | 到 B 停／下次播放／保全 |
| --- | --- | --- | --- |
| 0.75× | 15 | 18.333 | pass |
| 0.5× | 15 | 28.333 | pass |
| 1.0× | 15 | 30.000 | pass |
| 0.75× | 30 | 30.000 | pass |
| 0.5× | 30 | 41.667 | pass |
| 1.0× | 30 | 55.000 | pass |
| 0.75× | 60 | 16.667 | pass |
| 0.5× | 60 | 15.000 | pass |
| 1.0× | 60 | 16.667 | pass |

另完成取消音訊解碼準備、取消倒數、明示暫停本輪 AudioContext 三案；原生停止、聲音／decoder 清理、晚到結果不重啟與舊片保留均成立。這是受控生命週期測試，不是來電、鎖屏或硬體中斷。正常重試 0.75×／15 秒也通過。

原片經產品連結真正由 Safari 下載，274,325 bytes；完整 SHA 與當次原片相同。產品主機停止後，原生 file 播放至 ended，15.033333 秒、640×360、error=0，起播由一次 trusted 點擊觸發。沒有將 WebDriver 取回 bytes 本身當成 OS 下載。

## 既有雙片 VS 九案：原 v5 全通過

同一 session／資料庫依序完成九案，全部為 1280×720 VP8／Opus WebM、一音軌。每份真正產品下載 Blob 與 ready export 保存的完整 bytes／SHA 相同，全部舊媒體保留、tracks 結束且擷取請求為零。v5 完整影音解碼、共同配方首尾覆蓋、音訊脈衝對閃光、嚴格遞增影格時間、起中末／漂移及效能全通過。

| 速度 | 秒數 | 起／中／末誤差 ms | 最大聲畫差 ms | 平均 fps | 完整匯出上界秒 |
| --- | --- | --- | --- | --- | --- |
| 0.75× | 15 | [0.0, -11.111, -44.444] | 81.0 | 30.027 | 15.570 |
| 0.5× | 15 | [-83.334, -16.666, -83.333] | 75.0 | 30.029 | 15.579 |
| 1× | 15 | [0.0, 0.0, 0.0] | 43.0 | 30.027 | 15.621 |
| 0.75× | 30 | [-50.0, -44.444, -5.555] | 81.0 | 30.013 | 30.800 |
| 0.5× | 30 | [-83.334, -83.333, -83.333] | 78.0 | 30.016 | 30.685 |
| 1× | 30 | [0.0, 0.0, 0.0] | 43.0 | 30.013 | 30.945 |
| 0.75× | 60 | [-50.0, -5.555, -5.555] | 69.0 | 30.005 | 61.088 |
| 0.5× | 60 | [-83.334, -83.333, -83.333] | 78.0 | 30.005 | 60.933 |
| 1× | 60 | [0.0, 0.0, 0.0] | 46.0 | 30.007 | 61.303 |

最大新增漂移 44.445ms，最長不變影格 152ms；聲音脈衝與閃光數量每案相同。以上是同時鐘合成素材的成檔證據，未代簽實拍、聽感、觸控或手機保存。

## 一般模式 VS 保存尾段：四種核心保全契約通過

使用原 `vs-save-tail.js` 的前置原生交易控制，移到原生 WebDriver 操作；只在真正新 VS 完成、media／metadata put 已收到 trusted success 而交易仍 pending 時按原生 Stop，再解除本工具自己的 hold。沒有改產品停止、保存或回滾程式；遮住通知的兩案是明示注入，不是 Safari 自然故障。

| 案例 | 獨立原生收據 | 產品與資料結果 |
| --- | --- | --- |
| stop-complete | trusted complete | Stop 後仍等提交；新 VS 保存完成，舊三份媒體／metadata 保留 |
| native-reject | trusted ConstraintError／abort | 新 VS 可另存；舊資料保留，同頁正常重試成功 |
| unknown-abort | trusted abort，但刻意遮產品通知 | 退出忙碌並顯示未確認，保留新 VS 下載、拒絕 DB 重試；trusted 同頁重開讀回原資料，新 Blob 不存在 |
| unknown-complete | trusted complete，但刻意遮產品通知 | 同樣先顯示未確認；trusted 同頁重開才依真實讀回確認新 Blob／metadata 已保存，全部舊媒體保留 |

四案皆比對完整舊媒體 bytes／SHA、原片連結／來源、新 VS 的 pending／rescued bytes 相同、recorders inactive／tracks ended；兩個未知狀態在產品明確重開前沒有 QA 另讀 DB。這輪只主張表列契約，不把控制器移植稱為整份 Playwright 函式在 Safari 原樣執行。

上述四案的標記陣列原為空；不據此宣稱非空動作筆記通過。非空筆記與實際下載備份的證據見下方私人模式，不能互換成一般模式的新 VS 保存驗收。

stop-complete 的新 VS 經產品原生連結真正下載，196,570 bytes、3.016 秒、1280×720；產品主機停止後，原生 file 播放至 ended、error=0。播放明示靜音，音訊存在／解碼不代表喇叭或藍牙實聽。

## 連續十輪：第五輪未完成，不通過

同一 session／資料庫，以 1×、每輪 60 秒，真正走合成相機錄影 → 產品合成 → 保存讀回。前四輪各有完整原片與單一有音軌 VS，獨立解碼成功、約 30.005fps、保存 bytes 相同，完整匯出約 61.13–61.20 秒。這是合成長輪，不是實體相機 G6，也沒有把單純解碼當成原 v5 的全部同步門檻。

第五輪原片 60.021667 秒，到 B／下一次播放／音高恢復仍通過；合成約 47.9 秒時，產品依原門檻拒絕：`音訊與畫面偏移超過 100ms，未完成合成；請降低負載後重試。` 此輪沒有新 VS；先前四份 VS、第五輪原片及其餘舊媒體共十一份 bytes／SHA 均保留。第六至十輪未執行，沒有放寬門檻、重跑到綠或把上輪成功的 diagnostics.export 當作第五輪結果。

本機時鐘觀察在約 1／15／30 秒為音訊相對畫面 +18ms，45 秒約 −70ms、47.79 秒約 −98.6ms，隨後觸發保護。這是 JS／原生時鐘觀察，不是已成檔錯位影片的獨立量測；產品拒絕的第五輪沒有完整輸出可供後者分析。本工具未連續記錄前景焦點／visibility，觀察器也有額外負載，因此焦點、節流、負載與工具影響尚未隔離，不能宣稱根因或重現率已確定。

## 真正切換分頁：三個場景有證據，前置失敗保留

| 場景 | 操作與原生見證 | 結果及範圍 |
| --- | --- | --- |
| 預覽 | SafariDriver 開新分頁，trusted hidden | 同步釋放合成 tracks、舊媒體保留，回來不自行重開 |
| 倒數 | 原生 Safari 視窗操作，確實顯示「2 秒後開始」時開新分頁 | trusted hidden、無 recorder start、tracks ended；回來兩次保全比對相隔約 5.4 秒，已超過原倒數終點，仍無自行啟動 |
| 錄影 | 原生 Safari 視窗操作，trusted recorder start，示範已到 4.572 秒時開新分頁 | trusted hidden、tracks ended，原生 recorder stop／dataavailable；中斷片段保存、舊媒體與筆記保留，兩次回來讀回無新增擷取或 recorder |

三案分屬不同前況；倒數是在錄影測試之後，同一原生視窗重開並重新連結，不冒稱原腳本的三階段曾在同一 session 全部完成。倒數案的舊媒體有兩份，錄影案有一份；逐份完整 SHA 保留，原有 metadata 記錄逐項保留。這些是切換分頁，不是鎖屏、來電、OS freeze 或實體鏡頭驗收。

原 SafariDriver 在開始下一階段前逾時，同 handle 與刪 session 也逾時。原生畫面確認為本輪的遠端控制保護提示；只選「Stop Session」並關閉自己的視窗，未選關閉全部自動化，也未修改設定。核對自有 driver／server 程序群組與 origin 均停止後才釋放自己的鎖。之後才用原生視窗完成上表後兩案。

原生操作的首輪在示範影片不在可見區域時，按錄影後尚未到倒數就停止；當次 hidden 仍是「相機已就緒」，不算倒數通過。另一次未切分頁也在準備階段停止。讓示範可見後取得真正錄影與上表錄影中斷證據，但接續準備下一段仍遇到 `等待影片準備逾時`，沒有進倒數。保留這些失敗；同頁重開並重新連結原合成片後才完成表列倒數案，沒有清除資料。可見性／準備逾時的確切因果仍待隔離，不能只歸咎工具或宣稱重試已修復。

## 真正私人視窗：原片／筆記救回通過，VS 與 Blob 保存未通過

由原生 Safari 建立並確認「Private Browsing」視窗，使用同一私人分頁，不變更 Safari 設定。原生選片放入兩份八秒合成 MP4，保存測試標題與一筆非空動作筆記，A=0／C=0／r=1，合成範圍三秒；事前確認 metadata 及 media keys（原為空）。沒有持久影片副本的基線，不能據此宣稱已保住原有私人 Blob。

1. 真正點產品合成按鈕，產品以 `兩側偏移超過 250ms，請重新校正／降低負載。` 拒絕，沒有可下載 VS。未完成私人模式 VS 成檔，更沒有驗到新 VS 保存失敗救回的路徑。
2. 真正點「保存示範副本」，自然出現 trusted 原生 request `UnknownError: Error preparing Blob/File data to be stored in object store`；該交易未見完成／回滾通知。這不是注入錯誤。產品退出忙碌，鎖定新儲存並顯示「保存狀態未確認」；QA 在此狀態不另讀 DB。
3. 從產品原片連結經 Safari 原生另存兩片，實際檔案分別 106,103／175,911 bytes，完整 SHA 與來源一致；獨立完整解碼均 exit 0、stderr 空。另用產品「另存本頁筆記備份」真正下載 2,165 bytes JSON；canonical validateBackup 通過，除 exportedAt 正規化外，內容與事前保存的全部 data 相同，包含非空標記。未上傳影片或備份。
4. 確認檔案已另存後，點產品同頁重開入口（trusted 見證保留），最後經原生重新載入／Leave Page 確認完成 reload。私人視窗與分頁保持同一個，沒有用新私人分頁代替。重開後兩次獨立讀回，metadata.data 與 media keys 都和基線相同、標記仍有一筆，未知旗標已解除；不把 revision 或 UI 字樣單獨當作保全證據。

因此只通過「未知保存狀態 → 另存原片／已保存筆記 → 同一私人分頁重開讀回」；私人模式 VS 合成、Blob 保存及新 VS 救回仍未通過。結束後只關自己的私人視窗／背景測試視窗，停止自己的 loopback 服務並核對自有鎖已釋放；未關閉日常 Safari 視窗、未清儲存。

## 可繼續由工程端處理的缺口

- 先隔離第五輪同步保護的負載／焦點／觀察器因素，再評估是否需修產品；修正後重跑固定版本的完整十輪，仍不能代替真相機 G6。
- 私人模式 VS 的 250ms 保護、自然 Blob UnknownError，以及原生前景操作的影片準備逾時，需分別定位；不能要求舞者靠反覆重試替工具驗收。新 VS 的私人保存／救回只有前置合成真正成功後才可續驗。
- 本輪沒有實體網路切斷、裝置音訊聽感、光學時間校正或最終獨立審查；現有資料可供工程審查，沒有代替這些結果。

## 本機收據定位

原始收據與合成影片留在 ignored output，不納入 Git／PR 附件。下表是收據本身的完整 SHA-256，非真人媒體或公開下載網址；各組另存當次來源與工具快照，GUI 補測的工具／產品 SHA 與清理結果見 `output/safari-validation/background-ui-cleanup.local.json`；失敗亦保留。

| 本機收據 | SHA-256 |
| --- | --- |
| `output/safari-native/runs/6ebe2857-cde0-4752-ac8b-649c0d979fdd/result.json`（錄影九案） | `dcfaf1d9557e6dfef79a47c6e90a8825edb84dc2455a06c3fe048cc5915fb5e0` |
| `output/safari-native/runs/0f7bf90c-b974-461a-9baf-0b48b46a1335/result.json`（生命週期／原片另存） | `134a864894814bac99273234fdb652f20a7fd1da59ad57d512a43f086b23c42d` |
| `output/safari-compare/runs/347e6647-dbe7-4c6d-8b52-633aa4800f15/result.json`（VS 九案） | `03671051566b8c81aeca6b61f080d9e91c3d70ff7dfedf5565cd1b34754dff49` |
| `output/safari-validation/tail-summary.local.json`（四種保存契約及各收據 SHA） | `a25f971acdbd4223ac595d1b0eb31501769dd2b4ea398d345b988b07f796790c` |
| `output/safari-stability/runs/8546a894-d8e4-4d3e-8d8d-738f23cb76a2/result.json`（第五輪失敗） | `f89a2a6440b9a6bcda0811ad1e7928106e1c4c62f9b8d3f954b069726897e4cc` |
| `output/safari-background/runs/dec2307a-aa1c-46db-9dd0-8b1bd0e1f625/result.json`（預覽通過／控制器逾時） | `46c0eb5b1d21748d472cb61e92c7e81b1393d98371aa9724c0f52e190ff941e0` |
| `output/safari-validation/background-ui-recording.local.json`（錄影中背景／前置失敗） | `8f3d25f6b305bfd7636f9bcdddfe19b214277c0915de597d40dcd27601f2a505` |
| `output/safari-validation/background-ui-countdown.local.json`（真正倒數背景） | `a7a6f980a671ed3ea729595c5ca8537863c75e663902be2006f963de0dc405df` |
| `output/safari-validation/private-unconfirmed.local.json`（自然私人失敗） | `50c2f24d57eb4ba0835e5b1dc5a4a76704a04d702fa9a02a9dc9a6705b70950f` |
| `output/safari-validation/private-reopened.local.json`（同頁重開前後完整資料比對） | `9ba51afaf1433289aceb6d2559529cec1308d08a2b9bf5dd1784b375a157c019` |
| `output/safari-validation/private-rescue-notes.json`（真正下載的合成筆記） | `84cf432f27e50d57ae4b128f330c541de2dc7e6a482e905bebb6f6df9adb177a` |

## 保留的前置／工具失敗

- 首次正常 check 在受限環境無法建立本機測試埠，647 pass／1 fail；允許本輪必要的 loopback 後，基線與本輪文件完成的完整 check 均為 648 tests／3,179 expects／0 fail，公開掃描、型別、lint、build 通過。19 項既有 lint info 保留，沒有更改測試。這是專案檢查通過，不會改寫上述原生媒體未通過結果。
- 初次 VS 已在產品成檔並保存，但舊 QA 用第一個逗號切 data URI，誤切 WebM codecs 的 `vp8,opus`，回 Incorrect padding。只修本機 QA 以 `;base64,` 分隔；三種 MIME 的 bytes 解析對照通過，再跑上述完整九案。產品、v5 與門檻未改；首次收據／影片保留，不列產品失敗或完整矩陣 pass。
- 保存短片的初輪 QA 因預設 null 輸出 timebase 回報 DTS 警告而拒絕，原檔影格 PTS 仍嚴格遞增；改用 repo 已有的 passthrough／demux 時間基準完整解碼，三份原檔全部 exit 0、stderr 空。另兩案產品真的重開後，舊 QA 立刻讀已清掉的 qt 而報錯；以同來源 sessionStorage 留 trusted 點擊見證，等新頁初始化後再比對，才完成上述四案。所有首輪收據保留；未改原檔、產品、門檻或原 v5 分析器。
- 首次準備雙片時共用鎖忙，尚未產生新檔就拒絕；未刪鎖或改任何持有人。後續只在自然釋放並取得自己的鎖後準備。

## 仍需要真實素材或本人操作

- 提供同段舞的示範／練習原片各約 20–30 秒之本機路徑即可。保留手機原始格式、片頭等待、直橫向、全身與快速腳步／轉身，不必裁切、轉檔或上傳；只在本機處理。Agent 可接續測選片、對齊、鏡像／疊影、輸出及恢復，舞者確認是否看得出要改的動作。
- 本人點開實體相機，確認房間距離、全身／腳步入鏡、倒數夠走回位置、停止鍵易找及結束後 LED 熄滅。先 15 秒；工程端處理上述未通過項目並補驗後，再依原規格補真相機矩陣及長輪，不先要求使用者反覆十輪測未定位問題。合成 Canvas 不補勾 G1／真相機 G6。
- 本人用喇叭／慣用藍牙實聽原速、慢放、倒數與 VS 的拍點、聲畫及自然變調感受。頻率、脈衝和解碼不能代替人的聽感。
- 真正鎖屏／來電／相機被別的 App 占用、實體停網、熱／電池、另一實體裝置取回與保存仍分別記錄；不操作日常網路或替使用者開鏡頭。
- 五位自願舞者中同四人無提示完成三項核心任務，並另留讀屏實聽／實體觸控與站立操作結果；沿用 [原操作單](../WEB_USABILITY_CHECK.md)，不預填結果。
- iPhone 繼續暫緩、Android 後續；沒有因缺設備判 Web 失敗或啟動 iOS 備援。完整 P0 與 issue 均未由本輪結案。
