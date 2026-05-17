import { Fragment } from "react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Breadcrumbs.module.css";

export interface BreadcrumbItem {
    label: ReactNode;
    href?: string;
    onClick?: () => void;
}

export interface BreadcrumbsProps {
    items: BreadcrumbItem[];
    separator?: ReactNode;
    className?: string;
}

/**
 * Hierarchical navigation breadcrumbs. The last item is rendered as plain
 * text with `aria-current="page"`. Items with neither `href` nor `onClick`
 * also render as text (intermediate but non-clickable).
 */
export function Breadcrumbs({ items, separator = "/", className }: BreadcrumbsProps) {
    return (
        <nav aria-label="breadcrumb" className={cn(styles.nav, className)}>
            {items.map((item, index) => {
                const isLast = index === items.length - 1;
                const interactive = !isLast && (item.href || item.onClick);
                return (
                    <Fragment key={index}>
                        <span className={styles.item}>
                            {interactive ? (
                                <a
                                    href={item.href}
                                    onClick={(event) => {
                                        if (item.onClick) {
                                            event.preventDefault();
                                            item.onClick();
                                        }
                                    }}
                                    className={styles.link}
                                >
                                    {item.label}
                                </a>
                            ) : (
                                <span
                                    aria-current={isLast ? "page" : undefined}
                                    className={isLast ? styles.current : undefined}
                                >
                                    {item.label}
                                </span>
                            )}
                        </span>
                        {!isLast && (
                            <span className={styles.separator} aria-hidden>
                                {separator}
                            </span>
                        )}
                    </Fragment>
                );
            })}
        </nav>
    );
}
