import type { ReactNode } from "react";

export interface AuthGuardProps {
    /** Whether the current user is authenticated. */
    isAuthenticated: boolean;
    /** Element to render when authenticated. */
    children: ReactNode;
    /** Element to render when not authenticated. Use this to redirect (e.g. `<Navigate to="/login" />`). */
    fallback: ReactNode;
}

/**
 * Router-agnostic auth gate. The caller decides what to render in either
 * branch — typically `<Outlet />` for protected layouts and `<Navigate />` for
 * the redirect. Pair with {@link createAuthStore} or any custom auth source.
 *
 * @example
 * <AuthGuard
 *     isAuthenticated={useAuthStore((s) => s.isAuthenticated)}
 *     fallback={<Navigate to="/login" replace />}
 * >
 *     <Outlet />
 * </AuthGuard>
 */
export function AuthGuard({ isAuthenticated, children, fallback }: AuthGuardProps) {
    return <>{isAuthenticated ? children : fallback}</>;
}
