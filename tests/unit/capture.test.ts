/* 檔案用途：驗證新錄影時長、錯誤提示與暫存片段完整性。所在層：媒體純邏輯測試。主要關聯：timeline.js、recorder.js、storage.js。 */
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { captureDuration } from '../../web/timeline.js'
import { assembleChunks, cameraError, normalizedVideo } from '../../web/recorder.js'
import { newLibrary, validateBackup } from '../../web/library.js'

test('等待期間跨過 B 仍檢查聲音狀態與原 100ms 界線', async () => {
  const main = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8')
  const source = main.match(/status\('錄影中。[^]*?(?=\n      } finally \{)/)![0]
  const completion = main.match(/info\.interrupted = signal\.aborted[^;]*;/)![0]
  // 直接跑產品迴圈；只模擬 await 期間原生影像已跨 B，防止測試複製檢查而漏掉收尾位置。
  // 暫停案刻意對齊時鐘，才能獨立驗證狀態檢查。
  for (const [state, elapsed, rejected, at, ended] of [
    ['running', 15.068, false, 15.068, false], ['running', 14.969, false, 15.068, false],
    ['running', 14.967, true, 15.068, false], ['suspended', 15.068, true, 15.068, false],
    ['running', 15.15, false, 15, true], ['suspended', 15.15, true, 15, true], ['running', 15.15, true, 15.15, false],
  ] as const) {
    const reference = { currentTime: 14.93, ended: false, paused: false }, audio = { state: 'running', currentTime: 14.93 }
    const info = { interrupted: false }
    const pending = runInNewContext(`(async () => { let captureIntegrityError; try { ${source} } finally { ${completion} } })()`, {
      reference, audio, info, value: { startMs: 0, endMs: 15_000, rate: 1 }, expectedDurationMs: 15_000, captureSource: {}, captureAudioAt: 0,
      began: 0, performance: { now: () => 0 }, signal: new AbortController().signal, status() {}, renderBeatPosition() {},
      wait: async () => { reference.currentTime = at; reference.ended = ended; audio.state = state; audio.currentTime = elapsed },
    })
    if (rejected) await expect(pending).rejects.toThrow('示範聲音中斷或不同步')
    else await expect(pending).resolves.toBeUndefined()
    expect(info.interrupted).toBe(rejected)
  }
})

test('有界供聲的 EOF 成功片仍守住未四捨五入的 ±100ms，不擋中斷保全或其他聲路', () => {
  const main = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8')
  const source = main.match(/info\.durationMs = candidate\.duration;[^]*?(?=\n              return Promise\.resolve\(\);)/)![0]
  // 直接跑提交前檢查；100.1ms 即使 metadata 四捨五入為 100，也不能因聲音時鐘有終點而冒充成功。
  for (const [duration, ended, hasSound, interrupted, rejected] of [
    [14900, true, true, false, false], [15100, true, true, false, false],
    [14899.9, true, true, false, true], [15100.1, true, true, false, true],
    [15150, false, true, false, false], [15150, true, false, false, false], [15150, true, true, true, false],
  ] as const) {
    const info = { interrupted }
    const run = () => runInNewContext(`(() => { let captureIntegrityError; ${source} return info; })()`, {
      candidate: { duration: Math.round(duration) }, self: { duration: duration / 1000 }, reference: { ended },
      captureSource: hasSound ? {} : undefined, expectedDurationMs: 15_000, info,
    })
    if (rejected) expect(run).toThrow('原片長度不符')
    else expect(run()).toBe(info)
    expect(info.interrupted).toBe(interrupted || rejected)
  }
})

test('EBML 容器依文件類型辨識 WebM 與 Matroska，補正 MIME 不更動原片 bytes', async () => {
  // 兩種容器共用 EBML magic；只看開頭四 bytes 會把 Matroska 誤叫成 WebM。
  for (const [docType, mime] of [['\x42\x82\x84webm', 'video/webm'], ['\x42\x82\x88matroska', 'video/x-matroska']]) {
    const original = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), Uint8Array.from(docType, character => character.charCodeAt(0))], { type: 'application/octet-stream' })
    const normalized = await normalizedVideo(original)
    expect(normalized.type).toBe(mime)
    expect(await normalized.arrayBuffer()).toEqual(await original.arrayBuffer())
    expect(original.type).toBe('application/octet-stream')
  }
})

test('以實際錄製時間限制 15–60 秒，三種速度共用同一邊界', () => {
  for (const rate of [0.5, 0.75, 1]) for (const duration of [15_000, 30_000, 60_000]) {
    expect(captureDuration({ startMs: 2000, endMs: 2000 + duration * rate, rate })).toBe(duration)
  }
  for (const rate of [0.5, 0.75, 1]) for (const duration of [14_000, 61_000]) {
    expect(() => captureDuration({ startMs: 0, endMs: duration * rate, rate })).toThrow()
  }
  expect(() => captureDuration({ startMs: 0, endMs: 30_000, rate: 2 })).toThrow()
})
test('只組合從零連續且容器一致的非空 chunks，拒絕後不改原件', async () => {
  const first = new Blob(['first'], { type: 'video/mp4' }), last = new Blob(['last'], { type: 'video/mp4;codecs=avc1' })
  expect(await assembleChunks([{ index: 0, blob: first }, { index: 1, blob: last }]).text()).toBe('firstlast')
  for (const rows of [[], [{ index: 1, blob: first }], [{ index: 0, blob: first }, { index: 2, blob: last }], [{ index: 0, blob: first }, { index: 0, blob: last }], [{ index: 0, blob: new Blob([]) }], [{ index: 0, blob: first }, { index: 1, blob: new Blob(['x'], { type: 'video/webm' }) }]]) expect(() => assembleChunks(rows)).toThrow()
  expect(await first.text()).toBe('first')
})
test('相機拒絕、占用、缺少後鏡頭與未知錯誤都有可重試的中文說明', () => {
  expect(cameraError({ name: 'NotAllowedError', message: 'synthetic private camera label' }, 'user').message).toContain('允許相機')
  expect(cameraError({ name: 'NotReadableError' }, 'user').message).toContain('其他程式')
  expect(cameraError({ name: 'OverconstrainedError' }, 'environment').message).toContain('後鏡頭')
  expect(cameraError({ name: 'NotFoundError' }, 'user').message).toContain('找不到')
  expect(cameraError({ name: 'unknown' }, 'user').message).toContain('重試')
})
test('錄影觀測值可往返、只接受整數毫秒並排除裝置欄位，不假定非同步事件順序', () => {
  const data = newLibrary(), videoId = crypto.randomUUID(), assetId = crypto.randomUUID()
  data.videos.push({ id: videoId, title: '合成時間對照', durationMs: 60_000, revision: 1 })
  data.assets.push({ id: assetId, kind: 'take', byteLength: 1, mimeType: 'video/mp4' })
  const captureTiming = { recorderRequestedMs: 100, recorderStartedMs: 107, referencePlayResolvedMs: 105, referenceAtPlayMs: 250 }
  data.takes.push({ id: crypto.randomUUID(), referenceVideoId: videoId, cameraAssetId: assetId, referenceStartMs: 0, referenceEndMs: 15_000, rate: 1, state: 'interrupted', createdAt: new Date().toISOString(), captureTiming })
  Object.assign(captureTiming, { deviceId: 'synthetic-only' })
  expect(validateBackup(data).takes[0].captureTiming).toEqual({ recorderRequestedMs: 100, recorderStartedMs: 107, referencePlayResolvedMs: 105, referenceAtPlayMs: 250 })
  for (const change of [{ recorderRequestedMs: -1 }, { recorderStartedMs: 1.5 }, { referencePlayResolvedMs: NaN }, { referenceAtPlayMs: 60_001 }]) {
    const bad = structuredClone(data); Object.assign(bad.takes[0].captureTiming, change); expect(() => validateBackup(bad)).toThrow()
  }
})

// 直接擷取實際產品函式執行；spy讀取次數與首錯收據，不另抄判定公式當測試。
function audioGuardHarness(initial: { state?: string; reference?: number; audio?: number; source?: boolean; startMs?: number; rate?: number; expected?: number; audioAt?: number; info?: any; output?: object } = {}) {
  const source = readFileSync(new URL('../../web/main.js', import.meta.url), 'utf8').match(/const checkCaptureAudio = \(\) => \{[^]*?\n        };/)![0]
  const values = { state: 'running', reference: 0, audio: 0, ...initial }, reads: string[] = [], info = initial.info ?? {}
  const reference = { get currentTime() { reads.push('reference.currentTime'); return values.reference } }
  const audio = { get state() { reads.push('audio.state'); return values.state }, get currentTime() { reads.push('audio.currentTime'); return values.audio } }
  Object.defineProperties(audio, Object.getOwnPropertyDescriptors(initial.output ?? { baseLatency: 0, outputLatency: 0, sampleRate: 48000 }))
  const check = runInNewContext(`(() => { let captureIntegrityError; ${source} return checkCaptureAudio; })()`, {
    captureSource: initial.source === false ? undefined : {}, reference, audio, info,
    value: { startMs: initial.startMs ?? 0, rate: initial.rate ?? 1 }, captureAudioAt: initial.audioAt ?? 0, expectedDurationMs: initial.expected ?? 15000,
    performance: { now() { reads.push('postDecisionAt'); return 1234.5 } },
  })
  return { check, values, reads, info, audio }
}
test('錄影聲音100ms兩側邊界原樣，成功不配置packet或讀診斷時鐘', () => {
  for (const reference of [0, .1, -.1]) {
    const h = audioGuardHarness({ reference }); expect(h.check).not.toThrow()
    expect(h.reads).toEqual(['audio.state', 'reference.currentTime', 'audio.currentTime'])
    expect(Object.hasOwn(h.info, 'audioGuardFailure')).toBe(false)
  }
  for (const reference of [.100001, -.100001]) {
    const h = audioGuardHarness({ reference }); expect(h.check).toThrow('示範聲音中斷或不同步，請重新錄影。')
    expect(h.info.audioGuardFailure.reason).toBe('clock-drift')
    expect(h.info.audioGuardFailure.mappedElapsedMs).toBeCloseTo(reference * 1000, 6)
    expect(h.info.audioGuardFailure.pcmElapsedMs).toBe(0)
    expect(h.reads).toEqual(['audio.state', 'reference.currentTime', 'audio.currentTime', 'postDecisionAt', 'postDecisionAt', 'postDecisionAt'])
  }
})
test('原聲路不存在不讀state，非running短路不碰兩時鐘，packet如實null', () => {
  const none = audioGuardHarness({ source: false }); expect(none.check).not.toThrow(); expect(none.reads).toEqual([]); expect(none.info).toEqual({})
  for (const state of ['suspended', 'closed', 'interrupted']) {
    const h = audioGuardHarness({ state }); expect(h.check).toThrow('示範聲音中斷或不同步')
    expect(h.reads).toEqual(['audio.state', 'postDecisionAt', 'postDecisionAt', 'postDecisionAt'])
    expect(h.info.audioGuardFailure).toEqual({ reason: 'context-not-running', state, referenceTime: null, audioTime: null, mappedElapsedMs: null, pcmElapsedMs: null, captureAudioAt: 0, startMs: 0, rate: 1, expectedDurationMs: 15000, postDecisionAtMs: 1234.5, outputObservation: { readBeforeMs: 1234.5, readAfterMs: 1234.5, timestampStatus: 'unsupported', contextTime: null, performanceTime: null, baseLatency: 0, outputLatency: 0, sampleRate: 48000, errors: [] } })
  }
})
test('守門首次原始讀值按A/速度及PCM終點保存，後次失敗不覆寫或再讀診斷時鐘', () => {
  const h = audioGuardHarness({ reference: 2.2, audio: 1.2, audioAt: 1, startMs: 2000, rate: .5 })
  expect(h.check).toThrow('示範聲音中斷或不同步'); const first = h.info.audioGuardFailure
  expect(first.referenceTime).toBe(2.2); expect(first.audioTime).toBe(1.2); expect(first.mappedElapsedMs).toBeCloseTo(400); expect(first.pcmElapsedMs).toBeCloseTo(200)
  h.values.reference = 2.4; expect(h.check).toThrow('示範聲音中斷或不同步')
  expect(h.info.audioGuardFailure).toBe(first); expect(h.reads.filter(name => name === 'postDecisionAt')).toHaveLength(3)
  const tail = audioGuardHarness({ reference: 15.1, audio: 50 }); expect(tail.check).not.toThrow(); expect(tail.info).toEqual({})
})
test('診斷不可吞原聲音錯誤，非finite讀值JSON不悄悄變null', () => {
  const broken = audioGuardHarness({ reference: .2, info: Object.defineProperty({}, 'audioGuardFailure', { get() { throw Error('synthetic diagnostic getter failure') } }) }); expect(broken.check).toThrow('示範聲音中斷或不同步')
  const nonfinite = audioGuardHarness({ reference: Infinity }); expect(nonfinite.check).toThrow('示範聲音中斷或不同步')
  expect(JSON.parse(JSON.stringify(nonfinite.info)).audioGuardFailure.referenceTime).toBe('Infinity')
  expect(JSON.parse(JSON.stringify(nonfinite.info)).audioGuardFailure.mappedElapsedMs).toBe('Infinity')
})


test('首拒絕後只讀一次原生輸出鐘並保留receiver、raw零值與舊timestamp', () => {
  const calls: string[] = []; let receiver: unknown
  const output = {
    get getOutputTimestamp() { calls.push('method'); return function(this: unknown) { receiver = this; calls.push('call'); return { get contextTime() { calls.push('contextTime'); return 0 }, get performanceTime() { calls.push('performanceTime'); return 1 } } } },
    get baseLatency() { calls.push('baseLatency'); return 0 },
    get outputLatency() { calls.push('outputLatency'); return .12 },
    get sampleRate() { calls.push('sampleRate'); return 48000 },
  }
  const h = audioGuardHarness({ reference: .2, output })
  expect(h.check).toThrow('示範聲音中斷或不同步')
  expect(receiver).toBe(h.audio)
  expect(calls).toEqual(['method', 'call', 'contextTime', 'performanceTime', 'baseLatency', 'outputLatency', 'sampleRate'])
  expect(h.info.audioGuardFailure.outputObservation).toEqual({ readBeforeMs: 1234.5, readAfterMs: 1234.5, timestampStatus: 'returned', contextTime: 0, performanceTime: 1, baseLatency: 0, outputLatency: .12, sampleRate: 48000, errors: [] })
  const first = h.info.audioGuardFailure; expect(h.check).toThrow('示範聲音中斷或不同步'); expect(h.info.audioGuardFailure).toBe(first); expect(calls).toHaveLength(7)
})
test('未提供輸出API或getter失敗如實記錄，不能遮原拒絕或補造時鐘', () => {
  const unsupported = audioGuardHarness({ reference: .2, output: {} })
  expect(unsupported.check).toThrow('示範聲音中斷或不同步')
  expect(unsupported.info.audioGuardFailure.outputObservation).toEqual({ readBeforeMs: 1234.5, readAfterMs: 1234.5, timestampStatus: 'unsupported', contextTime: null, performanceTime: null, baseLatency: null, outputLatency: null, sampleRate: null, errors: ['baseLatency:unsupported', 'outputLatency:unsupported', 'sampleRate:unsupported'] })
  const broken = audioGuardHarness({ state: 'suspended', output: {
    getOutputTimestamp() { throw new Error('synthetic private diagnostic detail') },
    get baseLatency() { throw new Error('synthetic private diagnostic detail') }, outputLatency: 0, sampleRate: Infinity,
  } })
  expect(broken.check).toThrow('示範聲音中斷或不同步')
  expect(broken.reads).not.toContain('reference.currentTime'); expect(broken.reads).not.toContain('audio.currentTime')
  const observation = broken.info.audioGuardFailure.outputObservation
  expect(observation.timestampStatus).toBe('error'); expect(observation.contextTime).toBe(null); expect(observation.performanceTime).toBe(null)
  expect(observation.baseLatency).toBe(null); expect(observation.outputLatency).toBe(0); expect(observation.sampleRate).toBe('Infinity')
  expect(observation.errors).toEqual(['getOutputTimestamp:Error', 'baseLatency:Error'])
  expect(JSON.stringify(observation)).not.toContain('private diagnostic detail')
})
test('成功及無聲路完全不碰輸出診斷API', () => {
  const output = { get getOutputTimestamp() { throw new Error('must not read') }, get baseLatency() { throw new Error('must not read') } }
  for (const initial of [{ reference: .1, output }, { source: false, output }]) {
    const h = audioGuardHarness(initial); expect(h.check).not.toThrow(); expect(h.info).toEqual({})
    expect(h.reads).not.toContain('postDecisionAt')
  }
})

test('原生timestamp全零也保留原值，不以不可用判斷改寫成null', () => {
  const h = audioGuardHarness({ reference: .2, output: { getOutputTimestamp() { return { contextTime: 0, performanceTime: 0 } }, baseLatency: 0, outputLatency: 0, sampleRate: 48000 } })
  expect(h.check).toThrow('示範聲音中斷或不同步')
  expect(h.info.audioGuardFailure.outputObservation.timestampStatus).toBe('returned')
  expect(h.info.audioGuardFailure.outputObservation.contextTime).toBe(0)
  expect(h.info.audioGuardFailure.outputObservation.performanceTime).toBe(0)
})
