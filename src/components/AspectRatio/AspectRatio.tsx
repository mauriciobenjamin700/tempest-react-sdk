import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./AspectRatio.module.css";

export interface AspectRatioProps extends HTMLAttributes<HTMLDivElement> {
    /**
     * Width-to-height ratio. Pass `16/9` for widescreen, `1` for square,
     * `4/3` for SD video, `3/4` for portrait, etc. Default `16/9`.
     */
    ratio?: number;
    children?: ReactNode;
}

/**
 * Preserve a constant aspect ratio for media (images, video, embeds). The
 * inner child stretches to fill the box. Uses the native `aspect-ratio`
 * CSS property — works on all modern browsers (Safari 15+, Chrome 88+).
 *
 * @example
 * <AspectRatio ratio={16 / 9}>
 *     <img src="/cover.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
 * </AspectRatio>
 */
export function AspectRatio({
    ratio = 16 / 9,
    className,
    style,
    children,
    ...props
}: AspectRatioProps) {
    const finalStyle: CSSProperties = { aspectRatio: String(ratio), ...style };
    return (
        <div className={cn(styles.aspect, className)} style={finalStyle} {...props}>
            {children}
        </div>
    );
}
