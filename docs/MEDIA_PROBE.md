<!-- 檔案用途：重現合成媒體及本機資料驗證。所在層：驗收指南。主要關聯：WEB_PREVIEW.md、RECORD_COMPARE.md。 -->
# Web 回歸與媒體證據

核心不用 FFmpeg 或 Playwright 套件；兩者只供開發測試。使用本機 FFmpeg（lavfi、libx264、AAC）與 Bun 1.4.4：

```sh
bun --no-env-file scripts/make-media-fixtures.ts
bun --no-env-file scripts/make-player-fixtures.ts
bun --no-env-file scripts/make-comparison-fixtures.ts
bun run check
bun run dev
```

腳本不覆寫既有檔案。ignored `output/media-probe/` 內有 65 秒 testsrc／閃光／660Hz 提示音參考片、15 秒循環假相機及 browser.json；沒有真人或第三方音樂。

在 repo 根目錄，以已安裝的 Playwright CLI 開乾淨隔離 session：

```sh
playwright-cli --session dance-check open http://127.0.0.1:4173 --config output/media-probe/browser.json
playwright-cli --session dance-check run-code --filename tests/browser/media-probe.js
playwright-cli --session dance-check run-code --filename tests/browser/media-persistence.js
playwright-cli --session dance-check run-code --filename tests/browser/self-failure.js
playwright-cli --session dance-check run-code --filename tests/browser/workspace.js
playwright-cli --session dance-check run-code --filename tests/browser/edges.js
playwright-cli --session dance-check run-code --filename tests/browser/storage.js
playwright-cli --session dance-check run-code --filename tests/browser/relink.js
playwright-cli --session dance-check run-code --filename tests/browser/player.js
playwright-cli --session dance-check run-code --filename tests/browser/review-recovery.js
playwright-cli --session dance-check run-code --filename tests/browser/existing-comparison.js
playwright-cli --session dance-check run-code --filename tests/browser/comparison-recovery.js
playwright-cli --session dance-check run-code --filename tests/browser/comparison-capture-fallback.js
playwright-cli --session dance-check run-code --filename tests/browser/comparison-appearance.js
playwright-cli --session dance-check run-code --filename tests/browser/comparison-save-failure.js
playwright-cli --session dance-markers open http://127.0.0.1:4173 --config output/media-probe/browser.json
playwright-cli --session dance-markers run-code --filename tests/browser/markers.js
```

分別驗證 15 秒 capture→export／取消、筆記／缺片／副本／revision／模擬 quota／離線、20 次循環／晚到權限釋放／入口白名單，以及合成後練習音訊恢復、換片前保護標記草稿、取消後清除編輯、自拍替換失敗／取消後配方與輸出仍可保存。修改後重新開隔離 session，避免既有離線快取仍用舊版；不自動安裝 CLI 或瀏覽器。

`existing-comparison` 至 `comparison-appearance` 四組驗證既有雙片不用相機、選起點／鏡像／暫停拖曳／成檔、備份在全新 context 還原、兩側重連、明確保存、quota 原子回滾、真實分頁衝突，以及影格 callback／stream 清理。`comparison-recovery.js` 需先由 `existing-comparison.js` 下載備份；四種鏡像組合另以合成色條像素確認。

`comparison-save-failure.js` 另在三個乾淨 context 注入比較設定的 metadata quota、seek 失敗及真實雙分頁 revision 衝突；不重載、不再改設定就下載備份與原片。故障解除後可保存副本、重試匯出及換片，真實 revision 衝突仍拒絕寫入並保留較新資料。

完整既有雙片矩陣另開乾淨 session，保持前景；需約 15 分鐘。`output/comparison/` 已有同名下載時先自行保留到其他 ignored 目錄，避免混用舊成檔：

```sh
playwright-cli --session dance-matrix open http://127.0.0.1:4173 --config output/media-probe/browser.json
playwright-cli --session dance-matrix run-code --filename tests/browser/comparison-matrix.js
python3 scripts/analyze-comparison.py
```

矩陣涵蓋 0.5／0.75／1× 與 15／30／60 秒、十次 60 秒、無音軌來源及雙鏡像，共 20 份下載。每次選片／校正／匯出且禁用相機，輸出名稱包含比例與時長。分析工具只用 Python 標準庫及本機 FFmpeg；讀成檔兩側影格碼、起點、VFR 時間與 660／880Hz 聲源，完整解碼並依 [RECORD_COMPARE.md](RECORD_COMPARE.md) 原門檻檢查同步、漂移、fps、凍結及聲音。不以 JS drift 或平均 fps 單獨宣告成檔通過。最終實測見[既有影片證據](evidence/existing-comparison.md)。

獨立解碼下載檔（實際是 WebM 時使用真實副檔名）：

```sh
ffprobe -v error -show_streams -show_format output/media-probe/dance-vs.mp4
ffmpeg -v error -i output/media-probe/dance-vs.mp4 -f null -
```

G1–G7 沿用 [RECORD_COMPARE.md](RECORD_COMPARE.md)；JS 播放位置差與循環假相機不是實際成檔 G2 證據。桌面 Web 先行是使用者明確決定，不宣告手機支援，也不因未測手機觸發 iOS。

API 依 [MediaStream Recording](https://www.w3.org/TR/mediastream-recording/)、[Canvas captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)與[Web Audio 輸出節點](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination)。

`markers.js` 請用全新 session，量實際顯示的 mediaTime，另驗證 CRUD、逆序拒絕、草稿保護與多分頁失敗恢復。此結果只適用受測素材，不是 G2 聲畫同步證據。

## #8 練習循環

各用乾淨 session，避免能力降級的 init script 影響其他驗收：

```sh
playwright-cli --session dance-practice open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
playwright-cli --session dance-practice run-code "$(cat tests/browser/practice.js)"
playwright-cli --session dance-fallback open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
playwright-cli --session dance-fallback run-code "$(cat tests/browser/practice-fallback.js)"
playwright-cli --session dance-background open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
playwright-cli --session dance-background run-code "$(cat tests/browser/practice-background.js)"
```

前兩支驗證六組 20 次循環、呈現影格邊界、速度／鏡像、取消／失敗與 callback 清理，以及缺 API 時的 RAF／音高提示。合成 visibility 只驗證 handler。第三支必須真的 hidden，不通過不能以合成事件代替；當前環境仍未驗證真正背景，詳見 [#8 證據](evidence/issue-8-practice-loop.md)。新測試以頁面 origin 為入口，可配合不與其他程序衝突的本機埠。

`practice` 的跳轉重疊以當下原生 `seeking` 屬性計數；取消後晚到的 `seeked` 不等於瀏覽器仍在跳轉，零重疊門檻不變。`practice-range-change.js` 驗證循環中把 A 往後移會在一秒內重新定位，逆序 A/B 則停止。以同一份 browser.json 開乾淨 session，再執行 `playwright-cli --session dance-range run-code --filename tests/browser/practice-range-change.js`。
