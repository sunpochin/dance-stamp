/* 檔案用途：驗證回合計次、快照、隱私及 v3 備份保全。所在層：純邏輯回歸。主要關聯：practice-sessions.js、library.js、cloud-snapshot.js。 */
import { expect, test } from 'bun:test'
import { newLibrary, validateBackup, migrateLibrary, planBackupImport, planDeletion, createShare, tables } from '../../web/library.js'
import { practiceSegment, savePracticeSession, sessionHistory, practiceSuggestion, chooseNextPractice } from '../../web/practice-sessions.js'
import { selectedPractice } from '../../web/cloud-snapshot.js'
function sample() {
  const data = newLibrary(), videoId = crypto.randomUUID(), markerId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成示範', durationMs: 60000, revision: 1 })
  data.markers.push({ id: markerId, videoId, title: '第三段', startMs: 18000, endMs: 26000, note: '', revision: 1 })
  const segment = practiceSegment(data, { id: crypto.randomUUID(), videoId, markerId, title: '第三段', startMs: 18000, endMs: 26000 })
  data.segments.push(segment)
  return data
}
function session(data, index = 1, assessment = 'unfamiliar') {
  return { id: crypto.randomUUID(), segmentId: data.segments[0].id, startedAt: `2026-11-03T08:${String(index).padStart(2, '0')}:00Z`, completedAt: `2026-11-03T08:${String(index).padStart(2, '0')}:30Z`, rate: 0.75, followed: true as const, revision: 1, assessment: assessment as 'unfamiliar' }
}
test('觀察不計次、跟跳 ID 重試冪等，同名不同 A/B 分開，Marker 改刪保留快照', () => {
  const data = sample(), first = session(data)
  expect(() => savePracticeSession(data, { ...first, followed: false as any })).toThrow()
  savePracticeSession(data, first); savePracticeSession(data, first)
  expect(sessionHistory(data, first.segmentId)).toHaveLength(1)
  const changed = practiceSegment(data, { ...data.segments[0], id: crypto.randomUUID(), startMs: 30000, endMs: 35000 })
  data.segments.push(changed); data.markers = []
  expect(validateBackup(data).segments[0].startMs).toBe(18000)
  expect(sessionHistory(data, changed.id)).toHaveLength(0)
  expect(() => practiceSegment(data, { ...changed, endMs: undefined as any })).toThrow('終點')
  expect(() => practiceSegment(data, { ...changed, endMs: 60001 })).toThrow()
})
test('建議只看每段最新回合，手選優先、略過與更新自評可改變建議', () => {
  const data = sample(); data.sessions.push(session(data))
  expect(practiceSuggestion(data).segment?.id).toBe(data.segments[0].id)
  data.sessions.push(session(data, 2, 'smoother'))
  expect(practiceSuggestion(data).segment).toBeUndefined()
  chooseNextPractice(data, data.segments[0].id)
  expect(practiceSuggestion(data).reason).toContain('你選')
  chooseNextPractice(data, undefined, true)
  expect(practiceSuggestion(data).segment).toBeUndefined()
  data.practiceChoices = []; data.sessions[1].assessment = 'unfamiliar'
  expect(practiceSuggestion(data).segment?.id).toBe(data.segments[0].id)
  delete data.sessions[1].assessment
  expect(practiceSuggestion(data).segment).toBeUndefined()
})
test('v1/v2 缺回合在記憶體升 v3，v3 往返白名單與壞資料拒絕', () => {
  for (const schemaVersion of [1, 2]) {
    const old: any = newLibrary(); old.schemaVersion = schemaVersion
    delete old.segments; delete old.sessions; delete old.practiceChoices
    const before = JSON.stringify(old), migrated = migrateLibrary(old)
    expect(migrated.schemaVersion).toBe(3); expect(migrated.sessions).toEqual([]); expect(JSON.stringify(old)).toBe(before)
  }
  const data = sample(); data.sessions.push(session(data)); chooseNextPractice(data, data.segments[0].id)
  expect(validateBackup(JSON.parse(JSON.stringify(data))).sessions).toEqual(data.sessions)
  for (const change of [d => { d.sessions[0].followed = false }, d => { d.sessions[0].segmentId = crypto.randomUUID() }, d => { d.sessions[0].takeId = crypto.randomUUID() }, d => { d.sessions[0].completedAt = 'bad' }, d => { d.segments[0].endMs = 60001 }, d => { d.schemaVersion = 2 }, d => { d.practiceChoices[0].mode = 'bad' }]) {
    const bad = structuredClone(data); change(bad); expect(() => validateBackup(bad)).toThrow()
  }
})
test('v3 備份衝突保留完整副本、外來庫 ID 改寫、重匯不重複回合', async () => {
  const source = sample(); source.sessions.push(session(source)); chooseNextPractice(source, source.segments[0].id)
  const local = structuredClone(source); local.segments[0].title = '本機改名'
  const first = await planBackupImport(local, source), again = await planBackupImport(first.data, source)
  expect(first.data.segments).toHaveLength(2); expect(first.data.sessions).toHaveLength(2)
  expect(first.data.sessions.find(s => s.id !== source.sessions[0].id)?.segmentId).not.toBe(source.segments[0].id)
  expect(again.added).toBe(0)
  const foreign = newLibrary(); foreign.videos.push({ id: crypto.randomUUID(), title: '另一庫', durationMs: 1000, revision: 1 })
  const imported = await planBackupImport(foreign, source)
  expect(imported.data.sessions[0].segmentId).toBe(imported.data.segments[0].id)
  expect(imported.data.practiceChoices[0].segmentId).toBe(imported.data.segments[0].id)
  expect((await planBackupImport(imported.data, source)).added).toBe(0)
  for (const table of tables) expect((await planBackupImport(newLibrary(), source)).data[table]).toEqual(validateBackup(source)[table])
})
test('第 1／5 回各連自己的 take，刪錄影保留回合、刪整份筆記才移除回合', () => {
  const data = sample(), segment = data.segments[0]
  for (let i = 1; i <= 5; i++) {
    const row = session(data, i), assetId = crypto.randomUUID(), takeId = crypto.randomUUID()
    data.assets.push({ id: assetId, kind: 'take', byteLength: i, mimeType: 'video/webm' })
    data.takes.push({ id: takeId, referenceVideoId: segment.videoId, cameraAssetId: assetId, referenceStartMs: segment.startMs, referenceEndMs: segment.endMs, rate: 0.5, state: 'ready', createdAt: row.startedAt })
    data.recipes.push({ id: crypto.randomUUID(), takeId, offsetMs: 0, referenceMirror: false, selfMirror: false, layout: 'side-by-side', audioSource: 'reference', revision: 1 })
    data.sessions.push({ ...row, takeId })
  }
  const history = sessionHistory(validateBackup(data), segment.id)
  expect(history[0].takeId).toBe(data.takes[0].id); expect(history[4].takeId).toBe(data.takes[4].id)
  const removed = planDeletion(data, 'take', history[0].takeId!).data
  expect(removed.sessions).toHaveLength(5); expect(removed.sessions[0].takeId).toBeUndefined(); expect(removed.sessions[4].takeId).toBe(history[4].takeId)
  expect(planDeletion(data, 'video', segment.videoId).counts.sessions).toBe(5)
  const wrong = structuredClone(data); wrong.takes[0].referenceEndMs++
  expect(() => validateBackup(wrong)).toThrow()
  const selected = { videoIds: [segment.videoId], markerIds: [], takeIds: [], exportIds: [], fields: [] }
  const shared = createShare(data, selected)
  expect(shared.sessions).toEqual([]); expect(shared.segments).toEqual([]); expect(shared.practiceChoices).toEqual([])
  const snapshot = selectedPractice(data, segment.videoId, data.takes[0].id, true)
  expect(snapshot.sessions).toEqual([]); expect(snapshot.segments).toEqual([]); expect(snapshot.practiceChoices).toEqual([])
  expect(() => validateBackup({ ...shared, sessions: data.sessions, segments: data.segments })).toThrow('私人')
})
