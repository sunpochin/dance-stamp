/* 檔案用途：從 VS 成檔像素量測雙側起中末同步。所在層：獨立媒體驗收工具。主要關聯：existing-export.js、RECORD_COMPARE.md。 */
const manifest = process.argv[2]
if (!manifest) throw new Error('請提供 existing-export 結果的 JSON 陣列檔。')
const records = await Bun.file(manifest).json()
function run(args: string[]) {
  const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0 || result.stderr.length) throw new Error(Buffer.from(result.stderr).toString() || '媒體工具失敗')
  return result.stdout
}
for (const record of records) {
  const probe = JSON.parse(Buffer.from(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_frames', '-show_entries', 'stream=width,height:frame=best_effort_timestamp_time', '-of', 'json', record.file])).toString())
  if (probe.streams[0].width !== 1280 || probe.streams[0].height !== 720) throw new Error('成檔尺寸不符合此測片的像素位置。')
  const times = probe.frames.map((frame: {best_effort_timestamp_time: string}) => Number(frame.best_effort_timestamp_time)) as number[]
  if (times.some((time, index) => index > 0 && time <= times[index - 1])) throw new Error('成檔影格時間沒有嚴格遞增。')
  const targets = [times[0], 1, record.seconds / 2, record.seconds - 1, times.at(-1)!]
  const indices = targets.map(target => times.reduce((best, time, index) => Math.abs(time - target) < Math.abs(times[best] - target) ? index : best, 0))
  const selection = indices.map(index => `eq(n\\,${index})`).join('+')
  const pixels = run(['ffmpeg', '-v', 'error', '-i', record.file, '-vf', `select=${selection}`, '-frames:v', String(indices.length), '-fps_mode', 'passthrough', '-enc_time_base:v', 'demux', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
  const frameSize = 1280 * 720 * 3
  if (pixels.length !== frameSize * indices.length) throw new Error('沒有取回起中末及真正首尾影格。')
  function counter(frame: number, side: number, mirror: boolean) {
    let value = 0
    for (let bit = 0; bit < 12; bit++) {
      const x = side * 640 + (mirror ? 639 - (26 + bit * 24) : 26 + bit * 24), offset = frame * frameSize + (546 * 1280 + x) * 3
      const brightness = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3
      if (brightness > 80 && brightness < 180) throw new Error('時間碼不清楚，不能猜測同步通過。')
      if (brightness >= 180) value += 2 ** bit
    }
    return value
  }
  const points = targets.map((target, index) => {
    const leftFrame = counter(index, 0, record.recipe.referenceMirror), rightFrame = counter(index, 1, record.recipe.selfMirror)
    return { target, outputTime: times[indices[index]], leftFrame, rightFrame, errorMs: (leftFrame - rightFrame) / 30 / record.recipe.rate * 1000 }
  })
  // 先驗證畫面確實前進，再套唯一 G2 門檻；兩側一起凍結不能用零差值混過去。
  if (points.some((p, i) => i > 0 && (p.leftFrame <= points[i - 1].leftFrame || p.rightFrame <= points[i - 1].rightFrame))) throw new Error('畫面未持續前進。')
  // 全黑首幀也會讀成零，還要核對 A+rL，不能用兩個零誤判對齊成功。
  const expectedFirst = (record.recipe.startMs + record.recipe.rate * Math.max(0, -record.recipe.offsetMs)) / 1000 * 30
  if (Math.abs(points[0].leftFrame - expectedFirst) > 1) throw new Error('首幀不是配方指定的老師起點。')
  const driftMs = points.at(-1)!.errorMs - points[0].errorMs
  const passed = points.every(point => Math.abs(point.errorMs) <= 100) && Math.abs(driftMs) <= 100
  const result = { file: record.file, rate: record.recipe.rate, points, driftMs, passed }
  console.log(JSON.stringify(result))
  if (!passed) throw new Error('實際成檔未通過 G2，不以 JS clock 或固定偏移隱藏漂移。')
}
