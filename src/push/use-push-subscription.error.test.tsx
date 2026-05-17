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
