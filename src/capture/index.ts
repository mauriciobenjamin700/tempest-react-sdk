/**
 * `capture` — the browser's device-capture APIs beyond the microphone: reading
 * barcodes off the camera, recording video, sharing a screen, and turning speech into
 * text.
 *
 * Every one of them is a platform API with no dependency behind it. The audio side of
 * capture lives in `audio` and shares this module's recorder engine.
 */

export {
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
