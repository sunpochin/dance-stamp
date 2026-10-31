<!-- 檔案用途：記錄非空練習清單刪除待補原片片段時的其他資料保全。所在層：#103 品質證據。主要關聯：deletion.js、main.js、storage.js、TECHNICAL.md。 -->
# 刪除正在補片的一段，其他練習仍能打開

同一堂Salsa課有好幾段練習，只想刪掉正在等待補原片的那一段時，其他影片和筆記應該留下。刪完後也要能重新打開保留的原片、匯出VS並真正下載。這次在原刪除回歸最後加這個情境，不改產品程式。

## 固定來源與缺口

2026-10-31，接續 [#103](https://github.com/sunpochin/dance-stamp/issues/103)。從同步main建立的本聊天獨立分支，承接 [#129](https://github.com/sunpochin/dance-stamp/pull/129) 固定候選 `935e768ad180876cfe45710e0e03cb6d0e98bcba`。前置CI #219整輪12分鐘取消、CI #220的66/67鍵盤失敗均保留；前置另修完整量測的選檔訂閱順序，本機因果對照與自然67/67已完成，精確head CI #222另記，不把舊取消／失敗改稱成功。本次不改前置runner或鍵盤案例。

原`tests/browser/deletion.js` SHA-256 `032b96ce29aeee6b16a64e19e77bede0cd426ae8a09a2581d5e57d37d1cf2e37`，已有一般多take、共用副本、原生交易abort／取消、整份筆記刪除及「等待補片」刪除。但最後一個缺片案例刪完沒有其他take，不能驗證清單非空時仍只清掉目標等待狀態。main.js:991的pendingTakeId查找callback因此在前置完整輪仍為0；不能直接呼叫handler或塞假計數來補。

保留原案例的所有步驟、斷言與回傳旗標，再於末尾追加公開UI流程。預設仍67條、順序與runner不變。原80／75秒比較來源不縮短；新增另一段沿用原準備器已有的self-0.75來源，不產生新圖樣或換掉舊素材。

## 新增驗收契約

1. 透過原控制把新情境設為三秒，保存既有原片副本並加入非空標記／筆記，固定所有資料表陣列與全部原生媒體bytes／MIME／SHA。
2. 同課程再選另一段session-only原片，真正重載後經該take的穩定ID開啟，確認缺片提示及無自拍src，才當作待補片情境。
3. 經穩定ID預覽／確認只刪此段；所有原資料表陣列回到新增前的保存狀態、原生媒體完整指紋相同，revision只增加一次，待補片／舊下載／播放器src均清空。
4. 經另一段原take的公開按鈕重新開啟真正解碼影片；再次匯出VS，原take記錄與媒體保留，真正download／saveAs的完整大小與SHA等於原生保存的VS。

三秒只用於追加情境的重新匯出，不改原案例的五秒基準或長來源；這不是完整長片／G1–G7驗收。原交易失敗、取消、跨頁鎖、共用副本及空清單缺片案例斷言全部保留，不用新情境取代舊結果。

## 驗證紀錄

選定原deletion加本次尾段`coverage/app-zPBrIo/run.json`，1/1 passed、exit0、13,665ms、0頁面例外、10次導航收集；來源935e768加本次工作樹。原十個回傳旗標全部成立，保留兩段既有take、原片兩份完整指紋及所有資料表陣列，刪除revision只加1；原生保存原片重開、真正VS下載81,217 bytes與保存SHA相同。main.js:991兩個原some callback各命中4次，其中原未覆蓋的pending查找回呼確實經UI命中。收據SHA-256 `5dc143757b14f746f9f1059bd611f5d0386249c62fc92665a798e9b466db7ce0`，browserClosed／serverStopped均true、lockRetained=false。

原案例第一步到原return前所有步驟與斷言逐byte相同，僅在末尾追加；修正後案例SHA-256 `57961f0c25a615e321d70354401cff07065058d47be4c7edb7d9c264a4e52a39`。正常check 647項／3174斷言／0失敗，型別／lint／build完成，19項既有lint資訊，靜態仍d4a2a50194888b79。

自然完整輪`coverage/app-dGyRuF/run.json`，67/67 passed、exit0、0頁面例外、300次導航收集，案例時間合計478,702ms；原67條名稱／順序、runner、九份產品JS及單元基準均與935e768前置本機完整輪相同。deletion13,356ms、新pending查找callback4次；原鍵盤799ms通過。行數2016/2016（100%）、函式659/675（97.62%）、分支1924/2173（88.54%）、skipped0；函式確實比前置多main.js:991一個、沒有失去舊函式。分支map相同但本輪未出現main.js:293／309的readyState<2兩臂，不能混加別輪或追高重跑；剩16函式／249臂照實保留。

完整輪來源935e768加本次工作樹、trackedChanges=true，不冒充最終乾淨head重跑。原收據SHA-256 `d15082f89d6184d302a05e155fe83a8b548766f6f4747e685105cc6f83ccf6e9`，app.json `b068f4fbce732c4a012c3d72440156d31cadb3b90ad7852bac1e46a8b0c0fe04`，合併coverage `abefd2396407c781d109603a22796955e82a06586186c19b665b047831e29f37`。整輪browserClosed／serverStopped均true、lockRetained=false；九個已記錄自有程序全部退出、自有nonce釋放，未接管他人測試。

網站停止後，選定與完整輪真正下載的兩份VS（81,217／80,003 bytes）在全新Chrome原生file播放器，以真正Space由零播至ended，2/2 error0、dropped0、各一音軌，音訊解碼bytes10,990／10,910；全影音軌完整解碼2/2 exit0、stderr空。原生時長2.998633／2.967167秒照實保留，不補幀或轉碼。原生保存／真正下載／站外讀取的完整SHA相同。站外收據SHA-256 `17d86688b0d0a12bf2343f3a59eb0061469574a449aa63be059c496f315c729d`、控制器 `ca3be902b8681480751a9b60674e12ec8dad8cfa18e41ca597006ecfc08c2e6f`；八個站外播放器自有程序全部退出，自有nonce核對後釋放。

完整UI輪後產品／案例／runner來源不變，只補文件與交付證據。最終正常提交hook及新精確head CI另驗，未完成不先當作通過。原始收據、完整coverage／baseline、合成輸入與真正下載、來源快照／站外解碼另存本聊天附件`pending-take-delete-103`，逐檔manifest核對；不公開瀏覽器profile或真人影片。

## 重跑與界線

固定Bun1.4.4，執行`bun run check`、`bun run test:coverage:app deletion`與完整`bun run test:coverage:app`。沿本聊天隔離合成資料、原子QA鎖與自有nonce；他人仍測試時只查證並等候，不接管。

這是刪除保全的追加回歸，未重現產品缺陷就不修改產品。#103仍開啟；前置選檔修正與全部歷史Linux失敗各自保留來源，不擴張為所有入口已驗。G1–G7、真人聽音、原生Safari／私人模式、實體／跨裝置與人工最終審查各自保留，iPhone延後。#114維持開啟待審，未合併或正式發布。
