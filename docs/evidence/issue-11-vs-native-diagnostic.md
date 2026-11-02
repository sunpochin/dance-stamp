<!-- 用途：保存單一慢速雙片VS的來源／繪圖／擷取／成檔診斷與首錯；層：#11匿名證據；關聯：TECHNICAL.md、scripts/qa、RECORD_COMPARE.md。 -->
# #11：一份 0.75×／60 秒雙片診斷，保留第一次失敗

像在同一張畫面貼上號碼，查看它何時畫好、何時被瀏覽器擷取、最後被放到影片哪一秒。這次量尺接進既有雙片匯出，確實取得原下載；結果仍失敗，沒有重錄挑成功，也沒有補音訊延遲。

## 來源、前置與範圍

2026-11-02，從 [#215](https://github.com/sunpochin/dance-stamp/pull/215) 精確 head `54eb96a2b4c601e154217b8bd350b3cd8966fe86` 建本聊天專用 managed worktree／新分支，不推原分支。前置依序為 #215 → [#212](https://github.com/sunpochin/dance-stamp/pull/212) `5b74a96277fa2342c4fdd012576593100592c082` → [#208](https://github.com/sunpochin/dance-stamp/pull/208) `b06816dda9ed1741f7f12d39cb8751dbe80d78ad` → [#206](https://github.com/sunpochin/dance-stamp/pull/206) `0ae05d03355d8cddcb5b2bdb61af2976a4e1081a`，開工時皆 open。十四份產品 JS 與全部 web 來源等於參考 main `7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca`；靜態建置 `80faff7573fa1d79`。產品、相機、儲存、時間映射、原100／250ms與90秒等期限不改。

macOS 27.2／26B123、普通原生 Safari 27.2／22625.2.8.11.9、Bun 1.4.4／38afee6c8、FFmpeg 8.1.2。只用合成雙片，硬體擷取呼叫0。等待 #13 的共用鎖自然釋放後才取得自己的 nonce；沒有碰其工作樹、離線包或日常 Safari。沿原測試 origin 保留原資料，不換空庫、重置或匯入。

原失敗仍只歸 `81d875634a7248fe0e4441f0072176fbfef2e056`／`e38ad0016d1001da`／Safari27.0.1。先讀原矩陣操作收據再取配方：示範12–57秒、0.75×、練習起點4秒、雙側不鏡像、左右並排。合成示範965,578 bytes，SHA `d4bf3ab496d9b148e0e58a5f9644a2d8c91a783e1fea72597f0d6e9252838efd`；練習1,109,202 bytes，SHA `c786a691d299c8c3af89ceceab0e2c49a609f502526a7ce11b2a5b5e5e9f49a0`。

原4,000,219-byte失敗檔 SHA `74909333d8c0a0f2075faefab89f87ed1632efcc906d216e6c783f52cf028a63` 重讀相同，1,800格／45組事件重算仍130ms。本次沒有前六次匯出或共同預覽，是新環境的新單案，不能叫同 binary 重現、原案例07補測或原失敗已修好。

## 先校準，再凍結一次操作

前輪84,298-byte三秒檔 SHA `2ae3be8f96496306765426438cdde8741ac3ea37c09ae85a8dc3cc64dfe8f1a8` 重算相同：184 paint／181原生回呼／180成檔格，聲音−畫面−12ms，固定平移交集仍空、差8ms。前輪113檔manifest `032c06f9a678c629361aadda62ae2213bc80b63c845c0962c779d848e1bf3c95`逐檔重讀相符，只讀複製到本聊天 ignored output。

舊短正控制仍−1／−1／−1ms，音訊晚250ms負控制仍+241／+241／+238ms，原100ms正確拒絕；沒有再錄短控制。新標記先在原失敗檔14.810秒影格離線編碼，0／17／65535均能讀出且兩側原碼相同；灰階、錯CRC、溢位、亂序錯配、缺碼及多義另有可執行回歸。

原雙片碼會在相鄰繪圖重複，不能據此唯一識別 paint。因此 [vs-content.js](../../scripts/qa/vs-content.js) 在標題空白 x256／y4／256×32 畫16-bit序號、magic、反碼及CRC，保留兩側原來源碼／標籤。**這是會改變輸出像素與編碼負擔的合成診斷層，不能當未加註產品品質驗收。**

[旁聽器](../../scripts/qa/vs-observer.js)在原 render 完成後、原 requestFrame 呼叫前加碼；原 captureStream／requestFrame／AudioBufferSource.start／track.stop 的 receiver、參數、回傳與錯誤照原呼叫，不改 play／resume 排程、不提前啟動音訊、不延後釋放。原流直接扇出到額外 muted video，rVFC保存真正metadata及實際碼區PNG。兩來源也各保存實際像素與rVFC metadata。產品 stop 回傳後立即取消旁聽與脫離video；兩條產品軌 ended，AudioContext閒置 suspended，原生重開時釋放舊頁。

凍結於本機 plan／host收據的 native observer SHA `cae8327433be1496ca47b70d64e476ee756e6c3412a10a46936c1291e00073f4`、碼工具 SHA `61a53f0f7f616353efba7bff1ea4958e02e288a6417ac2e0b6a1f9d491ea9a79`；主機另保存全建置／HTML注入指紋，十四產品JS逐bytes相同。分析器在首個嚴格PTS拒絕後追加保留失敗的診斷分支與摘要修正；原凍結版、首錯與每版結果都保留，不冒充從未修改的工具來源。 交付版另補旁聽例外保護（SHA `d3c94c6cc05939b244acd80530b9a8f8ec4de4588c7b680947480342c9ffc320`）：讀碼錯也照原receiver／參數／回傳呼叫captureStream與requestFrame，cancel錯仍pause／detach。原生受測版對此注入故障的回歸確實失敗，交付版通過；沒有新增原生媒體cohort，不能把此守護續修當成已原生實測。

## 第一份真正原下載：不通過

Safari原生「Download Linked File As…」所得4,808,303 bytes，SHA `fc6f8fdae56a77d42e5d9e2a24eee8b5e2a0b68bc8a87712fa64abaca7d2a18e`，逐bytes等於完整IDB媒體。沒有重編碼、修PTS、扣一格來源延遲或加入固定補償。

| 觀察 | 原始結果 |
| --- | --- |
| paint／原生回呼／成檔格 | 2,353／2,107／2,108 |
| 像素身分聯結 | 2,107格各有唯一原生回呼；首格id0缺回呼；245個paint未入成檔；無重複碼或多義補配 |
| 原生captureTime | 正值、嚴格遞增；原始欄位型別保留 |
| 成檔PTS | 尾三格皆60.008秒，兩步不嚴格前進；既有分析器直接拒絕 |
| 聲畫 | 45／45按序配對；最大聲音−畫面−150ms，超過原100ms |
| 兩側／覆蓋局部量測 | 全格兩側差最大44.444ms；首中末中位數0／0／0ms；起點0／0，尾覆蓋−44.444／−44.444ms |
| 其他局部量測 | 片長60.038秒，約35.111fps，停格最長160ms，內容對輸出時鐘最大204.111ms |
| 完整解碼 | 2,108視訊格及全音軌可解碼；A/V null解碼exit0但保留156-byte非遞增DTS stderr，不能稱無警告 |
| 匯出時間 | 產品timeline60,086ms；點擊到完整成檔收據66,916ms是ready上界，非精確ready耗時 |

[獨立分析器](../../scripts/qa/analyze-vs.py)把同次解碼的showinfo checksum／PTS與ffprobe frame、packet位置及PTS逐一核對。2,107份原生PNG及2,872份來源PNG另批次獨立解碼，均與當時讀值相同。原始packet／frame／showinfo／PCM及不合格PTS完整保存；可讀、局部同步與成檔成功均不替代失敗的品質門檻。獨立全音軌解碼stderr空；源聲頻率沿自然變調495Hz另記，沒有人工聽感驗收。

## 各階段能分清什麼

第30秒來源提示，理想音訊經過24,000ms；原檔音訊24.010秒、畫面24.160秒。真正來源碼900的回呼進入於343755ms、退出343757ms；畫面paint begin343774ms／end343777ms，讀碼後AudioContext相對原排程24,150ms；相符原生captureTime343780ms。這支持**在本診斷中，約150ms相位差已可於繪圖後讀值看到**，不能把原檔150ms全部稱為擷取或編碼延遲。它沒有隔離來源解碼、回呼排程、產品繪圖和診斷負擔的唯一因果，不能移記到舊130ms案。

captureTime−encodedPTS全案319618–319692ms是不同origin的差，不是延遲。相對第一個唯一配對格的變化−1至+73ms；完整條件式固定平移交集空、差61ms。依真正buffer-ended事件**事後分層**，其前的差319618–319621ms；尾三格captureTime379633／379680／379700ms仍前進，PTS皆60008ms，讀碼後AudioContext也繼續60.544／60.589333／60.608秒。buffer已自然ended後AudioContext仍running，兩者不能混稱同一音訊時鐘；尾格保留，沒有裁掉以取得通過。

固定 upstream WebKit `49e831c38e05d4099861ea284b017a4a5603ad38` 的 [AVF入口](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/Modules/mediastream/MediaRecorderPrivateAVFImpl.cpp#L148)接受但未用VideoFrameTimeMetadata；[encoder](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/platform/mediarecorder/MediaRecorderPrivateEncoder.cpp#L428)快照lastEnqueuedAudioTime；有音訊時currentTime用audioTime，首格另定0，非遞增樣本加1微秒，另可能加priming。兩來源SHA各為 `c9bd00559211c7a83966c01c5e7fda356a37d07f09e17aa54e3c021fa541e664`／`dcf4434bcd1485b2ca9f913232f51228022c9f17a8bfa67e246a12d2f03cf15a`，來源摘要SHA `bd2afb4b23509ace2a614b614da2bf86087e8549d667268facc6a8868d231df6`。這支持「音源尾段賦時可能停留、微秒再受容器精度影響」的候選；**未對應安裝的Safari binary，沒有證明本案或舊案唯一根因**。

觀察負擔不能忽略：原生像素callback中位2／最大9ms，來源callback中位1／最大6ms，標記／讀碼中位4／最大18ms。原生metadata與drawImage非原子，currentVideoFrame與deferred metadata可能合併，rVFC可跳格，Performance精度降低且物理誤差未校準。前約16.1秒兩來源不在viewport，之後可見到尾；實際可見回呼老師990／1351、自己1045／1521。匯出工作區間沒有visibility／focus變更，所有來源／擷取回呼皆visible／focus，不能稱整分鐘來源可見或純被動量測。

## 資料、離站原檔與收尾

起始39份媒體95,725,916 bytes／revision237。新選片與80次產品原生+50ms微調只改本輪配方至精確4秒；沒有用隱藏setter或改產品事件。最終40份100,534,219 bytes／revision323；舊全部資料列與39份媒體保留。停止後、閒置及原生重開後兩次，完整library含revision及全媒體id／MIME／大小／SHA完全相同，全部封存bytes重新hash相符，無未知儲存或讀回錯誤。

關自有產品視窗與主機、原埠拒連後，既有file播放頁只加同資料夾檔名與有界watchdog參數支援；本案90秒只限旁聽，不改產品期限、不呼叫play／pause／seek。明確按一次原生Play，自然ended到60.038秒，totalVideoFrames number2108／dropped number2／corrupted number0／error0；audioDecodedBytes原型別**undefined**（JSON值null）。全程muted，沒有人工聽感；file CSP阻網而nativeOnline仍true，不稱作業系統斷網、PWA離線或#13音訊量測通過。原下載前後SHA相同。

自有產品／file視窗關閉，原Safari視窗保留；主機及自有持鎖程序PID皆退出、原埠拒連、自己的兩組nonce釋放。首個file持鎖程式因heredoc耗盡stdin而EOF退出，尚未播放；保存首錯並確認該PID已不存在，只移除自己精確nonce，再以可持續stdin持鎖完成一次播放。沒有殺其他程序或動別人的鎖。

離線工具首次complex-filter選demux timebase不適用而exit234；先保留首錯，再沿原video精確time_base，仍逐PTS／checksum核對。舊控制的首次臨時計算缺demux精度產生DTS警告，保留後以既有精度重算相同原檔、數字一致。首個產品分析與既有量尺的嚴格PTS拒絕都保留；診斷續版不修改門檻，只完整列出不合格PTS。其後修正defaultdict使摘要漏列id0的工具錯誤：詳細聯結原已記missing，現在詳細與摘要都保留，負回歸能抓出原問題。沒有因工具修正重錄產品。

## 重建與尚未完成

在本聊天專用worktree，固定Bun1.4.4；依原指紋將授權合成素材只讀複製至ignored output，先跑單元、decoder自查及上述離線正負校準，再凍結操作計畫。範例 `bun --no-env-file scripts/qa/serve-vs.ts output/qa-vs/run 62279` 會讀 `output/qa-vs/plan.local.json`；忙碌鎖只等待，不換庫或替代鎖。主機逐bytes固定產品與helper、Origin／nonce驗證、每份收據不覆寫；測試使用自有隔離假鎖，不能拿來跑產品規避共用鎖。

真正原下載後，執行 `python3 scripts/qa/analyze-vs.py <新報告目錄> <原下載> <原生收據>`，再以 `--summarize <報告目錄> <原生收據>` 重建事後分層；先自行建立新報告目錄並保留首錯。既有 `scripts/analyze-comparison.py` 仍在原PTS gate拒絕。本機完整原始媒體／PNG／metadata／失敗版／凍結來源265檔／255,828,263 bytes已獨立封存逐檔重讀，manifest SHA `2a75dd3198f97432a3e82f2842ea75c6405b947395380c603ad38c3233650832`；另有全原生聲道／取樣率PCM與8k單聲道量測PCM及解碼收據3檔／24,967,915 bytes獨立封存，manifest SHA `1b2e3c27f1719aca7f94accb705c1a6e7328d084a472b5798c013ded39e86b5e`。公開只交方法與匿名數字；不公開profile、原始媒體或本機識別。

新增6項工具回歸／46斷言通過，含同一旁聽器的故障注入與原API轉送；固定Bun1.4.4正常完整check／hooks另列PR。資料保全首個摘要讀錯library外層而未列舊資料列，保留後改讀實際data層：15個video／92個asset／100個take／100個recipe／39個export逐列完全相同，空markers／moves不冒充非空驗收。

本次工程檢查與QA回歸見PR；不是Claude Code／使用者指定終審。原130ms唯一根因、原案例08–20、完整20組／十輪、實體相機／裝置、人工聽感、實體離線、完整G1–G7仍未完成。#11保持開啟，iPhone延後；未合併main、發布或混入#209雲端功能。
