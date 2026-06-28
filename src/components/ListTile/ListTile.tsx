import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./ListTile.module.css";

export interface ListTileProps {
    /** Left slot — typically an icon or avatar. */
    leading?: ReactNode;
    /** Primary line. Required. */
    title: ReactNode;
    /** Secondary line rendered under the title. */
    subtitle?: ReactNode;
    /** Right slot — typically an icon, switch or meta text. */
    trailing?: ReactNode;
    /** When provided, the tile becomes an interactive button. */
    onClick?: () => void;
    /** When true, the tile is dimmed and non-interactive. */
    disabled?: boolean;
    /** When true, the tile is highlighted as the active row. */
    selected?: boolean;
    /** Extra class names merged onto the root. */
    className?: string;
}

/**
 * The canonical Material list row: an optional leading slot, a title with an
 * optional subtitle, and an optional trailing slot. When `onClick` is supplied
 * the tile renders as a full-width, keyboard-accessible `<button>`; otherwise it
 * renders as a static `<div>`.
 *
 * @example
 * <ListTile
 *     leading={<User />}
 *     title="Maria Silva"
 *     subtitle="maria@example.com"
 *     trailing={<ChevronRight />}
 *     onClick={() => open(user)}
 * />
 */
export function ListTile({
    leading,
    title,
    subtitle,
    trailing,
    onClick,
    disabled = false,
    selected = false,
    className,
}: ListTileProps) {
    const content = (
        <>
            {leading !== undefined && <span className={styles.leading}>{leading}</span>}
            <span className={styles.body}>
                <span className={styles.title}>{title}</span>
                {subtitle !== undefined && <span className={styles.subtitle}>{subtitle}</span>}
            </span>
            {trailing !== undefined && <span className={styles.trailing}>{trailing}</span>}
        </>
    );

    const rootClassName = cn(
        styles.tile,
        selected && styles.selected,
        disabled && styles.disabled,
        className,
    );

    if (onClick) {
        return (
            <button
                type="button"
                className={cn(rootClassName, styles.interactive)}
                aria-pressed={selected ? true : undefined}
                disabled={disabled}
                onClick={onClick}
            >
                {content}
            </button>
        );
    }

    return <div className={rootClassName}>{content}</div>;
}
