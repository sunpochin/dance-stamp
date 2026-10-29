# 資料模型與可攜格式 v1／v2

狀態：桌面 Web 已有備份／恢復；#17 候選新增 v2 分類與動作庫，可讀 v1，完整相容與回復限制見第 10 節。下方 v1 範例及原規劃保留版本歸屬。儲存與格式更新必須保留既有資料，不能以重置資料繞過。

## 1. 分開筆記、媒體與練習配方

| 實體 | 核心欄位 | 不變條件 |
| --- | --- | --- |
| Library | id、schemaVersion、createdAt | 本機資料集，不是雲端帳號 |
| Video | id、title、durationMs、teacher、danceStyle、recordedDate、revision | 影片的筆記主體；時間以實際 metadata 為準 |
| MediaAsset | id、videoId?、kind、storageKind、state、byteLength、mimeType、originalName?、durationMs、fingerprint? | kind 為 reference／take／vs；位置僅本機可解讀 |
| Marker | id、videoId、startMs、endMs?、title、note、moveId?、revision | 0≤start；區間 end>start；已知長度時不超出影片 |
| PracticeTake | id、referenceVideoId、cameraAssetId、referenceStartMs、referenceEndMs、rate、state、createdAt、captureTiming? | 影片與錄影各自可保存，不把 VS 當唯一原件 |
| ComparisonRecipe | id、takeId、offsetMs、referenceMirror、selfMirror、layout、audioSource、revision | 時間公式見錄影規格；不等於已產生影片 |
| ExportArtifact | id、recipeId、recipeRevision、assetId、mimeType、state、createdAt | 修改配方後舊輸出仍可留存，但標記與新配方不同 |
| Move（#17 v2 候選） | id、name、danceStyle、status、revision | 一個動作可由多個 marker 指向 |

不建立 users、subscriptions、share_tokens 或同步 outbox；本期沒有對應服務。`createdAt/updatedAt` 使用 UTC ISO 時間，課程日期用使用者輸入的日期字串，不能只靠檔案修改時間冒充拍攝日期。

新建本機 ID 為隨機 UUIDv4，與檔名、路徑或影片內容 hash 分離；不同來源匯入／衝突副本的穩定 UUIDv8 規則見第 8 節。reference 指向錯誤影片比找不到影片更危險，因此不得只憑同檔名自動連結。

PracticeTake 可選 `captureTiming`（#9，v1 向後相容）：`recorderRequestedMs` 必填，`recorderStartedMs`、`referencePlayResolvedMs`、`referenceAtPlayMs` 可缺。皆為非負安全整數毫秒；最後一項不能超過來源影片長度。前三項使用同一次頁面生命週期的 performance 單調時鐘，最後一項是來源媒體位置；不能當 UTC、跨 take 排序依據或 G2 同步證明，也不假設非同步 start 與 play Promise 必定誰先到。匯出／匯入只保留這四欄，不帶 deviceId、裝置 label 或原始錯誤；舊資料沒有此欄仍可讀取，外部原片匯入不偽造觀測值。

## 2. 媒體狀態

### 既有影片比較的資料決策（2026-10-28，桌面已實作）

沿用上表關聯：老師片為 Video／reference asset，自己的外部原片為 take asset；PracticeTake 是比較用的練習紀錄，不必由本工具的相機產生。既有欄位 `cameraAssetId` 在此指自己的原片，為相容舊備份保留名稱，不據此推斷有相機授權或拍攝時間。外部選片的 `createdAt` 是建立紀錄時間，不冒充檔案拍攝日期。

老師起訖、r 與自己的起點沿用 `referenceStartMs`／`referenceEndMs`／`rate`／`offsetMs`；時間定義只以 [RECORD_COMPARE.md](RECORD_COMPARE.md) 為準。新增配對時明確設定 r，不能繼承上一個 take 的慢速值；後續改動老師區間或 r 需建立新 take／recipe 並保留舊資料，避免舊輸出仍指向被悄悄改寫的時間映射。offset／鏡像改動則沿用 recipe revision。

兩個外部 File 預設僅當次可用，明確選擇保存副本才複製；與工具內錄影必須保存新產生原片的流程分開。外部匯入不經 `recording`／相機 chunks 恢復；解碼、使用者確認、關聯驗證成功後才建立可用配對。換片失敗或取消保留原配對、筆記及輸出，多分頁／quota 衝突不部分寫入。

JSON 備份包含兩個 asset 的描述、take 與 recipe，不含影片 bytes；缺片時逐側預覽、確認重連，不靠同名自動綁定。#10 負責建立與重開配對，#12 驗證匯出／還原。桌面實作不新增交換欄位或提高 schemaVersion；後續若需要改格式，先定義向後相容與 migration，不能直接讓既有 v1 備份失效。已建立全新瀏覽器資料的還原／重連回歸；跨裝置與其他平台依實測範圍另行記錄。

### 共用狀態與清理

`session-only → copying → ready`；錯誤可為 `missing`、`unsupported`、`interrupted`、`failed`。相機 `recording` 與匯出 `exporting` 是工作中狀態，不可當成可播放檔案。

刪除有三個不同操作：「移除此裝置的媒體副本」「刪除此筆記及其標記」「刪除本次 take／VS 輸出」。顯示影響與確認；不去刪除使用者原相簿檔案，不把備份檔一起清除。前兩者需保留重連／獨立刪筆記的選擇。

所有關聯由本機儲存層檢查，IndexedDB 不會自動替應用維護外鍵。marker 寫入與索引更新一個短交易；媒體大檔先 staging 再 finalize metadata。重新開啟時掃描工作中記錄，要求使用者處理中斷項。

## 3. JSON 備份

副檔名 `.dance-stamp.json`，UTF-8。示例使用合成 UUID／名稱，空陣列是合法的第一版資料。媒體 bytes 不內嵌、不用 base64 膨脹檔案。

```json
{
  "format": "dance-stamp",
  "schemaVersion": 1,
  "kind": "backup",
  "exportedAt": "2026-10-27T08:00:00Z",
  "sourceLibraryId": "10000000-0000-4000-8000-000000000001",
  "videos": [
    {
      "id": "20000000-0000-4000-8000-000000000001",
      "title": "Salsa shine 練習範例",
      "durationMs": 60000,
      "revision": 1
    }
  ],
  "assets": [
    {
      "id": "30000000-0000-4000-8000-000000000001",
      "videoId": "20000000-0000-4000-8000-000000000001",
      "kind": "reference",
      "byteLength": 12000000,
      "mimeType": "video/mp4",
      "durationMs": 60000,
      "originalName": "synthetic-shine.mp4",
      "mediaIncluded": false
    }
  ],
  "markers": [
    {
      "id": "40000000-0000-4000-8000-000000000001",
      "videoId": "20000000-0000-4000-8000-000000000001",
      "startMs": 10000,
      "endMs": 25000,
      "title": "腳步八拍",
      "note": "先慢速練，再錄影比較",
      "revision": 1
    }
  ],
  "takes": [],
  "recipes": [],
  "exports": [],
  "moves": []
}
```

完整備份保留所有筆記與配方，但排除裝置路徑、file handles、object URLs、相機 deviceId、暫存 chunks 與權限資訊。還原後所有媒體先是 missing，逐一重新連結。匯出摘要必須寫「此檔僅含筆記／配方，不含影片」，另列需保存的示範原片、自拍原片、VS 輸出；所有媒體可用一般檔案方式另存。

P0 不做巨大 ZIP 打包，避免手機瞬間佔滿記憶體。不能因 JSON 可以還原就宣稱影片也已備份。未完成的 take 可記錄失敗狀態，但不輸出不可用的內部暫存位置。

## 4. 匯入與衝突

流程固定為：讀檔大小檢查 → JSON parse → schema／版本／型別／時間範圍檢查 → 關聯完整性 → 預覽新增與衝突 → 使用者選擇 → 單一可回滾 metadata transaction → 重連媒體。

初期驗證護欄：JSON ≤10 MiB，最多 10,000 筆 marker／take／recipe 等各類記錄，單筆 note ≤20,000 字元，有限且安全的整數時間與 revision。這些是拒絕超大／惡意輸入的起始值，不是「付費後可解除」的額度；需隨效能實測修訂並公開。

完整備份及保存未確認時的救援 JSON 不加縮排，避免額外空白讓接近上限的合法筆記超出實際匯入 bytes 限制；仍保留全部允許欄位與內容。更新 exportedAt 後才驗證，匯入上限不提高，分享預覽的大小檢查沿用原規則。

不支援的新 major schema 必須停止，不猜欄位寫入；缺欄位、重複 ID、孤兒關聯、負時間、無限數、巨大字串、`__proto__` 等危險結構須拒絕或由白名單正規化。純文字呈現內容，不執行 HTML、不自動開啟外連。

同 sourceLibraryId 且相同 ID／相同 canonical 內容：跳過，重複匯入不產生副本。相同 ID 但內容不同：預設保留本機，提供「另存衝突副本」；副本重新配置 ID 並重寫關聯，不能只改 marker ID 卻讓 take 仍指錯影片。不同來源 library 預設作為新資料集匯入，以匯入對照表保持再匯入冪等。不作自動雙向同步，也不以牆鐘時間決定誰比較新。

正常編輯以 revision 做樂觀檢查。另一分頁已更新時提示衝突，保留草稿；禁止靜默覆寫。

## 5. 重新連結媒體

檔名、長度、位元組大小只作候選提示；不能證明兩個檔案相同。使用者預覽首段及標記位置後明確確認。若要自動精確配對，必須有完整內容 hash 並在 worker 分塊處理／可取消；抽樣 hash 只能快速篩選，不是完整身分驗證。P0 可先採候選＋人工確認，不必為大型原片阻塞整個 UI 計算 hash。

影片被裁切、轉碼或通訊軟體壓縮後可能不同，需重新確認時間對齊；超出新片長的 marker 顯示待修復，不靜默截斷。take、recipe、export 的重連規則相同；匯出影片不能代替自拍原片來重建可編輯配方。

## 6. 分享格式（P1）

第一版分享流程對應 [#18](https://github.com/sunpochin/dance-stamp/issues/18)：只做本機檔案匯出／匯入與媒體重新連結。Dance Stamp 不提供影片儲存、上傳中繼或遠端播放服務；Google Drive、Dropbox、iCloud Drive 與 AirDrop 是使用者自行選擇的傳送途徑，不是資料格式或核心功能的依賴。

`kind=share` 使用相同 schema，但只包含勾選的 Video／Marker 及必要描述，預設去除 note 正文、老師、原始檔名、拍攝日期與無關 take。分享前有內容預覽，使用者可主動加入欄位。接收後以新 ID 與來源識別保存，不默認信任對方 ID。

### 第一版檔案流程

1. 寄件者勾選片段與欄位，預覽後匯出 `.dance-stamp.json`（`kind=share`）。明示「此檔僅含選定筆記／片段資料，不含影片」；不把完整備份當成分享檔。
2. 示範原片與 VS 輸出作為獨立影片檔，由使用者另行選擇保存及傳送。接收者已有相同影片時只需傳筆記；不把影片 bytes／base64 塞進 JSON，也不要求大型 ZIP 打包。
3. 使用者自行把檔案存進自己的 Google Drive、Dropbox 或 iCloud Drive，並在該服務設定分享對象與權限；也可用 AirDrop 或一般檔案傳送。App 不登入雲端帳號、不取得 OAuth 憑證、不自動上傳或代發連結。系統分享只在能力偵測後作選用入口；不支援時保留下載後自行傳送的路徑。
4. 接收者先取得檔案，再在 App 匯入筆記；依第 4 節驗證、預覽與重建 ID 關聯，依第 5 節選取影片、人工預覽配對，確認後才能跳到指定片段。VS 檔不代替示範原片配對；影片經裁切或轉碼後需重新確認時間對齊。
5. 尚未取得影片時保留筆記並顯示「需要選取影片」；分享／匯入取消或失敗不得刪除原片或既有筆記，保留重試與改用其他傳送途徑的選擇。

匯出檔案或交給系統分享不代表雲端上傳、對方下載或匯入已成功，App 不顯示無法確認的「已送達」。雲端空間不足、分享權限不符或連結失效由使用者在該服務處理；App 仍可匯出／匯入本機檔案，不要求升級付費方案。

時間連結只能在已匯入且完成影片配對的本機資料中定位 marker，不能授權讀取寄件者手機或雲端影片；第一版不讀取雲端分享連結來串流播放。筆記檔的欄位篩選不會替另傳的影片去除畫面、聲音或內嵌資訊，傳送前須自行確認內容與檔名。分享出去的 JSON／影片檔案可被複製；即使停止雲端連結分享，也不能撤回已下載副本。

第一版不做自建影片儲存、雲端分享 token、供應商 API／OAuth 串接、自動雙向同步、自動發社群或已下載檔案的遠端撤銷。後續若要加入雲端直連，需另行規劃與授權，不是完成 #18 的前提。桌面檔案流程已實作（2026-10-28），細節見下節；各裝置的存檔、傳送與接收匯入能力仍依 [ACCEPTANCE.md](ACCEPTANCE.md) 實測。

### 桌面分享允許清單與 ID（2026-10-28）

| 選取 | 自動補足的必要關聯 | 預設排除 |
| --- | --- | --- |
| Video | 該 Video 與 reference 描述 | 該影片所有未選 Marker／take／VS |
| Marker | 該 Marker、Video 與 reference 描述 | 正文（保留空 note 以相容 v1） |
| take | 該 take、recipes、Video、reference／自己的原片描述 | 其他 take／VS、captureTiming、原建立日期 |
| VS 描述 | 該 export 與 owning recipe／take 所需的上列關聯 | 其他輸出、影片 bytes |

必含標題、時間、固定比例、所選配方的 offset／鏡像與必要種類／容器／大小描述。額外允許欄位只有 note、teacher、danceStyle、recordedDate、originalName；每次重新開啟預設全不勾。未知欄位、Move／節拍或裝置 metadata 不因新功能而自動加入。標題本身也可能含私人內容，須看實際文字預覽；展開區可核對完整 JSON。選項改變後必須重新預覽，下載與可選系統分享使用該次預覽 File。縮排後實際檔案也須 ≤10 MiB。

v1 take／export 必填 createdAt 用固定 `1970-01-01T00:00:00.000Z` 佔位，代表分享未提供原建立時間，不是拍攝日期；exportedAt 仍是匯出時間。舊資料不回填此值。接收後完整 backup 可保存上述允許欄位，不因備份還原而遺失。

share 在空庫或原來源庫都重建所有 ID，使用獨立 `dance-stamp-share-v1` namespace 的穩定 UUIDv8，原 sourceLibraryId 只作資料來源隔離，非帳號或授權。匯入後為接收者的 backup 資料，不接管其 library 身分；同一分享重匯冪等，內容不同沿用第 8 節衝突副本。完整備份還原後仍維持此行為。版本與匿名結果見 [#18 證據](evidence/issue-18-sharing.md)。

## 7. 桌面 Web v1 實作狀態（#5）

目前採原生 IndexedDB，metadata 快照內仍分 videos／assets／markers／takes／recipes／exports，media 與 chunks 獨立 stores。全庫 revision 在同一 readwrite transaction 比較，metadata 與一個媒體 Blob 原子 finalize，失敗全數回滾。輸入仍依本文件 v1 白名單，不包含內部 state、storageKind 或 object URL。

新增內部 state／storageKind 為向後相容選填欄位；重開依實際媒體 key 推導 ready／missing／interrupted。recording 不因新分頁開啟而變更，恢復須取得同一 take 的 Web Lock。初始 0→1 migration 已有成功、失敗、回滾與重試證據，未知升級拒絕而非猜測轉換。

縮短來源檔不改 canonical duration 或既有 marker；超界時間必須由使用者編輯修復。同名檔與不同檔名均不自動綁定。完整備份的衝突副本與媒體保存清單已由 #12 接入桌面流程，實測與範圍見第 8 節。

## 8. #12 桌面備份與恢復實作

匯入先顯示新增／重複／衝突、來源影片與媒體提醒；不匯入保持原資料，另存衝突副本須明確確認。只複製受影響的依賴閉包並重寫所有關聯；reference 變更會分開 Video，衝突配方的 VS 描述也分開，不暗中連回本機舊成檔。共同、未變的原片描述仍可由配方共用；不複製影片 bytes。

穩定 UUIDv8 使用 sourceLibraryId、表名、原 ID 與有版本的 canonical 政策，不以檔名判斷身分。副本另納入內容與重寫後關聯；備份 exportedAt、陣列次序及被白名單排除的裝置欄位不改變副本身分。相同副本重匯跳過，副本後來編輯仍保留，必要時新增另一個穩定候選。空環境完整還原保留來源 library 身分；完整備份不加入本機 alias、路徑或媒體 bytes。細節與取捨以 TECHNICAL.md 第 18 節及 library.js 為準。

媒體保存清單分示範、自己原片與 VS，依實際 media key／已確認本次 File 顯示已存副本、本次連結或缺片。備份按鈕會打開清單，JSON 只含描述；三類影片都要自行另存。缺片逐側先實播、再確認，預設只在本次連結；勾選才保存副本。老師候選不足已存比較 B 時不可確認；不改短舊時間。取消、quota、跨分頁版本衝突不破壞舊配對。VS 重連不取代比較用的兩支原片。

相同原檔重連保留已有 codec 描述；較短／轉碼候選顯示差異，原筆記與配方不靜默改寫。同名筆記以畫面序號區分而不改標題。此為 Web 實作，裝置／瀏覽器與正式驗收仍分開記錄，見 [#12 證據](evidence/issue-12-backup-recovery.md)。

## 9. #13 本機副本與個別刪除

不新增 schema。副本移除只改本機狀態並移除 media key；可攜描述與配方保留，重開由實際 key 判斷 missing，可按第 8 節重連。本次已開啟 File 不等於仍有持久副本。

刪除單一 VS 保留 recipe／take；刪 take 包含其 recipes、exports；刪整份影片筆記包含標記及下游。只有完全失去引用的 asset／Blob 才清理，共用原片保留；chunks 以 cameraAssetId 清理。計數預覽後明確確認，metadata／media／chunks 同一交易、全庫 revision 及 take 鎖保護，取消或失敗不部分刪除。原始檔與相簿不在此交易內，App 不會刪除。詳見 TECHNICAL.md 第 19 節及 [#13 證據](evidence/issue-13-offline-storage.md)。

## 10. #17 v2 分類與動作庫

本節取代上方「Move（P1）」未實作描述：桌面候選輸出 `schemaVersion: 2` 的完整 `kind=backup`，仍可讀 v1；第 3 節 JSON 保留為有效 v1 舊備份範例。分享格式屬 #18，本變更未實作或改其 UI。

- Video：選填 `teacher`／`danceStyle`（各 ≤200 字）、`recordedDate`（真實日曆日期 `YYYY-MM-DD`）；清空即移除欄位。日期不推測自檔案時間。
- Move：`id`、非空 `name`（≤500 字）、`danceStyle`（≤200 字，可空）、`status`（wanted=想練／practicing=練習中／learned=會了）、正整數 `revision`。只有人能改狀態。
- Marker：選填 `moveId`，必須指向本備份的 Move。解除關聯保留標記及其他資料。移除 Move 解除全部指向它的 marker 並增加其 revision，不刪媒體。
- 練習歷史沒有新表：按 Move 的 marker 與 take 老師區間相交顯示，點位置需 ≥take 起點且 <結尾；區間只接觸邊界不算。編輯 marker 範圍或關聯會改變視圖，但 take／配方原件保留。按 take.createdAt 排序，不當拍攝日期。

v1 正規化到 v2（v1 的 moves 必須為空），不重配舊 ID、不移動媒體。讀取只在記憶體升版，成功寫入才以同一全庫 revision 提交；IndexedDB store version 維持 1。失敗保留原 version／revision／metadata／media／chunks，不用重置修復。新欄位仍走 JSON 白名單、10 MiB／各表 10,000 筆上限、關聯驗證與純文字顯示。

舊程式不讀 v2；降版需升版前由舊版保存的 v1 備份與獨立原片，在另一資料環境還原。現有 v2 資料保持原樣；本版不輸出會省略動作的 v1 備份。衝突與不同來源匯入一併重寫 Move→Marker，多次重匯冪等；衝突動作副本保留各自狀態，不依時間戳覆寫。測試與版本證據見 [#17](evidence/issue-17-moves.md)。


## 11. 功能整合候選的 backup／share 相容

此整合候選的新完整備份與分享都輸出 schema v2，接受 v1／v2 的 backup／share；上述 #17、#18 獨立候選的 v1 敘述保留來源歸屬。合法 v1 分享中明確加入的老師／舞風／日期與原檔名會保留；分類仍依第 10 節的 ≤200 字與有效日曆日期契約，無效值拒絕匯入並保留原件。分享匯入的 ID 命名空間不改，v1 正規化後再重匯 v2 仍冪等。

從 v2 動作庫挑片段分享時不帶 Move 或 marker.moveId；接收者既有動作不被覆寫。筆記、原片及 VS 的分開保存／重連與取消、quota、revision 保護不變。舊程式不能讀 v2，回復限制沿用第 10 節，不清庫或產生會省略動作的 v1 降版檔。


## 12. #19 可選手動拍點 metadata

原 #19 v1 候選及本功能整合 v2 的 Video 與相機 PracticeTake 可選 `beatGrid: { bpm, firstBeatMs, countInBeats }`。BPM 是來源音樂原速有限數字 20–300；firstBeatMs 為非負安全整數且嚴格小於老師原片 durationMs；countInBeats 必填且只允許 0（原秒倒數）、4、8。未知子欄位白名單排除。Take 為錄影開始前保存的快照；Video 後來校正不回寫舊 take 或 recipe。

`{"bpm":120,"firstBeatMs":350,"countInBeats":8}` 表示原片 0.35 秒第一拍、原速每拍 0.5 秒。0.5× 錄影每拍實際 1 秒，8 拍倒數為 8 秒；來源拍點不翻倍。完整時間語意只以 [RECORD_COMPARE](RECORD_COMPARE.md#7-19-手動拍點與倒數桌面工程候選) 為準。

欄位缺少代表未設定，沿用秒數；拍點本身不另升資料格式，整合候選依 #17 採 v2，IndexedDB store version 仍為 1，不搬移舊資料。無效拍點使整份備份拒絕，不部分匯入；備份、衝突副本、ID 關聯重寫及重匯冪等沿用第 8 節，拍點納入 canonical 內容。備份不含提示音、影片 bytes 或裝置資訊。舊版應用可能忽略它不認識的欄位，降版前保留新版原備份，不能拿舊版重新匯出的 JSON 保證拍點仍在。

UI 只有交易成功才套用；錯誤、取消及另一分頁 revision 衝突保留草稿與上次設定。移除只刪該 Video 的可選欄位，不刪標記、原片、take 快照或配方。沒有新的 migration；既有 migration 失敗回滾演練仍適用。
