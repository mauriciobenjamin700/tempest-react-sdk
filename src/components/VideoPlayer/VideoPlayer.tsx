/**
 * @tempest-limits props-count, function-lines — `src` takes a URL or a Blob, and
 * every other prop is a facet of playing it: durationMs (a MediaRecorder WebM may
 * carry none), poster, captions, aspect ratio, the rate control and its presets,
 * pitch, fullscreen, autoPlay/loop/muted, onEnded/onError, plus the actions slot and
 * locale. The body is the transport state machine — object-URL lifecycle, seek, rate,
 * volume — around one video element ref.
 */
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

import { formatDuration } from "@/audio/duration";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useObjectUrl } from "@/hooks/use-object-url";
import { cn } from "@/utils/cn";

import { DEFAULT_PLAYBACK_RATES } from "./playback-rates";
import styles from "./VideoPlayer.module.css";

/**
 * DOM attributes this component redefines.
 *
 * `onRateChange` is a real collision, not tidiness: React types it on every
 * element as the media `ratechange` handler, `ReactEventHandler`. Ours carries
 * the rate the viewer picked, and a `(rate: number) => void` is not assignable
 * to a handler that receives an event — same shape of clash as `Input`'s `size`
 * against `HTMLInputElement.size`. The DOM one is useless on a `<div>` anyway:
 * the event fires on the media element inside, which this component owns.
 */
type OverriddenDomProps = "children" | "onRateChange";

/** One caption or subtitle file, rendered as a `<track>`. */
export interface VideoTextTrack {
    /** URL of the WebVTT file. */
    src: string;
    /** BCP 47 language tag, e.g. `"pt-BR"`. */
    srcLang: string;
    /** Name shown in the browser's own track menu. */
    label: string;
    /** Track kind. Default `"captions"`. */
    kind?: "subtitles" | "captions" | "descriptions" | "chapters" | "metadata";
    /** Whether this track is on unless the viewer picks another. */
    default?: boolean;
}

export interface VideoPlayerProps extends Omit<HTMLAttributes<HTMLDivElement>, OverriddenDomProps> {
    /**
     * What to play — a URL, or a `Blob`/`File` straight from a recorder.
     *
     * A `Blob` is wrapped in an object URL that is revoked when it changes or the
     * component unmounts, so a session that records twenty clips does not leak
     * twenty URLs for the lifetime of the tab.
     */
    src: string | Blob | null;
    /**
     * Known length in milliseconds.
     *
     * Pass it whenever you have it — a recording from `useVideoRecorder` always
     * does. Without it the element's own `duration` is used, and a fresh
     * `MediaRecorder` blob may report `Infinity` until it is probed for one.
     */
    durationMs?: number;
    /** Still shown before playback. Pair it with `captureFrame` from `/imaging`. */
    poster?: string;
    /** Caption and subtitle files. */
    tracks?: readonly VideoTextTrack[];
    /** Frame shape while the video has no intrinsic size yet. Default `16 / 9`. */
    aspectRatio?: number;
    /**
     * Playback rate. Controlled when passed with `onRateChange`.
     *
     * Written to both `playbackRate` and `defaultPlaybackRate`, because the
     * element resets the first to the second when a source loads — a player that
     * only writes `playbackRate` silently drops back to 1× on every clip change.
     */
    rate?: number;
    /** Presets the control offers. `[]` hides it. Default {@link DEFAULT_PLAYBACK_RATES}. */
    rates?: readonly number[];
    /** Called with the rate the viewer picked. */
    onRateChange?: (rate: number) => void;
    /** Let the pitch rise with the rate (`preservesPitch = false`). Default `false`. */
    shiftPitch?: boolean;
    /** Offer a fullscreen button where the browser supports it. Default `true`. */
    fullscreen?: boolean;
    /** Start playing as soon as `src` is ready. Default `false`. */
    autoPlay?: boolean;
    /** Loop. Default `false`. */
    loop?: boolean;
    /** Start muted. Autoplay without a gesture needs this. Default `false`. */
    muted?: boolean;
    /** Locale for the labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Rendered at the end of the control row — a download button, a delete button. */
    actions?: ReactNode;
    /** Fired when playback reaches the end. */
    onEnded?: () => void;
    /** Fired when the element reports a decode/network error. */
    onError?: (error: unknown) => void;
    /** No `src` yet, or playback not allowed. */
    disabled?: boolean;
}

const STRINGS = {
    "pt-BR": {
        play: "Tocar",
        pause: "Pausar",
        seek: "Posição",
        mute: "Silenciar",
        unmute: "Ativar som",
        volume: "Volume",
        rate: "Velocidade",
        enterFullscreen: "Tela cheia",
        exitFullscreen: "Sair da tela cheia",
    },
    en: {
        play: "Play",
        pause: "Pause",
        seek: "Seek",
        mute: "Mute",
        unmute: "Unmute",
        volume: "Volume",
        rate: "Speed",
        enterFullscreen: "Full screen",
        exitFullscreen: "Exit full screen",
    },
} as const;

/**
 * Label a rate the way a viewer reads it.
 *
 * @param rate The multiplier.
 * @param locale Which decimal separator to use.
 * @returns e.g. `"1,5×"` in pt-BR, `"1.5×"` in English.
 */
function rateLabel(rate: number, locale: "pt-BR" | "en"): string {
    return `${rate.toLocaleString(locale === "en" ? "en-US" : "pt-BR")}×`;
}

/**
 * Playback transport for one video: play/pause, seek, volume, speed, fullscreen.
 *
 * Built on a real `<video>` element, and deliberately **not** an overlay: the
 * controls sit in a bar under the frame rather than on top of it. Controls drawn
 * over video have to earn their contrast against arbitrary pixels, which no
 * `--tempest-*` token can promise — every text token in this SDK is resolved
 * against a known surface, and the two contrast defects this repo shipped were
 * both a text token used over a surface it was never checked against. A bar with
 * its own surface inherits the theme and is legible by construction.
 *
 * The seek bar, the volume slider and the speed picker are bare `<input>` and
 * `<select>` elements rather than the SDK's `Slider` and `Select`: those are form
 * fields, with a label row and a value badge, and a transport wants neither. The
 * native elements keep the keyboard and screen-reader behaviour that matters here
 * for free.
 *
 * @example
 * const rec = useVideoRecorder(screen.stream);
 * {rec.recording && (
 *     <VideoPlayer src={rec.recording.blob} durationMs={rec.recording.durationMs} />
 * )}
 */
export function VideoPlayer({
    src,
    durationMs,
    poster,
    tracks,
    aspectRatio = 16 / 9,
    rate,
    rates = DEFAULT_PLAYBACK_RATES,
    onRateChange,
    shiftPitch = false,
    fullscreen = true,
    autoPlay = false,
    loop = false,
    muted = false,
    locale = "pt-BR",
    actions,
    onEnded,
    onError,
    disabled = false,
    className,
    ...rest
}: VideoPlayerProps) {
    const strings = STRINGS[locale];
    const shell = useRef<HTMLDivElement | null>(null);
    const video = useRef<HTMLVideoElement | null>(null);
    const probed = useRef(false);

    const [playing, setPlaying] = useState(false);
    const [currentMs, setCurrentMs] = useState(0);
    const [elementMs, setElementMs] = useState(Number.POSITIVE_INFINITY);
    const [ownRate, setOwnRate] = useState(rate ?? 1);
    const [volume, setVolume] = useState(1);
    const [silent, setSilent] = useState(muted);

    const immersive = useFullscreen(shell);
    const blobUrl = useObjectUrl(typeof src === "string" ? null : src);
    const url = typeof src === "string" ? src : blobUrl;

    const effectiveRate = rate ?? ownRate;
    const totalMs = Number.isFinite(durationMs) ? (durationMs as number) : elementMs;
    const seekable = Number.isFinite(totalMs) && totalMs > 0;

    useEffect(() => {
        setCurrentMs(0);
        setPlaying(false);
        setElementMs(Number.POSITIVE_INFINITY);
        probed.current = false;
    }, [url]);

    /**
     * Keep the rate on the element, and keep it across sources.
     *
     * `defaultPlaybackRate` is written alongside `playbackRate` because the load
     * algorithm copies the former onto the latter: writing only `playbackRate`
     * means the rate the viewer chose is silently lost on the next clip.
     */
    useEffect(() => {
        const node = video.current;
        if (!node) return;
        node.defaultPlaybackRate = effectiveRate;
        node.playbackRate = effectiveRate;
        node.preservesPitch = !shiftPitch;
    }, [effectiveRate, shiftPitch, url]);

    useEffect(() => {
        const node = video.current;
        if (!node) return;
        node.volume = volume;
        node.muted = silent;
    }, [volume, silent, url]);

    /**
     * Coax a duration out of an element that reports `Infinity`.
     *
     * Seeking past the end forces the browser to demux to the last frame, after
     * which it knows the real length. It runs at most once per source, and only
     * when the caller gave us no `durationMs`.
     */
    const handleMetadata = (): void => {
        const node = video.current;
        if (!node) return;
        if (Number.isFinite(node.duration)) {
            setElementMs(node.duration * 1000);
            return;
        }
        if (probed.current || Number.isFinite(durationMs)) return;
        probed.current = true;
        const onProbed = (): void => {
            node.removeEventListener("timeupdate", onProbed);
            if (Number.isFinite(node.duration)) setElementMs(node.duration * 1000);
            node.currentTime = 0;
        };
        node.addEventListener("timeupdate", onProbed);
        node.currentTime = 1e101;
    };

    const toggle = (): void => {
        const node = video.current;
        if (!node || !url) return;
        if (node.paused) {
            void Promise.resolve(node.play())
                .then(() => setPlaying(true))
                .catch((error: unknown) => onError?.(error));
            return;
        }
        node.pause();
        setPlaying(false);
    };

    const seek = (ms: number): void => {
        const node = video.current;
        if (!node || !seekable) return;
        node.currentTime = ms / 1000;
        setCurrentMs(ms);
    };

    const changeRate = (next: number): void => {
        if (rate === undefined) setOwnRate(next);
        onRateChange?.(next);
    };

    return (
        <div
            ref={shell}
            className={cn(styles.player, immersive.isFullscreen && styles.immersive, className)}
            {...rest}
        >
            <div className={styles.frame} style={{ aspectRatio }}>
                <video
                    ref={video}
                    className={styles.video}
                    src={url ?? undefined}
                    poster={poster}
                    loop={loop}
                    autoPlay={autoPlay}
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={handleMetadata}
                    onDurationChange={handleMetadata}
                    onTimeUpdate={() => {
                        const node = video.current;
                        if (node) setCurrentMs(node.currentTime * 1000);
                    }}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onVolumeChange={() => {
                        const node = video.current;
                        if (!node) return;
                        setVolume(node.volume);
                        setSilent(node.muted);
                    }}
                    onEnded={() => {
                        setPlaying(false);
                        onEnded?.();
                    }}
                    onError={(event) => onError?.(event)}
                >
                    {tracks?.map((track) => (
                        <track
                            key={`${track.kind ?? "captions"}-${track.srcLang}-${track.src}`}
                            kind={track.kind ?? "captions"}
                            src={track.src}
                            srcLang={track.srcLang}
                            label={track.label}
                            default={track.default}
                        />
                    ))}
                </video>
            </div>

            <div className={styles.chrome}>
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

                <button
                    type="button"
                    className={styles.icon}
                    onClick={() => setSilent((was) => !was)}
                    disabled={disabled}
                    aria-label={silent ? strings.unmute : strings.mute}
                    title={silent ? strings.unmute : strings.mute}
                >
                    {silent ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
                </button>

                <input
                    type="range"
                    className={styles.volume}
                    min={0}
                    max={1}
                    step={0.05}
                    value={silent ? 0 : volume}
                    onChange={(event) => {
                        const next = Number(event.target.value);
                        setVolume(next);
                        setSilent(next === 0);
                    }}
                    disabled={disabled}
                    aria-label={strings.volume}
                />

                {rates.length > 0 && (
                    <select
                        className={styles.rate}
                        value={effectiveRate}
                        onChange={(event) => changeRate(Number(event.target.value))}
                        disabled={disabled}
                        aria-label={strings.rate}
                        title={strings.rate}
                    >
                        {rates.map((option) => (
                            <option key={option} value={option}>
                                {rateLabel(option, locale)}
                            </option>
                        ))}
                    </select>
                )}

                {fullscreen && immersive.supported && (
                    <button
                        type="button"
                        className={styles.icon}
                        onClick={() => {
                            void immersive.toggle().catch((error: unknown) => onError?.(error));
                        }}
                        disabled={disabled}
                        aria-label={
                            immersive.isFullscreen
                                ? strings.exitFullscreen
                                : strings.enterFullscreen
                        }
                        title={
                            immersive.isFullscreen
                                ? strings.exitFullscreen
                                : strings.enterFullscreen
                        }
                    >
                        {immersive.isFullscreen ? (
                            <Minimize size={16} aria-hidden />
                        ) : (
                            <Maximize size={16} aria-hidden />
                        )}
                    </button>
                )}

                {actions && <span className={styles.actions}>{actions}</span>}
            </div>
        </div>
    );
}
