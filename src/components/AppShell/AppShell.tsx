import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import styles from "./AppShell.module.css";

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
    /** Top navigation bar (Navbar / custom). Renders on every breakpoint. */
    navbar?: ReactNode;
    /** Side navigation (Sidebar). Hidden below `md` — pair with `<Drawer>` for mobile. */
    sidebar?: ReactNode;
    /** Mobile-only bottom navigation (BottomNavigation). Hidden at `md+`. */
    bottomNav?: ReactNode;
    /** Footer rendered after the main content. */
    footer?: ReactNode;
    /** Breakpoint at which the sidebar appears. Default `"md"`. */
    sidebarBreakpoint?: "sm" | "md" | "lg" | "xl";
    children?: ReactNode;
}

/**
 * Full app layout — composes [[Navbar]] + [[Sidebar]] + content +
 * [[BottomNavigation]] + footer with responsive behaviour:
 *
 * - **Desktop (`>= sidebarBreakpoint`)**: navbar + sidebar + main + footer.
 * - **Mobile (`< sidebarBreakpoint`)**: navbar + main + bottom nav + footer
 *   (sidebar hidden — app should expose it via `<Drawer>` from a hamburger).
 *
 * @example
 * <AppShell
 *     navbar={<Navbar logo={<Brand />} actions={<UserMenu />} />}
 *     sidebar={<Sidebar items={...} value={tab} onChange={setTab} />}
 *     bottomNav={<BottomNavigation items={...} value={tab} onChange={setTab} />}
 *     footer={<Footer />}
 * >
 *     <Page title="Dashboard">{content}</Page>
 * </AppShell>
 */
export function AppShell({
    navbar,
    sidebar,
    bottomNav,
    footer,
    sidebarBreakpoint = "md",
    className,
    children,
    ...props
}: AppShellProps) {
    const bp = useBreakpoint();
    const showSidebar = bp.above(sidebarBreakpoint);
    return (
        <div className={cn(styles.shell, className)} {...props}>
            {navbar && <div className={styles.navbar}>{navbar}</div>}
            <div className={styles.row}>
                {sidebar && showSidebar && <div className={styles.sidebar}>{sidebar}</div>}
                <main className={styles.main}>{children}</main>
            </div>
            {footer && <div className={styles.footer}>{footer}</div>}
            {bottomNav && !showSidebar && <div className={styles.bottomNav}>{bottomNav}</div>}
        </div>
    );
}
