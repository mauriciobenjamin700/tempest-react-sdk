import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebPushClient, WebPushUnsubscribeError } from "./web-push-client";

/**
 * Install a supported Push API with one active subscription.
 *
 * @returns The spy standing in for `PushSubscription.unsubscribe`.
 */
function mockSubscribedBrowser(): ReturnType<typeof vi.fn> {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscription = {
        toJSON: () => ({ endpoint: "https://push/x", keys: { p256dh: "k", auth: "a" } }),
        unsubscribe,
    } as unknown as PushSubscription;
    const registration = {
        pushManager: {
            getSubscription: vi.fn().mockResolvedValue(subscription),
            subscribe: vi.fn().mockResolvedValue(subscription),
        },
    };
    Object.assign(globalThis, {
        Notification: { permission: "granted", requestPermission: vi.fn() },
        PushManager: function () {},
    });
    Object.assign(navigator, { serviceWorker: { ready: Promise.resolve(registration) } });
    return unsubscribe;
}

/**
 * Issue #445: the backend `DELETE` is the call most likely to fail exactly when
 * unsubscribing matters most — at the end of a session, when the token that
 * authenticates it is already gone. Before the fix, a rejected `onUnsubscribe`
 * aborted `unsubscribe()` before `PushSubscription.unsubscribe()` ran, so the
 * browser kept delivering the previous account's notifications to whoever
 * signed in next.
 */
describe("WebPushClient.unsubscribe — the browser is always released", () => {
    let browserUnsubscribe: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        browserUnsubscribe = mockSubscribedBrowser();
    });

    afterEach(() => {
        delete (globalThis as { Notification?: unknown }).Notification;
        delete (globalThis as { PushManager?: unknown }).PushManager;
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    });

    it("unsubscribes the browser even when the backend DELETE fails", async () => {
        const denied = Object.assign(new Error("Unauthorized"), { status: 401 });
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: () => undefined,
            onUnsubscribe: () => Promise.reject(denied),
        });

        const outcome = await client.unsubscribe().catch((error: unknown) => error);

        expect(browserUnsubscribe).toHaveBeenCalledOnce();
        expect(outcome).toBeInstanceOf(WebPushUnsubscribeError);
        expect(outcome).toMatchObject({
            cause: denied,
            subscription: { endpoint: "https://push/x" },
            browserUnsubscribed: true,
        });
    });

    it("calls the backend before releasing the browser", async () => {
        const order: string[] = [];
        browserUnsubscribe.mockImplementation(async () => {
            order.push("browser");
            return true;
        });
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: () => undefined,
            onUnsubscribe: () => {
                order.push("backend");
            },
        });

        await expect(client.unsubscribe()).resolves.toBe(true);
        expect(order).toEqual(["backend", "browser"]);
    });

    it("still reports the backend failure when the browser refuses to unsubscribe", async () => {
        browserUnsubscribe.mockResolvedValue(false);
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: () => undefined,
            onUnsubscribe: () => {
                throw new Error("offline");
            },
        });

        await expect(client.unsubscribe()).rejects.toMatchObject({
            name: "WebPushUnsubscribeError",
            browserUnsubscribed: false,
        });
    });
});

describe("WebPushClient.unsubscribe — both halves failing", () => {
    afterEach(() => {
        delete (globalThis as { Notification?: unknown }).Notification;
        delete (globalThis as { PushManager?: unknown }).PushManager;
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    });

    it("keeps the backend failure and the browser failure in one WebPushUnsubscribeError", async () => {
        const browserUnsubscribe = mockSubscribedBrowser();
        const browserError = new DOMException("gone", "InvalidStateError");
        browserUnsubscribe.mockRejectedValue(browserError);
        const backendError = new Error("401");
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: () => undefined,
            onUnsubscribe: () => Promise.reject(backendError),
        });

        const outcome = await client.unsubscribe().catch((error: unknown) => error);

        expect(outcome).toBeInstanceOf(WebPushUnsubscribeError);
        expect(outcome).toMatchObject({
            browserUnsubscribed: false,
            subscription: { endpoint: "https://push/x" },
        });
        expect((outcome as WebPushUnsubscribeError).cause).toBeInstanceOf(AggregateError);
        expect(((outcome as WebPushUnsubscribeError).cause as AggregateError).errors).toEqual([
            backendError,
            browserError,
        ]);
    });
});
