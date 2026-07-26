import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNotificationInbox, type NotificationItem } from "./use-notification-inbox";

const NOW = new Date("2026-07-26T12:00:00Z").getTime();

const item = (id: string, offsetMs = 0, read = false): NotificationItem => ({
    id,
    title: `Título ${id}`,
    receivedAt: NOW - offsetMs,
    read,
});

describe("useNotificationInbox — state", () => {
    it("starts empty with no options", () => {
        const { result } = renderHook(() => useNotificationInbox({ listenToServiceWorker: false }));
        expect(result.current.items).toEqual([]);
        expect(result.current.unreadCount).toBe(0);
    });

    it("sorts initialItems newest first", () => {
        const { result } = renderHook(() =>
            useNotificationInbox({
                listenToServiceWorker: false,
                initialItems: [item("old", 60_000), item("new", 0)],
            }),
        );
        expect(result.current.items.map((i) => i.id)).toEqual(["new", "old"]);
    });

    it("adds an entry at the front", () => {
        const { result } = renderHook(() =>
            useNotificationInbox({ listenToServiceWorker: false, initialItems: [item("a", 5000)] }),
        );
        act(() => result.current.add(item("b", 0)));
        expect(result.current.items.map((i) => i.id)).toEqual(["b", "a"]);
    });

    it("updates in place when an id is re-added, instead of duplicating", () => {
        const { result } = renderHook(() =>
            useNotificationInbox({ listenToServiceWorker: false, initialItems: [item("a", 5000)] }),
        );
        act(() => result.current.add({ ...item("a", 0), title: "Atualizado" }));
        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].title).toBe("Atualizado");
    });

    it("drops the oldest past the limit", () => {
        const { result } = renderHook(() =>
            useNotificationInbox({ listenToServiceWorker: false, limit: 2 }),
        );
        act(() => {
            result.current.add(item("a", 2000));
            result.current.add(item("b", 1000));
            result.current.add(item("c", 0));
        });
        expect(result.current.items.map((i) => i.id)).toEqual(["c", "b"]);
    });

    it("applies the limit to initialItems too", () => {
        const { result } = renderHook(() =>
            useNotificationInbox({
                listenToServiceWorker: false,
                limit: 1,
                initialItems: [item("a", 1000), item("b", 0)],
            }),
        );
        expect(result.current.items.map((i) => i.id)).toEqual(["b"]);
    });
});

describe("useNotificationInbox — read state", () => {
    it("counts only the unread", () => {
        const { result } = renderHook(() =>
            useNotificationInbox({
                listenToServiceWorker: false,
                initialItems: [item("a", 0), item("b", 1000, true)],
            }),
        );
        expect(result.current.unreadCount).toBe(1);
    });

    it("marks one read and back to unread", () => {
        const { result } = renderHook(() =>
            useNotificationInbox({ listenToServiceWorker: false, initialItems: [item("a")] }),
        );
        act(() => result.current.markRead("a"));
        expect(result.current.unreadCount).toBe(0);
        act(() => result.current.markUnread("a"));
        expect(result.current.unreadCount).toBe(1);
    });

    it("marks everything read", () => {
        const { result } = renderHook(() =>
            useNotificationInbox({
                listenToServiceWorker: false,
                initialItems: [item("a"), item("b", 1000)],
            }),
        );
        act(() => result.current.markAllRead());
        expect(result.current.unreadCount).toBe(0);
    });

    it("ignores an unknown id", () => {
        const { result } = renderHook(() =>
            useNotificationInbox({ listenToServiceWorker: false, initialItems: [item("a")] }),
        );
        act(() => result.current.markRead("nope"));
        expect(result.current.unreadCount).toBe(1);
    });
});

describe("useNotificationInbox — removal and onChange", () => {
    it("removes one entry and clears them all", () => {
        const { result } = renderHook(() =>
            useNotificationInbox({
                listenToServiceWorker: false,
                initialItems: [item("a"), item("b", 1000)],
            }),
        );
        act(() => result.current.remove("a"));
        expect(result.current.items.map((i) => i.id)).toEqual(["b"]);
        act(() => result.current.clear());
        expect(result.current.items).toEqual([]);
    });

    it("reports every change, so the caller can persist the list", () => {
        const onChange = vi.fn();
        const { result } = renderHook(() =>
            useNotificationInbox({ listenToServiceWorker: false, onChange }),
        );
        act(() => result.current.add(item("a")));
        act(() => result.current.markRead("a"));
        act(() => result.current.remove("a"));
        expect(onChange).toHaveBeenCalledTimes(3);
        expect(onChange.mock.calls[2][0]).toEqual([]);
    });
});

describe("useNotificationInbox — service-worker bridge", () => {
    let listener: ((event: MessageEvent) => void) | null = null;

    beforeEach(() => {
        listener = null;
        Object.defineProperty(navigator, "serviceWorker", {
            configurable: true,
            value: {
                addEventListener: (_type: string, handler: (event: MessageEvent) => void) => {
                    listener = handler;
                },
                removeEventListener: () => {
                    listener = null;
                },
            },
        });
    });

    afterEach(() => {
        Reflect.deleteProperty(navigator, "serviceWorker");
    });

    /** Deliver a message as the service worker would. */
    function post(data: unknown): void {
        act(() => listener?.({ data } as MessageEvent));
    }

    it("adds a notification posted by the worker", () => {
        const { result } = renderHook(() => useNotificationInbox());
        post({
            type: "tempest:notification",
            notification: { id: "sw-1", title: "Push chegou", body: "corpo" },
        });
        expect(result.current.items[0]).toMatchObject({
            id: "sw-1",
            title: "Push chegou",
            body: "corpo",
            read: false,
        });
    });

    it("accepts a flat payload as well as a nested one", () => {
        const { result } = renderHook(() => useNotificationInbox());
        post({ type: "tempest:notification", id: "flat", title: "Direto" });
        expect(result.current.items[0].id).toBe("flat");
    });

    it("ignores a message of another type, so the shared SW channel is not an inbox", () => {
        const { result } = renderHook(() => useNotificationInbox());
        post({ type: "tempest:sync-progress", title: "Sincronizando" });
        expect(result.current.items).toEqual([]);
    });

    it("honours a custom messageType", () => {
        const { result } = renderHook(() => useNotificationInbox({ messageType: "app:notify" }));
        post({ type: "app:notify", title: "Custom" });
        expect(result.current.items).toHaveLength(1);
    });

    it("ignores a payload with no title", () => {
        const { result } = renderHook(() => useNotificationInbox());
        post({ type: "tempest:notification", body: "sem título" });
        expect(result.current.items).toEqual([]);
    });

    it("ignores an empty message", () => {
        const { result } = renderHook(() => useNotificationInbox());
        post(null);
        expect(result.current.items).toEqual([]);
    });

    it("does not subscribe when the bridge is off", () => {
        renderHook(() => useNotificationInbox({ listenToServiceWorker: false }));
        expect(listener).toBeNull();
    });

    it("unsubscribes on unmount", () => {
        const { unmount } = renderHook(() => useNotificationInbox());
        expect(listener).not.toBeNull();
        unmount();
        expect(listener).toBeNull();
    });
});

describe("useNotificationInbox — no service worker available", () => {
    it("mounts without throwing", () => {
        const { result } = renderHook(() => useNotificationInbox());
        expect(result.current.items).toEqual([]);
    });
});
