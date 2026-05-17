import { useCallback, useEffect, useRef, useState } from "react";
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
 * Hook-managed audio player. Each component instance gets its own
 * {@link AudioPlayer}, so unmounting cleanly stops playback. Useful for
 * notification chimes, UI feedback sounds, and per-component soundtracks.
 */
export function useAudio(): UseAudioResult {
    const playerRef = useRef<AudioPlayer | null>(null);
    const [unlocked, setUnlocked] = useState<boolean>(false);

    if (!playerRef.current) {
        playerRef.current = createAudioPlayer();
    }

    useEffect(() => {
        return () => {
            playerRef.current?.stop();
        };
    }, []);

    const play = useCallback(async (src: string, options?: PlayAudioOptions): Promise<void> => {
        const result = await playerRef.current!.play(src, options);
        if (result) setUnlocked(true);
    }, []);

    const stop = useCallback((): void => {
        playerRef.current?.stop();
    }, []);

    return { play, stop, unlocked };
}
