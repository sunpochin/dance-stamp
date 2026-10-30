/* 檔案用途：驗證固定來源審查核心對不完整與過期證據採保守判斷。所在層：工具契約回歸。主要關聯：vendor/reviewlatch/src/gate.ts、readiness.ts。 */
import { expect, test } from 'bun:test'
import { currentReviewers, evaluate, sameRevision } from '../../vendor/reviewlatch/src/gate'
import { inspectPrState, inspectThreads } from '../../vendor/reviewlatch/src/readiness'
import type { Snapshot } from '../../vendor/reviewlatch/src/model'
import type { Policy } from '../../vendor/reviewlatch/src/policy'

const head = 'a'.repeat(40), at = '2026-01-02T00:00:00Z'
const policy: Policy = { schemaVersion: 1, baseBranches: ['main'], releaseBranches: ['main'], requiredChecks: [{ name: 'synthetic-check', appId: 1 }], review: { kind: 'approval', logins: ['synthetic-reviewer'], minimum: 1 }, mergeMethod: 'squash' }
const snapshot = (change: Partial<Snapshot> = {}): Snapshot => ({ schemaVersion: 1, repository: 'example/project', number: 7, author: 'synthetic-author', state: 'OPEN', draft: false, head, headBranch: 'topic', base: 'b'.repeat(40), baseBranch: 'main', mergeable: 'MERGEABLE', mergeState: 'CLEAN', lastBaseChange: null, checks: [{ name: 'synthetic-check', state: 'SUCCESS', appId: 1 }], reviews: [{ login: 'synthetic-reviewer', state: 'APPROVED', commit: head, body: '', at }], threads: [], dependents: [], ...change })

test('合併前每項獨立條件皆必須通過；審查目的不等待自己的 CI', () => {
  expect(evaluate(snapshot(), policy, { releaseAuthorized: true }).ready).toBe(true)
  expect(evaluate(snapshot(), policy).reasons).toContainEqual({ code: 'release', detail: 'main' })
  const bad = snapshot({ state: 'CLOSED', draft: true, baseBranch: 'other', mergeable: 'UNKNOWN', mergeState: 'BLOCKED', checks: [], threads: [{ id: 'synthetic', resolved: false, path: 'web/main.js' }], dependents: [8], reviews: [{ ...snapshot().reviews[0], state: 'CHANGES_REQUESTED' }] })
  expect(evaluate(bad, policy).reasons.map(reason => reason.code)).toEqual(['closed', 'draft', 'base', 'mergeable', 'mergeState', 'checkMissing', 'changesRequested', 'reviewMissing', 'threads', 'dependents'])
  for (const state of ['FAILURE', 'SKIPPED', 'NEUTRAL', 'PENDING']) expect(evaluate(snapshot({ checks: [{ name: 'synthetic-check', state, appId: 1 }] }), policy).reasons).toContainEqual({ code: 'checkFailed', detail: 'synthetic-check' })
  expect(evaluate(snapshot({ checks: [{ name: 'synthetic-check', state: 'SUCCESS', appId: 2 }] }), policy).reasons).toContainEqual({ code: 'checkMissing', detail: 'synthetic-check' })
  expect(evaluate(snapshot(), { ...policy, requiredChecks: [{ name: 'synthetic-check', appId: null }] }, { releaseAuthorized: true }).ready).toBe(true)
  expect(evaluate(snapshot({ checks: [], mergeable: 'UNKNOWN', mergeState: 'BLOCKED', dependents: [8] }), policy, { purpose: 'review' }).ready).toBe(true)
})
test('人工 COMMENTED 不撤銷批准，過期或作者自己的審查不算獨立證據', () => {
  const approved = snapshot().reviews[0]
  expect(currentReviewers(snapshot({ reviews: [approved, { ...approved, state: 'COMMENTED', at: '2026-01-03T00:00:00Z' }] }), policy)).toEqual(['synthetic-reviewer'])
  for (const change of [{ commit: 'b'.repeat(40) }, { login: 'synthetic-author' }, { login: 'synthetic-untrusted' }, { state: 'DISMISSED' }]) expect(currentReviewers(snapshot({ reviews: [{ ...approved, ...change }] }), policy)).toEqual([])
  expect(currentReviewers(snapshot({ lastBaseChange: at }), policy)).toEqual([])
  const codexPolicy: Policy = { ...policy, review: { ...policy.review, kind: 'codex' } }
  const comment = { ...approved, state: 'COMMENTED', body: `**Reviewed commit:** \`${head.slice(0, 7)}\`` }
  expect(currentReviewers(snapshot({ reviews: [comment] }), codexPolicy)).toEqual(['synthetic-reviewer'])
  expect(currentReviewers(snapshot({ reviews: [{ ...comment, body: '' }] }), codexPolicy)).toEqual([])
  expect(currentReviewers(snapshot({ reviews: [{ ...comment, body: '**Reviewed commit:** `bbbbbbb`' }] }), codexPolicy)).toEqual([])
})
test('允許與拒絕規則不能混用；未知、空白與無效規則一律保守處理', () => {
  const pr = snapshot(), base = { baseBranches: ['main'] }
  expect(inspectPrState(pr, base)).toEqual([])
  expect(inspectPrState({ ...pr, mergeable: 'UNKNOWN' }, { ...base, mergeable: { deny: ['CONFLICTING'] } })).toEqual([])
  expect(inspectPrState({ ...pr, mergeable: 'CONFLICTING' }, { ...base, mergeable: { deny: ['CONFLICTING'] } })).toContainEqual({ code: 'mergeable', detail: 'CONFLICTING' })
  for (const rule of [null, {}, { allow: [], deny: [] }, { allow: 'MERGEABLE' }, { deny: [1] }]) expect(inspectPrState(pr, { ...base, mergeable: rule as any }).map(reason => reason.code)).toContain('mergeable')
  for (const mergeable of ['', ' ', undefined]) expect(inspectPrState({ ...pr, mergeable: mergeable as any }, base).map(reason => reason.code)).toContain('mergeable')
  expect(inspectThreads(0, true)).toEqual([])
  expect(inspectThreads(2, true)).toEqual([{ code: 'threads', detail: '2' }])
  for (const count of [-1, 0.5, NaN]) expect(inspectThreads(count, true)).toEqual([{ code: 'threadsIncomplete' }])
  expect(inspectThreads(0, false)).toEqual([{ code: 'threadsIncomplete' }])
})
test('同版本必須核對 repository、PR、兩端 SHA 與兩個分支', () => {
  const pr = snapshot()
  expect(sameRevision(pr, { ...pr, repository: 'EXAMPLE/PROJECT' })).toBe(true)
  for (const change of [{ number: 8 }, { repository: 'example/other' }, { head: 'c'.repeat(40) }, { base: 'c'.repeat(40) }, { headBranch: 'other' }, { baseBranch: 'other' }]) expect(sameRevision(pr, { ...pr, ...change })).toBe(false)
})
