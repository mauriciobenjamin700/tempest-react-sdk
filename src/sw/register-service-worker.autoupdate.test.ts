import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./register-service-worker";

describe("registerServiceWorker — autoUpdate", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("polls registration.update() on the configured interval", async () => {
        const update = vi.fn().mockResolvedValue(undefined);
        const registration = {
            active: {},
            installing: null,
            update,
            addEventListener: vi.fn(),
        };
        const controllerListeners: Record<string, () => void> = {};
        Object.assign(navigator, {
            serviceWorker: {
                register: vi.fn().mockResolvedValue(registration),
                controller: {},
                getRegistrations: vi.fn().mockResolvedValue([]),
                addEventListener: (name: string, listener: () => void) => {
                    controllerListeners[name] = listener;
                },
            },
        });

        await registerServiceWorker({
            url: "/sw.js",
            autoUpdate: true,
            updateIntervalMs: 1000,
            reloadOnActivate: false,
        });

        expect(update).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(update).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1000);
        expect(update).toHaveBeenCalledTimes(2);
    });

    it("reloads the page on controllerchange, once, when reloadOnActivate is on", async () => {
        const registration = {
            active: {},
            installing: null,
            update: vi.fn().mockResolvedValue(undefined),
            addEventListener: vi.fn(),
        };
        const controllerListeners: Record<string, () => void> = {};
        Object.assign(navigator, {
            serviceWorker: {
                register: vi.fn().mockResolvedValue(registration),
                controller: {},
                getRegistrations: vi.fn().mockResolvedValue([]),
                addEventListener: (name: string, listener: () => void) => {
                    controllerListeners[name] = listener;
                },
            },
        });
        const reload = vi.fn();
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, reload },
        });

        await registerServiceWorker({ url: "/sw.js", autoUpdate: true });

        controllerListeners.controllerchange?.();
        controllerListeners.controllerchange?.();
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
