import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./Kbd.module.css";

export type KbdSize = "sm" | "md" | "lg";

export interface KbdProps extends HTMLAttributes<HTMLElement> {
    size?: KbdSize;
}

/**
 * Renders a `<kbd>` styled like a keyboard key — useful for shortcut hints.
 * Compose multiple keys by rendering siblings: `<Kbd>Ctrl</Kbd> + <Kbd>K</Kbd>`.
 */
export function Kbd({ size = "md", className, children, ...props }: KbdProps) {
    return (
        <kbd className={cn(styles.kbd, styles[size], className)} {...props}>
            {children}
        </kbd>
    );
}
