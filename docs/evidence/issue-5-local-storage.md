<!-- 檔案用途：記錄 #5 本機交易與重連驗收。所在層：證據。主要關聯：DATA_FORMAT.md、MEDIA_PROBE.md。 -->
# #5 本機資料與重連

2026-10-27，桌面 Chrome，合成資料。前置為 #26 的 #4，PR 尚待審查；不把未合併程式宣稱已在 main。

驗收方式：`bun run check`、tests/browser/workspace.js、storage.js、relink.js；再跑原有 media-probe.js 與 edges.js，確保儲存修正不破壞錄製／匯出。

- 重開保留筆記、take、配方；缺片只改可用狀態，原有記錄不刪。
- 兩份都叫 reference.mp4、但長度不同的合成影片，必須先確認重連；短片超界標記顯示待修復、禁止跳轉，原時間保留。
- 舊 revision 拒絕；模擬媒體 put 的 QuotaExceededError 時整個 metadata／Blob 交易回滾。
- 真正 native IndexedDB 0→1 初始化中途失敗後可重試；未知升級回滾，v1 sentinel 與版本保留。
- 另一分頁開啟不改 recording 或 revision；另一頁無法同時取得 take 鎖，原頁釋放後可恢復。

精確提交、執行結果在本票 PR。只用合成檔，無真實媒體或相機識別。正式相機、其他瀏覽器／裝置、#12 衝突副本與完整發布仍不在此驗收結論內。
