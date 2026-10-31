/* 檔案用途：在本機背景執行人物偵測，避免阻塞停止按鈕。所在層：專用 Web Worker。主要關聯：follow-ui.js、scripts/web-assets.ts。 */
{
  const scope = /** @type {any} */ (globalThis);
  let detector;
  scope.onmessage = async ({ data }) => {
    const bitmap = data.bitmap;
    try {
      if (!detector) {
        scope.importScripts('/vision-bundle.js');
        // 固定 CPU 推論／非 SIMD 版本，讓同一份離線包不需 GPU delegate、CDN 或跨來源隔離。
        detector = await scope.Vision.ObjectDetector.createFromOptions({ wasmLoaderPath: '/vision-wasm.js', wasmBinaryPath: '/vision-wasm.wasm' }, {
          baseOptions: { modelAssetPath: '/person-model.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', categoryAllowlist: ['person'], scoreThreshold: 0.35, maxResults: 12,
        });
      }
      const results = detector.detect(bitmap);
      const boxes = results.detections.filter(d => d.boundingBox).map(({ boundingBox: b }) => ({ x: b.originX / bitmap.width, y: b.originY / bitmap.height, width: b.width / bitmap.width, height: b.height / bitmap.height }));
      scope.postMessage({ boxes });
    } catch { scope.postMessage({ error: '本機人物偵測無法啟動或分析失敗，請確認應用資源完整後重試。' }); }
    finally { bitmap.close(); }
  };
}
