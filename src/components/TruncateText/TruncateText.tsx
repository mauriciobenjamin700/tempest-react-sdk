import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./TruncateText.module.css";

export interface TruncateTextProps extends HTMLAttributes<HTMLDivElement> {
    /** Maximum number of lines to show before clamping. Defaults to 1. */
    lines?: number;
    /** Content to clamp. */
    children: ReactNode;
}

/**
 * Clamp text to a fixed number of lines using a CSS line-clamp, adding an
 * ellipsis on overflow. The line count is driven by the
 * `--tempest-clamp-lines` custom property.
 *
 * @example
 * <TruncateText lines={2}>{longDescription}</TruncateText>
 */
export function TruncateText({
    lines = 1,
    className,
    style,
    children,
    ...props
}: TruncateTextProps) {
    const mergedStyle = {
        ...style,
        "--tempest-clamp-lines": lines,
    } as CSSProperties;

    return (
        <div className={cn(styles.clamp, className)} style={mergedStyle} {...props}>
            {children}
        </div>
    );
}
