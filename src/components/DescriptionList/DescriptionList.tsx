import type { HTMLAttributes, ReactNode } from "react";
import { Fragment } from "react";
import { cn } from "@/utils/cn";
import styles from "./DescriptionList.module.css";

export interface DescriptionListItem {
    /** The key/label rendered inside a `<dt>`. */
    term: ReactNode;
    /** The value rendered inside a `<dd>`. */
    description: ReactNode;
}

export interface DescriptionListProps extends HTMLAttributes<HTMLDListElement> {
    /** Term/description pairs rendered as `<dt>`/`<dd>` rows. */
    items: DescriptionListItem[];
}

/**
 * Renders a semantic `<dl>` of term/description pairs with minimal
 * token-based key/value styling.
 *
 * @param items - The term/description pairs to render.
 * @returns The rendered description list.
 */
export function DescriptionList({ items, className, ...props }: DescriptionListProps) {
    return (
        <dl className={cn(styles.list, className)} {...props}>
            {items.map((item, index) => (
                <Fragment key={index}>
                    <dt className={styles.term}>{item.term}</dt>
                    <dd className={styles.description}>{item.description}</dd>
                </Fragment>
            ))}
        </dl>
    );
}
