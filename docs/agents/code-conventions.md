<!-- 檔案用途：只保留練舞產品的程式與狀態補充。所在層：產品規則接線。主要關聯：AGENTS.md、TECHNICAL.md、skills/awm-debugging。 -->
# 練舞產品的程式與狀態補充

通用找根因與非同步觀察先用 [awm-debugging](../../skills/awm-debugging/SKILL.md)，像先拿共用的檢查手冊，再看本產品哪些資料一定要保留。這裡只記 Dance Stamp 的特殊契約。

- 時間映射、鏡像與音訊門檻只用 [RECORD_COMPARE.md](../RECORD_COMPARE.md)，資料交換依 [DATA_FORMAT.md](../DATA_FORMAT.md)；UI 不另建一套規則。
- 相機 tracks、播放器、object URL、影格訂閱及監聽器依現有 owner 與停止／取消／離頁流程清理。不能以清庫或提早撤銷舊片 URL 解決競態。
- 保存拒絕與是否提交未知要區分，保留原片、筆記與可救援內容。成檔後保存尾段與交易特例依 [TECHNICAL.md](../../TECHNICAL.md) 與既有實作，不一律改成 abort。
- 新檔導覽、繁體中文原因註解與交付規則依根 [AGENTS.md](../../AGENTS.md)。驗證使用 [工作流程矩陣](workflow.md#驗證矩陣)，媒體及儲存需另留指定證據。
