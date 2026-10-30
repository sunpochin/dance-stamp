<!-- 檔案用途：保存半透明疊影的版本、重現方法與驗證界線。所在層：匿名工程證據。主要關聯：TECHNICAL.md 第 48 節、comparison-overlay.js。 -->
# #102 疊影比較驗證

2026-10-30，以同步 main `b1fc932` 為基線，在獨立 clone／`feature/102-overlay-comparison` 實作。測試只用 `make-comparison-fixtures.ts` 的合成色條、影格碼與合成音訊，不包含真人、私人影片或原檔名。受測程式版本及結果於本次提交前完成記錄；提交 SHA 由 PR head 與版本指紋對照。

## 重現

使用專案指定 Bun 1.4.4、已安裝的 Playwright CLI 與獨立 headless Chrome，本機專用 origin；原子取得共用媒體測試鎖，沒有操作日常視窗或實體相機／麥克風。

```sh
bun --no-env-file scripts/make-comparison-fixtures.ts
bun run check
bun --no-env-file scripts/serve-web.ts 42892
playwright-cli --session overlay-check open http://127.0.0.1:42892 --config output/playwright/browser.json
playwright-cli --session overlay-check run-code --filename tests/browser/comparison-overlay.js
```

`browser.json` 使用 Chrome、headless、`--mute-audio`。raw、截圖與下載只留 ignored `output/playwright`；回歸結果與版本指紋見下方測試記錄。另以乾淨 context 跑既有左右鏡像與三速度聲音回歸，實際下載後用既有分析器與 FFmpeg 檢查。

## 驗證界線

像素、事件、定位、鍵盤及窄版是合成工程回歸。此次沒有真人動作、原生 Safari、實體手機／相機、人工聽感或全套長片 G1–G7 證據，不據此宣稱那些驗收完成。獨立審查、合併與發布分開處理。

## 首版 e679f05 測試記錄

受測 Web 靜態指紋 `2ecc758144193b14`；Bun 1.4.4、macOS、Chrome 156.0.8078.76 headless。產品來源 SHA-256：

| 檔案 | SHA-256 |
| --- | --- |
| `web/main.js` | `7f7ddc73c81db1c6de348e1f6a6e40080e3d636f391e187eab9d66813b0bdf5d` |
| `web/index.html` | `2191e5c6fd23ea9f32535baee9cf85b4cdff9a53c5f737f980f577105e1e9cef` |
| `web/types.d.ts` | `bd954c12e6602610515382a72a1f42d86f5358ea5312dbb5a41ce70f929a91cf` |

- `bun run check`：457 unit tests 通過，另通過 harness、公開掃描、checkJs、Biome 與建置；沒有弱化既有檢查。
- `comparison-overlay.js`：四種獨立鏡像、0/50/100% 實際像素與線性混色、調可見度不寫配方／不改左右畫布、0.5／0.75／1× 共同定位、負 offset、空交集、播放／暫停／Stop／重試、320／390／768／1440px 與鍵盤、準備新 take 清空疊影但保留舊 VS，全數通過。
- 三速度 scrub=1.25s、A=12s、δ=4s 時，實際老師位置分別 12.625／12.9375／13.25s，自己皆 5.25s。這是定位檢查，不冒充播放每影格或成檔 G2。
- `comparison-appearance.js`：原左右四種鏡像、控制文字方向及窄版通過。
- `comparison-pitch.js`：三份實際下載與取消／繪製失敗後恢復一般練習通過；`analyze-comparison-pitch.py` 全片解碼，老師聲源隨速度分別為 330／495／660Hz，排除自己 880Hz 聲源。這不是人工聽感。
- `comparison-capture-fallback.js`：缺 `requestFrame` 時從 0 退回 30fps，棄用與輸出串流全數停止，兩側待處理 rVFC=0。
- 疊影回歸的三秒 VS 實際下載為 H.264／AAC、1280×720，FFmpeg 全片解碼通過。疊影改動沒有取代左右輸出。
- 疊影流程瀏覽器 console 無錯誤；像素測試觸發 Chrome 的 `willReadFrequently` 效能建議，產品不會讀回畫布像素，沒有為測試提示改慢產品繪製。

首版原始檔與三份聲音下載保留在 ignored `output/playwright/e679f05/`，與下方整合版本分開。測試生成之媒體不進 Git。

## 與 main 50fa8fe 的整合重驗

開 PR 時 main 已另合併 #100／#101。將 `50fa8fe` 合併入本功能分支，保留雙側選片收合、原生播放器一直可見、#95 的新流程順序及所有新增 coverage 測試。疊影放在「對齊」之後、「保存」之前，沒有重複 controls／播放器 ID。TECHNICAL 的既有 #95 第 47 節保留，疊影順延第 48 節；沒有改動其餘工作的行為。新回歸只配合既有 `camera-tools` 展開後才點「準備下一段」。

整合版靜態指紋 `6f0a13e613ca634d`，仍為同一 Bun／Chrome 環境：

| 檔案 | SHA-256 |
| --- | --- |
| `web/main.js` | `4f0124877c504346ca2225fb570f044dc1b9fe9664acd1f64b7a0815f57adada` |
| `web/index.html` | `b1d8ccb7539904b088c4e8cde632361a6d63b6344f6318a7c173387ae6f634e8` |
| `web/types.d.ts` | `f207c42690acc2d4df489b01d7a9e514c45f065cdcfcd537c0bd070a6d7203c1` |

原完整 `bun run check` 及新增 `bun run test:coverage` 均通過：632 tests、0 fail、3050 expects；coverage 的實際載入模組總計函式 96.71%、行 96.25%，不是整個產品或瀏覽器覆蓋率。

整合版重跑 `comparison-overlay.js`、`comparison-appearance.js`、`comparison-pitch.js` 與 `comparison-capture-fallback.js` 全數通過；新下載的三速度聲源由原分析器完整解碼並驗頻，疊影流程的 VS 亦由 FFmpeg 完整解碼。另跑主分支 `video-roles.js`，兩側真正 FileChooser、不同橫直尺寸、取消／壞檔保留、成功才收合、無相機 API、鍵盤、320–1280px／100–200% 文字均通過。

新 raw 為 ignored `output/playwright/integrated-overlay.log`、`integrated-regressions.log`、`integrated-video-roles.log`、`integrated-pitch-analysis.json`。首版的自動程式審查已完成且無 findings，但只屬 e679f05，不延伸到整合版；人工與真機驗收界線不變。
