<!-- 檔案用途：記錄影片庫選檔修正的桌面證據與限制。所在層：驗證文件。主要關聯：tests/browser/video-picker.js、WEB_PREVIEW.md、issue #89。 -->
# #89 影片庫選取 MOV／MP4

2026-10-30；基線 `6862501d3cfaaa7cf3916d875fd06dd8dfdd13ec`，本修正的受測靜態版本 `2f3b5945900a1769`。macOS arm64、Google Chrome 156.0.8078.76，獨立 headless context；Bun 1.4.4。只用既有工具產生的合成測片，沒有讀取私人影片或相機。

修正前直接讀取頁面確認：`#library-panel` 唯一的 file input 是 `restore`，accept 為 `.json,application/json`；沒有影片選取按鈕。原示範欄位在下方，accept 僅 `video/*`。因此影片庫中的筆記匯入會排除影片；另為三個影片欄位明列容器副檔名。

## 本次結果

- `bun run check`：435 pass、0 fail，1926 expects；harness、公開掃描、型別、lint 與建置通過。lint 保留原有 19 項資訊提示，沒有 warning／error。
- `tests/browser/video-picker.js`：零筆記開始，滑鼠／Enter 都開啟 `reference-file`；合成 H.264 MP4 與 MOV 實際解碼播放。三個影片欄位明列副檔名，筆記入口保留 JSON 篩選。
- 同一回歸：空選取與壞檔保留原片及筆記、再次選相同 MOV 成功、JSON 重匯不新增／覆寫資料、重開後重連仍需人工確認、320px 寬度不溢出。
- 既有 `player.js`：H.264 靜音、直向、旋轉、VFR、MOV、改名有效 MP4 六案均實播；損壞／空檔、取消及十次換片的 URL 清理通過。
- 既有 `relink.js`：同名短片需確認、超界標記不可跳轉、原筆記時間與原影片長度保留。

重現方式見 [MEDIA_PROBE.md](../MEDIA_PROBE.md)。本輪三個回歸都使用專用本機 port；既有 player／relink 僅在 ignored 副本替換測試 origin，斷言及產品檔案未更動。

## 尚未驗證

Playwright 的 filechooser 事件及檔案注入不會展示作業系統原生選檔視窗；該視窗的灰色檔案呈現、使用者原片 codec、HEVC／HDR、Safari 與實體手機未驗證。本次不更換解碼器，也不移記任何既有 VS／相機／發布 gates 為通過；PR 待獨立審查，未合併或發布。
