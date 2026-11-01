/* 檔案用途：在本機背景執行人物偵測，避免阻塞停止按鈕。所在層：專用 Web Worker。主要關聯：follow-ui.js、scripts/web-assets.ts。 */
{
  const scope = /** @type {any} */ (globalThis);
  const enteredAt = performance.timeOrigin + performance.now();
  let detector, canvas, runtime = 'nosimd';
  scope.onmessage = async ({ data }) => {
    const bitmap = data.bitmap;
    let input, returned = false;
    // 數字沿原回覆返回；補邊與清理順序仍使用主線流程，關閉計時保持原訊息。
    const timing = data.measure ? { enteredAt } : null;
    try {
      if (!detector) {
        let began = timing ? performance.now() : 0;
        try { scope.importScripts('/vision-bundle.js'); }
        finally { if (timing) timing.scriptImportMs = performance.now() - began; }
        // 沿用固定 CPU／模型；能力檢查失敗視為不支援，不拿 UA 或裝置名稱猜測。
        let simd = false;
        if (!data.compatibility) try { simd = await scope.Vision.FilesetResolver.isSimdSupported(); } catch {}
        runtime = simd ? 'simd' : 'nosimd';
        if (timing) timing.runtime = runtime;
        const prefix = simd ? '/vision-simd' : '/vision-wasm';
        began = timing ? performance.now() : 0;
        try { detector = await scope.Vision.ObjectDetector.createFromOptions({ wasmLoaderPath: `${prefix}.js`, wasmBinaryPath: `${prefix}.wasm` }, {
          baseOptions: { modelAssetPath: '/person-model.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', categoryAllowlist: ['person'], scoreThreshold: 0.35, maxResults: 12,
        }); } catch {} finally { if (timing) timing.modelInitMs = performance.now() - began; }
        if (!detector) {
          if (simd) {
            // Emscripten 失敗可能留下半初始化全域；交還同一格，由乾淨 Worker 僅重試一次相容版。
            scope.postMessage({ retryCompatibility: true, bitmap, ...(timing ? { timing: { ...timing, runtime } } : {}) }, [bitmap]); returned = true; return;
          }
          throw new Error('相容人物模型初始化失敗');
        }
      }
      if (timing) timing.runtime = runtime;
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
    finally { input?.close(); if (!returned) bitmap.close(); }
  };
}
