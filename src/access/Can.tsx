import type { ReactNode } from "react";
import { useCan } from "./use-can";
import type { CanParams } from "./types";

export interface CanProps extends CanParams {
    /** Rendered when the action is allowed. */
    children: ReactNode;
    /** Rendered when the action is denied. Defaults to nothing. */
    fallback?: ReactNode;
    /**
     * Rendered while an async check is still in flight. Defaults to
     * {@link fallback}, which keeps the pre-existing behaviour.
     *
     * Worth setting whenever `fallback` says something denial-shaped: without
     * it, a permission that resolves over the network flashes "no access" to
     * someone who has it. `pending={null}` renders nothing until the answer
     * lands; `pending={<Spinner />}` says why the screen is waiting.
     */
    pending?: ReactNode;
}

/**
 * Conditionally render based on an access check. Renders `children` when the
 * action is allowed and `fallback` when it is denied. While an async check is
 * pending it renders `pending`, which defaults to `fallback`.
 *
 * @example
 * ```tsx
 * <Can action="create" resource="posts" fallback={<p>No access</p>}>
 *   <NewPostButton />
 * </Can>
 * ```
 *
 * @example
 * ```tsx
 * <Can
 *   action="read"
 *   resource="finance"
 *   fallback={<p>No access</p>}
 *   pending={<Spinner />}
 * >
 *   <FinancePanel />
 * </Can>
 * ```
 */
export function Can({ action, resource, params, children, fallback, pending }: CanProps) {
    const { allowed, isLoading } = useCan({ action, resource, params });
    if (isLoading) return <>{pending === undefined ? (fallback ?? null) : pending}</>;
    return <>{allowed ? children : (fallback ?? null)}</>;
}
