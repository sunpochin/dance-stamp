<!-- 檔案用途：綁定 Safari 有界音訊候選的匿名驗證與缺口。所在層：工程證據。主要關聯：TECHNICAL.md、RECORD_COMPARE.md、local-audio.js。 -->
# #3／#11 Safari 本機有界音訊候選

狀態：2026-10-29，工程候選，尚待 Claude Code／使用者獨立審查；不合併／發布，不關閉 #1／#3／#11，iPhone 暫緩。來源基線 main `918d8d7aa814533823522e3d4e0ab18df75cb212`。

本輪把已知能保留來源起點的 AudioBufferSource 原型轉成有界 AAC 封包解碼。規格、索引／PCM／queue 預算與拒絕行為見 [TECHNICAL 第 31 節](../../TECHNICAL.md)。Chrome 原路徑不變；Safari 不支援的來源明確拒絕，不默默回退已知漏音的元素來源，也不重置資料。

## 探索結果，不算乾淨 head 的正式矩陣

真正 macOS 27.0.1／Safari 27.0.1，一般新視窗、全新自有 origin、controller=null、頁面執行標記 `bounded-aac-v1`、初始筆記數 0。僅自製 65 秒雙片，沒有真人媒體、實體相機、麥克風或外部服務；每輪真正下載後以未改動 v5 完整解碼。

| 靜態版（sourceDirty=true） | 15 秒／1× 結果 |
| --- | --- |
| `97846b1a0b0d3704` | 50ms 排程前置；449 格、29.893fps、來源覆蓋成立；聲畫最大差 116.667ms，原門檻拒絕，未擴大矩陣 |
| `24b229fb35bd7cd3` | 10ms 排程前置；449 格、29.874fps、聲畫最大差 35ms、三點 33.333／0／0ms、新漂移 -33.333ms、兩側重複最長 56.666／110ms、來源覆蓋成立；人工收集完整耗時上界 94,159ms，v5 整體仍拒絕，不能記為正式通過 |

第一輪之後隔離比對兩種真正 native PCM：48kHz，零點可辨訊號皆在來源 2/48000 秒；有界解碼第一包 timestamp=-21,333µs，第二包 0µs。表示未重現來源零點漏失，沒有靠平移解碼內容修聲音。10ms 是給音訊排程的正向前置，並非減去裝置補償。正式耗時需自按匯出至本輪讀回／保存成功自動記錄，不能以 JS timeline 的 14.9 秒替代完整時間。

raw、下載檔、PCM 診斷與失敗分析都只留本機 ignored output；不公開本機網址、原始檔名或媒體。後續數據須綁定乾淨 head、靜態版本、實際執行標記及 controller，不能只憑 server hash。

## 驗證與保留 gates

單元涵蓋 edit list／來源零點、索引與封包上限、拒絕錯誤 offset／碎片／codec、固定 PCM 片段、八包 queue、AudioData close、預先與解碼中取消、原生解碼錯誤、不同來源重試及無音軌。瀏覽器工程回歸以真正 Chrome WebCodecs 執行 Safari 分支，驗證準備／合成取消保留前次 VS、取消不新增假完成、重試與換無音軌來源；這些不是 Safari 媒體品質證據。

正式 Safari 速度／長度矩陣及十輪穩定性另列實際結果，不承接原型、舊 runtime 或 Chrome 的數據。實體相機 G1／光學 G2、iPhone／Files／分享 G5、相機 capture→export G6、私人模式、其他來源格式／取樣率、低記憶體壓力、熱／電池、藍牙／來電與發布仍未驗證。無設備不視為平台失敗，不啟動 iOS fallback。
