/* 檔案用途：在本機背景執行人物偵測，避免阻塞停止按鈕。所在層：專用 Web Worker。主要關聯：follow-ui.js、scripts/web-assets.ts。 */
{
  const scope = /** @type {any} */ (globalThis);
  const enteredAt = performance.timeOrigin + performance.now();
  let detector;
  scope.onmessage = async ({ data }) => {
    const bitmap = data.bitmap;
    // 數字隨原本的偵測回覆返回，不加握手或重排抽樣；關閉計時仍保留舊訊息格式。
    const timing = data.measure ? { enteredAt } : null;
    try {
      if (!detector) {
        let began = timing ? performance.now() : 0;
        try { scope.importScripts('/vision-bundle.js'); }
        finally { if (timing) timing.scriptImportMs = performance.now() - began; }
        // 固定 CPU 推論／非 SIMD 版本，讓同一份離線包不需 GPU delegate、CDN 或跨來源隔離。
        began = timing ? performance.now() : 0;
        try { detector = await scope.Vision.ObjectDetector.createFromOptions({ wasmLoaderPath: '/vision-wasm.js', wasmBinaryPath: '/vision-wasm.wasm' }, {
          baseOptions: { modelAssetPath: '/person-model.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', categoryAllowlist: ['person'], scoreThreshold: 0.35, maxResults: 12,
        }); } finally { if (timing) timing.modelInitMs = performance.now() - began; }
      }
      const began = timing ? performance.now() : 0;
      let results;
      try { results = detector.detect(bitmap); }
      finally { if (timing) timing.detectMs = performance.now() - began; }
      const boxes = results.detections.filter(d => d.boundingBox).map(({ boundingBox: b }) => ({ x: b.originX / bitmap.width, y: b.originY / bitmap.height, width: b.width / bitmap.width, height: b.height / bitmap.height }));
      scope.postMessage({ boxes, ...(timing ? { timing } : {}) });
    } catch { scope.postMessage({ error: '本機人物偵測無法啟動或分析失敗，請確認應用資源完整後重試。', ...(timing ? { timing } : {}) }); }
    finally { bitmap.close(); }
  };
}
