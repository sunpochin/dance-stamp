/* 用途：同一份原App順序與平台完整案例契約，防移平台後漏案假綠；所在層：測試入口；關聯：run-app、兩下載驗證器、coverage-badges。 */
import assert from 'node:assert/strict'
import { metadataStopCases } from '../browser/metadata-stop.js'
const catalog = ['coverage-navigation', 'storage', 'storage-boundaries', 'storage-startup-failure', 'markers', 'moves', 'beats', 'share', 'vs-share', 'vs-live-delete', 'vs-save-tail-stop-complete', 'vs-save-tail-native-reject', 'vs-save-tail-unknown-abort', 'vs-save-tail-unknown-complete', 'deletion', 'existing-comparison', 'comparison-overlay', 'comparison-overlay-layout', 'video-roles', 'self-failure', 'comparison-recovery', 'comparison-save-failure', 'review-recovery', 'take-open-failure', 'export-failure', 'comparison-capture-fallback', 'webkit-audio-branch', 'capture', 'capture-success', 'capture-integrity', 'camera-policy-denial', 'camera-preview-cancel', 'edges', 'relink', 'backup-conflicts', 'backup-recovery', 'backup-keyboard', 'storage-recovery-title', 'storage-recovery-import', 'comparison-keyboard', 'moves-storage', 'move-draft', 'practice-range-change', 'practice-fallback', 'practice-natural-end', 'practice-native-decode', 'practice-native-audio', 'practice-native-ended', 'offline-storage', 'offline-cache-failure', 'offline-multi-tab']
// 恢復守門沿原函式接入，不改前51條順序，保留既有鍵盤故障的前置環境。
// 匯出暖機中的停止須沿既有回歸執行，恢復片段或保存尾段不能代替這條生命週期。
catalog.push('recovery-frame-guard', ...metadataStopCases.map((kind: string) => 'metadata-stop-' + kind), 'export-ready')
// 四條既有恢復回歸接在原63條之後，保留鍵盤與取消案例的原前置順序。
catalog.push('overlay-export')
catalog.push('recovery-offline-timeout', 'recovery-inventory-read', 'recovery-unknown-media', 'recovery-draft-navigation')
// 錄影供聲與匯出供聲生命週期不同；追加於原媒體案例之後，不能改變原鍵盤案例的前置順序。
catalog.push('webkit-capture-branch')
// 已開舊頁收到升版通知與啟動前已有新庫不同；另接在供聲案例後，保留原生關閉／重開路徑。
catalog.push('storage-version-change')

// 秒數尺另接在既有流程之後，保留原本媒體與恢復案例的相對順序。
catalog.push('source-time-rulers')

// 簡化介面獨立追加，原有比較／疊影及恢復順序不變。
catalog.push('simplified-comparison')
// 新的試看框走真正預設介面，接在原案例之後以保留既有前置順序。
catalog.push('adjusted-side-preview')
// 跟隨分析使用真正的本機模型，與合成匯出共用相同資源政策。
catalog.push('person-follow')
// 單側結果與原本 VS 分開驗，確保各自的原片聲音與真正下載都存在。
catalog.push('follow-results')
// 計時只驗數字與保全；CI 機器速度不當成效能門檻或最佳化證據。
catalog.push('follow-performance')
// Chrome 元素供聲不能替 Safari 的有界 AAC 供聲背書；重用完整單側結果案例並保留原76條順序。
catalog.push('webkit-follow-results')
// 相容回退追加在原77案之後；阻擋 SW 僅為讓受控網路故障確實到達模型載入。
catalog.push('follow-runtime')
// 雲端 UI 也必須進同一個來源分母；重用原合成供應商流程，保留前78案順序。
catalog.push('cloud-integration')
// 獨立工具仍是產品的一部分，沿用原生分析／工作台保全回歸追加在原79案之後。
catalog.push('metronome-integration')
// 保存成功不代表中斷工作可恢復；公開待傳流程追加在原80案後，不改既有順序。
catalog.push('cloud-pending-recovery')
// 斷開授權與刪檔不同；公開合成probe／同位置重連保全放在第82案。
catalog.push('cloud-probe-reconnect')
// 分享失敗只能待確認；新頁恢復與停止失敗保全追加第83案，不取代原成功分享。
catalog.push('cloud-share-recovery')
catalog.push('explicit-pts-owner')

export const fullCatalog = Object.freeze(catalog)
export const macPtsCatalog = Object.freeze(['webkit-audio-branch', 'explicit-pts-owner', 'webkit-capture-branch'])
// 成功AAC成檔三案移至有實際能力的Mac必跑；Linux拒絕案是真false驗證，不是成功案的skip。
export const linuxCatalog = Object.freeze([...fullCatalog.filter(name => !macPtsCatalog.includes(name)), 'native-aac-refusal'])
export function expectedCatalog(matrix: string): readonly string[] {
  if (matrix === 'full') return fullCatalog
  if (matrix === 'linux-full') return linuxCatalog
  if (matrix === 'mac-pts-selected') return macPtsCatalog
  throw Error('不是完整平台計畫：' + matrix)
}
export function assertCompleteRun(run: any, allowed = ['full', 'linux-full', 'mac-pts-selected']) {
  assert(allowed.includes(run.matrix), '不接受此平台／局部收據')
  const expected = expectedCatalog(run.matrix)
  assert.equal(run.status, 'passed', '平台量測失敗')
  assert.deepEqual(run.scenarios.map((row: any) => row.name), expected, '案例名稱／順序／數量不完整')
  assert.equal(new Set(expected).size, expected.length, '案例重複')
  assert(run.scenarios.every((row: any) => row.status === 'passed'), '平台案例未全通過')
  if (run.matrix === 'linux-full') assert.equal(run.environment.platform, 'linux', '不是Linux執行')
  if (run.matrix === 'mac-pts-selected') assert.equal(run.environment.platform, 'darwin', '不是Mac執行')
}

// 無參數的開發入口也必須選當前平台，不讓Linux默跑已知缺原生AAC的成功案。
export function appPlan(args: string[], platform: string) {
  const linux = args.includes('--linux-platform'), mac = args.includes('--mac-pts-platform')
  const selected = args.filter(arg => !['--linux-platform', '--mac-pts-platform'].includes(arg))
  assert(!(linux && mac), '只選一個平台計畫')
  assert(!linux || (platform === 'linux' && !selected.length), 'Linux完整計畫不接受局部或其它平台')
  assert(!mac || (platform === 'darwin' && !selected.length), 'Mac PTS計畫不接受局部或其它平台')
  const matrix = mac ? 'mac-pts-selected' : linux || (!selected.length && platform === 'linux') ? 'linux-full' : selected.length ? 'selected' : 'full'
  return { matrix, catalog: matrix === 'selected' ? selected : [...expectedCatalog(matrix)] }
}
export function assertDownloadRunPlan(run: any, explicitlySpecified: boolean) {
  // 手動指定局部收據原本合法；其來源／下載目標／bytes／cleanup仍由原verifier逐項嚴驗，不能進badge。
  if (explicitlySpecified && run.matrix === 'selected') return
  assertCompleteRun(run, ['full', 'linux-full'])
}
