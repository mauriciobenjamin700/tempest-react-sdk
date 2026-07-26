import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

import { useIconContext } from "./icon-context";
import { loadIcon, peekIcon, subscribeToIcons } from "./shard-cache";

/**
 * Resolve an icon slug to its component.
 *
 * Resolution is synchronous whenever it can be: the provider registry first, then
 * the shard cache. Both are plain reads during render, so a slug the app declared
 * statically — or one whose shard a sibling icon already pulled in — is returned
 * on the first frame with no intermediate empty state.
 *
 * Only a genuinely cold slug falls through to the effect, which fetches the shard
 * for that initial letter and re-renders once it lands.
 *
 * @param slug - Any icon slug, canonical or deprecated. `undefined` skips work.
 * @returns The icon component, or `undefined` while it is loading or if the slug
 *   does not exist.
 */
export function useIcon(slug: string | undefined): LucideIcon | undefined {
    const context = useIconContext();
    const fromRegistry = slug ? context?.registry[slug] : undefined;
    const [, forceRender] = useState(0);

    const cached = !fromRegistry && slug ? peekIcon(slug) : undefined;
    const resolved = fromRegistry ?? cached;

    useEffect(() => {
        if (!slug || resolved) return;
        let active = true;
        const unsubscribe = subscribeToIcons(() => {
            if (active) forceRender((n) => n + 1);
        });
        void loadIcon(slug);
        return () => {
            active = false;
            unsubscribe();
        };
    }, [slug, resolved]);

    return resolved;
}
