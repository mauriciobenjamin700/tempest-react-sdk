/** Options for {@link createSfxPool}. */
export interface SfxPoolOptions {
    /**
     * Master volume, `0`–`1`, multiplied into every per-play volume. Default
     * `1`. Wire it to the app's sound setting so one value governs the lot.
     */
    volume?: number;
    /**
     * Prefix applied to sources that are not absolute URLs — typically Vite's
     * `import.meta.env.BASE_URL`, so a build served from a subpath resolves.
     * Default `""`.
     */
    baseUrl?: string;
    /**
     * Elements kept per source. `1` (the default) restarts the clip on every
     * play, which is what a menu blip wants. Raise it to let a sound overlap
     * itself — a hit landing while the previous one is still ringing.
     */
    voices?: number;
    /**
     * Maximum number of distinct sources held. When exceeded, the least
     * recently played source is released. Default `48`.
     */
    maxSources?: number;
}

/** Per-play overrides. */
export interface PlaySfxOptions {
    /** Volume for this play, `0`–`1`, multiplied by the pool's master. Default `1`. */
    volume?: number;
}

/** Imperative handle over a pool of short sound effects. */
export interface SfxPool {
    /** Play a clip, allocating and caching its element on first use. */
    play: (src: string, options?: PlaySfxOptions) => void;
    /** Fetch clips ahead of the first play, so it is not silent while the file downloads. */
    preload: (src: string | string[]) => void;
    /** Set the master volume, applying it to anything already sounding. */
    setVolume: (volume: number) => void;
    /** Stop one source, or every source when called with no argument. */
    stop: (src?: string) => void;
    /** Release every element. Call on unmount. */
    dispose: () => void;
}

/** Clamp to the range `HTMLMediaElement.volume` accepts, rejecting `NaN`. */
function clampVolume(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.min(1, Math.max(0, value));
}

/**
 * A pool of preallocated `<audio>` elements for short sound effects.
 *
 * `new Audio(src)` on every play allocates an element and re-enters the network
 * stack for a file the browser already has, which is the wrong shape for a
 * sound that fires dozens of times a minute — a UI blip, a hit, a pickup. The
 * pool allocates once per source and replays.
 *
 * This is deliberately not {@link createAudioPlayer}: that handle tracks a
 * single "current" clip with loop, sink routing and lifecycle callbacks, which
 * is what background music needs. Effects are the opposite case — many
 * sources, all short, fire-and-forget, and the only thing that matters is that
 * firing one is cheap.
 *
 * A blocked `play()` is swallowed. Browsers reject playback until the user has
 * interacted with the page, and a sound effect is by definition not worth
 * interrupting anything over; call {@link SfxPool.preload} after the first
 * interaction if you want the pool warm.
 *
 * @param options - Master volume, base URL, voices per source and pool size.
 * @returns The pool handle.
 *
 * @example
 * const sfx = createSfxPool({ volume: 0.6, baseUrl: import.meta.env.BASE_URL });
 * sfx.preload(["sfx/select.mp3", "sfx/back.mp3"]);
 *
 * <button onClick={() => sfx.play("sfx/select.mp3")}>Confirmar</button>
 */
export function createSfxPool(options: SfxPoolOptions = {}): SfxPool {
    const { baseUrl = "", voices = 1, maxSources = 48 } = options;

    let master = clampVolume(options.volume ?? 1);
    const voiceCount = Math.max(1, Math.floor(voices));

    /**
     * Insertion-ordered by last play, so evicting the first key drops the
     * least recently used source.
     */
    const sources = new Map<string, { elements: HTMLAudioElement[]; next: number }>();

    /**
     * Per-play gain of whatever each element last played at.
     *
     * `setVolume` has to rescale live playback by the same factor it was
     * started with; assigning the master directly would yank a clip that
     * started at half volume up to full.
     */
    const gains = new WeakMap<HTMLAudioElement, number>();

    function resolve(src: string): string {
        if (!baseUrl || /^(https?:)?\/\//.test(src) || src.startsWith("data:")) return src;
        return `${baseUrl.replace(/\/$/, "")}/${src.replace(/^\//, "")}`;
    }

    function release(entry: { elements: HTMLAudioElement[] }): void {
        for (const element of entry.elements) {
            element.pause();
            element.removeAttribute("src");
            element.load();
        }
    }

    function acquire(src: string): { elements: HTMLAudioElement[]; next: number } | null {
        if (typeof Audio === "undefined") return null;

        const url = resolve(src);
        const existing = sources.get(url);
        if (existing) {
            // Re-insert so the map order stays "least recently played first".
            sources.delete(url);
            sources.set(url, existing);
            return existing;
        }

        const entry = {
            elements: Array.from({ length: voiceCount }, () => {
                const element = new Audio(url);
                element.preload = "auto";
                return element;
            }),
            next: 0,
        };
        sources.set(url, entry);

        if (sources.size > maxSources) {
            const oldest = sources.keys().next();
            if (!oldest.done && oldest.value !== url) {
                const evicted = sources.get(oldest.value);
                if (evicted) release(evicted);
                sources.delete(oldest.value);
            }
        }

        return entry;
    }

    return {
        play(src, playOptions = {}) {
            const entry = acquire(src);
            if (!entry) return;

            const element = entry.elements[entry.next];
            entry.next = (entry.next + 1) % entry.elements.length;

            const gain = clampVolume(playOptions.volume ?? 1);
            gains.set(element, gain);

            element.pause();
            element.currentTime = 0;
            element.volume = clampVolume(gain * master);
            void element.play().catch(() => {});
        },

        preload(src) {
            for (const one of Array.isArray(src) ? src : [src]) {
                acquire(one)?.elements.forEach((element) => element.load());
            }
        },

        setVolume(volume) {
            master = clampVolume(volume);
            for (const entry of sources.values()) {
                for (const element of entry.elements) {
                    if (element.paused) continue;
                    element.volume = clampVolume((gains.get(element) ?? 1) * master);
                }
            }
        },

        stop(src) {
            const targets = src ? [sources.get(resolve(src))] : [...sources.values()];
            for (const entry of targets) {
                if (!entry) continue;
                for (const element of entry.elements) {
                    element.pause();
                    element.currentTime = 0;
                }
            }
        },

        dispose() {
            for (const entry of sources.values()) release(entry);
            sources.clear();
        },
    };
}
