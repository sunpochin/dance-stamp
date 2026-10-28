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

真正 macOS Safari 的前景選片／同步／副本診斷見 [#3 Safari 證據](evidence/issue-3-safari-feasibility.md)：同版匯出被 250ms 護欄拒絕，失敗片段逐格證實凍結，原生格式對照也未通過；私人視窗副本另有儲存錯誤。七個 runtime 候選均已還原，一般專用設定檔需先經使用者同意初始化。這是有界失敗紀錄，不能從 Chrome 成檔、Safari 的 API／playing 或共用時鐘改善宣告通過；先隔離環境與根因，再投入完整矩陣。

API 依 [MediaStream Recording](https://www.w3.org/TR/mediastream-recording/)、[Canvas captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)與[Web Audio 輸出節點](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination)。

`markers.js` 請用全新 session，量實際顯示的 mediaTime，另驗證 CRUD、逆序拒絕、草稿保護與多分頁失敗恢復。此結果只適用受測素材，不是 G2 聲畫同步證據。

## #11 匯出失敗與直式全身成檔

在新隔離 session 執行；使用可用的本機產品埠。`make-export-fixtures.ts` 建立八秒橫／直式色條片與 660／880Hz 不同聲源，不覆寫已有檔。本項是三秒功能回歸，不量效能；若延伸長片／效能或實際桌面測試，先取得當次約定的共用媒體鎖，完成後只釋放自己的鎖。不用相機或麥克風。

```sh
bun --no-env-file scripts/make-export-fixtures.ts
# browser.json 沿用上方隔離設定；本項不需假相機 flags，建議 headless 加 --mute-audio。
playwright-cli --session dance-export-failure open http://127.0.0.1:4173 --config output/media-probe/browser.json
playwright-cli --session dance-export-failure run-code --filename tests/browser/export-failure.js
python3 scripts/analyze-export-failure.py
playwright-cli --session dance-export-failure close
```

`export-failure.js` 將相機 API 設為不存在，選老師 2–5 秒／自己 1 秒起點，右側直式片鏡像。先產生三秒 MP4，再注入全部格式無法啟動、非同步編碼錯誤、新檔讀回失敗及讀回途中取消。每次都核對原配方／輸出記錄未變、tracks 已停止，真正下載上一支成功 VS。最後讓 MP4 宣稱支援但建構失敗，同頁重試到原生 WebM；兩側原片也分別在前後下載。

分析器比對四份舊 VS 與兩側原片的完整 SHA256；新 MP4／WebM 均用 FFmpeg 逐幀完整解碼，核對容器、副檔名、單一音軌、老師聲源、每格的上下邊界、直式留邊及鏡像。色條是靜態圖案，不能拿來驗 G2 同步或 G3 凍結；本項不取代既有長片矩陣。結果見 [#11 證據](evidence/issue-11-export-failure.md)。

## #8 練習循環

各用乾淨 session，避免能力降級的 init script 影響其他驗收：

```sh
playwright-cli --session dance-practice open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
playwright-cli --session dance-practice run-code "$(cat tests/browser/practice.js)"
playwright-cli --session dance-fallback open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
playwright-cli --session dance-fallback run-code "$(cat tests/browser/practice-fallback.js)"
```

前兩支驗證六組 20 次循環、呈現影格邊界、速度／鏡像、取消／失敗與 callback 清理，以及缺 API 時的 RAF／音高提示。合成 visibility 只驗證 handler。`practice-background.js` 必須取得真正 hidden、停止、回前景不自播與明確重啟；另量產品 callback 及 trusted 原生事件，詳見 [#8 證據](evidence/issue-8-practice-loop.md)。測試以頁面 origin 為入口，可配合不與其他程序衝突的本機埠。

真正背景驗收前先解鎖桌面，讓專用視窗可見。一般工具的 focus emulation 可能使兩個分頁都回報 visible，只有 headed 不足以排除；改用全新原生 Chrome profile，連線時設定 `noDefaults: true` 並使用現有 default context。先讓本機產品主機運行，在終端 A 執行：

```sh
bun --no-env-file scripts/launch-native-browser.ts
```

預設使用 macOS 已安裝的 Google Chrome；其他位置可傳入可執行檔路徑，未驗證其他作業系統。工具產生的設定、端點與 profile 路徑只留 ignored output，不公開。終端 B 使用新 session（本輪 CLI 0.1.22／core 1.64.0-alpha-1790635538000）：

```sh
npx --package @playwright/cli@0.1.22 playwright-cli --session dance-native open http://127.0.0.1:4173 --config output/native-controller.json
npx --package @playwright/cli@0.1.22 playwright-cli --session dance-native run-code --filename output/native-background-run.js
npx --package @playwright/cli@0.1.22 playwright-cli --session dance-native close
```

檢查真正的 `### Result` 且沒有 `### Error`，再回終端 A 按 Ctrl+C，只停止本工具建立的 Chrome。每輪重跑都重新啟動工具／新 profile，不接管日常瀏覽器。runner 沿用同一份嚴格函式並回報受測靜態／Chrome 版本與 User-Agent；若含 `HeadlessChrome`，只能列無視窗診斷，不算實際桌面前景／背景 gate。callback 觀察只涵蓋此桌面原生影格路徑，RAF 降級另跑上面的測試。main `2f1ec6b3335cd790` 已於解鎖後通過，鎖定期間與 PR #40 的歷史結果分開記錄，未宣稱其他裝置通過。

`practice` 的跳轉重疊以當下原生 `seeking` 屬性計數；取消後晚到的 `seeked` 不等於瀏覽器仍在跳轉，零重疊門檻不變。`practice-range-change.js` 驗證循環中把 A 往後移會在一秒內重新定位，逆序 A/B 則停止。以同一份 browser.json 開乾淨 session，再執行 `playwright-cli --session dance-range run-code --filename tests/browser/practice-range-change.js`。

## #9 錄影與恢復

真正分頁背景驗收使用 `capture-background.js`。先依本文件建立合成素材並解鎖桌面，再於終端 A 執行 `bun --no-env-file scripts/launch-native-browser.ts --capture`；若要指定 Chrome 路徑，放在 `--capture` 後。缺少 `output/media-probe/camera.y4m` 時工具拒絕啟動，不能拿真人相機替代。終端 B 沿用上節的 `native-controller.json` 與 `native-background-run.js` 指令，每輪用新 profile；本機埠以實際預覽服務為準。

這支測試用真正的 sibling tab 產生 trusted visibility 事件，分別檢查預覽、倒數與錄影：背景同步釋放 tracks／停止示範，回前景不自動開相機或播放。錄影至少兩塊 chunks 實際提交後才切走；返回後重新開啟 interrupted 片段、產生 VS、明確重錄到 B，最後重新載入資料庫，比對舊片／中斷片／重錄片的 metadata、配方及完整 Blob SHA256。它不注入 visibility／stop 事件，也不修改 `document.hidden`。

`noDefaults` 連線不設定 Playwright 的下載攔截，因此測試只在自己瀏覽器的 default context 設定 [Chrome 原生下載](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-setDownloadBehavior)。實際點產品下載連結，檔案依 GUID 寫入本輪新建的 ignored `output/native-download-*`。`### Result` 的 `downloads` 列出 GUID、建議檔名、容器 MIME、bytes 與 Blob SHA256；本機目錄見 `output/native-browser.local.json`。原生 completed 事件仍不足以證明檔案存在：必須另核對磁碟 GUID 檔的 bytes／SHA256，依實際建議副檔名建立本機播放副本，再按下節方法完整解碼及用 `download-playback.js` 於產品外播至 ended。不得把 GUID 檔直接改成與容器不符的副檔名。原片與本機紀錄均不上傳。

若桌面鎖定或任何步驟失敗，保留錯誤並停止本輪專用 Chrome／控制端，不可跳過 gate 或算成錄影通過。當前執行狀態見 [#9 證據](evidence/issue-9-capture-recovery.md)；合成相機無法證明實體指示燈、真實硬體或鎖屏／來電行為。

使用者解鎖後，正常有視窗 Chrome 156.0.8078.49／靜態 `2f1ec6b3335cd790` 已通過三階段、原片保留及本輪下載檔的獨立完整播放；QA 原始函式來自 `6317d09`。先前 headless 診斷與鎖定逾時另列歷史，不併成真正桌面結果；硬體相機與裝置矩陣仍未驗證。

`capture.js` 用乾淨的合成相機 session 驗證拒絕／占用、後鏡頭錯誤、倒數取消、短錄影拒絕、中斷與兩種 quota，以及缺號／壞檔 chunks 不刪除、不冒充成功。請使用既有 browser.json，不能換成真人相機或私人影片：

```sh
playwright-cli --session dance-capture open http://127.0.0.1:4173 --headed --config output/media-probe/browser.json
playwright-cli --session dance-capture run-code --filename tests/browser/capture.js
playwright-cli --session dance-capture run-code --filename tests/browser/capture-comparison.js
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

`capture-drain.js` 使用新的隔離合成相機 session，刻意保持 chunks 的原生 IndexedDB 交易未提交，再注入編碼 error。斷言相機已停止、工作仍忙碌且另一分頁無法取得同一 take 的恢復鎖；放行交易後才能恢復可解碼的 interrupted 原片，重開後舊片與恢復片的 metadata／配方／完整 SHA256 保持一致。執行 `playwright-cli --session dance-drain run-code --filename tests/browser/capture-drain.js`；下載的 `output/media-probe/drain-recovered.mp4` 另用 FFmpeg 全片解碼。這是儲存失敗時序回歸，不是硬體、背景或 G1／G6 驗收。

`capture-comparison.js` 在同頁依序錄影、匯出、改用既有雙片並再次匯出，最後重開原錄影，確認共用單一 AudioContext、相機停止、原片／筆記／舊 VS 都保留。只使用合成相機；不代替長片矩陣、真實硬體或背景驗收。

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

### 錄影與既有雙片整合

`capture-comparison.js` 在新的合成相機 session 依序錄影、匯出、換成外部雙片、再次匯出並重開原錄影，核對一個共用 AudioContext、相機只在明確操作時請求、原片／筆記／舊 VS 完整保留。先用本文件的測片工具備妥 `output/media-probe/` 與 `output/comparison/`，再以 CLI 的 `run-code --filename tests/browser/capture-comparison.js` 執行。錄影／離頁回歸要保護「已保存」的外部合成基準時，先明確按保存副本，不假設選片會自動落盤。

`download-playback.js` 第三參數可傳等待上限，例如 60 秒下載檔傳 `90_000`；預設仍為 25 秒，所有情況都必須真的到 ended 且無解碼錯誤，不能用延長等待取代重播。整合版另跑原本雙片完整矩陣；分析仍檢查原有同步／fps／凍結／聲源門檻，再加嚴格影格時間與真正首末影格。各版本證據見 [#9 整合證據](evidence/issue-9-comparison-integration.md)，不把不同 head 結果混在一起。

`existing-no-camera.js` 在相機 API 完全不存在的隔離頁跑完整選片／預覽／匯出；`comparison-keyboard.js` 補鍵盤移焦、播放／暫停與原生數字微調保存，窄版截圖留 ignored output。兩者都透過相同的 CLI `run-code --filename` 入口，不改產品資料或降低門檻。

### #12 備份與缺片恢復

先備妥既有 `output/media-probe/`、`output/comparison/` 合成測片。新隔離 session 依序執行 `backup-conflicts.js`、`backup-recovery.js`、`backup-keyboard.js`；第一支會實際下載 JSON 與單一 VS，第二支用該檔在全新 context 還原並重連 reference／take／VS，不清除既有資料。三支均用既有 CLI `run-code --filename tests/browser/…js`，檢查真正的 `### Result`，不能只看退出碼。

`backup-drill.js` 補共用恢復演練的完整數量：三份影片筆記、十標記、兩 take／recipe、一個真正合成的 VS，共六份媒體描述。先以 FFmpeg 建立三支六秒合成片（目的檔存在會拒絕覆寫）：

```sh
mkdir -p output/backup-drill
for i in 1 2 3; do
  ffmpeg -hide_banner -loglevel error -n -f lavfi -i 'testsrc2=size=320x180:rate=30:duration=6' -f lavfi -i "sine=frequency=$((440+i*110)):sample_rate=48000:duration=6" -vf "hue=h=$((i*70))" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -movflags +faststart "output/backup-drill/reference-$i.mp4"
done
```

在自己的隔離 Chromium session 執行 `playwright-cli --session dance-backup-drill run-code --filename tests/browser/backup-drill.js`。函式只清除自己新建 context 的測試 origin（IndexedDB、cache 與 worker），不清除呼叫者或一般瀏覽器資料；清除前已透過產品下載 JSON 與六份媒體。先完整還原，再以六個獨立 context 逐檔缺片；補回前開啟其他筆記／可用 take，取消候選保留副本，預設 session-only 重連後重開仍須缺片。所有 canonical 關聯／時間／鏡像不變，恢復的原片與各案例 VS 下載比對 bytes／SHA-256。僅測資料恢復，不宣稱跨實體裝置、Safari、硬體相機或 G1–G7；獨立解碼下載檔後才另記成檔證據。

驗收包含預覽不寫入、重匯與來源隔離、quota、metadata put 中取消、真實雙分頁衝突、危險輸入、同名裁切片拒絕、明確副本、重開與鍵盤／窄版。產物在 ignored output。`backup12-generated-vs.mp4` 與 `backup12-restored-vs.mp4` 應有相同 SHA256，再以 FFmpeg 完整解碼，並用 `download-playback.js` 在產品外完整重播。這驗證原始 bytes 被帶走／恢復，不把 JSON 冒充影片備份；結果見 [#12 證據](evidence/issue-12-backup-recovery.md)。


### #13 離線、容量、更新與個別刪除

使用新的隔離 session，先在線執行 `offline-storage.js`，驗證兩支明確保存的原片、筆記與真實 VS 在 browser context 斷網後重開；包括 persist 模擬允許／拒絕／例外、真實 media 交易的 quota／abort／取消、快取缺檔及修復。`deletion.js` 獨立驗證取消、鍵盤、窄版、原片共用、真實兩分頁鎖／revision、原生交易 abort、分段清理及缺片 pending 狀態。

另一個隔離合成相機 session 依序執行 `offline-ready.js`、原有 `capture-comparison.js`；前者真正設定 browser context offline，後者在斷網狀態完成原生錄影、兩種輸入的 VS、保存與重開。這不是手機飛航模式或硬體相機證據。

更新專用主機：`bun --no-env-file tests/browser/serve-update.ts`（僅本機 4180，請勿部署）。開啟該 origin 的新隔離合成相機 session，執行 `offline-update.js`。測試控制入口只在此測試主機，產品 `serve-web.ts` 沒有它；以相同 manifest 的新 worker 身分及一份錯誤雜湊模擬完整／損壞更新，實際觀察 install、waiting、activate、原頁 controller 與資料，沒有偽造生命週期事件。

以上仍用既有 CLI `run-code --filename`，檢查 `### Result` 並確認沒有 `### Error`，最後關閉自己的測試 session。離線與等待更新的下載檔也須用 FFmpeg 全片解碼、ffprobe 及產品外 `download-playback.js` 完整重播。結果與限制見 [#13 證據](evidence/issue-13-offline-storage.md)。

`offline-cache-failure.js` 另建乾淨 context，實際破壞一份公開 cache，再於真正 worker 注入 Cache.put quota、CacheStorage.open 與 Cache.match 例外。沿用本機白名單主機及 CLI `run-code --filename tests/browser/offline-cache-failure.js`；可用專用 port，無須相機設定。每種故障都要在線重開工作台、顯示離線不完整，合成筆記與 sentinel Blob 不變；解除故障後實際補存，再斷網重開。單元回歸另驗錯誤版本仍回 503、斷網缺檔失敗及安裝 quota 仍拒絕候選。這些注入不代替真實磁碟低空間；[版本證據](evidence/issue-13-cache-failure.md)獨立於先前大檔與真機矩陣。

#### 部分安裝時強制結束瀏覽器

`forced-install-restart.ts` 是需程序控制的獨立 Bun 工具，使用既有 Playwright core 連到自己啟動的 Chromium；不新增產品依賴，不經 CLI 正常 close 來冒充強制終止。先用 Bun 1.4.4 建置，傳入已安裝瀏覽器與 Playwright core 的完整路徑：

```sh
bun run build
bun --no-env-file tests/browser/forced-install-restart.ts "$chromium_executable" "$playwright_core_index_mjs"
```

僅支援 POSIX 程序群組；工具不安裝瀏覽器或套件。每輪建立新的 ignored `output/forced-install-*` 與 persistent profile、自有動態 loopback 主機，並原子取得共用 `/private/tmp/dance-stamp-p0-media-test.lock`；鎖已存在就失敗退出，保留原鎖、不開瀏覽器。使用者相機／麥克風／畫面擷取被禁止，資料只有一份合成筆記、標記及不可播放的 1,048,613-byte sentinel。

先經產品儲存交易保存筆記與 Blob，核對原生 IDB 與完整舊 cache。候選使用真實產品 worker 原碼、新版本及對應的新 HTML／CSS 雜湊；主機保持第二份 CSS 回應未完成。必須同時看到候選原生 cache 已有不同於舊版的 HTML、尚無其餘資源、registration.installing 為 installing、舊 active／controller 仍完整，才保存 barrier／PID／群組 provenance 並送出 SIGKILL。這裡沒有 Cache mock、throw 注入、skipWaiting、手動 activate 或資料庫重建。

確認該自有程序群組全數退出，再以同一 profile 新程序啟動；在導航前設定隔離 context offline。核對頁面由 SW 回應、舊 HTML 全 bytes 雜湊、舊版完整狀態，且未快取的網路 probe 失敗、主機零收到重開請求。筆記全內容、ID、revision、原生 metadata／media keys 與 Blob 每一 byte／SHA256 都須相同。原始日誌、成功／失敗證據及 profile 保留本機，finally 只停止自有程序／主機並釋放 nonce 相同的自有鎖；失敗不可刪除後當同一輪通過。這不代替實際磁碟損毀、斷電、低空間、影片播放品質、Safari 或手機驗收。

#### 20／100／200 MiB 保存矩陣

`make-storage-fixtures.ts` 讀本機已生成的合成 `output/media-probe/reference.mp4`，每輪建立全新 `output/storage-size-*`，不覆寫舊檔。加 free atom 得到四份精確大小的 MP4，第四份為 200 MiB＋1 byte；媒體 sample 不變，只測容量邊界，不代表高碼率／長片壓力。先用 FFmpeg 完整解碼，核對時長、串流及媒體 packet hash 與來源相同；不要用私人影片替代。

```sh
bun --no-env-file scripts/make-storage-fixtures.ts
# 替換為工具回報的本輪完整目錄；使用可用的本機產品埠。
matrix_dir='output/storage-size-請替換本輪目錄'
playwright-cli --session dance-size open http://127.0.0.1:4173 --config "$matrix_dir/browser.json" --persistent --profile "$matrix_dir/profile"
playwright-cli --session dance-size run-code --filename "$matrix_dir/prepare.js"
playwright-cli --session dance-size close
```

prepare 必須成功；它拒絕已有資料的 profile，不清庫。記錄 CLI 的程序識別並確認 close 後舊程序已退出；只是 reload 不算瀏覽器重啟。**只在本輪新建測片目錄**把四份輸入移開，不能操作真人原片或其他工作目錄：

```sh
mkdir "$matrix_dir/withheld-synthetic-inputs"
for name in 20-mib 100-mib 200-mib 200-mib-plus-one; do
  mv -n "$matrix_dir/$name.mp4" "$matrix_dir/withheld-synthetic-inputs/$name.mp4"
done
playwright-cli --session dance-size open http://127.0.0.1:4173 --config "$matrix_dir/browser.json" --persistent --profile "$matrix_dir/profile"
playwright-cli --session dance-size run-code --filename "$matrix_dir/verify.js"
playwright-cli --session dance-size close
```

先確認四個原路徑均已不存在，再開始 verify；新程序必須使用同一 profile。verify 實際斷網重開，逐份比較全 Blob SHA256、播放兩側，再點下載。核對 `### Result` 的六個磁碟檔 bytes／SHA256 與 `manifest.json` 相符，另做完整 FFmpeg 解碼；200 MiB 代表檔用 `download-playback.js` 從產品外播完，65 秒測片需把 timeout 設為 90,000ms。這個 timeout 是播放等待，不是匯出效能門檻。

成功後還原本輪四份合成輸入並核對原雜湊；保留 profile、下載與紀錄在 ignored output，不能宣稱它們已公開。fixture 的 free atom／稀疏填充不改 File.size，也不把瀏覽器 quota、壓縮率或實際佔用空間當作已量測；[本輪證據與限制](evidence/issue-13-media-size.md)獨立於手機、真實低空間或未來 migration。

### 開啟 take 失敗時保留舊校正

使用乾淨隔離 session 執行 `playwright-cli --session dance-take-recovery run-code --filename tests/browser/take-open-failure.js`。此回歸以合成影片驗證壞檔與載入中取消不混用另一段的校正或下載連結、缺片後可重開已存 take，以及原配方仍可完成匯出。新 session 仍用上方同一份 browser.json 與本機測片。

`interrupted-session.js` 用全新資料環境還原中斷 take，驗證人工重連與重複開啟不自動存片、明確保存才寫入，以及重開已存中斷片不重寫 Blob。以乾淨 session 執行 `playwright-cli --session dance-session run-code --filename tests/browser/interrupted-session.js`。

`backup-recipe-copies.js` 驗證只有校正不同的備份也有可選 take、不同版本與已編輯副本各自保留、重匯冪等，以及實際匯出使用所選副本。以乾淨 session 執行 `playwright-cli --session dance-recipe-copies run-code --filename tests/browser/backup-recipe-copies.js`。

### #14 Web 可及性與媒體隱私

用新隔離 session 分別執行 `accessibility-focus.js`、`accessibility-layout.js`、`accessibility-media.js`，仍用原有 CLI `run-code --filename`，必須檢查 `### Result` 且沒有 `### Error`。前兩支需 `output/comparison/` 的兩份合成原片；第三支用既有合成相機設定與 `output/media-probe/reference.mp4`，不得改用真實私人相機或真人影片。

focus 函式測保存／編輯／清單重繪、modal 返回、quota 與停止鍵不被搶焦。layout 函式在五組 viewport 與 100%／200% 根文字尺寸量 44px 目標、完整焦點可見、無水平溢出、原生狀態捲動及七種常用文字對比；不以程式捲到控制來掩蓋 Tab 行為。原生 End 捲動須等實際 scrollTop 改變，不能只看按鍵回傳。

media 函式用 CDP 真正可及性樹核對播放器名稱、禮貌狀態及輸出進度，合成權限拒絕後明確重試、不開麥克風；注入合成敏感檔名／deviceId／groupId／label，核對診斷及 JSON 不含它們、無外部請求且 tracks 全部釋放。下載 VS 再按既有方法完整解碼與產品外播放。這不是讀屏實聽、實體裝置或全媒體 gates；[本版本證據](evidence/issue-14-web-accessibility.md)與[人工觀察單](WEB_USABILITY_CHECK.md)分開。

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
python3 scripts/run-media-feasibility.py --cli playwright-cli --url http://127.0.0.1:42833 --mode matrix --label g3 --analyze
python3 scripts/run-media-feasibility.py --cli playwright-cli --url http://127.0.0.1:42833 --mode stability --label g3 --analyze
python3 scripts/run-media-feasibility.py --cli playwright-cli --url http://127.0.0.1:42833 --mode webm --label g3 --analyze
python3 scripts/run-media-feasibility.py --cli playwright-cli --url http://127.0.0.1:42833 --mode alignment --label g3 --analyze
python3 scripts/run-media-feasibility.py --cli playwright-cli --url http://127.0.0.1:42833 --mode recovery --label g3 --analyze
```

matrix 為三速度 × 15／30／60 秒；stability 為同 session／同資料庫連續十次 1× 的 60 秒 capture→export；webm 只略過 MP4 候選，仍由原生編碼器實際試錄與回讀；alignment 用正／負 200ms 校正及兩側獨立鏡像重跑 15 秒成檔；recovery 在一次完整流程後檢查匯出取消、預覽取消及 play 拒絕的回呼清理／檔案保留。每段都下載原片／VS，`--analyze` 立即全片解碼，門檻不過即停止並保留失敗報告。

每個版本開全新隔離 session，`--label` 換未使用的英數標籤；JSON 記錄 Git head 與建置內容版本，不覆寫舊證據。已產生過的分析報告也不覆寫；需另行分析時可傳 `analyze-media.py record.json --report 新報告.json`。每個流程都有包含下載／輪詢成本的完整匯出耗時上界，亦可用 `--mode performance` 單獨重跑 60 秒。完整解碼與二進位時間碼不代表實體相機光學時鐘、手機／Safari 相容性或 G2 已完成。

分析器 v4 的聲音事件依配方合法交集 `[L,U)` 配對；來源 B 的末格閃光另列 `boundaryFlashPts`，不能要求片段外的下一個提示音。所有影格仍計入首末同步與 G3，片尾含最後一格的呈現時間，沒有忽略開頭或尾端的停格。自查另含末格邊界正例、中段缺音及片尾凍結負例；`check-media-analyzer.py --label 新標籤` 另存一輪，不覆寫舊自查。

若產品版本完全未變，且中斷原因已釐清、前段已用同一分析器確認，可用 `--start-index 7` 從第七組未執行案例接續。它仍拒絕覆寫既有案例；產品有改動須用新 session／標籤重跑，不能用接續功能跳過未解決失敗。

手機依最新安排暫停，先完成桌面 G3 與同版矩陣／十輪；後續才使用 [手機清單](PHONE_MEDIA_CHECK.md)。修正前數據見 [基線](evidence/issue-3-media-feasibility.md)，修正與重跑見 [G3 證據](evidence/issue-3-g3-composition.md)。

分析器 v4 保留音訊 PTS，將量測 PCM 補到共同時間原點，不把容器延遲歸零；90 秒依完整匯出上界判定，缺此資料標未驗證。自查包含僅移動音軌 PTS 與完整匯出 100 秒的負例。保存檢查依 take／export 關聯驗證預期 Blob，不跳過 missing；recovery 會實際移除並 finally 還原一份合成副本，最後須再核對全庫指紋。

分析器 v5 另獨立驗證配方合法交集的解碼長度及兩側來源起末時間碼覆蓋（100ms 邊界容差），全片來源時間碼依輸出時鐘核對（250ms 品質容差）；runner 相機原片規劃長度沿用既有 500ms 容差。自查增加截短及重播補長負例。瀏覽器先快照既有 ID，要求本輪新增 ready take／export、正確關聯及 Blob 與下載內容一致；recovery 另注入 VS 保存 quota 並確認新檢查拒絕，該額外未保存檔不列入正式成檔數。


## #11 慢速比較音高對照

使用合成 `make-comparison-fixtures.ts` 與新隔離 Chrome context 執行 `tests/browser/comparison-pitch.js`，再跑 `python3 scripts/analyze-comparison-pitch.py`。真正下載三份三秒 VS，完整解碼並確認 660Hz 老師聲源依 0.5／0.75／1× 成為 330／495／660Hz，排除 880Hz 自己聲源與誤保留原音高；預覽取消／成檔／繪製失敗後仍恢復一般練習音高。這是短片功能與音訊內容驗證，完整同步／穩定性另跑原始 `run-media-feasibility.py`，不代替真機聽感。

## 12. 選定筆記分享（#18）

以專用短片及全新隔離無視窗 session 執行 `tests/browser/share.js`；沿用 `make-export-fixtures.ts` 的八秒 reference／self，另建立兩秒同名裁切片及同名不同內容候選。下載路徑與完整重現見 [#18 證據](evidence/issue-18-sharing.md)。測試會實際下載分享／完整備份，在其他新 contexts 選檔、預覽、重建 ID、原子匯入、人工確認逐側重連與跳片段；用 stub 測系統分享，禁止實際寄件。

包含私人欄位預設排除、明確加入、最小閉包、文字／JSON 預覽、下載失敗、quota／交易內取消、真實多分頁 revision、重匯冪等與衝突另存、同名／裁切／VS／壞檔；既有 `backup-recipe-copies.js` 與 migration／鎖回歸分開跑。這是短片功能與資料保護回歸，不重跑未變的長片／效能矩陣，不操作桌面或雲端。另一實體裝置及 Google Drive／Dropbox／iCloud Drive／AirDrop 保留未驗證。


## #19 手動拍點與合成提示音

執行 `bun --no-env-file scripts/make-beat-fixtures.ts` 產生 ignored `output/beats/reference.mp4`（20 秒 testsrc／120 BPM／第一拍 0.35 秒／660Hz），不覆寫既有素材。以獨立隨機 localhost port、乾淨 headless Chrome session、`--mute-audio` 執行 `tests/browser/beats.js`；沿用本文件 Playwright CLI `run-code --filename` 方法。腳本只用傳入 page 的 origin，不固定或占用其他聊天埠，測片、備份及 logs 只留本機。

`beats.js` 測 UI、嚴格輸入、保存失敗重試、取消／重匯、乾淨 context 還原、三速度來源拍號，以及 OfflineAudioContext 提示音 samples。`beats-capture.js` 用頁內合成 canvas 相機，不呼叫實體相機／麥克風，量測倒數、錄影鎖及取消／中斷。既有 `storage.js` 的 migration 腳本可在專用 runner 將硬編碼測試 origin 替換為自己的 origin 執行。長片／效能或有視窗操作按當次派工的共用互斥鎖規則進行，不搶刪他人鎖。


`move-draft.js` 使用全新隔離頁面且停用相機 API，不需要影片；實走既有／新增草稿的編輯切換、明確保存／取消、metadata quota、真正第二分頁 revision 衝突及原生 beforeunload 拒絕離頁。原候選先重現覆蓋，再以相同測試驗修正；不將此短文字流程算入媒體或實體桌面 gates。


原生確認框會中斷單次 CLI 的回覆，不能將空結果當通過。`move-draft.js` 採兩階段：第一次 `run-code --filename` 必須取得 `beforeUnloadPrepared=true`；再對同 session `goto about:blank`、`dialog-dismiss`，第二次執行同檔必須取得 `realBeforeUnloadDismissed=true`，並驗 trusted／prevented 事件及原輸入未變。測試先拒絕非 loopback、非合成標記或非空庫，再停用相機 API。


## 匯出準備與來源歸屬

新隔離 session 執行 `export-ready.js`，只選合成既有雙片並停用相機 API。原生影格通知刻意暫不交付時不可先建立編碼器，取消須撤銷等待且保留上次輸出；同頁重試真正成檔下載，準備及正式播放各自拒絕時也保留舊片、配方並釋放串流。`comparison-capture-fallback.js` 另驗沒有手動 canvas requestFrame 的既有備援。

`run-media-feasibility.py` 預設拒絕未提交來源。只有有界實驗才加 `--allow-dirty`，原品質檢查仍全部執行，raw JSON 記 sourceDirty；true 不能宣告該 Git head 正式通過。正式候選應先完成原 check／commit／push，再以乾淨來源和新 label 重跑，不覆寫實驗或失敗報告。

本輪隔離 Chrome 已實際通過上述準備取消／兩次拒播／重試下載、canvas 擷取備援與既有 export-failure；獨立分析器再次完整解碼並核對老師音源、鏡像與四份舊 VS 指紋。這些短片回歸不取代提交後的完整矩陣與真機驗收。

## P0 整合候選的正式同版桌面證據（2026-10-28）

受測來源 `efd09104630cdd5631166971ae5ba94d408b9f9d`，靜態 `22c187ea10e457c2`，一般 [PR #53](https://github.com/sunpochin/dance-stamp/pull/53)。環境為 macOS 27.0.1、隔離 Chrome 156、Bun 1.4.4、FFmpeg 8.1.2；每筆 raw 保留實際 userAgent。本節為該提交的新結果；上方舊版失敗與未提交對照仍保留，不能相加成通過。原完整 check／hooks、18 組 source browser 函式、12 個分析器正負控制均通過，正式 raw 全部 sourceDirty=false。只使用合成時間碼／音訊與假相機，沒有真人相機、麥克風或私人資料。

| 正式成檔組別 | 結果 |
| --- | --- |
| smoke、三速度 × 15／30／60 秒 | 1＋9 組通過 |
| 同 session／資料庫連續十輪 60 秒 | 10 組通過，不清庫、不重啟瀏覽器；每組重載工作台 |
| WebM、正負 200ms／兩側獨立鏡像 | 1＋2 組通過 |
| 取消、拒播、繪製／保存故障及恢復 | 1 組通過；額外故意未保存輸出不算正式成檔 |

共 24 組全部由產品真正 capture→export、下載原片／VS、原 v5 全片獨立解碼，合法起末覆蓋皆通過。最大聲畫差 60ms、起中末配方誤差及新增漂移各 64.434ms、最長重複畫面 71ms、最低平均 29.984fps、最長完整匯出上界 63,818ms。WebM 單案聲畫最大差 40ms，與舊版 110ms 失敗分開記錄。24 take／24 VS 共 48 份 Blob 均存在且內容指紋對應本輪下載；沒有拿舊輸出代替本輪新增成功。

取消與拒播、繪製錯誤後回呼 pending=0、同時最高 2；故意移除合成 Blob 可抓到缺檔，finally 還原後為 0。真正 media put quota 會被本輪新增 VS 檢查拒絕，原片、舊輸出、配方及資料保留。另有準備取消／兩次 play 拒絕／重試、canvas 擷取備援、export-failure 及三速度音高的獨立短片回歸；完整解碼確認老師聲源、鏡像與舊 VS 指紋。

同提交乾淨獨立包：36 檔、117256 bytes、trackedChanges=false；archive SHA256 `e53715ba4d32978df4b7d4e40e8600f22955c1c9fa11e29e043cfe613ad3a185`。真正解到 Git／node_modules 外，原生 tar／逐檔校驗通過；五份資源 hash、八條內部路徑／三種寫入拒絕、HEAD／標頭／MIME、CLI／環境優先及八種錯誤設定拒絕均通過。包內 entry、錄影到比較、既有雙片三組實際操作通過，不依賴開發伺服器。

真正 CLI 離頁並接受原生 beforeunload 後回站：trusted pagehide、相機同步釋放、離頁在 B 前；至少兩個已提交 chunks 恢復為 interrupted，原片可解碼、播放及下載，舊 take bytes／資料不變。SW 實際損壞更新拒絕；錄影、匯出各收到 waiting worker 均未重載／接管，全部舊分頁關閉後才啟用，舊筆記／錄影及無關 cache 保留。測試主機只在 ignored 工具副本改專用 port，不改原產品及品質條件。

三份已下載代表檔以原生 file:// 頁面離開產品重播：60 秒 MP4、15 秒 WebM、0.75×／正偏移校正版皆播到 ended，1280×720、error=0、dropped=0、音訊解碼 bytes>0。此為隔離 headless Chrome／靜音輸出下的解碼與播放證據，不代表真人已聽到聲音。

上述只屬桌面合成驗證。實體相機光學 G2、真人五人／讀屏／實聽、跨裝置保存、Safari 當前 runtime、熱／電池／記憶體壓力及發布主機仍未驗證；iPhone 依使用者安排暫緩。人工審查、合併及發布核准各自保留，#1 與未驗收子票不因本節關閉。

## P1 整合候選的正式同版桌面證據（2026-10-28）

[一般 PR #54](https://github.com/sunpochin/dance-stamp/pull/54) 的正式受測來源 `587689d143bb1417ef48f083e5fe983a81af2c02`、靜態 `db129e273cf0039b`。macOS 27.0.1、隔離 headless Chrome 156、Bun 1.4.4、FFmpeg 8.1.2；每筆正式 raw 留 Git head／靜態版本／sourceDirty=false／userAgent。不把前節 P0 或來源 #50／#51／#52 數據相加成此版通過。

原 check／hooks 366 tests、1015 expects、0 fail；14 組整合 browser 函式與額外 move-draft 原生離頁保護通過：分類／歷史／離線重開、v1 延遲升 v2／quota／跨頁衝突、分享隱私／選項／穩定 ID／衝突副本／重連、手動拍點／合成 samples／三速度倒數與相機、入口／焦點／窄版、兩種比較、完整備份／配方副本及輸出取消／備援。系統分享只用 stub，不發送檔案或操作雲端；同機 contexts 不等於另一裝置。

本 runtime 自己的新 session 完整 24 組（smoke 1、三速度 × 15／30／60 秒 9、同 session／同資料庫十次 60 秒、WebM 1、正負校正 2、恢復 1）全通過原 v5 全片解碼與合法起末覆蓋；每組重載工作台，未清庫或重啟瀏覽器。最大聲畫差 88.333ms、三點配方誤差 68.5ms、新增漂移 67.567ms、最長重複畫面 70.8ms、最低平均 29.984fps、完整匯出上界最高 63,803ms。24 take／24 VS 共 48 份 Blob 均對應本輪新增並與下載指紋一致。回呼最高同時 2、完成 pending=0；取消／拒播／繪製錯誤、故意移除 Blob 並還原、真正 media quota 導致未新增 VS 的拒絕檢查均通過。先前另跑五組代表成檔也通過，未混進正式 24 組。

受測同提交乾淨包 40 檔、143039 bytes、trackedChanges=false，archive SHA256 `1508fe1d5dafa03862a725d37a078dfce534d8e8e675b3618c2614627a9095d5`。真正解到 Git／node_modules 外，以隨包主機通過逐檔／native tar 校驗、六資源 hash、八路徑與三寫入拒絕、標頭／MIME／HEAD、CLI／環境優先及八類錯誤設定拒絕；entry、錄影比較與既有雙片在裸包實際成檔通過。

`integrated-workflow.js` 在裸包同一頁實走：拍點→動作→片段關聯→既有雙片 VS→比較歷史→選定分享→完整備份→空 context 還原。動作狀態仍由人決定；分享排除 Move／marker.moveId／beatGrid／未選正文，完整備份保留它們，選定 take／recipe／VS 閉包正確。還原資料正規化相同、沒有夾帶影片，VS 另經完整 FFmpeg 解碼。測試停用相機／麥克風 API，不涉及外部傳送。

原生 CLI 真正離頁／接受 beforeunload 再返回，trusted pagehide 與同步釋放相機均成立；兩個以上已提交 chunks 恢復成 interrupted，原片可播／下載／全解碼，舊片保持。SW 以共用含 beats.js 白名單及原生 installing／waiting 生命周期拒絕損壞新版，錄影／匯出中不重載，全部舊分頁關閉才啟用，保留原資料及無關 cache。產品外 file:// 重播本版 60 秒 MP4、WebM、校正版均 ended／1280×720／error=0／dropped=0／audio decoded bytes>0；靜音 headless 不代替真人聽感。

### 筆記規模觀察

`notes-scale.js` 可在相同隔離設定呼叫，第二參數為 100／1000／5000，預設 1000。課程／動作／標記／take／配方／媒體描述各相同筆數；沒有實際影片。每組全新資料庫、原生交易保存後重載；輸入起至產品重繪後兩個影格量測，結果與空白／唯一命中／無命中相符，revision／內容指紋不變。

| 每種資料筆數 | JSON bytes | 重載就緒上界 ms | 展開結果上界 ms | 無命中／唯一／空白搜尋 ms |
| --- | --- | --- | --- | --- |
| 100 | 104234 | 60.8 | 62.7 | 28.5／29.9／27.9 |
| 1000 | 1040234 | 100.5 | 183.1 | 26.6／29.6／94.7 |
| 5000 | 5200234 | 473.7 | 619.8 | 32.5／29.8／663.5 |

這是一次本機樣本與完整渲染上界，包含兩個影格，非持續壓力／低階手機／所有表同時達格式上限的承諾；不因此修改產品品質門檻或引入搜尋服務。

上述是可重現的桌面合成工程證據。實體相機光學與聲音、真人五人／讀屏／聽感、另一裝置與外部傳檔、當前 Safari、手機及發布主機仍未驗證；iPhone 暫緩。最終人工審查、合併與發布核准各自保留，原驗收票不關閉。後續文件／測試提交不改 runtime，乾淨最終包的來源與校驗以 PR 及 release.json 為準。
