<!-- 檔案用途：固定雙側人物跟隨的合成驗證、失敗與限制。所在層：匿名工程證據。主要關聯：TECHNICAL.md、tests/browser/person-follow.js。 -->
# #165 雙側人物框選與跟隨

先在老師與自己的影片各框一個人，再讓小相框跟著那個人移動。兩側分別鏡像，左右並排與疊影成品都保留這個裁切；原片不被修改。使用步驟見 [Web 指南](../WEB_PREVIEW.md)。

## 2026-10-31 桌面合成回歸

- 基線 `0d29204c3b9c8a2b07c34dbdeaddf2b266120c23`，功能工作樹；產品靜態版本 `894178ee5c77a5a8`。不是乾淨 commit／main 或發布驗收。
- Bun 1.4.4；macOS、隔離 headless Chrome 156.0.8078.76，受測來源 loopback 4174。
- 圖片為 AI 生成的虛構成人，無使用者課程／相機素材。`tests/fixtures/follow-person.jpg` SHA256 `05564405c9bb0568bae838f1a2a85f0809a91d8d98f8ccc8ef214b253d00aee1`。工具 `scripts/make-follow-fixtures.ts` 產出四秒雙向平移、單一人物、660 Hz 自製聲音；不代表真正舞蹈、多人交錯或遮擋。
- 模型為實際同源 EfficientDet-Lite0 int8，非假的人物偵測回傳。首次選框與後續區域搜尋都呼叫真正 Worker。全程沒有相機／麥克風請求、外部 origin 請求或網路寫入。
- 共用影音鎖由另一輪 Safari 驗證持有且使用者確認仍在測試；保持原程序／鎖。本輪依 [MEDIA_PROBE 的三秒無硬體功能回歸](../MEDIA_PROBE.md#11-匯出失敗與直式全身成檔)使用獨立 headless context，未跑長片、效能或裝置 gate，也未宣稱全 App 插樁矩陣通過。

`tests/browser/person-follow.js` 通過：老師拖曳／方向鍵框選、自己的百分比框選；兩側獨立跟隨、各自鏡像實際像素；另一側逐 channel 差異最多一階原生色彩捨入。分析取消、框空白區失敗保留舊路徑；壞檔保留兩側，成功換自己片只清自己的追蹤；擴大區間拒絕使用未分析路徑，縮回可繼續；320／390／768／1440px 無水平溢出。舊下載保留。

追蹤成品在 0.4 與 2.5 秒量測珊瑚色上衣的水平中心。這段時間原片目標橫移 147px，兩側方向相反。以下是外觀功能證據，不是 G2 同步或人體動作誤差指標：

| 成品 | 老師／疊影中心（px） | 自己中心（px） | 片長（秒） |
| --- | --- | --- | --- |
| 左右並排 | 447.67 → 447.55 | 898.33 → 902.99 | 3.038100 |
| 疊影 | 666.97 → 669.61 | 不另分層量測 | 3.003633 |

兩份真下載均為 H.264／AAC、1280×720。另將產品頁與 context 關閉，在全新 offline context 以 `file:` 開啟完整成品，均自然播到 ended（92／91 個呈現通知）；沒有 HTTP 請求。FFmpeg 也完整解碼較早同版兩份下載，無解碼錯誤。這些不證明實聽、實體播放器或手機保存。

既有 `comparison-overlay-layout`、`source-time-rulers`、`simplified-comparison` 三項同版短功能回歸亦通過，涵蓋舊鏡像／手動對齊、秒數定位、鍵盤選片、200% 文字、取消與壞檔保全、短成檔。完整 `bun run check` 的最新結果以 PR／提交前收據為準；本文件不把工具檢查當成真人／媒體驗收。

資源白名單的呼叫者另經盤點：開發更新工具的獨立來源副本也需複製固定套件／vendor 位置，保存尾段工具則以共用來源 bytes 核對產物；更新測試主機提供真正 WASM MIME。`dev-reload.ts` 在與全 App 舊案例相同的明示保留介面前提下，通過真改檔、草稿／原片保全、壞建置保留舊版與修復重載，不開相機或播放影片。

## 保留的失敗與修正

1. 初版把獨立分析 video 交給呈現通知等待，同位置重複取樣逾時。改用 decoded seeked／ImageBitmap；沒有更動原匯出的呈現門檻。
2. 全寬畫面中的合成人物漏偵測，靜態人物原圖則能辨識。改成首次在使用者選框內推論，後續擴大人物附近搜尋；原寬畫面素材不換，通過兩側移動及成檔。
3. 新增鏡像像素測試的「另一側完全零差」首次失敗，總差 100、實際逐 channel 為一階重畫捨入；改為每個抽樣 channel 最大 1，鏡像本身仍須吻合反射畫面，不能由灰背景取得成功。這只修正新像素斷言，不放寬既有媒體 gates。
4. `0974fd1` 的遠端一般 harness 通過，Linux 獨立安裝 job 因乾淨 checkout 沒有固定人物 runtime 而在建置報 ENOENT。該 job 原本只安裝外部測試控制器；補上與其他 jobs 相同的 frozen-lockfile／ignore-scripts 安裝，沒有放寬門檻。後續 CI 結果綁新 head，以 PR 即時狀態為準。

原始收據、合成影片、真下載與截圖留在 ignored `output/follow/`、`output/playwright/`；不把本機絕對路徑或私人素材放入 Git。重跑先準備合成檔，再依原全 App runner 取得自己的共用鎖，執行：

```sh
bun --no-env-file tests/app-coverage/prepare-fixtures.ts
bun --no-env-file tests/app-coverage/run-app.ts person-follow comparison-overlay-layout source-time-rulers simplified-comparison
```

## 未驗證

真人舞蹈、快速轉身、遮擋、多人交錯、相同衣著與鏡中倒影；原生 Safari、實體手機／觸控、長片效能、實聽及完整 G1–G7。追蹤只做區域連續性，仍可能跟錯，必須先預覽。路徑只留本頁，重開／重連不還原，已保存成品 bytes 保留。未合併或發布；重要變更仍待使用者／Claude Code 最後審查。
