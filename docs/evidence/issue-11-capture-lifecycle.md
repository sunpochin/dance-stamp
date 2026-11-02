<!-- 用途：記錄合成診斷工具生命週期修復與短同串流對照；層：#11工具證據；關聯：TECHNICAL.md、scripts/qa/、RECORD_COMPARE.md。 -->
# #11：先修好診斷工具的收尾，再做短同串流對照

像做實驗時先記下第一個問題，再逐一關好器材。舊工具在音源還沒啟動時就要求停止，第二個錯誤蓋住第一個，連後面的關閉與記錄也被跳過。這次讓每件器材各自收尾；一件失敗，其他仍繼續。影片需要首張畫面才能開始播放時，也先供應畫面，避免雙方互等。

## 固定來源與舊失敗

2026-11-02：從 [PR #212](https://github.com/sunpochin/dance-stamp/pull/212) 精確 head `5b74a96277fa2342c4fdd012576593100592c082` 建立專用 managed 工作樹與新分支。依賴 #208 `b06816dda9ed1741f7f12d39cb8751dbe80d78ad`、#206 `0ae05d03355d8cddcb5b2bdb61af2976a4e1081a`；產品參考仍是 main `7dede9f41ac7fc4be31a59bdd38c98ce487ae5ca`。本輪不推原分支，不改十四份產品 JS、Worker 0／0 gate、原100／250ms與首尾／片長規則。

[首次短成檔失敗](issue-11-native-capturetime.md)仍失敗：舊頁SHA `cd0d3c6757d63346725b7c65de8b665f1d026bff70acd0217aea4df1e31fb779`，原生InvalidStateError發生於未start音源的stop；前一例外沒有保存，不能追認原先一定是play timeout。沒有成片、結果收據或真正下載。原79檔manifest `e00617d3bd51d529dab4921e3bb8480f6c278b36c58853a5887019cc71f57c0c`、#208的53檔manifest `276372cbcc0ca91fcc9e314b8f6d0690349463c6b7eceaca6d5dfff6cf45886b`均逐檔重新核對相符，舊副本與收據不改。

## 可重建工具與回歸

- [共用生命週期](../../scripts/qa/capture-lifecycle.js)保留firstError與各cleanupErrors；依音源start成功與recorder實際state清理。逐項取消rAF／rVFC、解除監聽、暫停／脫離video、stop／drain recorder、逐軌stop、close AudioContext，再送出凍結收據。逾時／晚到事件不可更改終態。
- [合成頁](../../scripts/qa/capture-content.html)只使用單一canvas原始MediaStream，直接扇出video與MediaRecorder。先排首影格生產者再await play；保留播放2秒、觀察5秒、stop2秒，每項非同步收尾與本機POST亦有2秒上限。正常錄影目標3秒。
- [本機主機](../../scripts/qa/serve-capture.ts)啟動時固定HTML／helper bytes與指紋、fixture描述與SHA、來源head及nonce；只接受自己Origin／nonce且不覆寫首份收據。主機最多10分鐘，結束先封住請求，停止自有server後只核對自己的nonce釋鎖；忙碌時退出，不能搶鎖。
- [獨立分析器](../../scripts/qa/analyze-capture.py)以magic／序號／反碼／CRC解碼真正下載與rVFC中實際drawImage PNG；按像素值配對，不按request或callback序號配對。保留完整raw PTS與封包位置，無重編碼、補缺碼／時間戳或扣超標。

12項既有測試入口新增回歸包含：啟動前失敗加cleanup再失敗、舊finally確實遮錯反例、play真正等首格與舊順序互等反例、正常錄影、play逾時後晚到事件、stop通知缺失／close懸掛、音源start失敗、結果POST拒絕，Window receiver的原生式反例，以及主機Origin／nonce、首份封存、期限、忙碌鎖與啟動／收尾雙重寫入錯誤。它們執行同一runCapture／host流程，沒有以字串比對或假原生收據代替。

排除只加try/catch吞掉stop例外：仍會丟第一錯誤與不完整收尾；排除延長期限掩蓋順序互等。沒有引入依賴、產品路由或將QA工具放入產品下載包。

## 執行與交接

固定Bun1.4.4，在專用工作樹執行：

```sh
bun install --frozen-lockfile --ignore-scripts
bun --no-env-file test tests/unit/captureLifecycle.test.ts tests/unit/captureHost.test.ts
python3 scripts/qa/analyze-capture.py --selfcheck
bun run check
bun --no-env-file scripts/qa/serve-capture.ts output/capture-run
```

`output/capture-run`必須是本次新的ignored目錄；共用鎖忙就先只讀確認持有人，等自然釋放，不換鎖或空產品庫。原生普通Safari開啟主機回報的專用網址，明確按一次三秒按鈕；失敗先保存完整firstError／cleanup，不自動重錄。成功後原生「另存連結檔案」到同一ignored目錄，真正下載與POST收據bytes／SHA另核對，再執行：

```sh
python3 scripts/qa/analyze-capture.py output/capture-run output/capture-run/capture-content.webm
```

關自有頁與主機後，把 `scripts/qa/play-capture-file.html` 複製到原下載旁邊，以獨立file視窗開啟，明確按一次原生Play後讓影片自然播放到尾；原生收據可另存，完整解碼、音訊、error／dropped如實另記。file頁CSP只准file媒體、禁止網路連線；這不是作業系統斷網或PWA離線驗收。主機可用帶同Origin的POST `/finish/<本次nonce>`結束；只關自己的視窗／程序，核對PID、原埠拒連及nonce釋放。raw像素、媒體、profile、本機識別只留ignored output，不進Git／issue／PR。

## 原生媒體範圍

環境仍為macOS27.2／26B123、普通原生Safari27.2／22625.2.8.11.9、Bun1.4.4、FFmpeg8.1.2；只用合成資料，硬體呼叫0、未載產品／IDB。等#13自然釋鎖後才原子持鎖。

### 修復後首次原生工具失敗仍保留

第一個新凍結來源在首格排程處出現 `TypeError: Can only call Window.requestAnimationFrame on instances of Window`，cancelAnimationFrame也回報相同receiver限制。這次firstError與cleanupErrors分開、其他收尾仍繼續：兩軌ended、AudioContext closed、video已脫離、音源未start、完整失敗收據成功寫入；沒有成片或下載。自有頁／主機／nonce均收尾。這是工具實際失敗，不改寫成成功或原產品失敗。

查明是把原生Window方法當env的方法呼叫；以有receiver限制的行為回歸先證明未綁定會產生首錯＋收尾錯，再用薄包裝保留Window receiver，修正後正常路徑通過。初稿測試錯用另一組假時鐘造成observation timeout，已保留原失敗日誌並修正測試時鐘歸屬；沒有延長期限。只有完成這個具體修復後，才凍結修正版、另做一次新短案，不是為取得較好聲畫數字重錄。

### 修正版單次短案：可按內容值共同觀測，固定平移模型不成立

| 固定項目 | SHA-256 |
| --- | --- |
| 原生受測capture-lifecycle.js（與本PR相同） | `0e44c3baa23975298754380265b1fe005c78dcb4660b47eee8667063df1310d8` |
| 原生受測capture-content.html（與本PR相同） | `041951ab6545c20a972b63ad997745b6405e19ca1efdd2ab8822ffbe197c918d` |
| 凍結fixture描述 | `b3eec8d6af97876e09a7992c8ca0958a81482eb78531327f4846adfd786eeea4` |
| Safari真正Save As原下載，84,298 bytes | `2ae3be8f96496306765426438cdde8741ac3ea37c09ae85a8dc3cc64dfe8f1a8` |

video.srcObject及recorder.stream均嚴格等於同一原始MediaStream。play在8ms內完成；錄影觀察3,014ms。184次繪圖、181次明確request、181次rVFC、180格真正成檔，所有magic／反碼／CRC與同次完整解碼showinfo checksum通過，frame／best-effort／原packet PTS及位置逐一相同；PTS 0–2,994ms、嚴格遞增，DTS＝PTS。序號0／1／44／45未進成檔；0是初始繪圖、1只被原生回呼觀察，44／45是同次連畫44–46的前兩張。沒有重複或倒序，不生成缺格。

181份回呼PNG各自獨立解碼，像素碼1及其後180個成檔碼均唯一接回paintLog；180個成檔碼都有相同內容值的回呼觀測，原生另有序號1未進成片。全部實際captureTime為原生number、正值且嚴格遞增，範圍5,475–8,476ms，沒有借用mediaTime或其他時鐘補值。這證明**同一短案中按內容值可核對的共同觀測**，不是metadata與當下像素的原子身分證明。

原生captureTime−對應繪圖begin為0–4ms；captureTime−成檔PTS的紀錄值範圍5,480–5,505ms，是不同起點的差，不能叫擷取／編碼延遲。Performance繪圖前後皆整數ms；未建立物理時鐘精度上界。沿#208的有條件「固定PTS平移」模型，交集下界5,501ms、上界5,493ms，**為空且差8ms**，照實保留；不能挑一個平移值、扣差額或用非零captureTime宣稱模型成立。

同一真正原下載的三組閃光PTS為912／1,712／2,512ms，聲音起點900／1,700／2,500ms，聲音−畫面皆−12ms，沿原100ms局部判斷通過。沿相同量法重讀#208原正／負控制，仍為−1／−1／−1ms通過、+241／+241／+238ms預期拒絕；沒有新錄控制、重編碼或改門檻。不是完整VS品質或原130ms因果證明。

### 真正下載、站外播放與收尾

Safari原生Save As的完整bytes／SHA等於MediaRecorder的本機POST副本。完整視訊／音訊解碼exit0、stderr空。主機停止、原埠拒連、自有診斷頁關閉後，獨立file頁只准file媒體、禁止網路連線，讀同一原下載；nativeOnline原值仍true，不冒稱OS斷網或PWA離線。首次autoplay未開始，15秒watchdog的完整收據保留，不能算播放成功。改為新file頁明確點一次原生Play，之後無pause／seek／恢復操作，原生自然ended：currentTime＝duration＝3.015秒、180格、error0／dropped0／corrupted0。pause事件發生於自然ended，不是Agent操作。音訊位元組欄位為undefined，照原型別保存，不補0或假裝原生音訊指標通過；原音軌完整解碼及三組提示音另由檔案驗證，人工聽感未驗。

兩次自有診斷主機、離線持鎖程序已退出，已知PID空、原埠拒連；nonce均核對釋放。自有診斷與file視窗已關閉，原Safari視窗保留，原下載SHA前後相同。原始失敗、凍結來源、原生metadata／PNG、逐格／封包／音訊結果與播放收據留在ignored output並獨立封存，不公開raw或本機識別。

原生後另用純主機回歸重現「host.local.json已存在＋cleanup收據也已存在」時首錯被遮蔽，修正為保留首錯、cleanup錯誤送stderr後備收據、不覆寫舊檔；不確認server停止就保留自己的鎖。此為host回歸，未再開原生短案；上述受測HTML／生命週期helper bytes未變。分析器只調整CLI參數讀取到main，讓decoder能獨立匯入驗控制；改後重讀同一下載，整份summary與首次分析精確相同。

metadata與drawImage非原子操作；[固定WebKit參考](https://github.com/WebKit/WebKit/blob/49e831c38e05d4099861ea284b017a4a5603ad38/Source/WebCore/platform/graphics/avfoundation/objc/MediaPlayerPrivateMediaStreamAVFObjC.mm#L291)的currentVideoFrame／deferred metadata可能合併，未與安裝Safari二進位建立對應。rVFC跳格、Performance降低精度、capture origin與音訊／網頁時鐘的物理誤差上界仍須評估。即使內容值能配對，也只能證明該短案的共同觀測，不能推得原130ms原因、精確queue／擷取延遲或固定補償。

原130ms失敗、08–20、20組／十輪、真實相機／裝置、人工聽感、完整G1–G7與Claude Code／使用者指定終審保持未完成；iPhone延後。沒有合併main、正式發布或結案#11。

## 本機工程檢查與封存

固定Bun1.4.4完整 `bun run check` 通過：716 pass／0 fail／3,859 expects、51來源指紋、435檔公開掃描、typecheck／lint／build通過，19項既有lint info保留；12項新增工具回歸／55斷言全部通過。獨立解碼器selfcheck拒絕壞碼與不相容區間。完整diff人工核對，產品十四JS與原來源逐byte相同；正常提交hooks另檢查最終文件。

本輪原始證據獨立複製並逐檔重讀相符：113檔／7,790,596bytes，manifest SHA `032c06f9a678c629361aadda62ae2213bc80b63c845c0962c779d848e1bf3c95`。此封存含兩個新來源首次結果、首次autoplay未開始、真正原下載／原生file收據與檢查日誌；原79／53檔manifest各自保留，不把工具、短案或CI互相代替。
