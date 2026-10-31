/* 檔案用途：驗證人物不隨鏡像換身分、歧義拒絕與時間裁切。所在層：純邏輯回歸。主要關聯：web/follow.js。 */
import { expect, test } from 'bun:test'
import { validBox, matchPerson, followBox, cropAt, smoothTrack, followSize } from '../../web/follow.js'

test('跟隨同一個移動目標，遠方旁人與重疊歧義不能直接接手', () => {
  const first = { x: .1, y: .1, width: .2, height: .7 }, next = { ...first, x: .14 }, other = { ...first, x: .7 }
  expect(matchPerson([other, next], first)).toEqual(next)
  expect(matchPerson([other], first)).toBeNull()
  expect(matchPerson([next, { ...next, x: .15 }], first)).toBeNull()
  expect(matchPerson([], first)).toBeNull()
  const selection = { x: .05, y: .05, width: .3, height: .85 }
  expect(followBox(selection, first, next).x).toBeCloseTo(.09)
  expect(followBox(selection, first, next).width).toBeCloseTo(.3)
})
test('單側輸出保留裁切比例、限制長邊並使用可編碼的偶數尺寸', () => {
  const track = { start: 0, end: 3, held: 0, samples: [{ time: 0, x: .1, y: .05, width: .25, height: .9 }] }
  expect(followSize({ videoWidth: 3840, videoHeight: 2160 } as HTMLVideoElement, track)).toEqual({ width: 632, height: 1280 })
  const small = { ...track, samples: [{ ...track.samples[0], width: .5, height: .5 }] }
  expect(followSize({ videoWidth: 320, videoHeight: 240 } as HTMLVideoElement, small)).toEqual({ width: 160, height: 120 })
})
test('裁切插值依來源秒數，seek 順序與輸出尺寸不改路徑', () => {
  const a = { time: 12, x: .05, y: .05, width: .3, height: .85 }, b = { ...a, time: 14, x: .45 }
  const track = { start: 12, end: 14, samples: [a, b], held: 0 }
  expect(cropAt(track, 13).x).toBeCloseTo(.25)
  expect(cropAt(track, 14).x).toBeCloseTo(.45)
  expect(cropAt(track, 12).x).toBeCloseTo(.05)
  expect(cropAt(track, 13).x).toBeCloseTo(.25)
  expect(validBox({ x: 2, y: -1, width: .3, height: .8 })).toEqual({ x: .7, y: 0, width: .3, height: .8 })
  expect(() => validBox({ ...a, width: 0 })).toThrow()
  expect(() => validBox({ ...a, x: NaN })).toThrow()
  const smoothed = smoothTrack([a, { ...a, time: 13, x: .25 }, b])
  expect(smoothed[1].x).toBeCloseTo(.25)
  expect(smoothed.map(p => p.time)).toEqual([12, 13, 14])
})
