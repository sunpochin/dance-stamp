<!-- 檔案用途：記錄完整原片已保存但暫存清理交易失敗時的恢復保全。所在層：#103 品質證據。主要關聯：recovery-frame-guard.ts、main.js、storage.js、TECHNICAL.md。 -->
# 清理暫存失敗，已找回的原片仍能用

中斷的練習片找回並存好後，清掉暫存片段只是收尾。即使收尾失敗，完整原片和其他筆記也應留下；重新開啟要直接讀已保存的原片，不重複保存。之後只刪這一段時，也應能連同殘留暫存清掉，其他影片與筆記不變。

## 接到目前main的驗證

PR #132已由外部操作合併，main更新到`3aa50ad3d3b15678338f50f9445b33b18a52e900`。本工作分支接入此固定版本，產品`web/`與該main逐檔完全相同；本PR自己的恢復案例仍為`901a5ecd3e4befb292946c0bdb5844dd213cb22dbbd7ce0a47f140dae48c1cee`，相對目前main只新增原測試尾段與兩份文件。

新main含Safari錄影聲路、恢復bytes獨立化與對應回歸調整，不能把下方舊產品的本機數字改記到新版。以下新輪的head仍為380e2b1、trackedChanges=true，工作樹包含MERGE_HEAD 3aa50ad；九份產品SHA逐一等於該main，同一HEAD字串不代表與舊CI #228相同產品。main本身的[CI #227](https://github.com/sunpochin/dance-stamp/actions/runs/41170754067)三項success，已核對checkout 3aa50ad與Linux67 PASS／0 FAIL，行數99.02%／函式97.19%／分支87.63%；其結果與本PR新輪各自歸屬。

新正常check648項／3178斷言／0失敗、公開掃描302檔、型別／lint／build完成，19項既有lint資訊，靜態版4525b1293b89a584。新原守門單項`coverage/app-m6CYdH/run.json` 1/1 passed、20,332ms、0頁面例外，收據SHA-256 `d4b42f05b4ede0c295dfe423473f5cdfffefc4f8ff33ea929315e886e5751d75`。新獨立入口`output/recovery-frame-tqkfH9/evidence.local.json` passed／exit0，同一守門901a5ec、靜態4525b129、擷取0、自有程序群組remaining0、nonce核對釋鎖；收據SHA-256 `5c71dec6560f21dcfc96d519703c202df77d922072876332f738f208c4e87a47`。兩輪原三條守門及新增清理保全都成立，原生清理abort各恰一次。

新自然完整輪`coverage/app-VxAb5J/run.json` 67/67 passed、exit0、0頁面例外、303次導航收集，案例時間合計483,046ms；原67條名稱／順序與runner不變。守門19,705ms、原生清理abort恰一次、目前main.js:1204的原catch函式量測命中2次，並保留全部舊資料／chunks、同profile重開不重寫與公開只刪目標；2是累積量測值，不當作兩次原生故障。原鍵盤825ms成功。新同輪單元基準行數764/2048（37.30%）、函式277/678（40.85%）、分支819/2207（37.10%）；完整輪如下，skipped皆0。

| 模組 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| web/beats.js | 18/18（100%） | 5/5（100%） | 23/23（100%） |
| web/library.js | 266/266（100%） | 124/124（100%） | 348/363（95.86%） |
| web/local-audio.js | 144/144（100%） | 32/32（100%） | 171/187（91.44%） |
| web/main.js | 1244/1264（98.41%） | 374/388（96.39%） | 1071/1296（82.63%） |
| web/offline.js | 68/68（100%） | 21/24（87.50%） | 50/50（100%） |
| web/recorder.js | 121/121（100%） | 45/45（100%） | 132/138（95.65%） |
| web/storage.js | 107/107（100%） | 41/42（97.61%） | 79/86（91.86%） |
| web/sw.js | 37/37（100%） | 12/12（100%） | 25/25（100%） |
| web/timeline.js | 23/23（100%） | 6/6（100%） | 39/39（100%） |
| 合計 | 2028/2048（99.02%） | 660/678（97.34%） | 1938/2207（87.81%） |

本輪未覆蓋20行都在main.js：577,578,579,584,585,586,587,588,589,591,592,593,594,616,617,618,619,626,627,635，屬新增Safari錄影分支；不以舊產品100%替代，也不把原生Safari其他來源的見證加進本輪。尚有18函式／269分支臂；未覆蓋函式位置為main.js的120,209,428,541,584,585,591,687,818,822,823,1533,1671,1739，offline.js的48,78,81及storage.js的53。全部原branch map與逐臂缺口留在原合併coverage，不刪檔案或重跑追高。

新完整輪原收據SHA-256 `c0ebd36f8a287518ba7080ecfb3f64c25cedbde89e58613f3fd0ea0ea3aec78b`，app.json `da06ea17ea407f15d86913e21abcff8341b731e740778e0733fd11b8387a4c93`，合併coverage `c9c8e0ff4ecfcb5e576cb283f36be378ece7ff47077f5a48e7318ad01a490190`。browserClosed／serverStopped均true、lockRetained=false，九個已記錄自有程序全部退出，自有nonce釋放。

網站停止後只取上述新版三輪各一份真正原片與VS，共六份實際下載；控制器另核對當前九份產品SHA、獨立入口4525版本與worker／storage原碼，避免混用舊來源。全新Chrome原生file播放器／真正Space由零播至ended，6/6 error0、各一音軌、音訊解碼bytes正值，全影音軌完整解碼6/6 exit0／stderr空。獨立入口的VS回報掉1格，其餘五份0格，照實保留不重跑；原片時長均4.010秒，VS分別1.999467／1.999167／2.000900秒。站外收據SHA-256 `ae1e1476d2d8da7d1278d466b9291a84d7f041002ed95d8416f0337c51ada897`，控制器 `17cd5d357519db88037ca01bee0f19ecaf0be444fe79304534ef49682324bdce`；另八個站外播放器自有程序全部退出，自有nonce核對後釋放。

新完整UI輪後產品／案例／runner不變，只補新版文件與交付證據；最終正常hook及新精確head CI另驗，未完成不先當作通過。新版原始收據、全部量測、原生二進位快照與真正下載另存本聊天附件`chunk-cleanup-recovery-103/main3aa`，舊來源及原CI歷史保留在原子目錄，不互相覆寫。

## 初版固定來源與範圍

2026-10-31，接續 [#103](https://github.com/sunpochin/dance-stamp/issues/103)，承接 [#131](https://github.com/sunpochin/dance-stamp/pull/131) 固定候選`53a8f097fb3f7257b82d13f9ae77c68e15594020`。前置本機完整67/67、0頁面例外，行數100%／函式97.62%／分支88.54%；該精確head [CI #223](https://github.com/sunpochin/dance-stamp/actions/runs/41168496630)三項success、Linux67 PASS／0 FAIL，行數100%／函式97.62%／分支88.58%，與本機及本次新來源各自歸屬；人工審查另計。

原`recovery-frame-guard.ts`的Stop／缺影格能力／播放拒絕、遲到原生影格與三次同輸入重試全部保留，沿同一個65秒合成來源的原4秒切片，末尾追加一段清理失敗恢復。原67條順序、runner、產品九份JS、素材及所有個案期限不變；不另抄恢復流程或直接呼叫產品handler。

原缺口是main.js:1165：`finalizeTake`先把完整原片與metadata寫入，之後`clearChunks`才做獨立清理；清理失敗只記`chunkCleanup=pending`，不得把已確認保存誤當全部失敗。前置完整輪沒有觸發此邊界，不能只靠正常恢復成功宣稱已驗。

## 真正交易失敗與驗收契約

1. 原三條守門全部完成後，保留完整舊metadata／revision、所有media與chunks，沿同一份已保存合成原片建立另一段明示中斷fixture，只放兩份原生chunks。
2. 真正reload後從該take的公開按鈕恢復，讓原生影片影格守門實際完成；只對目標資產、僅含chunks的readwrite刪除交易呼叫原生abort。保留引擎trusted request AbortError及transaction abort，不偽造Promise拒絕、事件、時鐘或完成通知。
3. 核對診斷pending、沒有保存未確認凍結、metadata只增加一次revision，完整原片SHA等於原4秒輸入、目標chunks與所有舊media／其他資料表逐byte保留，並真正下載原片比對完整bytes。
4. 移除已知QA注入後，在同一profile真正reload並公開重開已保存原片，完整metadata／revision、media與chunks都不再寫入；不是另開乾淨context假裝重試。
5. 經穩定take ID的公開刪除確認，只刪新增段及殘留chunks；全部資料表與原生媒體回到新增前，總revision精確增加三次（新增fixture、保存完整原片、刪除）。不直接呼叫clearChunks冒充使用者後續操作。

注入只在目標交易啟用一次，finally核對持有人後恢復原delete方法。這是受控原生交易中止，不冒稱自然磁碟／瀏覽器故障；原片保全、重開與公開刪除是實際產品路徑。

## 初版驗證紀錄（舊產品來源）

選定原恢復入口`coverage/app-PQUOgq/run.json`：1/1 passed、exit0、22,472ms、0頁面例外、7次導航收集，來源53a8f09加本次工作樹、trackedChanges=true。原守門流程直到最後完成事件前的全部步驟與斷言逐byte相同，才接新增尾段；原三個守門與全部同輸入重試保留。指定清理交易原生abort恰一次，trusted request AbortError與chunks-only readwrite abort各一次；pending、完整舊資料與暫存保全、同profile重開不重寫、公開只刪目標均成立。main.js:1165的原catch函式於合併coverage見2次命中，不把累積量測值說成兩次原生故障。

真正原片下載113,521 bytes，SHA-256 `b711bb2b4d67c9c9602057e0f91cb64d8dd5675802627b7ec0838f55e35e5e5c`等於原4秒切片完整bytes。單項收據SHA-256 `e558bba6451c363406c75fef04282cc2fa611ab2680ed01c26b446d99572d9d3`，修改後原守門案例 `901a5ecd3e4befb292946c0bdb5844dd213cb22dbbd7ce0a47f140dae48c1cee`；九份產品JS與runner指紋等於前置。browserClosed／serverStopped均true、lockRetained=false。正常check647項／3174斷言／0失敗、型別／lint／build完成，19項既有lint資訊，靜態仍d4a2a50194888b79。

首次獨立`--recovery-frame`在共用鎖取得階段因其他工作樹持鎖而退出，尚未啟動瀏覽器；`output/recovery-frame-Rmm2ER/evidence.local.json`只含EEXIST失敗、沒有spawn事件或自有程序群組，不能當產品失敗或已驗證。查證持有程序仍活躍後前景等候，未接管／清除其鎖。

其他工作自然釋鎖後，前景等候器沿原`--recovery-frame`入口完成，`output/recovery-frame-pFtuQ1/evidence.local.json` passed／exit0；來源53a8f09加本次工作樹、同一901a5ec守門指紋、產品靜態d4a2a50194888b79，禁止擷取且0次呼叫。原三條守門與新增清理保全全部成立，原生清理abort恰一次，真正原片下載完整SHA等於原4秒切片。原工具記錄自有程序群組退出、remainingGroupMembers=0，再核對自己的nonce釋鎖；收據SHA-256 `1ede986ff9a6dd35f5cfdbf2e0c1e76aa181ecc39db3464d6a70ebbe9ae53d5c`。本輪沒有跑default／pending-write／chunk-write程序中斷情境，不能代替它們。

自然完整輪`coverage/app-0fzEfn/run.json`：67/67 passed、exit0、0頁面例外、302次導航收集，案例時間合計482,135ms；原67條名稱／順序、runner、九份產品JS及單元基準均與前置本機完整輪相同。恢復守門20,048ms，新增原生清理abort恰一次、main.js:1165原catch函式見2次命中，所有原三條與新增保全斷言成立；原鍵盤752ms成功。行數2016/2016（100%）、函式660/675（97.77%）、分支1928/2173（88.72%）、skipped0，剩15函式／245臂照實保留。

與前置完整輪相比，函式／分支map逐項相同，新增main.js:1165一個函式、無舊函式遺失；新增storage.js:160的三個原生清理失敗分支臂，main.js:293／309載入分支本輪出現。main.js:681的預覽接近結尾歸零一臂本輪未出現，因此總分支淨增四臂；不混加別輪或追高重跑。來源仍53a8f09加本次工作樹、trackedChanges=true，不改稱最終乾淨head本機重跑。原收據SHA-256 `f3201d547677359663482dfc1a6169151787c25377f08b2725d95811e31236c6`，app.json `8580bff0a960943a96ec464c0919df0e8e28b17d14ac9fb81a6558be005386a1`，合併coverage `ceaf9376d0c6d79fe6c5cff8be761c55e3f82ddb1da23922517a09fed8f2fb45`。

完整輪browserClosed／serverStopped均true、lockRetained=false；九個已記錄自有程序全部退出，自有nonce核對釋放。網站停止後，單項／完整輪／獨立入口各一份真正恢復原片與舊VS，共六份實際下載，在全新Chrome原生file播放器以真正Space由零播至ended，6/6 error0、dropped0、各一音軌、解碼音訊bytes為正；全影音軌完整解碼6/6 exit0、stderr空。三份恢復原片原生時長均4.010秒；三份VS分別1.998733／2.000533／1.999700秒，照實記錄，不轉碼／補幀／調時鐘。站外收據SHA-256 `8b1c50f9b6041fe53d2942ab3b2000b5e42126fa5e15d852a5002ed1f59ce3e3`、控制器 `916ec3f715eeefb9335076a878f1c983a8fc9c65687824f5c27c85857198ff1a`，另八個站外播放器自有程序全部退出，自有nonce核對後釋放。

完整UI輪後產品／案例／runner指紋不變，只補文件與交付證據。最終正常hook及新精確head CI另驗，未完成不先當作通過。全部原始收據、完整coverage／baseline、原生二進位快照、六份真正下載、來源與全軌解碼另存本聊天附件`chunk-cleanup-recovery-103`，逐檔manifest核對；不公開profile或真人影片。這次未發現產品缺陷，不為覆蓋率修改產品保護或期限。

## 初版main同期更新的交付核對

交付時讀回GitHub，main已到`65eb135490ad1418df0ddd4f95dfb9256e425834`並合入原#118；#134因舊鍵盤診斷的重複來源發生衝突，CI尚未啟動。把該main接到本工作分支、保留來源提交，鍵盤檔維持本分支已含原#118與訂閱RPC就緒修正的完整版本。更正文案前，解決後的整份暫存樹與原ddf11ba樹完全相同，皆為`8bee018da55b2220e70389e5f00fb162a1c4b1be`，不只比九份產品JS；之後只更正本文外部狀態並記此核對。原本機UI收據仍歸53a8f09工作樹，新head正常hook／精確CI另驗，不改稱重跑本機UI。

後續精確舊head380e2b1的[CI #228](https://github.com/sunpochin/dance-stamp/actions/runs/41170845797)三項success，核對checkout此head、Linux67 PASS／0 FAIL，行數100%／函式97.77%／分支88.86%，守門48,285ms。此輪仍為舊產品d4a2a50194888b79，不能替代上方main3aa／4525的新來源驗證；原始日誌與同head jobs另存。

## 重跑與界線

固定Bun1.4.4、Playwright1.64.1與原Chrome／FFmpeg，先`bun run check`，再`bun run test:coverage:app recovery-frame-guard`與完整`bun run test:coverage:app`；獨立`--recovery-frame`也沿同一函式。共用QA鎖忙碌時查證活程序並等候，不接管、終止或釋放他人的鎖。

#103保持開啟，函式／分支未達100%照實保留；合成中斷fixture、4秒原片或解碼不代替自然程序中斷、Safari／私人模式、真人聽音、實體／跨裝置及G1–G7。iPhone延後；人工最終審查與本PR合併／發布各自保留。交付時GitHub顯示#114原head c351637已合併，本聊天沒有執行其合併；以實際外部狀態為準。
