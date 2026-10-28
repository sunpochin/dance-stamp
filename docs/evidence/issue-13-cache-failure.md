<!-- 檔案用途：綁定快取損壞／quota 降級修正與驗證範圍。所在層：#13 儲存驗收。主要關聯：sw.js、offline-cache-failure.js、TECHNICAL.md 第 19 節。 -->
# #13 快取故障時保留在線使用

2026-10-28 Asia/Taipei。從 main `d2f126c239a306af603876eb48d78c559a4f86f7` 建立 `fix/issue-13-cache-quota`；精確交付提交由 PR 綁定。產品靜態內容 `be43a7f4b2571f21`，macOS 27.0.1／Chrome 156.0.8078.49 headless／Playwright CLI 0.1.22。完整品質入口使用鎖定的 Bun 1.4.4；最初環境的 1.4.2 被版本檢查拒絕後，改用已有的正確版本，沒有弱化門檻。僅專用本機 port 與隔離瀏覽器；不使用相機、私人媒體、外部服務或真實磁碟壓力。

## 重現與修正

舊版先由 `offlineCache.test.ts` 重現 Cache.put、CacheStorage.open、Cache.match 失敗時三案失敗，其餘三案通過。真正瀏覽器將本 context 的 timeline.js cache 替換為合成損壞 bytes，再在 active worker 注入 put 的 QuotaExceededError；在線 fetch 實際得到 `TypeError: Failed to fetch`。網路已回傳正確版本，卻因無法補存而無法提供給頁面。

修正僅限 SW fetch：快取無法讀取時改取網路，仍先核對本 worker manifest 的完整 SHA256；補存失敗不阻擋正確在線回應。離線檢查照常檢查實際 cache，不因本次在線成功而宣告完整。安裝候選的整批成功門檻、waiting／activate、IndexedDB、schema 與刪除流程均沿用。

## 針對性驗證

- 六項單元回歸通過：三種 Cache API 失敗仍提供符合雜湊的在線資源並顯示不完整；不符雜湊仍回 503、不寫入；完整副本可斷網讀取，損壞副本斷網拒絕，實際修復才變完整；install 遭 quota 仍拒絕並只清理候選 cache。
- 真正 SW 的 `offline-cache-failure.js` 通過。三種故障均讀回與基準完全相同的 timeline.js，重新載入整個工作台成功且顯示離線不完整。合成影片描述、標記、全庫 revision 與 sentinel Blob bytes 在每次重開後完全相同；該 Blob 只是資料保留檢查，不是可播放影片證據。
- 解除故障並實際補存後，離線檢查才回完整；真正設定 browser context offline，再次重開工作台成功、合成資料不變。測試的 context 在 finally 關閉，不改動其他 profile 或整台電腦網路。
- 原品質入口與提交 hooks 通過：348 tests／624 expects／0 fail、TypeScript／SW checkJs、Biome（既有 12 項 info）、公開掃描 164 檔與 build。新瀏覽器腳本通過語法檢查，完整 diff 經人工檢視；這是本次自我檢查，不代替獨立審查。

## 證據歸屬與限制

[#38](https://github.com/sunpochin/dance-stamp/pull/38) 的離線／交易／多分頁／刪除及 [#44](https://github.com/sunpochin/dance-stamp/pull/44) 的 20／100／200 MiB 跨重啟／完整下載雜湊證據都已合併；它們仍綁各自原版本，本次未重跑完整媒體矩陣。快取例外由隔離測試注入，不宣稱真正低空間、自動回收或硬體已驗收。

本輪沒有填滿磁碟、系統飛航、真人相機、Safari／iPhone 或發布驗收。iPhone 暫緩；Claude Code 或使用者最終審查、實體裝置及完整支援範圍仍待完成。#13 保持開啟；新 PR 不合併、不部署。
