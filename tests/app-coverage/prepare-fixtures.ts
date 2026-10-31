/* 檔案用途：準備可重跑的無真人合成素材，不覆寫既有測片。所在層：覆蓋率測試前置。主要關聯：scripts/make-*-fixtures.ts、run-app.ts。 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from './instrument'

export const fixtureFiles = [
  'media-probe/reference.mp4', 'media-probe/short/reference.mp4', 'media-probe/empty/reference.mp4',
  ...['portrait.mp4', 'orientation.mp4', 'sample.mov', 'vfr.mp4', 'renamed.data', 'corrupt.mp4'].map(name => `media-probe/player/${name}`),
  'export-failure/reference.mp4', 'export-failure/self.mp4', 'media-feasibility/reference.mp4',
  ...['reference.mp4', 'self-1.mp4', 'self-0.75.mp4', 'self-0.5.mp4', 'silent.mp4'].map(name => `comparison/${name}`),
  'beats/reference.mp4', 'share18/cut/reference.mp4', 'share18/different/reference.mp4',
]
if (import.meta.main) {
  // 恢復守門沿原65秒來源及原4秒切片；完整量測不需要另產一份相機Y4M。
  if (!existsSync(resolve(root, 'output/media-feasibility/reference.mp4'))) assert.equal(Bun.spawnSync(['python3', 'scripts/make-sync-fixtures.py', '--reference-only'], { cwd: root, stdout: 'inherit', stderr: 'inherit' }).exitCode, 0)
  for (const [script, sentinel] of [['media', 'media-probe/camera.y4m'], ['player', 'media-probe/player/corrupt.mp4'], ['export', 'export-failure/self.mp4'], ['comparison', 'comparison/silent.mp4'], ['beat', 'beats/reference.mp4']]) {
    if (existsSync(resolve(root, 'output', sentinel))) continue
    assert.equal(Bun.spawnSync([process.execPath, '--no-env-file', `scripts/make-${script}-fixtures.ts`], { cwd: root, stdout: 'inherit', stderr: 'inherit' }).exitCode, 0)
  }
  for (const [name, source, duration] of [['cut', 'reference', '2'], ['different', 'self', '8']]) {
    const path = resolve(root, 'output/share18', name, 'reference.mp4')
    if (existsSync(path)) continue
    mkdirSync(resolve(path, '..'), { recursive: true })
    assert.equal(Bun.spawnSync(['ffmpeg', '-v', 'error', '-n', '-i', resolve(root, 'output/export-failure', `${source}.mp4`), '-t', duration, '-c', 'copy', path], { stdout: 'inherit', stderr: 'inherit' }).exitCode, 0)
  }
  for (const file of fixtureFiles) assert(existsSync(resolve(root, 'output', file)), `缺少合成素材：${file}`)
  console.log('全 App 覆蓋率合成素材已備妥；未覆寫既有檔案。')
}
