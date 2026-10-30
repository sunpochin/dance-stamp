/* 檔案用途：驗證版本審查證據、豁免範圍與重請上限。所在層：工具純函式回歸。主要關聯：scripts/codexReviewGate.ts。 */
import { expect, test } from 'bun:test'
import * as gate from '../../scripts/codexReviewGate'

const head = 'a'.repeat(40), old = 'b'.repeat(40), first = '2026-01-01T00:00:00Z', next = '2026-01-02T00:00:00Z'
const body = (sha = head) => `**Reviewed commit:** \`${sha}\``
const review = (change: Partial<gate.CodexReview> = {}): gate.CodexReview => ({ id: 1, login: gate.CODEX_LOGIN, body: body(), commitId: head, submittedAt: next, ...change })
const comment = (text: string, change: Partial<gate.IssueComment> = {}): gate.IssueComment => ({ login: gate.CODEX_LOGIN, body: text, createdAt: next, ...change })
const input = (change: Partial<gate.GateInput> = {}): gate.GateInput => ({ exemptReason: null, coverage: null, waived: false, headSha: head, usageLimited: false, alreadyRequested: false, autoRequestAllowed: true, p1Rounds: 0, manualRequestPending: false, ...change })

test('只有正確事件可自動重請；標記綁定 head、狀態綁 PR 與 base', () => {
  for (const action of ['synchronize', 'reopened']) expect(gate.isAutoRequestEvent('pull_request_target', action, '')).toBe(true)
  expect(gate.isAutoRequestEvent('pull_request_target', 'unlabeled', gate.WAIVER_LABEL)).toBe(true)
  for (const [event, action, label] of [['push', 'synchronize', ''], ['pull_request_target', 'opened', ''], ['pull_request_target', 'unlabeled', 'other']]) expect(gate.isAutoRequestEvent(event, action, label)).toBe(false)
  expect(gate.requestCommentBody(head)).toBe(`@codex review\n\n${gate.requestMarker(head)}`)
  expect(gate.requestMarker(head)).not.toBe(gate.requestMarker(old))
  expect(gate.statusScope(7, 'main')).toBe('#7@main')
  expect(gate.statusDescription(7, 'main', 'x'.repeat(200))).toHaveLength(140)
  expect(gate.latestTime(null, undefined)).toBeNull()
  expect(gate.latestTime(first, null, next, first)).toBe(next)
})
test('只收 Codex 完整且一致的版本證據，去重排序並排除改 base 前紀錄', () => {
  const reviews = [review(), review({ id: 2, submittedAt: first }), review({ login: 'synthetic-owner' }), review({ body: '' }), review({ commitId: null }), review({ submittedAt: null }), review({ body: body(old) })]
  const comments = [comment(body(old), { createdAt: first }), comment(body(), { login: 'synthetic-owner' }), comment('👍')]
  expect(gate.reviewedCommits(reviews, comments)).toEqual([{ sha: head, at: next }, { sha: old, at: first }])
  expect(gate.reviewedCommits(reviews, comments, first)).toEqual([{ sha: head, at: next }])
  expect(gate.matchesSha(head, 'A'.repeat(7))).toBe(true)
  expect(gate.matchesSha(head, 'a'.repeat(6))).toBe(false)
  expect(gate.matchesSha(head, old)).toBe(false)
  expect(gate.reviewedCommitFromComment(body(head.toUpperCase()))).toBe(head)
})
test('只有開新 thread 的 P0/P1 完整 review 計輪數，引用與追問不計', () => {
  const badge = '**<sub><sub>![P1 Badge](https://example.com/badge)'
  const finding = { login: gate.CODEX_LOGIN, body: badge, reviewId: 1, inReplyTo: null }
  expect(gate.isP1Finding(badge)).toBe(true)
  expect(gate.isP1Finding(badge.replace('P1', 'P0'))).toBe(true)
  expect(gate.isP1Finding(badge.replace('P1', 'P2'))).toBe(false)
  expect(gate.isP1Finding(`quoted: ${badge}`)).toBe(false)
  expect(gate.p1Rounds([review(), review({ id: 2, body: '' })], [finding, finding, { ...finding, reviewId: 2 }, { ...finding, reviewId: null }, { ...finding, inReplyTo: 3 }, { ...finding, login: 'synthetic-owner' }])).toBe(1)
})
test('用量上限只阻擋尚未恢復的請求，直接手動請求不能由引用或 bot 冒充', () => {
  const limit = comment('You reached your Codex usage limits')
  expect(gate.isUsageLimited([])).toBe(false)
  expect(gate.isUsageLimited([limit])).toBe(true)
  expect(gate.isUsageLimited([limit, comment('@codex review', { login: 'synthetic-owner' })])).toBe(true)
  const request = comment('  @CoDeX ReViEw please', { login: 'synthetic-owner', createdAt: next })
  expect(gate.isUsageLimited([comment(limit.body, { createdAt: first }), request])).toBe(false)
  expect(gate.isReviewRequest(request.body)).toBe(true)
  expect(gate.requestedSince([request], first)).toBe(true)
  expect(gate.requestedSince([request], null)).toBe(true)
  expect(gate.requestedSince([request], next)).toBe(false)
  expect(gate.requestedSince([comment('@codex review'), comment('Quoted @codex review', { login: 'synthetic-owner' })], null)).toBe(false)
})
test('豁免必須由擁有者貼上且涵蓋目前 head、PR 與 base', () => {
  const event = { event: 'labeled', actor: 'synthetic-owner', label: gate.WAIVER_LABEL, createdAt: next }
  expect(gate.latestBaseChange([])).toBeNull()
  expect(gate.latestBaseChange([{ ...event, event: 'base_ref_changed', createdAt: first }, { ...event, event: 'base_ref_changed' }, event])).toBe(next)
  expect(gate.waiverAppliedByOwner([event], 'synthetic-owner')).toBe(true)
  expect(gate.waiverAppliedByOwner([event], 'synthetic-owner', next)).toBe(false)
  expect(gate.waiverAppliedByOwner([{ ...event, createdAt: first }, { ...event, actor: 'synthetic-other' }], 'synthetic-owner')).toBe(false)
  expect(gate.waiverAppliedByOwner([], 'synthetic-owner')).toBe(false)
  const status = { context: gate.STATUS_CONTEXT, state: 'success', description: '#7@main Owner waived review' }
  const scope = { ownerApplied: true, labeledThisHead: false, statusesOnHead: [status], prNumber: 7, baseRef: 'main' }
  expect(gate.waiverCoversHead(scope)).toBe(true)
  expect(gate.waiverCoversHead({ ...scope, labeledThisHead: true, statusesOnHead: [] })).toBe(true)
  for (const change of [{ ownerApplied: false }, { prNumber: 8 }, { baseRef: 'staging' }, { statusesOnHead: [{ ...status, description: null }] }, { statusesOnHead: [{ ...status, state: 'pending' }] }, { statusesOnHead: [{ ...status, context: 'other' }] }]) expect(gate.waiverCoversHead({ ...scope, ...change })).toBe(false)
})
test('版號豁免比較解析後的內容，不能混入執行腳本或其他巢狀更動', () => {
  const before = { version: '1', scripts: { check: 'safe' }, nested: [1, { enabled: true }] }
  expect(gate.isVersionOnlyPackageChange(JSON.stringify(before), JSON.stringify({ ...before, version: '2' }))).toBe(true)
  for (const after of ['{', 'null', '[]', JSON.stringify({ ...before, scripts: { check: 'changed' } }), JSON.stringify({ ...before, nested: [1] }), JSON.stringify({ ...before, nested: [1, { enabled: false }] }), JSON.stringify({ ...before, nested: null })]) expect(gate.isVersionOnlyPackageChange(JSON.stringify(before), after)).toBe(false)
  const base = { headRef: 'topic', baseRef: 'main', sameRepo: true, headInStaging: false, releaseOnlyChanges: false }
  expect(gate.exemptionReason({ ...base, headInStaging: true })).toContain('Promotion')
  expect(gate.exemptionReason({ ...base, baseRef: 'staging', headRef: 'release-please--branches--staging', releaseOnlyChanges: true })).toContain('Release-please')
  expect(gate.exemptionReason(base)).toBeNull()
  expect(gate.exemptionReason({ ...base, sameRepo: false, headInStaging: true })).toBeNull()
})
test('決策依可信證據先後處理；過輪數上限不再重請、用量不足不冒稱通過', () => {
  for (const change of [{ exemptReason: 'synthetic exempt' }, { coverage: { kind: 'exact', reviewedSha: head } }, { coverage: { kind: 'equivalent', reviewedSha: old } }, { coverage: { kind: 'no-diff' } }, { waived: true }] as Partial<gate.GateInput>[]) expect(gate.decide(input(change))).toMatchObject({ state: 'success', requestReview: false })
  expect(gate.decide(input())).toMatchObject({ state: 'pending', requestReview: true })
  expect(gate.decide(input({ usageLimited: true }))).toMatchObject({ state: 'pending', requestReview: true })
  for (const change of [{ alreadyRequested: true }, { autoRequestAllowed: false }]) {
    expect(gate.decide(input(change))).toMatchObject({ state: 'pending', requestReview: false })
    expect(gate.decide(input({ ...change, usageLimited: true }))).toMatchObject({ state: 'failure', requestReview: false })
  }
  for (const manualRequestPending of [false, true]) {
    expect(gate.decide(input({ p1Rounds: 3, manualRequestPending }))).toMatchObject({ state: 'pending', requestReview: false })
    expect(gate.decide(input({ p1Rounds: 3, manualRequestPending })).description).toContain(manualRequestPending ? 'Waiting' : 're-requests stopped')
  }
  expect(gate.decide(input({ p1Rounds: 3, usageLimited: true }))).toMatchObject({ state: 'failure', requestReview: false })
})
