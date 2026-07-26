import { useCallback, useEffect, useMemo, useState } from "react";

/** One entry in the inbox. */
export interface NotificationItem {
    /** Stable id. Re-adding an existing id updates that entry instead of duplicating it. */
    id: string;
    title: string;
    /** Body text. Optional — a title-only notification is a legitimate shape. */
    body?: string;
    /** Epoch milliseconds. Used for ordering and for the relative timestamp. */
    receivedAt: number;
    read?: boolean;
    /** Where activating the notification should take the user. */
    url?: string;
    /** Free-form payload the app passes through, e.g. the entity it refers to. */
    data?: Record<string, unknown>;
}

export interface UseNotificationInboxOptions {
    /** Entries the inbox starts with — typically what the API returned. */
    initialItems?: readonly NotificationItem[];
    /**
     * Listen for `message` events from the service worker and add whatever
     * arrives. Default `true`.
     *
     * This is the missing half of web push: a service worker runs outside the
     * page and cannot touch React state, so a push that arrives while the app is
     * open shows an OS notification and then vanishes as far as the UI is
     * concerned. Have the worker `postMessage` the payload and it lands here.
     */
    listenToServiceWorker?: boolean;
    /**
     * Message `type` to accept from the worker. Default `"tempest:notification"`.
     *
     * Filtering by type matters because the SW message channel is shared — a
     * sync-progress ping or a cache-updated notice would otherwise show up in the
     * user's inbox.
     */
    messageType?: string;
    /**
     * Cap on stored entries; the oldest are dropped past it. Default `100`.
     *
     * An inbox fed by push grows without bound otherwise, and it lives in memory.
     */
    limit?: number;
    /** Called whenever the list changes — the hook for persisting it. */
    onChange?: (items: readonly NotificationItem[]) => void;
}

export interface UseNotificationInboxResult {
    items: NotificationItem[];
    unreadCount: number;
    /** Add an entry, or update the existing one with the same id. */
    add: (item: NotificationItem) => void;
    markRead: (id: string) => void;
    markUnread: (id: string) => void;
    markAllRead: () => void;
    remove: (id: string) => void;
    clear: () => void;
}

/** Coerce an unknown service-worker payload into an inbox entry. */
function toItem(payload: Record<string, unknown>, index: number): NotificationItem | null {
    const title = typeof payload.title === "string" ? payload.title : null;
    if (!title) return null;
    return {
        id: typeof payload.id === "string" ? payload.id : `sw-${payload.tag ?? index}-${title}`,
        title,
        body: typeof payload.body === "string" ? payload.body : undefined,
        receivedAt:
            typeof payload.receivedAt === "number" ? payload.receivedAt : new Date().getTime(),
        url: typeof payload.url === "string" ? payload.url : undefined,
        data: (payload.data as Record<string, unknown> | undefined) ?? undefined,
        read: false,
    };
}

/**
 * Client-side inbox state for received notifications.
 *
 * Newest first, deduplicated by `id`, capped at `limit`. Pairs with
 * `NotificationCenter` for the UI and with the `push` module for the source:
 * point a service worker's `postMessage` at it and a push that arrives while the
 * app is open shows up in the inbox instead of only as an OS notification.
 *
 * Persistence is deliberately left out — where an inbox belongs (server, Dexie,
 * `localStorage`) is an app decision. Use `onChange` to write it wherever it goes,
 * and `initialItems` to read it back.
 *
 * @example
 * const inbox = useNotificationInbox({
 *     initialItems: await api.notifications.list(),
 *     onChange: (items) => storage.set("inbox", items),
 * });
 *
 * <NotificationCenter
 *     items={inbox.items}
 *     onMarkRead={inbox.markRead}
 *     onMarkAllRead={inbox.markAllRead}
 *     onDismiss={inbox.remove}
 * />
 */
export function useNotificationInbox(
    options: UseNotificationInboxOptions = {},
): UseNotificationInboxResult {
    const {
        initialItems = [],
        listenToServiceWorker = true,
        messageType = "tempest:notification",
        limit = 100,
        onChange,
    } = options;

    const [items, setItems] = useState<NotificationItem[]>(() =>
        [...initialItems].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, limit),
    );

    const update = useCallback(
        (next: (current: NotificationItem[]) => NotificationItem[]) => {
            setItems((current) => {
                const result = next(current);
                onChange?.(result);
                return result;
            });
        },
        [onChange],
    );

    const add = useCallback(
        (item: NotificationItem) => {
            update((current) => {
                const without = current.filter((entry) => entry.id !== item.id);
                return [item, ...without]
                    .sort((a, b) => b.receivedAt - a.receivedAt)
                    .slice(0, limit);
            });
        },
        [update, limit],
    );

    const setRead = useCallback(
        (id: string, read: boolean) => {
            update((current) =>
                current.map((entry) => (entry.id === id ? { ...entry, read } : entry)),
            );
        },
        [update],
    );

    const markRead = useCallback((id: string) => setRead(id, true), [setRead]);
    const markUnread = useCallback((id: string) => setRead(id, false), [setRead]);

    const markAllRead = useCallback(() => {
        update((current) => current.map((entry) => ({ ...entry, read: true })));
    }, [update]);

    const remove = useCallback(
        (id: string) => {
            update((current) => current.filter((entry) => entry.id !== id));
        },
        [update],
    );

    const clear = useCallback(() => update(() => []), [update]);

    useEffect(() => {
        if (!listenToServiceWorker) return;
        if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

        /**
         * Captured, not re-read in the cleanup.
         *
         * Looking `navigator.serviceWorker` up again at teardown throws if it is
         * gone by then, and the listener would leak either way — the container has
         * to be the same object the listener was added to.
         */
        const container = navigator.serviceWorker;

        const handler = (event: MessageEvent) => {
            const payload = event.data as Record<string, unknown> | null;
            if (!payload || payload.type !== messageType) return;
            const raw = (payload.notification ?? payload.payload ?? payload) as Record<
                string,
                unknown
            >;
            const item = toItem(raw, 0);
            if (item) add(item);
        };

        container.addEventListener("message", handler);
        return () => container.removeEventListener("message", handler);
    }, [listenToServiceWorker, messageType, add]);

    const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

    return { items, unreadCount, add, markRead, markUnread, markAllRead, remove, clear };
}
