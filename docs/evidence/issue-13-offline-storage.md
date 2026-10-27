<!-- 檔案用途：綁定桌面離線、容量、更新等待與個別刪除證據。所在層：Web PWA／資料驗收。主要關聯：TECHNICAL.md 第 19 節、MEDIA_PROBE.md。 -->
# #13 Web 離線、容量與更新安全

2026-10-28 Asia/Taipei。main `1d8ed7f`＋#37 `9165204`，分支 `codex/issue-13-offline-safety`；精確提交由交付 PR 綁定。macOS 27.0.1、Chrome 156、Bun 1.4.4；只用合成影片、隔離瀏覽器與本機主機，沒有上傳、清除使用者儲存或發布。

## 受測範圍

受測靜態內容 `0f75e031af971bc4`。Bun 1.4.4 原有完整檢查為 340 tests／589 expects／0 fail，TypeScript checkJs、SW 型別、Biome 與建置通過；公開內容掃描 152 個追蹤檔案及 harness 通過，完整 diff 已檢查，原始 hooks 於提交時再次執行。下列證據只限本版本桌面範圍。

- offline-storage：先在線備妥，再真正將 browser context 斷網並重開受 SW 控制的頁面；筆記、兩份明確保存的原片可取回，斷網仍能輸出單一 VS。未點按不呼叫 persist；模擬允許／拒絕／例外如實呈現。實際 media put 的 quota／原生 abort／按停止取消均保留舊副本及 metadata。估計只顯示 API 回傳數值。直接移除隔離 cache 中的 timeline.js 後顯示不完整，連線後核對雜湊才能補回；私人資料未變。沒有 cache 的全新 context 首次離線開站失敗，沒有冒稱支援。
- offline-ready＋原有 capture-comparison：真正斷網後，沿用未放寬的原有函式完成原生 MediaRecorder 合成相機錄影、VS、切換外部雙片再次匯出及重開錄影。相機僅明確操作時請求、不開麥克風、單一共用 AudioContext、tracks 全部釋放、原片／筆記／舊 VS 保留，無外部請求。這次有離線版本的實際下載，不借用在線結果。
- offline-update：先把測試主機切回基線，再建立全新隔離 context，避免上輪 worker 汙染。錯誤雜湊的候選原生 install 失敗，舊 controller 保留且未完成 cache 清掉；錄影與匯出進行中分別安裝新 worker，實際進 waiting、原頁 sentinel／controller 均不變，工作完成。所有舊分頁關閉後才 activate，schema 1 資料與錄影配對仍可重開；只清理本產品舊公開 cache，另一份合成 unrelated cache 保留。候選使用同一份 app manifest、不同 worker 身分，測生命週期與資源拒絕，不冒稱已驗證任意未來功能／migration。
- deletion：預覽不寫入，預設取消焦點、Escape、Tab 與 390×844 無水平溢出；只刪副本時保留當次播放與關聯，重開誠實缺片。真實另一分頁持有 take 鎖、預覽後另一頁更新 revision 時均拒絕刪除；原生 transaction abort 與取消全數回滾。單獨刪 VS 不刪 take；先刪共用原片的一份 take 仍保留副本，最後一份刪除才在同一交易清理 cameraAssetId 的 chunks。整份筆記無孤兒，重開仍一致；刪除等待缺片重連的練習後可重新選片建立新配對。

最終四支新增函式及原有 24 支，共 28 組瀏覽器函式通過：offline-storage、deletion、offline-ready、offline-update，以及 capture-comparison、backup-conflicts、backup-recovery、backup-keyboard、existing-comparison、comparison-recovery、comparison-capture-fallback、comparison-appearance、comparison-save-failure、media-probe、media-persistence、self-failure、review-recovery、workspace、storage、relink、edges、player、markers、practice、practice-fallback、capture、existing-no-camera、comparison-keyboard。沒有重跑三速度／長片完整 G2–G7 矩陣。兩張本機離線／刪除窄版截圖已人工檢視；媒體與截圖都留 ignored output。

## 獨立成檔與播放

以下均為本版本真正下載檔，1280×720 H.264／48kHz AAC。FFmpeg 全片解碼均 exit 0、stderr 空；產品外 Chrome 原生 file 播放器皆完整到 ended、error=0、dropped=0，實際有音訊解碼。

| 案例 | bytes | 長度（秒） | 原生影格／音訊解碼 bytes |
| --- | ---: | ---: | ---: |
| 離線既有雙片 | 141361 | 5.000700 | 154／21615 |
| 離線錄影 VS | 2044753 | 14.968367 | 449／22323 |
| 等待新版時錄影 VS | 2038440 | 15.001100 | 454／20832 |

SHA256 依上表順序：`79bece9f4eff0125aba4f73fdc3f136c498fdc219f9213ee235618f5e69777d4`、`04fb6235b4d0846ac5a435f70a3182753200a7c0cdc75fb7267cfd0fddb7c038`、`eeb7386c8958194e079ce38f07ed8108faca9985bea99e06188c65f365728593`。此處證明離線／更新保護後仍能真正成檔與重播，不以 metadata、下載按鈕或 JS drift 代替 G2–G7。

## 限制

Browser context 斷網是桌面軟體證據，不是實體手機飛航模式；fake camera 不是真實硬體。persist 允許／拒絕／例外由隔離測試注入，驗證結果呈現及資料保護，不冒稱瀏覽器已永久允許。容量只代表估計，手動清除仍會遺失資料。沒有首次離線開站、永久離線、Safari／手機、完整 G2–G7 或 5 人易用性證據。iPhone 依使用者要求暫緩；人工審查、合併與發布分開，均未完成。
