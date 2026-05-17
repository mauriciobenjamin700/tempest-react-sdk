import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
    variant?: "rect" | "text" | "circle";
    width?: number | string;
    height?: number | string;
    className?: string;
    style?: CSSProperties;
}

/** Loading placeholder block. Use `variant="text"` for inline lines, `circle` for avatars. */
export function Skeleton({ variant = "rect", width, height, className, style }: SkeletonProps) {
    return (
        <span
            aria-hidden
            className={cn(
                styles.skeleton,
                variant === "text" && styles.text,
                variant === "circle" && styles.circle,
                className,
            )}
            style={{ width, height, ...style }}
        />
    );
}
