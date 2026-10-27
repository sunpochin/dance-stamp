/* 檔案用途：產生播放器格式／方向／錯誤矩陣。所在層：開發合成測片。主要關聯：make-media-fixtures.ts、tests/browser/player.js。 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const dir = resolve(import.meta.dir, '../output/media-probe/player')
const source = resolve(import.meta.dir, '../output/media-probe/short/reference.mp4')
if (!await Bun.file(source).exists()) throw new Error('請先執行 scripts/make-media-fixtures.ts。')
mkdirSync(dir, { recursive: true })
for (const name of ['portrait.mp4', 'orientation.mp4', 'sample.mov', 'vfr.mp4', 'renamed.data', 'corrupt.mp4']) {
  if (await Bun.file(resolve(dir, name)).exists()) throw new Error(`目的檔已存在，未覆寫：${name}`)
}
function make(args: string[], name: string) {
  // 不覆寫測片，避免把使用者自行保存的成檔當成可隨意清掉的測試暫存。
  const result = Bun.spawnSync(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', ...args, resolve(dir, name)], { stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error(`測片建立失敗：${name}`)
}
make(['-f', 'lavfi', '-i', 'testsrc=size=180x320:rate=30:duration=3', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'], 'portrait.mp4')
make(['-display_rotation', '90', '-i', source, '-c', 'copy'], 'orientation.mp4')
make(['-i', source, '-c', 'copy', '-f', 'mov'], 'sample.mov')
make(['-i', source, '-vf', "select='not(eq(mod(n,5),0))'", '-fps_mode', 'vfr', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'], 'vfr.mp4')
await Bun.write(resolve(dir, 'renamed.data'), Bun.file(source))
await Bun.write(resolve(dir, 'corrupt.mp4'), 'synthetic-invalid-video')
console.log('播放器合成測片已建立：直向、旋轉、MOV、VFR、改名與損壞檔。')
