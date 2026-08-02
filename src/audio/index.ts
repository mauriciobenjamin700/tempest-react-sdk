export { createAudioPlayer, playAudio, stopAudio } from "./audio-player";
export type { AudioPlayerHandle, PlayAudioOptions } from "./audio-player";
export { useAudio } from "./use-audio";
export type { UseAudioResult } from "./use-audio";

export { isAudioOutputSelectionSupported, setAudioOutput } from "./audio-output";

export {
    classifyMediaError,
    isMediaCaptureSupported,
    missingCaptureApiError,
} from "./media-access";
export type { MediaAccessError, MediaAccessErrorKind, MediaDeviceKindLabel } from "./media-access";

export { useMicrophone } from "./use-microphone";
export type { MicrophoneStatus, UseMicrophoneOptions, UseMicrophoneResult } from "./use-microphone";

export {
    AUDIO_MIME_CANDIDATES,
    createAudioRecorder,
    isAudioRecordingSupported,
    pickAudioMimeType,
} from "./audio-recorder";
export type {
    AudioRecorderHandle,
    AudioRecorderOptions,
    AudioRecorderStatus,
    AudioRecording,
} from "./audio-recorder";

export { useAudioRecorder } from "./use-audio-recorder";
export type { UseAudioRecorderOptions, UseAudioRecorderResult } from "./use-audio-recorder";

export { createLevelMeter } from "./level-meter";
export type { LevelMeter, LevelMeterOptions } from "./level-meter";

export { blobToWav, encodeWav } from "./wav";
export type { PcmAudio, WavOptions } from "./wav";
