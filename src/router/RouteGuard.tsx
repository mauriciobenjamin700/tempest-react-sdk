import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export interface RouteGuardProps {
    /**
     * Whether access is allowed. Pass a boolean or anything truthy/falsy —
     * typically `useAuthStore((s) => s.isAuthenticated)`.
     */
    when: boolean;
    /** Where to redirect when `when` is falsy (default: `"/"`). */
    redirectTo?: string;
    /** Replace history entry on redirect instead of pushing (default: true). */
    replace?: boolean;
    /** Protected content, usually `<Outlet />` for a guarded layout route. */
    children: ReactNode;
}

/**
 * Declarative route guard built on React Router's `<Navigate>`. Renders its
 * children when `when` is truthy, otherwise redirects. Pairs naturally with
 * `createAuthStore` for protected areas.
 *
 * @example
 * <RouteGuard when={useAuthStore((s) => s.isAuthenticated)} redirectTo="/login">
 *     <Outlet />
 * </RouteGuard>
 */
export function RouteGuard({ when, redirectTo = "/", replace = true, children }: RouteGuardProps) {
    return <>{when ? children : <Navigate to={redirectTo} replace={replace} />}</>;
}
