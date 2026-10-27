/* 檔案用途：固定資料契約與 DOM 控制型別。所在層：Web 靜態型別。主要關聯：index.html、library.js、main.js。 */
export interface Elements {
  "status": HTMLParagraphElement;
  "stop": HTMLButtonElement;
  "existing-mode": HTMLButtonElement;
  "pause-comparison": HTMLButtonElement;
  "reference-start": HTMLButtonElement;
  "reference-end": HTMLButtonElement;
  "self-start": HTMLButtonElement;
  "copy-self": HTMLButtonElement;
  "reference-download": HTMLAnchorElement;
  "audio-status": HTMLParagraphElement;
  "offset-controls": HTMLFieldSetElement;
  "library-panel": HTMLElement;
  "storage-status": HTMLParagraphElement;
  "library": HTMLSelectElement;
  "open-library": HTMLButtonElement;
  "backup": HTMLButtonElement;
  "restore": HTMLInputElement;
  "controls": HTMLFieldSetElement;
  "reference-file": HTMLInputElement;
  "start": HTMLInputElement;
  "end": HTMLInputElement;
  "rate": HTMLSelectElement;
  "countdown": HTMLSelectElement;
  "reference-mirror": HTMLInputElement;
  "self-mirror": HTMLInputElement;
  "preview-mirror": HTMLInputElement;
  "camera": HTMLButtonElement;
  "camera-facing": HTMLSelectElement;
  "preview-frame": HTMLDivElement;
  "new-take": HTMLButtonElement;
  "capture": HTMLButtonElement;
  "confirm-link": HTMLButtonElement;
  "self-file": HTMLInputElement;
  "confirm-take": HTMLButtonElement;
  "reference": HTMLVideoElement;
  "self": HTMLVideoElement;
  "preview": HTMLVideoElement;
  "practice": HTMLFieldSetElement;
  "video-title": HTMLInputElement;
  "save-title": HTMLButtonElement;
  "practice-rate": HTMLSelectElement;
  "pitch-status": HTMLParagraphElement;
  "practice-mirror": HTMLInputElement;
  "practice-canvas": HTMLCanvasElement;
  "set-a": HTMLButtonElement;
  "set-b": HTMLButtonElement;
  "loop": HTMLButtonElement;
  "mark": HTMLButtonElement;
  "loop-status": HTMLParagraphElement;
  "marker-form": HTMLFormElement;
  "marker-title": HTMLInputElement;
  "marker-start": HTMLInputElement;
  "marker-end": HTMLInputElement;
  "marker-note": HTMLTextAreaElement;
  "cancel-marker": HTMLButtonElement;
  "markers": HTMLUListElement;
  "copy-reference": HTMLButtonElement;
  "remove-copy": HTMLButtonElement;
  "takes": HTMLUListElement;
  "compare": HTMLFieldSetElement;
  "offset": HTMLInputElement;
  "scrub": HTMLInputElement;
  "intersection": HTMLParagraphElement;
  "play": HTMLButtonElement;
  "export": HTMLButtonElement;
  "canvas": HTMLCanvasElement;
  "progress": HTMLProgressElement;
  "take-download": HTMLAnchorElement;
  "output-download": HTMLAnchorElement;
  "share": HTMLButtonElement;
  "output": HTMLVideoElement;
  "output-status": HTMLParagraphElement;
  "diagnostics": HTMLPreElement;
}
export interface Video { id: string; title: string; durationMs: number; revision: number }
export interface Asset { id: string; videoId?: string; kind: 'reference' | 'take' | 'vs'; byteLength: number; mimeType: string; durationMs?: number; mediaIncluded?: boolean; state?: 'session-only' | 'copying' | 'ready' | 'missing' | 'interrupted' | 'failed'; storageKind?: 'session' | 'indexeddb' | 'external' }
export interface Marker { id: string; videoId: string; startMs: number; endMs?: number; title: string; note: string; revision: number }
export interface Take { id: string; referenceVideoId: string; cameraAssetId: string; referenceStartMs: number; referenceEndMs: number; rate: number; state: 'recording' | 'ready' | 'interrupted' | 'failed'; createdAt: string; captureTiming?: CaptureTiming }
export interface Recipe { id: string; takeId: string; offsetMs: number; referenceMirror: boolean; selfMirror: boolean; layout: 'side-by-side'; audioSource: 'reference'; revision: number }
export interface Artifact { id: string; recipeId: string; recipeRevision: number; assetId: string; mimeType: string; state: 'ready' | 'interrupted' | 'failed'; createdAt: string }
export interface Library { format: string; schemaVersion: number; kind: string; exportedAt: string; sourceLibraryId: string; videos: Video[]; assets: Asset[]; markers: Marker[]; takes: Take[]; recipes: Recipe[]; exports: Artifact[]; moves: never[] }
export interface LibraryState { revision: number; data: Library }
export interface Comparison { startMs: number; endMs: number; rate: number; offsetMs: number; selfDurationMs: number; referenceMirror: boolean; selfMirror: boolean }
// 匯入原片沒有原生錄製觀測；允許缺欄，不能用檔案建立時間偽造同步資料。
export interface CaptureTiming { recorderRequestedMs: number; recorderStartedMs?: number; referencePlayResolvedMs?: number; referenceAtPlayMs?: number }
export interface CaptureInfo extends Partial<CaptureTiming> { rate?: number; interrupted?: boolean; mime?: string; durationMs?: number }
export interface ExportInfo { maxRenderGapMs: number; elapsedMs: number; observedMaxDriftMs: number; mime: string; bytes: number; requestedWidth: number; requestedHeight: number; recipe: Comparison; decodedDurationMs?: number }
export interface Diagnostics { stage: string; camera: Partial<MediaTrackSettings> | null; capture: CaptureInfo | null; export: ExportInfo | null; lastError?: string; chunkCleanup?: string; preview?: {elapsedMs: number; observedMaxDriftMs: number} }
