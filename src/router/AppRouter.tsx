import { Suspense, useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import { BrowserRouter, HashRouter, MemoryRouter, Routes, Route } from "react-router";
import { lazyWithRetry } from "../auth/lazy-with-retry";
import { RouteGuard } from "./RouteGuard";
import type { RouteGuardResult, RouterKind, TempestRouteObject } from "./types";

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

/**
 * Runs one route's `guard` and renders the outcome.
 *
 * The guard is called during this component's render, which is what lets it
 * call hooks — `useCan` returning `{ allowed, isLoading }` maps straight onto
 * the three outcomes. See {@link guardKey} for why each guarded route gets its
 * own instance.
 */
function GuardedElement({
    guard,
    guardFallback,
    redirectTo,
    children,
}: {
    guard: boolean | (() => RouteGuardResult);
    guardFallback?: ReactNode;
    redirectTo?: string;
    children: ReactNode;
}) {
    const allowed = typeof guard === "function" ? guard() : guard;
    return (
        <RouteGuard when={allowed} fallback={guardFallback} redirectTo={redirectTo}>
            {children}
        </RouteGuard>
    );
}

const guardKeys = new WeakMap<TempestRouteObject, string>();
let guardKeySeq = 0;

/**
 * A key unique to each route object, so React remounts `GuardedElement` when
 * the matched route changes instead of reusing the instance.
 *
 * Load-bearing once guards may call hooks. React Router renders the matched
 * route's element at the same position in the tree, so without a differing key
 * React reconciles two different routes onto the same `GuardedElement`
 * instance and the previous route's guard state survives into the next one's —
 * a guard reading `useState("from-a")` still reads `"from-a"` after navigating
 * to a route whose guard initialises it to `"from-b"`. Path is not enough on
 * its own: two routes in different branches can share one.
 */
function guardKey(route: TempestRouteObject): string {
    let key = guardKeys.get(route);
    if (!key) {
        key = `guard-${++guardKeySeq}`;
        guardKeys.set(route, key);
    }
    return key;
}

function toRouteElements(routes: TempestRouteObject[], fallback: ReactNode): ReactNode {
    return routes.map((route, i) => {
        let element: ReactNode = route.element;
        if (route.lazy) {
            const LazyComponent = resolveLazy(route);
            element = <LazyComponent />;
        }
        if (route.guard !== undefined) {
            element = (
                <GuardedElement
                    key={guardKey(route)}
                    guard={route.guard}
                    guardFallback={route.guardFallback ?? fallback}
                    redirectTo={route.redirectTo}
                >
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
                {route.children ? toRouteElements(route.children, fallback) : null}
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
    /**
     * Suspense fallback shown while a `lazy` route chunk loads, and the default
     * for a route whose `guard` answers `"pending"` — one spinner covers both
     * kinds of "not ready yet". A route overrides it with its own
     * `guardFallback`.
     */
    fallback?: ReactNode;
}

/**
 * Render a full React Router (v7 or v8, declarative mode) from a
 * {@link defineRoutes}
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
    const tree = useMemo(() => toRouteElements(routes, fallback), [routes, fallback]);
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
