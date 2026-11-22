/**
 * `capture` — the browser's device-capture APIs beyond the microphone: opening the
 * camera, reading barcodes off it, recording video, sharing a screen, and turning
 * speech into text.
 *
 * Every one of them is a platform API with no dependency behind it. The audio side of
 * capture lives in `audio` and shares this module's recorder engine. `useCameraStream`
 * lives here rather than in `vision` because opening a camera needs no model: the
 * `/vision` subpath re-exports it, but importing it from there makes a bundler resolve
 * `onnxruntime-web` (#721).
 */

export {
    ALL_BARCODE_FORMATS,
    DEFAULT_BARCODE_FORMATS,
    createBarcodeDetector,
    getSupportedBarcodeFormats,
    isBarcodeDetectionSupported,
    normalizeBarcode,
} from "./barcode";
export type {
    BarcodeDetectorLike,
    BarcodeFormat,
    BarcodePoint,
    BarcodeScanResult,
    DetectedBarcodeLike,
} from "./barcode";

export { createMediaRecorder } from "./media-recorder";
export type {
    MediaRecorderHandle,
    MediaRecorderStatus,
    MediaRecording,
    MediaRecordingKind,
    MediaRecordingOptions,
} from "./media-recorder";

export {
    createVideoRecorder,
    isVideoRecordingSupported,
    pickVideoMimeType,
} from "./video-recorder";
export type { VideoRecorderHandle, VideoRecorderOptions, VideoRecording } from "./video-recorder";

export { useCameraStream } from "./use-camera-stream";
export type {
    CameraStreamError,
    CameraStreamErrorKind,
    CameraStreamStatus,
    UseCameraStreamApi,
    UseCameraStreamOptions,
} from "./use-camera-stream";

export { useBarcodeScanner } from "./use-barcode-scanner";
export type { UseBarcodeScannerOptions, UseBarcodeScannerResult } from "./use-barcode-scanner";

export { useVideoRecorder } from "./use-video-recorder";
export type { UseVideoRecorderOptions, UseVideoRecorderResult } from "./use-video-recorder";

export { isScreenCaptureSupported, useScreenCapture } from "./use-screen-capture";
export type {
    DisplaySurfaceHint,
    ScreenCaptureStatus,
    UseScreenCaptureOptions,
    UseScreenCaptureResult,
} from "./use-screen-capture";

export { isSpeechRecognitionSupported, useSpeechRecognition } from "./use-speech-recognition";
export type {
    SpeechAlternativeLike,
    SpeechError,
    SpeechErrorKind,
    SpeechRecognitionErrorEventLike,
    SpeechRecognitionEventLike,
    SpeechRecognitionLike,
    SpeechResultLike,
    SpeechResultListLike,
    UseSpeechRecognitionOptions,
    UseSpeechRecognitionResult,
} from "./use-speech-recognition";

export { useTorch } from "./use-torch";
export type { UseTorchResult } from "./use-torch";
