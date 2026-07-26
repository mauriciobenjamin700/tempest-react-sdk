import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/utils/cn";
import { relativeTime, type RelativeTimeLocale } from "@/utils/relative-time";

import { Badge } from "../Badge";
import { EmptyState } from "../EmptyState";
import type { NotificationItem } from "./use-notification-inbox";
import styles from "./NotificationCenter.module.css";

/**
 * DOM attributes this component redefines.
 *
 * `title` becomes a rendered heading node instead of a tooltip string, and
 * `onSelect` becomes "an entry was activated" instead of the DOM text-selection
 * event. Both would be type errors if merged, and silently confusing if allowed
 * through.
 */
type OverriddenDomProps = "children" | "title" | "onSelect";

export interface NotificationCenterProps extends Omit<
    HTMLAttributes<HTMLDivElement>,
    OverriddenDomProps
> {
    /** Entries to show. Rendered in the order given — `useNotificationInbox` sorts newest first. */
    items: readonly NotificationItem[];
    /**
     * Panel heading. Pass `null` to render the list with no header.
     *
     * Widened from the DOM `title` attribute (a `string`) on purpose: this is a
     * rendered heading, not a tooltip, so it takes a node.
     */
    title?: ReactNode;
    /** Activate an entry: click, `Enter` or `Space`. Also marks it read when `onMarkRead` is set. */
    onSelect?: (item: NotificationItem) => void;
    /** Mark one entry as read. Enables the per-item read control. */
    onMarkRead?: (id: string) => void;
    /** Mark every entry as read. Enables the header action. */
    onMarkAllRead?: () => void;
    /** Remove one entry. Enables the per-item dismiss control. */
    onDismiss?: (id: string) => void;
    /** Icon rendered at the leading edge of each row — an `<Icon name={…} />`, say. */
    renderIcon?: (item: NotificationItem) => ReactNode;
    /** Locale for the relative timestamps. Default `"pt-BR"`. */
    locale?: RelativeTimeLocale;
    /** Shown when `items` is empty. */
    emptyState?: ReactNode;
    /** Reference point for the relative timestamps. Default: now, at render time. */
    now?: number;
}

/**
 * Inbox panel for notifications the app has received.
 *
 * Deliberately presentational and controlled: it takes a list and emits intent.
 * Where the list comes from — an API, a service-worker push, `localStorage` — and
 * where read state is written are app decisions, and a component that assumed any
 * of them would be wrong for most apps. `useNotificationInbox` is the companion
 * that holds the state, including the service-worker bridge.
 *
 * It is also just the panel, not a popover: apps mount it inside their own
 * `Popover`, `Drawer` or route. That keeps one component from owning both the
 * inbox and a positioning strategy.
 *
 * @example
 * const inbox = useNotificationInbox();
 *
 * <Popover trigger={<Button>Notificações ({inbox.unreadCount})</Button>}>
 *     <NotificationCenter
 *         items={inbox.items}
 *         onMarkRead={inbox.markRead}
 *         onMarkAllRead={inbox.markAllRead}
 *         onDismiss={inbox.remove}
 *         onSelect={(item) => item.url && navigate(item.url)}
 *     />
 * </Popover>
 */
export function NotificationCenter({
    items,
    title = "Notificações",
    onSelect,
    onMarkRead,
    onMarkAllRead,
    onDismiss,
    renderIcon,
    locale = "pt-BR",
    emptyState,
    now,
    className,
    ...rest
}: NotificationCenterProps) {
    const unreadCount = items.filter((item) => !item.read).length;
    const reference = now ?? new Date().getTime();

    /**
     * Activate an entry.
     *
     * Reading a notification is implied by opening it, so activation marks it read
     * as well — otherwise every app would have to remember to call both, and the
     * unread badge would keep counting something the user already saw.
     */
    const activate = (item: NotificationItem): void => {
        if (!item.read) onMarkRead?.(item.id);
        onSelect?.(item);
    };

    const interactive = Boolean(onSelect || onMarkRead);

    return (
        <div className={cn(styles.panel, className)} {...rest}>
            {(title || (onMarkAllRead && unreadCount > 0)) && (
                <header className={styles.header}>
                    {title ? (
                        <h2 className={styles.title}>
                            {title}
                            {unreadCount > 0 && (
                                <Badge variant="primary" aria-label={`${unreadCount} não lidas`}>
                                    {unreadCount}
                                </Badge>
                            )}
                        </h2>
                    ) : (
                        <span />
                    )}
                    {onMarkAllRead && unreadCount > 0 && (
                        <button
                            type="button"
                            className={styles.headerAction}
                            onClick={onMarkAllRead}
                        >
                            Marcar todas como lidas
                        </button>
                    )}
                </header>
            )}

            {items.length === 0 ? (
                (emptyState ?? <EmptyState title="Nenhuma notificação" />)
            ) : (
                <ul className={styles.list}>
                    {items.map((item) => (
                        <li
                            key={item.id}
                            className={cn(styles.item, !item.read && styles.unread)}
                            aria-current={!item.read ? "true" : undefined}
                        >
                            {renderIcon && <span className={styles.icon}>{renderIcon(item)}</span>}

                            <div className={styles.body}>
                                {interactive ? (
                                    <button
                                        type="button"
                                        className={styles.trigger}
                                        onClick={() => activate(item)}
                                    >
                                        <span className={styles.itemTitle}>{item.title}</span>
                                        {item.body && (
                                            <span className={styles.itemBody}>{item.body}</span>
                                        )}
                                    </button>
                                ) : (
                                    <>
                                        <span className={styles.itemTitle}>{item.title}</span>
                                        {item.body && (
                                            <span className={styles.itemBody}>{item.body}</span>
                                        )}
                                    </>
                                )}
                                <time
                                    className={styles.time}
                                    dateTime={new Date(item.receivedAt).toISOString()}
                                >
                                    {relativeTime(item.receivedAt, { locale, now: reference })}
                                </time>
                            </div>

                            {onDismiss && (
                                <button
                                    type="button"
                                    className={styles.dismiss}
                                    onClick={() => onDismiss(item.id)}
                                    aria-label={`Descartar: ${item.title}`}
                                >
                                    ×
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
