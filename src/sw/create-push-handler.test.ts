import { afterEach, describe, expect, it, vi } from "vitest";
import {
    installNotificationClickHandler,
    installPushHandler,
    installSkipWaitingListener,
} from "./create-push-handler";

const SW_KEYS = ["registration", "clients", "skipWaiting", "addEventListener"] as const;
type SwKey = (typeof SW_KEYS)[number];

const originalValues: Record<string, unknown> = {};

function stubSw(): {
    listeners: Record<string, ((event: unknown) => void) | undefined>;
    registration: { showNotification: ReturnType<typeof vi.fn> };
    clients: { matchAll: ReturnType<typeof vi.fn>; openWindow: ReturnType<typeof vi.fn> };
    skipWaiting: ReturnType<typeof vi.fn>;
} {
    const listeners: Record<string, ((event: unknown) => void) | undefined> = {};
    const sw = {
        registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
        clients: {
            matchAll: vi.fn().mockResolvedValue([]),
            openWindow: vi.fn().mockResolvedValue(undefined),
        },
        skipWaiting: vi.fn().mockResolvedValue(undefined),
        addEventListener: (name: string, listener: (event: unknown) => void) => {
            listeners[name] = listener;
        },
        listeners,
    };
    for (const key of SW_KEYS) {
        originalValues[key] = (globalThis as Record<string, unknown>)[key];
        Object.defineProperty(globalThis, key, {
            value: (sw as unknown as Record<SwKey, unknown>)[key],
            configurable: true,
            writable: true,
        });
    }
    return sw;
}

afterEach(() => {
    for (const key of SW_KEYS) {
        if (originalValues[key] === undefined) {
            delete (globalThis as Record<string, unknown>)[key];
        } else {
            Object.defineProperty(globalThis, key, {
                value: originalValues[key],
                configurable: true,
                writable: true,
            });
        }
    }
});

describe("installPushHandler", () => {
    it("renders notification with parsed JSON payload", () => {
        const sw = stubSw();
        installPushHandler({ defaultTitle: "T", defaultIcon: "/i.png" });
        const event = {
            data: { json: () => ({ title: "Hello", body: "body", url: "/x" }) },
            waitUntil: vi.fn(),
        };
        sw.listeners.push?.(event);
        expect(sw.registration.showNotification).toHaveBeenCalledWith(
            "Hello",
            expect.objectContaining({ body: "body", icon: "/i.png" }),
        );
    });

    it("suppresses notification when transform returns null", () => {
        const sw = stubSw();
        installPushHandler({ transform: () => null });
        const event = {
            data: { json: () => ({ title: "X" }) },
            waitUntil: vi.fn(),
        };
        sw.listeners.push?.(event);
        expect(sw.registration.showNotification).not.toHaveBeenCalled();
    });

    it("falls back to text() when JSON parsing fails", () => {
        const sw = stubSw();
        installPushHandler({ defaultTitle: "Default" });
        const event = {
            data: {
                json: () => {
                    throw new Error("not json");
                },
                text: () => "raw body",
            },
            waitUntil: vi.fn(),
        };
        sw.listeners.push?.(event);
        expect(sw.registration.showNotification).toHaveBeenCalledWith(
            "Default",
            expect.objectContaining({ body: "raw body" }),
        );
    });
});

describe("installNotificationClickHandler", () => {
    it("opens a new window when no matching client exists", async () => {
        const sw = stubSw();
        installNotificationClickHandler();
        const event = {
            notification: { close: vi.fn(), data: { url: "/target" } },
            waitUntil: (promise: Promise<unknown>) => promise,
        };
        sw.listeners.notificationclick?.(event);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/target");
    });
});

describe("installSkipWaitingListener", () => {
    it("calls skipWaiting on matching message", () => {
        const sw = stubSw();
        installSkipWaitingListener();
        sw.listeners.message?.({ data: { type: "SKIP_WAITING" } });
        expect(sw.skipWaiting).toHaveBeenCalled();
    });

    it("ignores other message types", () => {
        const sw = stubSw();
        installSkipWaitingListener();
        sw.listeners.message?.({ data: { type: "OTHER" } });
        expect(sw.skipWaiting).not.toHaveBeenCalled();
    });
});
