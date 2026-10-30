<!-- 檔案用途：記錄疊影縮放平移的版本、合成回歸與使用界線。所在層：匿名工程證據。主要關聯：TECHNICAL.md 第 49 節、comparison-overlay-layout.js。 -->
# #107 疊影大小與位置對齊

基線為 main `5078401`，工作分支 `feature/overlay-spatial-alignment`。使用者已更正框消失為正式站未刷新，這次只實作老師／自己獨立的縮放、X／Y 平移與重設，並補憲法的文件白話解說條款。

所有測片為本機合成色條／影格碼／提示音；沒有真人、私人影片、相機或麥克風。原始輸出與畫面只留 ignored `output/playwright`。具體同版結果於提交前記錄；未測項不由 CI 或合成影片代替。

## 重現

沿用 Bun 1.4.4、已安裝的 Playwright CLI 與隔離 Chrome、專用本機 origin、共用媒體測試互斥鎖：

```sh
bun --no-env-file scripts/make-comparison-fixtures.ts
bun run check
bun --no-env-file scripts/serve-web.ts 42897
playwright-cli --session overlay-layout open http://127.0.0.1:42897 --config output/playwright/browser.json
playwright-cli --session overlay-layout run-code --filename tests/browser/comparison-overlay-layout.js
```

browser.json 採 Chrome／headless／`--mute-audio`。另跑既有疊影、左右鏡像、三速度聲音、擷取備援及左右選片回歸；下載後由原分析器與 FFmpeg 獨立檢查。

## 界線

本次不承接原生 Safari、實體相機／手機、真人動作判讀、透視／自動人物追蹤或完整長片 G1–G7 驗收。新設定只供本次疊影觀看，不宣稱可匯出疊影、儲存空間調整或自動對齊。


## 同版測試結果

產品靜態版本 `2e9e889846f38b9c`，本機 Bun 1.4.4／隔離 headless Chrome，未以正式站真人資料測試。

| 產品檔案 | SHA-256 |
| --- | --- |
| `web/main.js` | `5eb8bae6bc2c8171f0a278bcadfb80b4f2fc2cb8129973745aaa1e41b294982b` |
| `web/index.html` | `d43e560dfaac223ed69db9da8b82fa9214c7b019428532631a6ffec426ba7d48` |
| `web/style.css` | `4269d61e94de45baf989e6247bec26a02109b6e28ee853245dc380e07d0d2387` |

- 原完整 `bun run check`：632 unit tests、0 fail、3050 expects，harness／公開掃描／型別／lint／建置通過；提交前 hook 會再核對實際暫存版本。
- `comparison-overlay-layout.js`：兩側各自的 25／50／200／400% 大小、半尺寸邊界與中心放大白條像素、X／Y 正負位移、鏡像不反轉平移方向、播放／暫停調整、重設保留透明度、壞檔／取消保留、成功換片重設、鍵盤 0.5% 細調及 320／390／768／1440px 全通過。
- 非預設的老師 160%／向右 20% 設定下，原 VS 成檔成功且設定仍保留。下載全片經 FFmpeg 解碼；左右色條位置各讀得 `[254,0,0]`，確認空間變換沒有漏進左右輸出。原片與資料庫配方亦沒有因純觀看調整而改寫。
- 最終同版既有 `comparison-overlay.js`、`comparison-appearance.js`、`comparison-pitch.js`、`comparison-capture-fallback.js`、`video-roles.js` 五組回歸通過、page errors=0。三份新下載經原 `analyze-comparison-pitch.py` 全片解碼，驗出老師單一聲源 330／495／660Hz；棄用與輸出串流停止，待處理影格通知為 0。
- 另人工檢視合成畫面截圖；桌面預覽與控制並排，窄版上下排列。這不是實體觸控／讀屏或真人操作驗收。像素讀回僅於測試執行，Chrome 的 readback 效能建議不代表產品錯誤。

raw 位於 ignored `output/playwright/layout-result-final.log`、`layout-regressions-final.log`、`layout-export-analysis.json`、`layout-pitch-analysis-final.json` 與 `overlay-layout.png`；舊版驗證維持各自歸屬。首次測試將 fieldset 當作可用性查詢目標，被 Playwright 的語意差異拒絕；已核對原生 fieldset.disabled=true／子滑桿 :disabled=true，改為直接驗證使用者操作的滑桿，產品停用邏輯未更動。

憲法只在 canonical AGENTS.md 補一項明文，不複製進各工具入口。新規要求實作與驗證，且文件先有白話做法與原理解說；本次 TECHNICAL.md 第 49 節與操作指南已依此交付。
