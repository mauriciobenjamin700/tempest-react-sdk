import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Navbar.module.css";

export type NavbarTone = "surface" | "primary" | "transparent";

export interface NavbarProps extends HTMLAttributes<HTMLElement> {
    /** Left slot — typically logo + brand name. */
    logo?: ReactNode;
    /** Center slot — typically nav links. */
    nav?: ReactNode;
    /** Right slot — typically user menu / actions. */
    actions?: ReactNode;
    /** Make the bar sticky at the top of the scroll container. Default `true`. */
    sticky?: boolean;
    /** Visual tone. Default `"surface"`. */
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
            {...props}
        >
            {logo && <div className={styles.logo}>{logo}</div>}
            {nav && <nav className={styles.nav}>{nav}</nav>}
            {actions && <div className={styles.actions}>{actions}</div>}
        </header>
    );
}
