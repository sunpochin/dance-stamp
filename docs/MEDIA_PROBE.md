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
playwright-cli --session dance-markers open http://127.0.0.1:4173 --config output/media-probe/browser.json
playwright-cli --session dance-markers run-code "$(cat tests/browser/markers.js)"
```

分別驗證 15 秒 capture→export／取消、筆記／缺片／副本／revision／模擬 quota／離線、20 次循環／晚到權限釋放／入口白名單，以及合成後練習音訊恢復、換片前保護標記草稿、取消後清除編輯、自拍替換失敗／取消後配方與輸出仍可保存。修改後重新開隔離 session，避免既有離線快取仍用舊版；不自動安裝 CLI 或瀏覽器。

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

## #9 錄影與恢復

`capture.js` 用乾淨的合成相機 session 驗證拒絕／占用、後鏡頭錯誤、倒數取消、短錄影拒絕、中斷與兩種 quota，以及缺號／壞檔 chunks 不刪除、不冒充成功。請使用既有 browser.json，不能換成真人相機或私人影片：

```sh
playwright-cli --session dance-capture open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
playwright-cli --session dance-capture run-code "$(cat tests/browser/capture.js)"
playwright-cli --session dance-capture-matrix open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
for capture_rate in 0.5 0.75 1; do
  if test "$capture_rate" = 0.5; then capture_countdown=3; elif test "$capture_rate" = 0.75; then capture_countdown=5; else capture_countdown=10; fi
  for capture_seconds in 15 30 60; do
    playwright-cli --session dance-capture-matrix run-code "async page => await ($(cat tests/browser/capture-matrix.js))(page, {rate: $capture_rate, seconds: $capture_seconds, countdown: $capture_countdown})"
  done
done
playwright-cli --session dance-capture-matrix run-code "$(cat tests/browser/capture-downloads.js)"
```

矩陣約需數分鐘，逐例確認成功，不在執行中更換 dist 內容；觀察逾時先查同一 session，不能重開取代還活著的錄影。九段原 take 位於 ignored `output/media-probe/captures/`，另用 ffprobe 盤點、FFmpeg 完整解碼，不能只看 metadata／第一幀。只有合成證據，真正 G1／G6 與硬體中斷仍見 [#9 未完成項](evidence/issue-9-capture-recovery.md)。

### 真正離頁與獨立重播

`capture-navigation.js` 必須用新的隔離 session。先確認至少兩塊原生 chunks 已落盤，再由 CLI 換頁、接受這次合成錄影的原生離開確認，最後重開驗證；不注入 pagehide 或移除產品警示。以下命令依序執行，prepare 與 verify 都要有成功的 `### Result`，出現 `### Error` 就停止查原因，不能只依 CLI 退出碼判斷通過：

```sh
playwright-cli --session dance-navigation open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
playwright-cli --session dance-navigation run-code "$(cat tests/browser/capture-navigation.js)"
playwright-cli --session dance-navigation goto about:blank
playwright-cli --session dance-navigation dialog-accept
playwright-cli --session dance-navigation goto http://127.0.0.1:4173
playwright-cli --session dance-navigation run-code "async page => { const verify = $(cat tests/browser/capture-navigation.js); return verify(page, 'verify'); }"
```

受測 Chrome 的恢復原片下載到 ignored `output/media-probe/navigation-recovered.mp4`。驗收核對 trusted pagehide、同步釋放 tracks、未到 B、舊 take／原片不變、恢復後實際播放，而且仍標 interrupted。它不代表 BFCache、關閉整個瀏覽器、真正背景或硬體相機通過。

下載檔另用瀏覽器原生播放器，從磁碟完整播到 ended，不沿用產品頁的 Blob URL／AudioContext。`download-playback.js` 的第二參數是本機合成檔的 file URL；用實際下載的容器副檔名，不能把 WebM 改名 MP4。仍須另以 FFmpeg 完整解碼、ffprobe 盤點音軌；音訊解碼成功不代替喇叭／藍牙實聽或 G2：

```sh
playwright-cli --session dance-file open about:blank --headed --config output/media-probe/browser.json
playwright-cli --session dance-file goto "file://$PWD/output/media-probe/dance-vs.mp4"
playwright-cli --session dance-file run-code "async page => { const play = $(cat tests/browser/download-playback.js); return play(page, page.url()); }"
```

## #10 正式兩片比較

本節使用本機 FFmpeg 與 Bun，沒有產品 runtime 套件或外部 API。`make-comparison-fixtures.ts` 只在新的 ignored `output/comparison-fixtures` 產生合成檔；`-n`／exclusive write 保護既有檔案，重跑遇到已存在檔案應先核對來源，不刪使用者資料來讓工具通過。

```sh
bun --no-env-file scripts/make-comparison-fixtures.ts
playwright-cli --session dance-existing open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
playwright-cli --session dance-existing run-code "$(cat tests/browser/existing-comparison.js)"
```

`existing-comparison.js` 須用新的隔離資料庫，驗證正式入口、A=12／C=4、整數微調、兩側壞檔／空檔／受測不支援 FFV1、候選取消、新 take、截短原片不誤連、重開人工重連與明確副本。它攔截擷取權限並在任何呼叫時失敗，同時觀察 HTTP 請求。另一個新 session 以第二參數 `{absentCamera:true}` 執行，驗證完全沒有相機 API；不能用清除既有使用者儲存來準備這兩個 session。

`existing-failures.js` 另用新的隔離 session：對真正 IndexedDB put 注入 quota／確認中取消，核對整份舊配對與主播放器 URL 不變；另測空交集、負 offset、老師無音軌提示及 390px 版面。`existing-formats.js` 驗證已改名有效 MP4／MOV 的雙片確認與正確原片下載容器。每支 CLI 都讀 `### Result` 並檢查沒有 `### Error`，退出碼不能代替驗收結果。

### 成檔同步，不用 JS clock 代替

老師合成片長 90 秒、30fps，每幀底部 12-bit 黑白條碼保存來源 frame index。自己片從老師第 8 秒開始，分別依 1／0.75／0.5 固定比例製作，音軌改為 880Hz；老師為 660Hz。老師 A=12 時，自己的 C=4/r，選老師 B=A+60r 可驗證 60 秒共同輸出。這些都是自製素材，不含第三方音樂。

```sh
playwright-cli --session dance-existing-export open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
playwright-cli --session dance-existing-export run-code "async page => { const run = $(cat tests/browser/existing-export.js); return run(page, {rate:1, seconds:60}); }"
playwright-cli --session dance-existing-export run-code "async page => { const run = $(cat tests/browser/existing-export.js); return run(page, {rate:0.75, seconds:60, selfMirror:true}); }"
playwright-cli --session dance-existing-export run-code "async page => { const run = $(cat tests/browser/existing-export.js); return run(page, {rate:0.5, seconds:60, referenceMirror:true}); }"
```

將三筆成功的 `### Result` 原樣放進 ignored JSON 陣列，例如 `output/comparison-fixtures/exports.json`，再執行：

```sh
bun --no-env-file scripts/analyze-comparison.ts output/comparison-fixtures/exports.json
playwright-cli --session dance-existing-export run-code "$(cat tests/browser/existing-reopen.js)"
```

分析工具從下載檔的真正首幀、第 1／30／59 秒及真正末幀選真實影格，讀兩側像素條碼並依 r 換算誤差。先檢查影格時間與兩側內容前進，再套 RECORD_COMPARE.md 的同一 G2 門檻；五個位置各不超過 100ms，真正首末幀的新增漂移不超過 100ms。以輸出配方反轉各側鏡像讀碼，錯誤／重複翻轉不能以正確的 JS 值過關。條碼量化每來源影格為 33.333ms，慢速後依 r 換算；不宣稱逐毫秒或真機校正精度。

另以 ffprobe 盤點容器及音軌、FFmpeg 全片解碼，保存原始時間基準用 `-fps_mode passthrough -enc_time_base:v demux`。產品外從磁碟重播 60 秒檔時，`download-playback.js` 第三參數明確指定 `90_000`，原本短片預設 25 秒不變。合成輸出及測試 JSON 留在 ignored output；不得把真人影片、原檔名或私人音樂進 Git／公開附件。完整支援、十次長片與錄影路徑 gates 仍分開記錄，見 [#10 證據](evidence/issue-10-existing-comparison.md)。
