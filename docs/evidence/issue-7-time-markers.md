<!-- 檔案用途：記錄 #7 時間筆記的桌面驗收證據。所在層：版本驗收文件。主要關聯：markers.js、TECHNICAL.md、MEDIA_PROBE.md。 -->
# #7 時間標記與一鍵跳轉

2026-10-27，桌面 Web；Bun 1.4.4、Chrome 156、macOS。僅使用合成測片，無真人媒體；iPhone 依使用者要求暫不處理。

本版補點擊時間快照、點／區間 CRUD、毫秒邊界、編輯歸屬與草稿保護。受測靜態內容 `f46611dc7e62b2c2`；提交以本票 PR head 為準。

- Bun 1.4.4：316 tests／0 fail；TypeScript DOM 與 Service Worker checkJs、Biome、公開掃描、靜態 build 通過。新增共用區間邊界測試：片頭／片尾點、合法區間、負值、逆序、零長、超界、NaN／Infinity 與非整數。
- 全新隔離 Chrome 的 `markers.js` 通過：1.234 秒點擊後移到 6 秒再保存，仍是 1234ms；筆記當純文字；點／區間新增、同 ID 編輯並增加 revision、數字排序、刪除索引同步；逆序標記與 A/B 不寫入、不互換。
- 編輯中換片、切筆記、再標記、另一筆編輯、刪除均保留草稿與原影片。真正另一分頁更新 revision 後，舊頁保存拒絕，資料與表單草稿都保留；顯式取消才清空。保存副本後 reload，媒體重新解碼且標記內容一致。
- H.264 640×360／30fps／65 秒合成片，requestVideoFrameCallback 觀察：目標 1.234s → 1.233333s（0.667ms）、8.125s → 8.1s（25ms）、1.234s → 1.233333s（0.667ms）。三次最大約 25ms，低於本票 150ms 目標；區間跳轉也設好 A/B。量顯示影格，未以 currentTime 值宣稱精度。
- review-recovery 12 項、workspace、relink 全通過：音訊／自拍原配方恢復、保存副本、備份、缺檔與短片提示、舊 revision 拒絕、媒體 quota 原子回滾及離線重開。

限制：只有上述桌面 Chrome／合成片；其他編碼、長 GOP、Safari 與真機未驗證，不能外推每幀精準剪輯或 G2 成檔同步。瀏覽器強制結束可能失去未存草稿；原生離頁警示不等於草稿持久化。無獨立人工 review；未合併或部署。
