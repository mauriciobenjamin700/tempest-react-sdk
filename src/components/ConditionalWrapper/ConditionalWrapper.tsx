import type { ReactNode } from "react";

export interface ConditionalWrapperProps {
    /** When `true`, the children are passed through `wrapper`. */
    condition: boolean;
    /** Wrapping function applied to the children when `condition` is `true`. */
    wrapper: (children: ReactNode) => ReactNode;
    /** Content that may be wrapped. */
    children: ReactNode;
}

/**
 * Conditionally wraps its children with `wrapper`.
 *
 * Renders `wrapper(children)` when `condition` is `true`, otherwise renders the
 * children unchanged. Avoids duplicating a subtree just to add an optional
 * wrapping element (e.g. a link, tooltip or boundary).
 *
 * @param props - The conditional-wrapper props.
 * @returns The wrapped children when `condition` is `true`, else the children.
 */
export function ConditionalWrapper({
    condition,
    wrapper,
    children,
}: ConditionalWrapperProps): ReactNode {
    return condition ? wrapper(children) : <>{children}</>;
}
