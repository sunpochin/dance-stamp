/* 檔案用途：在本機背景執行人物偵測，避免阻塞停止按鈕。所在層：專用 Web Worker。主要關聯：follow-ui.js、scripts/web-assets.ts。 */
{
  const scope = /** @type {any} */ (globalThis);
  const enteredAt = performance.timeOrigin + performance.now();
  let detector, canvas;
  scope.onmessage = async ({ data }) => {
    const bitmap = data.bitmap;
    let input;
    // 數字沿原回覆返回；補邊與清理順序仍使用主線流程，關閉計時保持原訊息。
    const timing = data.measure ? { enteredAt } : null;
    try {
      if (!detector) {
        let began = timing ? performance.now() : 0;
        try { scope.importScripts('/vision-bundle.js'); }
        finally { if (timing) timing.scriptImportMs = performance.now() - began; }
        began = timing ? performance.now() : 0;
        // 固定 CPU 推論／非 SIMD 版本，讓同一份離線包不需 GPU delegate、CDN 或跨來源隔離。
        try { detector = await scope.Vision.ObjectDetector.createFromOptions({ wasmLoaderPath: '/vision-wasm.js', wasmBinaryPath: '/vision-wasm.wasm' }, {
          baseOptions: { modelAssetPath: '/person-model.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', categoryAllowlist: ['person'], scoreThreshold: 0.35, maxResults: 12,
        }); } finally { if (timing) timing.modelInitMs = performance.now() - began; }
      }
      // 狹長選框直接送方形模型會改變人體比例；先等比補邊，不擴大到旁人或降低分數門檻。
      const size = Math.max(bitmap.width, bitmap.height), x = (size - bitmap.width) / 2, y = (size - bitmap.height) / 2;
      canvas ||= new OffscreenCanvas(size, size);
      if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; }
      const context = canvas.getContext('2d'); if (!context) throw new Error('無法建立人物分析畫面。');
      context.fillStyle = '#ccc'; context.fillRect(0, 0, size, size); context.drawImage(bitmap, x, y);
      input = canvas.transferToImageBitmap();
      const began = timing ? performance.now() : 0;
      let results;
      try { results = detector.detect(input); }
      finally { if (timing) timing.detectMs = performance.now() - began; }
      const clamp = (value, max) => Math.max(0, Math.min(max, value));
      // 模型座標先扣掉補邊，再回傳選框內的比例；補邊裡的假框不能變成追蹤目標。
      const boxes = results.detections.filter(d => d.boundingBox).map(({ boundingBox: b }) => {
        const left = clamp(b.originX - x, bitmap.width), top = clamp(b.originY - y, bitmap.height);
        return { x: left / bitmap.width, y: top / bitmap.height, width: (clamp(b.originX + b.width - x, bitmap.width) - left) / bitmap.width, height: (clamp(b.originY + b.height - y, bitmap.height) - top) / bitmap.height };
      }).filter(b => b.width > 0 && b.height > 0);
      scope.postMessage({ boxes, ...(timing ? { timing } : {}) });
    } catch { scope.postMessage({ error: '本機人物偵測無法啟動或分析失敗，請確認應用資源完整後重試。', ...(timing ? { timing } : {}) }); }
    finally { input?.close(); bitmap.close(); }
  };
}
