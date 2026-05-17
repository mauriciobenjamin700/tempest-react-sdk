import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Divider.module.css";

export type DividerOrientation = "horizontal" | "vertical";
export type DividerVariant = "solid" | "dashed";
export type DividerAlign = "start" | "center" | "end";

export interface DividerProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    orientation?: DividerOrientation;
    variant?: DividerVariant;
    /** Optional label rendered inside the divider (horizontal only). */
    label?: ReactNode;
    /** Label horizontal position (only when `label` provided). Defaults to `center`. */
    align?: DividerAlign;
}

/**
 * Horizontal or vertical visual separator. When `label` is provided in
 * horizontal mode the divider splits and centers the label between two lines.
 */
export function Divider({
    orientation = "horizontal",
    variant = "solid",
    label,
    align = "center",
    className,
    ...props
}: DividerProps) {
    if (orientation === "vertical") {
        return (
            <span
                role="separator"
                aria-orientation="vertical"
                className={cn(
                    styles.divider,
                    styles.vertical,
                    variant === "dashed" && styles.dashed,
                    className,
                )}
                {...props}
            />
        );
    }

    if (!label) {
        return (
            <hr
                className={cn(
                    styles.divider,
                    styles.horizontal,
                    styles.bare,
                    variant === "dashed" && styles.dashed,
                    className,
                )}
            />
        );
    }

    return (
        <div
            role="separator"
            aria-orientation="horizontal"
            className={cn(
                styles.divider,
                styles.horizontal,
                variant === "dashed" && styles.dashed,
                align === "start" && styles.alignStart,
                align === "end" && styles.alignEnd,
                className,
            )}
            {...props}
        >
            {label}
        </div>
    );
}
