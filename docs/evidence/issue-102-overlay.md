<!-- 檔案用途：保存半透明疊影的版本、重現方法與驗證界線。所在層：匿名工程證據。主要關聯：TECHNICAL.md 第 47 節、comparison-overlay.js。 -->
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

## 本次測試記錄

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

原始檔：`output/playwright/overlay-result-final.log`、`regressions.log`、`pitch-analysis.json`、`overlay-comparison.png` 與 `overlay-vs.mp4`。測試生成之媒體不進 Git。
