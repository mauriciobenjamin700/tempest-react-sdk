import type { ReactNode } from "react";
import { QueryProvider } from "../query/QueryProvider";
import type { QueryProviderProps } from "../query/QueryProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import type { ThemeProviderProps } from "../theme/ThemeProvider";
import { I18nProvider } from "../i18n/I18nProvider";
import type { I18nProviderProps } from "../i18n/I18nProvider";
import { ErrorBoundary } from "../error-boundary/ErrorBoundary";
import type { ErrorBoundaryProps } from "../error-boundary/ErrorBoundary";

export interface AppProvidersProps {
    children: ReactNode;
    /**
     * TanStack Query config. Enabled by default with SDK defaults; pass `false`
     * to opt out (e.g. the app already mounts its own `QueryProvider`).
     */
    query?: Omit<QueryProviderProps, "children"> | false;
    /**
     * Theme config. Enabled by default; pass `false` to opt out.
     */
    theme?: Omit<ThemeProviderProps, "children"> | false;
    /**
     * i18n config. Opt-in: provide `locale` + `messages` to mount the provider.
     */
    i18n?: Omit<I18nProviderProps, "children">;
    /**
     * Top-level error boundary. Opt-in: provide a `fallback` to wrap the tree.
     */
    errorBoundary?: Omit<ErrorBoundaryProps, "children">;
}

/**
 * Compose the Tempest app-wide providers in one place: error boundary →
 * TanStack Query → theme → i18n. Query and theme are on by default; i18n and
 * the error boundary mount only when configured. Each provider can be disabled
 * or tuned independently, so an app's `main.tsx` stays a single declarative
 * block instead of a hand-nested provider pyramid.
 *
 * @example
 * <AppProviders
 *     errorBoundary={{ fallback: <Crash /> }}
 *     i18n={{ locale: "pt-BR", messages }}
 * >
 *     <AppRouter routes={routes} />
 * </AppProviders>
 */
export function AppProviders({ children, query, theme, i18n, errorBoundary }: AppProvidersProps) {
    let tree: ReactNode = children;

    if (i18n) {
        tree = <I18nProvider {...i18n}>{tree}</I18nProvider>;
    }

    if (theme !== false) {
        tree = <ThemeProvider {...(theme || {})}>{tree}</ThemeProvider>;
    }

    if (query !== false) {
        tree = <QueryProvider {...(query || {})}>{tree}</QueryProvider>;
    }

    if (errorBoundary) {
        tree = <ErrorBoundary {...errorBoundary}>{tree}</ErrorBoundary>;
    }

    return <>{tree}</>;
}
