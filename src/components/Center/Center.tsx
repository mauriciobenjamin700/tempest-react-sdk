import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Center.module.css";

export type CenterAxis = "both" | "horizontal" | "vertical";

export interface CenterProps extends HTMLAttributes<HTMLDivElement> {
    /** Which axis to center on. Default `"both"`. */
    axis?: CenterAxis;
    /** Fixed height for the container. Numbers map to `${n}px`; strings pass through. Useful when centering inside an unsized parent. */
    minHeight?: number | string;
    /** When `true` (default), takes up `100%` width of the parent. */
    fullWidth?: boolean;
    children?: ReactNode;
}

/**
 * Center children horizontally, vertically, or both. Flex-based; works with
 * any child size. Pair with `minHeight` (or set parent height) when
 * centering vertically.
 *
 * @example
 * <Center axis="both" minHeight="100vh">
 *     <Spinner />
 * </Center>
 */
export function Center({
    axis = "both",
    minHeight,
    fullWidth = true,
    className,
    style,
    children,
    ...props
}: CenterProps) {
    const finalStyle: CSSProperties = {
        ...(minHeight !== undefined
            ? { minHeight: typeof minHeight === "number" ? `${minHeight}px` : minHeight }
            : null),
        ...(fullWidth ? { width: "100%" } : null),
        ...style,
    };
    return (
        <div className={cn(styles.center, styles[axis], className)} style={finalStyle} {...props}>
            {children}
        </div>
    );
}
