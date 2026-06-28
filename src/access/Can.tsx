import type { ReactNode } from "react";
import { useCan } from "./use-can";
import type { CanParams } from "./types";

export interface CanProps extends CanParams {
    /** Rendered when the action is allowed. */
    children: ReactNode;
    /** Rendered when the action is denied. Defaults to nothing. */
    fallback?: ReactNode;
}

/**
 * Conditionally render based on an access check. Renders `children` when the
 * action is allowed, otherwise `fallback` (or nothing). While an async check is
 * pending, nothing is rendered.
 *
 * @example
 * ```tsx
 * <Can action="create" resource="posts" fallback={<p>No access</p>}>
 *   <NewPostButton />
 * </Can>
 * ```
 */
export function Can({ action, resource, params, children, fallback }: CanProps) {
    const { allowed, isLoading } = useCan({ action, resource, params });
    if (isLoading) return <>{fallback ?? null}</>;
    return <>{allowed ? children : (fallback ?? null)}</>;
}
