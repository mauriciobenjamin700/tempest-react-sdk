import { useEffect, useState } from "react";
import { useAccessControl } from "./access-control-context";
import type { CanParams, CanResult } from "./types";

export interface UseCanResult {
    /** Whether the action is permitted. Defaults to `true` while loading is not the concern of the caller. */
    allowed: boolean;
    /** `true` while an async `can` check is pending. */
    isLoading: boolean;
    /** Optional explanation, typically present when `allowed` is `false`. */
    reason?: string;
}

function normalize(result: boolean | CanResult): CanResult {
    return typeof result === "boolean" ? { can: result } : result;
}

/**
 * Resolve an access check against the {@link AccessControl} in context.
 *
 * Handles sync booleans, sync {@link CanResult}, and promises of either. When
 * no provider is present, access is allowed (see `useAccessControl`). The check
 * re-runs whenever the params change.
 *
 * @param params - The action/resource being checked.
 */
export function useCan(params: CanParams): UseCanResult {
    const control = useAccessControl();
    const paramsKey = JSON.stringify(params);

    const [state, setState] = useState<UseCanResult>(() =>
        control ? { allowed: false, isLoading: true } : { allowed: true, isLoading: false },
    );

    useEffect(() => {
        if (!control) {
            setState({ allowed: true, isLoading: false });
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, isLoading: true }));

        Promise.resolve(control.can(params))
            .then((raw) => {
                if (cancelled) return;
                const result = normalize(raw);
                setState({ allowed: result.can, isLoading: false, reason: result.reason });
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                setState({
                    allowed: false,
                    isLoading: false,
                    reason: error instanceof Error ? error.message : "access check failed",
                });
            });

        return () => {
            cancelled = true;
        };
        // `paramsKey` is the stable stringified form of `params`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [control, paramsKey]);

    return state;
}
