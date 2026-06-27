import type { ImgHTMLAttributes } from "react";
import { useState } from "react";
import { cn } from "@/utils/cn";
import styles from "./Image.module.css";

export interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
    /** Primary image source URL. */
    src: string;
    /** Fallback source swapped in once if the primary `src` fails to load. */
    fallback?: string;
    /** Alternative text describing the image (required for accessibility). */
    alt: string;
    /** When true (default) uses native lazy loading; otherwise loads eagerly. */
    lazy?: boolean;
}

/**
 * Renders an `<img>` with native lazy loading and a one-shot fallback.
 *
 * On the first load error the source is swapped to `fallback` (when provided),
 * guarded so a failing fallback cannot loop the `onError` handler.
 *
 * @param src - The primary image source URL.
 * @param fallback - Optional source used once when `src` fails to load.
 * @param alt - Accessible alternative text for the image.
 * @param lazy - Whether to use `loading="lazy"` (default `true`).
 * @returns The rendered image element.
 */
export function Image({
    src,
    fallback,
    alt,
    lazy = true,
    className,
    onError,
    ...props
}: ImageProps) {
    const [currentSrc, setCurrentSrc] = useState<string>(src);
    const [usedFallback, setUsedFallback] = useState<boolean>(false);

    return (
        <img
            src={currentSrc}
            alt={alt}
            loading={lazy ? "lazy" : "eager"}
            className={cn(styles.image, className)}
            onError={(event) => {
                if (fallback && !usedFallback && currentSrc !== fallback) {
                    setUsedFallback(true);
                    setCurrentSrc(fallback);
                }
                onError?.(event);
            }}
            {...props}
        />
    );
}
