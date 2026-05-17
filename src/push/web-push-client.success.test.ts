import { afterEach, describe, expect, it, vi } from "vitest";
import { WebPushClient } from "./web-push-client";

function mockEnv(opts: {
    permission?: NotificationPermission;
    existing?: PushSubscription | null;
    subscribeResult?: PushSubscription;
    unsubscribeResult?: boolean;
}): { unsubscribe: ReturnType<typeof vi.fn> } {
    const unsubscribe = vi.fn().mockResolvedValue(opts.unsubscribeResult ?? true);
    const subscription =
        opts.subscribeResult ??
        ({
            toJSON: () => ({ endpoint: "https://push/x", keys: { p256dh: "k", auth: "a" } }),
            unsubscribe,
        } as unknown as PushSubscription);
    const existing = opts.existing === null ? null : (opts.existing ?? subscription);
    const registration = {
        pushManager: {
            getSubscription: vi.fn().mockResolvedValue(existing),
            subscribe: vi.fn().mockResolvedValue(subscription),
        },
    };
    Object.assign(globalThis, {
        Notification: {
            permission: opts.permission ?? "granted",
            requestPermission: vi.fn().mockResolvedValue(opts.permission ?? "granted"),
        },
    });
    Object.assign(navigator, {
        serviceWorker: { ready: Promise.resolve(registration) },
    });
    Object.assign(globalThis, { PushManager: function () {} });
    return { unsubscribe };
}

describe("WebPushClient happy paths", () => {
    afterEach(() => {
        delete (globalThis as { Notification?: unknown }).Notification;
        delete (globalThis as { PushManager?: unknown }).PushManager;
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    });

    it("subscribe forwards JSON to onSubscribe", async () => {
        mockEnv({ existing: null });
        const onSubscribe = vi.fn();
        const client = new WebPushClient({ vapidPublicKey: "AAECAwQFBgcICQ", onSubscribe });
        await client.subscribe();
        expect(onSubscribe).toHaveBeenCalledWith(
            expect.objectContaining({ endpoint: "https://push/x" }),
        );
    });

    it("subscribe reuses existing subscription", async () => {
        mockEnv({});
        const onSubscribe = vi.fn();
        const client = new WebPushClient({ vapidPublicKey: "k", onSubscribe });
        await client.subscribe();
        expect(onSubscribe).toHaveBeenCalled();
    });

    it("unsubscribe calls onUnsubscribe then subscription.unsubscribe", async () => {
        const { unsubscribe } = mockEnv({});
        const onUnsubscribe = vi.fn();
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: async () => undefined,
            onUnsubscribe,
        });
        await client.unsubscribe();
        expect(onUnsubscribe).toHaveBeenCalled();
        expect(unsubscribe).toHaveBeenCalled();
    });

    it("unsubscribe returns false when nothing is subscribed", async () => {
        mockEnv({ existing: null });
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: async () => undefined,
        });
        const result = await client.unsubscribe();
        expect(result).toBe(false);
    });

    it("isSubscribed returns true when active", async () => {
        mockEnv({});
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: async () => undefined,
        });
        expect(await client.isSubscribed()).toBe(true);
    });

    it("permission returns 'unsupported' when Notification is absent", () => {
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: async () => undefined,
        });
        expect(client.permission()).toBe("unsupported");
    });
});
