<!-- 檔案用途：綁定 Web 可及性、版面、隱私及人工觀察準備的證據。所在層：#14 工程驗收。主要關聯：WEB_USABILITY_CHECK.md、TECHNICAL.md 第 20 節。 -->
# #14 Web 可及性候選

2026-10-28 Asia/Taipei。main `e9e154a`（已含前置 PR 的審查修正），分支 `codex/issue-14-web-accessibility`；精確提交由交付 PR 綁定。macOS 27.0.1、Chrome 156、Bun 1.4.4，只用合成素材、隔離瀏覽器與本機主機。沒有招募／聯絡受測者或上傳媒體；本票未合併至 main 或發布。

## 範圍與已重現問題

基線 `0f75e031af971bc4`：鍵盤保存示範副本後 activeElement 為 BODY；編輯既有標記也在停用 fieldset 中 focus 失效。667×320 長狀態的 sticky 列高 196.156px，已聚焦控制在 136.320–183.914px，整顆被列蓋住。320px／放大文字另發現原生還原欄固有寬度與長版本碼撐出頁面。

修正以原生焦點、DOM action key、scroll padding、可捲動完整狀態、依字體換欄及檔案欄縮排處理；未以剪掉文字／頁面 overflow 掩蓋，不改媒體時間、音訊或編碼。診斷只記錯誤分類，原生錯誤訊息不進診斷。沒有新增依賴。

## 本版本結果

最終受測靜態內容 `0382343a0a0f73ff`，已整合 main `e9e154a`，保留循環重新定位、中斷原片 session-only 與可選備份配方副本的前置審查修正。Bun 1.4.4 原有完整檢查為 342 tests／599 expects／0 fail，TypeScript checkJs、SW 型別、Biome 與 build 通過；公開掃描 161 檔及 diff 檢查通過，原始 hooks 提交時再次執行。

前一輪 `47eb899dd15552b9`（main `80604e7`）完整 33 組 browser 函式通過，含原有 120 次循環、零 seek 重疊及新 A/B 重定位回歸。`media-persistence` 初次因前置錄影放在另一個隔離 context 而停止；按原需求與 `media-probe`／`self-failure` 共用同一 context 重跑通過，未修改產品或放寬斷言。下列最終版 18 組補驗與四份成檔另綁新版，不把前一輪結果搬成新版全套通過。

三支新增函式分別驗證鍵盤焦點、版面及媒體／隱私。五組 viewport（320×568、390×844、667×320、844×390、1280×960）各測根文字 100%／200%，共十組；實際 document clientWidth 無水平溢出、作者提供的主要控制有效可點範圍至少 44×44、停止鍵可見，透過原生 Tab 收到的控制完全位於停止列下及 viewport 內。這是 CSS viewport／文字尺寸測試，不是手機旋轉、瀏覽器所有 zoom 模式或實體觸控。

## 鍵盤、可讀狀態與回歸

accessibility-focus 核對跳到內容、選片、靜態及重繪控制的焦點、原生 modal 返回、quota 失敗後焦點仍在、使用者移到停止鍵時不搶走；真正送出 M／L／空白按鍵，筆記輸入不觸發播放。accessibility-layout 以原生 Tab 移焦與 End 捲讀，等實際 scrollTop 變化；不以捲動指令或放寬溢出門檻換取通過。七種常用文字實際前景／背景對比為 9.345–12.726:1；不代表全 WCAG 稽核。原生播放器內建控制由瀏覽器提供，未宣稱已量測其全部觸控尺寸。

accessibility-media 用真正 Chrome AX tree 核對老師、自己、即時取景、輸出及進度名稱。全程僅七次主要狀態更新：三次倒數、錄影中、自拍完成、合成中、成檔；polite／atomic 狀態位於 busy 控制區外，不逐影格洗版。合成權限拒絕後明確重試、無麥克風、所有 tracks ended、preview 清除；合成敏感檔名／label／deviceId／groupId 不在診斷或 v1 JSON，產品頁無對外請求，下載建議名不含原檔名。這是樹結構及軟體證據，不是讀屏或聲音實聽。

最終版本補跑 18 組受影響 browser 函式：三支 accessibility、take-open-failure、interrupted-session、backup-recipe-copies、三支 backup、offline-storage、deletion、offline-ready＋capture-comparison、media-probe＋media-persistence＋self-failure、capture、offline-update。包含前置壞檔／取消不改舊校正與下載、中斷原片重連不自動存片、明確保存及不重寫 Blob、每份備份校正都能獨立開啟／重匯／匯出，以及交易／quota／多分頁、恢復、離線錄影及更新等待。兩張本版窄版／橫向截圖已人工檢視，沒有提交媒體或截圖。

## 獨立成檔

四份本版本真正下載的 VS 均 1280×720 H.264／48kHz AAC，來源顯示時間嚴格遞增。沿用既有分析器的 1:90000 高精度與 fps_mode passthrough 完整解碼，不補／丟影格或改寫原檔；逐份 FFmpeg exit 0、stderr 空，解出影格數與原始 ffprobe 一致。先前檢查工具的粗時間基準曾對 VFR 取整，不能把該警告或補丟幀結果當來源時間證據。

| 案例 | bytes | 秒 | 原始／解出影格 |
| --- | ---: | ---: | ---: |
| 可及性／權限恢復後錄影 | 2097280 | 15.000733 | 451／451 |
| 離線既有雙片 | 142155 | 5.013800 | 151／151 |
| 離線錄影 | 2083019 | 15.000467 | 450／450 |
| 等待新版時錄影 | 2044468 | 15.001967 | 450／450 |

SHA256 依上表順序：`ddd231bd888d57bc03f1295462220170be9c5548ee7da07519ee19da0e80bf6f`、`f85e75087676a30e57493942a90ed99c95697a6678812fb17a44b55177499182`、`a162c8ec8226d7a5117e679882dfd146b7222338c69181825d40bf5348d2e661`、`b68830a9d60fa3d296f5025177ac4449e976e82979b6607584844845435f5083`。四份都在產品外 Chrome 原生 file 播放器完整到 ended、error=0、dropped=0；依表順序，實際音訊解碼 bytes 為 23615／21615／21358／20832。原生播放計數含播放器自身行為，不冒充原始影格數。不宣告本 head 的三速度／長片完整 G2–G7。

## 未完成與限制

[五人觀察操作單](../WEB_USABILITY_CHECK.md)與五列匿名空表已備妥，沒有任何人已招募／測試，不預填通過。對齊 #1 三項核心任務，需同一批五人中至少四人各自三項都獨立完成；有提示不算成功。

CDP 可及性樹、ARIA 與鍵盤不能代替 VoiceOver／讀屏實聽。原生捲動只驗本次 Chrome，不宣稱 Safari 等其他瀏覽器通過。實體手機／safe area／觸控、真實相機、喇叭／藍牙、背景／鎖屏／來電、記憶體／熱／電池及全 G1–G7 未完成。iPhone 依使用者要求暫緩，#14／#1 不關閉；人工審查與發布分開。
