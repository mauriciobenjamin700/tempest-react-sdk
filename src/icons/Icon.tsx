import { createElement, type ReactNode, type SVGProps } from "react";
import type { LucideIcon } from "lucide-react";

import type { IconName } from "./generated/icon-name";
import { useIconContext } from "./icon-context";
import { normalizeIconName } from "./normalize-icon-name";
import { iconStatus } from "./shard-cache";
import { useIcon } from "./use-icon";
import { isDevBuild } from "../utils/dev-mode";

interface IconBaseProps extends Omit<SVGProps<SVGSVGElement>, "ref" | "name"> {
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
    /**
     * Clean up `name` before looking it up. Default `true`.
     *
     * A stored `icon_code` arrives dirty — `shopping_cart`, `" Save"`, a slug
     * lucide deprecated two releases ago — and normalizing is what makes those
     * render instead of falling back. `false` asks for a strict lookup, for the
     * case where you want an unexpected spelling to be visible rather than
     * quietly repaired.
     *
     * Ignored when the icon is passed as a component.
     */
    normalize?: boolean;
}

/**
 * Address the icon by slug — the reason this component exists.
 *
 * The slug is typed as the union of every name lucide ships, so a typo is a
 * compile error, while still accepting a plain `string` for the case that
 * motivates the whole module: a name arriving from an API, a CMS or a config
 * table.
 */
interface IconByNameProps extends IconBaseProps {
    name: IconName | (string & {});
    icon?: never;
}

/**
 * Address the icon by component, for a call site that already imported it.
 *
 * No lookup, no registry, no shard: the component is rendered as passed. It is
 * there so a screen mixing literal icons with data-driven ones can keep using one
 * component instead of alternating between `<Icon name>` and `<Wrench />`, which
 * is what makes the shared `size`/`strokeWidth` defaults apply to both.
 */
interface IconByComponentProps extends IconBaseProps {
    icon: LucideIcon;
    name?: never;
}

export type IconProps = IconByNameProps | IconByComponentProps;

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
 * `name` is normalized before the lookup, so a stored `icon_code` renders whether
 * it was written `shopping_cart`, `" Save"` or under a slug lucide has since
 * deprecated. Pass `normalize={false}` for a strict lookup.
 *
 * @example
 * <Icon name="save" size={18} />
 * <Icon name={row.iconSlug} fallback={<span className="skeleton" />} />
 * <Icon icon={Wrench} size={18} />
 */
export function Icon({
    name,
    icon,
    size,
    strokeWidth,
    fallback = null,
    normalize = true,
    ...rest
}: IconProps): ReactNode {
    const context = useIconContext();
    const slug = name === undefined ? undefined : normalize ? normalizeIconName(name) : name;
    const fromSlug = useIcon(slug);
    const resolved = icon ?? fromSlug;

    if (!resolved) {
        if (isDevBuild() && name !== undefined && slug !== undefined) {
            if (iconStatus(slug) === "missing") warnUnknownIcon(name);
        }
        return fallback;
    }

    return createElement(resolved, {
        size: size ?? context?.size,
        strokeWidth: strokeWidth ?? context?.strokeWidth,
        ...rest,
    });
}

const warnedSlugs = new Set<string>();

/**
 * Warn once per unknown slug.
 *
 * Once, because `<Icon>` re-renders and a warning per render would bury the
 * console; the set is never cleared, since a slug that does not exist will not
 * start existing within the life of the page.
 *
 * Reports the name **as written**, not the normalized slug: the reader is the
 * developer who typed it, and `"CircleAlert"` is a far more useful thing to see in
 * the console than the `"circlealert"` it normalizes to.
 *
 * @param name - The slug that resolved to nothing, as passed.
 */
function warnUnknownIcon(name: string): void {
    if (warnedSlugs.has(name)) return;
    warnedSlugs.add(name);
    console.warn(
        `[tempest-react-sdk] <Icon name="${name}" /> — no such lucide icon. ` +
            `Slugs are kebab-case ("circle-alert", not "CircleAlert"); check against \`iconNames\`.`,
    );
}
