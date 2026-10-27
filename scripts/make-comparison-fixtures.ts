/* 檔案用途：產生可由輸出像素讀回時間的雙片測片。所在層：本機驗收工具。主要關聯：existing-comparison.js、RECORD_COMPARE.md。 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const dir = resolve(import.meta.dir, '../output/comparison-fixtures')
mkdirSync(dir, { recursive: true })
function ffmpeg(args: string[]) {
  const result = Bun.spawnSync(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', ...args], { stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error('雙片測片建立失敗；不覆寫既有檔案，請檢查 FFmpeg 與目的位置。')
}
// 每幀有 12 個黑白 bit，可直接從成檔像素還原來源 frame，不拿 JS 預定時間冒充同步。
const bars = ['drawbox=x=0:y=324:w=640:h=36:color=black:t=fill', ...Array.from({ length: 12 }, (_, bit) => `drawbox=x=${16 + bit * 24}:y=332:w=20:h=20:color=white:t=fill:enable='mod(floor(n/${2 ** bit}),2)'`)]
const teacher = resolve(dir, 'teacher.mp4')
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=90', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=90', '-vf', bars.join(','), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', teacher])
ffmpeg(['-i', teacher, '-an', '-c:v', 'copy', '-movflags', '+faststart', resolve(dir, 'teacher-silent.mp4')])
ffmpeg(['-i', teacher, '-t', '15', '-an', '-c:v', 'copy', '-movflags', '+faststart', resolve(dir, 'teacher-short.mp4')])
ffmpeg(['-i', teacher, '-t', '1', '-an', '-c:v', 'ffv1', resolve(dir, 'unsupported.mkv')])
writeFileSync(resolve(dir, 'empty.mp4'), '', { flag: 'wx' })
for (const rate of [1, 0.75, 0.5]) {
  // 自己影片從老師第八秒開始，固定放慢為當時跟跳速度；音軌改成 880Hz 以便抓出誤混音。
  const duration = 82 / rate
  ffmpeg(['-ss', '8', '-i', teacher, '-f', 'lavfi', '-i', `sine=frequency=880:sample_rate=48000:duration=${duration}`, '-filter_complex', `[0:v]setpts=(PTS-STARTPTS)/${rate},fps=30[v]`, '-map', '[v]', '-map', '1:a', '-t', String(duration), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', resolve(dir, `own-${rate}.mp4`)])
}
console.log('已產生 90 秒老師片與三種跟跳速度原片，均為合成媒體，位於 ignored output/comparison-fixtures。')
