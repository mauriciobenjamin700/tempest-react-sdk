import { type ReactNode, useMemo } from "react";

import { IconContext, type IconContextValue, type IconRegistry } from "./icon-context";

export interface IconProviderProps {
    /**
     * Icons resolved with zero extra requests.
     *
     * Pass `staticIcons` from the `virtual:tempest-icons` module the
     * `tempestIcons()` Vite plugin generates, or a table built by
     * `createIconRegistry`. Slugs found here never trigger a shard fetch.
     */
    registry?: IconRegistry;
    /** Default `size` for every `<Icon>` below. Lucide's own default is `24`. */
    size?: number | string;
    /** Default `strokeWidth` for every `<Icon>` below. Lucide's own default is `2`. */
    strokeWidth?: number;
    children: ReactNode;
}

const EMPTY_REGISTRY: IconRegistry = {};

/**
 * Provide a static icon registry and shared `<Icon>` defaults to a subtree.
 *
 * Entirely optional: without it `<Icon>` still resolves any of lucide's ~2000
 * slugs by fetching the shard that owns it. What the provider buys is the
 * zero-request path for the slugs an app actually uses, plus one place to set
 * `size`/`strokeWidth` instead of repeating them at every call site.
 *
 * @example
 * import { IconProvider } from "tempest-react-sdk/icons";
 * import { staticIcons } from "virtual:tempest-icons";
 *
 * <IconProvider registry={staticIcons} size={18}>
 *     <App />
 * </IconProvider>
 */
export function IconProvider({
    registry = EMPTY_REGISTRY,
    size,
    strokeWidth,
    children,
}: IconProviderProps): ReactNode {
    const value = useMemo<IconContextValue>(
        () => ({ registry, size, strokeWidth }),
        [registry, size, strokeWidth],
    );
    return <IconContext.Provider value={value}>{children}</IconContext.Provider>;
}
