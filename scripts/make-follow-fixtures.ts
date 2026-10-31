/* 檔案用途：用虛構人物圖片製作雙向移動的合成追蹤素材。所在層：測試工具。主要關聯：tests/fixtures/follow-person.jpg、tests/browser/person-follow.js。 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dir, '..'), directory = resolve(root, 'output/follow')
mkdirSync(directory, { recursive: true })
for (const [side, x, flip, frequency] of [['reference', '30+70*t', 'null', 660], ['self', '550-70*t', 'hflip', 660], ['self-audio', '550-70*t', 'hflip', 880]]) {
  const path = resolve(directory, `${side}.mp4`)
  if (existsSync(path)) continue
  // 人物完全由 AI 生成；移動是可重現的數學軌跡，不能冒充真人跳舞或遮擋驗收。
  const filter = `[1:v]scale=320:480,${flip}[person];[0:v][person]overlay=x='${x}':y=30:shortest=1[v]`
  const result = Bun.spawnSync(['ffmpeg', '-v', 'error', '-n', '-f', 'lavfi', '-i', 'color=c=0xcccccc:s=960x540:r=30:d=4', '-loop', '1', '-i', resolve(root, 'tests/fixtures/follow-person.jpg'), '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=4`, '-filter_complex', filter, '-map', '[v]', '-map', '2:a', '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', path], { stdout: 'inherit', stderr: 'inherit' })
  assert.equal(result.exitCode, 0)
}
console.log('人物追蹤合成素材備妥；只有虛構人物與自製聲音。')
