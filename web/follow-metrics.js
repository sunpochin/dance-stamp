/* 檔案用途：彙總本頁人物分析耗時，不保存來源或影格。所在層：本機診斷。主要關聯：follow-ui.js、person-worker.js。 */
const rounded = value => Math.round(value * 1000) / 1000;
/** @param {number[]} values */
export function distribution(values) {
  const sorted = values.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b), count = sorted.length;
  if (!count) return { count: 0, totalMs: 0, meanMs: null, p50Ms: null, p95Ms: null };
  const total = sorted.reduce((sum, value) => sum + value, 0);
  // 使用 nearest-rank；只在結束後排序，不讓逐格量測本身增加排序工作。
  return { count, totalMs: rounded(total), meanMs: rounded(total / count), p50Ms: rounded(sorted[Math.ceil(count * .5) - 1]), p95Ms: rounded(sorted[Math.ceil(count * .95) - 1]) };
}
/** @param {{now:()=>number,timeOrigin:number}} [clock] */
export function followMeasurements(clock = performance) {
  /** @type {any[]} */
  const reports = [], previous = [];
  let sequence = 0;
  return { reports,
    /** @param {{side:string,source:string,start:number,end:number,box:import('./follow').Box,sampleHz:number,plannedFrames:number,preparation:{loadMs:number,firstSeekMs:number}}} config */
    start(config) {
      const started = clock.now();
      /** @type {Record<'seek'|'bitmap'|'roundTrip'|'detect',number[]>} */
      const samples = { seek: [], bitmap: [], roundTrip: [], detect: [] };
      let finished = false;
      const entries = new Set();
      const probe = {
        samples, processedFrames: 0, workerCreatedNow: 0, workerCreatedAt: 0,
        workerAttempts: 0, compatibilityFallbacks: 0,
        /** @type {'simd'|'nosimd'|null} */ runtime: null,
        /** @type {number|null} */ analysisCompletedMs: null,
        /** @type {number|null} */ resultMs: null,
        /** @type {number|null} */ workerConstructorMs: null,
        /** @type {number|null} */ workerStartupMs: null,
        /** @type {number|null} */ scriptImportMs: null,
        /** @type {number|null} */ modelInitMs: null,
        endAnalysis() {
          // 製片約需片段長度；先停分析碼表，才能分清辨識速度與整體等待。
          if (probe.analysisCompletedMs === null) probe.analysisCompletedMs = Math.max(0, clock.now() - started);
        },
        recordWorker(timing) {
          if (!timing) return;
          // 回退包含兩次冷啟動；只累加回覆真正帶來的初始化數字，不把失敗成本抹掉。
          for (const key of ['scriptImportMs', 'modelInitMs']) if (Number.isFinite(timing[key]) && timing[key] >= 0) probe[key] = rounded((probe[key] ?? 0) + timing[key]);
          if (timing.runtime === 'simd' || timing.runtime === 'nosimd') probe.runtime = timing.runtime;
          if (Number.isFinite(timing.detectMs) && timing.detectMs >= 0) samples.detect.push(timing.detectMs);
          const startup = timing.enteredAt - probe.workerCreatedAt;
          const entry = `${probe.workerAttempts}:${timing.enteredAt}`;
          // Window／Worker 的 timeOrigin 要轉到同一時基；睡眠或精度差造成不一致時留空，不捏造零成本。
          if (!entries.has(entry) && Number.isFinite(startup) && startup >= 0 && startup <= clock.now() - probe.workerCreatedNow + 1) { entries.add(entry); probe.workerStartupMs = rounded((probe.workerStartupMs ?? 0) + startup); }
        },
        /** @param {'complete'|'cancelled'|'failed'} outcome @param {number} trackedFrames */
        finish(outcome, trackedFrames) {
          if (finished) return null; finished = true;
          const totalFlowMs = Math.max(0, clock.now() - started), totalMs = probe.analysisCompletedMs ?? totalFlowMs, clipDurationMs = (config.end - config.start) * 1000;
          const stages = Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, distribution(values)]));
          // 比對鍵只活在有界記憶體，不進報告；不能為了辨識同一片而雜湊整支私人影片。
          const key = JSON.stringify([config.side, config.source, config.start, config.end, config.box, config.sampleHz, probe.runtime]);
          const last = outcome === 'complete' ? previous.findLast(item => item.key === key) : undefined;
          const report = {
            schemaVersion: 2, sequence: ++sequence, side: config.side, outcome, sampleHz: config.sampleHz,
            clipDurationMs: rounded(clipDurationMs), plannedFrames: config.plannedFrames,
            processedFrames: probe.processedFrames, trackedFrames, totalAnalysisMs: rounded(totalMs),
            totalFlowMs: rounded(totalFlowMs), resultMs: probe.resultMs === null ? null : rounded(probe.resultMs),
            framesPerSecond: totalMs ? rounded(probe.processedFrames / totalMs * 1000) : null,
            realtimeFactor: totalMs ? rounded(clipDurationMs / totalMs) : null,
            preparation: { loadMs: rounded(config.preparation.loadMs), firstSeekMs: rounded(config.preparation.firstSeekMs) },
            worker: { constructionMs: probe.workerConstructorMs === null ? null : rounded(probe.workerConstructorMs), startupMs: probe.workerStartupMs, scriptImportMs: probe.scriptImportMs, modelInitMs: probe.modelInitMs, firstRoundTripMs: samples.roundTrip.length ? rounded(samples.roundTrip[0]) : null, runtime: probe.runtime, attempts: probe.workerAttempts, fallbacks: probe.compatibilityFallbacks },
            stages,
            sameInputRun: outcome === 'complete' ? (last?.report.sameInputRun || 0) + 1 : null,
            comparison: last ? { previousSequence: last.report.sequence, differenceMs: rounded(totalMs - last.report.totalAnalysisMs), previousTotalMs: last.report.totalAnalysisMs } : null,
          };
          reports.push(report); if (reports.length > 10) reports.shift();
          if (outcome === 'complete') { previous.push({ key, report }); if (previous.length > 10) previous.shift(); }
          return report;
        },
      };
      return probe;
    },
  };
}
