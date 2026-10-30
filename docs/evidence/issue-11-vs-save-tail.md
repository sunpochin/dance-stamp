<!-- 檔案用途：記錄新 VS 真正成檔後的保存尾段與救援，不混入準備取消或筆記中斷。所在層：#11／#13 匿名證據。主要關聯：verify-vs-save-tail.ts、vs-save-tail.js、issue-13-unconfirmed-storage.md。 -->
# 新 VS 成檔後的保存尾段

## 範圍與來源

基底為 `6862501d3cfaaa7cf3916d875fd06dd8dfdd13ec`，靜態 `4651fae419d8d9c8`。本輪只新增可重跑 QA 與文件，不修改產品、schema、匯出格式或品質護欄。受測工作樹與最後工具指紋另由 raw 固定，不把工作樹實測改稱最終乾淨 head 重跑。

既有 [14128c2 單次 Stop 觀察](issue-13-unconfirmed-storage.md#14128c2-成檔vs保存stop的保全觀察)仍保留其原來源。`metadata-stop.js` 只驗可取消的明確 UI／匯出準備；#83 的筆記與 sentinel 中斷、#81 的備份救援都不能代替本項。

## 2026-10-30 實測結果

macOS arm64／Darwin 27.0.0、Chrome `156.0.8078.76`、Bun `1.4.4`。最終工具的四案全部通過，沒有重現需修改產品的缺陷。受測是上述基底的工作樹；最終提交只再補文件，runner／case bytes 以以下指紋固定，不改稱乾淨提交後重新跑媒體。

| 案例 | 原生結束 | 明確重開結果 | 新 VS bytes／SHA256 |
| --- | --- | --- | --- |
| Stop 後完成 | trusted complete | 新 VS 已保存 | 70,602／`71c4223437a8adfc7497e7175d64b55fb8f7d54ba61251d7e5da9c5947ba5ea1` |
| 原生拒絕 | trusted ConstraintError／abort | 拒絕後舊資料完整；同來源重新成檔後重開保存成功 | 68,834／`614b26f8feaaa4f32b5c785ba6763607ebe70ef162ed6098906409f3bd894260` |
| 缺 abort 通知 | 原生 abort，產品未確認 | 舊資料完整；不含未保存候選 | 70,379／`9cbef68b8696996970a5d2f04e4fc29369deb4f16cc2e7c895f14b916642d093` |
| 缺 complete 通知 | 原生 complete，產品未確認 | 新 VS 已保存，符合原生結果 | 68,377／`7ebc4ca4d911028fac938180d57dafca2cb0f596727b141a93c27f2199381bf3` |

四案各有真正 Stop、pending 雙 put、舊資料／原片／URL 保留、完整下載及退出 busy；兩案未知期間的 DB open／transaction 沒有增加。完成／拒絕／未確認收尾後，所有已觀察 recorder 都 inactive、canvas 輸出音／視 tracks 都 ended；pending 時不宣稱立即釋放。

本輪另從檔案重核 **38 份原生 Blob 快照、41 份實際下載**的全部 bytes／SHA，含四份記憶體筆記備份；不是抽樣。四份舊 VS、四份新 VS 與拒絕後重新成檔的一份，共九檔各 89–90 格、完整解碼 808 格；視訊跨度 2.965200–3.000633 秒，所有格 fit／鏡像／留邊與單一老師聲源通過原分析器。老師音量相對原片 0.9813–0.9853，沒有把自己聲源混入。四份救援新片關閉產品頁後在 file origin 播放到 ended，1280×720、error=0；原生拒絕案的獨立播放 dropped=1，其餘 0，完整解碼仍包含該檔全部 90 格，不改寫成零掉幀或完整 G2–G4 品質通過。

- 最終 raw SHA256：`d665a710595e0f346a78cdde13d3a67f2d23c1584734713fa578c0568e133e4e`。
- runner SHA256：`29b87c3a8f532b9b2ddb6b0fd0afa7e57656c88f48dbd7120335525f7c6851e7`；case：`b97affa9dd4cdb29acecf9f7825af6d84bd78bea1fbd8ae9774555ef399e4414`。
- 復用分析器 SHA256：`eb1db49d3ae2b849ec25ca7d1d288bcfe966913a156698afd92acc85282448ca`；13 份 HTTP 白名單資源各自指紋均保存在 raw，靜態版本未變。
- 最終四個自有瀏覽器共 32 個已知 PID 均確認退出，四個 profile 無活程序；自有主機拒絕連線、nonce 鎖已釋放，媒體擷取 API 呼叫 0。

原 `bun run check` 通過 **443 tests／2143 expects／0 fail**，公開掃描 241 檔、型別／lint／build 通過。前置的全域 Bun 1.4.2、受限本機 listen 失敗，以及 QA 的來源路徑、診斷欄位、URL 容器與 CSP fetch 失敗均保留；鎖忙拒絕也保留原收據。修正的是 QA：舊 URL 改以原生下載核對，沒有改 CSP、產品或門檻。較早一輪成功仍屬其原 runner／case 指紋，不與最後四案混算。

協調審查另發現 QA 的瀏覽器收尾失敗可能跳過自有主機停止；本輪修正為各自嘗試收尾，啟動無 handle／關閉／CDP 稽核失敗或仍有已知子 PID 時保留鎖，但仍停止自己的 server。沿既有 `mediaProbeCleanup.test.ts` 補八案，包含不帶 profile 字串的已知子 PID、ps 拒絕、nonce 更換及主機失敗；八案通過，沒有用 profile 子字串空結果推論全部退出。上述四案 raw 已屬此修正版 runner；先前成功收據仍保留各自來源。

## 可重跑案例

從空白合成 profile 操作正式已有影片入口，載入八秒橫／直式色條與不同定頻音軌。老師區間 2–5 秒、自己起點 1 秒、右片鏡像，先保存非空筆記、標記、兩側原片與一支舊 VS，再真正產生下一支 VS。沒有注入成功 Blob、改 duration 或繞過原成檔守門。

目標只能是新 VS 的 metadata／media 雙 put 都取得 trusted 原生 success、交易尚無 complete／abort，而且產品已建立下載連結的時段。QA 以同交易原生 get 延長 pending，真正點產品 Stop，250ms 後仍須 pending。`persistExport` 刻意不借用 `active.signal`：Stop 不能被測試誤定義成「必須回滾已成檔資料」。

| 案例 | QA 操作與原生結果 | 必須核對 |
| --- | --- | --- |
| `stop-complete` | 解除自己的 hold，真正 complete | 新 VS 原生 bytes 等於下載；舊筆記／原片／舊 VS 保留，busy 結束，同頁重開一致 |
| `native-reject` | 同交易對既有主鍵 add，原生 ConstraintError／abort | 新 VS 仍能下載；原有 keys／完整 Blob bytes 及最後確認 metadata 不變；同來源／配方重新成檔可保存 |
| `unknown-abort` | 同上原生 abort，但明示遮住產品的結束通知 | 一秒寬限後回報未確認、退出 busy；原片／新 VS 可下載，備份只含最後確認筆記；重開才讀回舊資料 |
| `unknown-complete` | 原生主鍵錯誤明確 preventDefault，交易真正 complete；明示遮住 complete | 同樣回未確認，不能宣稱已回滾；重開才讀回已提交的新 VS |

原生主鍵衝突是受控的引擎拒絕，不是自然磁碟／配額錯誤。兩個缺通知案例是明示注入，不能外推為 Safari 自然故障或私人模式救援。

最後確認的 revision 是匯出準備成功後的那一份：準備會先提交相同資料並提高 revision，尾段拒絕不能誤比準備前的版本。

未知狀態期間不呼叫 snapshot／重讀 DB。核對產品仍可下載原片、新 VS 與記憶體備份，再觸發已封鎖操作，要求沒有新增 open／transaction；最後才按產品「重新開啟同一頁」。此為同 profile 同頁重載，不宣稱跨程序／實體裝置。

## 完整 bytes、URL 與離站驗證

每次 native snapshot 均讀完整 metadata／media／chunks keys 與全部值，Blob 完整 bytes 留本機，另以 SHA256 記錄。保存前後兩側原片實際下載須逐 byte 等於合成來源；新 VS pending／救援下載均須逐 byte 等於真正交給原生 put 的候選 Blob。已提交分支另要求原生新 Blob 完整 bytes 相同。

新成檔會正常替換 `output-download`，所以不宣稱舊 output URL 永不撤銷。先以產品庫存另存舊 VS，保留其獨立 inventory URL；尾段失敗後核對該 URL 沒被撤銷、仍可取回相同全部 bytes。兩側原片的播放器／下載 URL 及新 VS 的下載 URL 在尾段 Stop／失敗前後保持相同。

分析直接復用 `analyze-export-failure.py`：逐格完整解碼，核對 1280×720、真實容器、片長、上下邊界、鏡像、留邊、老師 660Hz／自己 880Hz 音源及原增益門檻。靜態色條不代表 G2 同步／G3 凍結矩陣。

關閉全部產品頁後，實際救援下載以獨立 `file:` 頁播放到 ended；HTTP 被拒絕，頁面不載產品腳本。這是自動原生播放與解碼，不是人工聽感、外部 App 或跨實體裝置驗收。

## 執行與未驗項

依 [MEDIA_PROBE](../MEDIA_PROBE.md#新-vs-成檔後的保存尾段)執行。工具原子取得共用媒體鎖；鎖忙最多等 90 秒自然釋放，否則失敗退出，不刪除或接管。每案使用新 persistent profile，連到本輪自有 loopback origin，禁止相機、麥克風、畫面擷取及外部網路。只核對與關閉自有 Chrome PID，主機停止、nonce 相同且程序確認退出後才釋放鎖。媒體、raw、profile、原檔名及操作識別只留 ignored output，不入 Git／發布包。

產品沒有「重存同一完成 Blob」入口；原生拒絕後只驗同來源／配方重新編碼，不宣稱同候選 byte 重試。未知狀態不重試寫入、不刪資料。無 error／取消且永久 pending 的交易不在既有一秒寬限保證內，Stop 單獨不會讓成檔保存自動判為未確認。

Safari／私人模式、自然缺通知、真低空間、提交瞬間／斷電、chunks 程序中斷、大型匯入取消、未知狀態鍵盤與讀屏、真人／五人／實體／跨裝置、iPhone 與發布仍未由本項驗收。#11／#13 保持開啟；重要工程仍待 Claude Code 或使用者審查。
