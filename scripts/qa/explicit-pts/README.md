<!-- 用途：說明受限逐 PTS QA 的使用、證據與停止界線；所在層：scripts/qa/explicit-pts；關聯：serve.ts、spike.js、probe.js、docs/RECORD_COMPARE.md。 -->
# 三秒明確時間戳 QA

像先拿兩疊有編號的照片，再把同一秒的照片排在一起：這個工具不等播放器邊播邊錄，而是逐格指定時間，合成三秒影片。它只驗固定合成片，還不能取代產品，也不能據此說 Safari、完整同步或取消都已驗收。

## 準備與執行

從 repo root 使用 Bun **1.4.4**，依鎖檔安裝：

```sh
bun install --frozen-lockfile --ignore-scripts
python3 scripts/make-sync-fixtures.py --reference-only
bun scripts/qa/explicit-pts/serve.ts --output output/explicit-pts-first
```

可加 `--fixture output/<已凍結的合成片.mp4>`。只接受 repo `output/` 內既有檔案；收據目錄必須是不存在的 `output/<freshfolder>`，禁止覆寫或導出到其他位置。主機在 loopback 隨機 port，網址由終端列印的 `origin` 取得；只開自己的隔離瀏覽器頁面。

素材必須是原 65 秒、640×360 的合成 reference，**1789027 bytes／SHA256 `3fb42ffb14678b8c944d605cab684a1919801de7908c1f540f7fbfc29ea26548`**。原來源由FFmpeg8.1.2生成；不同FFmpeg／編碼器／thread配置不保證bit-identical。本機沒有符合指紋的合成片時，此固定輸入原型不可執行；保留重建輸出與版本差異，不依賴另一個checkout或為過關硬改白名單、門檻、換私人檔。兩側使用同一合成片，不能驗來源身分。

只按一次「檢查本機編碼能力」；不支援就停止，不換 codec。支援後只按一次「產生一次三秒合成原型」，不重試挑成功。此頁只能處理 A0/B3/C0/r1、零 offset、無鏡像、1280×720／30fps／90 格，AVC5Mbps＋AAC mono48k128kbps MP4。

## 收據與停止

`host.local.json` 列 Git來源／是否有變更、主機與實際 assets／bundle hash，`capability.local.json`、`result.local.json` 與 `first-output.mp4` 只保留第一次 POST，分別有 2MB／2MB／16MB 上限、5 秒 request-body 期限、同 Origin＋nonce 限制；失敗也封住該 kind，不重送。所有檔案只留本機 ignored output。**artifact POST 是本機保全，不是原生下載、產品儲存或離站播放驗收**。

只有整個自有隔離browser與本輪Worker都已核對停止，才在同一主機終端輸入 `finish-safe`；不能只關自己的頁面／Worker或呼叫browser.close便把browserStopped寫true。共用Safari仍開著時，必須走SIGINT保留browserStopped=false／exit1原收據，再另按context、nonce、PID、cwd、port與所有權稽核處理自己的閒置鎖。主機有 10 分鐘期限；timeout／SIGINT／SIGTERM 會停止服務但保留共用媒體鎖，直到另行核對該次 nonce／PID／cwd／程序與 port 後才處理自己的鎖；不要刪別人的鎖，也不要把留鎖失敗改寫成正常收尾。

瀏覽器原型有 60 秒停止訊號；保留 TimeoutError 與使用者 AbortError，首錯與 cleanupErrors 分開。Mediabunny 1.65.0 的 Output.cancel 在 finalizing 不能立即打斷，需等真正終態；cleanupCallsCompleted 只是公開清理呼叫返回，不是獨立資源稽核。取消實際驗收尚未完成。

## 技術與版本界線

核心用 BlobSource／VideoSampleSink 按來源 PTS 取格，sample.draw 到兩個 640×672 半框 contain（640×360 圖 top204），CanvasSource.add(i/30,1/30) await 反壓；reference AudioSampleSink 裁成 144000 格真 PCM，bitmap 全覆蓋才交庫 AudioBufferSource 從 timestamp0 編碼。音視訊 producer 並行以免 mux 等另一軌；逐格 close，finally dispose inputs／return iterators／cancel output，不自造 muxer 或依賴即時 video getter。

保存進 repo 的 spike/probe/index 相對已測 Chrome 版本僅改檔頭／註解；核心受測原 SHA256 為 `cc1e71f0d0f68d6ada5ad5dfdc969be7717f29518d7856d15dc4c063d9e9b567`，不是 repo host 新檔的 SHA。原 Chrome 單次成檔另經原 v5＋RGB 核對 90 格／三秒／最大 A/V 差0ms；本段記錄最初Chrome範圍，不能以檔頭等價移稱新repo host已媒體受測。後續固定三秒原生window／Worker單案另見[原型證據](../../../docs/evidence/issue-11-explicit-pts-spike.md)；每個adapter仍由當次提交、實際指紋與收據重新綁定，不能代簽完整產品。

仍未完成完整Safari支援矩陣、三速度、負 offset、非零 A、overlay、follow、VFR、任意音訊／尺寸、長片有界記憶體與取消。BufferTarget 保整檔；AAC 首 add 還會做本機 priming encode/decode 自測，capability true 不保證成檔。真檔仍須依 [錄影比較規格](../../../docs/RECORD_COMPARE.md) 完整解碼、檢頭中尾內容／片長／freeze／fps／聲畫差，不能只看提交格數或 metadata 就報同步成功。

依賴固定 [Mediabunny v1.65.0](https://github.com/Vanilagy/mediabunny/releases/tag/v1.65.0)，tag source `cd6612380c7e3f1261d74b9b550e6fc3b65a53bc`，授權 MPL-2.0；本機 bundle 無付費服務或上傳，散布仍須保留其 LICENSE／notices／對應來源取得資訊，不能改稱本專案授權。這是 dev-only QA，不進產品包。


## Module Worker模式（受限QA）

原頁面模式仍為預設，可明寫`--variant window`。Worker能力檢查及唯一首匯出都在同一個真正Module Worker內；不是借主頁的VideoEncoder／AudioEncoder能力當Worker支援，也不是產品匯出入口。

```sh
bun scripts/qa/explicit-pts/serve.ts --variant worker --output output/explicit-pts-worker-first
```

素材、Bun版本、`--fixture`與全新output限制同上，沒有新的依賴或CDN。共用主機只切換worker子目錄資產；`/worker.js`映射entry、`/worker-core.js`映射core，其他模組／fixture都同源。worker模式另核固定bundle SHA `65a111aadcb9a8b45e585f128d11daf3c972289bf6c58b2e795ba6073ee13363`並設定`worker-src 'self'`；window既有資產及CSP行為保持。收據另列variant／workerVariant及Worker引擎基線3ed5fee；當下Git HEAD／dirty與host／assets指紋不能沿用暫存版來源。

能力按鈕一次；Worker內API及固定AVC720p30 5Mbps／AAC mono48k128kbps不支援就停，不換codec或建立第二個Worker。支援後只按一次首匯出。Worker以OffscreenCanvas取代DOM canvas、raw Float32Array144000格保留同一PCM bitmap；AudioSampleSource＋f32-planar AudioSample從timestamp0提交，await add後才關自己的sample。原90個PTS、來源首尾、格式拒絕、微秒量化界線、反壓及首錯都保留，不用AudioBuffer、AudioContext、即時播放器或captureStream。

主頁只接受自己的Worker target＋本次隨機case＋可信訊息；錯誤／messageerror／60秒期限／取消均只有第一個終態。成功也須公開cleanupCallsCompleted=true、cleanupErrors空，且own terminate呼叫回傳後才可發布Blob；terminate失敗保留首錯、標failed並跳過artifact。取消／期限先到後不接受晚到Blob，不重送POST或重試挑綠。encoded先到之後若本機保全失敗，另記preservation-failed；已完成POST的候選不能回溯撤銷，不能因此稱產品保存成功。

core保留AbortSignal首原因，但主頁中止此控制是hard terminate，可能不跑core finally；取消／worker error不能捏造cleanupCallsCompleted。terminate.called／returned即使皆true，也不是physical codec資源已獨立退出。共用Safari保持app，仍按前述SIGINT false及另行稽核收尾，不要用finish-safe虛報整個browser停止。取消實際驗收仍未完成。

terminalClaimMs為main認領第一個終態；artifactPostCompletedMs為同機artifact回應完成；elapsedMs到result POST前、含可選SHA／本機保全。未run或無artifact時相應欄位null，都是主頁同一performance.now口徑，不稱純編碼或原生下載SLA。BufferTarget仍保整檔，並非長片常數記憶體；AAC priming仍由庫本機測量，不加固定補償。

worker/core、entry、probe及HTML相對隔離受測版本只改首檔頭；等價記錄不等於這個新repo主機adapter已做原生媒體測試。固定三秒單案仍須真檔v5與獨立RGB／音訊檢查；三速度、偏移、疊影、鏡像、跟隨、一般格式、長片與保全仍依完整產品範圍，不能把原型直接當成產品完成。
