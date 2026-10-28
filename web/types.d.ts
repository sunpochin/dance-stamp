/* 檔案用途：固定資料契約與 DOM 控制型別。所在層：Web 靜態型別。主要關聯：index.html、library.js、main.js。 */
export interface Elements {
  "library-keyword": HTMLInputElement;
  "library-style": HTMLInputElement;
  "library-teacher": HTMLInputElement;
  "library-from": HTMLInputElement;
  "library-to": HTMLInputElement;
  "library-status": HTMLSelectElement;
  "library-reset": HTMLButtonElement;
  "search-summary": HTMLParagraphElement;
  "search-videos": HTMLUListElement;
  "move-results": HTMLUListElement;
  "move-form": HTMLFormElement;
  "move-name": HTMLInputElement;
  "move-style": HTMLInputElement;
  "move-status": HTMLSelectElement;
  "cancel-move": HTMLButtonElement;
  "video-teacher": HTMLInputElement;
  "video-style": HTMLInputElement;
  "video-date": HTMLInputElement;
  "marker-move": HTMLSelectElement;
  "beat-bpm": HTMLInputElement;
  "beat-first": HTMLInputElement;
  "beat-count-in": HTMLSelectElement;
  "beat-set-first": HTMLButtonElement;
  "beat-save": HTMLButtonElement;
  "beat-cancel": HTMLButtonElement;
  "beat-clear": HTMLButtonElement;
  "beat-status": HTMLParagraphElement;
  "beat-position": HTMLParagraphElement;

  "offline-status": HTMLParagraphElement;
  "capacity-status": HTMLParagraphElement;
  "persistence-status": HTMLParagraphElement;
  "update-status": HTMLParagraphElement;
  "check-offline": HTMLButtonElement;
  "request-persist": HTMLButtonElement;
  "check-update": HTMLButtonElement;
  "delete-video": HTMLButtonElement;
  "delete-dialog": HTMLDialogElement;
  "delete-title": HTMLHeadingElement;
  "delete-summary": HTMLParagraphElement;
  "delete-controls": HTMLFieldSetElement;
  "delete-confirm": HTMLButtonElement;
  "delete-cancel": HTMLButtonElement;
  "media-inventory": HTMLDetailsElement;
  "media-summary": HTMLParagraphElement;
  "inventory-controls": HTMLFieldSetElement;
  "refresh-media": HTMLButtonElement;
  "media-items": HTMLUListElement;
  "import-dialog": HTMLDialogElement;
  "import-title": HTMLHeadingElement;
  "import-controls": HTMLFieldSetElement;
  "import-summary": HTMLParagraphElement;
  "import-media": HTMLParagraphElement;
  "import-content": HTMLPreElement;
  "import-confirm": HTMLButtonElement;
  "import-cancel": HTMLButtonElement;
  "share-notes": HTMLButtonElement;
  "share-dialog": HTMLDialogElement;
  "share-controls": HTMLFieldSetElement;
  "share-items": HTMLDivElement;
  "share-fields": HTMLDivElement;
  "share-preview": HTMLButtonElement;
  "share-content": HTMLPreElement;
  "share-readable": HTMLDivElement;
  "share-summary": HTMLParagraphElement;
  "share-download": HTMLButtonElement;
  "share-system": HTMLButtonElement;
  "share-cancel": HTMLButtonElement;
  "media-dialog": HTMLDialogElement;
  "media-title": HTMLHeadingElement;
  "relink-controls": HTMLFieldSetElement;
  "relink-file": HTMLInputElement;
  "relink-file-label": HTMLSpanElement;
  "relink-preview": HTMLVideoElement;
  "relink-summary": HTMLParagraphElement;
  "relink-checked": HTMLInputElement;
  "relink-save": HTMLInputElement;
  "relink-confirm": HTMLButtonElement;
  "relink-cancel": HTMLButtonElement;

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
export interface BeatGrid { bpm: number; firstBeatMs: number; countInBeats: number }
export interface Video { id: string; title: string; durationMs: number; revision: number; teacher?: string; danceStyle?: string; recordedDate?: string; beatGrid?: BeatGrid }
export interface Asset { id: string; videoId?: string; kind: 'reference' | 'take' | 'vs'; byteLength: number; mimeType: string; originalName?: string; durationMs?: number; mediaIncluded?: boolean; state?: 'session-only' | 'copying' | 'ready' | 'missing' | 'interrupted' | 'failed'; storageKind?: 'session' | 'indexeddb' | 'external' }
export interface Marker { id: string; videoId: string; startMs: number; endMs?: number; title: string; note: string; revision: number; moveId?: string }
export interface Move { id: string; name: string; danceStyle: string; status: 'wanted' | 'practicing' | 'learned'; revision: number }
export interface ShareSelection { videoIds: string[]; markerIds: string[]; takeIds: string[]; exportIds: string[]; fields: string[] }

export interface Take { id: string; referenceVideoId: string; cameraAssetId: string; referenceStartMs: number; referenceEndMs: number; rate: number; state: 'recording' | 'ready' | 'interrupted' | 'failed'; createdAt: string; captureTiming?: CaptureTiming; beatGrid?: BeatGrid }

export interface Recipe { id: string; takeId: string; offsetMs: number; referenceMirror: boolean; selfMirror: boolean; layout: 'side-by-side'; audioSource: 'reference'; revision: number }
export interface Artifact { id: string; recipeId: string; recipeRevision: number; assetId: string; mimeType: string; state: 'ready' | 'interrupted' | 'failed'; createdAt: string }
export interface Library { format: string; schemaVersion: number; kind: string; exportedAt: string; sourceLibraryId: string; videos: Video[]; assets: Asset[]; markers: Marker[]; takes: Take[]; recipes: Recipe[]; exports: Artifact[]; moves: Move[] }
export interface LibraryState { revision: number; data: Library }
export interface Comparison { startMs: number; endMs: number; rate: number; offsetMs: number; selfDurationMs: number; referenceMirror: boolean; selfMirror: boolean }
// 匯入原片沒有原生錄製觀測；允許缺欄，不能用檔案建立時間偽造同步資料。
export interface CaptureTiming { recorderRequestedMs: number; recorderStartedMs?: number; referencePlayResolvedMs?: number; referenceAtPlayMs?: number }
export interface CaptureInfo extends Partial<CaptureTiming> { rate?: number; interrupted?: boolean; mime?: string; durationMs?: number }
export interface ExportInfo { maxRenderGapMs: number; elapsedMs: number; observedMaxDriftMs: number; mime: string; bytes: number; requestedWidth: number; requestedHeight: number; recipe: Comparison; decodedDurationMs?: number }
export interface Diagnostics { stage: string; camera: Partial<MediaTrackSettings> | null; capture: CaptureInfo | null; export: ExportInfo | null; lastError?: string; chunkCleanup?: string; preview?: {elapsedMs: number; observedMaxDriftMs: number} }
