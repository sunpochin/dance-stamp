/* 檔案用途：產生不含真人或音樂的時間碼／閃光／提示音測片。所在層：M0 測試工具。主要關聯：MEDIA_PROBE.md、ACCEPTANCE.md。 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
const dir = resolve(import.meta.dir, '../output/media-probe')
mkdirSync(dir, { recursive: true })
function ffmpeg(args: string[]) {
  // -n 保護既有測片，避免重跑工具時覆寫使用者另外保存的檔案。
  const result = Bun.spawnSync(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', ...args], { stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error('合成測片未建立；請確認本機有 FFmpeg，且目的檔尚不存在。')
}
const reference = resolve(dir, 'reference.mp4')
ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=65', '-f', 'lavfi', '-i', 'aevalsrc=sin(2*PI*660*t)*lt(mod(t\\,1)\\,0.06):s=48000:d=65', '-vf', 'drawbox=x=0:y=0:w=iw:h=30:color=white:t=fill:enable=lt(mod(t\\,1)\\,0.06)', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', reference])
// 假相機只供事件回歸，不是 G2 的真機時間校正證據；短檔會由 Chromium 循環使用。
ffmpeg(['-i', reference, '-t', '15', '-an', '-pix_fmt', 'yuv420p', '-f', 'yuv4mpegpipe', resolve(dir, 'camera.y4m')])
const init = resolve(dir, 'fake-camera-init.js')
await Bun.write(init, 'window.__danceSyntheticCameraOnly = true;\n')
await Bun.write(resolve(dir, 'browser.json'), JSON.stringify({ browser: { browserName: 'chromium', isolated: true, initScript: [init], launchOptions: { channel: 'chrome', headless: false, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${resolve(dir, 'camera.y4m')}`] }, contextOptions: { viewport: { width: 1280, height: 960 }, acceptDownloads: true } } }, null, 2))
console.log('已產生 output/media-probe/reference.mp4 與 camera.y4m；均不加入 Git。')
