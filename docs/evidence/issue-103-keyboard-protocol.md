<!-- 檔案用途：固定鍵盤選檔失敗的原生時序觀察、控制驗證與來源。所在層：#103 測試診斷證據。主要關聯：keyboard-protocol.ts、run-app.ts、comparison-keyboard.js、issue-103-keyboard-chooser.md、TECHNICAL.md。 -->
# 鍵盤選檔逾時：留下瀏覽器與測試工具的訊號順序

按鍵後沒有等到選檔訊號，可能卡在不同位置。這次把「按鍵送出、瀏覽器回覆、選檔事件收到」的紀錄一起留下，讓下次發生時能找到哪一步沒到。這是診斷，尚未找到或修復Linux偶發逾時的根因；產品程式沒有改動。

## 固定前置與已知失敗

2026-10-31，接續 [#103](https://github.com/sunpochin/dance-stamp/issues/103)。從同步main `d83755239bf145e9b79d50263208edfad83754e8` 建本聊天新分支，承接 [#124](https://github.com/sunpochin/dance-stamp/pull/124) 固定候選 `8e044f2b15b95d56640a3cb5588763825e263d83`，並沿用 [#118](https://github.com/sunpochin/dance-stamp/pull/118) `02455ebbdc0a7f68eca6897439265fc3f30542dd` 的兩檔診斷改動；原PR heads不改、不合併main。#118原證據保持其舊來源，不改標本次61條。

前置#124的 [CI #214](https://github.com/sunpochin/dance-stamp/actions/runs/41152441580) 三項success、精確8e044f2的Linux完整61 PASS／0 FAIL，行數100%／函式96.74%／分支88.26%。但 [#123 CI #213](https://github.com/sunpochin/dance-stamp/actions/runs/41150678868) 精確a660984仍保留60 PASS／1 FAIL：comparison-keyboard等待filechooser15秒逾時，新接入十條保存停止均通過。失敗輪100%／96.59%／88.31%只算計數，不算通過。原始日誌 `output/metadata-stop-coverage-ci213-app.log` SHA-256 `ef20baa473bb727a9d06fb6d09dbbcdb2eec0dcaafcf3c03e9f6a11e917d9c49`。

失敗DOM紀錄顯示可信第二次Enter與select-video click，接著reference-file的程式點擊；原handler已執行。舊紀錄沒有瀏覽器攔截回覆與原生fileChooserOpened，不能據此分辨瀏覽器／driver狀態，也不能以後一輪通過宣稱已修復。

## 方法與取捨

保留原 [Playwright選檔模式](https://github.com/microsoft/playwright/blob/main/docs/src/input.md)：先呼叫等待，再觸發操作，不await等待本身。沿#118記錄requested／Enter／resolved／loaded階段、捕獲與冒泡的prevented／disabled，以及真正chooser.element的reference-file ID。原15秒等待、公開UI／鍵盤、偏移保存及窄版功能斷言不變。

新觀察器限於 `tests/app-coverage/keyboard-protocol.ts`，使用固定1.64.1同程序driver的既有主frame session，旁聽Page.setInterceptFileChooserDialog、Input.dispatchKeyEvent的送出／成功或拒絕，以及原生Page.fileChooserOpened。沒有新建CDP session、送出額外攔截命令或提早訂閱Playwright filechooser。包裝回傳原Promise，不改原回覆；finally核對自有包裝後還原、移除旁聽，成功／失敗同留 `run.json.keyboardProtocol` 及匿名CI文字。

只記受控按鍵、命令名稱、enabled、匿名backendNodeId及mode，不記檔名、影片bytes、來源網址或任意協定payload；96筆上限有truncated標記。driver及controller的hostTime共用主機performance時鐘；頁內DOM time是另一時鐘，不跨層相減。固定私有入口只服務診斷，升版須重跑；入口不相容明確失敗，避免把沒有紀錄寫成已觀察。旁聽仍有觀察效應，成功輪不能排除時序問題。

排除延長逾時、換滑鼠、直接setInputFiles跳過鍵盤、先送CDP攔截命令、預訂閱filechooser或插入sleep掩蓋競爭；也沒有修改產品click、事件預設動作或Playwright依賴。獨立新CDP session不能反映原session的攔截回覆，因此只在測試層使用固定入口，不把私有driver知識帶入Web。

## 本機原碼對照與選定輪

本機原產品靜態d4a2a50194888b79、乾淨8e044f2、macOS arm64／Bun1.4.4／Chrome156.0.8078.76／Playwright1.64.1：原keyboard案例四次隔離context均通過，硬體擷取0次；只加唯讀主session觀察，未提前等待。各次啟用攔截與Enter幾乎同時送出，啟用回覆先於原生選檔事件，皆真正取得chooser。這不是Linux重現，也尚未證明攔截準備就是根因。

原始對照 `output/keyboard-native-protocol-180iYO/evidence.local.json` SHA-256 `4fc2b10bb8d280b69a44401b90d2a67b1714ab9868a15977859243406164c7ea`，控制器 `output/keyboard-native-protocol.ts`。已知自有瀏覽器程序退出、主機停止、核對nonce釋鎖；沒有剩餘已知程序。

接入量測後選定 `comparison-keyboard`：`coverage/app-KCBXrE/run.json`，1/1、917ms、0頁面錯誤；真正chooser對應reference-file，DOM24筆及driver37筆均未截斷，原所有功能斷言通過。啟用命令與第二次keydown並行送出，啟用ack先於原生chooser事件；不由並行本身推論故障。來源head8e044f2、trackedChanges=true，cleanup的browserClosed／serverStopped均true、lockRetained=false。

選定run.json SHA-256 `f040ebe074751ad07f7e3bdb2a45d1908103b31c9e1593e5159e38a77750713b`；runner `f4c420a0ac707da4cc71eebea23b868f2a1a92bc89fb1fa23a30844574daa03f`；新觀察器 `9b245c59448bdac78f03a79f68e6a115ffb0d26803c441e9a8fea5cb3346c239`；沿#118未改的keyboard案例 `007cf8a516b248b5a3c125c55cd902ada97a859719394edabd141f0964f2d228`。

## 控制失敗與完整檢查

以真正事件preventDefault分別取消第二次Enter或內部input click，只驗證診斷在失敗時保存；明示控制注入，不冒充自然Linux故障。控制器 `output/keyboard-native-protocol-control.ts` 沒有改原15秒等待，也沒有把故意失敗轉成成功：

| 明示控制 | 原始結果 | 同層證據 |
| --- | --- | --- |
| 取消select-video的Enter預設動作 | `coverage/app-OvxUbO/run.json` failed／exit1，15,341ms | DOM原生Enter被preventDefault、沒有reference-file click；driver已取得啟用攔截ack、沒有原生chooser事件 |
| 取消reference-file的click預設動作 | `coverage/app-NMBjgP/run.json` failed／exit1，15,347ms | 可信第二次Enter保留、input click已preventDefault；driver同樣已有攔截ack而沒有chooser事件 |

兩條均保留原filechooser 15,000ms TimeoutError，DOM與driver皆未截斷，各12筆driver紀錄，CI格式文字與run.json.keyboardProtocol完全相同；browserClosed／serverStopped均true、lockRetained=false。第一條收據SHA-256 `cf2aa9060c9b61fde15542c278d460fc73facc3e0eb8d59b3a8938c0fd24af28`；第二條 `e340fa5ba62475e7974b993a6ea345e2fddb7943775a42f46e48776c5af465fb`。可分辨被取消的預設動作與原生chooser缺席，不能把這兩條控制結果移記CI213的自然失敗。

完整輪 `coverage/app-6etejW/run.json`：61/61、0頁面錯誤、270次導航收集，案例時間合計425,613ms；鍵盤763ms，仍為reference-file、DOM24筆／driver37筆、真正原生chooser1次，皆未截斷。來源head8e044f2、trackedChanges=true，runner與觀察器指紋同上，九份Web來源SHA與前置#124及選定輪相同。此輪沒有自然選檔失敗，根因仍未確認。

| 完整輪模組 | 行數 | 函式 | 分支 |
| --- | --- | --- | --- |
| web/beats.js | 18/18（100%） | 5/5（100%） | 23/23（100%） |
| web/library.js | 266/266（100%） | 124/124（100%） | 348/363（95.86%） |
| web/local-audio.js | 144/144（100%） | 32/32（100%） | 171/187（91.44%） |
| web/main.js | 1236/1236（100%） | 368/385（95.58%） | 1056/1266（83.41%） |
| web/offline.js | 68/68（100%） | 21/24（87.5%） | 50/50（100%） |
| web/recorder.js | 120/120（100%） | 45/45（100%） | 128/136（94.11%） |
| web/storage.js | 104/104（100%） | 40/42（95.23%） | 75/84（89.28%） |
| web/sw.js | 37/37（100%） | 12/12（100%） | 25/25（100%） |
| web/timeline.js | 23/23（100%） | 6/6（100%） | 39/39（100%） |
| **加總** | **2016/2016（100%）** | **653/675（96.74%）** | **1915/2173（88.12%）** |

全部9模組保留同分母，skipped均0；同輪單元基準763/2016行、277/675函式、817/2173分支（37.84%／41.03%／37.59%），不直接加百分比。本次是補診斷，沒有以提高計數作驗收。與前置本機#124完整輪相比，main.js:293及309的readyState不足分支、681的近尾端回0分支本輪未命中，少3臂；其餘命中／未命中臂一致。保留本輪88.12%，不與前置88.26%混合或重跑補分。

仍未覆蓋22函式／258分支臂：main.js17／210，offline.js3／0，storage.js2／9，library.js0／15，local-audio.js0／16，recorder.js0／8，其餘0／0。未命中函式起始行：main.js `120,209,329,428,541,648,779,783,784,900,991,1007,1165,1241,1494,1632,1700`；offline.js `48,78,81`；storage.js `17,53`。完整branchMap／b位置與計數仍在同輪app-coverage.json，不以行數100%代替分支驗收。

完整run.json SHA-256 `250e9f4ab9fbed53428586c0668597e6eaea79e4914cc7e495023159af0a789e`；app.json `275884dfddd60cb5d593f26cb120eb3df9aede00b78d322e1b7f1969987ed36a`；app-coverage.json `156153def338efea1b978dfbaa36fbbeb10db1f277a4a9a2aa0445d498caedef`。browserClosed／serverStopped均true、lockRetained=false；九個已記錄自有程序識別均退出，自有nonce已釋放，觀測為 `output/keyboard-native-protocol-full-processes.json`／`keyboard-native-protocol-full-cleanup.json`。

正常 `bun run check`：647項測試／3174斷言／0失敗，既有19項lint資訊，靜態版本仍d4a2a50194888b79。首次公開掃描291個已追蹤檔案，已含沿用#118的文件；新觀察器與本文尚未stage，最終提交hook再掃描。固定coreBundle.js SHA仍 `829521b67ed7be90c7d6d6098ff39f2241562d47e4ad7ccab13710924a56001d`。

完整輪後只補文件，最終乾淨head遠端CI另記，不以本機、舊head、控制注入或後一次通過代簽自然Linux失敗的修復。

## 重跑與界線

使用指定Bun1.4.4，執行 `bun run check`、`bun run test:coverage:app comparison-keyboard` 及完整 `bun run test:coverage:app`。沿用同一原子QA鎖與自有nonce收尾，不動他人鎖。控制腳本只在本機output，故意失敗不可列為產品通過。

原生Linux故障仍需實際失敗當下的同層紀錄；原Safari／私人模式、VoiceOver、真人、實體／跨裝置及G1–G7各自保留，iPhone延後。#103仍開啟，指定人工審查與合併／正式發布授權仍待；#114維持開啟待審。
