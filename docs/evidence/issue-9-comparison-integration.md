<!-- 檔案用途：綁定錄影與既有雙片整合後的桌面證據。所在層：Web 媒體驗收。主要關聯：TECHNICAL.md、MEDIA_PROBE.md、capture-comparison.js。 -->
# #9 錄影與既有雙片整合

2026-10-28 Asia/Taipei，macOS 27.0.1、Chrome 156、Bun 1.4.4、FFmpeg 8.1.2。來源為 main `1d8ed7f`、#33 `f77a8bf`、#35 `9935b06`；整合分支 `codex/issue-9-comparison-integration`，精確提交由交付 PR 綁定。只用本機合成影片／假相機，沒有真人、私人影片或第三方音樂。原型分支 `codex/issue-10-existing-comparison` 的 `7e74663` 保留但不納入正式 UI，其 `f17c862b53d99e9a` 量測不作本版本證據。

## 整合與回歸

受測靜態內容 `0daa65c36a468383`。完整原有檢查為 323 tests／0 fail／479 expects，公開掃描、checkJs、Biome 與 build 通過；沒有弱化 hook。#9、#35 既有的 18 組瀏覽器函式通過：media-probe、media-persistence、self-failure、review-recovery、workspace、storage、relink、edges、player、markers、practice、practice-fallback、capture、existing-comparison、comparison-recovery、comparison-capture-fallback、comparison-appearance、comparison-save-failure。

- 錄影失敗／拒絕／忙碌／後鏡頭缺少、倒數取消不換掉舊自拍，所有相機 tracks 釋放。合成 ended／mute／尺寸改變／旋轉／freeze／visibility 中斷仍標 interrupted；這些注入事件不冒充真正硬體／背景驗收。
- chunks 缺號／重複／壞檔保留，完整片段解碼及原子保存後才清；quota 仍能下載原片。外部原片預設 session-only，備份在全新 context 還原，缺任一側須手動預覽確認；media quota 及真實雙分頁 revision 衝突保留原資料。
- #9 的原測試以外部檔當「已保存舊片」時曾因新語意取不到 Blob。修正測試為明確點保存副本再建立基準，不改回自動保存、不跳過保護檢查。設定保存改走佇列後，回歸另等 aria-busy 結束再核對 revision。
- 120 次循環最大顯示越界 83.333ms，停止後 callbacks=0，同時最多 1，原生 seek 無重疊；RAF 備援 20 次最大 32.597ms。真正 hidden gate 仍未驗證。
- 四種獨立鏡像、contain 及文字方向、390×844 無水平溢出、缺少 requestFrame 的備援與串流／callback 清理通過。相機／喇叭、Safari 與手機不由上述結果推論。

新增 `capture-comparison.js` 同一頁完成合成相機 15 秒 → 單一 VS → 換成既有雙片（老師 12／自己 4 秒）→ 再輸出 → 重開原錄影，全部通過。僅明確開相機時呼叫一次 getUserMedia，audio=false；一個共用 AudioContext 閒置 suspend、全部 tracks ended；沒有非同源或非 GET／HEAD 請求。原錄影／原片／標記／舊 VS 完整保留，外部 take 無假的 captureTiming。兩個實際下載均已獨立完整解碼及在產品外完整重播，容器為 1280×720 H.264／48kHz AAC，時長分別 14.967300／4.979300 秒；SHA256 前 16 字元為 c6010b6e4feae680／47a5a440047aefc3。

## 成檔與真正離頁

本版本的 `comparison-matrix.js` 20 個案例全部完成：九種比例／時長、同組合十次 60 秒、無音軌及雙鏡像。十次 60 秒的完整匯出（按鈕到保存完成）為 60,052–60,086ms；所有 60 秒容器時長 59.981567–60.049167 秒。沒有使用原 #35 的舊矩陣代用。

20 檔加完全沒有相機 API 的 5 秒檔，共 21 檔，均獨立完整解碼：單一 1280×720 H.264 與單一 48kHz AAC，無解碼 stderr。影格時間嚴格遞增、所有像素影格讀完；最低平均約 30.00fps，最長重複畫面 133.77ms。原有起中末中位數誤差／漂移與新增的真正首末幀／第 1／中間／末前 1 秒誤差，最大均為 66.667ms，符合原 100ms／24fps／250ms 門檻。第一幀另核對老師 A=12 秒，排除兩側同時黑畫面或起錯點。

| 60 秒代表檔 r | 真首幀誤差 ms | 第 1 秒 | 第 30 秒 | 第 59 秒 | 真末幀 | 首末新增漂移 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 1（連續第 1 次） | 0 | -66.667 | -33.333 | -33.333 | -33.333 | -33.333 |
| 0.75 | 0 | 0 | -44.444 | -44.444 | 0 | 0 |
| 0.5 | 0 | -66.667 | -66.667 | -66.667 | -66.667 | -66.667 |

音訊以老師 660Hz／自己 880Hz 的獨立來源辨識，非靜音案例只有老師聲源；無音軌老師來源的成檔 RMS=0，自己的音軌未混入。這不是喇叭／藍牙或畫面提示音同步證明。上述時間來自解碼影格與實際下載，不以 JS 診斷 drift 代替。

另補兩支回歸：`existing-no-camera.js` 將 navigator.mediaDevices 設為完全不存在，仍從正式入口預覽、一起播放／暫停、12／4 秒校正並真正下載 5 秒單一 VS；沒有假的 captureTiming 或外部寫入。`comparison-keyboard.js` 實測 Enter 啟用入口與移焦、共同播放／暫停、ArrowUp＋Tab 保存 4010ms、Enter 微調回 4000ms；390×844 無水平溢出，停止按鈕與焦點可見。截圖已人工檢視，只留本機。加上同頁整合與完整矩陣，共 22 組瀏覽器函式通過。

真正離頁在來源第 8.208 秒發生 trusted pagehide、persisted=false，當下 tracks 全部釋放；至少兩塊已落盤才由原生導覽離開。回來可取回 174594 bytes／6.726467 秒的 H.264 中斷原片，FFmpeg 全片解碼通過，舊 take／原片不變，恢復片仍 interrupted。這不能保證卸載前尚未落盤的尾幀。

七份代表下載檔均離開產品，以 Chrome 原生 file URL 播放器從頭完整播到 ended、error=0：同頁錄影 VS、同頁外部 VS、無相機 API 的 5 秒 VS、三種比例各 60 秒 VS，以及恢復原片。六份帶聲 VS 均實際解碼到音訊 bytes；相機恢復原片音訊 bytes=0，符合不錄麥克風。三支 60 秒原生播放器 dropped frames 分別為 5／7／0，如實記錄，不宣稱播放零掉幀；編碼 G3 另由上面的獨立逐格分析判定。除 21 檔雙片分析外，另四份錄影／同頁／恢復下載也經 FFmpeg 全片解碼且 stderr 空，共 25 份；沒有只看 metadata 或第一幀。

## 限制

本文件不關閉 #9／#10／#11 或整體 #1。真實相機與 LED、真正背景／鎖屏／來電、實際 BFCache 返回、Safari、裝置保存、熱／電池／記憶體峰值、五位使用者與獨立人工審查仍未完成。iPhone 依使用者要求暫緩，沒有把未測手機判成 Web 失敗。沒有合併或發布。
