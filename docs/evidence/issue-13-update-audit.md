<!-- 檔案用途：界定離線更新保留的既有證據、部分安裝回歸及剩餘條件。所在層：#13 有界稽核。主要關聯：offlineCache.test.ts、offline-update.js、TECHNICAL.md。 -->
# #13 離線資源與更新保留稽核

2026-10-29，Asia/Taipei。從同步 main `918d8d7aa814533823522e3d4e0ab18df75cb212` 的專用 clone 建分支；精確交付 head 由 PR 綁定。本輪僅修改測試與文件，`web/`、儲存格式、建置及主機程式均未改，靜態仍為 `db129e273cf0039b`。

使用者結果：失敗或中斷更新不能被當成已備妥離線；舊頁操作不被接管，原筆記／媒體與非本工具 cache 不被誤刪。有界檢查未重現需要修改產品程式的 P0 缺陷，不新增猜測性重試、清庫或更新接管機制。

## 已核對的來源與版本

- [`web/sw.js`](../../web/sw.js)：install 依 manifest 逐份驗證 SHA256 並保存；網路、HTTP、雜湊或 Cache.put 失敗拒絕候選，只清該候選 cache。fetch 仍需符合當前版本雜湊；cache open／match／put 失敗不阻止正確在線資源。CHECK_OFFLINE 逐份讀實際 cache，缺檔、損壞或 API 例外不報完整。
- [`web/offline.js`](../../web/offline.js)：向 controller（初次則 active worker）查完整性，首次未受控制時提示重開；只監看 installing／waiting／controllerchange 來更新文字，不執行 skipWaiting、claim 或 reload。容量估計與 persist 失敗獨立於筆記開啟。
- [#44 固定版本證據](https://github.com/sunpochin/dance-stamp/blob/e3e3382ace38e234d91c777ada2f3740285201bb/docs/evidence/issue-13-media-size.md)：20／100／200 MiB 的六份副本跨程序重啟、移開合成原輸入及斷網後保留完整下載 bytes。這是舊版容量／媒體保存證據，不是本輪重測或更新中斷證據。
- [#54 固定版本證據](https://github.com/sunpochin/dance-stamp/blob/85b1ba6e5cf431902d7814f74fd1032c17352bd5/docs/MEDIA_PROBE.md#p1-整合候選的正式同版桌面證據2026-10-28)：正式媒體來源 `587689d`／靜態 `db129e273cf0039b`；真正 SW 損壞候選拒絕、錄影／匯出時新版 waiting、不重載或換 controller、舊頁關閉後啟用，既有資料與無關 cache 保留。舊 24 組／十輪數字不列為本輪通過。
- 已核對 #55、#56、#57、#58；它們的 Safari、備份及主機交付不重報為本票新增成果，也未併入本分支。

## 本輪新增的可執行回歸

原 `offlineCache.test.ts` 的 manifest 只有一份資源，安裝 quota 在第一份即失敗，尚未證明半批候選的清理。現在直接執行相同的 `web/sw.js`，使用兩份合成資源，故障固定放第二份；不複製一套安裝演算法。

| 情境 | 本輪結果 |
| --- | --- |
| 第一份已存，第二份網路中斷 | install 拒絕；半批候選清掉，舊 cache 與無關 cache sentinel 保留；完整性為 false |
| 第一份已存，第二份 HTTP 503 | 同上，錯誤回應未保存 |
| 第一份已存，第二份 SHA256 不符 | 同上，錯誤版本未保存 |
| 第一份已存，第二份 Cache.put quota | 同上，不能把在線降級套用至安裝 |
| 兩份完整安裝，再分開觸發 activate | install 階段不清舊 cache；activate 才刪本工具舊版，保留當前資源及無關 cache |

針對性回歸：Bun 1.4.4，11 tests／60 expects／0 fail。原 `bun run check`：371 tests／1050 expects／0 fail，harness、公開掃描、checkJs、Biome 與 build 通過；原提交／推送 hooks 與人工完整 diff 檢查另由交付 PR 記錄。沒有新增依賴或放寬品質門檻。

## 證據界線與剩餘條件

這些單元測試以記憶體 Cache API 替身及真正 SHA256 執行 worker handler，證明的是程式分支與刪除邊界，不能證明瀏覽器 installing／waiting 時序、真實 CacheStorage 或 IndexedDB／媒體 bytes。activation 由測試直接觸發，不能寫成「所有舊分頁關閉才 activate」的新實測。

既有 `offline-update.js` 雖驗真正等待生命週期，但其隔離 context 只開一個受控制產品頁，再關閉該頁；沒有留下第二個舊產品分頁。因此「關閉其中一頁，另一舊頁仍阻止 activation，且可繼續操作」仍缺獨立雙分頁證據。不可把測試結果欄位 `activatesOnlyAfterAllOldTabsClose` 的名稱當成已測多頁。

本輪未啟動瀏覽器或本機測試主機，未取得或改動其他聊天持有的共用媒體鎖；沒有操作 Safari、桌面、相機／麥克風、媒體、效能矩陣或日常瀏覽器資料。真正部分安裝中斷／候選快取 API 故障的瀏覽器演練、上述雙分頁、真實低空間／回收、實體飛航與完整支援範圍仍未驗證；主機或程序強制中斷也未測。沒有清庫或以 cache 修復代替資料還原。

Claude Code 或使用者最終審查、實體／跨裝置驗收及發布核准仍待完成，iPhone 暫緩；本輪不要求例行選擇、不合併或發布，#13 保持開啟。


## 後續整合：真正雙舊頁 waiting／activation

新增 `tests/browser/offline-multi-tab.js`，沿用本專案 `serve-update.ts` 與 `db129e273cf0039b` 真正 worker，不複製安裝／清理演算法。每次新建隔離 Chromium context，明確禁止 getUserMedia／getDisplayMedia；測試只建立合成動作筆記，不播放影片或開相機。這是本節的後續補驗，不把前述 #60 handler 單元測試改記成原生 lifecycle 成功；精確提交與提交後結果由交付 PR 綁定。

1. 第一頁完成舊版安裝後重開；保存一份合成動作筆記與無關 cache sentinel。第二頁在更新前就由同一舊 worker 控制，兩頁分別保存 controller 物件及本頁 sentinel。
2. 請求真正 `-next` 候選，等產品顯示原生 waiting 訊號，再以 MessageChannel 向 active／waiting 各查實際版本。確認兩舊頁都仍由基線控制，候選版本正確。
3. 關閉第一頁；第二頁透過產品表單修改並保存同一筆動作，controller／本頁 sentinel 不變。再開第三頁做新導航，仍讀到舊 active 與 waiting 候選。保存及新導航跨過實際事件循環，不用固定睡眠假裝 waiting 仍存在。
4. 關閉剩餘兩個舊版控制頁後重開，active 才是 `-next`、waiting 已空；完整筆記資料與 revision 逐 JSON 相同，無關 cache sentinel 仍在。各受測頁相機／麥克風／畫面擷取呼叫為0。

驗證開發的前兩輪在候選尚未進入 waiting 時就讀版本，檢查正確拒絕；改以產品真正 waiting 訊號作屏障後仍核對原生 active／waiting 版本及 controller，沒有放寬斷言。前兩份失敗、修正後候選及提交後原始結果分開保留本機 ignored output。

這補上「第一個舊頁關閉，另一舊頁繼續阻止啟用並能操作」的桌面 Chromium 證據。不是 Safari、另一實體裝置、低空間／程序強制中斷或媒體驗收；各自 gates 仍保留。原 `offline-update.js` 的單頁錄影／匯出演練維持其原版本與範圍，不因這支無媒體測試宣稱重新跑過媒體矩陣。
