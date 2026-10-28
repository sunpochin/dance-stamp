<!-- 檔案用途：記錄大檔副本的跨瀏覽器重啟、離線與大小上限證據。所在層：儲存驗收。主要關聯：ACCEPTANCE.md、storage-size.js、MEDIA_PROBE.md。 -->
# #13 大檔保存與重開矩陣

2026-10-28，Asia/Taipei。來源 main `e9e154a6931f9efeb0e349096515f834774fe868`，產品靜態 `2f1ec6b3335cd790`；本票只新增 QA／文件，精確交付 head 由 PR 綁定。macOS 27.0.1／Chrome 156.0.8078.49／Playwright CLI 0.1.22／Bun 1.4.4。headless Chrome、專用持久 profile；只有合成媒體，沒有相機、麥克風、真人影片、上傳、重置資料庫或發布。

## 測片及涵蓋範圍

用既有 65 秒 640×360 H.264／AAC 合成時間碼與提示音來源，在檔尾加 free atom，得到 20／100／200 MiB 及 200 MiB＋1 byte。四檔由 FFmpeg 全片解碼無錯誤，時長均 65 秒，所有媒體 packet hash 與來源相同。精確 bytes 用於保存上限，不虛報 File.size，也不以壞檔代替超限案例；[free／skip 是未使用空間](https://developer.apple.com/documentation/quicktime-file-format/skip_atom)，故不宣稱測到 200 MiB 高碼率或長片解碼壓力。

工具每次建立新目錄，檔案以 exclusive create 寫入；第二輪產物與第一輪四個完整 SHA256 一致，舊目錄不覆寫。完整本機路徑／profile／原片均只留 ignored output。

## 實際操作與結果

1. 全新 profile 內，由產品選取每個大小的老師／自己雙片；選片不自動保存 Blob。各自按明確保存副本，六份（合計 640 MiB）metadata 與完整 Blob bytes／SHA256 符合輸入，asset 均 ready。
2. 200 MiB＋1 byte 雙片仍能當次比較播放；兩個保存按鈕皆提示 200 MiB 限制。每次拒絕前後的全庫 metadata 相同，沒有任一側的半份 Blob；已存副本及標記／配方不變。
3. prepare 完成後完整關閉專用瀏覽器，確認舊程序消失。把本輪四份合成來源暫時移到同目錄的 withheld 子目錄，原輸入路徑均不存在；以同一 profile 啟動新的瀏覽器程序。沒有重選原檔、清庫或從 JSON 重建資料。
4. 重啟後全庫 metadata 與 prepare 完成時相同；真正將 browser context 斷網、重新載入受 SW 控制的工作台。三組保存雙片各自開啟、解碼及播放，完整 Blob 雜湊不變。超限未保存的筆記顯示尚未連結，兩側 Blob 皆不存在，沒有冒充離線可用。
5. 透過產品下載六份原片，再從磁碟核對完整 bytes／SHA256，均與各輸入相同。六份下載由 FFmpeg 全片解碼 exit=0、stderr 空；200 MiB 老師原片另由 file URL 原生播放器在產品外播至 ended=65 秒，error=0、1954 frames、dropped=0、audioBytes=110668。沒有把 Blob preview 當作下載成功。
6. 測試瀏覽器關閉後，四份合成原檔已還原到原路徑，完整雜湊仍相同。測試沒有修改或移動其他媒體。

| 單檔大小 | 每側 bytes | 保存副本數 | 跨重啟／離線／實際下載 | 每側完整檔 SHA256 前 16 字元 |
| --- | ---: | ---: | --- | --- |
| 20 MiB | 20971520 | 2 | 通過 | d75c042b832944e43 |
| 100 MiB | 104857600 | 2 | 通過 | 4beb8e6bffc6233b9 |
| 200 MiB | 209715200 | 2 | 通過 | 2a2e828e1812a6d4 |
| 200 MiB＋1 byte | 209715201 | 0 | 正確拒絕保存；當次播放可用 | 不以拒絕當成已保存 |

原始測試本輪留 `output/storage-size-*` 的 manifest、prepare／verify 結果、fixture-validation、restart-check 與下載檔。瀏覽器已關閉，來源暫移／還原及原、新程序退出均有本機紀錄；不把單頁 reload 算重啟。

## 限制

這是受測 Chrome 的 API 邏輯大小與資料完整性矩陣，未量測檔案系統實體佔用、熱／電池／壓力；稀疏填充與相同媒體內容不能外推為高解析、高碼率、HDR／HEVC、長片或所有裝置可用。沒有跑填滿磁碟、強制斷電、瀏覽器自動回收／清除或首次離線開站。browser context 斷網不等於實體飛航模式。

來源聲音的 bytes 解碼不代表實聽或音訊路由驗收。原有 quota／交易失敗／更新安全證據見 [前版 #13](issue-13-offline-storage.md)，本輪未變更產品或 v1 格式，也不把不同版本數據併成完整 P0。Safari、裝置、真人五人與人工審查仍待驗，iPhone 暫緩；#13／#1 不因本矩陣自動結案。
