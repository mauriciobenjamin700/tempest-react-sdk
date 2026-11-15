import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { RouteGuardResult } from "./types";

export interface RouteGuardProps {
    /**
     * Whether access is allowed — typically
     * `useAuthStore((s) => s.isAuthenticated)`.
     *
     * `"pending"` is the third answer, for a permission that has not resolved
     * yet: it holds the decision and renders {@link fallback} instead of
     * choosing between two wrong moves — redirecting someone who does have
     * access, or showing the screen to someone who does not.
     */
    when: RouteGuardResult;
    /**
     * Rendered while `when` is `"pending"`. Defaults to nothing, which is a
     * blank screen — pass the same spinner the rest of the app uses.
     */
    fallback?: ReactNode;
    /** Where to redirect when `when` is falsy (default: `"/"`). */
    redirectTo?: string;
    /** Replace history entry on redirect instead of pushing (default: true). */
    replace?: boolean;
    /**
     * Send the blocked location along with the redirect, as
     * `state: { from: pathname + search + hash }`, so the login screen can
     * return the user there after signing in — read it back with
     * `useReturnTo`, which only accepts a same-origin path. Default `false`:
     * the redirect carries no state.
     */
    preserveFrom?: boolean;
    /** Protected content, usually `<Outlet />` for a guarded layout route. */
    children: ReactNode;
}

/**
 * Declarative route guard built on React Router's `<Navigate>`. Renders its
 * children when `when` is `true`, redirects when it is `false`, and holds on
 * `"pending"`. Pairs naturally with `createAuthStore` for protected areas, and
 * with `useCan` for permissions that resolve over the network.
 *
 * @example
 * <RouteGuard when={useAuthStore((s) => s.isAuthenticated)} redirectTo="/login">
 *     <Outlet />
 * </RouteGuard>
 *
 * @example
 * <RouteGuard when={isAuthenticated} redirectTo="/login" preserveFrom>
 *     <Outlet />
 * </RouteGuard>
 *
 * @example
 * const { allowed, isLoading } = useCan({ action: "read", resource: "finance" });
 *
 * <RouteGuard when={isLoading ? "pending" : allowed} fallback={<Spinner />}>
 *     <Outlet />
 * </RouteGuard>
 */
export function RouteGuard({
    when,
    fallback = null,
    redirectTo = "/",
    replace = true,
    preserveFrom = false,
    children,
}: RouteGuardProps) {
    if (when === "pending") return <>{fallback}</>;
    if (when) return <>{children}</>;
    return preserveFrom ? (
        <RedirectWithFrom to={redirectTo} replace={replace} />
    ) : (
        <Navigate to={redirectTo} replace={replace} />
    );
}

/**
 * The redirect that records where it came from.
 *
 * A component of its own so `useLocation()` runs only on this branch: a
 * `RouteGuard` that renders its children never touched router context before
 * `preserveFrom` existed, and still does not.
 */
function RedirectWithFrom({ to, replace }: { to: string; replace: boolean }) {
    const { pathname, search, hash } = useLocation();
    return <Navigate to={to} replace={replace} state={{ from: `${pathname}${search}${hash}` }} />;
}
