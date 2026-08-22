import { createElement, type ReactNode, type SVGProps } from "react";

import { isDev, warnOnce } from "@/utils/dev-warn";
import type { IconName } from "./generated/icon-name";
import { useIconContext } from "./icon-context";
import { iconStatus } from "./shard-cache";
import { useIcon } from "./use-icon";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
    /**
     * The lucide slug, kebab-case: `"save"`, `"trash-2"`, `"circle-alert"`.
     *
     * Typed as the union of every slug lucide ships, so a typo is a compile
     * error — while still accepting a plain `string` for the case this component
     * exists for: a name that arrives from an API, a CMS or a config table.
     */
    name: IconName | (string & {});
    /** Width and height in px. Defaults to the provider's value, then lucide's `24`. */
    size?: number | string;
    /** Stroke width. Defaults to the provider's value, then lucide's `2`. */
    strokeWidth?: number;
    /**
     * Rendered while the icon's shard is in flight, and for a slug that does not
     * exist at all. Defaults to nothing.
     *
     * Pass a same-sized placeholder when the surrounding layout would otherwise
     * shift. Note that a slug already in the registry or the cache never renders
     * this — it resolves during render.
     */
    fallback?: ReactNode;
}

/**
 * Render a lucide icon by slug.
 *
 * All ~2000 lucide icons are addressable, without the cost that makes
 * `lucide-react`'s own `DynamicIcon` unusable: its icon map holds a dynamic
 * `import()` per icon, so a bundler has to emit ~2000 chunk boundaries and the
 * browser floods with requests. Here a slug the app wrote as a literal is
 * resolved from a static registry, and a slug only known at runtime pulls a
 * single shard covering every icon sharing its initial letter.
 *
 * An unknown slug renders `fallback` (nothing, by default) and warns in dev only
 * — it never throws, because a bad name from an API must not take down the tree.
 *
 * @example
 * <Icon name="save" size={18} />
 * <Icon name={row.iconSlug} fallback={<span className="skeleton" />} />
 */
export function Icon({ name, size, strokeWidth, fallback = null, ...rest }: IconProps): ReactNode {
    const context = useIconContext();
    const resolved = useIcon(name);

    if (!resolved) {
        if (isDev() && iconStatus(name) === "missing") warnUnknownIcon(name);
        return fallback;
    }

    return createElement(resolved, {
        size: size ?? context?.size,
        strokeWidth: strokeWidth ?? context?.strokeWidth,
        ...rest,
    });
}

/**
 * Warn once per unknown slug.
 *
 * Keyed by slug rather than latched globally, so a screen with two bad names
 * reports both — while `<Icon>` re-rendering with the same bad name stays quiet.
 *
 * @param name - The slug that resolved to nothing.
 */
function warnUnknownIcon(name: string): void {
    warnOnce(
        `icon-unknown-slug:${name}`,
        `[tempest-react-sdk] <Icon name="${name}" /> — no such lucide icon. ` +
            `Slugs are kebab-case ("circle-alert", not "CircleAlert"); check against \`iconNames\`.`,
    );
}
