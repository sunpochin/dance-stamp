<!-- 檔案用途：記錄已開頁面遇到另一分頁升版時的資料保全回歸。所在層：#103 工程證據。主要關聯：storage.js、storage-version-change.js、TECHNICAL.md。 -->
# #103：舊頁面遇到資料庫升版

如果另一個分頁已把資料庫升成新版，舊頁面不能繼續覆寫它。這份測試先做好筆記、影片副本及 VS，再讓另一頁真正升版；確認舊頁面停止保存，剛輸入的標題仍留在表單，原片、VS 與已保存的筆記還能下載。明確重新開頁後，舊程式應拒絕不支援的版本並保留全部資料。

## 做法與取捨

- 只改測試／文件，產品 schema 與開庫規則不改。從同步 main e6f0300 建分支，明示承接 PR #137 固定候選 `7a503e3e3d90da42b1afa32c0b53603519f28ec8`；新增案例接在其 68 條之後，完整入口 69 條，原順序、素材與期限保留。
- 透過公開選片、保存副本、標記及 VS 匯出入口建立舊資料。只用原合成影片；硬體擷取入口明確拒絕並計數，不能碰實體相機／麥克風。
- 另一分頁在同 origin 的無產品控制頁呼叫真正 `indexedDB.open(..., 2)`，只新增未知 store 的合成 sentinel，不改原有資料。這是明示的未來版本控制，不代表已實作產品 IndexedDB v1→v2 migration；筆記 JSON 本來就有的 schema v2 是另一層。
- 旁聽真正 trusted versionchange、原生 close 與 upgrade 成功；不替產品關閉連線、不直接呼叫 handler。升版等待仍有原 15 秒期限，不能無限等待開庫 Promise。
- 升版後以公開保存標題入口觸發原生 VersionError，驗證舊連線 cache 已清除、表單草稿仍在、舊播放器／下載 URL 未撤銷。透過下載筆記備份確認內容仍是最後成功保存的資料，沒有混入未保存草稿。
- 逐值比對原生 metadata、media、chunks，Blob 以完整大小／MIME／SHA-256 核對；未知新 store 的 sentinel 也逐值保留。同 profile 重新載入後再次原生拒絕，不重置資料庫。
- 共用入口保留 #137 的真正下載逐檔大小／指紋核對，讓新案例的原片、VS 和 JSON 都使用相同驗證。備份不包含影片；草稿只保證明確重開前留在表單，不宣稱未保存資料會跨 reload 保存。

原 `storage-startup-failure` 只驗證開站前已有新版的情況；單元測試直接呼叫 versionchange callback 也不等於原生跨分頁事件。此回歸補的是已開連線真正收到通知、允許另一頁完成升版，以及舊頁後續不能覆寫的整條路徑。

## 重跑與執行紀錄

先用指定 Bun 及既有合成素材準備入口，再執行：

```sh
bun --no-env-file tests/app-coverage/run-app.ts storage-startup-failure storage-version-change
bun run test:coverage:app
```

所有本機瀏覽器／媒體 QA 仍使用共用鎖與自有 nonce。首兩次啟動遇到另一條 Safari 工作持有鎖，原入口 EEXIST，沒有執行單元前置或瀏覽器案例；未刪鎖或停止對方，改沿既有有界前景等候模式。首輪前景等候五分鐘後 exit 75、沒有啟動測試；第二輪遇自然釋放後的再次取鎖競爭，原入口 EEXIST、沒有執行案例。均保留原記錄，不冒充產品測試失敗或通過。

初版10f228e提交時本機新案例**未驗證**，先交由既有 CI 的完整 69 項驗證；當時正常 `bun run check` 已通過 648 項／3179 斷言、型別／lint／build，19 項既有 lint 資訊，靜態仍 `4525b1293b89a584`。新增檔案尚未暫存時公開掃描305檔，初版及可攜基準修正的正常hook均確認307檔已包含兩新檔。不能以單元綠燈取代原生情境。

固定前置 #137 的 CI #233 在精確 head 7a503e3 三項成功，Linux 完整68/68、九模組行數99.95%／函式97.78%／分支88.58%，仍歸前置來源。產品九份 JS 逐 byte 相同，原68條定義與順序保留；只共用原本就有的下載指紋核對，不降低條件。

### 首次雲端原生執行：未通過

固定初版 head `10f228e2246c41d7b2d7ef80bf12214047f9e53a` 的 CI #237：harness／linux-install-restart 成功，app 為 **68 passed／1 failed**。原68條全部通過，新案例在備份比對失敗，尚未走到同profile重開；沒有用覆蓋率替失敗背書。該輪原始解碼日誌 SHA-256 `73830a4dff3cd1e8c64d17487f14e448a10a32d5905ce04f5245a623fbf2a605`，收據保留。

原因是測試把 `readLibrary()` 補上的資產 state／storageKind 與可攜 JSON 比較；[既有資料格式](../DATA_FORMAT.md) 明訂這兩欄留在本機，`validateBackup` 也刻意不匯出。修正基準改用升版前的**原生 metadata 快照**，按既有可攜格式正規化，再獨立逐表核對 videos／markers／takes／recipes／exports／moves 的完整內容與關聯；資產仍須保留全部可攜欄位、mediaIncluded=false 且無本機狀態。僅忽略匯出時間與物件 key 順序，不刪除資產斷言或改產品，初版失敗保留原來源歸屬。

### 修正來源20658a0的原生結果

精確head `20658a025035cb07aad9cc4f3c7757b38fdcd57a` 的 CI #241三項success，原app日誌核對checkout此完整head、Linux **69 PASS／0 FAIL**；新升版3,879ms、原鍵盤1,509ms、原WebKit錄影48,270ms。九模組同輪行數99.95%／函式97.78%／分支88.58%，唯一未覆蓋行main.js:627，15函式與其他分支缺口仍在，不宣稱100%。原解碼日誌SHA-256 `859f8b8232dce05ffb1b99fbb4b932108f6c0cdaf1a55e6fee01f2185b504910`。

其他QA自然釋鎖後，本機沿原入口完成 `app-9JKmFC` **2/2、0頁面例外**：原啟動較新版本840ms、新升版2,943ms。收據head20658a0、trackedChanges=false，真正versionchange／upgrade各一次trusted、原生close一次、舊頁VersionError為trusted，完整原生記錄／媒體／未知sentinel與同profile重開保全均通過，硬體呼叫0。三份真下載逐byte／SHA核對一致：原片175,911 bytes、VS36,461 bytes、JSON2,263 bytes。收據SHA-256 `85b9ccb9322baad61934d10ac5e1372e4a34d6cf3cca12158f1747c9f0238053`；新案例SHA-256 `e7956c37045e5d6f50cb0713b241013bc8e9d4ae7a92b396d354c5c7864297f4`。

本機獨立成檔入口已對三份實際檔案完成來源／完整指紋及JSON逐表核對，接著取得QA鎖時EEXIST，**尚未啟動播放器或完整影音解碼**，不列為播放通過。同輪CI成檔入口為後續新增，尚待自己的執行結果；CI #241只有69項App回歸，不移記為新成檔入口通過。

## 驗收界線

同一 CI 在完整入口關閉主機／瀏覽器後，再執行 `tests/app-coverage/verify-storage-version-downloads.ts`：只接受同 head、乾淨來源、唯一成功的完整輪與原始檔案指紋；另開未載入產品程式的原生 file 播放器，重開實際原片／VS，核對單一音軌、音訊解碼、ended／error、完整 FFmpeg 解碼，並以真正下載的 JSON 再核對原生已存筆記。這段不加入 App 覆蓋率計數，沿用原素材、25 秒播放器等待與原 job 總期限；實際掉格照實記錄，不重跑追零。收據寫在原 run.json 旁，失敗亦留下原始結果，既有收據不得覆寫。

這讓下載成品可在其產生的隔離環境取得獨立播放證據；本機仍遵守共用 QA 鎖。僅接受原生 wx 取鎖，確認自己已知程序退出且 nonce 相同才釋放，不移除別人的鎖。此新增入口與修正版情境尚待執行，不能提前宣稱成功。

Chromium 原生 IndexedDB 與合成媒體證據不能替代原生 Safari／私人模式、實體／跨裝置、未來任意 migration、完整 G1–G7 或人工最終審查；iPhone 延後。#103 保持開啟，沒有合併或正式發布。
