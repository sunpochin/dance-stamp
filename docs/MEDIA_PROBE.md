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
