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
