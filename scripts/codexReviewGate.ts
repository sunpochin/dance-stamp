/*
檔案用途：Codex 重審閘門（commit status `codex-review/current`）的純函式：從 PR 上的 Codex review／留言
找出「Codex 審過哪個 commit」，再決定目前 head 是 success、pending 還是 failure，以及要不要自動請 Codex 重審。
所在層：scripts；由 scripts/codex-review-gate.ts（GitHub Actions 執行）與 tests/unit/codexReviewGate.test.ts 共用。
主要關聯：vendor/reviewlatch（固定版本純函式）、.github/workflows/codex-review-gate.yml、.claude/hooks／.codex/hooks 的 require-codex-review-before-merge.sh、
AGENTS.md § 3.8 與 docs/agents/review-governance.md「Codex 重審閘門」。

為什麼要有這道閘門：Codex 只在「開 PR」或有人留言 `@codex review` 時審查，push 新 commit 不會自動重審。
PR #1015／#1016 都是 Codex 只審了第一個 commit，後面的修正 commit 沒有人請它再看就合併了；
「修完 review 要再請 Codex 看一次」只寫在 prompt 裡，Agent 忘了就沒有任何東西擋。
證據只認「寫明 commit SHA」的結果（review 的 commit_id、或留言裡的 Reviewed commit）。
開 PR 時的自動審查乾淨通過只按 👍、不留言（#1025），閘門不採計：曾用 push 紀錄還原 👍 審的是哪一版並在
runner 上輪詢最多 10 分鐘等它，換來的是每張 PR 多付數分鐘 Actions 與一大段難驗證的推論；改由擁有者看到 👍 後手動處理。
另外從行內 review 留言數出「Codex 有 P1 意見的審查輪數」，到上限就停止重審請求（見 P1_ROUND_LIMIT）。
*/

import { reviewedCommit } from '../vendor/reviewlatch/src/gate'

export const CODEX_LOGIN = 'chatgpt-codex-connector[bot]'
export const STATUS_CONTEXT = 'codex-review/current'
export const WAIVER_LABEL = 'codex-review-waived'
export const REVIEW_REQUEST_BODY = '@codex review'
// Codex 有 P1（含 P0）意見的審查達到這個輪數後，不再自動請它重審，改由擁有者決定再請一輪或豁免。
// Codex review 沒有停止條件，每次修完都往更深一層找（#1018 走了 14 輪）。用 P1 標籤計數是便宜的近似：
// P2 以下多半轉 follow-up Issue、不會帶來修正 push；但影響類 P2 照樣在原 PR 修且不計入，非影響類 P1 則計入。
export const P1_ROUND_LIMIT = 3
// 可能帶來新 head 的 pull_request_target 動作；豁免 label 在這些事件都要撤掉。reopened 也算：
// PR 關閉期間 push 不會觸發評估，重新打開時 head 可能已經換了（#1018 Codex finding）。
export const HEAD_CHANGING_ACTIONS: ReadonlySet<string> = new Set(['synchronize', 'reopened'])

/**
 * 這個事件是否該自動請 Codex 重審。push／reopen 之外，撤掉豁免 label 的 unlabeled 也算：閘門在 push 時撤 label，
 * 撤 label 觸發的 unlabeled 執行會以 concurrency 取消還沒走到請求那一步的 synchronize 執行，
 * 若接手的這次不請，設定好的自動請求就得靠人手動留言（#1018 Codex finding）。同一個 head 只請一次，不會重複扣額度。
 */
export function isAutoRequestEvent(eventName: string, action: string, label: string): boolean {
  if (eventName !== 'pull_request_target') return false
  return HEAD_CHANGING_ACTIONS.has(action) || (action === 'unlabeled' && label === WAIVER_LABEL)
}

export type GateState = 'success' | 'pending' | 'failure'

export type CodexReview = { id?: number; login: string; body: string; commitId: string | null; submittedAt: string | null }
export type IssueComment = { login: string; body: string; createdAt: string }
/** PR 的行內 review 留言；reviewId 是它所屬的 review，inReplyTo 有值代表是 thread 裡的回覆。 */
export type ReviewComment = { login: string; body: string; reviewId: number | null; inReplyTo: number | null }
export type ReviewedCommit = { sha: string; at: string }

export type Coverage =
  | { kind: 'exact'; reviewedSha: string }
  | { kind: 'equivalent'; reviewedSha: string }
  | { kind: 'no-diff' }

export type GateInput = {
  exemptReason: string | null
  coverage: Coverage | null
  waived: boolean
  headSha: string
  usageLimited: boolean
  alreadyRequested: boolean
  autoRequestAllowed: boolean
  /** Codex 有 P1 意見的審查輪數（見 p1Rounds）。 */
  p1Rounds: number
  /** 目前 head 出現後、最近一次 Codex 審查之後有人直接請過它（見 requestedSince）；只在 P1 上限時改說明文字。 */
  manualRequestPending: boolean
}

export type GateDecision = { state: GateState; description: string; requestReview: boolean }

const USAGE_LIMIT_PATTERN = /reached your Codex usage limits/i
// Codex 行內意見開頭的嚴重度徽章：「**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)</sub></sub>  標題**」。
// 只認留言開頭的徽章：說明或引用的程式碼裡出現同樣字串（例如引用本閘門的測試）不能把 P2 算成 P1（#1057 Codex finding）。
const P1_BADGE_PATTERN = /^\s*\*\*<sub><sub>!\[P[01] Badge\]\(/

// 保留既有 API 名稱，避免 workflow／hooks 的呼叫端跟著遷移；格式判斷只由固定版上游維護。
export const reviewedCommitFromComment = reviewedCommit

export function isUsageLimitNotice(body: string): boolean {
  return USAGE_LIMIT_PATTERN.test(body)
}

export function isReviewRequest(body: string): boolean {
  return body.toLowerCase().includes(REVIEW_REQUEST_BODY)
}

/** 幾個 ISO 時間裡最晚的一個；全部缺值時回傳 null。 */
export function latestTime(...times: Array<string | null | undefined>): string | null {
  return times.reduce<string | null>((max, time) => (time && (!max || time > max) ? time : max), null)
}

// 只認「整則留言以請求開頭」：回覆裡引用 status 文字（`Comment "@codex review" …`）不是請求，
// 算進去會讓 status 停在「等待中」，而 Codex 根本沒被叫醒（#1057 暫代審查 finding）。
const DIRECT_REQUEST_PATTERN = /^\s*@codex review\b/i

/**
 * `since` 之後，是否有 Codex 以外的人直接留言請它審。`since` 由呼叫端取「最近一次 Codex 審查、改 base、
 * 目前 head 的 commit 時間」中最晚者：請求要針對目前這個 head，換 head 之後舊請求不再算（#1057 暫代審查 finding）。
 * 擁有者的手動請求沒有自動請求的標記；不認它的話，P1 輪數到上限後 status 會一直叫擁有者「再請一次」，
 * 招來重複請求、多扣額度（#1057 Codex finding）。
 */
export function requestedSince(comments: IssueComment[], since: string | null): boolean {
  return comments.some(comment => comment.login !== CODEX_LOGIN && DIRECT_REQUEST_PATTERN.test(comment.body) && (!since || comment.createdAt > since))
}

// 自動請求留言帶隱藏標記，讓閘門重跑時知道「這個 head 已經請過」，同一個 SHA 只請一次，不燒 Codex 額度。
export function requestMarker(headSha: string): string {
  return `<!-- codex-review-gate:request ${headSha} -->`
}

export function requestCommentBody(headSha: string): string {
  return `${REVIEW_REQUEST_BODY}\n\n${requestMarker(headSha)}`
}

/**
 * Codex 審過的 commit，新到舊、去重。review 的 commit_id 是完整 SHA；留言裡的是縮寫。
 * `notBefore` 是 PR 最後一次改 base 的時間：Codex 審的是「對當時 base 的 diff」，改 base 之後
 * 同一個 head SHA 的完整 diff 與合併結果都可能不同，舊證據一律作廢（#1018 Codex finding）。
 */
export function reviewedCommits(
  reviews: CodexReview[],
  comments: IssueComment[],
  notBefore: string | null = null,
): ReviewedCommit[] {
  const found: ReviewedCommit[] = []
  for (const review of reviews) {
    if (!isFullCodexReview(review) || !review.commitId || !review.submittedAt) continue
    found.push({ sha: review.commitId.toLowerCase(), at: review.submittedAt })
  }
  for (const comment of comments) {
    if (comment.login !== CODEX_LOGIN) continue
    const sha = reviewedCommitFromComment(comment.body)
    if (sha) found.push({ sha, at: comment.createdAt })
  }
  found.sort((a, b) => b.at.localeCompare(a.at))
  const current = notBefore ? found.filter(commit => commit.at > notBefore) : found
  const seen = new Set<string>()
  return current.filter(commit => (seen.has(commit.sha) ? false : (seen.add(commit.sha), true)))
}

/**
 * 只承認完整的 PR 審查：Codex 送的、內文要有「Reviewed commit」且與 review 綁定的 commit 一致。
 * Codex 在單一 thread 裡的追問回覆也會被 GitHub 記成一筆 review（內文空白、commit_id 是當下 head），
 * 它只看了那一則修正，不代表整個 head 審過；只看 commit_id 會把它當成完整審查而放行（#1018 實際發生）。
 */
function isFullCodexReview(review: CodexReview): boolean {
  if (review.login !== CODEX_LOGIN || !review.commitId || !review.submittedAt) return false
  const stated = reviewedCommitFromComment(review.body)
  return Boolean(stated && matchesSha(review.commitId, stated))
}

export function isP1Finding(body: string): boolean {
  return P1_BADGE_PATTERN.test(body)
}

/**
 * Codex 有 P1（含 P0）意見的審查輪數。一輪＝一筆完整的 Codex review，P1 意見是掛在那筆 review 底下、
 * 開新 thread 的行內留言；thread 裡的追問回覆不算新的一輪。改 base 不歸零：上限管的是來回次數與額度。
 */
export function p1Rounds(reviews: CodexReview[], comments: ReviewComment[]): number {
  const fullReviews = new Set(reviews.filter(isFullCodexReview).map(review => review.id))
  const flagged = new Set(comments
    .filter(comment => comment.login === CODEX_LOGIN && comment.inReplyTo === null && comment.reviewId !== null &&
      fullReviews.has(comment.reviewId) && isP1Finding(comment.body))
    .map(comment => comment.reviewId))
  return flagged.size
}

export function matchesSha(fullSha: string, maybeAbbreviated: string): boolean {
  return maybeAbbreviated.length >= 7 && fullSha.toLowerCase().startsWith(maybeAbbreviated.toLowerCase())
}

/**
 * Codex 最近一則「用量上限」通知是否晚於最近一次 `@codex review` 請求。
 * 是的話代表最新的請求被額度擋掉，閘門要明確報 failure（Fail loudly），而不是一直顯示「等待中」。
 */
export function isUsageLimited(comments: IssueComment[]): boolean {
  const latest = (predicate: (comment: IssueComment) => boolean) =>
    comments.filter(predicate).reduce<string | null>((max, comment) => (max && max > comment.createdAt ? max : comment.createdAt), null)
  const limitAt = latest(comment => comment.login === CODEX_LOGIN && isUsageLimitNotice(comment.body))
  if (!limitAt) return false
  const requestAt = latest(comment => comment.login !== CODEX_LOGIN && isReviewRequest(comment.body))
  // 同一秒時算撞到上限：Codex 的上限回覆可能與觸發它的請求落在同一個 created_at 秒（#1018 Codex finding）。
  return !requestAt || limitAt >= requestAt
}

export type TimelineEvent = { event: string; actor: string; label: string | null; createdAt: string }

/** PR 最後一次改 base 的時間；沒改過回傳 null。 */
export function latestBaseChange(events: TimelineEvent[]): string | null {
  return events.filter(event => event.event === 'base_ref_changed').reduce<string | null>((max, event) => (max && max > event.createdAt ? max : event.createdAt), null)
}

/**
 * 豁免 label 只有在「最後一次貼上它的人是 repo 擁有者」時才算數（#1018 Codex finding）。
 * 其他協作者或自動化帳號貼的不算。限制：Agent 用的是擁有者的 token，這裡分辨不出來，
 * 那一段由合併前 hook 擋 Agent 對這個 label 的任何操作。
 */
export function waiverAppliedByOwner(events: TimelineEvent[], owner: string, notBefore: string | null = null): boolean {
  const applied = events.filter(event => event.event === 'labeled' && event.label === WAIVER_LABEL)
  const latest = applied.reduce<TimelineEvent | null>((max, event) => (max && max.createdAt > event.createdAt ? max : event), null)
  // 豁免是對「當下這個 head、當下這個 base」的決定；改 base 前貼的豁免不涵蓋改 base 後的 diff（#1018 Codex finding）。
  if (notBefore && latest && latest.createdAt <= notBefore) return false
  return latest?.actor === owner
}

export type CommitStatus = { context: string; state: string; description: string | null }

/**
 * 豁免綁在 commit 上，不靠事件去撤（#1018 Codex finding）：撤 label 的那次 synchronize／reopened 執行
 * 可能被緊接著的留言或 review 事件以 concurrency 取消，label 就留著套到新 head。所以：
 * - 擁有者貼 label 的那次執行，只有「貼的當下 PR head 就是現在這個 head」才算數（labeledThisHead）；
 * - 其他事件只承認這個 head 上已經有那次執行寫下的豁免 status。新 head 沒有這筆紀錄，舊豁免自然失效。
 */
export function waiverCoversHead(input: {
  ownerApplied: boolean
  labeledThisHead: boolean
  statusesOnHead: CommitStatus[]
  prNumber: number
  baseRef: string
}): boolean {
  if (!input.ownerApplied) return false
  if (input.labeledThisHead) return true
  return input.statusesOnHead.some(status =>
    status.context === STATUS_CONTEXT &&
    status.state === 'success' &&
    (status.description ?? '').startsWith(`${statusScope(input.prNumber, input.baseRef)} Owner waived`))
}

/**
 * package.json 前後兩版是否只差最上層的 version。release-please 只會改這個欄位。
 * 必須解析 JSON 比較，不能比 diff 行：scripts 裡加一個叫 "version" 的指令（例如 "version": "curl … | sh"）
 * 在 diff 上也只是一行 "version" 變更，卻能被 `bun run version` 執行（#1018 Codex finding）。
 */
export function isVersionOnlyPackageChange(before: string, after: string): boolean {
  let previous: unknown
  let next: unknown
  try {
    previous = JSON.parse(before)
    next = JSON.parse(after)
  } catch {
    return false
  }
  if (!isPlainObject(previous) || !isPlainObject(next)) return false
  const { version: _previousVersion, ...previousRest } = previous
  const { version: _nextVersion, ...nextRest } = next
  return deepEqual(previousRest, nextRest)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
  }
  return Object.is(a, b)
}

export const RELEASE_ONLY_FILES = new Set(['.release-please-manifest.json', 'CHANGELOG.md', 'package.json'])

// commit status 只綁 SHA，不綁 PR 也不綁 base。說明開頭寫 `#<PR>@<base>`，合併前 hook 比對現在的 PR 與 base，
// 對不上就擋（fail closed）：
// - 兩張 PR 剛好指向同一個 head 時會互相覆寫，不能拿別張 PR 的結論放行；
// - 改 base 後到 edited 那次重算寫入之前，舊的 success 還在同一個 head 上，不能拿舊 base 的結論放行（#1018 Codex finding）。
export function statusScope(prNumber: number, baseRef: string): string {
  return `#${prNumber}@${baseRef}`
}

export function statusDescription(prNumber: number, baseRef: string, description: string): string {
  return `${statusScope(prNumber, baseRef)} ${description}`.slice(0, 140)
}

export type ExemptionInput = {
  headRef: string
  baseRef: string
  /** PR 的 head 分支是否在本 repo（不是 fork）。 */
  sameRepo: boolean
  /** PR head commit 是否已經在 staging 的歷史裡；只有 base 是 main 時才需要算。 */
  headInStaging: boolean
  /** PR 的淨變更是否只碰 release-please 會改的檔案，且 package.json 只改 version。 */
  releaseOnlyChanges: boolean
}

// release-please 的 target-branch 是 staging（.github/workflows/release-please.yml），分支名固定是這個前綴。
const RELEASE_PLEASE_HEAD_PREFIX = 'release-please--branches--staging'

/**
 * 只有兩種 PR 免審，且都不能只靠分支名稱判斷——名稱誰都能取（Codex 在 #1018 抓到的繞過）：
 * - promotion：base 是 main，且 head commit 本來就在 staging 裡。內容已在 staging，代表每一筆都在各自的 PR
 *   過了這道閘門；隨便一個功能分支直接開 PR 到 main 不會在 staging 歷史裡，照樣要審。
 * - release-please：同 repo、base 是 staging、分支名是 release-please 的固定格式，而且內容只有版號與 CHANGELOG。
 *   release PR 的作者與 Agent 是同一個帳號，看作者分不出來，所以改看內容（#1018 Codex finding）。
 */
export function exemptionReason(input: ExemptionInput): string | null {
  if (!input.sameRepo) return null
  if (input.baseRef === 'main' && input.headInStaging) {
    return 'Promotion PR: head is already on staging, where every change passed this gate.'
  }
  if (input.baseRef === 'staging' && input.headRef.startsWith(RELEASE_PLEASE_HEAD_PREFIX) && input.releaseOnlyChanges) {
    return 'Release-please version PR; no Codex review required.'
  }
  return null
}

export function decide(input: GateInput): GateDecision {
  const short = input.headSha.slice(0, 7)
  if (input.exemptReason) return { state: 'success', description: input.exemptReason, requestReview: false }
  if (input.coverage?.kind === 'exact') {
    return { state: 'success', description: `Codex reviewed ${short}.`, requestReview: false }
  }
  if (input.coverage?.kind === 'equivalent') {
    return {
      state: 'success',
      description: `Codex reviewed ${input.coverage.reviewedSha.slice(0, 7)}; ${short} has the identical net diff.`,
      requestReview: false,
    }
  }
  if (input.coverage?.kind === 'no-diff') {
    return { state: 'success', description: 'PR has no net diff against its base.', requestReview: false }
  }
  if (input.waived) {
    return { state: 'success', description: `Owner waived the Codex re-review for ${short} (${WAIVER_LABEL}).`, requestReview: false }
  }
  // 用量上限通知是針對「之前那次請求」；新的 head 還沒請過時照樣請一次，否則額度恢復後每次 push 都會卡在
  // failure、也不再自動請求（#1018 Codex finding）。這一次又撞上限，下一輪重算就會看到新的通知而報 failure。
  // P1 輪數到上限後不再自動請求，但仍是 pending：head 沒被審過就不能放行，由擁有者決定再請一輪或豁免。
  const roundLimitReached = input.p1Rounds >= P1_ROUND_LIMIT
  const firstRequestForHead = input.autoRequestAllowed && !input.alreadyRequested && !roundLimitReached
  if (input.usageLimited && !firstRequestForHead) {
    return {
      state: 'failure',
      // 到上限時不能叫人「晚點再留言」：那等於叫 Agent 繞過上限，只留擁有者的選項（#1057 暫代審查 finding）。
      description: roundLimitReached
        ? `Codex usage limit hit; ${short} unreviewed, P1 cap reached. Owner: request later or ${WAIVER_LABEL}.`
        : `Codex usage limit hit; ${short} is unreviewed. Comment "@codex review" later, or owner adds ${WAIVER_LABEL}.`,
      requestReview: false,
    }
  }
  if (roundLimitReached) {
    // 不寫「auto」：沒設定自動請求 token 時，停下來的是 Agent 的手動請求，不是自動請求。
    return {
      state: 'pending',
      description: input.alreadyRequested || input.manualRequestPending
        ? `Waiting for Codex to review ${short} (P1 cap reached; review requested).`
        : `Codex found P1 in ${input.p1Rounds} rounds; re-requests stopped for ${short}. Owner: "@codex review" or ${WAIVER_LABEL}.`,
      requestReview: false,
    }
  }
  const requestReview = firstRequestForHead
  return {
    state: 'pending',
    description: requestReview || input.alreadyRequested
      ? `Waiting for Codex to review ${short}.`
      : `Codex has not reviewed ${short}. Comment "@codex review" on the PR.`,
    requestReview,
  }
}
