import type { ReactNode } from "react";

import { ContextMenu, type ContextMenuItem } from "../ContextMenu";

export interface ChatActionsMenuProps {
    /** Actions for this message. */
    items: ContextMenuItem[];
    /** Which pointer gesture opens it — the bubble uses the right click, the ⋮ the left. */
    trigger: "contextmenu" | "click";
    /** The bubble, or the ⋮ button. */
    children: ReactNode;
}

/**
 * The bridge from a message to the SDK's context menu.
 *
 * A separate module, reached through `lazy()` from the bubble, because
 * `ContextMenu` pulls `Portal` and its own geometry — measured, that is 3.07 kB
 * brotli — and a support thread or a comment list passes no `messageActions` at
 * all. Keeping it behind the dynamic import is what lets a text-only thread stay
 * the size it was.
 *
 * @param props - The items, the gesture and the trigger content.
 * @returns The content wrapped in a context menu.
 */
export function ChatActionsMenu({ items, trigger, children }: ChatActionsMenuProps) {
    return (
        <ContextMenu items={items} trigger={trigger}>
            {children}
        </ContextMenu>
    );
}
