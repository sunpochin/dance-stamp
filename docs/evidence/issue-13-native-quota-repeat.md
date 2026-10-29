<!-- 檔案用途：保留獨立 profile 重跑的原生配額收據與完整指紋。所在層：匿名版本化 QA。主要關聯：issue-13-native-quota.md、DATA_FORMAT.md、ACCEPTANCE.md。 -->
# #13 原生配額的獨立重跑收據

2026-10-29（Asia/Taipei）：**儲存層獨立重跑通過**。512 KiB 原生 origin 配額下，替換／新增 Blob 都由真正 `IDBTransaction` 以 `QuotaExceededError` 中止，產品 `writeLibrary` 拒絕。舊資料完整相同；解除限制後相同候選成功，正常關閉並以同 profile 新程序重開亦完整相同。本輪未發現產品 bug，未修改 runtime。

等待鎖期間，main `38e6cf9` 已合入 `2d31302` 的[原生配額工具與證據](issue-13-native-quota.md)。本 PR 保留該工具與既有證據，只追加這次不同 profile、不同實測時間的完整 bytes／JSON 指紋收據；不重複維護工具，也不以舊 runtime 的結果承接最新 Safari runtime 驗收。

## 受測版本與環境

- runtime 基線：main `918d8d7aa814533823522e3d4e0ab18df75cb212`；靜態 `db129e273cf0039b`。實測時尚未同步後來的 #63 Safari 整合；本 PR 最終只追加證據及索引，保留目前 main 的 `web/`、工具、schema、套件與品質入口。
- 本輪原始 [QA 腳本固定版本](https://github.com/sunpochin/dance-stamp/blob/62bcf3f0490e3ecb892041f926e9637655e757f0/scripts/verify-native-quota.ts)，SHA256 `0aef984f667767c849a1667c0b20c94e88bb39618e3a57a9cde2098bbb9793aa`。實測在該來源提交前完成，以上 SHA 綁定實際執行檔；後續同步 main 保留其既有工具，不把目前工具／head 冒充當時受測檔案。
- 實際服務的 `storage.js` 與來源逐 byte 相同，SHA256 `2de40d537d2ab049596acaaf549e9e9d324e7b8ce705b0edfe86af1396dbbd77`。
- macOS 27.0.1／arm64；Bun 1.4.4；獨立 headless persistent Chrome `156.0.8078.49`，Chromium revision `29eb03535d5f2f4f899b95f22a92413ffde5284e`，CDP 1.3。
- 實測時間 07:03:27–07:04:37。全新專用 profile、動態 loopback 白名單服務；空白 QA 頁載入真正產品儲存模組，阻擋 SW 干擾配額；沒有操作日常瀏覽器或既有預覽服務。

## 原件、限制與原生拒絕

先透過產品 `writeLibrary` 保存非空 v2 資料：Video／Marker／Move／take／recipe／export 各一筆、三份 asset 描述；Marker→Move、take→Video／自己的原片、export→recipe／VS 的 ID 關聯完整。Video／Marker／Move／recipe 都有既存 revision，library revision 為 3。三個舊 Blob 各 1,048,613 bytes，另以產品 `saveChunk` 保存一個 257-byte sentinel。候選為 4,194,341-byte 替換及 4,194,363-byte 新增；唯一合成 Blob 總量固定 11,534,800 bytes（小於 32 MiB），不靠填滿硬碟。

依 [Chrome 官方 CDP schema](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Storage.pdl) 呼叫 `Storage.overrideQuotaForOrigin`，以 `Storage.getUsageAndQuota` 核對啟用狀態與實際數值；省略 `quotaSize` 解除。不能只看 API 回成功或 `estimate()`：本輪 estimate 仍回約 10 GiB，沒有拿它當拒絕證據。

| 案例 | 寫入前原生 IDB usage | 原生 quota／overrideActive | 真正原生結果 | 產品回覆 | 拒絕後／成功後 revision |
| --- | ---: | --- | --- | --- | --- |
| 替換舊 reference Blob | 3,163,068 bytes | 524,288 bytes／true | `abort`，`isTrusted=true`，`IDBTransaction.error.name=QuotaExceededError` | Promise 拒絕 `QuotaExceededError` | 3／4 |
| 新增 reference asset／Blob | 6,320,190 bytes | 524,288 bytes／true | 同上 | 同上 | 4／5 |

原生來源是 **readwrite 交易的 abort**，沒有聲稱取得 request error。記錄方式只在自有 DB 的 `transaction` 原參數委派後掛原生事件監聽，回傳原交易；沒有包裝 `put`、人工 throw、呼叫 abort、preventDefault、合成事件或替換儲存實作。重試則觀察到 `isTrusted=true` 的原生 `complete`。

每次設定限制後固定等待 31 秒再寫。Chromium 的 [可寫餘額快取與 30 秒期限](https://chromium.googlesource.com/chromium/src/+/1c9524c5d3627044b0cf0a0b679978e82b702279/content/browser/indexed_db/instance/bucket_context.h)及[衰減／重新查詢邏輯](https://chromium.googlesource.com/chromium/src/+/1c9524c5d3627044b0cf0a0b679978e82b702279/content/browser/indexed_db/instance/bucket_context.cc)提供此設計依據；這是與實測一致的原因推論，不宣稱已取得受測 binary 的內部堆疊證明。等待本身不能判 pass，仍強制要求上述真正 native abort。

## 完整舊資料與重試

每一階段均從原生 `metadata`／`media`／`chunks` 讀回所有 keys 與 values，保存完整 metadata JSON、產品讀取結果、所有 Blob 完整 base64／長度／MIME／SHA256；runner 另重算每份完整 bytes 的 SHA。拒絕後完整物件／完整 bytes 相等，1 秒後再讀也相等；DB identity、version 1、三個 store 名稱不變。新增失敗時沒有新 asset 描述或新 media key，沒有延遲提交、清庫、重新建庫或 revision 提前增加。

解除限制並核對 `overrideActive=false` 後，重試同一候選資料物件及同一 Blob，原生 metadata 與候選逐欄相同、Blob 每 byte 相同。替換成功只改預期原件；新增成功保留全部既有 Blob／chunks，兩次成功各增加一次 library revision。然後正常關閉整個瀏覽器，確認其 CDP 所列程序全部退出，再以同 profile 新程序重開；完整 JSON、ID／revision、keys、全部 Blob／chunk bytes 相同。重開初次 quota usage 暫報 0，所以保留證據以真正 IDB 讀回為準，最終 native usage 為 10,526,443 bytes。

| 完整 Blob | bytes | SHA256 |
| --- | ---: | --- |
| 原 reference | 1,048,613 | `6b6ddf381e629959a628ac9b620196d18756991bb07e5b3b418f4f3d44865833` |
| 原自己的原片 sentinel | 1,048,613 | `d336412383a0e02b4e2e4c405d29d1e3daf9c9b149b258edd406181c4fc013c9` |
| 原 VS sentinel | 1,048,613 | `2da8c341462415fe69ced94397af25c596a5b9ecea47c228513cc74490ae6c75` |
| 原 chunk | 257 | `0ebb03567c4cfa9010a07fcad4b529bba20b0262978ef81bbf80aeec4f56adb5` |
| 重試替換 | 4,194,341 | `da107d049b634324384ece57c636aeef4a56bf552207697b5b05a1de339ad400` |
| 重試新增 | 4,194,363 | `962acf4fa8b851bfa0fe21b3a720bf6ee21ba458c7dd90ffc9d49b1a524effa2` |

初始／替換拒絕後／再等 1 秒的完整 snapshot JSON 指紋均為 `92026814dc985516ee61f9e29f502343f36c6fcb84378ea0328c8b18d8e5a683`。替換重試成功／新增前／新增拒絕後／再等 1 秒均為 `c4fcffa549197188454b5b2503dbe17517331bbb3aa6fcbbacef3de29aeef781`。最後提交與同 profile 重開均為 `cd5a939dd265caafbf6ac3eb4d8a721c7c626f322286d8f9160ef33cc9d372e3`。指紋定義是對完整 snapshot 的 `JSON.stringify` 做 SHA256，包括完整 Blob base64；每次拒絕亦作完整相等檢查，不是只比 hash。

## 重跑、檢查與清理

重現流程可使用 main 的既有工具；若要逐 byte 重現本輪腳本，取上方固定版本。先使用 Bun 1.4.4 完成原 `bun run check`，再執行：

```sh
bun --no-env-file scripts/verify-native-quota.ts <已安裝的-playwright-index.mjs> <本機-Chromium-執行檔>
```

工具不安裝套件或下載瀏覽器；原子取得共用鎖，已有檔案或目錄就安全拒絕。本輪另跑既有 `storage.js`、`moves-storage.js`：migration 回滾／未知版本、跨頁 take 鎖、v1 延遲升版、取消／revision／草稿保護全部通過。它們在另外的空 context 執行，只替換硬編碼測試埠，既有人工例外注入不計入本輪原生 quota 證據。原受測基線完整 `bun run check` 與提交 hook：366 tests／1,015 expects／0 fail；原有 typecheck、lint、公開掃描、建置均通過。同步 main 後的文件整合檢查由交付 PR 記錄，未弱化入口。

成功 raw 在 ignored `output/native-quota/run-faVlEm/`；包含 `result.json`、各階段完整 snapshot 與同 profile。早期立即寫仍成功的 `run-e1YYbw`、僅在 DB 上監聽而缺交易事件的 `run-025hpi`，以及未啟動瀏覽器的鎖競爭 `run-udDVQ0` 都保留且不計通過。未公開 profile、raw bytes、端點、PID 或完整程序命令。

成功輪兩次自己的 browser close 後，CDP 所列 7／6 個程序皆已退出；最終 origin override 已解除並實查 false，本機服務停止後連線失敗，自有 nonce 鎖已釋放。本輪各階段儲存 snapshot 的媒體擷取 API 呼叫數皆為 0；禁止相機／麥克風／畫面擷取，沒有桌面操作、全機設定或掃殺程序。

## 範圍限制

這是 **Chromium 配額政策下的產品儲存函式證據**，未透過產品 UI 處理本輪 quota／草稿恢復。Blob 是不可播放的合成 sentinel，不代表影片品質、大檔效能、真正低磁碟、系統回收、停電、交易中強制終止、永久保存、Safari 或實體裝置驗收。沒有重跑有效的雙舊頁或 SW 部分安裝強制中斷案例。iPhone 暫緩，#13／#1 與未測 gates 保持開啟；待 Claude Code 或使用者獨立審查，沒有合併、部署或發布。
