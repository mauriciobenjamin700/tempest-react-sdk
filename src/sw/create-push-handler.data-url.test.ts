import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDevBuild } from "../utils/dev-mode";
import { installNotificationClickHandler, installPushHandler } from "./create-push-handler";

const SW_KEYS = ["registration", "clients", "addEventListener"] as const;

const originalValues: Record<string, PropertyDescriptor | undefined> = {};

interface StubSw {
    listeners: Record<string, ((event: unknown) => void) | undefined>;
    registration: { showNotification: ReturnType<typeof vi.fn> };
    clients: { matchAll: ReturnType<typeof vi.fn>; openWindow: ReturnType<typeof vi.fn> };
}

/**
 * Install a minimal service-worker scope on `globalThis` for the handlers to bind to.
 *
 * @returns The stubbed scope, with the listeners the handlers registered.
 */
function stubSw(): StubSw {
    const listeners: Record<string, ((event: unknown) => void) | undefined> = {};
    const sw: StubSw & { addEventListener: (name: string, l: (e: unknown) => void) => void } = {
        listeners,
        registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
        clients: {
            matchAll: vi.fn().mockResolvedValue([]),
            openWindow: vi.fn().mockResolvedValue(undefined),
        },
        addEventListener: (name: string, listener: (event: unknown) => void) => {
            listeners[name] = listener;
        },
    };
    for (const key of SW_KEYS) {
        originalValues[key] = Object.getOwnPropertyDescriptor(globalThis, key);
        Object.defineProperty(globalThis, key, {
            value: sw[key],
            configurable: true,
            writable: true,
        });
    }
    return sw;
}

/**
 * Deliver one push with `payload` as its JSON body.
 *
 * @param sw - The stubbed scope.
 * @param payload - What `event.data.json()` returns.
 */
function push(sw: StubSw, payload: unknown): void {
    sw.listeners.push?.({ data: { json: () => payload, text: () => "" }, waitUntil: vi.fn() });
}

/**
 * Click the body of the last notification shown, the way the browser would.
 *
 * @param sw - The stubbed scope.
 * @returns The promise the click handler handed to `waitUntil`.
 */
async function clickLastNotification(sw: StubSw): Promise<void> {
    const calls = sw.registration.showNotification.mock.calls;
    const [, options] = calls[calls.length - 1] as [string, { data: unknown }];
    let pending: Promise<unknown> | undefined;
    sw.listeners.notificationclick?.({
        notification: { close: vi.fn(), data: options.data },
        action: "",
        waitUntil: (promise: Promise<unknown>) => (pending = promise),
    });
    await pending;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
    warn.mockRestore();
    setDevBuild(undefined);
    for (const key of SW_KEYS) {
        const descriptor = originalValues[key];
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as Record<string, unknown>)[key];
    }
});

describe("payload with the destination only in data.url (#613)", () => {
    it("still opens / on click: data.url is never read as the destination", async () => {
        const sw = stubSw();
        installPushHandler();
        installNotificationClickHandler();
        push(sw, { title: "Broadcast", data: { url: "/broadcasts/42" } });
        await clickLastNotification(sw);
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/");
    });

    it("warns that the destination moved to the top-level url", () => {
        const sw = stubSw();
        installPushHandler();
        push(sw, { title: "Broadcast", data: { url: "/broadcasts/42" } });
        expect(warn).toHaveBeenCalledTimes(1);
        const [message] = warn.mock.calls[0] as [string];
        expect(message).toContain("[tempest-react-sdk/sw]");
        expect(message).toContain("data.url");
        expect(message).toContain("top-level url");
        expect(message).toContain('opens "/"');
    });

    it("does not echo the payload's url into the console", () => {
        const sw = stubSw();
        installPushHandler();
        push(sw, { data: { url: "/broadcasts/42?token=secret" } });
        const [message] = warn.mock.calls[0] as [string];
        expect(message).not.toContain("secret");
        expect(message).not.toContain("/broadcasts/42");
    });

    it("warns once per installed handler, not once per push", () => {
        const sw = stubSw();
        installPushHandler();
        push(sw, { data: { url: "/a" } });
        push(sw, { data: { url: "/b" } });
        push(sw, { data: { url: "/c" } });
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("warns in a production build too, where the broken deep link actually ships", () => {
        setDevBuild(false);
        const sw = stubSw();
        installPushHandler();
        push(sw, { data: { url: "/a" } });
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["a top-level url", { url: "/orders/9", data: { url: "/elsewhere" } }],
        ["no data", { title: "Hi" }],
        ["data without url", { data: { orderId: 9 } }],
        ["a non-string data.url", { data: { url: 42 } }],
    ])("stays quiet for a payload with %s", (_label, payload) => {
        const sw = stubSw();
        installPushHandler();
        push(sw, payload);
        expect(warn).not.toHaveBeenCalled();
    });

    it("judges the payload after transform, so a transform that sets url silences it", () => {
        const sw = stubSw();
        installPushHandler({ transform: (payload) => ({ ...payload, url: "/inbox" }) });
        push(sw, { data: { url: "/broadcasts/42" } });
        expect(warn).not.toHaveBeenCalled();
    });

    it("opens the top-level url once the payload is migrated", async () => {
        const sw = stubSw();
        installPushHandler();
        installNotificationClickHandler();
        push(sw, { title: "Broadcast", url: "/broadcasts/42", data: { broadcastId: 42 } });
        await clickLastNotification(sw);
        expect(sw.clients.openWindow).toHaveBeenCalledWith("/broadcasts/42");
        expect(warn).not.toHaveBeenCalled();
    });
});
