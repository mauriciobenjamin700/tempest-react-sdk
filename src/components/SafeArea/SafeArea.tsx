import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./SafeArea.module.css";

export type SafeAreaEdge = "top" | "right" | "bottom" | "left";

export interface SafeAreaProps extends HTMLAttributes<HTMLDivElement> {
    /** Edges to pad. Default `["top","right","bottom","left"]` (all). */
    edges?: SafeAreaEdge[];
    /** Render as inline (use `display: contents`). */
    inline?: boolean;
    children?: ReactNode;
}

const ALL_EDGES: SafeAreaEdge[] = ["top", "right", "bottom", "left"];

/**
 * Apply `env(safe-area-inset-*)` padding so content avoids iOS notch /
 * Android navbar / device chrome. Wrap the outermost container of pages
 * with sticky headers/footers.
 *
 * @example
 * <SafeArea edges={["top"]}>
 *     <Navbar />
 * </SafeArea>
 */
export function SafeArea({
    edges = ALL_EDGES,
    inline = false,
    className,
    children,
    ...props
}: SafeAreaProps) {
    return (
        <div
            className={cn(
                styles.safe,
                inline && styles.inline,
                edges.includes("top") && styles.top,
                edges.includes("right") && styles.right,
                edges.includes("bottom") && styles.bottom,
                edges.includes("left") && styles.left,
                className,
            )}
            data-edges={edges.join(" ")}
            {...props}
        >
            {children}
        </div>
    );
}
