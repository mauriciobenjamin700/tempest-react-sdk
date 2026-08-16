import { useEffect, useState } from "react";
import { createSfxPool, type SfxPool, type SfxPoolOptions } from "./sfx-pool";

/**
 * Component-scoped {@link createSfxPool}, with the lifecycle wired up.
 *
 * The pool is created once — through a lazy `useState` initializer, so no
 * element is allocated on a render that gets discarded — and disposed on
 * unmount, so its elements do not outlive the screen that owns them.
 *
 * `volume` is tracked separately: changing it calls `setVolume` on the existing
 * pool rather than rebuilding it, which would throw away every clip the user
 * has already downloaded — exactly the cost the pool exists to avoid.
 * `baseUrl`, `voices` and `maxSources` are read once, at creation.
 *
 * @param options - Passed through to {@link createSfxPool}.
 * @returns A stable pool handle.
 *
 * @example
 * const sfx = useSfxPool({ volume: settings.sfxVolume / 100, baseUrl: import.meta.env.BASE_URL });
 *
 * useEffect(() => { sfx.preload(["sfx/select.mp3", "sfx/back.mp3"]); }, [sfx]);
 *
 * <button onClick={() => sfx.play("sfx/select.mp3")}>Confirmar</button>
 */
export function useSfxPool(options: SfxPoolOptions = {}): SfxPool {
    const { volume = 1, baseUrl, voices, maxSources } = options;

    const [pool] = useState(() => createSfxPool({ baseUrl, voices, maxSources, volume }));

    useEffect(() => {
        pool.setVolume(volume);
    }, [pool, volume]);

    useEffect(() => () => pool.dispose(), [pool]);

    return pool;
}
