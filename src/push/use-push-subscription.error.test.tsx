import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePushSubscription } from "./use-push-subscription";

describe("usePushSubscription error paths", () => {
    afterEach(() => {
        delete (globalThis as { Notification?: unknown }).Notification;
        delete (globalThis as { PushManager?: unknown }).PushManager;
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    });

    it("sets error when subscribe rejects", async () => {
        Object.assign(globalThis, {
            Notification: {
                permission: "denied",
                requestPermission: vi.fn().mockResolvedValue("denied"),
            },
            PushManager: function () {},
        });
        Object.assign(navigator, {
            serviceWorker: {
                ready: Promise.resolve({
                    pushManager: {
                        getSubscription: vi.fn().mockResolvedValue(null),
                        subscribe: vi.fn(),
                    },
                }),
            },
        });
        const { result } = renderHook(() =>
            usePushSubscription({
                vapidPublicKey: "k",
                onSubscribe: async () => undefined,
            }),
        );
        await act(async () => {
            try {
                await result.current.subscribe();
            } catch {
                /* expected */
            }
        });
        expect(result.current.error).toBeInstanceOf(Error);
    });

    it("sets error when unsubscribe throws", async () => {
        const subscription = {
            toJSON: () => ({}),
            unsubscribe: vi.fn().mockRejectedValue(new Error("nope")),
        };
        Object.assign(globalThis, {
            Notification: { permission: "granted" },
            PushManager: function () {},
        });
        Object.assign(navigator, {
            serviceWorker: {
                ready: Promise.resolve({
                    pushManager: {
                        getSubscription: vi.fn().mockResolvedValue(subscription),
                        subscribe: vi.fn(),
                    },
                }),
            },
        });
        const { result } = renderHook(() =>
            usePushSubscription({
                vapidPublicKey: "k",
                onSubscribe: async () => undefined,
            }),
        );
        await act(async () => {
            try {
                await result.current.unsubscribe();
            } catch {
                /* expected */
            }
        });
        expect(result.current.error).toBeInstanceOf(Error);
    });
});

/** A syntactically valid base64url VAPID key — the client decodes it before
 *  calling `pushManager.subscribe`, so a placeholder would throw first. */
const VALID_VAPID_KEY =
    "BAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8";

describe("usePushSubscription — non-Error rejections and refresh", () => {
    afterEach(() => {
        delete (globalThis as { Notification?: unknown }).Notification;
        delete (globalThis as { PushManager?: unknown }).PushManager;
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    });

    /**
     * Install a supported Push environment whose `pushManager` behaves as given.
     *
     * @param pushManager - Stubbed `getSubscription` / `subscribe` behaviour.
     */
    function installPushEnv(pushManager: Record<string, unknown>): void {
        Object.assign(globalThis, {
            Notification: {
                permission: "granted",
                requestPermission: vi.fn().mockResolvedValue("granted"),
            },
            PushManager: function () {},
        });
        Object.assign(navigator, {
            serviceWorker: { ready: Promise.resolve({ pushManager }) },
        });
    }

    it("wraps a non-Error rejection from the initial refresh", async () => {
        installPushEnv({
            getSubscription: vi.fn().mockRejectedValue("boom"),
            subscribe: vi.fn(),
        });
        const { result } = renderHook(() =>
            usePushSubscription({
                vapidPublicKey: VALID_VAPID_KEY,
                onSubscribe: async () => undefined,
            }),
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.error?.message).toBe("boom");
    });

    it("wraps a non-Error rejection from subscribe()", async () => {
        installPushEnv({
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockRejectedValue("nope"),
        });
        const { result } = renderHook(() =>
            usePushSubscription({
                vapidPublicKey: VALID_VAPID_KEY,
                onSubscribe: async () => undefined,
            }),
        );
        await act(async () => {
            try {
                await result.current.subscribe();
            } catch {
                /* expected */
            }
        });
        expect(result.current.error?.message).toBe("nope");
        expect(result.current.loading).toBe(false);
    });

    it("refresh() re-reads permission and subscription state", async () => {
        const getSubscription = vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValue({ endpoint: "https://push/1" });
        installPushEnv({ getSubscription, subscribe: vi.fn() });

        const { result } = renderHook(() =>
            usePushSubscription({
                vapidPublicKey: VALID_VAPID_KEY,
                onSubscribe: async () => undefined,
            }),
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.subscribed).toBe(false);

        await act(async () => {
            await result.current.refresh();
        });
        expect(result.current.subscribed).toBe(true);
        expect(result.current.permission).toBe("granted");
    });
});
