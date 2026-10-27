# 依據、參考與證據邊界

查閱日期：2026-10-27。官方 API 文件只證明有此機制，不證明本專案已在特定手機完成整條流程。以下產品決策、工期與門檻是本專案提案，不是來源作者的承諾。

## 使用者提供的參考

- 「練舞筆記」IG 敘述與既有分析：由使用者貼上，包含標記、變速、鏡像、A–B、分享與商業化舊建議。本次沒有原影片檔，沒有重新驗證逐字稿，也不把舊文中 App Store 版本／價格／平台狀態當成已查證事實。
- [Threads @mooomx_ 貼文](https://www.threads.com/@mooomx_/post/De5sf3QigoY)：使用者補充邊播邊錄與合成 VS 的需求。直接擷取頁面失敗，貼文內容依使用者提供文字；沒有驗證留言、瀏覽量或相對日期。
- [SyncMirror Player App Store](https://apps.apple.com/tw/app/id6755509268)：本次成功讀取，其產品敘述包含邊播邊錄、並排對照與合併保存。這確認參考功能的產品表述，不代表知道其內部架構或實測品質。商業模式、素材與品牌不納入本產品。
- 使用者明確追加：錄影比較／VS 匯出升為 P0；Web 優先，其次 iOS，再 Android。授權改採非商用原始碼公開。

## 官方技術資料

| 來源 | 用來支持的設計 |
| --- | --- |
| [Svelte](https://svelte.dev/docs/svelte/overview)、[Vue](https://vuejs.org/guide/introduction.html)、[React](https://react.dev/learn)、[Vite](https://vite.dev/guide/) | 框架候選與靜態前端；選型排序是本專案判斷 |
| [Dexie](https://dexie.org/docs) | IndexedDB wrapper；不表示需採雲端產品 |
| [File API](https://developer.mozilla.org/en-US/docs/Web/API/File_API)、[showOpenFilePicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker) | 通用選檔基線與進階 API 的支援差異 |
| [Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)、[persist](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist) | 配額、清除與持久化限制，不能取代備份 |
| [canPlayType](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType)、[preservesPitch](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch) | 格式偵測與變速音高能力仍需實際播放驗證 |
| [requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) | 顯示影格時間回呼，非硬即時精度保證 |
| [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) | 相機權限、安全環境與擷取 |
| [MediaRecorder MIME](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)、[dataavailable](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event) | 動態 codec 檢查與 chunk 時間不能作精準時鐘 |
| [Canvas captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream) | 左右合成視訊候選路徑 |
| [MediaElementSource](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource)、[MediaStreamDestination](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination) | 示範音訊輸出候選路徑 |
| [Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) | 離線應用資源與更新 |
| [FFmpeg.wasm FAQ](https://ffmpegwasm.netlify.app/docs/faq/) | 本機轉碼的效能、資源與組件授權取捨 |
| [AVFoundation](https://developer.apple.com/av-foundation/) | iOS 相機、播放與影片編輯的候選工具 |
| [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) | 免費靜態主機仍有用量與政策限制 |

## 授權與費用資料

- [OSI 定義](https://opensource.org/osd)：禁止商用與一般 open source 定義不相容。
- [PolyForm Noncommercial 原文](https://polyformproject.org/licenses/noncommercial/1.0.0)與[官方版本檔](https://github.com/polyformproject/polyform-licenses/blob/1.0.0/PolyForm-Noncommercial-1.0.0.md)：根 LICENSE 原文來源、非商用與組織允許用途。
- [GPLv3](https://www.gnu.org/licenses/gpl.en.html)：原授權的權利及不可追溯撤回；本次也讀取了 repo 舊 LICENSE。
- [Apple Developer enrollment](https://developer.apple.com/programs/enroll/)：目前列示 US$99／會員年及有條件減免，實際價格與資格應於發佈決策時重查。

## 尚未取得的證據

沒有手機 Web 相機試驗、錄影輸出、同步測量、框架效能比較、已鎖依賴授權掃描、使用者測試或任何部署。所有相關 issue 必須以可重現證據關閉；本規劃 PR 不能替代它們。
