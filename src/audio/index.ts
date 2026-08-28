export { createAudioPlayer, playAudio, stopAudio } from "./audio-player";
export type { AudioPlayerHandle, PlayAudioOptions } from "./audio-player";
export { useAudio } from "./use-audio";
export type { UseAudioResult } from "./use-audio";

export { createSfxPool } from "./sfx-pool";
export type { PlaySfxOptions, SfxPool, SfxPoolOptions } from "./sfx-pool";
export { useSfxPool } from "./use-sfx-pool";

export { isAudioOutputSelectionSupported, setAudioOutput } from "./audio-output";

export { createAudioBus, DEFAULT_MAX_GAIN } from "./audio-bus";
export type { AudioBus, AudioBusHandle, AudioBusOptions, LimiterSettings } from "./audio-bus";
export { useAudioBus } from "./use-audio-bus";

export { isMediaCaptureSupported } from "./media-access";
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
