<!-- 檔案用途：固定 #103 Linux 鍵盤選檔逾時的證據與未解界線。所在層：工程診斷證據。主要關聯：comparison-keyboard.js、issue-103-vs-share.md。 -->
# #103 Linux 鍵盤選檔：原始測試的就緒競爭

## 怎麼看這次對照

把選檔想成按門鈴：瀏覽器真的響了，測試工具也要準備好接通知。這次用同一份舊程式，固定比較「直接按」、「先跑原本的前置」、「通知準備變慢」與「確認能接通知後才按」。最後故意取消一次真正點按，確認有問題時仍會在原本15秒失敗，不會只留下成功畫面。

後續 PR 的 **Keyboard Linux controls** 檢查會各執行一次預先列出的條件；展開 **Preserve only the anonymous receipt** 可看原生按鍵、攔截命令／回覆與真正選檔通知。這有助於分辨準備順序與產品按鈕故障，不能單憑一輪成功保證偶發問題不會回來。完整 App 的驗收仍看自己的原回歸，不把明示失敗對照算成產品正常通過。

2026-10-31最初階段只交付診斷與未解原因；以下保留當時版本歸屬。最新Linux對照已在原始程式自然重現就緒競爭，結果見文末；仍不用成功重跑或覆蓋率代替原失敗證據。

## 來源與範圍

從同步 main `d83755239bf145e9b79d50263208edfad83754e8` 建獨立分支，再 fast-forward 接入 [#116](https://github.com/sunpochin/dance-stamp/pull/116) 的不可變候選 `fac86787c57e3d36195a2c9b2e0331de87e879f0`。此前置包含 #113 Git fixture 環境隔離；沒有修改、推送或取代 #116 的分支。#114 仍固定 `c3516376982e646097a7700798cf88a0fd438649`、保持開啟待審查。

本次只改鍵盤案例與本文。產品、共用 runner、其他媒體回歸、資料格式與門檻不變，故無新增產品／架構決策需要更新 TECHNICAL.md。沒有合併、發布、存取真相機／麥克風或宣稱裝置驗收；iPhone 暫緩。

## 歷史失敗與成功各自保留

| 精確來源 | Linux 工作 | 結果及意義 |
| --- | --- | --- |
| `f1ac4efa3d0277a9c5b605a2acbe639ef22a7aec` | [CI #203](https://github.com/sunpochin/dance-stamp/actions/runs/41124372390)，jobs `124299383514`、`124305166119` | 兩次45/46，comparison-keyboard等filechooser15秒逾時。沒有失敗時的DOM／協定事件，不能判定是哪一層漏掉。 |
| `b28dff5406a1e2261dfb2dd8acb02e6b0fc98910` | [CI #204](https://github.com/sunpochin/dance-stamp/actions/runs/41127883753) | 46/46。只加失敗才輸出的唯讀診斷，沒有捕獲失敗，不是修復。 |
| `f60b2c7f80e8f0de1cecccfbc25a6469a220beae` | [CI #205](https://github.com/sunpochin/dance-stamp/actions/runs/41131470409) | 47/47。沒有重現，不是根因已解。 |
| `fac86787c57e3d36195a2c9b2e0331de87e879f0` | [CI #206](https://github.com/sunpochin/dance-stamp/actions/runs/41136003419)，app job `124338781564` | 本次唯讀核對checkout與完整日誌：48/48、0 FAIL；鍵盤案例1495ms；harness／linux-install-restart亦success。行數99.85%、函式96.29%、分支87.74%，只屬該Linux輪。仍無失敗事件。 |

舊macOS單項、焦點對照及恢復前置加十次鍵盤成功，維持[原始歸屬](issue-103-vs-share.md#linux-ci-的既有鍵盤選檔逾時尚未修復)，不拼成Linux失敗的解釋。本次沒有要求重跑上述CI。

## 原生命令順序基線

在未修改的 `fac8678` 執行一次 `DEBUG=pw:protocol bun --no-env-file tests/app-coverage/run-app.ts comparison-keyboard`，目的為觀察協定順序。macOS arm64、Bun1.4.4、Chrome156.0.8078.76、playwright-core1.64.1；`coverage/app-ai0MVD/run.json` 為selected、trackedChanges=false、1/1、0 page errors，案例1009ms。本機沒有運作中的Linux Docker daemon，未把macOS冒充Linux重現。

同一Chrome session的實際順序如下（完整協定只留本機）：

1. 第一次Enter keyDown／keyUp（命令62／63）啟用入口，原斷言確認焦點在select-video。
2. 送出 `Page.setInterceptFileChooserDialog(enabled=true)`（67）。
3. 送出第二次Enter keyDown（68，autoRepeat=false）。
4. 收到67成功，再收到68成功；接著送keyUp（69）。
5. 收到真正 `Page.fileChooserOpened(selectSingle)`，帶backendNodeId；`DOM.resolveNode`（70）解析為 `input#reference-file`，接著Playwright waiter完成。
6. waiter移除最後listener後送出攔截關閉（73）。原案例以真正FileChooser.setFiles選檔，後續播放、暫停、毫秒保存、窄版與停止斷言通過。

這輪沒有觀察到「鍵盤命令先於攔截命令送出」，也沒有遺失backendNodeId或FileChooser。攔截確認在keyDown送出後才回到控制器；這不能證明Chrome未依順序處理命令，更不能指定它是#203根因。

固定依賴實作顯示：client `ChannelOwner._updateSubscription` 不回傳供測試await的確認；首次filechooser listener觸發 `PageDispatcher.updateSubscription`，再由CRPage設定攔截。Chromium的fileChooserOpened還需有backendNodeId、找到frame、解析node，最後才有client FileChooser。DOM input click與client chooser之間有多個可能失敗邊界；目前沒有失敗輪資料可選定其中一個。

## 本次診斷改動

- 保留focus → Enter → 焦點斷言 → waitForEvent → Enter → 真正FileChooser。送第二次Enter前沒有新增await、睡眠、提前listener、重送或延長15秒門檻。
- 唯讀紀錄捕獲／冒泡的focus、keydown、keyup、click、defaultPrevented、disabled、trusted、activation、activeElement、document.hasFocus與visibility。最多64筆並明示截斷；不記筆記、檔名、bytes或外部網址。
- 控制器以單調時間記waiter-requested、enter-requested／completed、chooser-resolved、file-loaded。requested不宣稱瀏覽器已確認；hostTime與頁面time屬不同時鐘，不跨層相減。
- chooser到達後確認它屬於reference-file；成功與失敗都輸出同格式匿名收據，成功收據另進既有run.json。額外頁面讀取均在Enter／chooser之後。

診斷listener本身會增加少量時間；新成功不能排除觀察者改變競爭時序。基線協定也顯示Playwright的頁面evaluate帶userGesture=true，既有焦點斷言與事後snapshot均會用到evaluate；因此snapshot.activation不能獨立證明按鍵當下的資格，事件內取樣也不能排除更早evaluate的影響。須連同trusted Enter／button click與原生協定判讀，不把activation=true當作硬體輸入或單一根因證據。沒有改產品來迎合尚未證實的猜測。

## 後續判讀與未解條件

| 下一次實際失敗的證據 | 調查方向 |
| --- | --- |
| select-video沒有trusted keydown，或焦點／disabled改變 | 焦點移動、頁面啟動與按鍵送達。 |
| trusted keydown已到但defaultPrevented=true、或沒有button click | 取消按鍵預設動作的來源。 |
| button／input click均到、input click捕獲時有activation且未取消，仍無chooser | 需同輪原生協定核對攔截、fileChooserOpened、backendNodeId、node解析與client通知。 |
| 原生fileChooserOpened已到但waiter未完成 | frame/node解析與Playwright通知鏈；DOM trace單獨不能證明。 |

再失敗時保存同一head、同一次attempt的匿名收據與原生協定順序。具體診斷輪可設定 `DEBUG=pw:protocol`；不先安裝額外filechooser listener，不公開含本機路徑與合成資料的整份協定。只有捕獲可重現缺陷後才另作最小修正，保留修正前失敗／修正後通過的證明。

## 本機驗證與指紋

正常 `bun run check`：645 tests／3160 expects／0 fail，型別、公開掃描、lint與build通過；19項既有lint info保留，產品靜態版本仍 `b55f6595864e728d`。最後正常hook與本分支精確head CI另記PR，不挪用前置結果。

本次另以未插樁產品、同版隔離Chrome／Playwright，在提交前工作樹（parent fac8678，診斷修改在場）執行三種對照，全部達到預期，0 page errors；不與完整App覆蓋率混加：

- 無注入：原生Enter → reference-file FileChooser與全部原斷言通過，638.54ms。
- 明示在select-video keydown呼叫preventDefault：原門檻15000ms等待chooser逾時（整案例15069.28ms）；trace顯示trusted Enter、prevented=true，沒有reference-file click。
- 明示在reference-file click呼叫preventDefault：同樣原門檻逾時（15058.24ms）；trusted Enter／button click與未受信任的input click均到達，input click的prevented=true、當時activation=true。

負對照不改產品，不以setInputFiles替代待測的示範選片，不屬自然Linux重現。只用本聊天忽略目錄內的臨時控制器與合成素材；正常輪的全部原斷言仍由同一comparison-keyboard.js執行。沒有為取得綠燈重跑失敗案例。取得鎖之前兩次等待期限結束均未啟動瀏覽器，相關日誌另留本機。

成功輪的事件鏈也排除了幾種容易誤讀的順序：

| 成功輪事件 | trusted | activation | 解讀 |
| --- | --- | --- | --- |
| existing-mode keydown／click | true | true | 原生Enter啟用入口，handler把焦點移到select-video。 |
| 第一次Enter的keyup，target=select-video | true | true | 焦點已移動，keyup換target是正常結果。 |
| 第二次select-video keydown、button click捕獲 | true | true | 待測的原生鍵盤啟動。 |
| reference-file click，捕獲／冒泡 | false | true | 同步input.click()轉接；不是應要求trusted=true的事件。 |
| 外層select-video click冒泡、第二次keyup | true | false | 正常chooser啟動已消耗資格，不能從事後false推論按鍵前沒資格。 |

原子取得共用媒體鎖、保存nonce，await自己browser.close後才核對nonce釋放。另唯讀記錄並核對自己已知控制器與Chrome PID均退出；receipt為browserClosed=true、lockRetained=false，沒有終止他人程序或移除他人鎖。

| 本機收據 | SHA-256 |
| --- | --- |
| 前置#206 app job完整日誌 | `1a18b176039b54e7aa3b08ab4a3b0cd4c7f1d3765af2c6b873aabc976d367452` |
| 未修改fac8678的selected run.json | `72ac350ac55f282906fc24c60fa460c2facf61a620690a1a981e831a1111ec9d` |
| 同輪完整原生協定日誌 | `7fbdf9d5c2a6f49ca1678ca95227cd4b53fa4b0d0fd3359712c2662d442dcadf` |
| 診斷案例comparison-keyboard.js | `007cf8a516b248b5a3c125c55cd902ada97a859719394edabd141f0964f2d228` |
| 本機三種對照fault-controls.json | `4a4492e969bf3db770870f762ddf3893b08efd756a7a7cdeef92698e50cac956` |
| 本機三種對照fault-controls.log | `47c202bb53456e0fbd701a156e8541059ecb52a9c92d3215437092195268381b` |
| 固定playwright-core1.64.1 coreBundle.js | `829521b67ed7be90c7d6d6098ff39f2241562d47e4ad7ccab13710924a56001d` |

#103保持開啟，本分支仍待使用者／Claude Code最終審查。

## 2026-10-31 後續：固定 #203 原碼的 Linux 因果對照

唯讀現況：#118 已於 `2026-10-31T04:31:42Z` 合併（台北12:31），早於本次續查；本次不執行合併。後續分支從同步 main `e6f0300aa9ce1c882ec1887f5f792ee8fe6b63de` 建立，結果回填 #118，程式以獨立後續 PR 交付。

main 已含 [#129](https://github.com/sunpochin/dance-stamp/pull/129) 的訂閱就緒修正；其[原始證據](issue-103-keyboard-readiness.md)捕獲 CI #220 的自然 Linux 逾時，另有本機相同250ms延遲下的舊流程失敗／就緒流程成功。這支持該次競爭，沒有證明缺少事件的 #203 必然同因。本次重用其 `observeKeyboardProtocol`，不另造一套協定解析器或改動共用 runner。

每組由 GitHub 的 Ubuntu24.04 全新工作執行，固定歷史 checkout `f1ac4efa3d0277a9c5b605a2acbe639ef22a7aec`、Bun1.4.4、Playwright1.64.1、原產品、原鍵盤案例、原 runner 與合成素材。原38個前置／目標案例的來源順序直接讀取該提交並驗證；不把當前main產品帶入舊來源。各組另記實際Chrome版本，舊 #203 當時的完整OS／Chrome映像仍不可還原，不能說是完全相同的機器。

| 固定組別 | 前置 | 真正攔截命令延遲 | Enter前等原訂閱RPC | 預先預期 |
| --- | --- | --- | --- | --- |
| cold | 直接原鍵盤案例 | 無 | 否 | 原斷言通過；若自然失敗則保留紅燈與收據。 |
| prefix | 原前37案，再同一鍵盤案例 | 無 | 否 | 同上，用於檢查暖前置的影響。 |
| delayed | 直接原鍵盤案例 | 250ms | 否 | 真正Enter早於攔截派送、原15000ms逾時，仍保留原案例exit1。 |
| ready | 同delayed | 同250ms | 是 | 原生reference-file chooser與全部原斷言通過。 |
| cancel-input | 同ready，但明示取消reference-file click預設動作 | 同250ms | 是 | 原15000ms逾時、原案例exit1，證明失敗防線仍有效。 |

冷／暖是未注入的觀察；delayed／ready是相同受控延遲的因果對照，cancel-input是明示負對照，均不得改稱 #203 的自然重現。若與預期不符，控制工作直接失敗並保留原值，不自動重試、改預期或追綠。預期逾時的控制器成功只表示捕獲了指定的原案例失敗，不能算成正常App矩陣通過。

適配器以Bun preload在記憶體旁聽原本的方法，歷史磁碟來源保持乾淨。只有明示ready組會在原選檔等待開始後，讓真正Enter共用該waiter的原15秒期限等待原client RPC；沒有另開較長期限。延遲組只延後真正 `Page.setInterceptFileChooserDialog(enabled:true)` 派送，下層觀察器的send仍記交給driver的實際時點，回覆由引擎完成；不造回覆或事件。送Enter以前不額外evaluate；成功或原期限失敗後才讀DOM收據。

收據包含原生trusted／prevented／activation、同程序原命令send／ack、原訂閱RPC send／ack、native-filechooser及命令延遲的開始／結束，driver時間同用host performance時鐘；頁內事件時間另列，不跨時鐘相減。只取最後一個確由existing-mode Enter進入的目標頁，不混用前置案例的chooser成功。觀察器仍可能改變競爭時序，且使用固定版私有driver入口；方法缺失、截斷或無原生資料都視為診斷失敗，不能當成功。

只有匿名白名單收據會列入Actions日誌；完整runner輸出、素材、profile與原始內容不公開。GitHub每組在不同VM，沿原runner自己的原子媒體鎖及nonce收尾，另從已知啟動PID確認瀏覽器退出。文件回填不觸發另一輪控制工作，只有診斷程式／工作流程變更才會執行新候選。

本機正常check已完成648 tests／3179 expects／0 fail，19項既有lint info保留；腳本編譯與歷史Playwright適配器載入檢查亦通過，沒有啟動本機瀏覽器。最初受限環境的HTTP臨時埠監聽失敗，改以正常權限執行同一測試及完整check通過，未改測試或跳過hook。Linux實際數字與精確來源見下一節，並同步回填PR。這份工具不修改已合併 #129 的實作、不倒退其準備順序，也不取代人工審查、Safari／真人／實體裝置或G1–G7；iPhone仍暫緩。


## Linux實際結果：兩次自然逾時與固定因果對照

[Keyboard Linux controls #1](https://github.com/sunpochin/dance-stamp/actions/runs/41179000656)，診斷提交 `9842089d890830ea9489e32880da4b5a362042fc`，由[後續PR #140](https://github.com/sunpochin/dance-stamp/pull/140)啟動。五組各一次，沒有重跑。全部都是Linux x64／Bun1.4.4／Chrome156.0.8078.47／Playwright1.64.1、歷史f1ac4ef；產品／原案例／原runner／觀察器指紋一致，歷史磁碟來源前後乾淨。

| 組別（原工作） | 原案例結果 | 選檔waiter觀察值 | DOM／driver筆數 | 真正chooser |
| --- | --- | --- | --- | --- |
| [cold](https://github.com/sunpochin/dance-stamp/actions/runs/41179000656/job/124472350704) | **自然失敗**，案例16,822ms、exit1 | 原15000ms逾時，觀察15,002.474ms | 20／12，未截斷 | 0 |
| [prefix](https://github.com/sunpochin/dance-stamp/actions/runs/41179000656/job/124472350726) | 原前37案全過，只有鍵盤自然失敗，案例16,157ms、exit1 | 原15000ms逾時，觀察15,002.915ms | 20／12，未截斷 | 0 |
| [delayed](https://github.com/sunpochin/dance-stamp/actions/runs/41179000656/job/124472350555) | 明示延遲下預期失敗，案例17,075ms、exit1 | 原15000ms逾時，觀察15,003.097ms | 20／12，未截斷 | 0 |
| [ready](https://github.com/sunpochin/dance-stamp/actions/runs/41179000656/job/124472350757) | 相同250ms延遲，原案例**通過**，3,453ms、exit0 | 原waiter內確認RPC後送Enter | 20／39，未截斷 | 1，reference-file |
| [cancel-input](https://github.com/sunpochin/dance-stamp/actions/runs/41179000656/job/124472350722) | 明示取消下預期失敗，案例16,698ms、exit1 | 原15000ms逾時，觀察15,001.833ms | 20／12，未截斷 | 0 |

案例時間另含導覽／前置及收尾，不能把16–17秒誤寫成放寬了原15秒waiter。觀察值由同一host時鐘的waiter-requested／rejected相減；原始固定期限沒有變動。兩個自然組的工作保持 **failure／紅燈**；另外三個控制工作success只是符合事先預期，其中兩個仍保留原案例exit1。整個控制workflow因此是failure，不寫成五項產品流程全通過，也沒有改預期或重跑洗掉紅燈。

### 失敗當下的原生順序

cold與prefix沒有命令延遲或取消注入，`delays=[]`。兩輪都是select-video的trusted Enter與button click已到達、未取消，reference-file同步click也未取消；active仍在select-video、disabled=false、文件可見且有焦點、事件內activation=true，仍未收到原生chooser。這些是受控工具下的原生DOM資料，不代表真人／硬體操作已驗收。

同一輪內的host performance時間如下；不跨VM相減：

| 步驟 | cold（ms） | prefix（ms） |
| --- | --- | --- |
| 原訂閱RPC開始 | 50414.221554 | 374345.985646 |
| 真正攔截命令派送 | 50415.652189 | 374346.331877 |
| Enter keyDown派送 | 50415.899255 | 374346.475667 |
| **Enter keyDown回覆** | **50421.801802** | **374347.440116** |
| 攔截命令回覆 | 50421.916578 | 374347.571667 |
| **原訂閱RPC回覆** | **50422.043848** | **374347.621390** |

所以「攔截命令先排入」不等於「已準備好接通知」。兩輪按鍵已完成，完整訂閱尚未確認；沒有focus遺失或preventDefault的證據。原固定版client呼叫訂閱後立即返回，server要在原生攔截完成後才完成訂閱登記，與 #129 已追出的缺少就緒依賴一致。只憑回覆先後不能推論Chrome內部每個執行步驟；結論另由以下單一變因對照支持。

### 同延遲比較與仍有效的失敗防線

delayed只延後真正攔截派送250ms：Enter keyDown在52699.481237送出，真正攔截到52949.559873才送出，原RPC52950.325398才完成；未取消的原生Enter／click仍導致原15秒逾時、chooser0。

ready使用同一250ms延遲，只讓按鍵先等原RPC：訂閱50780.471951確認，Enter50780.815674才派送，原生chooser50782.557552到達。原入口／焦點、一起播放／暫停、數字微調保存整數毫秒、按鈕微調、窄版停止與無橫向溢出六個原旗標全部true，沒有用隱藏輸入取代待測選檔。

cancel-input也先確認訂閱（37857.654637）才送真正Enter（37857.961331），但真正reference-file click的prevented=true；仍等原15秒失敗、chooser0。因此等就緒不會讓已取消或根本未開啟的選檔假通過。

**可支持的根因與修正**：原f1ac4ef測試缺少「原選檔訂閱RPC完成 → 派送Enter」依賴，Linux冷／暖皆能自然出現就緒競爭；相同延遲下，只補此依賴即可成功。該測試前置修正已由 #129 進入main，本次驗證它適用於 #203 原碼的同類故障，不需要另改產品按鈕。#203當年兩次本身沒有事件資料，仍不能逐次斷言當時兩次一定都是同一原因，也不能把這份原碼適配器結果換標成其他來源或整體P0已驗收。

五組均0頁面例外、自有瀏覽器各1個且已退出、browserClosed／serverStopped=true、lockRetained=false。暖組前置的6份chooser快照沒有混入目標頁；目標為page63，另四組page1。來源檔案未變，沒有終止他人程序或動用真相機／麥克風。此次實際瀏覽器驗證只在Linux執行；本機僅做正常check、編譯與適配器載入確認。

### 固定指紋與來源界線

- 原f1ac4ef comparison-keyboard.js：`e19c82c8e29c585d38782053dd26083422470134a4b865d2dc39073ebcdf8bea`。
- 原runner：`53fd39a7e8e41b713c9014306549ffc201a24a36177729161a315db59adeee67`。
- 共用觀察器：`6d17d867e62d128a793f2bc348f8279fbdb0167c9418386a2760aff4420c5e26`。
- 本次診斷工具：`90b7b5e38559d55cfc8f5fe10fa3551f8760df36ca30cd859913a125069881d6`；獨立workflow：`e7a2e6483a7c3490cf5b3a90bddd76686db1c81af9654f7bb067bda45f73759d`。

本機另保存本次工具回傳的UTF-8工作日誌及匿名JSON副本，未公開完整profile或原始媒體。匿名JSON副本SHA-256：

| 組別 | SHA-256 |
| --- | --- |
| cold | `a50e187d7ff7e8934832fcd32266b9aaac4aa71625c514c2dae4c79e92da8769` |
| prefix | `50a4daa0e3c6ff4b60acce56e4210f47b8c2a498cae118f4be7278a8a30a2358` |
| delayed | `9dd55668b145c6eb25ad5857eb8887d2672d3dac028bb4af8df2fd3aabbdbb6d` |
| ready | `c45c5efba3d2397bd7cb251a4db042207bf9b7bea31a38db75045af7c1e3d67b` |
| cancel-input | `853ad6c94f575b2390955a7836d34a34235df94283458e75487613804e5de9ef` |

本節是在五組完成後只回填文件，受測工具／workflow／觀察器指紋保持上述值；不改稱文件提交也重跑了五組。只記錄證據、不重跑找綠燈；PR #140與 #103保持待審查／開啟，本次未合併或發布。
