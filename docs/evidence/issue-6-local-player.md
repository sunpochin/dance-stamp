<!-- 檔案用途：#6 方向、格式與錯誤回復證據。所在層：桌面驗收。主要關聯：MEDIA_PROBE.md、TECHNICAL.md。 -->
# #6 本機選片與可恢復播放器

2026-10-27，macOS／Chrome 156.0.0.0，Bun 1.4.4。合成素材均由本機 FFmpeg 產生，不含真人或第三方音樂。前置 #26／#28 仍獨立等待審查與合併。

| 素材 | 實際解碼與播放 | 尺寸／方向 |
| --- | --- | --- |
| H.264 MP4，無音軌 | pass，時間實際前進 | 640×360、contain |
| 直向 H.264 | pass | 180×320、contain |
| 90° 旋轉 metadata | pass | 360×640；ffprobe 確認 display matrix 90° |
| VFR H.264 | pass | 640×360、contain |
| H.264 MOV | pass | 640×360、contain |
| 改名 .data 的有效 MP4 | pass | 640×360、contain |
| 壞檔 .mp4、空檔、取消 | pass：拒絕並保留來源／筆記 | 原位置恢復至 2 秒，誤差 <150ms |
| HEVC、HDR 色彩、其他裝置 | 未驗證 | 不因 metadata 宣告支援 |

314 項 unit、TypeScript checkJs、Biome 與 build 通過。新生命週期回歸覆蓋啟動同步拋錯、非同步 play 拒絕、預先／途中取消、逾時與 listener 清理。十次反覆換片：現用 URL=1，候選期間最高=2，沒有殘留播放。

media-probe.js 的合成相機→15 秒帶音訊單一 VS 與取消釋放通過；self-failure.js 證明自拍壞檔／空檔不影響原比較，調整 offset 後配方仍可保存。JS 時間差不是 G2 成檔同步證據。完整相機、G1–G7、手機與獨立 review 仍不在本票結論內。

先跑 scripts/make-media-fixtures.ts，再跑 scripts/make-player-fixtures.ts；新測片工具已在空目錄完整重製成功，既有檔案會拒絕覆寫。CLI 方法見 MEDIA_PROBE.md，精確提交與 CI 見本票 PR。

## 同步已審主分支

整合 main `9e99ae6` 與 #5 最新同步，保留播放錯誤提示與已審音訊恢復，沒有重複註冊 play handler。受測靜態內容 `9fd3c39cd617733a`；314 tests、型別、lint、建置、掃描通過；全新 Chrome 的 review-recovery 11 項及完整 player 格式／方向／失敗恢復／十次換片矩陣全部通過。此票尚待獨立審查與授權合併。
