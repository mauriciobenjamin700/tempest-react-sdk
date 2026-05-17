import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePushSubscription } from "./use-push-subscription";

describe("usePushSubscription unsupported env", () => {
    afterEach(() => {
        delete (globalThis as { Notification?: unknown }).Notification;
        delete (globalThis as { PushManager?: unknown }).PushManager;
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    });

    it("supported=false when environment lacks Push APIs", () => {
        const { result } = renderHook(() =>
            usePushSubscription({
                vapidPublicKey: "k",
                onSubscribe: async () => undefined,
            }),
        );
        expect(result.current.supported).toBe(false);
    });

    it("subscribe is a no-op when unsupported", async () => {
        const { result } = renderHook(() =>
            usePushSubscription({
                vapidPublicKey: "k",
                onSubscribe: async () => undefined,
            }),
        );
        await result.current.subscribe();
        expect(result.current.subscribed).toBe(false);
    });
});
