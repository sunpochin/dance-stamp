<!-- 檔案用途：綁定 Safari 與資料保護整合的來源、逐檔比對及未過 gates。所在層：匿名工程證據。主要關聯：TECHNICAL.md 第34、39–43節、MEDIA_PROBE.md、RELEASE.md。 -->
# #1 Safari 與可靠性整合候選

2026-10-30：目前 main `c0ab39b` 的[保存與救援有界稽核](issue-3-current-protection-audit.md)已補負向回歸、合成 Chrome 擷取保護及網站停止後實際檔案播放；原生 Safari 自動化入口因現有設定拒絕，沒有建立產品測試 session。一般／私人保存 Stop 與新 VS 未確認救援仍未驗，舊原生證據保持下列受測來源。

目前UI取消功能版為99a2169／422c70c3633b8e88；一般Chrome成檔後保存Stop另在乾淨14128c2同runtime補驗。最新完整Chrome影音24＋3仍屬9e6f0ef／1aa1ae164c31d690，Safari一般十九案及正常重載仍屬345b2d1／fe4bf7952cad2421。來源、受測head、文件head與封裝分開記錄；所有歷史失敗及未驗收條件保留。下方歷史段落維持當時狀態，現況以上方同版段落為準。

## 99a2169 明確UI保存取消續修

目前功能head為99a21696e286bf54f3317087cb4796218be70b98／靜態422c70c3633b8e88。相對ba只變main與其SW版本／manifest，另外12份runtime相同；recorder、storage、音訊、timeline、schema、時間／品質門檻都沒改。原9e6的24＋3及345的Safari十九案保留各自版本，本次不改標新版完整影音驗收。

舊ba真正Stop不能取消pending標題交易的負向收據，以及原copy-reference的正向控制保留。最小修復只從明確可取消UI傳自己的signal；原生交易成功前不換state或清草稿。獨立comparisonSave、錄影工作／finalize／中斷／chunks保全，以及成檔後persistExport不借用新操作的active.signal；後者一般Chrome保存Stop另見下節14128c2，不由準備metadata或copy Stop代替，Safari／私人模式仍未驗。詳見[保存取消證據](issue-13-unconfirmed-storage.md#明確metadata-ui保存的真正stop續修)。

ba parent修正工作樹的完整十案全過：九個可取消入口trusted Stop→14.6–16.6ms native abort／無complete、完整舊metadata／keys／URL／bytes保留、同輸入重試及reload相符；第十案可信Play／operation屏障後，新Stop不取消原獨立佇列，解除QA自有hold才complete，新操作回cancelled且只一份metadata put。119份native binary及57份實際下載逐byte／SHA核對，保留兩個QA失敗，不拿工作樹冒充clean-head。原capture／drain必要回歸全過，尾塊pending仍持鎖、111252 bytes恢復及reload不變，全部自有程序／profile／server／nonce收尾。

乾淨99的獨立title／copy Stop與新manifest default均已通過；兩案24份native binary及12份實際下載相同，45個已知PID／4群組／三profile／埠／nonce完成清理。title／copy各15.6／14.7ms trusted abort、舊revision11保留、同候選重試12及reload相同；default候選1／12真SIGKILL後同profile離線舊殼／資料保留，sentinel由原工具逐byte斷言，raw未另存全部sentinel bytes。完整來源與限制見[同版獨立收據](issue-13-unconfirmed-storage.md#99a2169-同版獨立-stop-與-manifest-重驗)。本輪CI139成功，原check408tests／1552expects、235檔公開掃描及原hooks通過。最終文件head、包sourceRevision與功能head分開綁，58檔白名單／14份runtime逐byte對功能版；原raw、profiles與操作識別不入Git或包。Safari／私人模式的成檔VS保存Stop、人工／實體／跨裝置與iPhone等未驗項保留，未合併／發布／關票。

## 14128c2 一般Chrome成檔後保存Stop

2026-10-30 Asia/Taipei，獨立單案例固定乾淨14128c2606029f5f11d438965ca001a84be4caed／422c70c3633b8e88、一般Chrome156.0.8078.49。新VS已成檔、目標metadata／media雙put真success未提交時真正點Stop，256.1ms仍pending且無abort；只解除QA自有get hold後trusted complete，busy=false／unknown=false、reload一致。基準12、資料不變的匯出準備complete13、新VS保存complete14分開核對；保全契約未改，不能寫成取消回滾，沒有需改runtime的重現bug。

14份原生快照binary、候選Blob與7份真正下載逐byte核對，舊metadata只追加一asset／export；新83,137-byte VS的三份下載／native相同，舊VS由產品清單真正取回仍相同。Stop前後recorder inactive／影格訂閱0，pending串流音／視tracks仍live，真正complete後才全ended，不宣稱立即釋放或實體相機。

原fullDecode命令exit0但保留兩筆null輸出DTS訊息；私有QA額外stderr空斷言失敗仍保留。後續原檔91視訊格與原48000Hz stereo音訊完整解碼，原生packet／frame PTS／DTS嚴格遞增，兩對輸出碰撞與timebase量化相符；未改檔或改門檻，不升格為新G2–G4／完整品質矩陣。原生及三段解碼診斷共19個已知自有子PID／9群組、4 nonce清理，精確profile無活程序、自有埠拒絕、sharedlock不存在、mediaCalls=0。完整來源SHA、原QA失敗及限制見[保存Stop證據](issue-13-unconfirmed-storage.md#14128c2-成檔vs保存stop的保全觀察)。

本次只補三份匿名文件，58檔乾淨包的14份runtime維持14128c2；不重跑影音或取得媒體鎖。工作樹十案、99三案、9e6 Chrome24＋3及345 Safari十九案維持各自來源。Safari／私人模式保存Stop、私人新VS救援、實機／五人操作／讀屏聽感／跨裝置及iPhone等未驗條件保留，待Claude Code／使用者審查，不合併、發布或關票。

## 9e6f0ef 擷取完整性與同版 Chrome 再驗證

固定受測`9e6f0ef62ae52bd7841d3eaea84d501c71160cf4`／靜態`1aa1ae164c31d690`，來源乾淨。629a98b先拒絕原生提前成功停止與可解碼但不足原片長下限的新擷取，再合入566f04a的選用pending-write工具；stop／launch／finally主體逐byte保留PR #66。Safari VS、相機1000ms分塊、音訊／時間映射、資料格式與原100ms／250ms／v5不變。新擷取保護、未完成原片另存及明確刪除生命週期的控制與既有capture／drain回歸見[擷取證據](issue-9-capture-recovery.md#擷取完整性續審)。

345b2d1的原Chrome重跑曾在矩陣9及穩定前5輪通過後，第6輪只取得28.030933秒的相機take；原失敗保留，當時未取得該VS或完整captureTiming。另一次60秒控制成功不補十輪，也不能證明原截斷根因。修正前真正early-stop的1.197秒仍被標ready，是獨立可重現的保護缺口；本次修正先拒絕，保留舊片／筆記與chunks。新QA下載檔名碰撞另列為工具證據缺口，後續唯一檔名四份實際檔逐次hash／完整解碼，不能冒充乾淨head24組。

### 原24組與48份實際下載

macOS27.0.1／Chrome156.0.8078.49 headless、原生UA無覆寫、Bun1.4.4及FFmpeg8.1.2。啟動時核對自有程序及明確合成相機旗標；每次相機要求另沿原工具檢查合成標記與實際track label，未開真實相機或麥克風。原media-feasibility、run-media與v5不改；被動觀察原生recorder／track事件與UI配方，逐次保存原CLI回應，不增加影格訂閱或更改時鐘；失敗才在關頁前擷取事件現場，成功各輪未另存完整原生事件檔。

矩陣9、連續穩定10、WebM1、校正2、恢復1、效能1，共24／24全過；每案sourceDirty=false、原v5 fullDecode／完整覆蓋／合成目標及完整耗時檢查通過，影格pending=0。48份實際下載均完整解碼，另逐份核對完整bytes／SHA256。各原案例在當時檢查本輪保存Blob與下載Blob相同，並逐份確認全部預期媒體可讀；未新增宣稱最終IDB的48份完整bytes再次掃描。

| 原24組量測（只屬9e6f0ef） | 結果 |
| --- | ---: |
| 最大聲畫差 | 87.233ms |
| 全影格最大配方差 | 58.333ms |
| 首／中／末三點最大配方差 | 43.867ms |
| 新增漂移最大絕對值 | 43.867ms |
| 最長重複畫面 | 100.834ms |
| 最低平均fps | 29.984 |
| 完整匯出最高上界 | 61,887ms |

最後原案例為24take／24export、預期48媒體、missing=0。十輪沿同context／IDB但每輪仍導航，不宣稱無重載壽命、硬體資源或裝置穩定性。原分析器SHA256仍`3f4aec9788880037a585ff81c6f77a0e56ab456dc835aa4cbe0cb0cbe1cbeaaa`；24組彙整收據SHA256`c3b63802d512ac5a8918815c2f16f765155035da52e2c9f74d3df6365a1a355c`。

### 三份實際檔案的網站外播放

原產品server／browser先關閉，全部已知自有程序與精確profile核對退出後釋鎖，再開全新Chrome/file播放器，以未修改download-playback.js把本輪實際MP4、WebM與校正下載播至ended。完整檔案SHA與上述24組相同，三份分別450／454／448格、dropped全0、audioDecodedBytes22292／168197／20243，mediaCalls=0；不使用原產品頁、SW、IDB或Blob URL。這是靜音headless的原生解碼／播放，不是Safari、人工聽感或裝置驗收。

播放器的六個已知自有程序及精確profile退出，兩階段server／ownnonce收尾均確認；不以close回傳成功代替退出，不處理其他聊天的程序或鎖。檔案播放收據SHA256`85357855ad2ac82c11ad7d818fca806ebdaa32054efae7015cc0b197b4767730`。原檔、逐案診斷／原CLI回應及完整下載指紋只留ignored output，不進Git或包。

### G7稀疏觀察與限制

根聊天只讀取得兩筆活躍已知PID子集的RSS加總1,048,576／1,064,528KiB；可能重複shared pages，也可能漏掉後來新增的子程序，不是峰值、最低、footprint或無洩漏證明。當時AC供電、系統未記thermal／performance warning不等於實際溫度、無降頻或耗電測試；磁碟可用量也不等於真正低磁碟故障驗收。低記憶體／熱壓力、手機、電池、五人操作、讀屏／聽感與實體相機／跨裝置仍未測。舊16bd及345稀疏觀察保留各自來源。

本段不取代下一節345b2d1的原生SafariVS證據，也不把一般模式成檔／重載控制當作私人新VS失敗或未確認救援通過。iPhone暫緩，Claude Code或使用者最終審查保留，不合併、發布或關未驗收票。

## 345b2d1 原生 Safari 的同版證據

固定受測 head `345b2d1e46994a782bfad0e9be2f5f94872fe0bd`、靜態 `fe4bf7952cad2421`。原生一般 Safari 27.0.1，以既有合成雙片走產品比較入口；根聊天同頁依序完成三速度／三片長，無重載或重置，原始累積索引及 clickedAt 均連續遞增。本聊天只讀核對收據、已完成的原 v5 報告及檔案，未另重解碼、啟動瀏覽器／服務或取得媒體鎖。

該受測345產品的14份建置資源與受測來源指紋清單相符，實際載入的HTML僅多被動QA標籤，其餘13份逐byte相同；QA與先前正式輪只差execution。產品主程式沒有私有改動，manifest prototype=false、來源乾淨。

| 速度 | 預期秒 | 視訊跨度秒 | 解碼格數 | 最大聲畫ms | 首／中／末配方ms | 新增漂移ms | 完整匯出上界ms |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 0.5× | 15 | 15.013 | 452 | 72 | 0.0/-33.333/-66.666 | -66.666 | 15383 |
| 0.5× | 30 | 30.020 | 902 | 78 | 0.0/-66.666/-66.666 | -66.666 | 30463 |
| 0.5× | 60 | 60.042 | 1802 | 85 | 0.0/-66.666/-33.334 | -33.334 | 60643 |
| 0.75× | 15 | 15.018 | 452 | 76 | 0.0/-11.111/-44.444 | -44.444 | 15372 |
| 0.75× | 30 | 30.020 | 902 | 84 | 0.0/-44.444/-22.222 | -22.222 | 30511 |
| 0.75× | 60 | 60.026 | 1801 | 86 | 0.0/-22.222/-22.222 | -22.222 | 60728 |
| 1.0× | 15 | 15.023 | 451 | 46 | 0.0/0.0/0.0 | 0 | 15397 |
| 1.0× | 30 | 30.018 | 901 | 80 | 0.0/0.0/-33.334 | -33.334 | 30560 |
| 1.0× | 60 | 60.018 | 1801 | 48 | 0.0/0.0/0.0 | 0 | 60880 |

九案原v5均exit0；fullDecode、完整覆蓋、音／閃匹配、容器及完整匯出驗證皆true。最大聲畫86ms、首中末配方差絕對值66.666ms、新增漂移絕對值66.666ms、最低平均30.004fps、最長非預期重複152ms、完整匯出最高60880ms。最大逐格配方差100ms、內容時鐘差132.667ms分別保留，不將不同定義混寫為每項均低於100ms。

9份實際產品下載共46,729,170 bytes，獨立重算完整SHA256，各自等於對應native chunks；每案只有一份有效dataavailable，原生stop後資料已收齊。各收據report與獨立分析JSON／九案總表相同，版本與執行輪次一致。原分析器SHA256 `3f4aec9788880037a585ff81c6f77a0e56ab456dc835aa4cbe0cb0cbe1cbeaaa`不變。

第七案1×15秒現在為15.023秒／451格／15音15閃，三點[0,0,0]、完整覆蓋成立；這是345的新同版回歸。ef11498的六案通過、第七案14.055秒缺尾失敗及私有WebM三案改善仍各保留原版本，不能覆寫或拼接成正式九案。

九案總收據SHA256 `bffe57b1831eaa12e55aee45c4eae9f5bfdf8f00aaea377a17eca772c236af3e`；新第七案收據SHA256 `2aba2be245fd214b6cf929a6db6424955e2dffac2540a0e88d6c2532ce7599a9`。原檔、每案record／analysis／實際下載與raw保留根聊天ignored output，不進Git或下載包。

### 同頁十輪60秒合成

九案矩陣後沿用同頁、資料與執行輪次，連續十次1×60秒合成均由原v5通過；record／raw索引10至19及clickedAt跨九案後持續遞增，總表samePageAfterMatrix9=true。這是既有合成雙片的composition十輪，不是實體相機capture→export的G6。

| 輪次／案例 | 實際視訊秒 | 解碼格數 | 最大聲畫ms | 首／中／末配方ms | 新增漂移ms | 完整匯出上界ms |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| 1／10 | 60.021 | 1802 | 78 | 0.0/0.0/-33.334 | -33.334 | 60837 |
| 2／11 | 60.021 | 1803 | 48 | 0.0/0.0/0.0 | 0 | 60880 |
| 3／12 | 60.018 | 1802 | 46 | 0.0/-33.334/0.0 | 0 | 60873 |
| 4／13 | 60.018 | 1801 | 78 | 0.0/0.0/0.0 | 0 | 60899 |
| 5／14 | 60.023 | 1802 | 48 | 0.0/-33.334/0.0 | 0 | 60820 |
| 6／15 | 60.020 | 1801 | 80 | 0.0/-33.333/-33.333 | -33.333 | 60903 |
| 7／16 | 60.020 | 1801 | 72 | 0.0/0.0/0.0 | 0 | 60847 |
| 8／17 | 60.023 | 1801 | 86 | 0.0/-33.333/-33.333 | -33.333 | 60868 |
| 9／18 | 60.023 | 1801 | 80 | 0.0/-33.333/-33.333 | -33.333 | 60850 |
| 10／19 | 60.021 | 1804 | 48 | 0.0/0.0/0.0 | 0 | 60914 |

十輪最大聲畫86ms、三點配方差絕對值33.334ms、新增漂移絕對值33.334ms、最低平均30.005fps、最長非預期重複120ms、完整匯出最高60914ms。最大逐格配方差66.667ms及內容時鐘差121.333ms另保留。十份皆60音／60閃，完整覆蓋、原v5目標、音訊匹配及全片解碼報告均true。

新增十份實際下載共92,547,582 bytes；含矩陣共19份、139,276,752 bytes。本聊天只讀重算全部19份完整SHA及逐byte對照native副本，版本、diagnostics bytes、獨立report／receipt／總表一致；每案一份有效dataavailable並收到native stop。這是下載與成檔證據，不新增宣稱最終IndexedDB逐筆完整bytes或原生瀏覽器無洩漏。

最後第19案產品9,296,081 bytes、SHA256 `3fcf302a299ae74faf0a0fb282de6573389fd7ce7c26e8cbc212ee412b60e281`；十輪總收據SHA256 `b58918ec5e6348a3d9f1bde56bead73d066f7a9ebb08cfd6ae255c62d35ab770`，第19案收據 `258511ab4ff911ddf10c6d5a32368eeb636159ab985a11e0a7b76808f008746e`。原檔仍只在根聊天ignored output保留。

### 一般模式原生獨立檔案重播與重載控制

根聊天先停產品服務並關QA頁，再用真正Safari的File > Open在新分頁打開第19案實際WebM檔；9,296,081 bytes／SHA256 `3fcf302a299ae74faf0a0fb282de6573389fd7ce7c26e8cbc212ee412b60e281`已獨立核對。原生MediaDocument進度0→20→60秒，最後Play及slider=1；20秒畫面兩側合成碼仍可見。此路徑不使用本站JS、SW、IDB或Blob URL；原生取消靜音與音量1的UI可見，不等於人工聽感或喇叭輸出已驗證。收據SHA256 `731eedb7d91c52e1f87616af57c78827b4844c1d7af7a3bbd237a31eb39cfb2a`。

另一個一般Safari控制使用相同產品與兩個被動observer、來源可見且無QA預先雜湊，1×15秒原v5全過：15.020秒／451格、最大聲畫43ms、三點[0,0,-33.334]ms、完整匯出上界15,383ms。真正VS為2,509,757 bytes／SHA256 `0cddef66b747674d77bd9c2e6a30ee63652c25450ebd4135926383cc614d2438`，原生chunks、首次產品下載及重開後再次實際下載三份完整bytes相等。native metadata完成revision6後，同瀏覽器／同origin重載，兩次raw metadata／keys／完整Blob指紋快照均與最後native complete相同，11筆後續交易全readonly、沒有新寫入。UI實際重開非空標題／marker／筆記、從保存庫取回VS並重新下載；外部原片原為session-only，重載後顯示待重連符合原契約。這是同origin重載，不能外推新profile／程序重啟或私人模式。

控制總收據SHA256 `addd158b10b3e2bb489c630ed4387a36b0c5e8a0dca1e01f58bf8777d32e860f`。初次QA預猜下載名下一號而停下，之後以真實Downloads項目及磁碟mtime核對重複下載沿用原檔名，沒有改產品或門檻；原中止紀錄保留。

### 私人模式保留未通過項目

同一固定產品在第一個私人origin兩次一般操作及一次來源可見對照均被原100ms音畫護欄拒絕；另一個全新私人origin維持來源可見、匯出前不做QA原片雜湊，仍被拒絕。兩個context的14份原產品指紋與345一致，只有HTML載入被動媒體／儲存observer。四次在寫新VS Blob之前停止、export診斷為null，沒有假成功；不能把未成檔raw算成功VS，也不能宣稱已走到unknown／新VS失敗救援。

第一個origin的native revision4→5→6→7，三次增加來自匯出準備的正常完成配方確認，完整native data精確相同；新origin4→5亦相同。keys／exports均空，unknown=false、忙碌退出，兩側原片File指紋、非空筆記與marker保留。實際JSON備份依契約只更新exportedAt並移除兩筆asset的runtime state／storageKind，精確遞迴核對沒有其他差異。最初QA過嚴的raw與canonical直接相等斷言已記為工具中止，沒有當產品資料遺失或修改產品／門檻。

來源可見或不做QA預雜湊均未消除拒絕，根因未定；不更改Safari隱私設定，不放寬100ms、偽造事件或推測舊WebKit缺陷。私人模式新VS保存失敗／未確認救援仍未驗證，不能標示私人完整支援；一般模式19案與重載控制不能代替它。兩份私人總收據SHA256分別 `7c2687780cb04436ebeb3f9219edfb865b2865e932f8f79b9b0ea14825f62d3f`、`e09b3573f54d357529e2a6e6da63832d88851efbfa49574eadae7126e6bd2515`。

根聊天最後逐一關閉自有原生QA／file／normal-control頁及兩個精確私人測試視窗，無關私人頁未碰；五組自有holder皆terminal exit0、服務停且nonce已釋放。Safari app、舊頁與WebKit spare cache保留，不能宣稱原生所有程序已退出。最後控制頁close收據覆蓋較早「idle待關」的歷史描述；完整原生來源／收尾總收據SHA256 `79a9ed92419cf7625d257bb9e8abb225b9de0fd17ee140eb7377cf2a64e3010f`。

實體相機、真人聽感、五人操作、讀屏、手機／跨裝置、G7未量測項與獨立Claude Code／使用者審查仍保留；Web優先、iPhone暫緩，不合併、發布或關未驗收票。


此段只屬345b2d1／fe4bf7952cad2421的原生VS證據。後續629a98b新增擷取guard，9e6f0ef再合入QA工具；新runtime的Chrome與儲存結果另外列示，不能把這十九案改標為新head的相機或Safari重新驗收。

## 9e6f0ef 原生寫入與更新中斷

固定乾淨`9e6f0ef62ae52bd7841d3eaea84d501c71160cf4`／靜態`1aa1ae164c31d690`、真正Chrome156.0.8078.49，沿原工具兩個情境均通過；工具SHA256`6e6eb60bab8e995fd580d4e6fb89842be8847f7ebe25fe64d9fb3c937e7de08b`，worker／storage與本候選相同。本聊天只讀核對完整JSON、原工具及固定sentinel公式，不另啟動媒體或操作他人的鎖。

- **pending-write**：真正metadata／media兩個trusted put已成功，交易內看見候選筆記，兩次barrier均settled／complete／abort=false，keep-alive ticks140→3344；此時對自有群組真正SIGKILL。同profile新程序未清庫、未匯入，完整native metadata、產品JSON、revision、keys與1,048,613-byte舊Blob快照與中斷前精確相同。相同候選重試revision1→2、每byte對新公式相同，原生新資料與候選相等；再正常退出，用第三程序重開的整份snapshot equality由原工具斷言及committed-restart-verified事件通過。**第三份snapshot未另序列化**，本聊天不宣稱獨立逐欄比對第三份raw。
- **修改後default**：候選只寫入1／12資源、第二個HTTP回應尚未完成時真正SIGKILL；同profile新程序在導航前offline，由舊SW取回完整舊殼、manifest、metadata／keys／Blob。before與after整份快照精確相同；真正offline probe失敗且serverProbeHits=0，沒有以產品offline標籤代替網路證據。

舊sentinel SHA256`6ef72dcccd9b51e3a7f384632a9dff22af4c12372f3396fe557011d42e867971`；重試新內容SHA256`bf53d764260842712bdcd2741340db837b4885e87d9fc23e62500135b4650e5c`，本聊天依原工具兩個公式重算相同。原snapshot的allBytesMatch固定檢查舊公式，替換後為false符合預期；新公式逐byte由retry.everyByteMatches=true另驗，不能把舊公式欄位誤當重試失敗。

兩情境mediaCalls=0；原工具及交叉清理收據確認51個已知自有PID／5個群組退出、精確profile程序0、兩個主機埠拒絕連線、自有nonce釋放。pending-write與default原始收據SHA256分別`eece2e28f3cf4a9cc58723ff826182704435d607725ef32392e1b46cb6b639aa`、`7f68cab420695a3ba1010c3e9a33dc1d740d329e40bf82170edd1ad953513ab0`；清理總收據`de12a047257762af60b60fb1e9156726c6c52e0617254092039dde23712137f9`。profile、程序命令、raw端點及操作識別不公開。

這是人為延長未提交交易與更新下載中的函式／SW證據；不可播放sentinel不代表新VS救援、媒體品質、產品Stop、chunks提交、提交瞬間、斷電、真正低磁碟／quota、永久保存、Safari或裝置驗收。原EEXIST拒絕與16bd歷史default保留各自來源，不把本次兩案擴寫為整張#13完成。



## 2026-10-29 最終 Web 候選整合續作

本輪從同步 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e` 建立本聊天專用 `chore/p0-web-final-candidate`，以一般 PR 供後續審查；不修改來源分支、不合併 main、發布或關票。下方早期 #58／#62 整合數據保留歷史來源，不能當本輪新測。iPhone 持續暫緩。

### 9bb26d0 尾部完整性與保存前片長拒絕續修

從凍結整合ef11498882c62c71874c94f9185dff1683a2329b接續合入PR #64正式來源9bb26d001a956d7bdf95819464c46dbcfcad1a99。只在webmOnly使用不帶timeslice的start()，相機、普通Chrome及一般WebM備援仍start(1000)；沿用原生stop／error／尾塊收集。所有新VS在load後、清除驗證元素及替換或保存前，核對未取整且有限的validationVideo.duration與comparison(value).durationMs，差超過原100ms即拒絕。整數metadata、來源邊界、時間戳、音訊、250ms及原v5均不變。

正式ef11498／靜態c89526422abc77a3的原生Safari矩陣保留原結論：同頁0.5／0.75×各15／30／60秒前六案原v5通過，第七案1×15秒失敗即停止，尚未執行第八、第九案及十輪。第七案451次擷取請求只成422格／14.055秒，尾部覆蓋-1033.333／-1000ms、15音14閃；產品已讀回14056ms仍保存。2,333,655-byte下載與native chunks逐byte相同，SHA256 58bcf03d9300ec3dd15852fd851f52711a507e6c9ea41d1aecf0a09f4f9e0bad，不能歸因下載遺漏。本聊天已獨立核對七案檔案、分析及實際載入的產品指紋；第七案收據SHA256 5ec21fbd0d902dc8810f2abf98d93327fe0e4e0308400c694e40e7ce0b26f40f，原raw為dbf3ba2fab5c4be321f23c2e554f6a4fa7d273c6dbc8312b6e3f51d307b038c8。

後續私有recorder SHA256 0e463ca1020e201aeaf13bed36473c22a8b5cccb866f75e84671f397fb0d8824只改專用WebM的timeslice；base仍ef、靜態標記仍c895，不能當乾淨ef重跑。新execution native-final-84534500816f同頁1×15／30／60秒原v5三案通過，下載各2,519,623／4,699,499／9,410,435 bytes與native chunks完整相同，片長15.023／30.020／60.026秒、影格452／901／1801、最大聲畫43／46／48ms。主程式仍為ef，當時尚無新片長護欄；本聊天獨立重算下載SHA並核對原報告，沒有重跑媒體。完整指紋、原失敗與來源採用理由見[尾部來源證據](issue-3-bounded-audio.md#正式整合矩陣第七案缺尾與單塊webm續修來源)。

根聊天回報兩輪自有服務與nonce已收尾、兩個原生頁已關閉；Safari WebContent 17856仍被OS保留為約60MB的spare cache，不能宣稱原生瀏覽器所有程序已退出，也未kill Safari或操作無關私人分頁。此項與來源Chrome工具自己的36個程序／4個profiles收尾分開記錄。

來源9bb26d0的四項Chrome短回歸與CI #133已由來源聊天回報通過，正式head的離線全片解碼收據待後補，不轉記為新整合head受測。此輪只整合與跑原check／hooks，不啟瀏覽器、服務或媒體鎖；新乾淨head／靜態交根聊天優先原生九案、十輪及新VS未確認救援，最終包待同版證據整理後再建。TECHNICAL保留全部兩邊內容，新尾部設計為第37節，舊16bd／84證據順延第38節；下方6f及所有歷史數據仍維持其來源。

### 6f7f89a 啟動順序續修

從84a85fd接續合入已推送的PR #64 `6f7f89a54b0914ebf9d93250d39c18e21b75bc0c`。產品差異僅localAudio VS同步完成record(stream, undefined, undefined, {webmOnly:true})後，直接沿原10ms排程／兩側播放，移除main unused audioReady import及舊等待註解。共用recorder、相機／Chrome原聲路、#70 storage／救援及全部品質門檻不變；QA保留change capture File Map，另核對真正native start延後交付時輸入仍已開始。

TECHNICAL衝突保留新啟動設計及整個第37節的16bd證據；QA衝突採來源6f的多行Map與延後通知回歸，其原File保留與完整bytes／URL斷言不變。84a85fd以前的文件與來源提交全部保留。此後runtime已有啟動順序差異，**16bd7ca的Chrome24、網站外播放、quota／forced-install不得改寫為新整合head重跑**；舊84a85fd乾淨包亦維持其來源。

本聊天只讀核對私有main 5b75942873f8202663badab32dabd4889243f8223d000131c9611aff720a568c的兩短Safari收據：同頁無重載／清庫的1×30秒及0.5×15秒原v5均過，兩份產品下載分別4,795,278／2,197,853 bytes，完整bytes等於native chunks。半速最大逐格配方100ms、內容時鐘125ms保留；收據SHA256 bc7ca06222d8befc69a01ec0223f98be76048c2a32f61a8a3cb2ca9c2a99a38e。這些是私有來源，不承接為正式6f或本整合head的矩陣／十輪通過。

本輪不啟動媒體或取得鎖；原check／提交與推送後交付乾淨整合head，根聊天優先續做同版原生矩陣及新VS未確認救援。來源短回歸與後續純文件收據可再補；精確新head／靜態／CI由PR72綁定，最終包待同版證據整理後另建。下節各段保留先前受測版本當時的事實，不把私有改善或舊包當成新版驗收。

| 已保留的來源 | 固定提交與範圍 |
| --- | --- |
| PR #64 | `9bb26d001a956d7bdf95819464c46dbcfcad1a99`，保留起點／啟播歷史，採專用WebM無timeslice及保存前原100ms片長拒絕；各正式失敗與私有改善保持來源 |
| PR #65 | `f72cb2ff2b500530692c81fadfb8d86ce83aeb36`，獨立配額重跑的匿名收據，原生數據仍屬舊 runtime |
| PR #66 | `b8dd611333f95bb4d75d8192bac2e186900a7b60`，保留未確認程序的自有鎖、只釋放已確認未啟動的 spawn error |
| PR #67 | `72aed830b60f595794d178b715fae78e60ff0b09`，保留 e0acf88／f88c28d／eb21064 及三份私有對照的實際結果 |
| PR #69 | `566f04ae7f312cfd3f29ff3b864fddc70c76f4ef`，選用未提交metadata／Blob交易的強制終止；整合保留#66程序／nonce保護，原生結果以同版段落為準 |
| PR #70 | `d597e4ad5f23d8cc9c813b745df934c32d362ad3`，runtime 等於已獨立重審的99e862d，含未確認救援、排隊動作再檢查及真正取消 API／原生 abort 單輪收據 |

TECHNICAL 同位置追加衝突保留配額歷史及未確認契約兩邊內容；整合 #70 的 merge `811d86a` 當時產品逐 byte 等於 PR #70，經原 check／hooks：401 tests／1477 expects／0 fail。之後納入正式41b3023；main.js 合併兩邊互不重疊的控制器修改，storage.js／index.html／types維持#70，recorder.js及呈現等待維持#64。這是中途非媒體檢查，最終 runtime、乾淨包及 CI 由後續交付另綁。

[最新未確認保存證據](issue-13-unconfirmed-storage.md)中的原生 Safari 私人／一般結果只屬99e862d；[獨立 quota 重跑](issue-13-native-quota-repeat.md)仍屬其原 runtime。指南新增記憶體筆記救援與原頁重開步驟，兩份匿名證據明列入包；沿用既有指南連結回歸，不新增遞迴收集或影片附件。

整合16bd7ca的Chrome原24組、網站外Chrome檔案播放與兩項原生儲存／更新工具已補驗，見下節；Safari正式41b的完整原生矩陣／十輪、整合版Safari、新VS未確認救援、產品Stop／私人UI取消及人工／實體／跨裝置仍待各自證據。工程 Chrome 模擬 UA 分支的 WebM native start互等失敗另保留，不偽造start、不省略格式回歸，也不由該工程輪斷定真正Safari失敗。私有 WebM 1×30秒單輪不能移記正式或整合 head；後續根聊天持鎖驗證，這一整合步驟未啟動媒體或取得共用鎖。

儲存原生取消收據另屬81bd2c9的五份原樣儲存模組：真正 trusted abort 後1ms回AbortError、unknown=false，完整舊metadata／sentinel bytes保留，正常重試complete。只涵蓋儲存API，不代替本整合head、產品Stop、新VS或私人取消。

正式41b3023的Safari半速15秒已有自己的原v5單輪通過：VP8／Opus15.026秒、454格、聲畫80ms、完整覆蓋true、完整匯出15,399ms，產品下載2,221,513 bytes等於native chunks。最大逐格配方差100ms、內容時鐘差133.333ms仍完整保留；此結果只屬41b來源，不移記為本整合head、新檔網站外播放或矩陣／十輪通過。16bd7ca至84a85fd時的整合產品組成固定，靜態fe23327aa3da26c5；6f啟動續修後另綁新整合head／靜態，不沿用相同runtime宣稱。

Safari QA 指紋續審：9151ce4已避免被 CSP 拒絕的 fetch(blob:)，但成檔後讀 input.files 仍會取不到來源。隔離 Chrome 真 FileList 配合原 chooseFile 直接重現1→0件；於原生 change 擷取階段保留 File 後，完整原 bytes 仍可讀。這一修正只改測試工具，不改產品或 CSP；原工程分支仍有 native start 互等失敗，沒有宣稱完整回歸已因此通過。

### 16bd7ca 同版補驗

2026-10-29，根聊天在乾淨 `16bd7ca64f797c937fb4cf5153fce688e8ea8602`／靜態 `fe23327aa3da26c5` 真正重跑。本聊天只讀核對原始案例、原分析、完整下載、儲存快照及清理收據，沒有代跑或修改原測試。後續只補文件；受測head保持16bd7ca，新的文件head及乾淨包另由PR綁定，不能寫成新版重新跑過影音。

#### Chrome 24組與48份下載

macOS27.0.1／原生安裝Chrome156.0.8078.49 headless、一般UA、Bun1.4.4、FFmpeg8.1.2。真正程序參數已核對只用自製假相機，沒有真人相機／麥克風；14份受測資源與本候選逐檔相同。沿用未改的 `media-feasibility.js`、`run-media-feasibility.py` 與分析器v5：矩陣9、穩定性10、WebM1、正負校正2、恢復1、長輸出1，共24組全過。24份原始紀錄均sourceDirty=false，所有fullDecode／完整覆蓋／合成目標／完整耗時驗證為true，影格訂閱pending=0。

| 原24組量測（只屬16bd7ca） | 結果 |
| --- | ---: |
| 最大聲畫差 | 60ms |
| 最大配方差 | 71.533ms |
| 新增漂移最大絕對值 | 63.234ms |
| 最長重複畫面 | 71.567ms |
| 最低平均fps | 29.984 |
| 完整匯出最高上界 | 64,076ms |

48份實際原片／VS都由原流程完整解碼並留指紋；本聊天另重算全部202,261,876 bytes的下載SHA，與收據相同。最後24份take／24份export，預期48份媒體均存在可讀、missing=0。這是原案例的存在／可讀檢查及下載指紋，**不是新增一次逐份最終IndexedDB全bytes比對**。十輪使用同context／IndexedDB，但原腳本每輪仍導航；不宣稱無重載生命週期、實體裝置或無資源洩漏。

原瀏覽器函式SHA256 `cf8f8f02bb6cacb7e6d894b40c2a7dd7064bd9b931cb74e76228585e83ea1c03`；原run-media腳本 `8de3caec2a246c0fb40df52431515f59e7b876b4277439a5591070fe492af881`；原v5 `3f4aec9788880037a585ff81c6f77a0e56ab456dc835aa4cbe0cb0cbe1cbeaaa`。最終收據SHA256 `0ff3d0d95775c350eff1e64df24757925b6f2c8b315462fa4494b242f379831e`，verified-results為 `5471c72d181039a3b5b5b9a6b9ed8fd2bb7869ee0e8611ce1b3672b8e6ad7dfa`；raw與媒體留根聊天本機，不進包或公開附件。

#### 網站外真正檔案播放

產品主機及原瀏覽器先停止，再以全新隔離Chrome156、`file:`入口執行原 `download-playback.js`。下列三份均為上述24組的實際下載，完整bytes／SHA相同，原生play到ended、error=0、mediaCalls=0：

| 檔案 | bytes | 呈現frames／dropped | 已解碼audio bytes |
| --- | ---: | --- | ---: |
| 正常MP4 | 2,322,713 | 449／9 | 22,667 |
| WebM | 3,435,488 | 450／0 | 163,402 |
| 校正MP4 | 2,297,167 | 444／0 | 20,171 |

這是靜音headless Chrome的原生播放／解碼收據，不代表Safari、人工聽感、Files／相簿或跨裝置保存。原播放函式未改，SHA256 `737e4be2d69c9f6c60da1c20c73754558b8d4b2416793bfaa989bc5a2c7c2ba1`。

#### 新整合版原生配額與更新中斷

同一乾淨16bd7ca以原 `verify-native-quota.ts`（SHA256 `1489d1e546587eceee7373458a82aa8834900915df28c57b5a8a6e889e66cdbb`）及storage.js（`d470fecd1c030878ae2e1750f68d3ad130e84d8393bdfaafb99dbd68a98b2e8a`）真正重跑。512KiB origin配額下，新增／替換皆有trusted readwrite交易abort／QuotaExceededError，產品拒絕；非空video／marker／move／take／recipe／export、三份media及chunks全保留。11份完整快照逐物件相等關係、47筆Blob記錄的完整base64／長度／SHA均獨立重算，拒絕後再等1秒仍相同。解除override後同候選重試revision3→4→5，原生metadata與完整Blob匹配；正常關閉後同profile新程序讀回完整相同。此工具直接旁聽error／abort，不另宣稱捕捉到trusted complete事件。兩次自有程序清理各核對7／6個PID歸零，override已解除、主機及自有nonce鎖收尾通過。result收據SHA256 `1e61ab51f3d5449e9b6f8aa0ade5ed5aa173b7ea6227980db9948e10638bbf11`。

原 `forced-install-restart.ts`（SHA256 `f4c8eb229e55dca2e62f00f7c3f5b80d66e1aee278ac83060358382dccaa9953`）亦在16bd7ca／fe23327aa3da26c5重跑：完整舊cache12份，候選僅1／12且CSS真正HTTP回應未完成時，向自有群組SIGKILL。確認群組為0後，同profile新程序在導航前離線，取回舊完整shell／manifest、全部筆記與原生metadata、keys及1,048,613-byte sentinel，每byte／SHA相同。重新導航的主機probe=0、nativeOnline=false、fromServiceWorker=true，mediaCalls=0；兩個自有群組最終皆0，自有鎖釋放。worker SHA256 `18df1e0d6794df412b491f8d9c09208316e5b1b0c6897a1b1292ac682157df18`，收據SHA256 `da567e3a8fac7fe81e78978b71b7b874cdd55939dc071a37855104d9b9cd515c`。

配額與強制中斷使用不可播放的合成sentinel，不是新VS、真低磁碟、停電、寫入提交中強殺或永久保存驗收。兩個工具的新結果屬16bd7ca，先前#65／#66及舊worker收據仍各自保留，不相互移記。

#### G7稀疏觀測與剩餘界線

只有一筆活躍G7取樣：自有QA daemon＋Chrome的RSS加總1,359,088KiB，可能重複計shared pages，不是app獨占footprint、峰值、最低或無洩漏證明。AC供電；同時系統工具回報整體記憶體free50%，不能歸因於此程式。熱狀態原文為「No thermal warning level has been recorded／No performance warning level has been recorded／No CPU power status has been recorded」，不代表實際溫度或無降頻。關瀏覽器後RSS=0及free53%僅支持清理，不納入活躍最低值。溫度、電池消耗、低記憶體／熱壓力、手機與長時間常駐仍未量測；原G7收據SHA256 `3b59c13d0caf287916f7cf3159c85c219e652d0a7f5e2a7dbf705d8177d57725`。

捕捉流程的自有瀏覽器／主機／nonce及網站外播放器的6個已知程序／nonce均已收尾；沒有清理其他聊天的程序。正式41b／99組成未變，16bd7ca的Chrome WebKit-UA分支原native-start等待失敗仍單列。後續私有no-start-gate（5b）雖由根聊天回報完整Chrome工程／clock／錯誤重試通過，仍未採用；真正Safari兩個短配方因桌面鎖定尚未執行，不由本輪Chrome或先前Safari半速單輪推定通過。

完整整合版Safari矩陣／十輪、新VS未確認救援、產品Stop／私人取消、真人五人／讀屏／聽感、實體相機／跨裝置及Claude Code／使用者最終審查繼續保留。Web優先、iPhone暫緩；不關票、合併、部署或發布。

## 以下為先前整合的歷史紀錄

2026-10-29（Asia/Taipei）。使用本聊天專用全新 clone，從同步 main 建新 feature branch，保留兩張來源 PR 的完整提交；來源 PR 與 main 均未合併，未部署、發布或關票。重要變更仍須 Claude Code 或使用者最終審查，iPhone 暫緩。

## 來源與整合範圍

| 身分 | SHA／歸屬 |
| --- | --- |
| 開工 main | `918d8d7aa814533823522e3d4e0ab18df75cb212` |
| #58 可靠性來源 | `2d313027c28ebc1d4f7cfd03177fbb8141fd7d23`，保留其 #55／#56／#57／#59／#60／#61 提交及作者 |
| #62 Safari 來源 | `13976bb83e259be699f7c822cc125850e776f81e`，保留 eb8f10d、05099e5、c211c94、85dde00、13976bb 及作者；交付前新增文件 head `676ba501914f278ab1aa0d2c40990f9a0bff23ae` 亦已保留 |
| 整合 head | 本文件所屬合併提交；精確 SHA 由交付 PR head 綁定，不把任一來源 SHA 當整合 SHA |
| 初輪瀏覽器檢查的未提交狀態 | 基於 #58、合併 #62 的工作樹；提交後同版檢查與乾淨包另在 PR 綁實際測試 head |

主機每次 GET／HEAD 的完整路徑連結防護、完整 v1 備份／v2 保留、編碼器先停止後收尾、部分更新回滾、強制中斷及原生 quota 工具全部保留。Safari 有界 AAC、空 edit 靜音、100ms 獨立音訊偏移拒絕原樣整合，不重新設計時間線，不改 G2／G3／v5、schema 或資料交換格式。

`local-audio.js` 繼續由同一 `webFiles` 加入建置、主機、SW 與下載包。打包清單合併兩邊匿名證據，另補 MEDIA_PROBE 實際引用的9份既有匿名文件與本文件；從所有隨包操作指南推導證據依賴，不遞迴打包 output 或 QA 工具。原版媒體、私有輸入與服務紀錄不上傳。

交付前來源查核發現 #62 新增 `676ba50`：只在三份文件加入30行原24組的完成證據，Web／建置／主機／測試皆未改。後續合併提交保留該提交及較新文字，不覆蓋；本候選資源仍逐byte符合13976bb，原媒體數據不移記為新測。最終check／包來源與SHA由交付PR綁定，原b43851f的CI與舊包只屬初輪，不冒充最新head。

## 驗證與版本界線

初輪整合（`b43851f`）Bun 1.4.4 原 `bun run check` 通過：**382 tests／1307 expects／0 fail**、228檔公開掃描、checkJs／SW 型別、Biome（原19項info）及 build 全過，原 hooks 保留。首輪擴大指南測試誤將尚未建置的 notice 副本當來源指南，因 ENOENT 正確失敗；改為只讀隨包的來源操作指南，沒有預先建置來掩蓋順序問題，也沒有減少指南覆蓋。原失敗日誌留在本聊天 work。

候選 `package:web`／`check:package`、原生 tar 解到 Git／node_modules 外及56檔原生 SHA256SUMS 皆通過；正式乾淨包的來源 head／bytes／SHA在提交後交付PR另記，不沿用本次未提交包校驗。來源續補後全部操作指南的38個本機證據引用、21份不同證據均在明列白名單。

真正裸包 HTTP 啟動後，13個公開資源的完整 bytes／SHA／安全標頭、local-audio.js 的 HEAD 空body、四條禁止路徑及POST拒絕通過；#58 的原單元另驗啟動後換檔／父目錄連結、硬連結與缺檔，不放寬。

既有 `offline-multi-tab.js`（SHA256 `2c939dfb4f38f204c91080ac6f4762da72b76e514caf6c32cc473b184c6166e1`）在隔離 Chrome156.0.8078.49 headless 上通過：兩個舊控制頁、候選waiting、第一頁關閉後第二頁仍可保存同一動作、第三頁導航仍用舊active、全關才換版；完整筆記／revision及無關cache保留，媒體API呼叫0。受測工作樹 git HEAD 為2d31302、trackedChanges=true，包含本次#62整合，不冒充乾淨2d31302原版。四個已知自有Chrome PID全部退出、兩個自有主機停止，nonce鎖釋放。

含 notices、_headers、SW 的14份 Web 建置資源，與 #62 提交內容重建的確定 bytes 逐一相等，亦符合允許讀取的主回歸 `state.json` 及其包驗證紀錄指紋；靜態仍 `adbe8eb1d6acfd09`。下表列本候選 bytes／SHA256；沒有直接讀取其他聊天的產品檔案。#58的storage／recorder／SW原碼、主機、quota／強制中斷／多頁工具另與來源逐byte相同，但編譯SW因manifest新增音訊模組而不同。

| 資源 | bytes | SHA256 |
| --- | ---: | --- |
| index.html | 19296 | `1ae8198da59a5497a09f807d90719b5a314c6bc00cdc131083e3af01c112efa4` |
| style.css | 6318 | `e4770b8986042bbf7f356a0243f8afd164d31aad29d32c69bebc95c29efdf0c0` |
| main.js | 114382 | `c0d092f7ed322e924ca3a43d79b6c6696d1032f08001759b4e0f3e539f055689` |
| timeline.js | 2876 | `8b8552cc3c754c053844e849c78423d85e8189e55cdc25da8ea6ca67f9017429` |
| local-audio.js | 14125 | `456d0d080e395574160f547554bd224933dff8d3ebc6f7898f467776dd996ea3` |
| beats.js | 2853 | `d25c6893043db7456cb32c4b64c1dbee982b33c3bb94a41966bfabe0bd0bcf9c` |
| recorder.js | 10189 | `82fa334d95d669e2483f29af64ea6e18e489114ba6c1902b68216d7ea27e269a` |
| library.js | 30662 | `1e718fc3c7afcda2cb62d643223b37d5489386e65d0b45b138ff1bf68b51911c` |
| storage.js | 8287 | `2de40d537d2ab049596acaaf549e9e9d324e7b8ce705b0edfe86af1396dbbd77` |
| offline.js | 5252 | `28a3d275e323658f697f2cd4abf123b42f25c0e280d31a3a5046e1b0c8f71da5` |
| sw.js | 4349 | `e8bffdacb06b2f7cc5b27749325c0c9a9cea4d4fd33ba21bc21b5e1c26b7741f` |
| LICENSE | 4563 | `c0ea4a896d2c8c394b29f9427589996db826cd501c512279ff0ed3ef48fabbe5` |
| THIRD_PARTY_NOTICES.md | 1502 | `79253f8dbced1f4184173360078eead5d7291bd8f85f285b0dbd734f3fe162f8` |
| _headers | 456 | `874bd98b3d71cdd3979fffa831a68cfd4986d0a25e9688ba4a94657f98f83453` |

#58 的原生 quota 證據綁乾淨 `2d31302`；其 storage.js 與本候選的 byte 身分另核對，不把這項歷史原生測試改寫為本整合 head 重跑。強制中斷的舊 worker 為 `db129e273cf0039b`，與新增音訊後的 manifest 不同；主聊天後續已在自己的乾淨 `9d483e0484a5781c7e93dbd36213431bcbde85dc`，以未修改的原工具重跑新 worker `adbe8eb1d6acfd09`：12份完整舊資源、1／12份候選且CSS回應未完成時真正SIGKILL，同profile新程序離線取回舊殼、完整筆記與sentinel全部bytes／SHA。原生狀態、PID／signal、零主機重開請求及自有程序／鎖收尾均直接記錄，exit0；兩輪識別與限制見[強制中斷證據](issue-13-forced-install.md#整合候選新增音訊模組後的重跑)。這是新manifest的實測，不將雙頁更新、quota或媒體矩陣移記為9d483e0重跑。

主24組由另一聊天在乾淨 `13976bb83e259be699f7c822cc125850e776f81e`／`adbe8eb1d6acfd09` 執行，本聊天沒有重跑同byte矩陣。開工時尚未完成；交付前已核對允許的 `state.json`、`verified-results.json` 以及主聊天實際terminal：最後performance案例quality pass，`collect-results.py` exit0，24／24組成功，原自有PID／主機／鎖均已清理。原矩陣9組、同context／IndexedDB十輪、WebM1、正負校正2、恢復1、長輸出1；全部原v5 fullDecode／完整來源覆蓋通過，保存檢查missing=0。48份下載有實際檔案指紋；這不是本輪新做live IndexedDB逐byte比較，十輪每輪仍有原腳本導航，不能稱無重載生命週期或裝置資源量測。

| 原主回歸量測（只屬13976bb） | 結果 |
| --- | --- |
| 最大聲畫差 | 88.333ms |
| 最大配方誤差／新增漂移絕對值 | 48.911／42.511ms |
| 最長重複畫面 | 70.966ms |
| 最低平均fps | 29.943 |
| 完整匯出最高上界 | 64,003ms |

來源、整合、測試與包識別分開，媒體數據只由逐檔相同的runtime承接原歸屬；本整合head的提交後check／乾淨包在交付PR綁定。沒有讀寫主聊天其他檔案，亦未操作其服務或程序。

主聊天補齊新manifest重跑後，只續補四份文件；原check再次通過382 tests／1309 expects／0 fail，公開掃描228檔、型別／原lint／build通過。新增的強制中斷證據連結使操作指南引用由38增為39、不同文件由21增為22；包內本來已有該文件，這次補上指南的直接引用。第一輪受限執行在本機port 0 listen被拒而失敗，未調整測試；以允許本機測試連線的相同原入口重跑通過，兩份日誌均保留。最新提交後的乾淨包／CI識別由PR另綁。

## Safari 與剩餘 gates

一般新視窗已可測，不需建立 Profiles 或更改日常設定；一般保存／關窗取回的歷史成功不代表完整 VS 品質。早期原生結果仍綁 `eb8f10d`／`cbf341585240931f`：1×及0.75×15秒曾過原 v5，0.5×15秒完整覆蓋／漂移失敗、1×30秒被原250ms同步護欄拒絕。空 edit／音訊時鐘修正版尚未完成原生完整矩陣；私人儲存另有原生 Blob 失敗。主聊天已在解鎖後續測e0acf88與後續f88c28d，半速護欄／原生等待逾時及未採用原型的完整失敗界線見[最新原生續測](issue-3-bounded-audio.md#整合版續測與起點等待候選)；不是仍待解鎖，也沒有宣告Safari通過。

Chrome 合成結果、程式／包相同、CI 及測試替身都不能代替 Safari、真人五人／讀屏／聽感、實體相機／音訊／背景／跨裝置、完整 G1–G7 或獨立審查。免費主機比較仍屬2026-10-28查核，發布前須重查，未藉本次整合更新價格或支援承諾。所有未驗收子票與 #1 保持開啟。


## 最新 head 的審查續修（2026-10-29）

本輪審查從當時最新 `e0acf88391c31ce75a5419d80a1e77691b316eb3` 開始；期間來源更新為 `ebdbe5c`，PR #63 於2026-10-29 06:55:42（Asia/Taipei）由其他操作合併為 main `38e6cf96793cf7250e4adb86a1156e6e6e0fe08e`。本聊天未執行合併；原 PR 已無法接收續修，因此從同步 main 建 `fix/pr-63-media-probe-cleanup` 後續分支，保留最新平台暫存目錄變更。已核對這項來源更新未修正下列兩個缺陷。較早自動 review 只綁 `b43851f`，不視為本輪或最新 head 的獨立審查章。已逐項檢查本 PR 的產品、主機、打包、備份／更新回歸與 QA 工具，確認兩個 P2 QA 收尾缺陷：

- `forced-install-restart.ts` 在程序查核或停止失敗後仍會刪掉自有鎖；若主程序先退出，原程式甚至略過群組查核。修正後保留未確認退出的 handle／鎖並標失敗；只有整個群組為空且 owner nonce 相同才釋放。owner 讀取失敗也會留下錯誤並完成自有主機收尾。
- `verify-native-quota.ts` 在主流程正常 close context 後，CDP 或 ps 核對若失敗，context 已清空，finally 原本可能漏掉失敗標記而放鎖。現在進入 close 時先標收尾未驗證，唯有全部已知 PID 退出才清標記，任何中途錯誤均留鎖。

故障回歸直接取用實際工具的 stop／close／finally 程式；用合成邊界重現，不向任何 OS 程序送訊號、不讀寫真實鎖。以本聊天 work 保存的未修改 e0acf88 工具快照跑同一組故障回歸：2 pass／7 fail，直接重現提早刪鎖、未查群組與 owner 讀取失敗跳過後續清理；修正後9 pass／52 expects／0 fail。兩輪均只在記憶體執行，沒有瀏覽器、主機或真正共用鎖操作。原始失敗／修正後完整檢查及提交後實測結果由交付 PR 綁定，不把測試替身當成新的原生媒體或 Safari 驗收。

這次只改兩個 QA 工具、其單元回歸與技術證據；14份產品 Web 資源仍須與13976bb逐byte相同，下載包仍只明列匿名指南／證據，不加入 QA 工具。Safari 未過項目、真人／實體／跨裝置與最終獨立審查繼續保留，iPhone 暫緩；不合併、發布或關票。

本輪原check於 main38e6cf9 上的修正工作樹通過：391 tests／1361 expects／0 fail、229檔公開掃描、原型別／lint／build通過。修正後強制中斷工具另在相同工作樹真正執行成功，仍為adbe8eb1d6acfd09：候選部分安裝、SIGKILL、自有群組退出、同profile離線重啟與已提交資料保留通過，媒體API呼叫0、自有nonce鎖釋放。首次碰到另一輪quota工具持鎖時正確EEXIST拒絕，未啟動瀏覽器或更動原鎖；原拒絕及成功紀錄都保留。原生quota收尾的正常／故障分支由上述真正程式碼回歸涵蓋，本輪未重跑其完整原生配額實驗；舊2d31302容量證據維持原歸屬。測試工具SHA、最終提交與CI由後續PR綁定，不將未提交工作樹來源冒充乾淨main的新測。

## PR #66 續審的啟動失敗邊界（2026-10-29）

審查固定於當時最新 head `b423027ef29d75e3eabb819aafc6cfddda7b0095`；確認一項 P2 QA 邊界：OS 以 EACCES 拒絕 spawn、ChildProcess 從未取得 PID 時，原先收尾仍認為有未確認程序，留下自有鎖，阻擋後續測試。既有自動 code review 的零 findings 只是一份原 head 收據，不取代這輪直接重現。

用不可執行的自有合成文字檔實際核對 Bun1.4.4 的 EACCES／pid undefined／close code −13；沒有瀏覽器、HTTP 主機、相機／麥克風或真正媒體鎖操作。新增無 PID error 單元在修正前失敗，修正後連同原回歸12 tests／73 expects／0 fail。兩個保護情境另驗：error 已有 PID 而群組未確認時，以及只有無 PID、未收到 error 時，都仍保留鎖，不向未確認群組送訊號。

另直接執行完整原工具的 EACCES 路徑，來源為 b423027 上的修正工作樹，工具 SHA-256 `f4c8eb229e55dca2e62f00f7c3f5b80d66e1aee278ac83060358382dccaa9953`、靜態 adbe8eb1d6acfd09：實際取得共用鎖後未產生瀏覽器 PID，保持 failed／exit 1，無 signal／connected 事件，自有 nonce 鎖釋放，原本機 HTTP 入口停止接收連線。此案例沒有啟動瀏覽器或媒體，不能當作正常強制中斷／重啟新測。修正工作樹完整原check亦通過394 tests／1382 expects／0 fail、229檔公開掃描、型別／原lint／build；最終提交與CI由PR綁定。

修正先保留本次 spawn error 與固定 child，再只對「明確 error、無 PID、仍是本次 handle」清除已確認不存在的程序；主循環回傳原錯誤，finally 沿既有 nonce 檢查釋放自己的鎖，測試仍標失敗。正常 Chrome 強制中斷／原生 quota 的歷史證據維持原版本歸屬，本輪只做非媒體檢查，未重跑原生瀏覽器或影音矩陣；最終提交／完整check／CI由PR另綁。

原生 Safari 的最新直接證據另屬 [PR #67 的98fb551](https://github.com/sunpochin/dance-stamp/pull/67)：一般視窗已解鎖續測，半速啟播、尾端長度及起點等待候選仍有原門檻拒絕／逾時，私人儲存恢復仍待驗。不要覆蓋為「等待 Mac 解鎖」，也不將本工具收尾修正視為產品或 Safari 品質通過。Web 優先、iPhone 暫緩；不合併、不發布、不關未驗收票。
