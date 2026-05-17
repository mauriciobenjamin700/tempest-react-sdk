export interface PlayAudioOptions {
    /** Volume between 0 and 1. Default: 1. */
    volume?: number;
    /** Loop the clip. Default: false. */
    loop?: boolean;
    /** Begin playback immediately. Default: true. */
    autoplay?: boolean;
    /** Stop the previous clip managed by this player. Default: false. */
    stopPrevious?: boolean;
    /** Fired when playback ends naturally. */
    onEnded?: () => void;
    /** Fired on playback error. */
    onError?: (error: unknown) => void;
}

export interface AudioPlayer {
    /** Play `src`. Returns the underlying element, or `null` when the browser blocked autoplay. */
    play: (src: string, options?: PlayAudioOptions) => Promise<HTMLAudioElement | null>;
    /** Stop the currently-playing clip and rewind it. */
    stop: () => void;
    /** Currently playing audio element, or `null`. */
    current: () => HTMLAudioElement | null;
}

/**
 * Create an isolated audio player that tracks a single "current" clip.
 * Multiple players coexist independently; use this when several layers of UI
 * need their own playback state.
 */
export function createAudioPlayer(): AudioPlayer {
    let current: HTMLAudioElement | null = null;

    async function play(
        src: string,
        {
            volume = 1,
            loop = false,
            autoplay = true,
            stopPrevious = false,
            onEnded,
            onError,
        }: PlayAudioOptions = {},
    ): Promise<HTMLAudioElement | null> {
        try {
            if (stopPrevious && current) {
                current.pause();
                current.currentTime = 0;
            }
            const audio = new Audio(src);
            audio.volume = Math.max(0, Math.min(1, volume));
            audio.loop = loop;
            audio.preload = "auto";
            if (onEnded) audio.onended = onEnded;
            if (onError) audio.onerror = (event) => onError(event);
            current = audio;
            if (autoplay) await audio.play();
            return audio;
        } catch (error) {
            onError?.(error);
            return null;
        }
    }

    function stop(): void {
        if (!current) return;
        current.pause();
        current.currentTime = 0;
    }

    return { play, stop, current: () => current };
}

let defaultPlayer: AudioPlayer | null = null;

function getDefaultPlayer(): AudioPlayer {
    if (!defaultPlayer) defaultPlayer = createAudioPlayer();
    return defaultPlayer;
}

/**
 * Convenience wrapper around a shared {@link AudioPlayer}. Use this for
 * one-off notification sounds. For more complex flows (e.g. several
 * simultaneous channels), build a dedicated player with {@link createAudioPlayer}.
 */
export async function playAudio(
    src: string,
    options?: PlayAudioOptions,
): Promise<HTMLAudioElement | null> {
    return getDefaultPlayer().play(src, options);
}

/** Stop the clip currently playing on the shared default player. */
export function stopAudio(): void {
    getDefaultPlayer().stop();
}
