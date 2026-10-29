<!-- 檔案用途：記錄真正部分安裝時強制終止及同設定檔離線重啟的匿名證據。所在層：#13 桌面驗收。主要關聯：forced-install-restart.ts、MEDIA_PROBE.md、sw.js。 -->
# #13：候選部分安裝時強制終止瀏覽器

## Linux 原生補驗（2026-10-29）

受測來源 `a75148d460b1dd0f2a0909af6fc6e19eaded5aa6`，基線 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e`；[Harness CI #120 的 Linux job](https://github.com/sunpochin/dance-stamp/actions/runs/40830047664/job/123301983652) 原始 JSON／Chromium 日誌保留直接收據。這次是真正隔離 Ubuntu 24.04 runner，`platform=linux`、x64、核心 `7.0.0-1017-azure`、Chrome `156.0.8078.47` headless、Bun 1.4.4、Playwright core 1.64.1；實際共用鎖為 `/tmp/dance-stamp-p0-media-test.lock`。沒有使用 macOS 平台模擬或建立假的 `/private/tmp`。

產品靜態舊版 `adbe8eb1d6acfd09`，本輪候選 `adbe8eb1d6acfd09-forced-297fefd1`；manifest 有12份資源。測試來源 SHA256 `2e30c5271eb3ed0c1bfb6fb5ad911ef7789f0f76b2eb9cecbda8c42293fab443`、建置後舊 worker SHA256 `e8bffdacb06b2f7cc5b27749325c0c9a9cea4d4fd33ba21bc21b5e1c26b7741f`。後續僅補文件時保持此輪來源歸屬，不將它改寫為新 head 重跑。

2026-10-29 14:35:09–14:35:20（Asia/Taipei）：

1. 以工具自有 spawn 的 PID／PGID `2704`、全新 persistent profile 及自有 loopback 主機備妥舊版；原生 CacheStorage 12／12份符合 manifest，產品短交易已提交合成筆記、標記及不可播放的 sentinel Blob。全部 metadata、ID、庫 revision 1、影片 revision 3、標記 revision 2及媒體 key 另存基線。
2. 14:35:19.385 前，真正第二份 CSS HTTP 回應保持未完成；候選原生 cache 只有不同於舊殼的 HTML，為1／12份。`registration.installing.state=installing`、waiting null、舊 active activated，舊 controller 回覆 `adbe8eb1d6acfd09`／complete true。候選 HTML SHA256 `9871b8e46676fa40a20b930654fc34223d9d5b2665c649def96504750b935871`。
3. 先保存 barrier、PID／PPID／PGID／開始時間及15個群組成員的 provenance；14:35:19.394只對該自有群組送 SIGKILL，14:35:19.423取得實際 signal SIGKILL、exit code null、剩餘群組程序0。之前沒有呼叫 browser.close，也沒有偽造 lifecycle 或 Cache／IDB 例外。
4. 14:35:19.424用**相同 profile**新啟動 PID／PGID `2909`，導航前設定 context offline。14:35:20.159舊頁由真正 SW 提供、HTML bytes SHA256仍為 `1ae8198da59a5497a09f807d90719b5a314c6bc00cdc131083e3af01c112efa4`；12份舊cache完整，active舊版且installing／waiting null。原生 navigator.onLine=false、未快取probe失敗，主機probe及斷網重開資源請求均0。
5. 全部筆記 JSON／ID／revision、原生 metadata／media keys及Blob size／type不變；1,048,613 bytes每一byte比對與完整SHA256 `6ef72dcccd9b51e3a7f384632a9dff22af4c12372f3396fe557011d42e867971`均一致。沒有清庫、匯入重建、切換profile或補寫資料；候選仍只殘留HTML，未冒充已啟用。
6. 14:35:20.214重啟群組經自有SIGTERM實際退出0、剩餘群組程序0；主機停止、自有nonce鎖釋放，相機／麥克風／畫面擷取API呼叫0。job結束後一次性runner回收profile，僅合成JSON與瀏覽器錯誤保留在日誌。

原品質入口及下載包檢查、此Linux job均通過；本機Bun1.4.4原check／pre-commit通過382 tests／1309 expects／0 fail。最初本機受限入口的HTTP listen失敗紀錄保留，允許本機連線後原入口通過。Linux原生首次執行即通過，未發現產品bug；Chromium的非致命D-Bus診斷原樣保留，沒有掩蓋或關閉sandbox來換取通過。新增CI重跑及平台／鎖位置收據，產品runtime、schema、依賴與門檻不變。

這只補上**已提交筆記／Blob於SW部分安裝中遭程序強制終止**的Linux證據，不涵蓋寫入交易／migration／chunks中斷、實際低磁碟、停電、磁碟損毀、媒體品質或長片效能。Safari、實體／跨裝置、系統飛航、人工審查與完整P0／發布驗收保持待驗；iPhone暫緩，沒有合併、部署或關閉#13／#1。下方macOS結果保留其原版本與日期，不累加成Linux量測。

## 原 #61 macOS 證據

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

精確採用566f04a的選用情境並保留其來源關係；衝突只合併必要流程及文件，PR #66的spawn／PID／程序群組／nonce保護保留。未改產品runtime、schema、原始門檻或另建一套程序管理器。既有工具修改後的default與新增pending-write都必須在最終乾淨head實際重跑；整合當時仍未驗證，後續結果見下方9e6f0ef同版段落；先前16bd7ca只證明當時default情境，不能承接為新增寫入中斷通過。原生執行、清理與獨立核對結果待取得共用鎖並完成後補記。

整合後原check通過408 tests／1551 expects／0 fail、型別、公開掃描、lint及build；靜態仍1aa1ae164c31d690。stop、launch與finally收尾主體逐byte等於整合前629a98b，直接執行真實收尾的故障單元亦通過；摘要僅沿收據的scenario／candidateVersion列示。這些不是原生正向執行結果。


## 9e6f0ef 兩情境原生同版重跑

固定乾淨`9e6f0ef62ae52bd7841d3eaea84d501c71160cf4`／靜態`1aa1ae164c31d690`、真正Chrome156.0.8078.49，沿原工具兩個情境均通過；工具SHA256`6e6eb60bab8e995fd580d4e6fb89842be8847f7ebe25fe64d9fb3c937e7de08b`，worker／storage與本候選相同。本聊天只讀核對完整JSON、原工具及固定sentinel公式，不另啟動媒體或操作他人的鎖。

- **pending-write**：真正metadata／media兩個trusted put已成功，交易內看見候選筆記，兩次barrier均settled／complete／abort=false，keep-alive ticks140→3344；此時對自有群組真正SIGKILL。同profile新程序未清庫、未匯入，完整native metadata、產品JSON、revision、keys與1,048,613-byte舊Blob快照與中斷前精確相同。相同候選重試revision1→2、每byte對新公式相同，原生新資料與候選相等；再正常退出，用第三程序重開的整份snapshot equality由原工具斷言及committed-restart-verified事件通過。**第三份snapshot未另序列化**，本聊天不宣稱獨立逐欄比對第三份raw。
- **修改後default**：候選只寫入1／12資源、第二個HTTP回應尚未完成時真正SIGKILL；同profile新程序在導航前offline，由舊SW取回完整舊殼、manifest、metadata／keys／Blob。before與after整份快照精確相同；真正offline probe失敗且serverProbeHits=0，沒有以產品offline標籤代替網路證據。

舊sentinel SHA256`6ef72dcccd9b51e3a7f384632a9dff22af4c12372f3396fe557011d42e867971`；重試新內容SHA256`bf53d764260842712bdcd2741340db837b4885e87d9fc23e62500135b4650e5c`，本聊天依原工具兩個公式重算相同。原snapshot的allBytesMatch固定檢查舊公式，替換後為false符合預期；新公式逐byte由retry.everyByteMatches=true另驗，不能把舊公式欄位誤當重試失敗。

兩情境mediaCalls=0；原工具及交叉清理收據確認51個已知自有PID／5個群組退出、精確profile程序0、兩個主機埠拒絕連線、自有nonce釋放。pending-write與default原始收據SHA256分別`eece2e28f3cf4a9cc58723ff826182704435d607725ef32392e1b46cb6b639aa`、`7f68cab420695a3ba1010c3e9a33dc1d740d329e40bf82170edd1ad953513ab0`；清理總收據`de12a047257762af60b60fb1e9156726c6c52e0617254092039dde23712137f9`。profile、程序命令、raw端點及操作識別不公開。

這是人為延長未提交交易與更新下載中的函式／SW證據；不可播放sentinel不代表新VS救援、媒體品質、產品Stop、chunks提交、提交瞬間、斷電、真正低磁碟／quota、永久保存、Safari或裝置驗收。原EEXIST拒絕與16bd歷史default保留各自來源，不把本次兩案擴寫為整張#13完成。

## 9e69034 新授權 manifest 的兩情境補驗

2026-10-30 Asia/Taipei，PR #80 納入 #82 及匿名證據後，以乾淨 `9e69034ef59a4ef5e641c049e98e008cc9fa3cce`／靜態 `4651fae419d8d9c8` 沿原 `forced-install-restart.ts` 入口各跑一次 default 與 `--pending-write`，兩次 exit 0、status passed。兩份原收據的 trackedChanges 均為空字串；先核對該候選包含 #82 `e6e086f`、產品 web bytes 等於 #78 `c46f0b5`、建置／授權副本 bytes 來源等於 #82，並核對候選自己的 CI 兩項成功，沒有把 #74 或舊整合 manifest 的結果移記過來。

固定指紋：runner SHA256 `1633bc967fcdc8e4f8875704a1de45e339a5846a18346e31d761a9817ea01227`；實際建置 worker SHA256 `7b1645c7e6dcde031292699b066451f5f71eb1c5bbc0cc9a2aec622b306d9352`；storage.js SHA256 `d470fecd1c030878ae2e1750f68d3ad130e84d8393bdfaafb99dbd68a98b2e8a`。建置後 source／dist storage 逐 byte 相同，12 個 manifest 項目逐份符合實際 bytes，含已轉換連結的授權副本。環境為 macOS 27.0.1／arm64、Darwin 27.0.0、Chrome 156.0.8078.49 headless、Bun 1.4.4 與既有 Playwright core `1.64.0-alpha-1790635538000`。

- **default**：候選只保存新 HTML **1／12**，第二份 CSS 的真正 HTTP 回應仍卡住、原生 worker installing、waiting null；舊版 **12／12** 全部 hash 符合 manifest。原工具先保存收據，再對自有群組發真正 SIGKILL，確認實際 signal 與群組退出。相同 profile 的新程序在導航前離線，由舊 SW 取得完整舊 HTML／cache、原生 metadata、產品 JSON／revision、media keys 及 1,048,613-byte sentinel；before／after 全欄位相同。原生 onLine false，未快取 probe 失敗、serverProbeHits=0，重啟後沒有資源請求碰到測試主機。
- **pending-write**：原生 metadata／media 兩個 trusted put 成功，交易內讀到候選值，兩次 barrier 的 keep-alive ticks 前進且產品 Promise／complete／abort 均未結束，才對自有群組 SIGKILL。同 profile 新程序讀回完整舊資料，before／afterInterruptedWrite 全欄位相同；相同候選筆記與 Blob 重試 revision **1→2**，新內容每 byte 符合新公式、native metadata 精確等於候選。正常退出後第三個程序重開的整份 snapshot equality 與 committed-restart-verified 事件通過。**第三份 snapshot 仍未另序列化**，不宣稱另有可逐欄比對的第三份 raw。

原工具逐 byte 核對兩個 1,048,613-byte 公式，舊／新 SHA256 分別仍為 `6ef72dcccd9b51e3a7f384632a9dff22af4c12372f3396fe557011d42e867971`／`bf53d764260842712bdcd2741340db837b4885e87d9fc23e62500135b4650e5c`。本線另讀原始收據，核對已序列化快照的全部 JSON／keys／revision／Blob 屬性、候選與原生提交內容，並獨立生成完整公式 bytes 重算 SHA；這不冒稱 raw 內另存了完整 Blob bytes。原 snapshot 的 allBytesMatch 固定檢查舊公式，替換後的 false 不算失敗，新公式由 retry.everyByteMatches=true 另驗。

default 的兩組程序數為 13／10，pending-write 的三組為 10／10／8。兩案共 **51 個已知自有 PID／5 群組**，原工具及獨立查核均確認無殘留；ps 無診斷、兩個自有 loopback 埠拒絕連線，媒體 API 呼叫均為 0。兩輪都由原工具原子取得自己的共用鎖，核對同 nonce 才釋放；收尾獨立觀察時鎖不存在，沒有刪除或接管他人的鎖、profile 或程序。

default 原收據 SHA256 `c784d057e88975c176eb5a13f59fd22d4b6b5eff713eac781d6299120e98e7d9`；pending-write 原收據 SHA256 `f7ee39111d3179e601eb08b2471dba715f61696fc962fc325877c696d24b939f`。兩次原生入口沒有失敗或環境拒絕；raw、profile、瀏覽器日誌與獨立查核只留 ignored output，所有歷史失敗與舊來源數據保持原歸屬。

本次只補新 manifest 的更新下載及未提交交易中斷，沒有重跑低空間／配額或影音矩陣，也不涵蓋錄影 chunks、提交瞬間、斷電、永久保存、Safari／私人模式、實體／跨裝置或真實影片品質。後續提交只補本節與技術索引，工具及產品 bytes 仍綁定受測 9e69034，不把文件 head 冒充另一次原生重跑。Claude Code／使用者最終審查與 #13／#1 等未完成驗收保持開啟；iPhone 暫緩，未合併 main、部署、發布或關票。
