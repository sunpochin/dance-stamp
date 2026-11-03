<!-- 檔案用途：依既有驗收條件核對可結案與尚未實作的 issue，避免重做已交付功能。所在層：版本固定的工程盤點。主要關聯：ROADMAP.md、AGENTS.md、GitHub issue #1。 -->
# 開啟 issues 的工程與驗收盤點

## 2026-11-03 逐PTS匯出原型的第一份Chrome成品

白話：新的小原型先替畫面和聲音排好時間，第一份三秒檔在原量尺通過；這比繼續調整即時播放器更值得往下驗，但還沒有換掉產品，也沒有新增可關的票。

從同步main9af建立分支，把[實際原型、58項封存與限制](issue-11-explicit-pts-spike.md)及QA工具隨repo保存，固定Mediabunny1.65.0開發依賴／授權。Chrome156首次MP4239,590B，兩路原v5及RGB核90格碼0→89、視訊3秒／容器3.028秒／平均29.723fps，三組提示音10ms量尺最大差0ms；只有本機POST成品，非原生下載。原CLI前置錯誤、already-finalized警告、host期限退出保鎖與之後own-nonce稽核收尾都保留，不把失敗改成正常。

新repo host只完成HTTP-only協定／路徑／一次寫入及清理檢查；核心body相同不等於新head已做媒體驗收。Safari、三速度／正負偏移／非零起點、疊影／鏡像／跟隨、一般輸入、長片記憶體及取消均還要實作／驗證，不能用受限原型縮小完整目標。#11／#229／#13保持open，先前d09的136ms失敗仍拒採；17張原工程完成票維持結案，Google209仍依使用者設定未備而暫緩，無部署或發布。

## 2026-11-03 原版面成品與未確認保存的下載

白話：候選先帶回來源畫面、等新畫格才畫，原版面三份三秒影片都已真正下載。但提示音測片仍音早136毫秒、超過原標準，所以不採用；保存失敗／未確認也分開保留，沒有因此新增可關閉的票。

從同步main `e55bd047c7737f0b4961f238332973378a7e9722` 建分支，追加[原版面候選、動態逐格品質與保存界線](issue-13-unconfirmed-storage.md#2026-11-03-捲回來源與初始影格策略的原版面成品)。三案107項bytes／SHA與raw兩路核對；原靜態177,023B已確認DB abort／舊資料保全，動態370,372B則unknown／native=null，只核記憶體原來源與下載，不冒稱DB相同或rollback。隱藏舊before、新前景before、工具錯誤及未確認LeavePage後頁面消失原因未知均保留。實檔分別27.595／27.933fps；動態逐格兩路全85列一致、最大同格146／184ms、最大左右差33.333ms，但最大內容時計差167.667ms不藏，連續tone沒有完整音畫證據。

第三案雙側用既有65秒coded-flash來源、只輸出A0/B3/C0三秒，502,501B真下載且保存已確認abort／舊資料保全。當次端到端上界15,647ms、selfDuration65000與seconds65照原值；兩路未改原v5均exit1／withinSyntheticTargets=false：82格／3.045秒／26.929fps，完整解碼與配方覆蓋true、3flash／3pulse，三組閃光／提示音配對分別為音晚10／音早136／音早134ms，超過原100ms。故拒採d09候選，不用固定補償、重試、換音新控制或放寬門檻；沒有產品修改，#229／#13仍未修復。

前批[#255](https://github.com/sunpochin/dance-stamp/pull/255)精確b8c獨立審查及CI41597812634必要四項成功、83情境／0FAIL／12真下載全解碼自然播放後已merge至e55，僅2docs55+/0；新主線自己的CI41600565140 attempt1亦五項全成功，App原log另核83情境／0FAIL／12真下載全解碼自然播放。候選仍是frozen832／83a29a明列QA變體；17張已完成票保持原結案，#229／#13與真人／裝置／雲端／發布條件不代勾，無部署或發布。

## 2026-11-03 末畫布辨識與第一份候選真下載

白話：逐格編號補到失敗時最後合成畫布的內容；停止追加擷取時能走完，改由來源影格回呼驅動的候選首次真正下載了VS。回原版面後又失敗，因此未採用；私人保存與動態品質也仍有缺口，沒有新增產品結案。

從同步main `da0232505bb410337262ff89ff8e4daba5217812` 建分支，只補既有[逐格辨識／擷取觸發證據](issue-13-unconfirmed-storage.md#2026-11-03-逐格辨識後續擷取請求與第一份候選真下載)與索引。四案147項兩路核對；新motion首100最後canvas ID1／0不等於當下來源／連續停格；無額外請求案未編碼自然完成；真rVFC候選174,935B已原生下載、hash等Blob。實檔82格／3.045秒／26.929fps／正確合成音源，末尾重複PTS、DTS警告與分析工具初錯保留，不改檔、不製造完整G2／G3或首次播放結論。相同候選回原版面仍首100、無VS；來源ratio0與首AX真34,667ms照實，不以固定布局的成功外推正常流程。

前批[#254](https://github.com/sunpochin/dance-stamp/pull/254)精確e7c必要CI與獨立審查通過後已合併，僅2docs42+/0，da主線自己的CI41589617609五項亦全成功；本次仍未採產品補丁。17張已完成票照原範圍，#229／#13與其他真人／裝置／雲端／發布條件保留，沒有部署或發布。

## 2026-11-03 擷取流程的四個單次控制

白話：不啟動錄製仍失敗，不建立畫布擷取時時間線才走完；保留擷取但拿掉測試包裝、或改讀取提示也仍失敗。這幫助縮小排查範圍，沒有做出VS或新增可關閉的產品票。

從同步main `6f605e5871c48b23e4e6e732a6563edde331df5e` 建分支，僅追加既有[擷取流程證據](issue-13-unconfirmed-storage.md#2026-11-03-錄製與畫布擷取的流程分界)與索引。四案141項entry兩路逐項核對；三案原100ms拒絕，一案未編碼時間線自然完成2998ms／maxDrift35／maxRenderGap18，皆無VS。clock、track追蹤、前後幾何及提示生效限制清楚，沒有採用產品補丁、放寬守門、修改原checker或以空清單補勾ended。

前批[#253](https://github.com/sunpochin/dance-stamp/pull/253)精確a727的獨立審查與CI41583519674成功後已合併，僅2docs28+/0；新main自己的push結果另查，不沿用PR。17張已完成票維持結案，#229／#13仍open，其他真人／實體離線／跨裝置／雲端與發布條件不變；沒有部署或發布。

## 2026-11-03 較少旁聽的原流程續驗

白話：移除一直讀影片時間的探針後，Safari仍沒有完成VS；原片與筆記保留，17張已完成票不重開，#229／#13也不提早關閉。

交接分支從同步main `01a09953c81a85b148166303ade9e6aaeeeecd40` 建立；前批[#252](https://github.com/sunpochin/dance-stamp/pull/252)精確b679必要CI與獨立審查通過後已合併，其本身只2docs72+/0，保留另一工作#250。新[較少旁聽stock單次控制](issue-13-unconfirmed-storage.md#移除連續時鐘探針的原流程控制仍在100ms守門停止)另封存42項，與前236項分開；原100ms局部值638.898／742ms、差103.102ms，無VS。clock=null及前後835→882幾何均明示未觀測正式全程，三個匯出前QA錯誤與原checker失敗保留。

兩路核對全部hash／保全與限制，未找到可採用產品修正。公開WebKit快取機制未對應本機binary，來源UI讀值路徑也只屬待區分猜測；本交接不改產品、不再開原生變體、不部署或發布。#209依使用者尚未設定而暫緩，其餘原真人／實體離線／跨裝置／發布條件照原票，#246／#249保留原工作範圍與採用決策。

## 2026-11-03 固定來源版面的後續排查

白話：把測試影片固定在畫面內後，原版與三個獨立設定仍各自失敗；本輪沒有新增可關閉的產品票。17張已完成票維持結案，原片與筆記保留，Safari問題繼續沿原票處理。

本交接從同步main `cba924ef2893d0809b4f68eda6eb0e0a5ac8aa2d` 建分支；前一批三案已由[#251](https://github.com/sunpochin/dance-stamp/pull/251)在精確caaaeee必要CI成功後合併，僅2docs48+/0。後續四案[新版面基準、音高、全部速度寫入抑制與雙側原聲](issue-13-unconfirmed-storage.md#2026-11-03-固定來源版面的基準與設定對照)另保存151項manifest entry／匿名摘要：正式已記錄區段均雙側可見，仍各被原100ms或250ms守門拒絕，沒有VS。QA版面、setter行為抑制與可聽性介入各自明列，不當作產品修正、嚴格2×2或完整G1–G7；#229／#13仍open，Google設定及真人／裝置條件保持原範圍，沒有部署或發布。

另補一個[組合缺格](issue-13-unconfirmed-storage.md#補足組合缺格仍100ms超出紀錄上限後的首錯時間未知)，43項manifest／原100ms拒絕與保全各自保存；240筆上限後28筆未記，最後約1.899秒不能冒稱首錯位置，全程曝光／完整尾段ledger仍未驗證。沒有提高上限或重試挑成功，原錯誤與工具封存失誤保留。

最後只在原守門已判定失敗後，加[單筆首錯收據](issue-13-unconfirmed-storage.md#單筆首錯收據新案在約2009秒超過100ms)觀測一次；新案reference elapsed約2.009秒／audio elapsed2.118秒、差108.605ms，仍無VS。另42項封存與舊43項分開，不回填缺失尾段；本組合計236項manifest entry，沒有採用任何產品補丁或提高紀錄上限，#229／#13維持開啟。

## 2026-11-03 Safari 操作恢復後的有限續驗

白話：17張已完成票維持結案；使用者允許恢復Safari後，單次啟播仍失敗，兩次雙側原聲嘗試都缺少有效可見前提。這些紀錄幫助接手者避開重複失誤，沒有新增可關閉的產品票。

交接分支從同步main `acea4b9d52ad1b7aaa7db2ba1e5b8c070a567b74` 建立，只追加既有證據及本索引。三案[固定來源、原始失敗與操作限制](issue-13-unconfirmed-storage.md#2026-11-03-恢復畫面操作後單次啟播與無效的雙側原聲對照)分開保存：單次啟播變體真正首匯出原250ms拒絕；誤觸案未完成既定靜默；AX索引案雖操作順序符合，仍於匯出前自動捲走來源。89項manifest entry含合成素材由協調者逐一重算，沒有VS或成品保存／救援結論。#229／#13維持open，Google設定仍依使用者先暫緩，無部署或發布；既有17票結案與其他真人／裝置條件均不變。下方畫面尚未恢復是此前歷史，不代表本輪仍被鎖定或他人操作阻擋。

## 2026-11-03 指定審查例外核准後的合併與結案

白話：使用者同意這輪由Codex獨立審查，整合版已合併；符合原工程驗收的票已關閉。Safari尚有真正失敗，仍保留原票繼續排查；不把檢查通過當作真人／裝置或發布驗收。

使用者明確回覆「允許，本輪採Codex獨立審查後合併」及Mac已解鎖。精確受測 `36c79e34b6e676e73cecfea76971270c94529846` 的來源審查、83案／12成品與全部必要CI成功後，[#240](https://github.com/sunpochin/dance-stamp/pull/240) 正常merge為 `8767e4ada9a8c20a1edde3010795ad016bd081a3`；#221／#225／#230／#231／#234／#237均merged，全部原head經git ancestry核對在main。#225意見等#230實際落地後才resolve。另[#244](https://github.com/sunpochin/dance-stamp/pull/244) 同輪必要CI成功，merge為 `8ef7f009644d2e86460805aedbf9f9bd7bdaf17a`，相對真正第一parent8767只兩份文件39行；全部web bytes與受測36c相同，沒有改稱新main重跑。

即時逐票GET已核對17張closed/completed：#192、#195、#200、#222、#239、#241，加上本次#220、#223、#226、#227、#232、#235、#238、#103、#8、#161、#194。原驗收、固定來源與失敗限制保留；#103沒有新增硬100%門檻，#194不代簽私人VS或完整G1–G7。現仍15張open：#1、#3、#9–#19、#209、#229；#209依使用者尚未設定而暫緩，#16條件未觸發、iPhone暫緩，其餘各原票仍需對應的真人／硬體／跨實體裝置／發布驗收。

#229已恢復兩路：原生單次cohort與只讀根因核對。解鎖後六個有界對照沿[新固定證據](issue-13-unconfirmed-storage.md#2026-11-03-229-解鎖後的實際可見區域對照)保存：一般視窗有真成品與解碼、首播1drop／額外包裝失敗如實保留；私人固定位置仍100ms，預覽完成但不等於匯出，原聲與原速組合仍250ms。沒有可採用產品修正，#229仍open；下一步回查暖機／回零／正式播放呈現邊界，不疊未證實補丁。整合後精確main8ef的harness／App／Linux／Workers及badge亦已全部成功，未把舊8767因同main併發取消改稱失敗修復。下方待指定審查、待解鎖與數量是此前歷史快照，不覆蓋本節狀態。沒有正式發布。


## 2026-11-03 兩路實作與合併交接

使用者已授權「維持平行兩個做到好然後 merge」：沿既有 issue 工作，可驗收的新缺口才開子票；協調者逐一審查與合併，保持來源、CI、真人／真機驗收與正式發布各自分開。本節只更新當時工作狀態，下方歷史數字與判斷仍歸原日期。

本輪從 main `83220edabd90cab274532900763c4ff696dffdc5` 開始。已開 #222（雲端公開流程插樁，[PR #224](https://github.com/sunpochin/dance-stamp/pull/224)，`c9558ff5c01035ad7379d2df425f17c365bca74f`）、#223（開節拍器保留原雙片，[PR #225](https://github.com/sunpochin/dance-stamp/pull/225)，`ec5106a0a43be97de82792bd48a51669f51ad4a5`）、#226（節拍器／Worklet 完整量測）及審查後確認的 #227（準備期間取消，[PR #230](https://github.com/sunpochin/dance-stamp/pull/230)，`496af41a258c603d056e11ac718e1cab7ef5bd96`）。寫入本節後 #224 已由協調者審查／合併，main 前進到 `4e52e604deeb89b73abafcd2d28aaacaa4fc0c2b`，#222 自動結案；其精確 head 完整 79 案 CI 成功。#221／#225／#230 仍 open；#226 原生受測來源 `ad941dc8eee3ba4019249f38589d3d67f93db78e` 的 24 檔產品，在正常同步主線的 `59d1bb287d141ae4df0751886f762ddf9be6203d` 保持逐檔 SHA 相同，後者完整 CI 尚未預勾。詳細測試只讀[全 App 證據](issue-103-app-coverage.md)及[節拍器／準備取消設計](../../TECHNICAL.md#227-分析準備期間的媒體取消)，不在此重抄規格。

使用者確認 #209 尚未設定，先處理其他 issues；真 Google OAuth／私人帳號與跨實體裝置驗收不啟動，設定交接仍見[雲端文件](../CLOUD_SYNC_SHARING.md)。第一路續查 #194 原生首次操作與 #13 私人 Safari；單次成功不消除歷史首次失敗，保存前遭影音守門拒絕也不算保存／救援通過。原生版本與未完成範圍沿[首次操作證據](issue-194-follow-audio-activation.md)與[私人保存證據](issue-13-safari-private-storage.md)承接。

#8／#161 票內指定最終審查、真人 4／5、讀屏／觸控、跨實體裝置、完整 G1–G7 與 #15 發布條件均保持原要求，不能由程式合併或合成回歸代簽；#16 條件未觸發，iPhone 暫緩。接手時重新核對即時 PR／CI／issue；本節來源與當時狀態不是未來版本的驗收證明。

## 2026-10-30：67bd630 基線與後續變動

依使用者指定，以 main `67bd6308854bf8b560ad61bfcbe73babca5db0af`／靜態 `7c728c8a5bd7fa2f` 對照開啟 issue 的原始範圍、現行程式、測試及來源證據。該提交已透過 [PR #88](https://github.com/sunpochin/dance-stamp/pull/88) 整合 #84–#87；[main CI](https://github.com/sunpochin/dance-stamp/actions/runs/41006187933) 的 harness、linux-install-restart 均成功。歷史段落的「尚未合併／尚無證據」不能直接當作今日工程缺口。

盤點期間另有 [PR #90](https://github.com/sunpochin/dance-stamp/pull/90) 合併，遠端 main 前進到 `f3333a0be8546b9626605d55f19c8ecf6005dc49`；其第一父提交正是 67bd630。下表保留指定基線，選片／主機設定的後續差異另列，不把 #90 的結果移記為 67bd630 已驗。本輪文件分支同步至 f3333a0，未修改產品程式或測試。

最後查詢共有 **19 張開啟 issue**：#1、#3、#8–#19、#89、#91、#93–#95；開啟 PR 為 #92。這是版本及查詢時點固定的盤點，不代表後續狀態。

### 指定基線已覆蓋的 Web 工程

「已有工程覆蓋」只表示下列程式與證據已存在；不代表整張票完成、真人／裝置通過，或本輪重新執行了原矩陣。

| Issue | 已有覆蓋與可追查來源 | 本輪判定 |
| --- | --- | --- |
| [#1](https://github.com/sunpochin/dance-stamp/issues/1) | 下列 Web 主流程及四線整合均在基線 | 總覽票，依各子票驗收，不重建功能 |
| [#3](https://github.com/sunpochin/dance-stamp/issues/3) | [Safari 有界音訊](issue-3-bounded-audio.md)、[Chrome／Safari 分版結果](p0-safari-reliability-integration.md) | 一般 Safari 歷史十九案不能替代新版本／私人模式，續驗限制另列 |
| [#8](https://github.com/sunpochin/dance-stamp/issues/8) | [六速、鏡像、循環與真正桌面背景](issue-8-practice-loop.md) | 軟體清單已有覆蓋，仍待指定 Claude Code／使用者最終審查 |
| [#9](https://github.com/sunpochin/dance-stamp/issues/9) | [chunks 寫入中程序中斷及恢復影格守門](issue-9-capture-recovery.md#錄影-chunks-未提交時的真正程序中斷)；#87 已拒絕只有檔頭卻可回報 loadeddata 的片段，含取消、缺能力、play 拒絕及同輸入重試 | 不再補同目的恢復／影格測試 |
| [#10](https://github.com/sunpochin/dance-stamp/issues/10) | [既有雙片正式入口、時間映射、鏡像、重連與失敗保留](existing-comparison.md)；錄影入口另見 [#9 接線](issue-9-comparison-integration.md) | 不重做雙播放器、時間線或普通往返 |
| [#11](https://github.com/sunpochin/dance-stamp/issues/11) | [成檔後保存尾段四案](issue-11-vs-save-tail.md)：Stop 真正提交、原生 ConstraintError 拒絕及明示缺通知的 abort／complete；下載完整 bytes、解碼、離站播放分列 | 不把保存尾段與準備交易取消混為未實作；完整媒體結果維持原來源 |
| [#12](https://github.com/sunpochin/dance-stamp/issues/12) | [完整備份／衝突恢復](issue-12-backup-recovery.md)、[恰好容量上限 UI](issue-12-native-capacity-ui.md)、[#84 大型匯入規劃中 Stop](issue-12-import-planning-stop.md) | 外來源、分享、衝突 hash／ID 規劃、零寫入取消及同檔重試已有證據 |
| [#13](https://github.com/sunpochin/dance-stamp/issues/13) | [實際低空間](issue-13-native-quota.md#2026-10-30小型檔案系統的實際低空間)、[更新／pending-write 程序中斷](issue-13-forced-install.md)、上述 chunks、[未確認保存](issue-13-unconfirmed-storage.md) | 舊表的低空間、寫入中程序中斷已獲後續覆蓋；提交瞬間／斷電仍未驗 |
| [#14](https://github.com/sunpochin/dance-stamp/issues/14) | [Web 可及性](issue-14-web-accessibility.md)、[#85 未確認保存的原生交易、AX、Tab／Enter 與下載保全](issue-14-storage-keyboard.md) | 不重跑普通窄版／modal 來代替真人或讀屏實聽 |
| [#15](https://github.com/sunpochin/dance-stamp/issues/15) | [獨立本機包、來源／路徑／授權保護](issue-15-web-package.md)、[四線包依賴](p0-safari-reliability-integration.md#2026-10-30-四線整合候選) | 工程準備已有；發布及實際主機驗收保留，後續 #91 不算完成 |
| [#16](https://github.com/sunpochin/dance-stamp/issues/16) | 條件式 iOS 備援，尚未啟動 | iPhone 繼續暫緩；不能由桌面或私人模式失敗推定觸發 |
| [#17](https://github.com/sunpochin/dance-stamp/issues/17) | [分類、跨影片動作、歷史、草稿保護、離線與還原](issue-17-moves.md) | 已有實作與有界回歸，不新增同目的功能 |
| [#18](https://github.com/sunpochin/dance-stamp/issues/18) | [分享白名單、ID 重建、人工重連](issue-18-sharing.md)及 #84 的分享規劃取消 | 外部傳送／接收不由匯出成功證明，不新增 OAuth、雲端影片或同步 |
| [#19](https://github.com/sunpochin/dance-stamp/issues/19) | [手動 BPM／第一拍、八拍、秒數後備、三速音訊 samples 與備份](issue-19-manual-beats.md) | 原票未勾項已有對應程式與證據，仍需人工校拍與實聽 |

### 可推進的 Web 工作與既有承接

本輪沒有確認一個可重現、尚未覆蓋且尚無工作線承接的新產品缺陷；不據此宣稱沒有其他 bug。現有工程問題保持原票與既有承接，避免同時改寫選片介面或建立同目的 PR。

| Issue | 實際缺口／狀態 | 接續方式 |
| --- | --- | --- |
| [#89](https://github.com/sunpochin/dance-stamp/issues/89) | 67bd630 的 JSON 匯入容易誤當選片；#90 已增加影片入口及 MOV／MP4 提示，於 f3333a0 整合 | 查 [選片證據](issue-89-video-picker.md)，不重做已合併修正；原生 OS 選檔視窗及使用者實片 codec 仍未驗 |
| [#91](https://github.com/sunpochin/dance-stamp/issues/91) | #90 已加入明確建置產物設定，但其 PR 記錄仍列外部 Workers Builds 失敗、讀 Builds API 403；手動預覽不等於自動建置成功 | 沿原票取得確切建置日誌／可用讀取權限後再診斷；本輪不登入、部署或發布，未重新確認外部建置已恢復 |
| [#93](https://github.com/sunpochin/dance-stamp/issues/93) | 固定預設 4174 已有 [PR #92](https://github.com/sunpochin/dance-stamp/pull/92)，head `7c2c3262fa682845d22260c4720cd5307797d86e`，尚未合併 | 沿既有 PR 審查，避免重做埠號與啟動文件 |
| [#94](https://github.com/sunpochin/dance-stamp/issues/94) | 本機監看、自動重建及有草稿／影片時保留畫面尚待交付；已有獨立工作線 | 此範圍不在 #90 已合併差異中，不能寫成已完成；不重建第二套開發更新機制 |
| [#95](https://github.com/sunpochin/dance-stamp/issues/95) | 盤點期間新開的左右選片與練習／錄影／管理分區問題；已有獨立工作線 | 可用合成影片、無相機、鍵盤及取消／壞檔保留驗證；保留原工作線，不與它同時修改 UI |

原生 Safari 的一般／私人模式保存 Stop、新 VS 保存失敗／未確認救援仍是**瀏覽器軟體驗證缺口**，不全歸類為真人／裝置問題。[先前前置失敗](issue-3-current-protection-audit.md#原生-safari-的操作前置失敗)記錄遠端自動化未開啟，當時沒有建立 Safari 產品 session；本輪沒有重新探測或改設定。後續須在可用且獲授權的原生入口續驗，才能判斷是否需要新工程修正；Chrome 明示缺通知不能填補這格。

### 真人／實體裝置缺口，與工程分開保留

| 類別 | 未完成條件與對應票 |
| --- | --- |
| 真人可用性 | #1／#14：五人中同四人各自無提示完成標記重播、錄影到 VS、既有雙片到 VS；#17–#19 的分類、分享理解、校拍與聽感 |
| 無障礙與觸控 | #14：VoiceOver 實聽、實體觸控、橫直向／安全區與放大文字；AX 或 viewport 回歸不能替代 |
| 真實影音與硬體 | #3／#9–#11：真相機、光學同步、停止後 LED、鎖屏／來電、喇叭／藍牙實聽、硬體 G1／G6、熱／電池／記憶體壓力與完整支援範圍 |
| 實體資料與接收者 | #12／#13／#18：實體飛航、跨實體裝置備份還原／重連、一般檔案及 Drive／Dropbox／iCloud Drive／AirDrop 的實際收發、接收者播放；同機新 profile 不算跨裝置 |
| 暫緩與發布條件 | iPhone／主畫面及 #16 繼續暫緩；#8 等票的指定最終審查、#15 新使用者取得與完成 P0、發布來源／供應商限制及使用者核准各自保留 |

### 本輪驗證與停止條件

讀碼追查 `presentedFrame` 的所有呼叫端後，曾提出「取消後遲到且未滿足暖機條件的通知可能重掛 callback」。直接人工呼叫已取消的 callback 會出現該現象，但不能證明原生瀏覽器會如此送達。另在**未修改的 67bd630**、隔離 Chrome 156、16×16 Canvas 合成串流，以較早註冊的原生影格通知取消同批等待；實際結果 AbortError、只註冊一次、predicate 執行 0 次、待執行 callback 0。未重現產品缺陷，因此沒有修改 helper 或新增該人工情境的回歸。

此探查只涵蓋 Chrome 的指定順序，沒有 Safari／整體媒體矩陣結論。先前 stale dist 與來源不一致被前置檢查拒絕，當時尚未拿鎖或啟動瀏覽器；沿原建置入口重建後才執行探查。自有 Chrome 的已知 PID／群組、server 與同 nonce 共用鎖均已核對收尾；raw、工具與 profile 留 ignored output。文件變更沿原 `bun run check`／提交 hook 驗證，不新增測試或重跑同 bytes 已有的完整原生矩陣。

本輪交付逐票盤點；沒有新的產品修補、合併、部署、發布、改 issue 勾選或關閉未驗收票。若後續新票／可重現錯誤出現，再接續其原票的最小修正；不以保持忙碌為由重做已覆蓋項目。

## 以下為先前盤點的歷史紀錄

## 2026-10-29 實作與關票盤點

盤點基線為遠端 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e`，靜態版本 `adbe8eb1d6acfd09`；GitHub 當時共有 14 張開啟 issue。這是當日快照，後續狀態以各票為準。

## 2026-10-30 續查

遠端 main 已由另一輪審查整合 PR #64–#72，來源為 `c0ab39bcf68354cc29d7048a0d81e56d626efcf1`／靜態 `422c70c3633b8e88`；下表及後面的四張開啟 PR 為 10 月 29 日快照，不再代表目前待整合清單。最新錄影／取消與 Safari 證據依 [P0 整合紀錄](p0-safari-reliability-integration.md) 保留來源；沒有把歷史成功改記為本次重新驗收。

本聊天另核對全部 14 張開啟票：#8 仍待既定 Claude Code／使用者最終審查，#16 仍未滿足啟動條件；其餘已具備實作，剩餘為原票的實體媒體／支援範圍、真人、跨裝置或發布驗收。#13 的低空間缺口另由 [PR #73](https://github.com/sunpochin/dance-stamp/pull/73) 補上有界真實檔案系統測試，具體來源與結果見[低空間證據](issue-13-native-quota.md#2026-10-30小型檔案系統的實際低空間)；仍不代替產品 UI、Safari、飛航模式及其他裝置驗收。此次不關閉尚缺驗收的票，也不重建已實作功能或啟動 iOS。

## 結案判定

依各 issue 原有範圍與 `AGENTS.md` 的獨立審查要求，不能只因 PR 合併或自動檢查通過就關票。#8 的桌面軟體清單已勾完，尚待 Claude Code／使用者最終審查；已請使用者針對既有 PR #42 確認。其餘未滿足條件列於下表，不把桌面合成測試改記成真人或實體裝置驗收。

| Issue | 已有實作／交付 | 關票前剩餘條件 |
| --- | --- | --- |
| [#1](https://github.com/sunpochin/dance-stamp/issues/1) | 常規 Web 與 P1 工程已整合 | 核心子票、至少 4／5 人獨立完成三項任務、支援與發布驗收 |
| [#3](https://github.com/sunpochin/dance-stamp/issues/3) | Web 媒體試驗、有界 Safari 音訊及原生失敗證據 | Safari 啟播／長片／半速覆蓋、原矩陣與實體媒體 gates |
| [#8](https://github.com/sunpochin/dance-stamp/issues/8) | 六種速度、獨立鏡像、循環與真正桌面背景證據，PR #31／#42 已合併 | 票內明列的 Claude Code／使用者最終審查 |
| [#9](https://github.com/sunpochin/dance-stamp/issues/9) | 倒數、合成相機錄影、落盤／恢復、背景與停止鎖修正 | 實體相機、指示燈、G1／G6、獨立審查 |
| [#10](https://github.com/sunpochin/dance-stamp/issues/10) | 正式既有雙片與錄影入口、共同時間線、校正與重連 | 兩條入口的完整真機／光學同步與錄影驗收 |
| [#11](https://github.com/sunpochin/dance-stamp/issues/11) | 單檔帶音訊 VS、Chrome 完整合成矩陣、失敗保留 | Safari 品質、手機保存／接收、實體相機與熱／電池／記憶體壓力等原 gates |
| [#12](https://github.com/sunpochin/dance-stamp/issues/12) | 完整 v1／v2 備份、預覽、衝突副本、媒體清單與重連，PR #56 已整合 | 跨實體裝置／支援範圍驗收與獨立審查 |
| [#13](https://github.com/sunpochin/dance-stamp/issues/13) | 離線副本、容量／更新保護、原生 quota、部分安裝強制終止證據 | 真實低空間、寫入交易中程序中斷、實體離線／支援範圍與獨立審查 |
| [#14](https://github.com/sunpochin/dance-stamp/issues/14) | 鍵盤、窄版、可及名稱、匿名五人操作單 | 真人 4／5、讀屏實聽、實體裝置與完整 P0 缺陷驗收 |
| [#15](https://github.com/sunpochin/dance-stamp/issues/15) | 免費主機／來源邊界規劃、獨立本機包、逐檔校驗與路徑防護 | 實際發布來源／標頭驗證、新使用者完成 P0、支援證據、發布前限制查核及使用者發布核准 |
| [#16](https://github.com/sunpochin/dance-stamp/issues/16) | 尚未實作，條件式 iOS 備援 | 須先有手機 Web 的可重現阻礙與限時修正結果；目前 iPhone 暫緩，不能由桌面 Safari 失敗推定觸發 |
| [#17](https://github.com/sunpochin/dance-stamp/issues/17) | 分類搜尋、跨課程動作、手動狀態／歷史、v2 與草稿保護，PR #54 已整合 | 既定獨立審查、真人可用性／讀屏及跨裝置支援驗收 |
| [#18](https://github.com/sunpochin/dance-stamp/issues/18) | 分享欄位白名單、預覽、匯入重建關聯與人工重連，PR #54 已整合 | 另一實體裝置、一般檔案與各外部傳送途徑的真實收發及獨立審查 |
| [#19](https://github.com/sunpochin/dance-stamp/issues/19) | 手動 BPM／第一拍、八拍、拍數／秒倒數、音訊 samples 與備份，PR #54 已整合 | 既定獨立審查、真人校拍／實聽及實體支援驗收 |

#8 的 `tests/browser/practice.js` 與 `tests/browser/practice-background.js` 相對 QA head `65d3b40751860f2a7e6d3a5628641a82a675a2a6` 無差異。產品 `main.js` 後續已整合其他功能，原背景證據仍屬該受測版本，不能僅由測試來源相同便宣稱本輪重新通過。

## 尚未實作與既有後續候選

唯一整項尚未實作的是條件未觸發的 #16；沒有另外一張可直接啟動且未有實作的 Web 功能票。沿用既有問題與 PR，不重建同目的票、不加入 P2 或自動啟動原生平台。

- [PR #64](https://github.com/sunpochin/dance-stamp/pull/64)，`f88c28d88b6b13c2aad39b9b8541bcd42866d6b2`：Safari 暖機與回起點時等待真正目標影格；單元已交付，原生品質與本候選完整媒體回歸待驗證。它已是 #3／#11 的實作，不能再開相同修正或宣稱已修好 Safari。
- [PR #65](https://github.com/sunpochin/dance-stamp/pull/65)，`f72cb2ff2b500530692c81fadfb8d86ce83aeb36`：原生 quota 獨立重跑收據，非新的資料儲存功能。
- [PR #66](https://github.com/sunpochin/dance-stamp/pull/66)，`b423027ef29d75e3eabb819aafc6cfddda7b0095`：QA 自有程序退出後才釋放鎖，不是產品媒體缺口修正。
- [PR #67](https://github.com/sunpochin/dance-stamp/pull/67)，`98fb5517c0027c4fa9a1b147e75c05ac1bdf7660`：新版原生 Safari 的失敗證據，非新的功能實作。

以上四張在盤點時均開啟；本輪沒有合併或發布。各票舊段落的「規劃／尚未實作／未合併」保留為歷史紀錄，不能蓋過目前已整合的實作。

## 本輪驗證

在本聊天獨立 clone，以 Bun 1.4.4 對上述乾淨 main 執行原 `bun run check`：382 tests／1309 expects／0 fail；來源與公開內容掃描、型別、lint 及 build 通過。第一次受限執行環境無法綁定本機測試埠，僅該 HTTP 案例失敗；允許本機臨時服務後原入口全部通過，沒有修改測試或門檻。

同一產品來源／靜態版另用 macOS 27.0.1、隔離 headless Chrome 156，原四份瀏覽器函式通過，未修改產品程式或測試斷言；瀏覽器執行時工作樹只有本輪文件修改：

- `moves.js`：兩堂課／兩個標記／兩個 take，搜尋、手動狀態、跨影片跳轉、歷史配方、實際離線 reload、全新 context 備份還原、缺片重連及解除關聯／刪動作保留四份原片。390 CSS px 無水平溢出、pageerror=0、外部來源請求=0。
- `moves-storage.js`：v1 只讀不升版、排隊寫入 quota 原子回滾、重試成功升版、真正另一分頁衝突保留草稿、取消與未知版本保留原件。
- `beats.js`：手動保存／取消／非法輸入／移除、三速度來源拍號、A–B／seek、quota／交易取消與真實另一分頁衝突、重開與乾淨 context 備份還原／重連通過。原生 OfflineAudioContext 的 4／8 拍 × 0.5／0.75／1× 六組 samples 皆通過原時間與音頻斷言；這不是真人聽感。
- `move-draft.js`：既有／新增草稿、明確保存取消、quota 與真實分頁衝突保護通過；另真正導航至空白頁、拒絕原生離頁提示後，原函式確認 trusted=true、prevented=true，表單值保留。

保留兩項測試前置失敗：拍點首輪誤用 65 秒素材，使原本 20 秒片尾的非法起點成為合法值；換回既有 20 秒合成片並在全新環境重跑通過。草稿首輪缺少合成環境標記，被原安全前提拒絕；禁用 mediaDevices、設定本輪合成環境標記後才重跑，沒有弱化安全檢查。兩者均不列為產品缺陷或成功案例。

只用合成素材及全新隔離 Chrome，不操作私人媒體、實體相機／麥克風、雲端帳戶或裝置設定。未重跑 Safari、真正桌面背景、拍點錄影、完整媒體矩陣或跨實體裝置；沒有新增支援承諾。

## 2026-11-03 最後收尾快照

白話：能完成的 6 張票已關閉；其餘要等指定審查、解鎖電腦或原本需要的真人／裝置驗收，沒有把檢查通過當成全部完成。

盤點時 main 為 `1ecc42f2086d3edafdf53d334879aefcfa4b738d`。#192、#195、#200、#222、#239、#241 已 closed/completed；本輪另外合併 #228 首次操作證據、#233 私人 Safari 診斷、#236 練習循環／背景證據、#242 有界 CI 預算及 #243 原生傳輸拒絕回歸。這是當時狀態，接手仍須查即時資料。

最終產品整合 #240 的精確 head `36c79e34b6e676e73cecfea76971270c94529846` 已完成 83 案、12 份成品與所有必要 checks；完整分母、報告雜湊、前後結果及限制見[最終 CI 收據](issue-103-app-coverage.md#2026-11-03-最終候選完整-ci-收據與接手條件)。#221／#225／#230／#231／#234／#237 的提交都在此候選中；不要單獨合併仍含已知問題的早期 head。#225 的審查意見須等 #230 修正實際進 main 才可結束。

| 待處理票 | 下一個可執行步驟 |
| --- | --- |
| #220、#223、#226、#227、#232、#235、#238 | 重要產品指定審查完成後，重核對最終候選再整合；確認前置 PR 與子票狀態，不預先結案。 |
| #103、#8、#161、#194 | 工程原驗收對照已完成，仍待指定審查；按各票原範圍判斷，不追加追分或不相干真機門檻，也不把歷史／合成證據改寫為新版本真機通過。 |
| #229 | Mac 解鎖後續做尚未開始的可見區域 cohort；前六輪診斷失敗保留，不稱私人 Safari 保存通過。 |
| #209 | 使用者已答覆尚未設定、先繼續其他票；不操作真 Google 帳號或再要求相同設定。 |
| #1、#3、#9–#19 | 保留各原票尚缺真人、硬體、跨實體裝置、條件啟動或發布驗收；不由 CI 或產品合併代簽。 |

目前指定審查阻礙是 Claude Code OAuth 過期，尚無該工具審查；已向使用者提出本輪改採 Codex 獨立審查的例外，尚待答覆。原合併授權持續有效，但不等於例外已獲同意。此段只補 repo 交接，沒有新增產品功能、放寬驗收、正式發布或替使用者作決定。

文件分支從上述同步 main 建立，只修改兩份既有證據文件，既有索引可達；本分支正常 `bun run check`、公開掃描、型別、lint 及 build 通過（754 pass／0 fail，原 19 項 lint info，靜態 `83a29a61027b205d`）。首輪因本機連線限制及上一產品分支的 dist 不符白名單而失敗，保留舊產物後在可用本機連線環境完整重跑；沒有修改產品／測試或略過檢查。此為文件分支的檢查，與 #240 的 760 項單元結果、83 案產品報告分開記錄。
