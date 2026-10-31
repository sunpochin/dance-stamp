<!-- 檔案用途：記錄原生選檔訂閱就緒競爭、相同命令延遲對照與完整量測修正。所在層：#103 測試工具證據。主要關聯：comparison-keyboard.js、keyboard-protocol.ts、run-app.ts、issue-103-recovery-integration.md。 -->
# 測試工具準備好接通知，再按真正的Enter

按「選擇示範影片」時，測試工具也要準備好接住瀏覽器的選檔通知；如果按鍵先到，工具會以為沒有開選檔。這次修正完整量測的準備順序，仍透過可見按鈕、真正Enter與原生選檔完成，不直接替隱藏欄位塞檔案，也不改產品按鈕。

## 真正失敗與固定來源

2026-10-31，接續 [#103](https://github.com/sunpochin/dance-stamp/issues/103) 與 [#129](https://github.com/sunpochin/dance-stamp/pull/129)。精確head `ff39b0a791b5669627b00e14c884be6282e5f704` 的[CI #220](https://github.com/sunpochin/dance-stamp/actions/runs/41163364459)為failure，app job124425796113完整跑完但66 PASS／1 FAIL：comparison-keyboard等待filechooser15000ms逾時。harness及linux-install-restart成功；行數100%／函式97.48%／分支88.58%不能代替成功CI。原CI #219的12分鐘整輪取消與本次失敗分開保留，沒有重跑洗掉。

自然Linux失敗留下DOM20筆與原生driver12筆，皆未截斷：可見select-video確有trusted Enter／click，reference-file的委派click未被preventDefault，文件可見／有焦點；原生chooser0。相同host時鐘下，第二次Enter的keyDown回覆454254.788139先於攔截enabled回覆454254.997612。這是競爭線索，不能只憑回覆先後就宣稱所有歷史逾時同一根因。

完整失敗日誌SHA-256 `f0b73688ba96a735a3fadd86311572633303b0a51935343f758c811452040011`，原DOM／協定及失敗狀態各自保存；#123更早的自然逾時仍保留來源歸屬。

## 固定版工具的實際順序

檢查本機固定Playwright1.64.1原碼：client的`ChannelOwner._updateSubscription`呼叫`channel.updateSubscription(...).catch(...)`後立即返回；server的`PageDispatcher.updateSubscription`先等原生攔截完成，之後才把事件放入訂閱清單。因此「已呼叫waitForEvent」不代表整個訂閱已就緒，只等CDP回覆也早於完整server／client訂閱完成。

沿既有同程序診斷入口，旁聽原`connection.sendMessageToServer(page, 'updateSubscription', {event:'fileChooser', enabled:true}, ...)`的同一個Promise，原方法只呼叫一次、仍回傳同一Promise。只有這個原RPC成功回覆才視為準備好；失敗保留原錯誤。沒有額外原生命令或CDP session，不提早另外訂閱，不用固定睡眠猜時序。原client與原生觀察器都在finally核對持有人後恢復。

原comparison-keyboard新增可選的就緒callback，由完整入口傳入；原filechooser等待仍先開始，準備等待與它共用同一個15秒期限，準備未好就出現chooser也不能冒充真正按鍵結果。確認原RPC後才送原本的Enter，其餘可見入口、實際input ID、選檔、播放／暫停、微調與停止斷言不變。未傳callback的舊呼叫維持原公開API流程；不把此控制器的結果擴張成其他入口或版本已驗證。

這個private入口原本就限定於固定版同程序driver；新增方法缺失會明確失敗，升級Playwright須重新驗證。只修正完整量測的測試前置，不以它宣稱產品鍵盤有缺陷或Safari／真人操作已修復。

## 相同條件的受控對照

本機ignored preload只把真正`Page.setInterceptFileChooserDialog(enabled:true)`命令的派送延後250ms，其他命令原樣交給引擎；不扣住假回覆、不造filechooser／DOM事件、不改產品時鐘。兩輪沿原run-app選定comparison-keyboard、同一份原比較素材與原15秒期限，擷取由既有合成入口隔離。

未修正原版`coverage/app-X82X0Q/run.json`：來源ff39b0a乾淨、trackedChanges=false，1項failed／exit1、15,407ms、0頁面例外；真正Enter未取消、原生chooser0，確實重現原逾時。browserClosed／serverStopped均true、lockRetained=false。原始收據SHA-256 `f445031a50aa19972ef72bf3dfd8c6683899581228971cc5dd9441982b844a6b`；相同preload SHA-256 `56f135bf1f63a054c1214e0dc31172d3f1b6982ea9d91ed1d97a29b4a587a1a7`，實際命令由引擎完成，不把受控延遲說成自然Linux故障。

修正後`coverage/app-JEkULR/run.json`在相同preload／250ms延遲下1/1 passed、exit0，1,201ms、0頁面例外；所有原鍵盤入口／播放／暫停／數字微調／窄版停止與無溢出旗標均成立，真正chooser的input ID為reference-file。DOM24／driver43筆皆未截斷，包含原client RPC回覆；訂閱ack25888.817708早於真正Enter派送25889.485333，沒有額外原生命令。browserClosed／serverStopped均true、lockRetained=false。原始收據SHA-256 `8659d4edcf05445f994d1810c657a9fee86a3e39a33f4bcf21754c50a396bf63`。

修正對照來源ff39b0a加測試工作樹、trackedChanges=true，preload SHA與原版相同，不改稱最終乾淨head重跑。固定工具coreBundle SHA-256 `829521b67ed7be90c7d6d6098ff39f2241562d47e4ad7ccab13710924a56001d`；修正後observer `6d17d867e62d128a793f2bc348f8279fbdb0167c9418386a2760aff4420c5e26`、原UI案例加入callback後 `6db378281e3efe6113dd43151beb33230cb960e697d9ae7f7ce1762c471de498`、runner `ce8270449ec0a4c427619d6d6f0dd0d9b792f1e1390bd3dca8b6aced97ee8e62`。原版失敗與同延遲修正成功各自保存，僅支持此訂閱就緒競爭可重現並可排除，不抹掉其他歷史逾時。

另以相同preload／250ms延遲、明示對真正select-video Enter呼叫preventDefault，修正後`coverage/app-MBcGzW/run.json`仍1項failed／exit1、15,381ms，原filechooser15000ms逾時成立。DOM16／driver16筆未截斷；原訂閱已確認，真正trusted keydown在捕獲與冒泡皆prevented，原生chooser0，沒有拿別的事件或隱藏輸入替代。0頁面例外、browserClosed／serverStopped均true、lockRetained=false。收據SHA-256 `f6d6dd34143f9fa80caaefe88c06223fc5e0968a6f95e25dbd976b8024d717b8`。這是預期的負對照，證明就緒修正仍會抓到真正鍵盤行為失敗，不混作正常矩陣通過。

## 不注入延遲的完整輪與真正下載

後續自然完整輪`coverage/app-KBRKNo/run.json`，沒有preload、延遲或按鍵取消注入，67/67 passed、exit0、0頁面例外、299次導航收集；案例時間合計474,675ms。來源ff39b0a加本次測試工作樹、trackedChanges=true，原67條名稱／順序、九份產品JS指紋與單元基準均與前次完整輪相同。最終行數2016/2016（100%）、函式658/675（97.48%）、分支1926/2173（88.63%）、skipped0，沒有以省略檔案／案例改分母；仍有17函式／247分支臂未覆蓋。原始收據SHA-256 `888b61e1df15dd630149b4ec95f0f19199ecd4d74400140d6306bf933898cc41`，app.json `e3685a72e081fa20e0a3a30484df7583ff2286ee265a1864e05605c148c49341`，原合併coverage `4239b416c0357dcbe017bef2499294874050b5164c7478acd3109f7a67368406`。

同前次完整輪相比，函式與分支總覆蓋數相同，但分支命中集合不同：main.js:293／309的readyState<2本輪出現，1691／1692的指標取消分支本輪未出現，各兩臂；不把不同輪合併成較高覆蓋，也不追高重跑。函式與分支map逐項相同，未覆蓋清單仍以本輪原收據為準。

本輪鍵盤811ms，所有原功能旗標成立，DOM24／driver43筆未截斷，真正reference-file chooser1次。原訂閱RPC回覆328852.330250早於真正Enter派送328852.396625。整輪browserClosed／serverStopped均true、lockRetained=false；另以完整輪10個已記錄自有PID回查，全部退出且自有nonce釋放，沒有接管他人的鎖。

網站停止後，只取本次完整輪真正下載的六份VS（四恢復、影格守門、暖機各自原輸出），全新Chrome原生file播放器／真正Space由零播到ended，6/6 error0、各一音軌且解碼音訊bytes為正；暖機輸出回報掉1格，其餘五份0格，照實保留、不重跑抹掉。完整全影音軌解碼6/6 exit0、stderr空。原生時長1.999200–2.984396秒照實記錄，不補幀／轉碼／調時鐘。真正未知原始檔.bin為16 bytes，與獨立預置陣列逐byte相同、SHA-256 `acbfdf59b9c113e3aabd967c61494fca1ad5bf1954bf799cd3a3d49aaf270418`，不當作可播放影片。站外收據SHA-256 `068aa45af93502d039741961589dc192ef86e9a07628653f7ee9e9084817e437`，控制器 `e54fc9408a5c82c203bc86f40a5753470732297753e0fd2456e20da29e0a6f3b`；另8個站外播放器自有PID全部退出，自己的nonce核對後釋放。

正常`bun run check`與Bun編譯／JS語法檢查已通過；最終正常hook與新精確head CI完成後另記，未完成項目不當作通過。完整UI輪後測試來源不變，只補文件與交付證據，不改稱最終乾淨head重跑。正常成功一次不能抹掉CI #220或更早的自然失敗。

原始CI失敗、三個因果／負對照、自然完整輪、六份真正下載／一份原始.bin、對應來源與完整解碼收據另保存在本聊天站外附件`keyboard-readiness-103`，逐檔manifest核對；不公開瀏覽器profile或真實相機內容。

## 重跑與界線

固定Bun1.4.4及Playwright1.64.1，先`bun run check`，再`bun run test:coverage:app comparison-keyboard`與完整`bun run test:coverage:app`。原67條順序與產品九份JS分母不變，所有合成原始資料與控制器只留本機。共用QA鎖忙碌時查證活程序並等候，不接管或終止其他聊天。

#103保持開啟；人工審查、原生Safari／私人模式、真人／實體／跨裝置與G1–G7各自保留，iPhone延後。#114維持c351637開啟待審，未合併或正式發布。
