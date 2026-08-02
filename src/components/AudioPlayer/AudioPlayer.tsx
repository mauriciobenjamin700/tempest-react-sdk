import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type HTMLAttributes } from "react";

import { setAudioOutput } from "@/audio/audio-output";
import { formatDuration } from "@/audio/duration";
import { useObjectUrl } from "@/hooks/use-object-url";
import { cn } from "@/utils/cn";

import styles from "./AudioPlayer.module.css";

/** DOM attributes this component redefines. */
type OverriddenDomProps = "children";

export interface AudioPlayerProps extends Omit<HTMLAttributes<HTMLDivElement>, OverriddenDomProps> {
    /**
     * What to play — a URL, or a `Blob`/`File` straight from a recorder.
     *
     * A `Blob` is wrapped in an object URL that is revoked when it changes or the
     * component unmounts, so a page that records twenty notes does not leak twenty
     * URLs for the lifetime of the tab.
     */
    src: string | Blob | null;
    /**
     * Known length in milliseconds.
     *
     * Pass it whenever you have it — a recording from `useAudioRecorder` always does.
     * See the note on the seek bar for why the element's own `duration` is not
     * trustworthy for a fresh recording.
     */
    durationMs?: number;
    /** Output device, from `useMediaDevices().audioOutputs`. Chromium only. */
    sinkId?: string;
    /** Start playing as soon as `src` is ready. Default `false`. */
    autoPlay?: boolean;
    /** Loop. Default `false`. */
    loop?: boolean;
    /** Locale for the labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Rendered to the right of the times — a download button, a delete button. */
    actions?: React.ReactNode;
    /** Fired when playback reaches the end. */
    onEnded?: () => void;
    /** Fired when the element reports a decode/network error. */
    onError?: (error: unknown) => void;
    /** No `src` yet, or playback not allowed. */
    disabled?: boolean;
}

const STRINGS = {
    "pt-BR": { play: "Tocar", pause: "Pausar", seek: "Posição" },
    en: { play: "Play", pause: "Pause", seek: "Seek" },
} as const;

/**
 * Playback transport for one clip: play/pause, a seek bar, elapsed and total time.
 *
 * Built around a real `<audio>` element rather than the SDK's `createAudioPlayer`,
 * which is a fire-and-forget handle for notification chimes and has no transport to
 * expose. Accepts a `Blob` directly, because the thing an app most often plays is the
 * recording it just made.
 *
 * The seek bar is a bare `<input type="range">` rather than the SDK's `Slider`: that
 * component is a form field, with a label row and a value badge, and a transport wants
 * neither. The native input keeps the keyboard and screen-reader behaviour that
 * matters here for free.
 *
 * @example
 * const rec = useAudioRecorder(mic.stream);
 * {rec.recording && (
 *     <AudioPlayer src={rec.recording.blob} durationMs={rec.recording.durationMs} />
 * )}
 */
export function AudioPlayer({
    src,
    durationMs,
    sinkId,
    autoPlay = false,
    loop = false,
    locale = "pt-BR",
    actions,
    onEnded,
    onError,
    disabled = false,
    className,
    ...rest
}: AudioPlayerProps) {
    const strings = STRINGS[locale];
    const audio = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentMs, setCurrentMs] = useState(0);
    const [elementMs, setElementMs] = useState(Number.POSITIVE_INFINITY);
    const probed = useRef(false);

    const blobUrl = useObjectUrl(typeof src === "string" ? null : src);
    const url = typeof src === "string" ? src : blobUrl;

    /**
     * Total length, preferring what the caller knows.
     *
     * `MediaRecorder` writes WebM with no duration in the header, so a fresh recording
     * reports `Infinity` — which is why the recorder keeps its own clock and passes it
     * here. `durationMs` wins whenever it is finite; the element's value is the
     * fallback for a plain URL.
     */
    const totalMs = Number.isFinite(durationMs) ? (durationMs as number) : elementMs;
    const seekable = Number.isFinite(totalMs) && totalMs > 0;

    useEffect(() => {
        setCurrentMs(0);
        setPlaying(false);
        setElementMs(Number.POSITIVE_INFINITY);
        probed.current = false;
    }, [url]);

    useEffect(() => {
        if (sinkId === undefined) return;
        void setAudioOutput(audio.current, sinkId);
    }, [sinkId, url]);

    /**
     * Coax a duration out of an element that reports `Infinity`.
     *
     * Seeking past the end forces the browser to demux to the last frame, after which
     * it knows the real length. It is a hack with no alternative — the header simply
     * does not carry the value — and it runs at most once per source, only when the
     * caller gave us no `durationMs`.
     */
    const handleMetadata = (): void => {
        const node = audio.current;
        if (!node) return;
        if (Number.isFinite(node.duration)) {
            setElementMs(node.duration * 1000);
            return;
        }
        if (probed.current || Number.isFinite(durationMs)) return;
        probed.current = true;
        const onSeeked = (): void => {
            node.removeEventListener("timeupdate", onSeeked);
            if (Number.isFinite(node.duration)) setElementMs(node.duration * 1000);
            node.currentTime = 0;
        };
        node.addEventListener("timeupdate", onSeeked);
        node.currentTime = 1e101;
    };

    const toggle = (): void => {
        const node = audio.current;
        if (!node || !url) return;
        if (node.paused) {
            void node
                .play()
                .then(() => setPlaying(true))
                .catch((error: unknown) => onError?.(error));
            return;
        }
        node.pause();
        setPlaying(false);
    };

    const seek = (ms: number): void => {
        const node = audio.current;
        if (!node || !seekable) return;
        node.currentTime = ms / 1000;
        setCurrentMs(ms);
    };

    return (
        <div className={cn(styles.player, className)} {...rest}>
            <audio
                ref={audio}
                src={url ?? undefined}
                loop={loop}
                autoPlay={autoPlay}
                preload="metadata"
                onLoadedMetadata={handleMetadata}
                onDurationChange={handleMetadata}
                onTimeUpdate={() => {
                    const node = audio.current;
                    if (node) setCurrentMs(node.currentTime * 1000);
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                    setPlaying(false);
                    setCurrentMs(0);
                    onEnded?.();
                }}
                onError={(event) => onError?.(event)}
            />

            <button
                type="button"
                className={styles.transport}
                onClick={toggle}
                disabled={disabled || !url}
                aria-label={playing ? strings.pause : strings.play}
                title={playing ? strings.pause : strings.play}
            >
                {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
            </button>

            <input
                type="range"
                className={styles.seek}
                min={0}
                max={seekable ? Math.round(totalMs) : 0}
                step={100}
                value={Math.min(Math.round(currentMs), seekable ? Math.round(totalMs) : 0)}
                onChange={(event) => seek(Number(event.target.value))}
                disabled={disabled || !seekable}
                aria-label={strings.seek}
                aria-valuetext={`${formatDuration(currentMs)} / ${formatDuration(totalMs)}`}
            />

            <span className={styles.time}>
                <span>{formatDuration(currentMs)}</span>
                <span aria-hidden="true">/</span>
                <span>{formatDuration(totalMs)}</span>
            </span>

            {actions && <span className={styles.actions}>{actions}</span>}
        </div>
    );
}
