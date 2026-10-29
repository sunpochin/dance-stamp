<!-- 檔案用途：記錄目前 main 的 Safari 操作限制、錄影資料保護與實際檔案取回。所在層：匿名工程證據。主要關聯：p0-safari-reliability-integration.md、issue-13-unconfirmed-storage.md、issue-9-capture-recovery.md。 -->
# #3／#9／#11：目前 main 的保存與救援有界稽核

2026-10-30 Asia/Taipei。受測乾淨來源 `c0ab39bcf68354cc29d7048a0d81e56d626efcf1`、靜態 `422c70c3633b8e88`，Bun 1.4.4、macOS 27.0.1。新建獨立 clone；測試開始時 trackedChanges 為空。`web/`、build-web 與 web-assets 相對 `14128c2606029f5f11d438965ca001a84be4caed` 無差異；本輪另保存 14 份建置資源指紋，相同程式不能把歷史實測改標成本輪 Safari 通過。

本輪沒有重現需要修改產品的缺陷，只補證據文件；runtime、schema、測試斷言、分析器及品質門檻未改。PR #73 的低空間工具、備份分享與發布準備由其他工作線處理。

## 原生 Safari 的操作前置失敗

Safari／safaridriver 均為 27.0.1。先原子取得共用影音鎖，再啟動自有 driver；`GET /status` 回 ready，但 `POST /session` 回 HTTP 500／`session not created`，明確指出 Safari Settings 的 `Allow remote automation` 未啟用。沒有建立測試 session、導航產品頁或改動設定。driver 正常 exit 0、自有程序群組消失後才按同 nonce 釋鎖。

另一個只讀桌面能力檢查未返回，已按精確自有 PID 結束；沒有取得可用的手動視窗操作入口。這些是操作前置失敗，不能推論產品成檔或儲存失敗；沒有改 Profiles、隱私設定或日常分頁。原生 Safari 一般／私人保存 Stop、新 VS 保存失敗／未確認救援、產品下載後的原生 file 播放，本輪均**未執行**。續測需要可操作自建視窗的人工入口，或另行獲准且可用的原生自動化入口；本輪不要求變更瀏覽器設定。

舊一般 Safari 的矩陣、同頁十輪、file 播放及正常 VS 重載仍屬 `345b2d1`，私人未確認示範副本救援仍屬 `99e862d`。詳見[原生界線](p0-safari-reliability-integration.md#345b2d1-原生-safari-的同版證據)與[私人保存對照](issue-13-unconfirmed-storage.md#99e862d-的原生-safari-儲存對照)，不合併成目前 main 的新驗收。

## 實際資料流核對

| 入口／順序 | 目前程式的保全契約 |
| --- | --- |
| `stop` → 明確 metadata 保存 | Stop 取消本輪 signal；明確 UI 傳到 `saveData`／`writeLibrary`。獨立比較佇列仍由自己的 owner 完成。 |
| `persistExport` | 新 VS 通過讀回及片長守門後先建立下載，再保存 metadata／Blob；刻意不傳 active.signal。成檔後 Stop 保全不等於回滾，準備階段 abort 不能代替這項證據。 |
| `storage.completed` | 真 error／要求 abort 後才計一秒寬限；缺 complete／abort 就封鎖本頁並回未確認。無 error 或取消的永久 pending 不在此保證內。 |
| `showStorageRecovery`／`downloadBackup` | 未確認後保留記憶體原片／VS URL，救援筆記只用最後確認的 state，不再讀 DB。必須明確重載同頁，不能用新私人分頁空庫判定遺失。 |
| capture `recording.done` → finally | 非本輪要求的原生早停被拒絕；`stopRequested` 先於 stop／關相機。新片先過既有時長下限才切換舊自拍／下載及 finalize。 |
| chunks／救援刪除 | 尾塊佇列在 take lock 內收完；未完成 Blob 另給連結。取消、無關刪除不撤銷，成功刪到對應 take／video 才撤銷。 |

這是有界讀碼，不是 Claude Code／使用者的最終審查，也不代替原生 Safari 操作。

## 乾淨 c0ab39b 的負向回歸

原 `bun run check` 通過 **408 tests／1555 expects／0 fail**，含公開掃描、型別、既有 lint 與 build，原 19 項 lint info 保留。另以原 `storageCompletion`、`recordStop`、`recordFormat`、`mediaAction`、`capture` 五檔重跑 **23 tests／237 expects／0 fail**：缺結束通知、遲到 complete、正常 abort 後重試、排隊後轉未確認、VS／原片 URL 保留、WebM 拒絕及尾塊／監聽清理均沿原斷言。合成事件不是原生 Safari 收據。

真正 Chrome 156.0.8078.49 headless、新 persistent profiles、明確合成相機旗標及逐次 track label 檢查；麥克風關閉。原 `make-sync-fixtures.py` 產生 65 秒合成來源，自拍靜音檔只移除音軌，相同來源另供原 capture-drain 使用；沒有使用真實相機。

沿未修改 `capture-integrity.js`，同頁依序 prepare → early → short → normal → 刪除生命週期 → 新 early → 刪影片：

| 案例 | 本輪結果 |
| --- | --- |
| 真正 native early-stop | 1,168ms／39,977 bytes；維持 interrupted，不 finalize；chunks 與救援 Blob 指紋相同，既有筆記／take／recipe／VS、原片完整 SHA 及 URL 保留，tracks ended。 |
| 正常錄製期間注入前次真短 bytes | 播放器讀回同一 1,168ms，原時長守門拒絕；沒有偽造 duration／完成事件，舊資料、chunks 與救援保留。 |
| 同頁正常重試 | 14,995ms／471,413 bytes，ready、非 interrupted；舊筆記、保存媒體指紋及舊 VS 連結相同。 |
| 救援生命週期 | 取消刪除及刪無關 take 保留，刪對應 take 撤銷。另一次真早停 1,195ms／40,737 bytes，刪對應 video 才撤銷。 |

四份實際下載均用唯一 take 檔名，磁碟完整 bytes／SHA256 各自對上頁內預期，全部原 fullDecode 命令 exit 0。首 early 與 short 本來就是同一份注入 bytes，不能當成兩份不同原生編碼。

原 `capture-drain.js` 另用新 profile：真正 chunks 交易未提交時注入編碼 error，原生 stop 後 tracks ended；另一分頁仍拿不到 take lock，產品仍忙碌。只解除 QA 自有 get hold 後可恢復 **110,608 bytes**，仍 interrupted；舊 take／recipe／媒體及恢復片的快照 SHA 在 reload 後相同。實際恢復下載另核對大小、完整解碼及 file 播放；沒有另序列化該儲存 Blob 供磁碟檔逐 byte 比對。

### 網站停止後的五份實際檔案

先關原產品瀏覽器與 server，再開新 Chrome/file profile，沿原 `download-playback.js` 逐份打開四份下載及 drain 檔案，全部 ended、error=0、mediaCalls=0；順序 dropped 為 0／0／1／1／1。沒有使用產品頁、Blob URL、IDB 或 SW 供應播放。這是靜音 headless Chrome 檔案證據，不代表 Safari、人工聽感、零掉格品質或跨裝置保存。

正常重試的原 fullDecode exit 0 同時有 **23 筆 null muxer non-monotonic DTS 訊息**，完整保留；附加 passthrough 診斷仍有相同訊息，不宣稱無警告。只讀 ffprobe 確認原檔 450 格、time_base=1/30000、packet PTS／DTS 及 decoded-frame PTS 嚴格遞增；依報告 r_frame_rate=179/6 量化到 6/179 的 23 個碰撞值與訊息全部相同。這支持輸出時間基準取整的解釋，沒有改檔、重封裝或放寬標準；不升格成 G1–G7、聲畫／首尾覆蓋或新矩陣通過。

## 來源、負向收據及清理

- 原 capture-integrity SHA256 `b78dfa6257e50f5adfb01af23d131b29ac149d50526be30f5dd0081ddfca1456`；capture-drain `fa7b6f835566e92ed456c4e9d5aaab2405f2af3f08a5f94fe276d3ef13eea524`。直接執行該 head 原函式，私有 runner 只協調階段、保存結果及補充檔案核對，不新增產品依賴。
- Safari preflight 收據 SHA256 `76e7fabab77df77b3d9938e17985e80961b13fbab9f65ae1abeec781751c6b53`；capture `2b32e1aaa8ef5289c08b2c65d0647401181d44c355098051b9aa52ee42e690f8`；file 播放 `8850358327de079321ba853cdaa3bdd02e4610cbd68a0a9b5e3bd328a60c04bb`；時間戳對照 `8761da54ac350458ca67212e0d9379b91f5e666b073926dbee77fe121309220c`。
- 第一次受限環境的 check 無法建立測試入口，原 port-0 案失敗；在可開本機入口的環境完整重跑才得到 408 項通過。私有 QA 準備曾誤認建置 manifest 檔名，在啟 browser 前失敗；另一輪被別人持鎖以 EEXIST 拒絕。原收據保留，沒有刪鎖、接管或把前置失敗當產品通過。
- capture／drain／file 三 profiles、25 個已知自有瀏覽器 PID 均無殘留，產品埠 connection refused，才按自有 nonce 釋鎖；Safari driver 另核對自己的群組。沒有停止其他聊天或日常瀏覽器。交叉清理收據 SHA256 `6feb0c98a43ed2b04aa642a7b9dca14a3232da7aed759f6616c7a57638c530c7`。

raw、合成媒體、profiles、私有 runner 及操作識別只留本聊天 ignored output。尚缺一般／私人原生 Safari 保存 Stop、新 VS 失敗／未確認救援與真正 file 取回；硬體／LED、鎖屏／來電、人工聽感、五人／讀屏及跨實體裝置仍未驗。Web 優先、iPhone 暫緩；#3／#9／#11 及相關未驗收票保持開啟，沒有合併、部署或發布。
