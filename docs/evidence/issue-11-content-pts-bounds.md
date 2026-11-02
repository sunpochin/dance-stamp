<!-- 用途：記錄短合成內容碼與成檔PTS的可核對關係及觀測限制。所在層：#11診斷證據。主要關聯：TECHNICAL.md、issue-11-integrated-minute-file-failure.md、RECORD_COMPARE.md。 -->
# #11：短合成內容序號能接回繪圖紀錄，仍不能直接量到擷取時間

## 白話結果與來源

像在每張卡片印上不同號碼，錄完再看影片真的留下哪幾張。這次能找出被合併、沒有進入成片的卡片，也能分辨正常聲畫與故意晚到的聲音；但卡片上的號碼不是相機快門時間。不能據此宣稱找出或修好原來聲音早130ms的原因。

2026-11-02，本輪產品參考固定 main `7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca`；專用工作樹從 [PR #206](https://github.com/sunpochin/dance-stamp/pull/206) 的文件 head `0ae05d03355d8cddcb5b2bdb61af2976a4e1081a` 建立，已核對只有其兩份文件與產品參考不同。**本交付依賴 #206 的原失敗與時間戳缺口記錄**，不覆寫該分支；沒有載入或修改產品、原測試、資料庫或門檻。

環境為 macOS 27.2／build 26B123，原生普通 Safari 27.2／22625.2.8.11.9，Bun 1.4.4、FFmpeg／ffprobe 8.1.2。合成頁獨立640×240畫布、原生 `captureStream(0)`／`requestFrame()`／MediaRecorder VP8，聲畫控制另加單一合成 Opus 音軌。未使用相機、麥克風、螢幕擷取、既有影片、Worker 或 MediaStreamTrackProcessor；硬體呼叫0，原0／0時間戳gate未重跑也未修改。

## 方法與校準界線

依 [Canvas capture 草案](https://w3c.github.io/mediacapture-fromelement/#html-canvas-element-media-capture-extensions)，請求旗標與畫布產生新內容共同決定擷取，不能從呼叫次數推得成檔影格一一對應。[MediaRecorder 的 BlobEvent timecode](https://www.w3.org/TR/2026/WD-mediastream-recording-20260316/#dom-blobevent-timecode)屬於資料塊，不是每張影格的擷取時點。[WebCodecs PTS 定義](https://www.w3.org/TR/2026/WD-webcodecs-20261026/#presentation-timestamp)也不保證與網頁或其他來源共用時間起點。因此原型只測可核對的內容關係，沒有自行指定未知origin。

1. 每次同步繪圖加入四列16位黑白碼：固定magic `A55A`、唯一遞增序號、序號反碼、CRC16-CCITT（初值FFFF、多項式1021，先低位元組）。每格40×32，解碼只取中央8×8，亮度70–185視為模糊並拒絕；反碼／CRC不符亦拒絕，不猜最近序號。純記憶體自查確認正常碼、破壞碼及不相容區間均能分辨。
2. `paintLog` 記每次繪圖的 `performance.now()` 前後值，聲畫案另外記 AudioContext.currentTime 前後值；每次真正繪圖都有新序號。約0.7秒在同一rAF回呼內故意連畫三次，其餘每rAF一次。這是受控合併測試，不稱自然掉格。
3. 先做一次2秒無聲校準，證明內容可配對後才各做一次3秒正／負控制，沒有重錄。三份皆用 Safari 原生「Download Linked File As…」真正儲存；下載bytes／SHA與本機錄影收據完全相同，兩者分開驗證，不把收據POST當下載。
4. 沿既有 [FFmpeg](https://ffmpeg.org/ffmpeg.html)／[ffprobe](https://ffmpeg.org/ffprobe.html)方法完整解碼，不重新編碼成片。灰階raw輸出採 `-copyts`、`-fps_mode passthrough`、`-enc_time_base demux`，同一次解碼的showinfo逐格PTS及Adler32 checksum與raw像素逐一核對；ffprobe frame的PTS／best-effort PTS與封包位置對應的packet PTS再精確核對。不是把第N次request分給第N張解碼圖。
5. 從像素讀回序號，再依值配對paintLog。所有封包DTS＝PTS、視訊has_b_frames＝0、成檔PTS嚴格遞增，內容序號無倒退；僅表示本輪VP8樣本沒有觀測到重新排序，不外推其他編碼器。缺少或重複內容照實列出，不生成缺格。

### 有條件的區間，不是直接captureTime

令第k張內容繪圖前後讀值為 `b[k]`／`e[k]`。在同一紀錄時鐘內，確定內容已完成且尚未開始下一次替換的區間是 `e[k]` 至 `b[k+1]`；保守容納繪圖過程的外框為 `b[k]` 至 `e[k+1]`。最後一張沒有下一次替換，右界開放；`recorder.stop()`呼叫不是替換時點。

對成檔影格i的像素碼k、容器PTS `p[i]`，**只檢查「同速、固定平移」假設**是否相容：

```text
O ∈ intersection_i [ b[k] - p[i], e[k+1] - p[i] ]
```

單位ms。最後內容不提供有限右界。這裡的O只是假設模型中的可行平移值，不是量到的時間起點或延遲；變動queue、時鐘速率差及觀測負擔仍可能藏在內容區間內。交集非空不能證明模型為真，也不識別來源呈現／畫布擷取／編碼哪一站造成偏移。

本輪 `performance.now()` 讀值皆整數ms、單次繪圖記錄差0–1ms；**未校準實體時鐘誤差上界**。[High Resolution Time](https://www.w3.org/TR/2026/WD-hr-time-3-20261102/#clock-resolution)允許降低精度，所以以下只報紀錄值的條件相容區間，不能稱嚴格物理擷取上下界，也未任意補入1ms誤差。Worker收件時間未量；真正capture metadata未取得；AudioContext排程值、內容有效區間與編碼PTS各自保存，沒有填值互代。

## 三份首次結果

| 短案 | 繪圖／明確request／解碼影格 | 成檔未觀測序號 | 重複／倒序 | 條件O交集，ms |
| --- | --- | --- | --- | --- |
| 無聲校準2秒 | 123／122／121 | 43、44 | 0／0 | [4303, 4305] |
| 正控制3秒 | 183／182／180 | 0、43、44 | 0／0 | [3795, 3798] |
| 音訊延後250ms，3秒 | 184／183／181 | 0、44、45 | 0／0 | [40587, 40593] |

每份解碼影格都有有效碼且可唯一接回paintLog。三次受控連畫分別留下最後的45／45／46，之前兩張未進入成檔；聲畫案初始序號0也未觀測，校準案則有。初始canvas capture自帶請求，故繪圖／明確request原本就差1；不能把數量差通通稱編碼漏格。三案交集各屬本頁時鐘，校準後曾重載以啟用控制，不能跨頁直接比較O或把交集寬度叫精度／延遲。

聲畫控制使用48kHz單聲道純合成PCM，660Hz／40ms提示音，AudioContext排程基準後0.6／1.4／2.2秒；畫面依同一currentTime顯示約70ms白條。負控制只把此診斷聲源的start排程延後250ms，產品與原檔未改。聲音沿既有8kHz PCM／10ms RMS區塊、0.03門檻及保留PTS的aresample分析，三組事件按序配對，不用最近事件掩蓋整秒偏移。

| 案例 | 畫面事件PTS，ms | 聲音事件，ms | 聲音−畫面，ms | 原100ms判斷 |
| --- | --- | --- | --- | --- |
| 正控制 | 901、1701、2501 | 900、1700、2500 | −1、−1、−1 | 通過 |
| 故意音訊晚250ms | 909、1709、2512 | 1150、1950、2750 | +241、+241、+238 | 預期拒絕 |

這證明這組短控制能辨別超標，未聲稱精確還原250ms或校準全部誤差；rAF觀察AudioContext、排程量化、聲音10ms取樣與編碼都仍有限制。三案都完整解碼exit0／stderr空，真正下載在獨立原生file視窗自然播到Play／Elapsed＝Duration／位置1，無seek、暫停或重啟。不是人工聽感、離線、長片或產品G1–G7驗收。

## 指紋、原始工具修正與收尾

| 短案 | 下載bytes | SHA-256 |
| --- | --- | --- |
| 校準 | 42,811 | `7a1f2bdf1b8f8562bc10e2bbf65b25b3dbd00cda22cc72dd66d98162688d947d` |
| 正控制 | 85,148 | `bf85b457b8d21d0a195ec088b3bc110964f9dd8ed91283d077eba6c3f8c8323d` |
| 負控制 | 84,938 | `85520fd2f4795cc58086613eaf6da3cc6bd7f3042735de91ee1a76e17f4b1f8c` |

首版完整解碼雖exit0，null輸出時間基準量化產生一次 `2 >= 2` DTS警告即停止分析，未作判定；首版與原stderr保留。核對原packet／frame PTS遞增後，只改工具輸出採demux精度，再讀同一下載，不壓警告、不補PTS或改媒體。方法檢查另修正最後內容右界：初稿用了stop呼叫，最終改為開放，三份交集數值均未改。全部版本、逐格表、收據與原結果保留，不能把工具初稿當產品失敗。

共用媒體鎖原持有人自然釋放後才原子取得；三案錄影與分析均在自有鎖內。tracks全停止，兩個AudioContext都closed，沒有Worker或相機／麥克風；自有診斷與file視窗關閉，原Safari視窗保留。自有主機exit0、PID消失、原埠拒連，依nonce釋放自己的鎖。原130ms下載僅唯讀核對，仍4,000,219bytes／SHA `74909333d8c0a0f2075faefab89f87ed1632efcc906d216e6c783f52cf028a63`，本輪未解碼或重編碼它。

本機原型與原始實驗資料留ignored QA並獨立封存、逐檔重讀：53檔／4,365,327bytes，manifest SHA `276372cbcc0ca91fcc9e314b8f6d0690349463c6b7eceaca6d5dfff6cf45886b`；不公開raw影格、影片、profile、視窗識別或本機網址。新資訊是「真正成檔內容→繪圖紀錄」對照可行，**可靠captureTime、與音訊／網頁時鐘的嚴格對齊仍不足**。下一步需先取得可驗證的時鐘誤差與capture origin／metadata，再考慮受控接回產品；本輪不擴大長片、不建新媒體架構。

原130ms失敗、案例08–20、十輪、原生裝置／真實相機、人工聽感、完整G1–G7及Claude Code／使用者指定審查仍未完成；iPhone延後。沒有產品修正、合併、發布或關閉#11。
