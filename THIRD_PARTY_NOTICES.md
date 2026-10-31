<!-- 檔案用途：保留移植工具的來源授權。所在層：根目錄授權索引。主要關聯：LICENSE、docs/ai/harness-import.json。 -->
# 第三方與上游授權

本產品根 LICENSE 不取代下列來源作品的授權。

- 開發工具與改寫文件的歷史來源：[sunpochin/jia-jian-log](https://github.com/sunpochin/jia-jian-log/tree/fefc821045cc92df25101ce1554fb6c80e4e0093)，commit `fefc821045cc92df25101ce1554fb6c80e4e0093`。原 MIT 授權見 [來源 LICENSE](vendor/harness/LICENSE)；逐檔範圍見 [manifest](docs/ai/harness-import.json)。包含 destructive guard、必要 parser、回歸測試及整理後的程式、審查、skill 安全與介面方法。此處保留來源署名；使用與維護不需要取得該 repository。
- reviewlatch：保留 [LICENSE](vendor/reviewlatch/LICENSE)、[NOTICE](vendor/reviewlatch/NOTICE.md) 與 [manifest](vendor/reviewlatch/manifest.json)。
- Agent Work Methods v0.1.0：MIT；完整固定副本保存在 `vendor/agent-work-methods/`，保留 [LICENSE](vendor/agent-work-methods/LICENSE)、[NOTICE](vendor/agent-work-methods/NOTICE.md) 與 [本地來源／指紋](docs/ai/work-methods-lock.json)。五個共用 skills 及必要文件來自該版本，不依賴其他產品的 checkout。

不能因本產品非商用而撤銷上游 MIT 或其他原授權的權利。私人課程影片、音樂與真人素材未隨工具匯入。

## Web 開發工具（#4）

- TypeScript 7.0.2 與對應平台 `@typescript/typescript-*` 7.0.2：Apache-2.0。來源 https://github.com/microsoft/TypeScript 。
- Biome 2.6.3 與對應平台 `@biomejs/cli-*` 2.6.3：MIT OR Apache-2.0。來源 https://github.com/biomejs/biome 。
- `istanbul-lib-coverage` 3.2.2、`istanbul-lib-instrument` 6.0.3：BSD-3-Clause，來源 https://github.com/istanbuljs/istanbuljs 。僅供測試插樁與合併計數。
- `playwright-core` 1.64.1：Apache-2.0，來源 https://github.com/microsoft/playwright 。沿用已安裝瀏覽器，不自動下載瀏覽器或進入產品資源。

精確解析與完整性見 bun.lock；只安裝目前平台的工具，不進瀏覽器產物。原包保留授權，本產品的非商用條件不取代它們的條款。

## 本機人物跟隨（#165）

- `@mediapipe/tasks-vision` 1.2.0：Apache-2.0，來源 https://github.com/google-ai-edge/mediapipe ，精確版本與完整性見 bun.lock。瀏覽器包包含其 vision bundle、非 SIMD WASM 與載入器。僅將載入器兩處 Emscripten 虛擬家目錄改為公開範例路徑，避免被誤認成私人路徑；不改 WASM 或偵測模型。
- EfficientDet-Lite0 int8 模型 revision 1：Apache-2.0，官方來源 https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite 。SHA256 `0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb`。模型以 COCO 類別偵測人物，不提供身分辨認或正確率保證。
- 完整 [Apache-2.0 授權](vendor/mediapipe/LICENSE) 隨下載包提供。模型與分析程式都由同一包載入；不連 CDN、不上傳影片，非商用根授權不取代上述第三方授權。
