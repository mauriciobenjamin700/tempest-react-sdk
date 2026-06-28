import type { HTMLAttributes, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/utils/cn";
import styles from "./AppBar.module.css";

export type AppBarTone = "surface" | "primary" | "transparent";

export interface AppBarProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    /** Page title — string or any node. Rendered as the bar's `<h1>`. */
    title?: ReactNode;
    /**
     * Replace the whole left slot. When set, the auto back button and `brand`
     * are ignored — you own the leading content.
     */
    leading?: ReactNode;
    /** Show a back button in the left slot. Ignored when `leading` is set. */
    showBack?: boolean;
    /**
     * Back-button handler. Defaults to `window.history.back()`. With a router,
     * pass `onBack={() => navigate(-1)}`.
     */
    onBack?: () => void;
    /** Accessible label for the back button. Default `"Go back"`. */
    backLabel?: string;
    /** Custom back icon. Default a left arrow. */
    backIcon?: ReactNode;
    /** Brand / logo node shown in the left slot (after the back button). */
    brand?: ReactNode;
    /** Right slot — action buttons / menu. One node or many. */
    actions?: ReactNode;
    /** Center the title (three-column grid). Default `false` (left-aligned). */
    centered?: boolean;
    /** Stick to the top of the scroll container. Default `true`. */
    sticky?: boolean;
    /** Visual tone. Default `"surface"`. */
    tone?: AppBarTone;
    /** Thin bottom border. Default `true`. */
    bordered?: boolean;
    /** Add `env(safe-area-inset-top)` padding (iOS notch / PWA). Default `true`. */
    safeArea?: boolean;
}

/**
 * Mobile-first top app bar for PWAs — leading (back / brand) + title +
 * trailing actions, sticky with safe-area padding out of the box.
 *
 * Consumers customise via tokens (`--tempest-*`) and slots; the SDK ships the
 * layout, sticky/safe-area behaviour, and accessible back button so apps don't
 * hand-roll one per screen. For a desktop three-slot nav use [[Navbar]].
 *
 * @example
 * // Detail screen with back + a trailing action
 * <AppBar
 *     title="Profile"
 *     showBack
 *     onBack={() => navigate(-1)}
 *     actions={<IconButton icon={<Settings />} onClick={openSettings} />}
 * />
 *
 * @example
 * // Home screen — brand left, centered title disabled
 * <AppBar brand={<Logo />} actions={<UserMenu />} />
 */
export function AppBar({
    title,
    leading,
    showBack = false,
    onBack,
    backLabel = "Go back",
    backIcon,
    brand,
    actions,
    centered = false,
    sticky = true,
    tone = "surface",
    bordered = true,
    safeArea = true,
    className,
    ...props
}: AppBarProps) {
    const handleBack = onBack ?? (() => window.history.back());

    const leadingContent = leading ?? (
        <>
            {showBack && (
                <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={handleBack}
                    aria-label={backLabel}
                >
                    {backIcon ?? <ArrowLeft size={22} aria-hidden="true" />}
                </button>
            )}
            {brand && <span className={styles.brand}>{brand}</span>}
        </>
    );

    return (
        <header
            className={cn(
                styles.bar,
                styles[tone],
                centered && styles.centered,
                sticky && styles.sticky,
                bordered && styles.bordered,
                safeArea && styles.safeArea,
                className,
            )}
            {...props}
        >
            <div className={styles.leading}>{leadingContent}</div>
            {title != null && title !== "" && (
                <h1 className={styles.title} aria-live="polite">
                    {title}
                </h1>
            )}
            <div className={styles.actions}>{actions}</div>
        </header>
    );
}
