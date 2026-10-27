/* 檔案用途：產生可獨立讀出影格時間的雙片與不同聲源。所在層：本機合成驗收工具。主要關聯：analyze-comparison.py、existing-comparison.js。 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const dir = resolve(import.meta.dir, '../output/comparison')
mkdirSync(dir, { recursive: true })
function ffmpeg(args: string[]) {
  const result = Bun.spawnSync(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', ...args], { stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode) throw new Error('測片未建立；目的檔不得已存在，且需本機 FFmpeg。')
}
const reference = resolve(dir, 'reference.mp4')
// 二進位影格碼讓驗收讀取真正成檔畫面，不拿 JS 預定播放位置冒充同步證據。
const boxes = Array.from({ length: 12 }, (_, bit) => `drawbox=x=${8 + bit * 24}:y=50:w=18:h=50:color=white:t=fill:enable='bitand(n,${2 ** bit})'`)
ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x101820:s=320x180:r=30:d=80', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=80', '-vf', [...boxes, 'drawbox=x=0:y=145:w=80:h=35:color=red:t=fill', 'drawbox=x=240:y=145:w=80:h=35:color=blue:t=fill'].join(','), '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', reference])
for (const rate of [1, 0.75, 0.5]) {
  // 老師 12 秒對自己 4 秒；自己的片保留老師影格碼，另換 880Hz 聲源以抓出重複混音。
  ffmpeg(['-ss', String(12 - rate * 4), '-i', reference, '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=80', '-filter_complex', `[0:v]setpts=(PTS-STARTPTS)/${rate},fps=30[v]`, '-map', '[v]', '-map', '1:a', '-t', '75', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', resolve(dir, `self-${rate}.mp4`)])
}
ffmpeg(['-i', reference, '-an', '-c:v', 'copy', resolve(dir, 'silent.mp4')])
console.log('已建立 output/comparison 的影格碼測片、三個固定比例與無音軌測片；不含真人或第三方音樂。')
