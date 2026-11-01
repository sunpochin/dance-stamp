<!-- 檔案用途：記錄下載包、免費主機、來源邊界及發布前缺口。所在層：#15 發布準備。主要關聯：START_HERE.md、LICENSING_AND_COST.md、ACCEPTANCE.md。 -->
# Web 下載包與發布準備

2026-11-02：[既有 HTTPS 預覽核對](evidence/issue-15-hosted-preview.md)已完成指定 PR 來源的 24 檔／48 次 GET／HEAD、完整內容、回應政策與 SW 清單比對；其十四份產品 JS 與 main `7dede9f` 相同。這份證據補上實際託管的靜態檢查，正式發行來源、完整 P0／真人／真機與發布核准仍待驗；下方歷史候選各保留原版本歸屬。

2026-10-30 PR #80 續作（靜態 `4651fae419d8d9c8`）：已納入 #82 的建置授權副本連結修正，以及按原受測版本保存的 [媒體保全／Safari 操作界線](evidence/issue-3-current-protection-audit.md)、[#79 近上限原生容量 UI](evidence/issue-12-native-capacity-ui.md)與 [#81 新版正常／注入救援](evidence/issue-12-backup-recovery.md)。下載包只明列增加前兩份匿名 Markdown；產品 HTTP 路由／Web 資源白名單與授權條款維持原樣。舊 396037f 的包／UI 證據保留，新包另記來源、manifest、校驗與必要 smoke，不宣稱重跑各來源媒體矩陣。

2026-10-30：整合候選固定 #74 `57e3fa1`（含 #73）、#78 `c46f0b5`（含 #75 `87e04e8`）與 #76 `f95a256`，靜態 `0e9c7c7af09286e2`。原 check、裸包 HTTP、五組恰好 10 MiB 的產品正常下載／還原及原始檔超限拒絕已實際重跑，來源與注入救援界線見[整合證據](evidence/p0-safari-reliability-integration.md)。這不是合併 main 或發布；下方舊版 Chrome／Safari／低空間結果保持原來源，不移記為本候選重跑。

2026-10-29 更新支援狀態；下方主機比較保留2026-10-28的查核資料，發布前仍須重查。這是可審查的桌面候選，不是正式 beta 上線公告。#3／#14 的真人、裝置與完整媒體 gates 未完成；iPhone 依使用者要求暫緩。公開部署、GitHub Release、DNS／帳務變更與新增必要服務均未執行。

本輪以桌面Web為優先，iPhone暫緩。最新功能99a2169／422c70c3633b8e88補上明確metadata保存的Stop接線；[乾淨同版title／copy Stop與新manifest重驗](evidence/issue-13-unconfirmed-storage.md#99a2169-同版獨立-stop-與-manifest-重驗)已通過。另有修正工作樹九個取消入口與獨立佇列例外，以及原capture／drain必要回歸；不把工作樹當clean-head，也不改標舊完整影音／Safari數據。從main38e6cf9建立一般PR #72，保留#64、#65、#66、#67、#69與#70的來源；629a98b新增擷取完整性保護及未完成原片另存，9e6f0ef合入pending-write工具且保留#66程序／nonce保護。失敗新片不替換舊自拍／VS，救援下載只在明確成功刪除對應媒體後撤銷，詳見[擷取證據](evidence/issue-9-capture-recovery.md#擷取完整性續審)。

最近完整影音受測9e6f0ef／1aa1ae164c31d690已完成原Chrome24組／48份下載、三份實際檔網站外播放，以及同版未提交寫入中斷／重試與更新部分安裝中斷後離線重開；[匿名同版數據與限制](evidence/p0-safari-reliability-integration.md#9e6f0ef-擷取完整性與同版-chrome-再驗證)分別記錄完整指紋與清理。不可播放sentinel、合成Chrome及三檔播放器不等於永久保存、真正低磁碟、真人相機、聽感或Safari救援；第三程序由原工具整份斷言通過但未另序列化快照。後續文件head與最終包sourceRevision另綁，本次功能續修只變main／SW，其餘12份與ba相同；最終文件包的14份runtime必須逐byte等於99功能版，不把文件提交當重新跑影音。

Safari不需改Profiles或日常設定。345b2d1／fe4bf7952cad2421的一般模式合成九案／同頁十輪、原生實際檔播放及正常VS重載已通過；這些保持原版本，不改標最新Safari擷取驗收。私人四次仍被原護欄拒絕，未走到新VS保存失敗／未確認救援；[原生及私人模式界線](evidence/p0-safari-reliability-integration.md#345b2d1-原生-safari-的同版證據)保留全部失敗。99e862d的[私人原頁救援與一般原片保存](evidence/issue-13-unconfirmed-storage.md)亦只屬其來源。Safari、人工／實體／跨裝置及Claude Code／使用者最終審查尚有未完成項目，不能宣稱P0或私人完整支援。

最終本機包沿原58檔白名單，只收匿名指南、證據、程式與授權，指南可離線查閱；不收output、profiles、原始收據、測片或QA工具。舊16bd／84包、SHA及所有歷史成功／失敗均保留原歸屬。本機候選仍待獨立審查與發布核准；未合併main、部署、建立GitHub Release或關閉未驗收票，包內以START_HERE與release.json識別為準。

## 版本與更新說明

GitHub Releases 是對使用者的版本公告；根目錄 `CHANGELOG.md` 累積各版本變更；Git history 留開發細節。採 Semantic Versioning，tag 為 `vMAJOR.MINOR.PATCH`，與 `release.json` 的靜態內容雜湊用途不同。Preview Deploy 不等於版本發行；版本 PR 合併、草稿、正式發布與網站部署分開記錄。

`package.json` 的 `0.0.0` 是尚未發布的開發基線，空的 `.release-please-manifest.json` 表示沒有歷史發行；首次 PR 預設提議 `0.1.0`。`bootstrap-sha` 固定為導入前 main `1fbbf5ba38633723a34e3695ebc8ee7fd5885fcb`，只自動整理其後的變更，避免把所有早期原型都當成新功能。首次公告須人工補寫該版本真正開放的功能與限制，不補造過去版本／日期，也不把範例功能寫成已完成。

後續 `fix:`／`perf:` 升 PATCH、`feat:` 升 MINOR；`!` 或 `BREAKING CHANGE:` 標出不相容變更。0.x 階段不相容變更升 MINOR，1.x 起升 MAJOR；0.x 不代表穩定或所有裝置已支援。一般 `docs:`／`chore:`／`test:`／`ci:` 等不進使用者更新說明。沿用提交的 `type: Title` 與 why-explanation；squash merge 時也要保留 Conventional Commit 標題與不相容變更說明。

### 里程碑操作

1. 維護者決定功能里程碑已適合整理，在 Actions → **Release preparation** → Run workflow，選 `main`、`phase=prepare`。這只新增／更新版本 PR，整理版本號、manifest 與 `CHANGELOG.md`；日常 push／部署不會啟動。若沒有可發行的變更，可能不開 PR。
2. 把版本 PR 的 `CHANGELOG.md` 及 PR 內的 release notes 改寫成簡短繁體中文：說明使用者得到什麼、修好什麼，刪除重複 commit，補已知限制與更新／備份提醒。兩處須一致；release-please 從 PR 內的筆記建立草稿。保留 PR 的機器辨識標記，不只修改檔案而留下舊 PR 筆記。再次跑 `prepare` 可能覆寫人工修訂，應先完成整理，再進人工修訂與審查。
3. 內建 `GITHUB_TOKEN` 建立的 PR 不會自動觸發 Harness CI。到 **Harness CI** → Run workflow 選版本 PR 的實際 head 分支，核對受測 commit 與待合併 head 相同；任何後續修改都要重跑。不能把缺少檢查當成通過，也不為此加入私人 token 或略過保護。若 PR 仍是 draft，審閱完成後改為 ready。
4. 依 `AGENTS.md` 取得合併授權並完成審查後合併版本 PR。再在 `main` 啟動 **Release preparation**，選 `phase=draft`；此輪只依已合併版本 PR 建立 GitHub Release **草稿**。設定固定 `draft=true`，不強制建立 tag、不上傳下載包、不部署網站。
5. 在 GitHub Releases 檢查草稿的版本、來源 commit、筆記與既有發布／支援證據；明確取得使用者對該版本的發布核准後，由維護者按 Publish release。發布前仍遵守下方來源、授權、備份及驗收要求。草稿尚未發布時先完成或處理該草稿，再準備下一版，避免未建立 tag 的版本被誤認為未發行。必要下載包沿本文件另行核對與授權，不由本 workflow 夾帶。

repository 須允許 **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**，否則準備版本 PR 會失敗；維護者確認政策後自行啟用。本次只提供可審查設定，不修改帳戶／repository 權限、不新增 secrets。工作只在本 repo 的 main 執行，僅該工作持有 contents／pull-requests／issues 寫入權限供官方 action 建 PR／草稿及標籤；Harness CI 維持 contents 唯讀。正式遠端工作與首次草稿尚未實跑，不以本機設定檢查當成已可公開發行。

官方契約：[release-please Action](https://github.com/googleapis/release-please-action)、[manifest、草稿與版本設定](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)、[內建 token 的事件限制](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication)。自動產生的內容只是審閱起點，不能代替使用者可讀的筆記或真人／真機驗收。

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

隨包指南、證據與根目錄授權文件的相對連結都必須指向隨包檔案。技術索引、原始碼與需要完整來源庫的手機測試清單改以固定版本 GitHub 連結提供，標示「需連網」；離線可讀操作／恢復指南與匿名支援證據，完整開發文件仍須連網或另取得來源庫。這不新增手機支援或發布驗收結果。

封裝與 `check:package` 另直接核對包內所有 Markdown（含 `dist/web` 授權副本）的既有 inline 本機連結，不能只看 repo 原檔或 checksum。授權副本的相對路徑在建置時回到同一下載包根目錄；根授權文件不改，SW manifest 核對的是實際副本 bytes。仍不新增授權 HTTP 路由、打包檔案或任意 Markdown 語法支援。

最外層 `.tar.gz` 與 `.tar.gz.sha256` 也必須是不存在的路徑或獨立的一般檔案；工具在任何打包寫入前同時檢查兩者，拒絕符號／硬連結、懸空連結及目錄，保留異常路徑供人工確認。請在專用來源資料夾建包，避免其他本機工作同時改動輸出；這不是對本機其他程式的安全隔離。

隨包主機在每次 GET／HEAD 前也檢查包根目錄、`dist/web` 與實際白名單檔案，拒絕符號／硬連結、非一般檔案及缺檔並回 404；啟動後誤換連結同樣拒絕。這補上打包檢查之後的讀檔邊界，不會自動刪除或修復異常檔案。請保留專用且可信任的本機資料夾；預檢不保證抵禦另一個本機程式在檢查與讀取之間同時競態換檔，也不替代下載來源與校驗核對。

CI 沿用完整 check，另執行相同 package／check:package。只建立及檢查產物，沒有 upload-artifact、部署 token 或付費服務。版本整理另由上節手動流程負責，只準備 PR／草稿。CI 成功不是發布或產品驗收。

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
