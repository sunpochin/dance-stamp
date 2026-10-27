# 資料模型與可攜格式 v1 草案

狀態：待實作的契約；此文件不是已存在的 DB schema。正式 v1 發佈前可修訂，但一旦有真實使用者資料就必須用 migration／版本判斷處理。

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
| Move（P1） | id、name、danceStyle、status | 一個動作可由多個 marker 指向 |

不建立 users、subscriptions、share_tokens 或同步 outbox；本期沒有對應服務。`createdAt/updatedAt` 使用 UTC ISO 時間，課程日期用使用者輸入的日期字串，不能只靠檔案修改時間冒充拍攝日期。

ID 為隨機 UUID，與檔名、路徑、內容 hash 分離。reference 指向錯誤影片比找不到影片更危險，因此不得只憑同檔名自動連結。

PracticeTake 可選 `captureTiming`（#9，v1 向後相容）：`recorderRequestedMs` 必填，`recorderStartedMs`、`referencePlayResolvedMs`、`referenceAtPlayMs` 可缺。皆為非負安全整數毫秒；最後一項不能超過來源影片長度。前三項使用同一次頁面生命週期的 performance 單調時鐘，最後一項是來源媒體位置；不能當 UTC、跨 take 排序依據或 G2 同步證明，也不假設非同步 start 與 play Promise 必定誰先到。匯出／匯入只保留這四欄，不帶 deviceId、裝置 label 或原始錯誤；舊資料沒有此欄仍可讀取，外部原片匯入不偽造觀測值。

## 2. 媒體狀態

### 既有影片比較的資料決策（2026-10-28，待實作／驗收）

沿用上表關聯：老師片為 Video／reference asset，自己的外部原片為 take asset；PracticeTake 是比較用的練習紀錄，不必由本工具的相機產生。既有欄位 `cameraAssetId` 在此指自己的原片，為相容舊備份保留名稱，不據此推斷有相機授權或拍攝時間。外部選片的 `createdAt` 是建立紀錄時間，不冒充檔案拍攝日期。

老師起訖、r 與自己的起點沿用 `referenceStartMs`／`referenceEndMs`／`rate`／`offsetMs`；時間定義只以 [RECORD_COMPARE.md](RECORD_COMPARE.md) 為準。新增配對時明確設定 r，不能繼承上一個 take 的慢速值；後續改動老師區間或 r 需建立新 take／recipe 並保留舊資料，避免舊輸出仍指向被悄悄改寫的時間映射。offset／鏡像改動則沿用 recipe revision。

兩個外部 File 預設僅當次可用，明確選擇保存副本才複製；與工具內錄影必須保存新產生原片的流程分開。外部匯入不經 `recording`／相機 chunks 恢復；解碼、使用者確認、關聯驗證成功後才建立可用配對。換片失敗或取消保留原配對、筆記及輸出，多分頁／quota 衝突不部分寫入。

JSON 備份包含兩個 asset 的描述、take 與 recipe，不含影片 bytes；缺片時逐側預覽、確認重連，不靠同名自動綁定。#10 負責建立與重開配對，#12 驗證匯出／還原。此設計不新增交換欄位或提高 schemaVersion；實作若發現需要改格式，先定義向後相容與 migration，不能直接讓既有 v1 備份失效。現有自拍載入程式不代表此完整資料流程已通過驗收。

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

第一版不做自建影片儲存、雲端分享 token、供應商 API／OAuth 串接、自動雙向同步、自動發社群或已下載檔案的遠端撤銷。後續若要加入雲端直連，需另行規劃與授權，不是完成 #18 的前提。目前為規劃；各裝置的存檔、傳送與接收匯入能力仍依 [ACCEPTANCE.md](ACCEPTANCE.md) 實測。

## 7. 桌面 Web v1 實作狀態（#5）

目前採原生 IndexedDB，metadata 快照內仍分 videos／assets／markers／takes／recipes／exports，media 與 chunks 獨立 stores。全庫 revision 在同一 readwrite transaction 比較，metadata 與一個媒體 Blob 原子 finalize，失敗全數回滾。輸入仍依本文件 v1 白名單，不包含內部 state、storageKind 或 object URL。

新增內部 state／storageKind 為向後相容選填欄位；重開依實際媒體 key 推導 ready／missing／interrupted。recording 不因新分頁開啟而變更，恢復須取得同一 take 的 Web Lock。初始 0→1 migration 已有成功、失敗、回滾與重試證據，未知升級拒絕而非猜測轉換。

縮短來源檔不改 canonical duration 或既有 marker；超界時間必須由使用者編輯修復。同名檔與不同檔名均不自動綁定。完整備份的衝突副本選項仍由 #12 另做。
