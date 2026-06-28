import { useCallback, useMemo, useState } from "react";

export interface DisclosureHandlers {
    open: () => void;
    close: () => void;
    toggle: () => void;
}

/**
 * Manage open/closed boolean state with stable `open`/`close`/`toggle` handlers.
 *
 * Richer than {@link useToggle} for UI elements like modals, drawers and
 * popovers: the handlers are referentially stable across renders.
 *
 * @param initial - initial opened state (default `false`).
 * @returns Tuple `[opened, { open, close, toggle }]`.
 */
export function useDisclosure(initial = false): [boolean, DisclosureHandlers] {
    const [opened, setOpened] = useState<boolean>(initial);

    const open = useCallback((): void => setOpened(true), []);
    const close = useCallback((): void => setOpened(false), []);
    const toggle = useCallback((): void => setOpened((current) => !current), []);

    const handlers = useMemo<DisclosureHandlers>(
        () => ({ open, close, toggle }),
        [open, close, toggle],
    );

    return [opened, handlers];
}
