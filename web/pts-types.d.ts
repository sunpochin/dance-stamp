/* 用途：明確時間戳後端與主頁的訊息／診斷契約；所在層：只供型別檢查；關聯：export-pts*.js、types.d.ts。 */
import type { Comparison, OverlayPresentation } from './types';
import type { Track } from './follow';
export interface Progress { stage: string; fraction: number }
export interface Request { reference: Blob; self: Blob; recipe: Comparison; presentation?: OverlayPresentation | null; tracks?: {reference?: Track | null; self?: Track | null}; targetMode?: 'buffer' | 'fragmented' }
export interface OwnerRequest extends Request { signal?: AbortSignal; progress?: (value: Progress) => void }
export interface AudioInfo { declaredStart: number; declaredEnd: number; sampleRate: number; channels: number; gridOrigin: number; outputSampleRate: number; outputChannels: number; sourceBlocks: number; sourceFrames: number; silenceBasis: string; coveredFrames?: number; leadingSilentFrames?: number; trailingSilentFrames?: number; maximumGridRoundingSamples?: number }
export interface Diagnostics {
  backend: 'explicit-pts'; recipe: Comparison; plannedDurationMs: number; submittedFrames: number; sourceVideoFrameCloseCalls: number;
  audio: AudioInfo | null;
  sources: { role: string; start: number; end: number; codec: string | null; edits: Awaited<ReturnType<typeof import('./pts-input').auditEdits>> }[];
  cleanupErrors: {name: string; error: string}[]; cleanupCallsCompleted?: boolean;
  selectedPresentationLagMs: {reference: number; self: number}; checkpoints: {output: number; referencePts: number; selfPts: number}[];
  memoryPolicy: {targetMode: string; retainedEncodedWholeFile: boolean; pcmCopyChunkBytes: number; libraryResamplerSeconds: number; fullPcmNotRetained: boolean; peakMemoryVerified: boolean}; measurements: string;
  output?: {mime: string; bytes: number; targetMode: string; fmp4CompatibilityVerified: boolean}; maximumPcmChunkFrames?: number; maximumTargetEndBytes?: number; elapsedMs?: number;
  ownerElapsedMs?: number; g7SixtySecondTargetMs?: number | null; g7SixtySecondOwnerIntervalExceeded?: boolean | null;
  workerTermination?: {called: boolean; returned: boolean; physicalResourceExitIndependentlyVerified: boolean}; ownerCleanupErrors?: {name: string; error: string}[];
}
