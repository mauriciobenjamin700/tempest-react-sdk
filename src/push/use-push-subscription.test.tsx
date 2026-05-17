import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePushSubscription } from "./use-push-subscription";

function setupSupported(existing: PushSubscription | null): {
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribeFn: ReturnType<typeof vi.fn>;
} {
    const unsubscribeFn = vi.fn().mockResolvedValue(true);
    const subscription = {
        toJSON: () => ({ endpoint: "https://x", keys: { p256dh: "k", auth: "a" } }),
        unsubscribe: unsubscribeFn,
    } as unknown as PushSubscription;
    const subscribe = vi.fn().mockResolvedValue(subscription);
    const registration = {
        pushManager: {
            getSubscription: vi.fn().mockResolvedValue(existing),
            subscribe,
        },
    };
    Object.assign(globalThis, {
        Notification: {
            permission: "granted",
            requestPermission: vi.fn().mockResolvedValue("granted"),
        },
        PushManager: function () {},
    });
    Object.assign(navigator, {
        serviceWorker: { ready: Promise.resolve(registration) },
    });
    return { subscribe, unsubscribeFn };
}

describe("usePushSubscription", () => {
    afterEach(() => {
        delete (globalThis as { Notification?: unknown }).Notification;
        delete (globalThis as { PushManager?: unknown }).PushManager;
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    });

    it("starts unsubscribed when no existing subscription", async () => {
        setupSupported(null);
        const onSubscribe = vi.fn();
        const { result } = renderHook(() =>
            usePushSubscription({ vapidPublicKey: "AAECAwQFBgcICQ", onSubscribe }),
        );
        await waitFor(() => expect(result.current.subscribed).toBe(false));
    });

    it("subscribe() flips subscribed to true", async () => {
        setupSupported(null);
        const onSubscribe = vi.fn();
        const { result } = renderHook(() =>
            usePushSubscription({ vapidPublicKey: "AAECAwQFBgcICQ", onSubscribe }),
        );
        await waitFor(() => expect(result.current.supported).toBe(true));
        await act(async () => {
            await result.current.subscribe();
        });
        expect(result.current.subscribed).toBe(true);
        expect(onSubscribe).toHaveBeenCalled();
    });

    it("unsubscribe() flips subscribed to false", async () => {
        const existing = {
            toJSON: () => ({ endpoint: "https://x" }),
            unsubscribe: vi.fn().mockResolvedValue(true),
        } as unknown as PushSubscription;
        setupSupported(existing);
        const onSubscribe = vi.fn();
        const onUnsubscribe = vi.fn();
        const { result } = renderHook(() =>
            usePushSubscription({ vapidPublicKey: "k", onSubscribe, onUnsubscribe }),
        );
        await waitFor(() => expect(result.current.subscribed).toBe(true));
        await act(async () => {
            await result.current.unsubscribe();
        });
        expect(result.current.subscribed).toBe(false);
        expect(onUnsubscribe).toHaveBeenCalled();
    });
});
