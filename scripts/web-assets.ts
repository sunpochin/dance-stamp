/* 檔案用途：共用靜態白名單與回應政策，避免下載包和本機主機漂移。所在層：建置工具。主要關聯：build-web.ts、serve-web.ts、package-web.ts。 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// 拍點與有界音訊都沿用同一白名單，建置、離線快取及下載包才不會漏掉依賴。
// 只複製固定版套件的必要檔；平面路徑讓裸包、本機主機與離線 manifest 共用相同白名單。
export const visionAssets: Record<string, string> = {
  'vision-bundle.js': 'node_modules/@mediapipe/tasks-vision/vision_bundle.js',
  'vision-wasm.js': 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js',
  'vision-wasm.wasm': 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm',
  'vision-simd.js': 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js',
  'vision-simd.wasm': 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm',
  'person-model.tflite': 'vendor/mediapipe/efficientdet-lite0.tflite',
}
// 二進位不能當文字做秘密掃描；兩種 runtime 與模型都固定指紋，不因加速放寬完整性。
export const binaryAssetHashes: Record<string, string> = {
  'vision-wasm.wasm': 'ed5e5e5812490bd90d6a440290845ff9e4c516f696847a28a0c0e0573470d469',
  'vision-simd.wasm': 'bcc13df22d3d69ec8cbe8e280989356d844ae00f4523eb82072d2484f44134dc',
  'person-model.tflite': '0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb',
}
export function webAssetBytes(root: string, file: string) {
  const bytes = readFileSync(visionAssets[file] ? resolve(root, visionAssets[file]) : resolve(root, 'web', file))
  // Emscripten 的虛擬家目錄不是使用者路徑；兩處同改為公開範例，保留原公開掃描強度。
  return ['vision-wasm.js', 'vision-simd.js'].includes(file) ? new TextEncoder().encode(bytes.toString().replaceAll(JSON.stringify(['', 'home', 'web_user'].join('/')), '"/home/example"')) : bytes
}
export const webFiles = ['index.html', 'style.css', 'main.js', 'timeline.js', 'local-audio.js', 'beats.js', 'recorder.js', 'library.js', 'storage.js', 'offline.js', 'sw.js', 'follow.js', 'follow-ui.js', 'follow-metrics.js', 'follow-export.js', 'person-worker.js', ...Object.keys(visionAssets)]
export const notices = ['LICENSE', 'THIRD_PARTY_NOTICES.md']
export function webNotice(file: string, source: string) {
  // 授權 Markdown 副本位於 dist/web；根文件保留原連結，副本須回到同一包根目錄找實際檔案。
  return !file.endsWith('.md') ? source : source.replace(/\]\(([^\s)]+)\)/g, (match, link) =>
    link.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('//') ? match : `](../../${link})`)
}
export const webPaths = new Map([...webFiles, ...notices].map(file => [file === 'index.html' ? '/' : `/${file}`, file]))
export const webHeaders = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  // WASM 只由本包同源載入；不開放 JavaScript eval、CDN 或任何影片上傳來源。
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
}
// 只有靜態主機解析這個設定；不把設定檔當成公開可讀路由。
export const pagesHeaders = '# 檔案用途：靜態主機的回應政策；與本機主機共用來源。\n/*\n' + Object.entries(webHeaders).map(([key, value]) => `  ${key}: ${value}\n`).join('')
