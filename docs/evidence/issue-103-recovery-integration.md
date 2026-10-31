<!-- 檔案用途：記錄四條原恢復回歸與既有影格／匯出取消的同候選共存驗證。所在層：#103 整合品質證據。主要關聯：coverage-recovery.js、recovery-frame-guard.ts、run-app.ts、issue-103-recovery-guards.md、TECHNICAL.md。 -->
# 原片、筆記與草稿的恢復檢查一起驗

離線檢查沒收到回覆、影片清單暫時讀不到，或寫到一半想離頁時，原片與筆記仍應留下。這次把四條原有恢復檢查接進同一套完整流程，也保留匯出準備中停止與恢復影格守門，避免兩邊各自通過、放在一起卻走錯入口。

## 固定來源與取捨

2026-10-31，接續 [#103](https://github.com/sunpochin/dance-stamp/issues/103)。從同步 main `d83755239bf145e9b79d50263208edfad83754e8` 建獨立分支，承接 [#128](https://github.com/sunpochin/dance-stamp/pull/128) 固定候選 `d441cf0c133be3a876f92f38fb20b60e166c967d`；採用 [#127](https://github.com/sunpochin/dance-stamp/pull/127) 固定候選 `ff4f84263944c57af5373c406c64825b442b6c99` 的兩個原檔。

原 `tests/browser/coverage-recovery.js` 逐 byte 保留，SHA-256 `471df7ed91c4d59f39a4d31fd6ac225a0d2732172b08712c5aeef44d9c08ba8e`；原 `docs/evidence/issue-103-recovery-guards.md` 逐 byte 保留，SHA-256 `0ea93dd7e66dda9c85bcb3d584837172179bd0aba31908aa79f24c118ded78d5`。原文件中的2a3fbfb前置、2011行分母及本機55條證據仍屬原候選，不移記為這個新候選的結果。

前置#128的[CI #218](https://github.com/sunpochin/dance-stamp/actions/runs/41160178877)三項成功，app job 124416011211 checkout精確d441cf0，Linux63 PASS／0 FAIL、九模組行數100%／函式97.03%／分支88.40%；原影格守門31,106ms、匯出暖機6,187ms，鍵盤DOM24／driver37皆未截斷並有真正reference-file chooser。這是前置的獨立Linux輪，與本次新來源各自記錄，不當作#123自然鍵盤逾時已修復。

已直接核對原 [CI #217](https://github.com/sunpochin/dance-stamp/actions/runs/41159155937) 三項成功，app job 124412781272 checkout精確ff4f842，Linux55 PASS／0 FAIL、九模組行數100%／函式97.03%／分支88.32%。本次與#128共存的來源、分母、67條同輪及最終乾淨head結果分開記錄，不混加舊計數。

完整預設保留原63條順序，再加離線逾時、清單讀取、未知媒體救援、草稿離頁四條。沿原`coverage-recovery.js`的mode入口與每輪合成副本；沒有另抄案例、縮短五秒期限、改素材或修改產品九份JS。原影格守門也叫recovery開頭，因此先辨識`recovery-frame-guard`並保留原TS函式分流，再處理一般恢復mode；否則會把影格守門誤送到一般恢復檔案。這只是測試轉接，不是新增產品修正。

## 沿用的使用者契約

| 原情境 | 保留的斷言 |
| --- | --- |
| 離線通知遺失 | 明示截住一次CHECK_OFFLINE，經原五秒期限顯示無法確認；完整metadata／revision／媒體指紋與cache keys不變，解除後真正worker重試成功 |
| 清單讀取中止 | 真正readonly交易abort、trusted AbortError與abort事件；公開課程入口顯示保全說明，重新檢查恢復原三份媒體 |
| 未知媒體救援 | 明示替換隔離庫中一份16-byte媒體，真正另存.bin且與獨立預置bytes完整相符；撤除QA故障後同一原片、asset／take與舊VS可重新取回 |
| 草稿離頁 | 標記／拍點／動作各經真正reload、原生beforeunload提醒及dismiss；trusted／prevented、同document、完整草稿／資料保留，明確取消後正常重載 |

每案均真正下載舊VS並與完整原生Blob指紋核對，所有metadata／revision／三份媒體指紋保留，正常重載再回查；擷取呼叫0、不留忙碌或未確認狀態。未知.bin是帶走原始bytes，不當作影片修復、自然損壞或可播放證據。五秒逾時與一次原生交易中止皆為明示測試控制，不冒稱自然Safari／OS故障。

## 驗證紀錄

選定`coverage/app-M8N4Ah/run.json`：5/5、0頁面例外、26次導航收集。原影格守門14,904ms、離線逾時9,381ms、清單讀取4,451ms、未知媒體5,227ms、草稿離頁4,772ms；五項擷取呼叫皆0。影格守門仍取得真正影格後才可提交，四條恢復均保留完整metadata／revision／三份媒體指紋、實際舊VS下載與正常重載回查。browserClosed／serverStopped均true、lockRetained=false。

九份產品來源SHA與#128本機完整63條相同。相對該完整輪，選定新命中main.js:900、1007及storage.js:17各兩次；原#127的六函式增量不能直接加到這個新來源。runner SHA-256 `8f9f38bb9487dc0202c6ae7904b5dbcb6b8c927b17b82ae9971eb48f78fa1cb3`；選定收據SHA-256 `3220cca28ac37be7a5adc4f19a794b2077f6ac74fb65eb93bcd2fba617f88a71`。來源d441cf0加測試／文件改動、trackedChanges=true，不改稱最終乾淨提交重跑。

正常`bun run check`通過：647項／3174斷言／0失敗、公開掃描295個已追蹤檔案、19項既有lint資訊，靜態仍d4a2a50194888b79。三份新採用／證據檔於提交暫存後再由正常hook掃描，最終hook與乾淨head的遠端結果另記於PR；不把本機工作樹收據改標為最終提交重跑。

### 完整同輪

`coverage/app-Txxk0r/run.json`：67/67、0頁面例外、299次導航收集，案例時間合計477,655ms。實際收據的前63個名稱及順序與#128本機完整輪一致。新增離線9,324ms、清單4,316ms、未知媒體5,277ms、草稿4,819ms，擷取呼叫皆0，原保全／下載／重試與正常重載斷言全部通過。原影格守門13,589ms、暖機5,213ms，main.js:1241與329的兩條取消callback在同輪各命中2次。來源d441cf0加測試／文件改動、trackedChanges=true；完整輪後只有文件整理，不改標成最終乾淨head重跑。

| 模組 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| web/beats.js | 18/18（100%） | 5/5（100%） | 23/23（100%） |
| web/library.js | 266/266（100%） | 124/124（100%） | 348/363（95.86%） |
| web/local-audio.js | 144/144（100%） | 32/32（100%） | 171/187（91.44%） |
| web/main.js | 1236/1236（100%） | 372/385（96.62%） | 1064/1266（84.04%） |
| web/offline.js | 68/68（100%） | 21/24（87.5%） | 50/50（100%） |
| web/recorder.js | 120/120（100%） | 45/45（100%） | 131/136（96.32%） |
| web/storage.js | 104/104（100%） | 41/42（97.61%） | 75/84（89.28%） |
| web/sw.js | 37/37（100%） | 12/12（100%） | 25/25（100%） |
| web/timeline.js | 23/23（100%） | 6/6（100%） | 39/39（100%） |
| **合計** | **2016/2016（100%）** | **658/675（97.48%）** | **1926/2173（88.63%）** |

全部9模組與skipped0保留，九份產品來源SHA與#128本機完整輪相同。同輪單元／VM基準763/2016行、277/675函式、817/2173分支（37.84%／41.03%／37.59%），不與瀏覽器百分比相加。相對#128完整輪，函式655→658、分支1918→1926，未失去任何原已命中分支臂；新函式仍是main.js:900／1007及storage.js:17各2次，不混加#127舊六函式計數。

剩17函式／247分支臂。未命中函式起始行：main.js `120,209,428,541,648,779,783,784,991,1165,1494,1632,1700`；offline.js `48,78,81`；storage.js `53`。分支缺漏：main.js202、library.js15、local-audio.js16、recorder.js5、storage.js9，其餘0。完整位置與計數保留在同輪app-coverage.json；行數100%不代表所有瀏覽器／裝置路徑均完成。

完整run.json SHA-256 `6b0a7987c630ad875c9a013a3208e270ad462bc71b4f964ae2f885df45913965`；app.json `bfcc5d14021bb5d0b8a0deb1108dc2ab9f4a344915a8975696515d0819f6bf7a`；app-coverage.json `9e9295b5c518c1d3c7298a48811f14d50c13746e62c7d00ff8b719c9c73c4736`。完整輪browserClosed／serverStopped均true、lockRetained=false；另核對9個已記錄PID的啟動時間與命令，原自有程序均退出、自有nonce已釋放，後續他人新鎖未接管。

### 網站外實際重播與原始檔回查

選定與完整輪的產品主機／瀏覽器停止後，核對11份真正VS下載：八份來自四條恢復案例各兩輪，兩份來自原影格守門，另一份是完整輪原匯出暖機的重試下載。完整大小／SHA播放前後一致，沒有改寫、轉碼或重新封裝。

以全新隔離Chrome156.0.8078.76原生file播放器及真正Space按鍵逐份從零播到ended，11/11 error0、1280×720、各一音軌、總掉格0、音訊解碼bytes皆正值。原生時長介於1.998967至3.005708秒，完整逐份時長保留raw，不調時鐘或補幀。FFmpeg8.1.2完整解碼全部影音軌，11/11 exit0且stderr空。headless音效靜音，這不是真人聽音、同步／鏡像品質或完整G1–G7。

兩份真正.bin下載各16 bytes，直接與獨立預置陣列逐byte比對，SHA-256均`acbfdf59b9c113e3aabd967c61494fca1ad5bf1954bf799cd3a3d49aaf270418`。不把未知原始bytes當可播放影片或影片修復。

原始收據`output/recovery-integration-playback.local.json` SHA-256 `eaadfdac9a00ed672fcdba38795bf30edd2ce4a974c91af32af21cd6c7a9d9cb`；本機轉接控制器SHA-256 `0a2eff8e2f80c79c43ed9daee6dc4231eb3bc394525c6ecf6a4e6ae1ea6b6a98`，直接沿原download-playback.js。8個已記錄自有瀏覽器程序均退出後才核對nonce釋鎖；共用鎖由另一條Safari程序持有時只查證並等候，未接管。所有合成媒體、下載及原始收據只留本機，不放入Git或公開附件。

### CI #219實際取消與整輪時間預算

檢查變多，整包作業包含安裝、單元基準、素材準備及收尾，需要足夠時間；不能把單項跑完當成整包通過。初版精確head `68dd595ecf0f299fb84457db574d8cec0dd6b253` 的[CI #219](https://github.com/sunpochin/dance-stamp/actions/runs/41161857709)最終為cancelled：harness與linux-install-restart成功，app-coverage job 124421158871被取消。已讀取相同head的GitHub check annotation：`The job has exceeded the maximum execution time of 12m0s`。這是整個job的時間上限，不是人工取消或個別功能逾時。

該日誌雖有67 PASS／0 FAIL與最終行數100%／函式97.48%／分支88.58%，仍不算CI成功，也不與本機88.63%分支混加。原始日誌SHA-256 `286a9f417d176f76e89975776781b0396fcd520354add6732710a3a5923e58df`；同head的annotation、狀態與原生鍵盤DOM24／driver37筆皆另保留，沒有要求重跑舊job或抹掉取消紀錄。

僅把app-coverage整體job預算12→15分鐘，仍有明確上限，讓67條原案例與前置正常結束。產品九份JS、runner、案例、原五秒離線／十五秒影格守門與其他等待期限、分母及全部斷言均不變。沒有縮短素材、刪案例或放寬個別失敗條件；正常check／hook與新精確head的遠端結果另驗，不將舊取消改標成功。

## 重跑與界線

固定Bun1.4.4，先`bun run check`，再`bun run test:coverage:app recovery-frame-guard recovery-offline-timeout recovery-inventory-read recovery-unknown-media recovery-draft-navigation`及完整`bun run test:coverage:app`。使用已安裝Chrome／FFmpeg、隔離合成素材與自有nonce的原子QA鎖；他人持鎖時核對活程序並等候，不接管。

#103保持開啟；原鍵盤Linux自然逾時、原生Safari／私人模式、G1–G7、真人聽音、實體／跨裝置及人工最終審查各自保留，iPhone延後。#114維持c351637開啟待審；所有來源PR保持開啟，沒有合併main或正式發布。
