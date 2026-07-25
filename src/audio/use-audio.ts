import { useCallback, useEffect, useState } from "react";
import { createAudioPlayer, type AudioPlayer, type PlayAudioOptions } from "./audio-player";

export interface UseAudioResult {
    /** Play `src` on the hook's private player. */
    play: (src: string, options?: PlayAudioOptions) => Promise<void>;
    /** Stop the current clip. */
    stop: () => void;
    /**
     * Whether the browser's autoplay policy has been satisfied. Becomes
     * `true` after the first successful `play()`.
     */
    unlocked: boolean;
}

/**
 * The player lives in a state initializer, not in a lazily-written ref: the
 * initializer runs exactly once and is not a side effect during render, which is
 * what the ref version was. The player identity never changes, so state holds it
 * fine and the value is non-null from the first render.
 *
 * Hook-managed audio player. Each component instance gets its own
 * {@link AudioPlayer}, so unmounting cleanly stops playback. Useful for
 * notification chimes, UI feedback sounds, and per-component soundtracks.
 */
export function useAudio(): UseAudioResult {
    const [player] = useState<AudioPlayer>(() => createAudioPlayer());
    const [unlocked, setUnlocked] = useState<boolean>(false);

    useEffect(() => {
        return () => {
            player.stop();
        };
    }, [player]);

    const play = useCallback(
        async (src: string, options?: PlayAudioOptions): Promise<void> => {
            const result = await player.play(src, options);
            if (result) setUnlocked(true);
        },
        [player],
    );

    const stop = useCallback((): void => {
        player.stop();
    }, [player]);

    return { play, stop, unlocked };
}
