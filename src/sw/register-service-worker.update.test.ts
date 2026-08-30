import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./register-service-worker";

describe("registerServiceWorker — onUpdate", () => {
    it("fires onUpdate when a new worker installs while controller is active", async () => {
        const onUpdate = vi.fn();
        const onError = vi.fn();

        const installing = {
            state: "installing" as const,
            addEventListener: vi.fn(),
        };
        const listeners: Record<string, () => void> = {};
        const registration = {
            active: {},
            installing,
            addEventListener: (name: string, listener: () => void) => {
                listeners[name] = listener;
            },
        };
        Object.assign(navigator, {
            serviceWorker: {
                register: vi.fn().mockResolvedValue(registration),
                controller: {},
                getRegistrations: vi.fn().mockResolvedValue([]),
            },
        });

        await registerServiceWorker({ url: "/sw.js", onUpdate, onError });

        // simulate "updatefound" → state change to "installed"
        listeners.updatefound?.();
        const stateChangeListener = installing.addEventListener.mock.calls.find(
            (call) => call[0] === "statechange",
        )?.[1] as (() => void) | undefined;
        installing.state = "installed" as never;
        stateChangeListener?.();
        expect(onUpdate).toHaveBeenCalled();
    });

    it("invokes onError when register rejects", async () => {
        const onError = vi.fn();
        Object.assign(navigator, {
            serviceWorker: {
                register: vi.fn().mockRejectedValue(new Error("oh no")),
                getRegistrations: vi.fn().mockResolvedValue([]),
            },
        });
        const result = await registerServiceWorker({ url: "/sw.js", onError });
        expect(result).toBeNull();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
});

describe("registerServiceWorker — a worker already waiting at registration", () => {
    /**
     * The state a user finds on the visit after a deploy: the worker installed
     * during the previous visit, went to `waiting`, and the tab was closed. No
     * `updatefound` fires on this visit — `install` already happened — so a
     * registration that only listens for the event never tells the app.
     */
    function registrationWith(waiting: unknown, controller: unknown) {
        const listeners: Record<string, () => void> = {};
        const registration = {
            active: {},
            installing: null,
            waiting,
            addEventListener: (name: string, listener: () => void) => {
                listeners[name] = listener;
            },
        };
        Object.assign(navigator, {
            serviceWorker: {
                register: vi.fn().mockResolvedValue(registration),
                controller,
                getRegistrations: vi.fn().mockResolvedValue([]),
            },
        });
        return { registration, listeners };
    }

    it("fires onUpdate for the waiting worker, with no updatefound involved", async () => {
        const onUpdate = vi.fn();
        const waiting = { postMessage: vi.fn() };
        const { registration } = registrationWith(waiting, {});

        await registerServiceWorker({ url: "/sw.js", onUpdate });

        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith(waiting, registration);
    });

    it("stays quiet on a first install, where there is no controller yet", async () => {
        const onUpdate = vi.fn();
        registrationWith({ postMessage: vi.fn() }, undefined);

        await registerServiceWorker({ url: "/sw.js", onUpdate });

        expect(onUpdate).not.toHaveBeenCalled();
    });

    it("announces a worker once when updatefound also fires for it", async () => {
        const onUpdate = vi.fn();
        const waiting = {
            state: "installed" as const,
            postMessage: vi.fn(),
            addEventListener: vi.fn(),
        };
        const { registration, listeners } = registrationWith(waiting, {});

        await registerServiceWorker({ url: "/sw.js", onUpdate });
        Object.assign(registration, { installing: waiting });
        listeners.updatefound?.();
        const stateChange = waiting.addEventListener.mock.calls.find(
            (call) => call[0] === "statechange",
        )?.[1] as (() => void) | undefined;
        stateChange?.();

        expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    it("announces the next deploy of the same session, which is a different worker", async () => {
        const onUpdate = vi.fn();
        const first = { postMessage: vi.fn() };
        const { registration, listeners } = registrationWith(first, {});

        await registerServiceWorker({ url: "/sw.js", onUpdate });

        const second = {
            state: "installing" as const,
            postMessage: vi.fn(),
            addEventListener: vi.fn(),
        };
        Object.assign(registration, { installing: second });
        listeners.updatefound?.();
        const stateChange = second.addEventListener.mock.calls.find(
            (call) => call[0] === "statechange",
        )?.[1] as (() => void) | undefined;
        second.state = "installed" as never;
        stateChange?.();

        expect(onUpdate).toHaveBeenCalledTimes(2);
        expect(onUpdate).toHaveBeenLastCalledWith(second, registration);
    });
});
