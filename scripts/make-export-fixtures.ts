/* 檔案用途：建立有上下邊界的橫／直式合成短片，供 #11 檢查完整身體與音軌。所在層：本機測試工具。主要關聯：export-failure.js、analyze-export-failure.py。 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const folder = resolve(import.meta.dir, '../output/export-failure')
mkdirSync(folder, { recursive: true })
for (const [name, size, top, bottom, frequency] of [
  ['reference', '320x180', 'white', 'red', 660],
  ['self', '180x320', 'lime', 'blue', 880],
] as const) {
  // 上下色條代表頭腳，左右色條區分鏡像；不同聲源可抓出自拍聲音被誤混入。
  const filter = `drawbox=x=0:y=0:w=iw:h=10:color=${top}:t=fill,drawbox=x=0:y=ih-10:w=iw:h=10:color=${bottom}:t=fill,drawbox=x=0:y=10:w=10:h=ih-20:color=yellow:t=fill,drawbox=x=iw-10:y=10:w=10:h=ih-20:color=magenta:t=fill`
  const result = Bun.spawnSync(['ffmpeg', '-v', 'error', '-n', '-f', 'lavfi', '-i', `color=c=0x202020:s=${size}:r=30:d=8`, '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=8`, '-vf', filter, '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', resolve(folder, `${name}.mp4`)], { stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode) throw new Error('短片建立失敗；須有 FFmpeg，且不能覆寫已有素材。')
}
console.log('已建立 #11 的八秒橫／直式合成素材；不含真人或第三方音樂。')
