/**
 * @tempest-limits file-lines, props-count, function-lines — recording has three
 * separate configurations that a caller genuinely picks between: the capture
 * (deviceId, audioBitsPerSecond, maxDurationMs), the output (format, wavOptions) and
 * the review step (review, footer, locale). The body holds permission, recording,
 * review and error as one state machine; splitting it would thread the same recorder
 * handle through props.
 */
import { Mic, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";

import { formatDuration } from "@/audio/duration";
import { isAudioRecordingSupported } from "@/audio/audio-recorder";
import { useAudioRecorder } from "@/audio/use-audio-recorder";
import { useMicrophone } from "@/audio/use-microphone";
import { blobToWav, type WavOptions } from "@/audio/wav";
import type { AudioRecording } from "@/audio/audio-recorder";
import { useMediaPermission } from "@/hooks/use-media-permission";
import { cn } from "@/utils/cn";

import { AudioPlayer } from "../AudioPlayer";
import styles from "./AudioRecorder.module.css";

/** DOM attributes this component redefines. */
type OverriddenDomProps = "children" | "onError";

export interface AudioRecorderProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    OverriddenDomProps
> {
    /**
     * Called once a recording is finished and (when asked) converted.
     *
     * Fires on stop and on hitting `maxDurationMs`, never on cancel.
     */
    onRecorded?: (recording: AudioRecording) => void;
    /** Stop automatically after this long. Strongly recommended on anything public. */
    maxDurationMs?: number;
    /** Specific microphone, from `useMediaDevices().audioInputs`. */
    deviceId?: string;
    /**
     * Output container.
     *
     * `"native"` (default) keeps what the browser produced — Opus on Chromium and
     * Firefox, AAC on Safari — which is the smallest and needs no work. `"wav"`
     * converts on stop, for a backend that only accepts WAV; see `wavOptions`, and
     * expect roughly ten times the bytes.
     */
    format?: "native" | "wav";
    /** Passed to `blobToWav` when `format="wav"`. `{ mono: true, sampleRate: 16000 }` suits speech. */
    wavOptions?: WavOptions;
    /** Target bitrate. 32000–64000 is plenty for speech in Opus. */
    audioBitsPerSecond?: number;
    /** Offer playback of the recording before handing it over. Default `true`. */
    review?: boolean;
    /** Locale for the labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Rendered under the controls — a hint, a character count, a legal notice. */
    footer?: ReactNode;
    /** Recorder-level failure, or a failed WAV conversion. */
    onError?: (error: unknown) => void;
    disabled?: boolean;
}

const STRINGS = {
    "pt-BR": {
        record: "Gravar",
        stop: "Parar",
        pause: "Pausar",
        resume: "Continuar",
        retake: "Gravar de novo",
        level: "Nível do microfone",
        asking: "Pedindo acesso ao microfone…",
        denied: "Acesso ao microfone bloqueado. Libere nas configurações do site e recarregue.",
        unsupported: "Este navegador não grava áudio.",
        idleHint: "Toque em Gravar para começar.",
        recording: "Gravando",
        paused: "Pausado",
        converting: "Convertendo…",
    },
    en: {
        record: "Record",
        stop: "Stop",
        pause: "Pause",
        resume: "Resume",
        retake: "Record again",
        level: "Microphone level",
        asking: "Requesting microphone access…",
        denied: "Microphone access blocked. Allow it in site settings and reload.",
        unsupported: "This browser cannot record audio.",
        idleHint: "Press Record to start.",
        recording: "Recording",
        paused: "Paused",
        converting: "Converting…",
    },
} as const;

/**
 * Record a voice note: one button to start, a live level meter, a clock, and a
 * playback review before the audio leaves the component.
 *
 * The permission flow is the part worth reading. The microphone is **not** opened on
 * mount — the prompt fires on the first press of Record, because a prompt the user did
 * not provoke is the most reliable way to earn a permanent block, after which
 * `getUserMedia` rejects without ever asking again. When the permission is already
 * `"denied"`, the component says so and how to fix it instead of offering a button
 * that cannot work.
 *
 * The level meter is not decoration either: a muted OS input or a headset with its mic
 * arm folded up produces a perfectly successful recording of silence, and without a
 * visible level the user only finds out after they finish talking.
 *
 * @example
 * <AudioRecorder
 *     maxDurationMs={120_000}
 *     format="wav"
 *     wavOptions={{ mono: true, sampleRate: 16000 }}
 *     onRecorded={({ blob }) => upload(blob)}
 * />
 */
export function AudioRecorder({
    onRecorded,
    maxDurationMs,
    deviceId,
    format = "native",
    wavOptions,
    audioBitsPerSecond,
    review = true,
    locale = "pt-BR",
    footer,
    onError,
    disabled = false,
    className,
    ...rest
}: AudioRecorderProps) {
    const strings = STRINGS[locale];
    const permission = useMediaPermission("microphone");
    const mic = useMicrophone({ deviceId });
    const [converting, setConverting] = useState(false);
    const [result, setResult] = useState<AudioRecording | null>(null);
    const [supported, setSupported] = useState(true);

    useEffect(() => setSupported(isAudioRecordingSupported()), []);

    /**
     * Convert if asked, then publish.
     *
     * The conversion is awaited here rather than left to the caller so that
     * `onRecorded` only ever fires with the format the caller asked for — a callback
     * that sometimes hands over WebM and sometimes WAV is a bug waiting in the upload
     * path.
     */
    const finish = async (recording: AudioRecording): Promise<void> => {
        if (format !== "wav") {
            setResult(recording);
            onRecorded?.(recording);
            return;
        }
        setConverting(true);
        try {
            const blob = await blobToWav(recording.blob, wavOptions);
            const converted: AudioRecording = { ...recording, blob, mimeType: "audio/wav" };
            setResult(converted);
            onRecorded?.(converted);
        } catch (error) {
            onError?.(error);
            setResult(recording);
            onRecorded?.(recording);
        } finally {
            setConverting(false);
        }
    };

    const recorder = useAudioRecorder(mic.stream, {
        maxDurationMs,
        audioBitsPerSecond,
        onRecorded: (recording) => void finish(recording),
        onError,
    });

    /**
     * Start recording as soon as the stream lands.
     *
     * The user pressed Record before the permission prompt existed, so the press has
     * to survive the round-trip: `mic.start()` opens the device, the stream arrives a
     * few hundred milliseconds later, and recording begins then. Waiting for a second
     * press would make the first one look broken.
     */
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed || !recorder.ready || recorder.status !== "idle") return;
        setArmed(false);
        recorder.start();
    }, [armed, recorder.ready, recorder.status, recorder]);

    const begin = (): void => {
        setResult(null);
        if (mic.stream && recorder.ready) {
            recorder.start();
            return;
        }
        setArmed(true);
        mic.start();
    };

    const retake = (): void => {
        setResult(null);
        recorder.cancel();
        begin();
    };

    const busy = recorder.status === "recording" || recorder.status === "paused";
    const blocked = permission.state === "denied";

    if (!supported) {
        return (
            <div className={cn(styles.recorder, className)} {...rest}>
                <p className={styles.notice}>{strings.unsupported}</p>
            </div>
        );
    }

    return (
        <div className={cn(styles.recorder, className)} {...rest}>
            <div className={styles.row}>
                {!busy && (
                    <button
                        type="button"
                        className={styles.record}
                        onClick={result ? retake : begin}
                        disabled={disabled || blocked || converting}
                        aria-label={result ? strings.retake : strings.record}
                    >
                        {result ? (
                            <RotateCcw size={16} aria-hidden />
                        ) : (
                            <Mic size={16} aria-hidden />
                        )}
                        <span>{result ? strings.retake : strings.record}</span>
                    </button>
                )}

                {busy && (
                    <>
                        <button
                            type="button"
                            className={styles.stop}
                            onClick={() => void recorder.stop()}
                            aria-label={strings.stop}
                        >
                            <Square size={14} aria-hidden />
                            <span>{strings.stop}</span>
                        </button>
                        <button
                            type="button"
                            className={styles.secondary}
                            onClick={
                                recorder.status === "paused" ? recorder.resume : recorder.pause
                            }
                            aria-label={
                                recorder.status === "paused" ? strings.resume : strings.pause
                            }
                        >
                            {recorder.status === "paused" ? (
                                <Play size={14} aria-hidden />
                            ) : (
                                <Pause size={14} aria-hidden />
                            )}
                        </button>
                    </>
                )}

                {busy && (
                    <div
                        className={styles.meter}
                        role="meter"
                        aria-label={strings.level}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(recorder.level * 100)}
                    >
                        <span
                            className={styles.meterFill}
                            style={{ transform: `scaleX(${recorder.level})` }}
                        />
                    </div>
                )}

                <span className={styles.clock}>
                    {formatDuration(busy ? recorder.durationMs : (result?.durationMs ?? 0))}
                    {maxDurationMs !== undefined && (
                        <span className={styles.max}> / {formatDuration(maxDurationMs)}</span>
                    )}
                </span>
            </div>

            <p className={styles.status} role="status">
                {converting
                    ? strings.converting
                    : mic.status === "requesting"
                      ? strings.asking
                      : blocked
                        ? strings.denied
                        : mic.error
                          ? mic.error.message
                          : recorder.status === "recording"
                            ? strings.recording
                            : recorder.status === "paused"
                              ? strings.paused
                              : result
                                ? ""
                                : strings.idleHint}
            </p>

            {review && result && (
                <AudioPlayer
                    src={result.blob}
                    durationMs={result.durationMs}
                    locale={locale}
                    onError={onError}
                />
            )}

            {footer && <div className={styles.footer}>{footer}</div>}
        </div>
    );
}
