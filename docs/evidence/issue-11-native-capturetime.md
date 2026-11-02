<!-- 檔案用途：記錄直接Canvas串流的原生captureTime能力與短成檔工具失敗；所在層：匿名驗收證據；主要關聯：#11、TECHNICAL.md、issue-11-content-pts-bounds.md。 -->
# #11：直接影片可觀測原生 captureTime，逐格成檔配對仍未驗證

## 白話結果與版本

Safari 能替這次兩種合成圖樣提供兩個往前走的原生時間值。這讓後續調查多一個觀察入口；**還不能證明時間值精確屬於讀回的那一格，更不能拿它修正原本聲音早到130ms的影片**。

2026-11-02，從 [PR #208](https://github.com/sunpochin/dance-stamp/pull/208) 精確 head `b06816dda9ed1741f7f12d39cb8751dbe80d78ad` 建專用工作樹與新任務分支；其依賴 [PR #206](https://github.com/sunpochin/dance-stamp/pull/206) head `0ae05d03355d8cddcb5b2bdb61af2976a4e1081a`。兩PR開工時均open／未合併，main參考為 `7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca`。本輪只新增文件及技術索引，不改前兩PR分支；十四份產品JS逐byte等於該main參考，沒有載入產品頁或IDB。

環境：macOS27.2／build26B123，普通原生Safari27.2／binary22625.2.8.11.9，固定Bun1.4.4。全程純合成、沒有相機／麥克風／螢幕擷取或外傳媒體，不是私密模式、實體相機、人工聽感或完整產品驗收。

## 固定來源支持假說，沒有對應安裝中的二進位

唯讀複製的來源固定在 WebKit `49e831c38e05d4099861ea284b017a4a5603ad38`，三份完整檔案bytes／SHA與交接收據相同：

- [CanvasCaptureMediaStreamTrack.cpp 236–259](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/Modules/mediastream/CanvasCaptureMediaStreamTrack.cpp#L236)：另設 `VideoFrameTimeMetadata.captureTime`，隨影格傳出。
- [MediaPlayerPrivateMediaStreamAVFObjC.mm 1266–1285](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/platform/graphics/avfoundation/objc/MediaPlayerPrivateMediaStreamAVFObjC.mm#L1266)：影片路徑保留並回傳該欄位。
- [HTMLVideoElement.cpp 908–958](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/html/HTMLVideoElement.cpp#L908)：經Performance timeOrigin及降低精度後交給rVFC。

這與原Worker經presentationTime產生 `VideoFrame.timestamp=0` 的路徑不同，只支持另一路徑值得驗。尚未建立上述upstream與本機Safari二進位的版本對應。[rVFC規格](https://wicg.github.io/video-rvfc/#dom-videoframecallbackmetadata-capturetime)將captureTime列為選用欄位，建議在WebRTC／getUserMedia使用；不能由API存在推成所有Canvas串流皆保證支援。

## 一次兩圖樣能力檢查

測試前凍結：一次2秒目標、第一種實際內容2秒期限、總4秒期限；任何原生captureTime缺欄、非有限、0或不遞增就保存失敗停止。單一64×64 `canvas.captureStream(0)`，原生requestFrame，原始stream直接設為 `video.srcObject`；沒有Worker、編碼或替代API。

圖樣為黑白左右分半、再黑白上下分半。保持第一種直到rVFC內真正 `drawImage(video)` 像素辨認成功，且至少經過1秒才換第二種。保留每次繪圖／request前後、Performance timeOrigin、回呼now、所有原生metadata欄位與完整RGBA。獨立核對器另逐像素重讀兩張完整圖，不把request序號當身分。

| 實際讀回圖樣 | 繪圖命令前／後ms | 原生captureTime ms | 原生回呼now ms | 原生presentedFrames |
| --- | --- | --- | --- | --- |
| 左黑右白 | 5111／5114 | 5153 | 5159 | 1 |
| 上黑下白 | 6123／6123 | 6125 | 6139 | 2 |

首次結果：2019ms結束，118次request、2次rVFC，兩圖樣完整像素相符，captureTime原生own property皆存在且遞增。原始metadata鍵為captureTime、expectedDisplayTime、height、mediaTime、presentationTime、presentedFrames、width；兩次mediaTime皆0，expectedDisplayTime／presentationTime恰與captureTime同值，但程式沒有複製或補填任何欄位。沒有receiveTime／processingDuration／rtpTimestamp，缺欄保持缺欄。

像素讀回區間分別3／1ms，整個回呼程式區間7／4ms；保存開銷也可能影響排程。118次request不能換算為116個漏格，兩種內容各保持一段時間，回呼數與request數本來就不是同一量。原始收據51,383bytes，SHA `cda279061c5111f32045c3536b3303b88e76dc34eb468c5fbc7792be8062ce0d`；獨立核對器通過。

這僅是本次能力觀察。原Worker兩格0／0 gate未改、未重跑，亦未被此路徑取代。

## 條件允許的短成檔：首次工具失敗，沒有成片或配對結果

能力通過後只嘗試一次約3秒的同stream扇出原型，沿用#208的640×240 magic／唯一序號／反碼／CRC、660Hz合成提示音及受控同工作連畫；沒有重錄正負控制或更改其100ms／250ms護欄。原#208的53檔／4,365,327bytes與manifest `276372cbcc0ca91fcc9e314b8f6d0690349463c6b7eceaca6d5dfff6cf45886b` 先全數核對、唯讀複製。

Safari自有頁的原生Console實際回報：`InvalidStateError: cannot call stop without calling start first.`，指向原型finally內對未啟動音源的stop。該收尾在停止tracks／關閉AudioContext／保存結果之前就拋錯，遮蔽了先前錯誤；**沒有取得先前例外，不能追認它必然是play超時，也不能說是Safari產品能力失敗**。

靜態檢查另發現原型先await `video.play()`，之後才安排requestFrame迴圈的順序風險；這是工具缺陷分析，不是已保存的原生事件原因。未得到錄影結果收據、媒體收據或真正Save As下載，故沒有可解碼影格／封包PTS／兩支路缺碼、重複、倒序及配對表。本輪未補值、未重試、未改API繞路；沒有以#208舊成片頂替這次失敗。

## 無法由本輪推出的結論與收尾

[processNewVideoFrame 291–310](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/platform/graphics/avfoundation/objc/MediaPlayerPrivateMediaStreamAVFObjC.mm#L291)跨執行緒先改currentVideoFrame，再由deferred task帶metadata讀回；不同更新可能合併。rVFC也可能跳格。即使原生值非零且與當下像素同次回呼觀察，仍不足以證明二者原子綁定或逐格一一對應。

Performance精度降低，未校準嚴格時鐘誤差上界；不擅加1ms當物理誤差。繪圖命令前後、rVFC呈現時間都不是GPU真正paint完成時間。不能計算精確capture origin、排隊延遲、音訊唯一根因或原產品應補多少延遲；短交集不能外推原60秒失敗。

能力頁收據明確記video track ended、rVFC取消、video脫離stream、硬體呼叫0。短成檔失敗在finally先取消rVFC及脫離video，再於音源stop拋錯；其逐track ended／AudioContext closed收據未取得，不能寫成明確觀察通過。之後關閉整個自有頁與檢查器，保留原Safari視窗；自有主機正常退出、已知PID消失、原埠拒連、核對nonce釋放自己的共用鎖。未關閉他人頁面或殺程序。

初次誤用Bun1.4.4的 `--check` 進行未加型別的ignored QA檢查，得到型別錯誤；改以Node模組語法檢查及Bun.Transpiler解析，未執行瀏覽器重試或改產品檢查。本輪原始工具／能力收據／首次失敗記錄／來源及舊原型副本已獨立封存並逐檔重讀：79檔／4,687,834bytes，manifest SHA `e00617d3bd51d529dab4921e3bb8480f6c278b36c58853a5887019cc71f57c0c`。原始像素、舊影片、本機網址與視窗識別不公開。

固定Bun1.4.4執行既有 `bun run check`：704 pass／0 fail／3,804 expects，51來源指紋、公開掃描、型別、lint與建置通過，19項既有lint info保留；正常提交hook另對最終文件執行同一檢查。這是工程檢查，不代替原生品質或指定終審。

原130ms失敗、案例08–20、完整20組／十輪、實體相機／裝置、人工聽感、完整G1–G7及Claude Code／使用者指定審查仍未完成；iPhone延後。沒有產品修正、新媒體架構、合併main、正式發布或關閉#11。
