import { Fragment } from "react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { vettedHref } from "@/utils/safe-url";
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
 *
 * Each `href` is vetted with `safeLinkUrl`'s allowlist: an item whose URL uses a scheme
 * outside `http:`/`https:`/`mailto:`/`tel:`/`sms:` loses the `href`, and renders
 * as text unless it also has an `onClick`. A trail built from API data — the
 * folder names of a document tree — would otherwise put a clickable
 * `javascript:` link on the page under React 18, which writes it verbatim.
 */
export function Breadcrumbs({ items, separator = "/", className }: BreadcrumbsProps) {
    return (
        <nav aria-label="breadcrumb" className={cn(styles.nav, className)}>
            {items.map((item, index) => {
                const isLast = index === items.length - 1;
                const href = vettedHref(item.href);
                const interactive = !isLast && (href || item.onClick);
                return (
                    <Fragment key={index}>
                        <span className={styles.item}>
                            {interactive ? (
                                <a
                                    href={href}
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
