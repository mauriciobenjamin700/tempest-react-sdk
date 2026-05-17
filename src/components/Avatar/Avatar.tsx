import { useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import styles from "./Avatar.module.css";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarStatus = "online" | "offline" | "busy";

export interface AvatarProps {
    src?: string;
    alt?: string;
    name?: string;
    size?: AvatarSize;
    status?: AvatarStatus;
    className?: string;
    onClick?: () => void;
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0]!.slice(0, 2);
    return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`;
}

/**
 * Round avatar. Falls back to colored initials when the image fails to load
 * or no `src` is provided. Optional status dot in the bottom-right corner.
 */
export function Avatar({
    src,
    alt,
    name = "",
    size = "md",
    status,
    className,
    onClick,
}: AvatarProps) {
    const [errored, setErrored] = useState<boolean>(false);
    const initials = useMemo(() => getInitials(name), [name]);

    const showImage = src && !errored;
    const role = onClick ? "button" : undefined;
    const tabIndex = onClick ? 0 : undefined;

    return (
        <span
            className={cn(styles.avatar, styles[size], status && styles.status, className)}
            role={role}
            tabIndex={tabIndex}
            onClick={onClick}
            onKeyDown={
                onClick
                    ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onClick();
                          }
                      }
                    : undefined
            }
        >
            {showImage ? (
                <img
                    src={src}
                    alt={alt ?? name}
                    className={styles.image}
                    onError={() => setErrored(true)}
                />
            ) : (
                <span aria-label={alt ?? name}>{initials}</span>
            )}
            {status && <span className={cn(styles.dot, styles[status])} aria-hidden />}
        </span>
    );
}
