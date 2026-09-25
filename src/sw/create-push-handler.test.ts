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

describe("push handlers — payload and url resolution edges", () => {
    it("ignores a push event with no data", () => {
        const sw = stubSw();
        installPushHandler();
        sw.listeners.push?.({ waitUntil: vi.fn() });
        expect(sw.registration.showNotification).not.toHaveBeenCalled();
    });

    it("falls back to the default title and merges extra data", () => {
        const sw = stubSw();
        installPushHandler({ defaultTitle: "Padrão", defaultBadge: "/b.png" });
        sw.listeners.push?.({
            data: { json: () => ({ body: "sem título", data: { orderId: 9 } }) },
            waitUntil: vi.fn(),
        });
        expect(sw.registration.showNotification).toHaveBeenCalledWith(
            "Padrão",
            expect.objectContaining({
                badge: "/b.png",
                data: { url: "/", orderId: 9 },
            }),
        );
    });

    it("keeps a payload-level icon, badge, image, tag and url", () => {
        const sw = stubSw();
        installPushHandler({ defaultIcon: "/default.png" });
        sw.listeners.push?.({
            data: {
                json: () => ({
                    title: "T",
                    icon: "/own.png",
                    badge: "/own-badge.png",
                    image: "/hero.png",
                    tag: "orders",
                    url: "/orders/9",
                }),
            },
            waitUntil: vi.fn(),
        });
        expect(sw.registration.showNotification).toHaveBeenCalledWith(
            "T",
            expect.objectContaining({
                icon: "/own.png",
                badge: "/own-badge.png",
                image: "/hero.png",
                tag: "orders",
                data: { url: "/orders/9" },
            }),
        );
    });

    it("lets transform rewrite the payload", () => {
        const sw = stubSw();
        installPushHandler({ transform: (payload) => ({ ...payload, title: "reescrito" }) });
        sw.listeners.push?.({
            data: { json: () => ({ title: "original" }) },
            waitUntil: vi.fn(),
        });
        expect(sw.registration.showNotification).toHaveBeenCalledWith(
            "reescrito",
            expect.anything(),
        );
    });

    it("focuses an already-open client whose url matches", async () => {
        const sw = stubSw();
        const focus = vi.fn().mockResolvedValue(undefined);
        sw.clients.matchAll.mockResolvedValue([
            { url: "https://app.test/other", focus: vi.fn() },
            { url: "https://app.test/orders/9", focus },
        ]);
        installNotificationClickHandler();

        let pending: Promise<unknown> | undefined;
        sw.listeners.notificationclick?.({
            notification: { close: vi.fn(), data: { url: "/orders/9" } },
            waitUntil: (promise: Promise<unknown>) => (pending = promise),
        });
        await pending;
        expect(focus).toHaveBeenCalled();
        expect(sw.clients.openWindow).not.toHaveBeenCalled();
    });

    it("accepts a plain string as the notification data", async () => {
        const sw = stubSw();
        installNotificationClickHandler();
        let pending: Promise<unknown> | undefined;
        sw.listeners.notificationclick?.({
            notification: { close: vi.fn(), data: "/from-string" },
            waitUntil: (promise: Promise<unknown>) => (pending = promise),
        });
        await pending;
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/from-string");
    });

    it("falls back to / for data without a usable url", async () => {
        const sw = stubSw();
        installNotificationClickHandler();

        for (const data of [undefined, {}, { url: 42 }]) {
            sw.clients.openWindow.mockClear();
            let pending: Promise<unknown> | undefined;
            sw.listeners.notificationclick?.({
                notification: { close: vi.fn(), data },
                waitUntil: (promise: Promise<unknown>) => (pending = promise),
            });
            await pending;
            expect(sw.clients.openWindow).toHaveBeenCalledWith("/");
        }
    });

    it("uses a custom resolveUrl", async () => {
        const sw = stubSw();
        installNotificationClickHandler({
            resolveUrl: (data) => `/deep/${(data as { id: number }).id}`,
        });
        let pending: Promise<unknown> | undefined;
        sw.listeners.notificationclick?.({
            notification: { close: vi.fn(), data: { id: 3 } },
            waitUntil: (promise: Promise<unknown>) => (pending = promise),
        });
        await pending;
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/deep/3");
    });
});

describe("notification actions (#390)", () => {
    const ALO_PAYLOAD = {
        title: "Seu evento é amanhã",
        url: "/events/details/7",
        actions: [
            { action: "alo", title: "Mandar um alô", url: "/events/details/7#alo" },
            { action: "later", title: "Depois" },
        ],
        requireInteraction: false,
        vibrate: [100, 50, 100],
        silent: false,
        renotify: true,
        timestamp: 1_700_000_000_000,
        dir: "ltr",
        lang: "pt-BR",
    };

    function clickWith(
        sw: ReturnType<typeof stubSw>,
        data: unknown,
        action?: string,
    ): Promise<unknown> | undefined {
        let pending: Promise<unknown> | undefined;
        sw.listeners.notificationclick?.({
            notification: { close: vi.fn(), data },
            action,
            waitUntil: (promise: Promise<unknown>) => (pending = promise),
        });
        return pending;
    }

    it("forwards actions and every NotificationOptions member the payload carries", () => {
        const sw = stubSw();
        installPushHandler();
        sw.listeners.push?.({ data: { json: () => ALO_PAYLOAD }, waitUntil: vi.fn() });
        const [, options] = sw.registration.showNotification.mock.calls[0] as [string, object];
        expect(options).toMatchObject({
            actions: [
                { action: "alo", title: "Mandar um alô" },
                { action: "later", title: "Depois" },
            ],
            requireInteraction: false,
            vibrate: [100, 50, 100],
            silent: false,
            renotify: true,
            timestamp: 1_700_000_000_000,
            dir: "ltr",
            lang: "pt-BR",
        });
    });

    it("moves per-action urls into data.actionUrls and strips them from the actions", () => {
        const sw = stubSw();
        installPushHandler();
        sw.listeners.push?.({ data: { json: () => ALO_PAYLOAD }, waitUntil: vi.fn() });
        const [, options] = sw.registration.showNotification.mock.calls[0] as [
            string,
            { actions: object[]; data: unknown },
        ];
        for (const action of options.actions) expect(action).not.toHaveProperty("url");
        expect(options.data).toEqual({
            url: "/events/details/7",
            actionUrls: { alo: "/events/details/7#alo" },
        });
    });

    it("leaves options the payload omits absent instead of undefined", () => {
        const sw = stubSw();
        installPushHandler();
        sw.listeners.push?.({ data: { json: () => ({ title: "T" }) }, waitUntil: vi.fn() });
        const [, options] = sw.registration.showNotification.mock.calls[0] as [string, object];
        expect(Object.keys(options).sort()).toEqual(["badge", "data", "icon"]);
        expect(options).toEqual(expect.objectContaining({ data: { url: "/" } }));
    });

    it("omits actionUrls when no action carries a url", () => {
        const sw = stubSw();
        installPushHandler();
        sw.listeners.push?.({
            data: { json: () => ({ actions: [{ action: "a", title: "A" }] }) },
            waitUntil: vi.fn(),
        });
        const [, options] = sw.registration.showNotification.mock.calls[0] as [
            string,
            { data: object },
        ];
        expect(options.data).toEqual({ url: "/" });
    });

    it("opens the action url when that action is clicked", async () => {
        const sw = stubSw();
        installNotificationClickHandler();
        await clickWith(sw, { url: "/body", actionUrls: { alo: "/alo" } }, "alo");
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/alo");
    });

    it("opens the top-level url on a body click", async () => {
        const sw = stubSw();
        installNotificationClickHandler();
        await clickWith(sw, { url: "/body", actionUrls: { alo: "/alo" } }, "");
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/body");
    });

    it("falls back to the top-level url for an action without one", async () => {
        const sw = stubSw();
        installNotificationClickHandler();
        await clickWith(sw, { url: "/body", actionUrls: { alo: "/alo" } }, "later");
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/body");
    });

    it("passes the clicked action to a custom resolveUrl", async () => {
        const sw = stubSw();
        const resolveUrl = vi.fn().mockReturnValue("/custom");
        installNotificationClickHandler({ resolveUrl });
        await clickWith(sw, { id: 1 }, "alo");
        expect(resolveUrl).toHaveBeenCalledWith({ id: 1 }, "alo");
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/custom");
    });

    it("round-trips: the push handler's data drives the click handler", async () => {
        const sw = stubSw();
        installPushHandler();
        installNotificationClickHandler();
        sw.listeners.push?.({ data: { json: () => ALO_PAYLOAD }, waitUntil: vi.fn() });
        const [, options] = sw.registration.showNotification.mock.calls[0] as [
            string,
            { data: unknown },
        ];
        await clickWith(sw, options.data, "alo");
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/events/details/7#alo");
    });
});

describe("notificationclick client matching", () => {
    function clickTo(sw: ReturnType<typeof stubSw>, url: string): Promise<unknown> | undefined {
        let pending: Promise<unknown> | undefined;
        sw.listeners.notificationclick?.({
            notification: { close: vi.fn(), data: { url } },
            waitUntil: (promise: Promise<unknown>) => (pending = promise),
        });
        return pending;
    }

    it("does not focus a client whose url merely contains the target", async () => {
        const sw = stubSw();
        const focus = vi.fn();
        sw.clients.matchAll.mockResolvedValue([{ url: "https://app.test/events/10", focus }]);
        installNotificationClickHandler();
        await clickTo(sw, "/events/1");
        expect(focus).not.toHaveBeenCalled();
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/events/1");
    });

    it("does not treat / as matching every open client", async () => {
        const sw = stubSw();
        const focus = vi.fn();
        sw.clients.matchAll.mockResolvedValue([{ url: "https://app.test/settings", focus }]);
        installNotificationClickHandler();
        await clickTo(sw, "/");
        expect(focus).not.toHaveBeenCalled();
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/");
    });

    it("focuses a client on an absolute target url", async () => {
        const sw = stubSw();
        const focus = vi.fn().mockResolvedValue(undefined);
        sw.clients.matchAll.mockResolvedValue([{ url: "https://app.test/a#alo", focus }]);
        installNotificationClickHandler();
        await clickTo(sw, "https://app.test/a#alo");
        expect(focus).toHaveBeenCalled();
    });

    it("skips a client whose url cannot be parsed", async () => {
        const sw = stubSw();
        const focus = vi.fn();
        sw.clients.matchAll.mockResolvedValue([{ url: "not a url", focus }]);
        installNotificationClickHandler();
        await clickTo(sw, "/x");
        expect(focus).not.toHaveBeenCalled();
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/x");
    });
});
