import { createElement } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/utils/cn";
import styles from "./AuthPage.module.css";

/** How the page is laid out: brand panel beside the form, or one centered card. */
export type AuthPageVariant = "split" | "card";

/** Heading level of the page title. */
export type AuthPageHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** The brand panel of a `split` page — the colored half on desktop, the colored top on mobile. */
export interface AuthPageAside {
    /**
     * Any CSS `background` value: a color, a token, a gradient, an image.
     * Defaults to `var(--tempest-primary)`, so a themed app gets its brand color
     * without passing anything.
     */
    background?: string;
    /**
     * Text color over that background. Defaults to `var(--tempest-text-on-primary)`,
     * which is only right while the background is the primary color — set it
     * together with a custom `background` so the back button and the app name
     * keep their contrast.
     */
    color?: string;
    /** Extra content under the brand on the panel: a tagline, an illustration. */
    content?: ReactNode;
}

/** The back action, as an object when the label or the behavior is not the default. */
export interface AuthPageBackAction {
    /** Route to navigate to, rendered as a router `Link`. */
    to?: string;
    /** Visible label (and accessible name). Default `"Voltar"`. */
    label?: string;
    /** Click handler — used alone (a `<button>`) or together with `to`. */
    onClick?: () => void;
}

export interface AuthPageProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    /** Logo and/or app name, shown on the brand panel (split) or at the top of the card. */
    brand?: ReactNode;
    /** Page title, rendered as a heading — e.g. `"Bem-vindo!"`. */
    title?: ReactNode;
    /** Line under the title — e.g. `"Entre com sua conta para continuar"`. */
    subtitle?: ReactNode;
    /** Brand panel colors and extra content. */
    aside?: AuthPageAside;
    /**
     * `split` (default): colored top + rounded white sheet below `breakpoint`,
     * 50/50 brand panel and form at or above it. `card`: one centered card at
     * every width — the internal-panel login.
     */
    variant?: AuthPageVariant;
    /**
     * Viewport width, in px, at which `split` turns into two columns. Default
     * `768`, the width every hand-built auth screen this replaces switched at —
     * deliberately not the `1024` of `useBreakpoint`, which is about navigation
     * chrome, not about whether a form fits beside a brand panel.
     */
    breakpoint?: number;
    /** Back action: a route string, or an object with `to`/`label`/`onClick`. Omit to hide it. */
    back?: string | AuthPageBackAction;
    /** Content under the form, inside the sheet or card — legal text, a secondary link. */
    footer?: ReactNode;
    /** Heading level of `title`. Default `1`, since the auth screen is usually the whole page. */
    headingLevel?: AuthPageHeadingLevel;
    /**
     * Root element. Default `"main"`, the page's main landmark. Use `"div"` when
     * the page is rendered inside a layout that already owns a `<main>` — two
     * nested main landmarks are an accessibility violation.
     */
    as?: "main" | "div";
    /** The form — usually an `AuthForm` or one of its presets. */
    children?: ReactNode;
}

const DEFAULT_BACK_LABEL = "Voltar";

/**
 * Render the back action, as a router link or a plain button.
 *
 * @param props - The `back` prop, already present.
 * @returns The link or button, labelled by its visible text.
 */
function BackAction({ back }: { back: string | AuthPageBackAction }): ReactNode {
    const action: AuthPageBackAction = typeof back === "string" ? { to: back } : back;
    const content = (
        <>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                    d="M19 12H5m6-7-7 7 7 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
            <span>{action.label ?? DEFAULT_BACK_LABEL}</span>
        </>
    );
    if (action.to !== undefined) {
        return (
            <Link to={action.to} onClick={action.onClick} className={styles.back}>
                {content}
            </Link>
        );
    }
    return (
        <button type="button" onClick={action.onClick} className={styles.back}>
            {content}
        </button>
    );
}

/**
 * The layout shell of a sign-in, sign-up or password-recovery screen.
 *
 * Every app was hand-building the same page around its form: a colored top with
 * the logo and a back button over a white sheet with rounded top corners on
 * mobile, a 50/50 brand panel and form on desktop, a "Bem-vindo!" heading. This
 * component is that page, so the app passes only the brand and the form.
 *
 * The switch between the two layouts is a JavaScript media query, not a CSS
 * `@media` rule, because the breakpoint is a prop: a CSS media query cannot read a
 * custom property. `useMediaQuery` evaluates synchronously on the first render, so
 * a client-rendered page does not flash the wrong layout.
 *
 * @example
 * <AuthPage brand={<img src="/logo.svg" alt="Acme" />} back="/" title="Bem-vindo!">
 *     <LoginForm onSubmit={signIn} links={{ forgotPassword: "/recuperar", signUp: "/cadastro" }} />
 * </AuthPage>
 */
export function AuthPage({
    brand,
    title,
    subtitle,
    aside,
    variant = "split",
    breakpoint = 768,
    back,
    footer,
    headingLevel = 1,
    as = "main",
    children,
    className,
    style,
    ...props
}: AuthPageProps): ReactNode {
    const wide = useMediaQuery(`(min-width: ${breakpoint}px)`);
    const layout = variant === "card" ? "card" : wide ? "split" : "stacked";
    const rootStyle = {
        "--tempest-auth-page-aside-bg": aside?.background,
        "--tempest-auth-page-aside-fg": aside?.color,
        ...style,
    } as CSSProperties;
    const heading =
        title === undefined
            ? null
            : createElement(`h${headingLevel}`, { className: styles.title }, title);

    return createElement(
        as,
        {
            ...props,
            className: cn(styles.root, styles[layout], className),
            style: rootStyle,
            "data-layout": layout,
        },
        layout !== "card" && (
            <div className={styles.aside}>
                {back !== undefined && <BackAction back={back} />}
                {brand !== undefined && <div className={styles.brand}>{brand}</div>}
                {aside?.content !== undefined && (
                    <div className={styles.asideContent}>{aside.content}</div>
                )}
            </div>
        ),
        layout === "card" && back !== undefined && (
            <div className={styles.cardBack}>
                <BackAction back={back} />
            </div>
        ),
        <div className={styles.panel}>
            <div className={styles.sheet}>
                {layout === "card" && brand !== undefined && (
                    <div className={styles.cardBrand}>{brand}</div>
                )}
                {(heading || subtitle !== undefined) && (
                    <div className={styles.header}>
                        {heading}
                        {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
                    </div>
                )}
                {children}
                {footer !== undefined && <div className={styles.footer}>{footer}</div>}
            </div>
        </div>,
    );
}
