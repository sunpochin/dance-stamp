<!-- 檔案用途：固定 #103 Linux 鍵盤選檔逾時的證據與未解界線。所在層：工程診斷證據。主要關聯：comparison-keyboard.js、issue-103-vs-share.md。 -->
# #103 Linux 鍵盤選檔：根因仍未確認

2026-10-31。本次交付診斷與未解原因，不宣稱修復。不用成功重跑或覆蓋率代替失敗時的原生證據。

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
