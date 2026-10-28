/* 檔案用途：建立自製 120 BPM／第一拍 0.35 秒的短測片。所在層：合成驗收工具。主要關聯：tests/browser/beats.js、MEDIA_PROBE.md。 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const dir = resolve(import.meta.dir, '../output/beats')
mkdirSync(dir, { recursive: true })
// 不覆寫任何既有素材；只產生合成聲音與時間圖樣，不讀相機或商用音樂。
const result = Bun.spawnSync(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', '-threads', '1',
  '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=20',
  '-f', 'lavfi', '-i', 'aevalsrc=sin(2*PI*660*t)*gte(t\\,0.35)*lt(mod(t-0.35\\,0.5)\\,0.06):s=48000:d=20',
  '-vf', 'drawbox=x=0:y=0:w=iw:h=20:color=white:t=fill:enable=gte(t\\,0.35)*lt(mod(t-0.35\\,0.5)\\,0.06)',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', resolve(dir, 'reference.mp4')], { stdout: 'inherit', stderr: 'inherit' })
if (result.exitCode !== 0) throw new Error('測片未建立，請確認 FFmpeg 及目的檔不存在。')
console.log('已產生 output/beats/reference.mp4；僅留本機。')
