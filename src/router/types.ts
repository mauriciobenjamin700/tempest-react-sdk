import type { ComponentType, ReactNode } from "react";

/**
 * A single declarative route node. Mirrors React Router's nested `<Route>`
 * model but adds first-class `lazy` (code-split with retry) and `guard`
 * (redirect when a predicate fails) so apps describe their route tree as data.
 */
export interface TempestRouteObject {
    /** URL segment, e.g. `"dashboard"` or `":id"`. Omit for an index route. */
    path?: string;
    /** Marks this as the index route of its parent. Mutually exclusive with `path`. */
    index?: boolean;
    /** Element rendered for this route. Ignored when `lazy` is provided. */
    element?: ReactNode;
    /**
     * Code-split component loader. Wrapped with `lazyWithRetry` and rendered
     * under the {@link AppRouter} `<Suspense>` boundary.
     */
    lazy?: () => Promise<{ default: ComponentType<unknown> }>;
    /** Nested child routes (rendered through this route's `<Outlet />`). */
    children?: TempestRouteObject[];
    /**
     * Access guard. When `false` (or a function returning `false`), the route
     * renders a redirect to {@link redirectTo} instead of its element.
     */
    guard?: boolean | (() => boolean);
    /** Destination used when `guard` fails (default: `"/"`). */
    redirectTo?: string;
    /** Match the path case-sensitively. */
    caseSensitive?: boolean;
}

/** Router history strategy used by {@link AppRouter}. */
export type RouterKind = "browser" | "hash" | "memory";
