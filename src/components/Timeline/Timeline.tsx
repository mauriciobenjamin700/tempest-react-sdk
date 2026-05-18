import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Timeline.module.css";

export type TimelineMarker = "primary" | "success" | "warning" | "danger" | "neutral";

export interface TimelineItem {
    /** Stable identifier (used as React key). */
    id: string;
    /** Title rendered as the entry headline. */
    title: ReactNode;
    /** Optional subtitle / description below the title. */
    description?: ReactNode;
    /** Right-aligned meta column (timestamps, durations). */
    meta?: ReactNode;
    /** Optional custom icon rendered inside the marker. */
    icon?: ReactNode;
    /** Marker color. Default `"primary"`. */
    marker?: TimelineMarker;
}

export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {
    items: TimelineItem[];
    /** Show the connecting line between markers. Default `true`. */
    connector?: boolean;
}

/**
 * Vertical event timeline — activity feeds, order trackers, audit logs.
 * Each entry has a marker (color or custom icon), title, optional
 * description and right-aligned meta column.
 *
 * @example
 * <Timeline items={[
 *     { id: "1", title: "Pedido criado", meta: "10:24", marker: "primary" },
 *     { id: "2", title: "Aprovação", meta: "10:25", marker: "success" },
 *     { id: "3", title: "Saiu pra entrega", meta: "11:00", marker: "warning" },
 * ]} />
 */
export function Timeline({ items, connector = true, className, ...props }: TimelineProps) {
    return (
        <ol className={cn(styles.timeline, connector && styles.connector, className)} {...props}>
            {items.map((item, index) => {
                const isLast = index === items.length - 1;
                return (
                    <li key={item.id} className={styles.item}>
                        <div className={styles.markerColumn}>
                            <span
                                className={cn(
                                    styles.marker,
                                    styles[`marker-${item.marker ?? "primary"}`],
                                )}
                                aria-hidden="true"
                            >
                                {item.icon}
                            </span>
                            {connector && !isLast && (
                                <span className={styles.line} aria-hidden="true" />
                            )}
                        </div>
                        <div className={styles.body}>
                            <div className={styles.row}>
                                <span className={styles.title}>{item.title}</span>
                                {item.meta && <span className={styles.meta}>{item.meta}</span>}
                            </div>
                            {item.description && (
                                <p className={styles.description}>{item.description}</p>
                            )}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
