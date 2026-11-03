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

先關閉自己的瀏覽器並核對自己的程序已停止，才在同一主機終端輸入 `finish-safe`。不能只因呼叫了 browser.close 就假稱所有程序已退。主機有 10 分鐘期限；timeout／SIGINT／SIGTERM 會停止服務但保留共用媒體鎖，直到另行核對該次 nonce／PID／cwd／程序與 port 後才處理自己的鎖；不要刪別人的鎖，也不要把留鎖失敗改寫成正常收尾。

瀏覽器原型有 60 秒停止訊號；保留 TimeoutError 與使用者 AbortError，首錯與 cleanupErrors 分開。Mediabunny 1.65.0 的 Output.cancel 在 finalizing 不能立即打斷，需等真正終態；cleanupCallsCompleted 只是公開清理呼叫返回，不是獨立資源稽核。取消實際驗收尚未完成。

## 技術與版本界線

核心用 BlobSource／VideoSampleSink 按來源 PTS 取格，sample.draw 到兩個 640×672 半框 contain（640×360 圖 top204），CanvasSource.add(i/30,1/30) await 反壓；reference AudioSampleSink 裁成 144000 格真 PCM，bitmap 全覆蓋才交庫 AudioBufferSource 從 timestamp0 編碼。音視訊 producer 並行以免 mux 等另一軌；逐格 close，finally dispose inputs／return iterators／cancel output，不自造 muxer 或依賴即時 video getter。

保存進 repo 的 spike/probe/index 相對已測 Chrome 版本僅改檔頭／註解；核心受測原 SHA256 為 `cc1e71f0d0f68d6ada5ad5dfdc969be7717f29518d7856d15dc4c063d9e9b567`，不是 repo host 新檔的 SHA。原 Chrome 單次成檔另經原 v5＋RGB 核對 90 格／三秒／最大 A/V 差0ms；該範圍不能移稱本 repo host、Safari 或完整產品驗收。新 host 適配及套件來源由提交與實際收據重新綁定。

未覆蓋 Safari、三速度、負 offset、非零 A、overlay、follow、VFR、任意音訊／尺寸、長片有界記憶體與取消。BufferTarget 保整檔；AAC 首 add 還會做本機 priming encode/decode 自測，capability true 不保證成檔。真檔仍須依 [錄影比較規格](../../../docs/RECORD_COMPARE.md) 完整解碼、檢頭中尾內容／片長／freeze／fps／聲畫差，不能只看提交格數或 metadata 就報同步成功。

依賴固定 [Mediabunny v1.65.0](https://github.com/Vanilagy/mediabunny/releases/tag/v1.65.0)，tag source `cd6612380c7e3f1261d74b9b550e6fc3b65a53bc`，授權 MPL-2.0；本機 bundle 無付費服務或上傳，散布仍須保留其 LICENSE／notices／對應來源取得資訊，不能改稱本專案授權。這是 dev-only QA，不進產品包。
