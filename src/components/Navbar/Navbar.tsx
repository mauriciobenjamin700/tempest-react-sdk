import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Navbar.module.css";

/**
 * Visual tone of a {@link Navbar}.
 *
 * - `"surface"` — the page's surface and text.
 * - `"primary"` — the brand fill (`--tempest-primary`) with
 *   `--tempest-primary-foreground` ink. Only the bar's own text follows the fill:
 *   components inside it keep the page's tokens. Measured in Chromium over the
 *   SDK's `#0066ff`, a link button inside it reads 1:1, muted text 1.59:1 and the
 *   focus ring 1.41:1. Fine for a bar that holds a logo and plain text.
 * - `"inverse"` — the inverse surface: every color token inverted inside the bar,
 *   so a primary `Button`, a link, the focus ring and muted text are measured
 *   against the fill. See {@link NavbarProps.tone}.
 * - `"transparent"` — no background; the text inherits.
 */
export type NavbarTone = "surface" | "primary" | "inverse" | "transparent";

export interface NavbarProps extends HTMLAttributes<HTMLElement> {
    /** Left slot — typically logo + brand name. */
    logo?: ReactNode;
    /** Center slot — typically nav links. */
    nav?: ReactNode;
    /** Right slot — typically user menu / actions. */
    actions?: ReactNode;
    /** Make the bar sticky at the top of the scroll container. Default `true`. */
    sticky?: boolean;
    /**
     * Visual tone. Default `"surface"`.
     *
     * `"inverse"` writes `data-tempest-tone="inverse"` and paints the bar with the
     * inverse surface's `--tempest-bg`, so the components in the slots invert with
     * it. The tokens are opt-in: `tempest-react-sdk/styles/inverse.css` for the
     * SDK's own blue, or `createTheme({ primary, inverse: createInverseSurface })`
     * for yours. With neither loaded the bar falls back to the page's
     * `--tempest-bg` and `--tempest-text` — legible, not inverted.
     *
     * A separate tone rather than a change to `"primary"`, because the inverse
     * fill is not always the brand's `500`: for `#0066ff` it is the `800`
     * (`#042e75`), and turning `"primary"` into it would repaint every bar that
     * uses it today.
     */
    tone?: NavbarTone;
    /** When set, renders a thin bottom border. Default `true`. */
    bordered?: boolean;
}

/**
 * Top app bar. Three-slot layout (logo / nav / actions) that collapses
 * gracefully on mobile (nav slot wraps below).
 *
 * @example
 * <Navbar
 *     logo={<img src="/logo.svg" alt="App" />}
 *     nav={<NavLinks />}
 *     actions={<UserMenu />}
 * />
 */
export function Navbar({
    logo,
    nav,
    actions,
    sticky = true,
    tone = "surface",
    bordered = true,
    className,
    ...props
}: NavbarProps) {
    return (
        <header
            className={cn(
                styles.navbar,
                styles[tone],
                sticky && styles.sticky,
                bordered && styles.bordered,
                className,
            )}
            data-tempest-tone={tone === "inverse" ? "inverse" : undefined}
            {...props}
        >
            {logo && <div className={styles.logo}>{logo}</div>}
            {nav && <nav className={styles.nav}>{nav}</nav>}
            {actions && <div className={styles.actions}>{actions}</div>}
        </header>
    );
}
