<!-- 檔案用途：重現合成媒體及本機資料驗證。所在層：驗收指南。主要關聯：WEB_PREVIEW.md、RECORD_COMPARE.md。 -->
# Web 回歸與媒體證據

核心不用 FFmpeg 或 Playwright 套件；兩者只供開發測試。使用本機 FFmpeg（lavfi、libx264、AAC）與 Bun 1.4.4：

```sh
bun --no-env-file scripts/make-media-fixtures.ts
bun --no-env-file scripts/make-player-fixtures.ts
bun run check
bun run dev
```

腳本不覆寫既有檔案。ignored `output/media-probe/` 內有 65 秒 testsrc／閃光／660Hz 提示音參考片、15 秒循環假相機及 browser.json；沒有真人或第三方音樂。

在 repo 根目錄，以已安裝的 Playwright CLI 開乾淨隔離 session：

```sh
playwright-cli --session dance-check open http://127.0.0.1:4173 --config output/media-probe/browser.json
playwright-cli --session dance-check run-code "$(cat tests/browser/media-probe.js)"
playwright-cli --session dance-check run-code "$(cat tests/browser/media-persistence.js)"
playwright-cli --session dance-check run-code "$(cat tests/browser/self-failure.js)"
playwright-cli --session dance-check run-code "$(cat tests/browser/workspace.js)"
playwright-cli --session dance-check run-code "$(cat tests/browser/edges.js)"
playwright-cli --session dance-check run-code "$(cat tests/browser/storage.js)"
playwright-cli --session dance-check run-code "$(cat tests/browser/relink.js)"
playwright-cli --session dance-check run-code "$(cat tests/browser/player.js)"
playwright-cli --session dance-check run-code "$(cat tests/browser/review-recovery.js)"
```

分別驗證 15 秒 capture→export／取消、筆記／缺片／副本／revision／模擬 quota／離線、20 次循環／晚到權限釋放／入口白名單，以及合成後練習音訊恢復、換片清除標記編輯、自拍替換失敗／取消後配方與輸出仍可保存。修改後重新開隔離 session，避免既有離線快取仍用舊版；不自動安裝 CLI 或瀏覽器。

獨立解碼下載檔（實際是 WebM 時使用真實副檔名）：

```sh
ffprobe -v error -show_streams -show_format output/media-probe/dance-vs.mp4
ffmpeg -v error -i output/media-probe/dance-vs.mp4 -f null -
```

G1–G7 沿用 [RECORD_COMPARE.md](RECORD_COMPARE.md)；JS 播放位置差與循環假相機不是實際成檔 G2 證據。桌面 Web 先行是使用者明確決定，不宣告手機支援，也不因未測手機觸發 iOS。

API 依 [MediaStream Recording](https://www.w3.org/TR/mediastream-recording/)、[Canvas captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)與[Web Audio 輸出節點](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination)。

## #3 長錄影與逐幀成檔量測

新增工具只使用 Python 標準函式庫、既有 FFmpeg 與 Playwright CLI，不新增產品依賴。先建置，再建立不循環的合成相機與逐幀時間碼；不覆寫既有證據。

```sh
bun run build
python3 scripts/make-sync-fixtures.py
python3 scripts/check-media-analyzer.py
DANCE_STAMP_PORT=42833 bun --no-env-file scripts/serve-web.ts
```

另開終端，以自己已安裝的 CLI 開新隔離 session。若使用 Codex skill 的 wrapper，將其路徑傳入 `--cli`；不自動安裝 CLI／瀏覽器。

```sh
playwright-cli --session dance-issue3 open http://127.0.0.1:42833 --config output/media-feasibility/browser.json
python3 scripts/run-media-feasibility.py --cli playwright-cli --url http://127.0.0.1:42833 --mode matrix
python3 scripts/run-media-feasibility.py --cli playwright-cli --url http://127.0.0.1:42833 --mode stability
python3 scripts/run-media-feasibility.py --cli playwright-cli --url http://127.0.0.1:42833 --mode webm
python3 scripts/run-media-feasibility.py --cli playwright-cli --url http://127.0.0.1:42833 --mode alignment
python3 scripts/run-media-feasibility.py --cli playwright-cli --url http://127.0.0.1:42833 --mode performance
python3 scripts/analyze-media.py output/media-feasibility/matrix-01-0.5x-15s.json
```

matrix 為三速度 × 15／30／60 秒；stability 為同 session／同資料庫連續十次 1× 的 60 秒 capture→export；webm 只略過 MP4 候選，仍由原生編碼器實際試錄與回讀；alignment 用正／負 200ms 校正及兩側獨立鏡像重跑 15 秒成檔；performance 另外量測 60 秒從原片下載前到 VS 讀回／保存完成的保守耗時上界。每段都下載原片／VS，依對應 JSON 執行分析器，產物只留 ignored output。分析器閾值不通過時以非零狀態退出並保留結果，不能把成功成檔當成所有品質門檻通過。完整解碼與二進位時間碼不代表實體相機光學時鐘、手機／Safari 相容性或 G2 已完成。

手機需可信 HTTPS，準備與人工操作見 [手機清單](PHONE_MEDIA_CHECK.md)；精確測試版本、數據及決策見 [#3 證據](evidence/issue-3-media-feasibility.md)。
