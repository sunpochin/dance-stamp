<!-- 檔案用途：記錄既有 HTTPS 預覽的來源、標頭與離線清單核對。所在層：#15 發行前託管證據。主要關聯：RELEASE.md、WEB_PREVIEW.md、scripts/web-assets.ts。 -->
# #15 既有 HTTPS 預覽的靜態來源核對

## 怎麼用、為什麼有效

從對應 PR 的預覽留言選取與提交相符的固定測試網址。這次像把收到的每一頁說明書與原稿逐張對照：確認預覽站送來的程式、授權與找人模型都和指定來源相同，瀏覽器也收到原本設計的限制。

不同預覽網址各有自己的瀏覽器資料。換到另一個網址時，原網址的筆記不會自動跟過去；需要搬移時，使用既有備份與影片重新連結流程。這份核對只補靜態託管證據；完整練習、恢復、真人與真機驗收仍各自記錄。

## 受測來源

- 2026-11-02（Asia/Taipei），使用 GitHub 對 [PR #202](https://github.com/sunpochin/dance-stamp/pull/202) head `22fa0d4ea3b659eb2a4b7465973aa9035de17aea` 回報的固定預覽；靜態版本 `80faff7573fa1d79`。
- 十四份產品 JS 與 main `7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca` 相同。一般 JS 直接比 Git bytes；SW 另核對 Git 來源套入本次版本與 manifest 後的完整 bytes。
- 比對同次建置的 `dist/web`；HTML、CSS、LICENSE 與授權副本的連結轉換也核對來源。只下載公開白名單，不讀取或傳送私人影片、筆記及憑證。
- 全程使用既有預覽，只送 GET／HEAD。連線使用預設 HTTPS 憑證驗證，不跟隨轉址；沒有啟動部署、登入或變更服務設定。

## 實際結果

| 檢查 | 本輪結果 |
| --- | --- |
| 公開資源 | 24 檔，GET／HEAD 共 48 次皆 200，回應網址相同 |
| 完整內容 | 24 份 GET 內容與指定建置逐 byte 相同；HEAD 全部無 body |
| 產品來源 | 十四份 JS 均符合指定 Git 來源與 SW 建置轉換，亦與上述 main 相同 |
| 離線清單 | SW 內 23 個快取目標全部與實際下載 SHA-256 相同；SW 自己另作完整比對 |
| 回應政策 | 48 次回應的 CSP、Permissions-Policy、nosniff 與 no-store 均與共用建置政策相同 |
| 載入類型 | 17 份 JS、兩份 WASM，以及 HTML／CSS 類型符合檢查；模型沒有 Content-Type，完整 bytes 與指紋相符 |

MIME 的通過範圍限表列 JS／WASM／HTML／CSS；上述靜態輪沒有測實際人物分析，後續 Chrome 流程另記於下節。原始回應、每檔收據、完整指紋與來源比對只留本機忽略目錄。沒有把取得網頁、manifest 相符或建置成功當成完整 P0、實際離線重開、成檔品質或永久保存的驗收。

這份匿名文件列入 `scripts/package-web.ts` 既有 `packageInputs` 白名單，隨包的發行指南在離線時也能開啟這個連結。首次檢查確實抓到缺檔，原失敗保留；只明列這份文件，不遞迴收錄原始回應或 QA 工具，Web 公開路由維持原樣。

## 同日續驗：託管站實際找人及兩份原下載

這次真的請預覽站在合成影片裡找人、做成並排和疊影影片，再把下載檔帶離網站播放。像把作業帶回家打開，確認它有畫面和聲音；沒有重新做一份影片來取代原檔。

- 受測為 [PR #204](https://github.com/sunpochin/dance-stamp/pull/204) head `36fbf1ec322b317ff13be58ae253fe937e8c5c3a` 的既有固定預覽，產品靜態仍是 `80faff7573fa1d79`。macOS／Bun 1.4.4／獨立 headless Chrome `156.0.8078.76`，沿原 `tests/browser/person-follow.js` 全部斷言，不改產品、門檻或原合成素材。
- 兩側真正模型分析、滑鼠／鍵盤框選、裁切像素、逐側鏡像、取消／偵測失敗保全、擴大範圍阻擋、換片與窄版檢查完成；0頁面例外。模型實際回應200、完整4,602,795bytes與固定SHA-256相同，沒有Content-Type的原狀保留。74次瀏覽器請求皆同來源GET或本機Blob，沒有影片上傳。
- 原函式完成後，額外回應收集器報 `body: Target page, context or browser has been closed`，因此**原整輪仍標失敗**；沒有重跑產品挑成功。69份已讀回應另有CSS與NOTICE文字轉碼差異；直接HTTP另讀兩檔皆200且逐byte符合建置，差異內容也精確符合寬鬆Windows-1252解碼後再UTF-8編碼。這是取樣差異的對照，未判定原讀取失敗的唯一原因，亦未把瀏覽器文字回應當原始傳輸bytes。
- 產品瀏覽器及已知程序退出後，只接續同兩份真下載：並排772,843bytes／2.986367秒，疊影623,498bytes／3.0047秒。新瀏覽器在導覽前已離線，以原生file播放器兩份均自然ended、error0、dropped0、有音訊與全軌解碼；重播後完整hash不變，播放器已知程序退出且自有nonce釋鎖。原收集器失敗與後續檔案播放通過分開記錄，未覆寫前者。

此處補上Chrome短合成流程及實際成檔證據；不代表完整P0、原生Safari、真人聽感、實體手機、長片、儲存／離線重開或G1–G7已驗收。所有原始收據、素材、截圖與影片仍只留本機。

## 請求標識與舊預覽的觀察

首次使用 Python 預設標識時，既有預覽回傳 HTTP 403／Cloudflare 1010；正常瀏覽器當時可以開啟頁面。依 [Cloudflare 1010 官方說明](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/)，改用明確標示用途的 `DanceStamp-ReadOnly-QA/1.0` 客戶端名稱後可正常讀取。這是誠實標示檢查程式，沒有冒用瀏覽器或變更服務的保護政策。

續驗時，兩個已合併 PR 的既有固定預覽回傳 HTTP 500／「Worker threw exception」，當時仍開啟 PR 的舊預覽可讀取；新版固定預覽完成上述 48 次核對。原 403 與 500 收據均保留。這組對照只證明當時網址的可用狀態，500 的唯一原因未確認，不能當成產品程式失敗的重現。

[Workers 靜態標頭官方說明](https://developers.cloudflare.com/workers/static-assets/headers/)指出，`_headers` 用於靜態資產回應，Worker 程式自行產生的回應須另設標頭。本輪已實測白名單資產的政策；若未來增加 API、SSR 或 Worker handler，須重新核對其回應。

## 保留的發行缺口

正式發行來源與同 origin 的完整盤點、供應商限制／費用重查、版本公告及發布核准仍未由本輪完成。新使用者完整 P0、資料恢復、真人／聽感／讀屏、實體裝置與 G1–G7 保持原驗收狀態；#15 不以這份靜態證據結案。
