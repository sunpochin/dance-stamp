<!-- 檔案用途：記錄真正部分安裝時強制終止及同設定檔離線重啟的匿名證據。所在層：#13 桌面驗收。主要關聯：forced-install-restart.ts、MEDIA_PROBE.md、sw.js。 -->
# #13：候選部分安裝時強制終止瀏覽器

2026-10-29 Asia/Taipei。結果：受測 Chromium 在新版只保存第一份資源、第二份 HTTP 回應未完成時被 SIGKILL；同一 persistent profile 的新瀏覽器程序離線重開後，舊殼、舊筆記與合成 Blob 完整取回。沒有發現產品 bug；原 #61 新增可重跑的瀏覽器測試，本整合續測只補證據與文件，不修改產品 runtime 或資料格式。

## 版本與資料

- 全新專用 clone，從同步 main `918d8d7aa814533823522e3d4e0ab18df75cb212` 建 `test/issue-13-forced-install-restart`；交付 head 由 PR 綁定。未採用未合併 PR #58，也不重做其雙舊頁等待／activation 案例。
- 舊版為 main 的靜態 `db129e273cf0039b`；worker 原始 bytes SHA256 `05f1a9689216e98eed9eb74f9267716bee372563d968f977b5019cf047fbb4d0`。完成版測試 SHA256 `f243a0400286ea9c3d9d21edfc1d28e672c89a7815df70f26ac7a8a996b8c9e2`。
- 最終候選 `db129e273cf0039b-forced-74547dc0`。沿用真正產品 SW 原碼，只在測試主機記憶體更換版本、HTML／CSS 合成註解及其正確 manifest 雜湊；不是任意未來產品版本或 migration 的保證。
- macOS 27.0.1（26A434）、Google Chrome 156.0.8078.49 headless、既有 Playwright core `1.64.0-alpha-1790635538000`、Bun 1.4.4。未安裝新套件，未接管日常瀏覽器、預覽站或其他聊天的程序。
- 一份合成影片描述、一個合成標記、一份 1,048,613-byte `application/octet-stream` sentinel；經產品 `writeLibrary` 原子交易保存。庫 revision 1、影片 revision 3、標記 revision 2；所有 ID 與原生 metadata／media key 於前後逐一相同。sentinel 的每個 byte 依固定公式核對，完整 SHA256 `6ef72dcccd9b51e3a7f384632a9dff22af4c12372f3396fe557011d42e867971`。

## 強制終止的直接證據

最終輪 2026-10-29 02:00:33–02:00:36（Asia/Taipei）：

1. 工具先原子取得共用媒體測試鎖，以自有動態 loopback 主機及全新 persistent profile 啟動 PID／群組 `29992`。原生 CacheStorage 的舊版 11／11 份資源均符合 manifest；產品讀回與原生 IDB metadata／Blob 對照均完成。
2. 02:00:35.499：候選請求第二份 `/style.css`，主機保持真正 HTTP 回應未完成。候選原生 cache 僅有 `/`，其 SHA256 `811fe9330b4154ec4e7a7d3bd43fd35731ecaa2650e1c597121a7de1403045e9` 與舊 HTML 不同。不是第一份尚未寫入或已完整 waiting 的情況。
3. 02:00:35.567：`registration.installing.state === 'installing'`，waiting 為 null，舊 active 為 activated；舊 controller 的 `CHECK_OFFLINE` 回覆仍為 `db129e273cf0039b`、complete true。候選為 1／11 份，舊 cache 與 IDB 全部不變。
4. 先把上述證據寫入本機 raw，再於 02:00:35.606 對本工具 spawn 的獨立群組 `29992` 送 SIGKILL。raw 保留啟動參數、profile、PID／PPID／PGID／開始時間與群組成員；只使用本次 child provenance，未依名稱掃殺。02:00:35.657 收到實際退出 signal SIGKILL、exit code null，群組剩餘程序 0。此前沒有呼叫 browser.close。
5. 02:00:35.659 以**同一 profile**啟動新 PID／群組 `30023`。不清 cache、IDB、metadata 或 Blob，不匯入備份；只移除失效的自有除錯端點檔案。導航前設隔離 browser context offline，主機仍保持候選 barrier。
6. 02:00:36.357：舊頁由真正 SW 提供，完整 HTML bytes SHA256 為舊版的 `1ae8198da59a5497a09f807d90719b5a314c6bc00cdc131083e3af01c112efa4`。舊 cache 仍 11／11，worker 回覆舊版 complete true，active activated、installing／waiting 均 null；候選 partial cache 仍只留 HTML，沒有冒充已啟用。
7. 原生 `navigator.onLine === false`；未快取的網路 probe fetch 失敗，主機 probe hits 0，斷網導航後主機收到資源請求 0。全部筆記 JSON、原生 metadata、庫／列 revision、media key、Blob size／type／SHA256／每一 byte 都與終止前相同。
8. 只對重啟群組 `30023` 做 SIGTERM 收尾，02:00:36.442 實際退出 0、剩餘群組程序 0；主機關閉，自有 nonce 匹配的鎖已釋放。相機／麥克風／畫面擷取 API 呼叫 0。

## 回歸與失敗保留

- 初次開發輪 `db129e273cf0039b-forced-10f5a825` 也完成真實 SIGKILL／同 profile 離線取回；完成版另加測試檔雜湊與收尾斷言後，以上述最終輪重新驗證，兩輪資料不混算。
- 共用鎖仍被其他驗證持有時的負向輪，工具回報 EEXIST、exit 1，沒有啟動瀏覽器或修改原鎖。其原始失敗紀錄保留；這是互斥工具的拒絕結果，並非產品儲存失敗，也沒有充當強制終止成功證據。正式兩輪沒有產品或工具失敗。
- 既有 `offline-cache-failure.js` 真正 worker 的 cache put／open／match 故障、修復後離線重開與合成資料保留通過；既有 `offline-ready.js` 的 context 斷網／受控重開通過。沒有把其 Cache API 注入當作本次 SIGKILL 證據，也沒有繼續執行其媒體後續案例。
- 原 `bun run check` 通過：366 tests、1015 expects、0 fail；包含 harness、公開掃描、TypeScript、原 lint 與 Web build。最終暫存後再跑相同入口及原 hooks，結果以交付 PR／CI 為準；未降低門檻。
- 重跑入口及判斷條件見 [MEDIA_PROBE.md](../MEDIA_PROBE.md#部分安裝時強制結束瀏覽器)。raw JSON、瀏覽器日誌與 profile 僅留 ignored output；不公開本機端點、設定檔路徑或程序完整命令列。

## 整合候選新增音訊模組後的重跑

2026-10-29 04:59:27–04:59:30（Asia/Taipei），主聊天在自己的專用 clone，以乾淨 `9d483e0484a5781c7e93dbd36213431bcbde85dc` 重跑同一份原工具（上述測試 SHA 不變），exit 0。環境仍為 macOS 27.0.1、Chrome 156.0.8078.49 headless、Bun 1.4.4 與既有 Playwright core；沒有替換 User-Agent 或存取真實相機／麥克風。

- 受測靜態為 `adbe8eb1d6acfd09`，實際 worker SHA256 `e8bffdacb06b2f7cc5b27749325c0c9a9cea4d4fd33ba21bc21b5e1c26b7741f`。舊 cache **12／12** 份符合 manifest，含新增 `local-audio.js`；本輪是新 worker 的實測，不沿用前述 db129e 的11份結論。
- 合成更新 `adbe8eb1d6acfd09-forced-687fb192` 在第二份 CSS 真正 HTTP 回應尚未完成時，候選 cache 僅 **1／12** 份新 HTML；04:59:29.949 記錄 installing、waiting null、舊 active／controller 完整。工具依實際 manifest 計數，沒有調整測試門檻。
- 04:59:29.986 只對自有 PID／PGID `53605` 發 SIGKILL，04:59:30.030 收到實際退出 signal SIGKILL、code null、群組剩餘0；原始證據在終止前已落盤。04:59:30.031 以同 profile 新程序 `53634` 重啟，導航前設 context offline，候選 HTTP barrier 仍保持。
- 04:59:30.473 確認由 SW 取回原 HTML，SHA256 `1ae8198da59a5497a09f807d90719b5a314c6bc00cdc131083e3af01c112efa4`；舊 cache 仍12份且各雜湊相同。舊 worker activated、complete true、missing 空，installing／waiting 皆 null。原生 navigator.onLine false、未快取 probe 失敗、主機重開請求0；不是連網取回後再宣稱離線。
- 原產品讀回 JSON、原生 metadata、媒體 keys、庫／列 revision 與上述1,048,613-byte sentinel 的完整 bytes／SHA256 全部相同；候選 cache 重開後仍僅新 HTML，未冒充候選已啟用或殘留已清除。
- 04:59:30.545 自有重啟程序正常退出0、群組剩餘0，主機停止、nonce 匹配的自有鎖釋放；媒體 API 呼叫0。raw／profile／日誌保留 ignored output，不放入下載包或公開附件。

這一輪填補新增音訊 manifest 的強制中斷缺口，與原 db129e 歷史輪分開保留；雙舊頁等待更新仍屬整合前的另一輪證據。資料是已提交的筆記與不可播放 sentinel，仍受下列限制，不延伸為播放品質、提交中的交易或 Safari 驗收。

## 限制與未驗證

這是受測 Chrome 在**更新下載／寫入部分 cache**時的程序強制終止。既有筆記／Blob 已成功提交，沒有宣稱錄影中、媒體交易提交中、schema migration 中或任意其他時刻也通過。SIGKILL 不等於斷電、實際磁碟損毀、填滿空間、瀏覽器回收／清除或永久保存；殘留候選 cache 未在本次要求自動清除。

sentinel 不可播放，不是影片品質、長片效能、20／100／200 MiB 媒體矩陣或下載解碼證據。沒有重新承接先前正常退出的大檔數據，也不外推為 Safari、實體裝置、系統飛航或跨裝置結論。iPhone 暫緩，Claude Code／使用者最終審查、完整 P0 與發布 gates 保持待驗；不勾原驗收、不關 #13／#1、不合併或部署。

## 筆記與影片副本交易尚未提交時的中斷

2026-10-29 新增選用的 `--pending-write` 情境，沿用本檔前述程序群組、nonce 鎖、全新 profile 與動態 loopback。產品程式、儲存 schema、套件與品質門檻未改；這項原生驗證仍待取得自有共用鎖後執行，不能由程式存在便宣稱通過。

案例先以真正 `writeLibrary` 保存一份非空筆記／標記與 1,048,613-byte 合成 Blob。候選同時改筆記及原片 bytes；原生 readwrite 交易只額外加入 keep-alive get，不替換 put、不偽造成功事件、不發出 abort。兩個 put 的 trusted success、交易內候選 metadata、持續處理請求且產品 Promise 未結束都記錄後，才對自有程序群組發 SIGKILL。

同 profile 新程序不清庫、不匯入備份，需逐一核對原生 metadata、完整產品 JSON、revision、media keys 與 Blob 全部 bytes／SHA256 仍為舊值；接著用相同候選與固定 Blob 內容重試成功，再正常退出並以同 profile 第三個程序讀回已提交的新資料。結果與實際來源在原生驗證後補入。

候選工具的 Bun 1.4.4 原完整 check 已通過：382 tests／1310 expects／0 fail，型別、lint、公開掃描與 build 通過。新增分支的原生正向流程尚未驗證：第一次執行因另一個仍在運行的原生 Safari 觀測持有共用鎖而取得 EEXIST，未啟動瀏覽器、未改動原鎖；該失敗輪保留，不列為交易中斷成功。

範圍限刻意延長的未提交交易，不涵蓋提交瞬間、錄影 chunk 交易、schema migration、實際磁碟滿、斷電、瀏覽器回收、Safari、裝置或影片可播放性。此案例不替代前段更新下載中的強制終止，也不關閉整張 #13。


### PR #72 整合候選

精確採用566f04a的選用情境並保留其來源關係；衝突只合併必要流程及文件，PR #66的spawn／PID／程序群組／nonce保護保留。未改產品runtime、schema、原始門檻或另建一套程序管理器。既有工具修改後的default與新增pending-write都必須在最終乾淨head實際重跑；目前仍未驗證，先前16bd7ca只證明當時default情境，不能承接為新增寫入中斷通過。原生執行、清理與獨立核對結果待取得共用鎖並完成後補記。

整合後原check通過408 tests／1551 expects／0 fail、型別、公開掃描、lint及build；靜態仍1aa1ae164c31d690。stop、launch與finally收尾主體逐byte等於整合前629a98b，直接執行真實收尾的故障單元亦通過；摘要僅沿收據的scenario／candidateVersion列示。這些不是原生正向執行結果。
