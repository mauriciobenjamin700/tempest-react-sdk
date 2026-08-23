import { afterEach, describe, expect, it, vi } from "vitest";
import {
    WebPushClient,
    WebPushPermissionDeniedError,
    WebPushUnsupportedError,
} from "./web-push-client";

describe("WebPushClient", () => {
    afterEach(() => {
        delete (globalThis as { Notification?: unknown }).Notification;
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    });

    it("isSubscribed returns false when unsupported", async () => {
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: async () => undefined,
        });
        expect(await client.isSubscribed()).toBe(false);
    });

    it("throws when requesting permission without Notification API", async () => {
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: async () => undefined,
        });
        await expect(client.requestPermission()).rejects.toBeInstanceOf(WebPushUnsupportedError);
    });

    it("throws permission-denied when user declines", async () => {
        Object.assign(globalThis, {
            Notification: {
                permission: "denied",
                requestPermission: vi.fn().mockResolvedValue("denied"),
            },
        });
        Object.assign(navigator, {
            serviceWorker: { ready: Promise.resolve({ pushManager: {} }) },
        });
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: async () => undefined,
        });
        await expect(client.subscribe()).rejects.toBeInstanceOf(WebPushPermissionDeniedError);
    });

    it("reports support from the same probe the instance uses", async () => {
        expect(WebPushClient.isSupported()).toBe(false);

        Object.assign(globalThis, {
            Notification: { permission: "granted" },
            PushManager: class {},
        });
        Object.assign(navigator, {
            serviceWorker: { ready: Promise.resolve({ pushManager: {} }) },
        });

        expect(WebPushClient.isSupported()).toBe(true);
        delete (globalThis as { PushManager?: unknown }).PushManager;
    });

    it("refuses to reach the registration where push is unsupported", async () => {
        const client = new WebPushClient({
            vapidPublicKey: "k",
            onSubscribe: async () => undefined,
        });

        await expect(client.unsubscribe()).rejects.toBeInstanceOf(WebPushUnsupportedError);
    });
});
