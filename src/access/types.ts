/**
 * Arguments describing the access check to perform.
 */
export interface CanParams {
    /** The action being attempted (e.g. `"create"`, `"read"`, `"delete"`). */
    action: string;
    /** The resource the action targets (e.g. `"posts"`). Optional for global actions. */
    resource?: string;
    /** Arbitrary extra context an access-control strategy may inspect. */
    params?: Record<string, unknown>;
}

/**
 * Detailed result of an access check. Use the bare `boolean` form when no
 * reason is needed, or this object to surface *why* access was denied.
 */
export interface CanResult {
    /** Whether the action is permitted. */
    can: boolean;
    /** Human-readable explanation, typically present when `can` is `false`. */
    reason?: string;
}

/**
 * A pluggable access-control strategy. Implementations decide whether a given
 * action is allowed, returning a plain boolean, a {@link CanResult}, or a
 * promise of either (for async sources such as a remote policy server).
 */
export interface AccessControl {
    /**
     * Resolve whether the described action is permitted.
     *
     * @param params - The action/resource being checked.
     * @returns `true`/`false`, a {@link CanResult}, or a promise of either.
     */
    can: (params: CanParams) => boolean | CanResult | Promise<boolean | CanResult>;
}
