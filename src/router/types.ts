import type { ComponentType, ReactNode } from "react";

/**
 * Any page component a route can point at, whatever props it declares.
 *
 * Same contravariance as `lazyWithRetry`, which this field is handed to:
 * `ComponentType<unknown>` means "accepts every possible props object", so a
 * route module default-exporting `({ id }: Props) => …` would not assign here —
 * and neither would one whose props are all optional. React declares its own
 * `lazy` as `ComponentType<any>` for the same reason.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouteComponent = ComponentType<any>;

/**
 * What a route guard can answer.
 *
 * `true` renders the route, `false` redirects — and `"pending"` is the third
 * answer a two-state guard cannot give. Without it, a permission that resolves
 * asynchronously has to lie while it is in flight, and both lies are wrong:
 * answering `false` redirects the person who **does** have the permission,
 * every time the route is opened cold (F5 on the URL, an external link);
 * answering `true` renders the screen for someone who does not, until the
 * answer lands.
 */
export type RouteGuardResult = boolean | "pending";

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
    lazy?: () => Promise<{ default: AnyRouteComponent }>;
    /** Nested child routes (rendered through this route's `<Outlet />`). */
    children?: TempestRouteObject[];
    /**
     * Access guard. When `false` (or a function returning `false`), the route
     * renders a redirect to {@link redirectTo} instead of its element. When the
     * function returns `"pending"`, the decision is held and {@link guardFallback}
     * renders instead — see {@link RouteGuardResult}.
     *
     * The function runs inside the guard component's render, so it **may call
     * hooks** — which is what lets an async permission check like `useCan` plug
     * straight in. The usual rule applies: call the same hooks on every render
     * of that route. Guarded routes are keyed per route object, so navigating
     * between two routes whose guards call different hooks remounts rather than
     * breaking hook order.
     */
    guard?: boolean | (() => RouteGuardResult);
    /**
     * Rendered while {@link guard} answers `"pending"`. Defaults to the
     * {@link AppRouter} `fallback`, so a route tree that already passes a
     * spinner for `lazy` chunks reuses it here with no extra wiring.
     */
    guardFallback?: ReactNode;
    /** Destination used when `guard` fails (default: `"/"`). */
    redirectTo?: string;
    /** Match the path case-sensitively. */
    caseSensitive?: boolean;
}

/** Router history strategy used by {@link AppRouter}. */
export type RouterKind = "browser" | "hash" | "memory";
