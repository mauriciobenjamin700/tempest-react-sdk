import { Suspense, useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import { BrowserRouter, HashRouter, MemoryRouter, Routes, Route } from "react-router-dom";
import { lazyWithRetry } from "../auth/lazy-with-retry";
import { RouteGuard } from "./RouteGuard";
import type { RouterKind, TempestRouteObject } from "./types";

/**
 * Identity helper that types a declarative route tree. Use it so editors give
 * autocomplete and type-checking on every node; the array is returned as-is.
 *
 * @example
 * export const routes = defineRoutes([
 *     { path: "/", element: <Layout />, children: [
 *         { index: true, lazy: () => import("./pages/Home") },
 *         { path: "settings", lazy: () => import("./pages/Settings"),
 *           guard: () => useAuth.getState().isAuthenticated, redirectTo: "/login" },
 *     ] },
 * ]);
 */
export function defineRoutes(routes: TempestRouteObject[]): TempestRouteObject[] {
    return routes;
}

const lazyCache = new WeakMap<TempestRouteObject, ComponentType<unknown>>();

function resolveLazy(route: TempestRouteObject): ComponentType<unknown> {
    let comp = lazyCache.get(route);
    if (!comp) {
        comp = lazyWithRetry(route.lazy!);
        lazyCache.set(route, comp);
    }
    return comp;
}

function GuardedElement({
    guard,
    redirectTo,
    children,
}: {
    guard: boolean | (() => boolean);
    redirectTo?: string;
    children: ReactNode;
}) {
    const allowed = typeof guard === "function" ? guard() : guard;
    return (
        <RouteGuard when={allowed} redirectTo={redirectTo}>
            {children}
        </RouteGuard>
    );
}

function toRouteElements(routes: TempestRouteObject[]): ReactNode {
    return routes.map((route, i) => {
        let element: ReactNode = route.element;
        if (route.lazy) {
            const LazyComponent = resolveLazy(route);
            element = <LazyComponent />;
        }
        if (route.guard !== undefined) {
            element = (
                <GuardedElement guard={route.guard} redirectTo={route.redirectTo}>
                    {element}
                </GuardedElement>
            );
        }

        if (route.index) {
            return <Route key={`index-${i}`} index element={element} />;
        }

        return (
            <Route
                key={route.path ?? `route-${i}`}
                path={route.path}
                element={element}
                caseSensitive={route.caseSensitive}
            >
                {route.children ? toRouteElements(route.children) : null}
            </Route>
        );
    });
}

const ROUTERS: Record<RouterKind, typeof BrowserRouter> = {
    browser: BrowserRouter,
    hash: HashRouter,
    memory: MemoryRouter,
};

export interface AppRouterProps {
    /** Declarative route tree, ideally built with {@link defineRoutes}. */
    routes: TempestRouteObject[];
    /** History strategy (default: `"browser"`). */
    router?: RouterKind;
    /** App-wide base path forwarded to the underlying router. */
    basename?: string;
    /** Initial URLs for the `"memory"` router (tests / non-DOM hosts). */
    initialEntries?: string[];
    /** Suspense fallback shown while a `lazy` route chunk loads. */
    fallback?: ReactNode;
}

/**
 * Render a full React Router (v7, declarative mode) from a {@link defineRoutes}
 * tree: picks the history strategy, wraps everything in a `<Suspense>` boundary
 * for `lazy` routes, and applies per-route `guard` redirects. This is the
 * single entry point apps mount at their root.
 *
 * @example
 * <AppRouter routes={routes} fallback={<Spinner />} />
 */
export function AppRouter({
    routes,
    router = "browser",
    basename,
    initialEntries,
    fallback = null,
}: AppRouterProps) {
    const tree = useMemo(() => toRouteElements(routes), [routes]);
    const Router = ROUTERS[router];
    const routerProps = router === "memory" ? { basename, initialEntries } : { basename };

    return (
        <Router {...routerProps}>
            <Suspense fallback={fallback}>
                <Routes>{tree}</Routes>
            </Suspense>
        </Router>
    );
}
