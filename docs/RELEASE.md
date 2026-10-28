<!-- 檔案用途：記錄下載包、免費主機、來源邊界及發布前缺口。所在層：#15 發布準備。主要關聯：START_HERE.md、LICENSING_AND_COST.md、ACCEPTANCE.md。 -->
# Web 下載包與發布準備

2026-10-29 更新支援狀態；下方主機比較保留2026-10-28的查核資料，發布前仍須重查。這是可審查的桌面候選，不是正式 beta 上線公告。#3／#14 的真人、裝置與完整媒體 gates 未完成；iPhone 依使用者要求暫緩。公開部署、GitHub Release、DNS／帳務變更與新增必要服務均未執行。

P0 整合候選以桌面 Chrome 為測試範圍。一般 macOS Safari 已用普通新視窗完成對照，不需改 Profiles 或日常設定；測試原片與 VS 曾能保存並關窗取回，版本歸屬見[儲存對照](evidence/issue-3-safari-current.md)。有界音訊候選的0.5×完整覆蓋與較長輸出同步仍有缺口，修正後尚待原生複驗，見[候選品質證據](evidence/issue-3-bounded-audio.md)。私人模式另有匯出與原生 Blob 保存阻礙，仍未通過；[早期紀錄](evidence/issue-3-safari-feasibility.md)保留原版本。目前原生續測等待 Mac 解鎖，無須使用者另選設定。iPhone 暫緩；真人相機／音訊、五人操作與最終審查仍須各自證據。包內以 START_HERE 的支援表與 release.json 的來源識別為準。

本候選已整合 [PR #58](https://github.com/sunpochin/dance-stamp/pull/58) `2d31302` 的主機與資料保護，以及 [PR #62](https://github.com/sunpochin/dance-stamp/pull/62) `676ba50`（runtime 仍為 `13976bb`）的有界音訊、空 edit 靜音與音訊偏移拒絕；來源 PR 與 main 均未合併。整合驗證及版本界線見[本候選證據](evidence/p0-safari-reliability-integration.md)。本機工程包仍須獨立審查及發布核准。

## 取得與重建

下載包的使用入口為 [START_HERE.md](../START_HERE.md)。已建置包無須 Git、套件安裝或編譯，仍需 Bun 1.4.4 啟動本機 HTTP 主機；不能以雙擊 HTML 代替可信任 localhost。尚無公開發行檔／網址，新使用者取得來源仍需自行建置或由維護者交付候選包，這項安裝限制尚未經真人驗收。

來源 checkout 使用 Bun 1.4.4：

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run package:web
bun run check:package
```

產物為 `dist/dance-stamp-web.tar.gz`、同名 `.sha256` 及可檢視的 `dist/package/`。包內 `release.json` 記靜態版本、來源 commit、是否有未提交修改及每檔 SHA256；`SHA256SUMS` 另含 manifest 的校驗。正式交付應在提交完成的乾淨來源重新產出，核對 commit／trackedChanges=false，再把整包雜湊綁到交付紀錄。雜湊只證明 bytes 一致，不能代替可信任的下載來源、人工審查或簽章。

白名單取代遞迴壓縮 repo，拒絕未知檔案／目錄、符號／硬連結、缺檔、內容竄改及公開掃描命中；建置寫入前也檢查，不自動刪除可疑檔案來換取成功。包內只有應用程式、共用本機主機、使用說明、資料／媒體契約、驗收與必要授權資料；沒有 node_modules、Git、私人媒體、資料庫、JSON 備份或測片。所有發佈 bytes 先校驗，再以 [Bun 原生 Archive](https://bun.sh/docs/runtime/archive) 壓縮並讀回核對，不新增壓縮套件。

最外層 `.tar.gz` 與 `.tar.gz.sha256` 也必須是不存在的路徑或獨立的一般檔案；工具在任何打包寫入前同時檢查兩者，拒絕符號／硬連結、懸空連結及目錄，保留異常路徑供人工確認。請在專用來源資料夾建包，避免其他本機工作同時改動輸出；這不是對本機其他程式的安全隔離。

隨包主機在每次 GET／HEAD 前也檢查包根目錄、`dist/web` 與實際白名單檔案，拒絕符號／硬連結、非一般檔案及缺檔並回 404；啟動後誤換連結同樣拒絕。這補上打包檢查之後的讀檔邊界，不會自動刪除或修復異常檔案。請保留專用且可信任的本機資料夾；預檢不保證抵禦另一個本機程式在檢查與讀取之間同時競態換檔，也不替代下載來源與校驗核對。

CI 沿用完整 check，另執行相同 package／check:package。只建立及檢查產物，沒有 upload-artifact、部署 token、發布 workflow 或付費服務。CI 成功不是發布或產品驗收。

## 免費主機比較

以下是當日官方資料的摘述，不承諾免費方案永久不變；實際發布前需再查同頁與帳戶資格。

| 候選 | 當日官方限制／來源 | 本專案決策 |
| --- | --- | --- |
| 專用 localhost | 不需託管帳號；仍需裝置、Bun 與儲存空間 | 本輪可驗證入口。固定 `127.0.0.1:4182`，只供這個應用；不同 host／port 是不同資料來源 |
| Cloudflare Pages Free | 每月 500 次 Git 建置、單檔 25 MiB、20,000 檔；Dashboard 拖放另限 1,000 檔。[平台限制](https://developers.cloudflare.com/pages/platform/limits/)／[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) | 公開託管候選為新建且專用的 `<project>.pages.dev` 根目錄，名稱及帳戶尚未配置；不購買網域、不啟用 Functions／R2／分析。未授權前不建立或上傳 |
| GitHub Pages | 公開 repo 可用 Free；站點最多 1 GB、流量軟限制 100 GB／月、通常每小時 10 builds，自訂 Actions 建置不適用後者。[官方限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) | 不採目前帳號的共用 `github.io` origin；路徑不是資料隔離，本程式資源也使用根路徑，不能直接塞進 `/dance-stamp/` |
| Netlify Free 新信用額度方案 | 每月 300 credits；production deploy 每次 15、流量與請求另計，舊帳戶方案可能不同。[官方計費](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/) | 可評估專用站點，但非本次首選；不假設流量無上限或帳戶自動符合方案，不開啟加值或付費選項 |

託管只放靜態應用，不放使用者的課程片、相機錄影或備份。主機仍會收到載入／更新請求與一般連線中繼資料，不能把「影片不自動上傳」解釋為完全沒有網路或主機紀錄。

## 來源盤點與隔離決策

2026-10-28 01:15 UTC 透過 [公開 repository API](https://api.github.com/users/sunpochin/repos?per_page=100) 完成分頁盤點：72 個公開 repo，其中 5 個 has_pages=true：`iron-vite-ecommerce`、`react-meal`、`react-memory-card-pokemon`、`sunpochin.github.io`、`theOdinProject-practice`。`dance-stamp` 未標示啟用 Pages。只記公開中繼資料，沒有讀取私有內容。

預設 user site 與 project sites 的 URL 共用帳號 host，見 [GitHub 官方網址規則](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。上述旗標不證明每一條目前的實際 URL、自訂網域或內容可信；直接讀根站未取得可判讀結果，私有 repo 發布的 Pages 也未由公開 API 排除。因此沒有「同 origin 全部安全」的結論，**不選 `https://sunpochin.github.io` 放本產品**。換 DB 名稱、repo 路徑或 SW scope 都不能取代 origin 隔離。

本輪選擇專用 localhost。未來若核准公開網站，選新專用 Pages project origin，發布紀錄須填實際 scheme／host／port、管理者、可寫入的 repo／部署者、是否有其他路徑內容與代理；不共用使用者內容上傳、其他專案或任意預覽。只信任自己核對過的來源程式及主機，專用 port 不是對本機其他程式的防護沙盒。

## 靜態託管與回復

取得使用者發布核准且 gates 有結論後，才把已核對的包內 **`dist/web/`** 作為專用 HTTPS origin 的根目錄。不要上傳整個 repo、`dist/package/` 或含錄影的 output。Cloudflare Direct Upload 接受預建置資料夾；[官方文件](https://developers.cloudflare.com/pages/get-started/direct-upload/)說明會配置 project 的 pages.dev 名稱，不在此預先假設某個名稱已可用。

建置產生 `_headers`，由靜態主機解析；CSP、相機／麥克風政策與本機主機共用 `scripts/web-assets.ts`，不維護另一份手抄政策。[Cloudflare 標頭文件](https://developers.cloudflare.com/pages/configuration/headers/)只適用靜態回應，若加入 Functions 必須重新設計。本輪未部署，不能用本機回應冒充託管標頭已生效。

發布前逐個實際 URL 核對 HTTPS、JavaScript MIME、CSP／Permissions-Policy、無意外 redirect、根路徑與 SW manifest；再在隔離資料環境實作三項核心任務、下載後獨立播放、匯入及逐片重連。將真實輸出、測試者及裝置證據綁到該次版本；數值只引用 [RECORD_COMPARE.md](RECORD_COMPARE.md)。目前不能關閉 #15 的完整發行驗收。

更新維持 SW 等待，不強制 reload／skipWaiting。先備份 JSON、原片及 VS，關閉全部舊分頁，保留同一 origin 再啟動新版。若公開主機政策改變，可停止公開入口並提供已核對的本機包；換 origin 後須使用檔案備份還原，不自動搬移 DB。回復舊靜態檔不等於回復資料 schema，禁止清庫修復；此功能整合候選寫入／交換採 v2 並可讀 v1；回復舊程式需升版前的 v1 備份及獨立影片，在另一資料環境還原，現有 v2 資料保留。

授權全文、必要來源 LICENSE／NOTICE 隨包保留，不變更原授權；使用者影片／音樂不隨程式授權。未啟動 iOS fallback，不申購 Apple 帳號、不承諾 App Store／TestFlight 零費用；若以後觸發，依 [既有授權與費用政策](LICENSING_AND_COST.md)另驗可行分發方式。
